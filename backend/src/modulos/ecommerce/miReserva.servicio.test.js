// Mi reserva (HU-104): consulta y cancelación online, con dobles de la base,
// de calcularPenalidad, de cancelarReserva y del email. La regla de negocio
// está en miReserva.test.js; acá: mismo 404 en todos los casos, piso de
// tiempo, idempotencia, 409 y que solo se cancela sin cargo.
jest.mock("../../lib/prisma", () => ({ reserva: { findUnique: jest.fn() } }));
jest.mock("../tarifas/penalidades.servicio", () => ({ calcularPenalidad: jest.fn() }));
jest.mock("../reservas/reservas.servicio", () => ({ cancelarReserva: jest.fn() }));
jest.mock("./emailWeb.servicio", () => ({ enviarCancelacion: jest.fn() }));

const prisma = require("../../lib/prisma");
const { calcularPenalidad } = require("../tarifas/penalidades.servicio");
const { cancelarReserva } = require("../reservas/reservas.servicio");
const emailWeb = require("./emailWeb.servicio");
const { postMiReserva, postCancelarMiReserva } = require("./ecommerce.controlador");
const { MOTIVO } = require("./miReserva");
const { PISO_RESPUESTA_MS } = require("./miReserva.servicio");

const MENSAJE_404 = "No encontramos una reserva con esos datos. Revisá el código y el email, o contactá a recepción.";

// Llegada dentro de 30 días: siempre antes de las 14 h del día de llegada.
function enDias(dias) {
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + dias));
}

function reservaWeb(cambios = {}) {
  return {
    id: 375,
    codigoConfirmacion: "3FA9C21B",
    estado: "Confirmada",
    fechaDesde: enDias(30),
    fechaHasta: enDias(32),
    huesped: { nombres: "Juan", apellido: "Pérez", numeroDocumento: "30111222", contacto: "juan@correo.com" },
    planTarifario: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
    reservaHabitaciones: [{ id: 8, adultos: 2, menores: 0, habitacion: { tipoHabitacion: { nombre: "Doble" } }, reservaNoches: [{ precioNoche: "25000" }, { precioNoche: "25000" }] }],
    pagosEstadia: [],
    datosWeb: { emailContacto: "juan@correo.com", tarjetaMarca: "VISA", tarjetaUltimos4: "4242" },
    ...cambios,
  };
}
const SIN_CARGO = { aplica: false, monto: 0, limiteSinCargo: enDias(28), mensaje: "Cancelación sin cargo." };
const CON_CARGO = { aplica: true, monto: 25000, limiteSinCargo: enDias(28), mensaje: "Ya pasó el plazo: se cobra la primera noche." };

async function llamar(handler, body) {
  const res = { statusCode: 200 };
  res.status = jest.fn((codigo) => {
    res.statusCode = codigo;
    return res;
  });
  res.json = jest.fn((cuerpo) => {
    res.body = cuerpo;
    return res;
  });
  const inicio = Date.now();
  await handler({ body }, res);
  return { status: res.statusCode, body: res.body, ms: Date.now() - inicio };
}

beforeEach(() => {
  prisma.reserva.findUnique.mockReset();
  calcularPenalidad.mockReset();
  cancelarReserva.mockReset();
  emailWeb.enviarCancelacion.mockReset();
  emailWeb.enviarCancelacion.mockResolvedValue({ enviado: true });
});

describe("POST /api/web/mi-reserva", () => {
  test("encontrada: normaliza código y email, responde la forma pública y espera el piso", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const { status, body, ms } = await llamar(postMiReserva, { codigo: " 3fa9-c21b ", email: " Juan@Correo.com " });
    expect(status).toBe(200);
    expect(prisma.reserva.findUnique.mock.calls[0][0].where).toEqual({ codigoConfirmacion: "3FA9C21B" });
    expect(calcularPenalidad).toHaveBeenCalledWith(expect.objectContaining({ reservaId: 375, tipo: "CANCELACION" }));
    expect(body).toMatchObject({ codigoConfirmacion: "3FA9C21B", titular: "Juan P.", documento: "****222", total: 50000, cobrado: 0 });
    expect(body.cancelacion).toMatchObject({ puedeCancelarOnline: true, motivo: null });
    expect(ms).toBeGreaterThanOrEqual(PISO_RESPUESTA_MS - 5);
  });

  test.each([
    ["código inexistente", null, { codigo: "00000000", email: "juan@correo.com" }],
    ["email que no coincide", reservaWeb(), { codigo: "3FA9C21B", email: "otro@correo.com" }],
    ["formato de código inválido", reservaWeb(), { codigo: "ZZZZZZZZ", email: "juan@correo.com" }],
    ["formato de email inválido", reservaWeb(), { codigo: "3FA9C21B", email: "juan@" }],
    ["mostrador con teléfono", reservaWeb({ datosWeb: null, huesped: { nombre: "Luis R", contacto: "+54 9 387 555-0101" } }), { codigo: "3FA9C21B", email: "juan@correo.com" }],
    ["cuerpo vacío", reservaWeb(), undefined],
  ])("%s → mismo 404, buscando igual en la base y con el mismo piso", async (_caso, fila, body) => {
    prisma.reserva.findUnique.mockResolvedValue(fila);
    const r = await llamar(postMiReserva, body);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: MENSAJE_404, codigo: "NO_ENCONTRADA" });
    expect(prisma.reserva.findUnique).toHaveBeenCalledTimes(1);
    expect(r.ms).toBeGreaterThanOrEqual(PISO_RESPUESTA_MS - 5);
  });

  test("mostrador con email en la ficha: se encuentra con ese email", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ datosWeb: null, huesped: { nombre: "Ana Maria Lopez", contacto: "Ana@Correo.com" } }));
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const r = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "ana@correo.com" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ titular: "Ana L.", garantia: null });
  });

  test("Prepago (no reembolsable) no cuenta como pago: el motivo es el de la tarifa; una seña sí bloquea", async () => {
    const nrf = { ...reservaWeb().planTarifario, reembolsable: false };
    prisma.reserva.findUnique.mockResolvedValue(
      reservaWeb({ planTarifario: nrf, pagosEstadia: [{ anulado: false, concepto: "Prepago", medios: [{ importe: "50000" }] }] })
    );
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    expect((await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" })).body.cancelacion.motivo).toBe(MOTIVO.NO_REEMBOLSABLE);

    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ pagosEstadia: [{ anulado: false, concepto: "Seña", medios: [{ importe: "10000" }] }] }));
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const conSena = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" });
    expect(conSena.body.cancelacion.motivo).toBe(MOTIVO.CON_PAGO);
    expect(conSena.body.cobrado).toBe(10000);
  });

  test("cancelada: no calcula penalidad y dice que ya fue cancelada", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ estado: "Cancelada" }));
    const r = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" });
    expect(calcularPenalidad).not.toHaveBeenCalled();
    expect(r.body.cancelacion).toEqual({ puedeCancelarOnline: false, motivo: MOTIVO.CANCELADA, penalidad: null });
  });
});

