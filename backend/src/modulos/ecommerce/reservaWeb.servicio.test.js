// Alta web con dobles: base (prisma y tx), reservas y email. La pasarela es la
// ÚNICA del sistema (garantias/pasarela.servicio.js, de Ricardo), mockeada acá con un simulador mínimo
// que respeta sus reglas (0002 rechaza también la garantía, 0069 vencida). El módulo de garantías
// (garantias.servicio.js) corre real: el alta web usa sus mismas funciones que el alta del mostrador.
const tx = {
  $queryRaw: jest.fn(),
  huesped: { findUnique: jest.fn(), update: jest.fn() },
  datosReservaWeb: { create: jest.fn() },
  garantiaReserva: { create: jest.fn(), update: jest.fn() },
  pagoEstadia: { create: jest.fn() },
};
jest.mock("../../lib/prisma", () => ({
  habitacion: { findMany: jest.fn() },
  planTarifario: { findFirst: jest.fn() },
  datosReservaWeb: { findUnique: jest.fn() },
  reserva: { findUnique: jest.fn(), update: jest.fn() },
  garantiaReserva: { update: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock("../reservas/reservas.servicio", () => ({
  ...jest.requireActual("../reservas/reservas.servicio"),
  consultarDisponibilidad: jest.fn(),
  cotizarParaReserva: jest.fn(),
  buscarConflictos: jest.fn(),
  crearReservaEnTransaccion: jest.fn(),
  cancelarReserva: jest.fn(),
}));
jest.mock("../garantias/pasarela.servicio", () => ({
  ...jest.requireActual("../garantias/pasarela.servicio"),
  procesarTarjeta: jest.fn(),
}));
jest.mock("./emailWeb.servicio", () => ({ enviarConfirmacion: jest.fn() }));

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const reservas = require("../reservas/reservas.servicio");
const { procesarTarjeta } = require("../garantias/pasarela.servicio");
const emailWeb = require("./emailWeb.servicio");
const { hoyComoFechaUTC } = require("../../lib/fechas");
const { claveDocumento } = require("../estadia/persona.servicio");
const { postReserva } = require("./ecommerce.controlador");

const NUMERO = "4242424242424242";
const CVV = "987";
const TOTAL = 80000;

function dia(desplazamiento) {
  const fecha = hoyComoFechaUTC();
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento);
  return fecha.toISOString().slice(0, 10);
}

function cuerpo({ plan = 1, clave = "clave-de-prueba-0001", numero = NUMERO, ...cambios } = {}) {
  return {
    claveIdempotencia: clave,
    fechaDesde: dia(10),
    fechaHasta: dia(12),
    planTarifarioId: plan,
    totalEsperado: TOTAL,
    habitaciones: [{ tipoHabitacionId: 1, adultos: 2, menores: 0 }],
    huesped: {
      nombres: "María",
      apellido: "González",
      tipoDocumento: "DNI",
      paisDocumento: "AR",
      numeroDocumento: "30111222",
      fechaNacimiento: "1990-05-20",
      email: "maria@correo.com",
      telefono: "+54 9 387 555-1234",
      nacionalidad: "AR",
      paisResidencia: "AR",
    },
    llegada: { horaEstimada: "18-20" },
    consentimiento: { aceptaPoliticas: true, versionPoliticas: "2026-10-01", aceptaComunicaciones: false },
    tarjeta: { titular: "MARIA GONZALEZ", numero, vencimientoMes: 12, vencimientoAnio: 2099, cvv: CVV },
    ...cambios,
  };
}

async function llamar(body) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), set: jest.fn() };
  res.status.mockImplementation((s) => {
    res.statusCode = s;
    return res;
  });
  await postReserva({ body }, res);
  return { status: res.statusCode, body: res.json.mock.calls[0][0] };
}

