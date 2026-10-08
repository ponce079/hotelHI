// Mi reserva (HU-104): consulta y cancelación online, con dobles de la base,
// de calcularPenalidad, de cancelarReserva y del email. La regla de negocio
// está en miReserva.test.js; acá: mismo 404 en todos los casos, piso de
// tiempo, idempotencia, 409/422 y la cancelación con cargo (cobrado, pendiente, retenido, derivaciones).
jest.mock("../../lib/prisma", () => ({ reserva: { findUnique: jest.fn() } }));
jest.mock("../tarifas/penalidades.servicio", () => ({ calcularPenalidad: jest.fn() }));
jest.mock("../reservas/reservas.servicio", () => ({ cancelarReserva: jest.fn(), previsualizarCierreReserva: jest.fn() }));
jest.mock("./emailWeb.servicio", () => ({ enviarCancelacion: jest.fn() }));

const prisma = require("../../lib/prisma");
const { calcularPenalidad } = require("../tarifas/penalidades.servicio");
const { cancelarReserva, previsualizarCierreReserva } = require("../reservas/reservas.servicio");
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
    garantiaReserva: { tipo: "TARJETA", marca: "VISA", ultimos4: "4242" },
    ...cambios,
  };
}
const SIN_CARGO = { aplica: false, monto: 0, limiteSinCargo: enDias(28), mensaje: "Cancelación sin cargo." };
const CON_CARGO = { aplica: true, monto: 25000, limiteSinCargo: enDias(28), mensaje: "Ya pasó el plazo: se cobra la primera noche." };
const TARJETA = { marca: "VISA", ultimos4: "4242" };
// Lo que devuelve previsualizarCierre (Ricardo) para una BAR dentro de las 48 h con tarjeta en garantía.
const LIQ_COBRO = { tipo: "CANCELACION", regla: "PRIMERA_NOCHE", monto: 25000, retenido: 0, devuelto: 0, aCobrarATarjeta: 25000, sinCobrar: 0, tarjeta: TARJETA, estadoCobro: "COBRADO" };
// NRF ya pagada: la penalidad (el total) queda cubierta con el pago anticipado.
const LIQ_RETENIDO = { tipo: "CANCELACION", regla: "TOTAL_NO_REEMBOLSABLE", monto: 50000, retenido: 50000, devuelto: 0, aCobrarATarjeta: 0, sinCobrar: 0, tarjeta: TARJETA, estadoCobro: "RETENIDO" };
const NRF = () =>
  reservaWeb({
    planTarifario: { ...reservaWeb().planTarifario, codigo: "NRF", reembolsable: false },
    pagosEstadia: [{ anulado: false, concepto: "Pago anticipado", medios: [{ importe: "50000" }] }],
  });

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
  previsualizarCierreReserva.mockReset();
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
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ datosWeb: null, garantiaReserva: null, huesped: { nombre: "Ana Maria Lopez", contacto: "Ana@Correo.com" } }));
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const r = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "ana@correo.com" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ titular: "Ana L.", garantia: null });
  });

  test("con cargo: la consulta trae el cargo (texto con la tarjeta), con la liquidación de previsualizarCierre", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue(LIQ_COBRO);
    const r = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" });
    expect(previsualizarCierreReserva).toHaveBeenCalledWith(375, "CANCELACION");
    expect(r.body.cancelacion).toMatchObject({ puedeCancelarOnline: true, motivo: null });
    expect(r.body.cancelacion.cargo).toEqual({
      tipo: "COBRO",
      monto: 25000,
      concepto: "Cargo por cancelación",
      texto: "Cancelar tiene un cargo de $ 25.000 (primera noche), que se cobra a tu tarjeta Visa terminada en 4242.",
    });
  });

  test("no reembolsable pagada: se ofrece online, sin cobro nuevo ('no admite devolución')", async () => {
    prisma.reserva.findUnique.mockResolvedValue(NRF());
    calcularPenalidad.mockResolvedValue({ ...CON_CARGO, monto: 50000 });
    previsualizarCierreReserva.mockResolvedValue(LIQ_RETENIDO);
    const { body } = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" });
    expect(body.cancelacion.puedeCancelarOnline).toBe(true);
    expect(body.cancelacion.cargo).toMatchObject({ tipo: "RETENIDO", monto: 50000, texto: "Esta tarifa no admite devolución: no se reintegra el importe pagado ($ 50.000)." });
    expect(body.cobrado).toBe(50000);
  });

  test("sin sesión de tarjeta en la garantía (cobro imposible) o con una seña: se deriva a recepción", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ garantiaReserva: null }));
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue({ ...LIQ_COBRO, aCobrarATarjeta: 0, sinCobrar: 25000, tarjeta: null, estadoCobro: "PENDIENTE" });
    expect((await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" })).body.cancelacion).toMatchObject({ puedeCancelarOnline: false, motivo: MOTIVO.SIN_TARJETA, cargo: null });

    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ pagosEstadia: [{ anulado: false, concepto: "Seña", medios: [{ importe: "10000" }] }] }));
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const conSena = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" });
    expect(conSena.body.cancelacion.motivo).toBe(MOTIVO.CON_PAGO);
    expect(conSena.body.cobrado).toBe(10000);
  });

  test("con cargo y la llegada ya pasó (o es hoy desde las 14 h): no pide la liquidación y se deriva", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ fechaDesde: enDias(-1), fechaHasta: enDias(1) }));
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    const r = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" });
    expect(previsualizarCierreReserva).not.toHaveBeenCalled();
    expect(r.body.cancelacion).toMatchObject({ puedeCancelarOnline: false, motivo: MOTIVO.LLEGADA_PASADA, cargo: null });
  });

  test("cancelada: no calcula penalidad y dice que ya fue cancelada", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ estado: "Cancelada" }));
    const r = await llamar(postMiReserva, { codigo: "3FA9C21B", email: "juan@correo.com" });
    expect(calcularPenalidad).not.toHaveBeenCalled();
    expect(r.body.cancelacion).toEqual({ puedeCancelarOnline: false, motivo: MOTIVO.CANCELADA, penalidad: null, cargo: null });
  });
});