describe("POST /api/web/mi-reserva/cancelar", () => {
  const CUERPO = { codigo: "3FA9C21B", email: "juan@correo.com", montoPenalidadAceptado: 0 };

  test("sin cargo: cancelarReserva con el motivo web, email de cancelación al email de la reserva", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const r = await llamar(postCancelarMiReserva, CUERPO);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ estado: "Cancelada", penalidadCobrada: 0, email: { enviado: true } });
    expect(cancelarReserva).toHaveBeenCalledWith(375, { motivoCancelacion: "Cancelada por el huésped desde la web" });
    const [datos, para] = emailWeb.enviarCancelacion.mock.calls[0];
    expect(para).toBe("juan@correo.com");
    expect(datos).toMatchObject({ codigoConfirmacion: "3FA9C21B", estado: "Cancelada", habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }] });
  });

  test("ya cancelada → 200 idempotente, sin cancelar de nuevo ni otro email", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ estado: "Cancelada" }));
    const r = await llamar(postCancelarMiReserva, CUERPO);
    expect(r).toMatchObject({ status: 200, body: { estado: "Cancelada", penalidadCobrada: 0 } });
    expect(r.body).not.toHaveProperty("email");
    expect(cancelarReserva).not.toHaveBeenCalled();
    expect(emailWeb.enviarCancelacion).not.toHaveBeenCalled();
  });

  test.each([
    ["con cargo", reservaWeb(), CON_CARGO, 25000, /cargo de \$\s?25\.000/],
    ["no reembolsable", reservaWeb({ planTarifario: { ...reservaWeb().planTarifario, reembolsable: false } }), CON_CARGO, 25000, /no admite reintegro/],
    ["con seña", reservaWeb({ pagosEstadia: [{ anulado: false, concepto: "Seña", medios: [{ importe: "1" }] }] }), SIN_CARGO, 0, /pago registrado/],
  ])("%s → 409 PENALIDAD_CAMBIO con montoNuevo y motivo; no cancela", async (_caso, fila, penalidad, montoNuevo, motivo) => {
    prisma.reserva.findUnique.mockResolvedValue(fila);
    calcularPenalidad.mockResolvedValue(penalidad);
    const r = await llamar(postCancelarMiReserva, CUERPO);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: "PENALIDAD_CAMBIO", montoNuevo });
    expect(r.body.motivo).toMatch(motivo);
    expect(r.body.error).toBe(r.body.motivo);
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test.each([25000, null, "", undefined, "abc"])("montoPenalidadAceptado %p (≠ 0) → 409; no cancela", async (monto) => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const r = await llamar(postCancelarMiReserva, { ...CUERPO, montoPenalidadAceptado: monto });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: "PENALIDAD_CAMBIO", montoNuevo: 0 });
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test("datos que no coinciden → el mismo 404 que la consulta", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    const r = await llamar(postCancelarMiReserva, { ...CUERPO, email: "otro@correo.com" });
    expect(r).toMatchObject({ status: 404, body: { error: MENSAJE_404, codigo: "NO_ENCONTRADA" } });
  });

  test("carrera: cancelarReserva falla porque otra cancelación ganó → 200 idempotente sin email", async () => {
    prisma.reserva.findUnique.mockResolvedValueOnce(reservaWeb()).mockResolvedValueOnce({ estado: "Cancelada" });
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    cancelarReserva.mockRejectedValue(Object.assign(new Error("Solo se pueden cancelar reservas confirmadas."), { status: 400 }));
    const r = await llamar(postCancelarMiReserva, CUERPO);
    expect(r).toMatchObject({ status: 200, body: { estado: "Cancelada", penalidadCobrada: 0 } });
    expect(emailWeb.enviarCancelacion).not.toHaveBeenCalled();
  });
});