const IDENTIDAD = claveDocumento({ tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30111222" });
const CANDIDATAS = [
  { id: 6, numero: "030", capacidad: 2, tipoHabitacionId: 1 },
  { id: 10, numero: "100", capacidad: 4, tipoHabitacionId: 1 },
];

// Lo que la relectura (y la repetición idempotente) devuelve de la base.
function reservaEnBase({ reembolsable = true } = {}) {
  return {
    id: 500,
    codigoConfirmacion: "3FA9C21B",
    estado: "Confirmada",
    fechaDesde: new Date(`${dia(10)}T00:00:00Z`),
    fechaHasta: new Date(`${dia(12)}T00:00:00Z`),
    planTarifarioId: reembolsable ? 1 : 2,
    planTarifario: { codigo: reembolsable ? "BAR" : "NRF", nombre: "x", reembolsable, horasCancelacionSinCargo: reembolsable ? 48 : null },
    huesped: { identidadDocumento: IDENTIDAD },
    reservaHabitaciones: [
      { id: 1, adultos: 2, menores: 0, habitacion: { tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble" } }, reservaNoches: [{ precioNoche: "40000" }, { precioNoche: "40000" }] },
    ],
    pagosEstadia: reembolsable ? [] : [{ anulado: false, concepto: "Pago anticipado", medios: [{ importe: String(TOTAL) }] }],
    garantiaReserva: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242", estado: reembolsable ? "Vigente" : "Capturada" },
    datosWeb: { emailContacto: "maria@correo.com" },
  };
}

const rechazo = (motivoRechazo) => ({ aprobado: false, referencia: null, token: null, marca: null, ultimos4: null, motivoRechazo });
let capturaFalla;

// Simulador mínimo con las reglas de la pasarela de Ricardo (D2: 0002 rechaza TAMBIÉN la garantía).
function simularPasarela({ operacion, tarjeta, referenciaPrevia }) {
  const ultimos4 = tarjeta ? String(tarjeta.numero).replace(/\D/g, "").slice(-4) : null;
  if (tarjeta && ultimos4 === "0069") return Promise.resolve(rechazo("Tarjeta vencida."));
  if (tarjeta && ultimos4 === "0002") return Promise.resolve(rechazo("Fondos insuficientes."));
  const base = { aprobado: true, motivoRechazo: null, token: null, marca: null, ultimos4: null };
  switch (operacion) {
    case "GARANTIA":
      return Promise.resolve({ ...base, referencia: "GAR-000001", token: "tok_simulado.firma", marca: "Visa", ultimos4 });
    case "PREAUTORIZACION":
      return Promise.resolve({ ...base, referencia: "PRE-000001", token: "tok_simulado.firma", marca: "Visa", ultimos4 });
    case "CAPTURA":
      return Promise.resolve(capturaFalla ? rechazo("Pasarela caída.") : { ...base, referencia: "CAP-000001" });
    case "LIBERACION":
      return Promise.resolve({ ...base, referencia: `LIB-${referenciaPrevia}` });
    default:
      throw new Error(`operación desconocida ${operacion}`);
  }
}

let espiasConsola;

beforeEach(() => {
  jest.clearAllMocks();
  capturaFalla = false;
  procesarTarjeta.mockImplementation(simularPasarela);
  espiasConsola = ["log", "error", "warn", "info"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));

  prisma.$transaction.mockImplementation((fn) => fn(tx));
  prisma.planTarifario.findFirst.mockImplementation(({ where }) => Promise.resolve({ id: where.id, reembolsable: where.id === 1 }));
  prisma.habitacion.findMany.mockResolvedValue([
    { capacidad: 2, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
    { capacidad: 4, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
  ]);
  prisma.datosReservaWeb.findUnique.mockResolvedValue(null);
  prisma.reserva.update.mockResolvedValue({});
  prisma.garantiaReserva.update.mockResolvedValue({});
  reservas.consultarDisponibilidad.mockResolvedValue({ habitaciones: CANDIDATAS });
  reservas.cotizarParaReserva.mockResolvedValue({ noches: 2, planes: [{ total: TOTAL, habitaciones: [] }] });
  reservas.buscarConflictos.mockResolvedValue([]);
  reservas.crearReservaEnTransaccion.mockResolvedValue({ id: 500, huespedId: 77, reservaHabitaciones: [] });
  tx.huesped.findUnique.mockResolvedValue(null);
  tx.datosReservaWeb.create.mockResolvedValue({});
  tx.garantiaReserva.create.mockResolvedValue({});
  tx.garantiaReserva.update.mockResolvedValue({});
  tx.pagoEstadia.create.mockResolvedValue({ id: 900 });
  prisma.reserva.findUnique.mockImplementation(() => Promise.resolve({ ...reservaEnBase({ reembolsable: !operaciones().includes("PREAUTORIZACION") }), datosWeb: { emailContacto: "maria@correo.com" } }));
  emailWeb.enviarConfirmacion.mockResolvedValue({ enviado: true });
});

afterEach(() => {
  // Seguridad: el número y el CVV nunca llegaron a la base, a un log ni a la respuesta.
  const todo = JSON.stringify([
    tx.datosReservaWeb.create.mock.calls,
    tx.garantiaReserva.create.mock.calls,
    tx.pagoEstadia.create.mock.calls,
    prisma.garantiaReserva.update.mock.calls,
    tx.huesped.update.mock.calls,
    reservas.crearReservaEnTransaccion.mock.calls,
    ...espiasConsola.map((e) => e.mock.calls),
  ]);
  expect(todo).not.toContain(NUMERO);
  expect(todo).not.toContain(`"${CVV}"`);
  espiasConsola.forEach((e) => e.mockRestore());
});

const operaciones = () => procesarTarjeta.mock.calls.map(([a]) => a.operacion);
const llamada = (operacion) => procesarTarjeta.mock.calls.map(([a]) => a).find((a) => a.operacion === operacion);

test("tarifa flexible: 201, GARANTIA de monto 0, GarantiaReserva TARJETA Vigente, sin PagoEstadia y DatosReservaWeb solo con el titular", async () => {
  const { status, body } = await llamar(cuerpo());
  expect(status).toBe(201);
  expect(operaciones()).toEqual(["GARANTIA"]);
  expect(Number(llamada("GARANTIA").monto)).toBe(0);
  expect(tx.pagoEstadia.create).not.toHaveBeenCalled();
  expect(reservas.crearReservaEnTransaccion.mock.calls[0][1].habitaciones).toEqual([{ habitacionId: 6, adultos: 2, menores: 0 }]);
  expect(reservas.crearReservaEnTransaccion.mock.calls[0][1].huesped).toMatchObject({ contacto: "maria@correo.com", nombres: "María" });

  // La garantía, la misma fila que el alta del mostrador: token, marca, últimos 4, vencimiento MM/AA, referencia.
  const garantia = tx.garantiaReserva.create.mock.calls[0][0].data;
  expect(garantia).toMatchObject({
    reservaId: 500,
    tipo: "TARJETA",
    token: "tok_simulado.firma",
    marca: "Visa",
    ultimos4: "4242",
    vencimiento: "12/99",
    referencia: "GAR-000001",
    estado: "Vigente",
  });
  expect(Number(garantia.monto)).toBe(0);

  // DatosReservaWeb: de la tarjeta, solo el titular.
  const datosWeb = tx.datosReservaWeb.create.mock.calls[0][0].data;
  expect(datosWeb).toMatchObject({ claveIdempotencia: "clave-de-prueba-0001", emailContacto: "maria@correo.com", tarjetaTitular: "MARIA GONZALEZ" });
  for (const campo of ["tarjetaMarca", "tarjetaUltimos4", "tarjetaVencimiento", "garantiaToken", "pasarelaReferencia"]) {
    expect(datosWeb).not.toHaveProperty(campo);
  }
  expect(body).toMatchObject({ codigoConfirmacion: "3FA9C21B", cobradoAhora: 0, garantia: { tipo: "GARANTIA", marca: "Visa", ultimos4: "4242" }, email: { enviado: true } });
  expect(emailWeb.enviarConfirmacion).toHaveBeenCalledTimes(1);
  // Email definitivo: recibe los nombres del titular para el saludo (y nunca la tarjeta).
  expect(emailWeb.enviarConfirmacion).toHaveBeenCalledWith(
    expect.objectContaining({ codigoConfirmacion: "3FA9C21B" }),
    "maria@correo.com",
    expect.objectContaining({ nombre: expect.any(String) })
  );
});

test("no reembolsable: PREAUTORIZACION por el total → garantía Preautorizada en la transacción → CAPTURA → 'Pago anticipado' y garantía Capturada", async () => {
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(201);
  expect(operaciones()).toEqual(["PREAUTORIZACION", "CAPTURA"]);
  expect(Number(llamada("PREAUTORIZACION").monto)).toBe(TOTAL);
  expect(llamada("CAPTURA").referenciaPrevia).toBe("PRE-000001");

  // En la transacción del alta: solo la garantía (como el alta NRF del mostrador); el pago va después de capturar.
  const garantia = tx.garantiaReserva.create.mock.calls[0][0].data;
  expect(garantia).toMatchObject({ reservaId: 500, tipo: "TARJETA", referencia: "PRE-000001", estado: "Preautorizada" });
  expect(Number(garantia.monto)).toBe(TOTAL);
  expect(tx.pagoEstadia.create).toHaveBeenCalledTimes(1);
  const pago = tx.pagoEstadia.create.mock.calls[0][0].data;
  expect(pago).toMatchObject({ reservaId: 500, estado: "Pagado", concepto: "Pago anticipado" });
  expect(pago.medios.create).toEqual([
    { medioPago: "Tarjeta crédito", importe: TOTAL, referencia: "Visa ****4242 · aut. CAP-000001" },
  ]);
  expect(tx.garantiaReserva.update).toHaveBeenCalledWith({ where: { reservaId: 500 }, data: { estado: "Capturada" } });
  expect(body).toMatchObject({ cobradoAhora: TOTAL, garantia: { tipo: "PREPAGO", marca: "Visa", ultimos4: "4242" } });
});

test("no reembolsable: cada intento pide su propia preautorización (clave distinta por intento)", async () => {
  await llamar(cuerpo({ plan: 2 }));
  await llamar(cuerpo({ plan: 2 }));
  const claves = procesarTarjeta.mock.calls.filter(([a]) => a.operacion === "PREAUTORIZACION").map(([a]) => a.claveIdempotencia);
  expect(claves).toHaveLength(2);
  expect(claves[0]).not.toBe(claves[1]);
  expect(claves[0].startsWith("clave-de-prueba-0001:")).toBe(true);
});

test("repetición idempotente: 200 con la misma reserva, sin pasarela, sin transacción y sin email (enviado: null)", async () => {
  prisma.datosReservaWeb.findUnique.mockResolvedValue({ ...reservaEnBase().datosWeb, reserva: reservaEnBase() });
  const { status, body } = await llamar(cuerpo({ numero: "5555555555554444" }));
  expect(status).toBe(200);
  expect(body).toMatchObject({ codigoConfirmacion: "3FA9C21B", garantia: { marca: "Visa", ultimos4: "4242" }, email: { enviado: null } });
  expect(procesarTarjeta).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(emailWeb.enviarConfirmacion).not.toHaveBeenCalled();
});

test("misma clave con otras fechas → 409 CLAVE_REUTILIZADA, sin pasarela", async () => {
  prisma.datosReservaWeb.findUnique.mockResolvedValue({ ...reservaEnBase().datosWeb, reserva: reservaEnBase() });
  const { status, body } = await llamar(cuerpo({ fechaHasta: dia(13) }));
  expect(status).toBe(409);
  expect(body.codigo).toBe("CLAVE_REUTILIZADA");
  expect(procesarTarjeta).not.toHaveBeenCalled();
});

test("totalEsperado distinto → 409 PRECIO_CAMBIADO con totalNuevo, sin pasarela ni transacción", async () => {
  reservas.cotizarParaReserva.mockResolvedValue({ noches: 2, planes: [{ total: 88000 }] });
  const { status, body } = await llamar(cuerpo());
  expect(status).toBe(409);
  expect(body).toMatchObject({ codigo: "PRECIO_CAMBIADO", totalNuevo: 88000 });
  expect(procesarTarjeta).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("sin habitaciones libres del tipo → 409 SIN_DISPONIBILIDAD, con mensaje sin números de habitación ni códigos", async () => {
  reservas.consultarDisponibilidad.mockResolvedValue({ habitaciones: [] });
  const { status, body } = await llamar(cuerpo());
  expect(status).toBe(409);
  expect(body.codigo).toBe("SIN_DISPONIBILIDAD");
  expect(body.error).not.toMatch(/\d{2,4}|[0-9A-F]{8}/);
  expect(procesarTarjeta).not.toHaveBeenCalled();
});

test("titular menor de 18 → 400 en huesped.fechaNacimiento, sin pasarela", async () => {
  const c = cuerpo();
  c.huesped.fechaNacimiento = dia(-365 * 10);
  const { status, body } = await llamar(c);
  expect(status).toBe(400);
  expect(body).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "huesped.fechaNacimiento" });
  expect(procesarTarjeta).not.toHaveBeenCalled();
});

test("0002 rechaza TAMBIÉN la garantía de la tarifa flexible (comportamiento de la pasarela única): 402, nada creado", async () => {
  const bar = await llamar(cuerpo({ plan: 1, numero: "4000000000000002" }));
  expect(bar.status).toBe(402);
  expect(bar.body).toMatchObject({ codigo: "PAGO_RECHAZADO", motivo: "Fondos insuficientes" });
  const nrf = await llamar(cuerpo({ plan: 2, numero: "4000000000000002", clave: "clave-de-prueba-0002" }));
  expect(nrf.status).toBe(402);
  expect(nrf.body).toMatchObject({ codigo: "PAGO_RECHAZADO", motivo: "Fondos insuficientes" });
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(tx.garantiaReserva.create).not.toHaveBeenCalled();
});

test("0069 → 402 PAGO_RECHAZADO (tarjeta vencida), nada creado", async () => {
  const { status, body } = await llamar(cuerpo({ plan: 2, numero: "4000000000000069" }));
  expect(status).toBe(402);
  expect(body.codigo).toBe("PAGO_RECHAZADO");
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("captura fallida: libera la retención, cancela la reserva sin penalidad, la garantía queda Liberada y responde 402", async () => {
  capturaFalla = true;
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(402);
  expect(body).toMatchObject({ codigo: "PAGO_RECHAZADO", error: "No pudimos confirmar el pago. No se realizó ningún cargo." });
  expect(operaciones()).toEqual(["PREAUTORIZACION", "CAPTURA", "LIBERACION"]);
  expect(llamada("LIBERACION").referenciaPrevia).toBe("PRE-000001");
  // El mismo camino del mostrador: cancelación directa con motivo, NUNCA cancelarReserva (que calcula y cobra penalidad).
  expect(reservas.cancelarReserva).not.toHaveBeenCalled();
  expect(prisma.reserva.update).toHaveBeenCalledWith({
    where: { id: 500 },
    data: { estado: "Cancelada", motivoCancelacion: "No se pudo capturar el cobro de la tarifa no reembolsable." },
  });
  expect(prisma.garantiaReserva.update).toHaveBeenCalledWith({ where: { reservaId: 500 }, data: { estado: "Liberada" } });
  expect(tx.garantiaReserva.update).not.toHaveBeenCalled();
  expect(tx.pagoEstadia.create).not.toHaveBeenCalled();
  // Ninguna operación de cobro de penalidad.
  expect(operaciones()).not.toContain("COBRO");
  expect(emailWeb.enviarConfirmacion).not.toHaveBeenCalled();
});

test("rollback con no reembolsable (falla dentro de la transacción): la preautorización queda liberada", async () => {
  tx.datosReservaWeb.create.mockRejectedValue(new Error("se cayó la base"));
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(500);
  expect(body.codigo).toBe("ERROR_INTERNO");
  expect(operaciones()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
  expect(llamada("LIBERACION").referenciaPrevia).toBe("PRE-000001");
});

test("rollback con tarifa flexible: no hay retención que liberar (solo se tokenizó)", async () => {
  tx.datosReservaWeb.create.mockRejectedValue(new Error("se cayó la base"));
  const { status } = await llamar(cuerpo());
  expect(status).toBe(500);
  expect(operaciones()).toEqual(["GARANTIA"]);
});

test("conflicto dentro de la transacción (todas tomadas) con no reembolsable: 409 SIN_DISPONIBILIDAD y preautorización liberada", async () => {
  reservas.buscarConflictos.mockResolvedValue(CANDIDATAS.map((h) => ({ habitacionId: h.id })));
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(409);
  expect(body.codigo).toBe("SIN_DISPONIBILIDAD");
  expect(reservas.crearReservaEnTransaccion).not.toHaveBeenCalled();
  expect(operaciones()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
});

test("lock de TODAS las candidatas y una sola consulta de conflictos", async () => {
  await llamar(cuerpo());
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  expect(reservas.buscarConflictos).toHaveBeenCalledTimes(1);
  expect(reservas.buscarConflictos.mock.calls[0][1].habitacionIds).toEqual([6, 10]);
});

test("un 409 de crearReservaEnTransaccion es PRECIO_CAMBIADO recotizado afuera, sin reenviar su mensaje", async () => {
  reservas.crearReservaEnTransaccion.mockRejectedValue(new reservas.ErrorDeNegocio("No hay disponibilidad en: 030 (reserva 1A2B3C4D)", 409));
  reservas.cotizarParaReserva
    .mockResolvedValueOnce({ noches: 2, planes: [{ total: TOTAL }] })
    .mockResolvedValueOnce({ noches: 2, planes: [{ total: 90000 }] });
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(409);
  expect(body).toMatchObject({ codigo: "PRECIO_CAMBIADO", totalNuevo: 90000 });
  expect(JSON.stringify(body)).not.toMatch(/1A2B3C4D|030/);
  expect(operaciones()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
});

test("dos pedidos con la misma clave chocan en la base (P2002): se libera y se responde la reserva del otro (200)", async () => {
  tx.datosReservaWeb.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "7",
      meta: { target: "datos_reserva_web_claveIdempotencia_key" },
    })
  );
  prisma.datosReservaWeb.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ ...reservaEnBase({ reembolsable: false }).datosWeb, reserva: reservaEnBase({ reembolsable: false }) });
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(200);
  expect(body.email).toEqual({ enviado: null });
  expect(operaciones()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
});

test("ficha existente: la web no la pisa y solo completa la residencia vacía", async () => {
  tx.huesped.findUnique.mockResolvedValue({
    id: 77,
    nombre: "Lucía Fernández",
    nombres: "Lucía",
    apellido: "Fernández",
    tipoDocumento: "DNI",
    paisDocumento: "AR",
    numeroDocumento: "30111222",
    fechaNacimiento: new Date("1991-10-01T00:00:00Z"),
    contacto: "lucia@correo.com",
    preferencias: null,
    nacionalidad: "AR",
    paisResidencia: null,
  });
  await llamar(cuerpo());
  expect(tx.huesped.findUnique).toHaveBeenCalledWith({ where: { identidadDocumento: IDENTIDAD } });
  expect(reservas.crearReservaEnTransaccion.mock.calls[0][1].huesped).toMatchObject({
    nombres: "Lucía",
    apellido: "Fernández",
    contacto: "lucia@correo.com",
  });
  expect(tx.huesped.update).toHaveBeenCalledWith({ where: { id: 77 }, data: { paisResidencia: "AR" } });
  expect(tx.datosReservaWeb.create.mock.calls[0][0].data.emailContacto).toBe("maria@correo.com");
});