describe("POST /api/web/mi-reserva/cancelar", () => {
  const CUERPO = { codigo: "3FA9C21B", email: "juan@correo.com" };
  const CUERPO_CARGO = { ...CUERPO, aceptaCargo: true, montoAceptado: "25000.00" };
  const penalidadCobrada = { estadoCobro: "COBRADO", monto: 25000, retenido: 0, devuelto: 0, cobradoATarjeta: 25000, pendienteDeCobro: 0 };

  test("sin cargo: cancelarReserva con el motivo web, email de cancelación al email de la reserva", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const r = await llamar(postCancelarMiReserva, CUERPO);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      estado: "Cancelada",
      penalidadCobrada: 0,
      cargo: { estado: "SIN_CARGO", monto: 0, tarjeta: null, texto: "No se realizó ningún cargo." },
      email: { enviado: true },
    });
    expect(cancelarReserva).toHaveBeenCalledWith(375, { motivoCancelacion: "Cancelada por el huésped desde la web" });
    const [datos, para, cargoEmail] = emailWeb.enviarCancelacion.mock.calls[0];
    expect(para).toBe("juan@correo.com");
    expect(cargoEmail).toMatchObject({ estado: "SIN_CARGO" });
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

  test("sin cargo: un montoAceptado distinto de 0 → 409 con montoNuevo 0; no cancela", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(SIN_CARGO);
    const r = await llamar(postCancelarMiReserva, { ...CUERPO, montoAceptado: "25000.00" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: "PENALIDAD_CAMBIO", montoNuevo: 0 });
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test("flexible con cargo (cobrado): acepta el cargo y el monto → cancela con cancelarReserva y devuelve COBRADO con la tarjeta", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue(LIQ_COBRO);
    cancelarReserva.mockResolvedValue({ estado: "Cancelada", penalidad: penalidadCobrada });
    const r = await llamar(postCancelarMiReserva, CUERPO_CARGO);
    expect(r.status).toBe(200);
    expect(cancelarReserva).toHaveBeenCalledWith(375, { motivoCancelacion: "Cancelada por el huésped desde la web" });
    expect(r.body).toMatchObject({ estado: "Cancelada", penalidadCobrada: 25000, email: { enviado: true } });
    expect(r.body.cargo).toEqual({
      estado: "COBRADO",
      monto: 25000,
      tarjeta: { marca: "VISA", ultimos4: "4242" },
      texto: "Se cobró $ 25.000 con tu tarjeta Visa terminada en 4242 (cargo por cancelación).",
    });
    expect(emailWeb.enviarCancelacion.mock.calls[0][2]).toMatchObject({ estado: "COBRADO", monto: 25000 });
  });

  test("flexible con cargo y la tarjeta rechaza el cobro: la reserva queda cancelada y el cargo PENDIENTE", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue(LIQ_COBRO);
    cancelarReserva.mockResolvedValue({ estado: "Cancelada", penalidad: { estadoCobro: "RECHAZADO", monto: 25000, retenido: 0, devuelto: 0, cobradoATarjeta: 0, pendienteDeCobro: 25000 } });
    const r = await llamar(postCancelarMiReserva, CUERPO_CARGO);
    expect(r.status).toBe(200);
    expect(r.body.penalidadCobrada).toBe(0);
    expect(r.body.cargo).toMatchObject({ estado: "PENDIENTE", monto: 25000, texto: "No pudimos cobrar el cargo. Recepción se va a comunicar con vos." });
    expect(emailWeb.enviarCancelacion.mock.calls[0][2]).toMatchObject({ estado: "PENDIENTE", monto: 25000 });
  });

  test("no reembolsable: se cancela online, el importe queda RETENIDO y no se cobra nada nuevo", async () => {
    prisma.reserva.findUnique.mockResolvedValue(NRF());
    calcularPenalidad.mockResolvedValue({ ...CON_CARGO, monto: 50000 });
    previsualizarCierreReserva.mockResolvedValue(LIQ_RETENIDO);
    cancelarReserva.mockResolvedValue({ estado: "Cancelada", penalidad: { estadoCobro: "RETENIDO", monto: 50000, retenido: 50000, devuelto: 0, cobradoATarjeta: 0, pendienteDeCobro: 0 } });
    const r = await llamar(postCancelarMiReserva, { ...CUERPO, aceptaCargo: true, montoAceptado: "50000" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ estado: "Cancelada", penalidadCobrada: 0 });
    expect(r.body.cargo).toMatchObject({ estado: "RETENIDO", monto: 50000, texto: "No se reintegra el importe pagado ($ 50.000)." });
  });

  test("con cargo y sin aceptaCargo: true → 422 con el campo; no cancela", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue(LIQ_COBRO);
    for (const aceptaCargo of [undefined, false, "true", 1, null]) {
      const r = await llamar(postCancelarMiReserva, { ...CUERPO, aceptaCargo, montoAceptado: "25000.00" });
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "aceptaCargo" });
    }
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test("con cargo y un montoAceptado distinto del recalculado → 409 PENALIDAD_CAMBIO con el monto nuevo; no cancela", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue(LIQ_COBRO);
    const r = await llamar(postCancelarMiReserva, { ...CUERPO, aceptaCargo: true, montoAceptado: "0" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: "PENALIDAD_CAMBIO", montoNuevo: 25000, cargo: { tipo: "COBRO", monto: 25000 } });
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test.each([["abc"], ["25.000"], ["-5"], [""]])("con cargo y montoAceptado %p inválido o ausente → 422 con el campo; no cancela", async (monto) => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb());
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue(LIQ_COBRO);
    const r = await llamar(postCancelarMiReserva, { ...CUERPO, aceptaCargo: true, montoAceptado: monto });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "montoAceptado" });
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test("después de las 14 h del día de llegada (o llegada pasada) → derivada a recepción: 409 con el motivo; no cancela", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ fechaDesde: enDias(-1), fechaHasta: enDias(1) }));
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    const r = await llamar(postCancelarMiReserva, CUERPO_CARGO);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: "PENALIDAD_CAMBIO", motivo: MOTIVO.LLEGADA_PASADA });
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test("con cargo y sin tarjeta en la garantía → derivada a recepción: 409 con el motivo; no cancela", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ garantiaReserva: null }));
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue({ ...LIQ_COBRO, aCobrarATarjeta: 0, sinCobrar: 25000, tarjeta: null, estadoCobro: "PENDIENTE" });
    const r = await llamar(postCancelarMiReserva, CUERPO_CARGO);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: "PENALIDAD_CAMBIO", motivo: MOTIVO.SIN_TARJETA });
    expect(cancelarReserva).not.toHaveBeenCalled();
  });

  test("con una seña (algo a devolver) → derivada a recepción; no cancela", async () => {
    prisma.reserva.findUnique.mockResolvedValue(reservaWeb({ pagosEstadia: [{ anulado: false, concepto: "Seña", medios: [{ importe: "40000" }] }] }));
    calcularPenalidad.mockResolvedValue(CON_CARGO);
    previsualizarCierreReserva.mockResolvedValue({ ...LIQ_COBRO, retenido: 25000, devuelto: 15000, aCobrarATarjeta: 0 });
    const r = await llamar(postCancelarMiReserva, CUERPO_CARGO);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ codigo: "PENALIDAD_CAMBIO", motivo: MOTIVO.CON_PAGO });
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
