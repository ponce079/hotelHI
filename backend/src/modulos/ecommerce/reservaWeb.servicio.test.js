// Alta web con dobles: base (prisma y tx), reservas, pagos y email. La
// pasarela es la simulada real (con su falla de captura forzada para tests).
const tx = {
  $queryRaw: jest.fn(),
  huesped: { findUnique: jest.fn(), update: jest.fn() },
  datosReservaWeb: { create: jest.fn() },
};
jest.mock("../../lib/prisma", () => ({
  habitacion: { findMany: jest.fn() },
  planTarifario: { findFirst: jest.fn() },
  datosReservaWeb: { findUnique: jest.fn() },
  pagoEstadia: { findFirst: jest.fn() },
  reserva: { findUnique: jest.fn() },
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
jest.mock("../pagos-estadia/pagoEstadia.servicio", () => ({ crearPagoEnTransaccion: jest.fn(), anularPago: jest.fn() }));
jest.mock("./emailWeb.servicio", () => ({ enviarConfirmacion: jest.fn() }));

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const reservas = require("../reservas/reservas.servicio");
const pagos = require("../pagos-estadia/pagoEstadia.servicio");
const emailWeb = require("./emailWeb.servicio");
const pasarela = require("./pasarelaSimulada");
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
function reservaEnBase({ reembolsable = true, prepagoAnulado = false } = {}) {
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
    pagosEstadia: reembolsable ? [] : [{ anulado: prepagoAnulado, medios: [{ importe: String(TOTAL) }] }],
    datosWeb: { emailContacto: "maria@correo.com", tarjetaMarca: "VISA", tarjetaUltimos4: "4242" },
  };
}

let espiaPasarela;
let espiasConsola;

beforeEach(() => {
  jest.clearAllMocks();
  pasarela._soloTest.reiniciar();
  espiaPasarela = jest.spyOn(pasarela, "procesarTarjeta");
  espiasConsola = ["log", "error", "warn", "info"].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));

  prisma.$transaction.mockImplementation((fn) => fn(tx));
  prisma.planTarifario.findFirst.mockImplementation(({ where }) => Promise.resolve({ id: where.id, reembolsable: where.id === 1 }));
  prisma.habitacion.findMany.mockResolvedValue([
    { capacidad: 2, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
    { capacidad: 4, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
  ]);
  prisma.datosReservaWeb.findUnique.mockResolvedValue(null);
  reservas.consultarDisponibilidad.mockResolvedValue({ habitaciones: CANDIDATAS });
  reservas.cotizarParaReserva.mockResolvedValue({ noches: 2, planes: [{ total: TOTAL, habitaciones: [] }] });
  reservas.buscarConflictos.mockResolvedValue([]);
  reservas.crearReservaEnTransaccion.mockResolvedValue({ id: 500, huespedId: 77, reservaHabitaciones: [] });
  tx.huesped.findUnique.mockResolvedValue(null);
  tx.datosReservaWeb.create.mockResolvedValue({});
  pagos.crearPagoEnTransaccion.mockResolvedValue({ id: 900 });
  prisma.reserva.findUnique.mockImplementation(() => Promise.resolve(reservaEnBase({ reembolsable: !ultimaOperacion("PREAUTORIZACION") })));
  emailWeb.enviarConfirmacion.mockResolvedValue({ enviado: true });
});

afterEach(() => {
  // Seguridad: el número y el CVV nunca llegaron a la base, a un log ni a la respuesta.
  const todo = JSON.stringify([
    tx.datosReservaWeb.create.mock.calls,
    tx.huesped.update.mock.calls,
    pagos.crearPagoEnTransaccion.mock.calls,
    reservas.crearReservaEnTransaccion.mock.calls,
    ...espiasConsola.map((e) => e.mock.calls),
  ]);
  expect(todo).not.toContain(NUMERO);
  expect(todo).not.toContain(`"${CVV}"`);
  espiasConsola.forEach((e) => e.mockRestore());
  espiaPasarela.mockRestore();
});

const operaciones = () => espiaPasarela.mock.calls.map(([a]) => a.operacion);
function ultimaOperacion(op) {
  return espiaPasarela?.mock.calls.some(([a]) => a.operacion === op);
}
async function referenciaPreautorizada() {
  const i = espiaPasarela.mock.calls.findIndex(([a]) => a.operacion === "PREAUTORIZACION");
  return (await espiaPasarela.mock.results[i].value).referencia;
}

test("tarifa flexible: 201, GARANTIA de monto 0, sin PagoEstadia, la habitación más chica que alcanza y DatosReservaWeb sin número ni CVV", async () => {
  const { status, body } = await llamar(cuerpo());
  expect(status).toBe(201);
  expect(operaciones()).toEqual(["GARANTIA"]);
  expect(Number(espiaPasarela.mock.calls[0][0].monto)).toBe(0);
  expect(pagos.crearPagoEnTransaccion).not.toHaveBeenCalled();
  expect(reservas.crearReservaEnTransaccion.mock.calls[0][1].habitaciones).toEqual([{ habitacionId: 6, adultos: 2, menores: 0 }]);
  expect(reservas.crearReservaEnTransaccion.mock.calls[0][1].huesped).toMatchObject({ contacto: "maria@correo.com", nombres: "María" });
  const datosWeb = tx.datosReservaWeb.create.mock.calls[0][0].data;
  expect(datosWeb).toMatchObject({
    claveIdempotencia: "clave-de-prueba-0001",
    emailContacto: "maria@correo.com",
    tarjetaTitular: "MARIA GONZALEZ",
    tarjetaMarca: "VISA",
    tarjetaUltimos4: "4242",
    tarjetaVencimiento: "12/2099",
  });
  expect(datosWeb.garantiaToken).toMatch(/^TOK-/);
  expect(body).toMatchObject({ codigoConfirmacion: "3FA9C21B", cobradoAhora: 0, garantia: { tipo: "GARANTIA" }, email: { enviado: true } });
  expect(emailWeb.enviarConfirmacion).toHaveBeenCalledTimes(1);
  // Email definitivo: recibe los nombres del titular para el saludo (y nunca la tarjeta).
  expect(emailWeb.enviarConfirmacion).toHaveBeenCalledWith(
    expect.objectContaining({ codigoConfirmacion: "3FA9C21B" }),
    "maria@correo.com",
    expect.objectContaining({ nombre: expect.any(String) })
  );
});

test("no reembolsable: PREAUTORIZACION por el total, prepago con su referencia dentro de la transacción y CAPTURA", async () => {
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(201);
  expect(operaciones()).toEqual(["PREAUTORIZACION", "CAPTURA"]);
  const referencia = await referenciaPreautorizada();
  expect(pagos.crearPagoEnTransaccion).toHaveBeenCalledWith(tx, {
    reservaId: 500,
    medios: [{ tipo: "Tarjeta crédito", importe: TOTAL, referencia }],
    concepto: "Prepago",
  });
  expect(pasarela._soloTest.estadoPreautorizacion(referencia)).toBe("capturada");
  expect(tx.datosReservaWeb.create.mock.calls[0][0].data).toMatchObject({ pasarelaReferencia: referencia, garantiaToken: null });
  expect(body).toMatchObject({ cobradoAhora: TOTAL, garantia: { tipo: "PREPAGO" } });
});

test("repetición idempotente: 200 con la misma reserva, sin pasarela, sin transacción y sin email (enviado: null)", async () => {
  prisma.datosReservaWeb.findUnique.mockResolvedValue({ ...reservaEnBase().datosWeb, reserva: reservaEnBase() });
  const { status, body } = await llamar(cuerpo({ numero: "5555555555554444" }));
  expect(status).toBe(200);
  expect(body).toMatchObject({ codigoConfirmacion: "3FA9C21B", garantia: { marca: "VISA", ultimos4: "4242" }, email: { enviado: null } });
  expect(espiaPasarela).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(emailWeb.enviarConfirmacion).not.toHaveBeenCalled();
});

test("misma clave con otras fechas → 409 CLAVE_REUTILIZADA, sin pasarela", async () => {
  prisma.datosReservaWeb.findUnique.mockResolvedValue({ ...reservaEnBase().datosWeb, reserva: reservaEnBase() });
  const { status, body } = await llamar(cuerpo({ fechaHasta: dia(13) }));
  expect(status).toBe(409);
  expect(body.codigo).toBe("CLAVE_REUTILIZADA");
  expect(espiaPasarela).not.toHaveBeenCalled();
});

test("totalEsperado distinto → 409 PRECIO_CAMBIADO con totalNuevo, sin pasarela ni transacción", async () => {
  reservas.cotizarParaReserva.mockResolvedValue({ noches: 2, planes: [{ total: 88000 }] });
  const { status, body } = await llamar(cuerpo());
  expect(status).toBe(409);
  expect(body).toMatchObject({ codigo: "PRECIO_CAMBIADO", totalNuevo: 88000 });
  expect(espiaPasarela).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test("sin habitaciones libres del tipo → 409 SIN_DISPONIBILIDAD, con mensaje sin números de habitación ni códigos", async () => {
  reservas.consultarDisponibilidad.mockResolvedValue({ habitaciones: [] });
  const { status, body } = await llamar(cuerpo());
  expect(status).toBe(409);
  expect(body.codigo).toBe("SIN_DISPONIBILIDAD");
  expect(body.error).not.toMatch(/\d{2,4}|[0-9A-F]{8}/);
  expect(espiaPasarela).not.toHaveBeenCalled();
});

test("titular menor de 18 → 400 en huesped.fechaNacimiento, sin pasarela", async () => {
  const c = cuerpo();
  c.huesped.fechaNacimiento = dia(-365 * 10);
  const { status, body } = await llamar(c);
  expect(status).toBe(400);
  expect(body).toMatchObject({ codigo: "DATOS_INVALIDOS", campo: "huesped.fechaNacimiento" });
  expect(espiaPasarela).not.toHaveBeenCalled();
});

test("0002 en no reembolsable → 402 PAGO_RECHAZADO, nada creado; en tarifa flexible → 201", async () => {
  const nrf = await llamar(cuerpo({ plan: 2, numero: "4000000000000002" }));
  expect(nrf.status).toBe(402);
  expect(nrf.body).toMatchObject({ codigo: "PAGO_RECHAZADO", motivo: "Fondos insuficientes" });
  expect(prisma.$transaction).not.toHaveBeenCalled();
  const bar = await llamar(cuerpo({ plan: 1, numero: "4000000000000002", clave: "clave-de-prueba-0002" }));
  expect(bar.status).toBe(201);
});

test("captura fallida: anula el prepago, cancela la reserva con 'Pago no capturado', libera y responde 402", async () => {
  prisma.pagoEstadia.findFirst.mockResolvedValue({ id: 900 });
  pasarela._soloTest.forzarFallaDeCaptura();
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(402);
  expect(body).toMatchObject({ codigo: "PAGO_RECHAZADO", error: "No pudimos confirmar el pago. No se realizó ningún cargo." });
  expect(prisma.pagoEstadia.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { reservaId: 500, concepto: "Prepago", anulado: false } }));
  expect(pagos.anularPago).toHaveBeenCalledWith(900, "Pago no capturado");
  expect(reservas.cancelarReserva).toHaveBeenCalledWith(500, { motivoCancelacion: "Pago no capturado" });
  expect(operaciones()).toEqual(["PREAUTORIZACION", "CAPTURA", "LIBERACION"]);
  expect(pasarela._soloTest.estadoPreautorizacion(await referenciaPreautorizada())).toBe("liberada");
  expect(emailWeb.enviarConfirmacion).not.toHaveBeenCalled();
});

test("captura fallida: el prepago se anula ANTES de cancelar la reserva", async () => {
  prisma.pagoEstadia.findFirst.mockResolvedValue({ id: 900 });
  const orden = [];
  pagos.anularPago.mockImplementation(async (id, motivo) => orden.push(["anular", id, motivo]));
  reservas.cancelarReserva.mockImplementation(async () => orden.push(["cancelar"]));
  pasarela._soloTest.forzarFallaDeCaptura();
  await llamar(cuerpo({ plan: 2 }));
  expect(orden).toEqual([["anular", 900, "Pago no capturado"], ["cancelar"]]);
});

test("rollback con no reembolsable (falla dentro de la transacción): la preautorización queda liberada", async () => {
  tx.datosReservaWeb.create.mockRejectedValue(new Error("se cayó la base"));
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(500);
  expect(body.codigo).toBe("ERROR_INTERNO");
  expect(operaciones()).toEqual(["PREAUTORIZACION", "LIBERACION"]);
  expect(pasarela._soloTest.estadoPreautorizacion(await referenciaPreautorizada())).toBe("liberada");
});

test("conflicto dentro de la transacción (todas tomadas) con no reembolsable: 409 SIN_DISPONIBILIDAD y preautorización liberada", async () => {
  reservas.buscarConflictos.mockResolvedValue(CANDIDATAS.map((h) => ({ habitacionId: h.id })));
  const { status, body } = await llamar(cuerpo({ plan: 2 }));
  expect(status).toBe(409);
  expect(body.codigo).toBe("SIN_DISPONIBILIDAD");
  expect(reservas.crearReservaEnTransaccion).not.toHaveBeenCalled();
  expect(pasarela._soloTest.estadoPreautorizacion(await referenciaPreautorizada())).toBe("liberada");
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
  expect(pasarela._soloTest.estadoPreautorizacion(await referenciaPreautorizada())).toBe("liberada");
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
  expect(pasarela._soloTest.estadoPreautorizacion(await referenciaPreautorizada())).toBe("liberada");
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
