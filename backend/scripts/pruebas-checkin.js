// Pruebas de negocio del módulo Check-in (HU-43 a HU-47).
//
// Corren SIN base de datos y sin red — mismo criterio que pruebas-reservas.js,
// pero con el doble de Prisma compartido en _dobleSprint3.js (Check-in no
// tiene tabla propia: orquesta Reserva y Habitacion de verdad, código real
// de reservas.servicio.js y habitaciones.servicio.js corriendo contra la
// base en memoria, no mocks de esos dos servicios).
//
//   node scripts/pruebas-checkin.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const checkInServicio = require("../src/modulos/check-in/checkIn.servicio");
const reservasServicio = require("../src/modulos/reservas/reservas.servicio");
const pagoEstadiaServicio = require("../src/modulos/pagos-estadia/pagoEstadia.servicio");
const checkOutServicio = require("../src/modulos/check-out/checkOut.servicio");
const { ESTADO_RESERVA } = require("../src/modulos/reservas/reservas.constantes");

let pasaron = 0;
const fallaron = [];

async function prueba(nombre, fn) {
  try {
    await fn();
    pasaron += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (err) {
    fallaron.push({ nombre, err });
    console.log(`  ✘ ${nombre}\n      ${err.message}`);
  }
}

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

function limpiar() {
  base._limpiar();
}

function enDias(dias) {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  return new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const HUESPED = {
  paisDocumento: "AR",
  fechaNacimiento: "1990-01-01",
  nombre: "Ana Pérez",
  tipoDocumento: "DNI",
  numeroDocumento: "30111222",
  contacto: "ana@mail.com",
};
// Efectivo, sin referencia: el default más simple que pasa validarGarantia.
// El monto ya no lo manda el cliente — es fijo (MONTO_GARANTIA en
// checkIn.constantes.js), así que no hace falta pasarlo acá.
const GARANTIA_OK = { garantiaConfirmada: true, medioGarantia: "Efectivo" };

// --------------------------------------------------------------
// Fixture mínima de tarifas (Etapa 4A) — desde que crearReserva/
// registrarCheckInWalkIn pasan por el motor de cotización, toda habitación
// necesita un tipo con tarifa vigente. Una temporada Base + un plan BAR, y
// una Tarifa por tipo al precio que le pase cada prueba (ver
// sembrarHabitacion más abajo — Etapa 4C: el precio ya no viaja metido en
// el objeto de la habitación, porque Habitacion.tarifaPorNoche no existe
// más; se pasa como parámetro aparte).
// --------------------------------------------------------------
const PRECIO_BASE_PRUEBA = 50000;

async function asegurarTemporadaYPlanBase() {
  let temporadaBase = base._datos.temporada.find((t) => t.nivel === "BASE");
  if (!temporadaBase) {
    temporadaBase = await base.temporada.create({
      data: { nombre: "Base", nivel: "BASE", fechaDesde: null, fechaHasta: null, estadiaMinima: null, cierreLlegada: false, activa: true },
    });
  }
  let planBar = base._datos.planTarifario.find((p) => p.codigo === "BAR");
  if (!planBar) {
    planBar = await base.planTarifario.create({
      data: {
        codigo: "BAR",
        nombre: "Best Available Rate",
        tipo: "BASE",
        planBaseId: null,
        descuentoPorcentaje: null,
        reembolsable: true,
        horasCancelacionSinCargo: 48,
        penalidadNoShow: "PRIMERA_NOCHE",
        visibleWeb: true,
        activo: true,
      },
    });
  }
  return { temporadaBase, planBar };
}

async function asegurarTarifaParaTipo(tipoHabitacionId, precioPorNoche = PRECIO_BASE_PRUEBA) {
  const { temporadaBase } = await asegurarTemporadaYPlanBase();
  const yaTiene = base._datos.tarifa.some((t) => t.tipoHabitacionId === tipoHabitacionId && t.temporadaId === temporadaBase.id);
  if (!yaTiene) {
    await base.tarifa.create({
      data: {
        tipoHabitacionId,
        temporadaId: temporadaBase.id,
        precioBase: precioPorNoche,
        adicionalAdultoExtra: 0,
        vigenteDesde: new Date(`${enDias(-365)}T00:00:00.000Z`),
      },
    });
  }
}

// Envoltorio de base._sembrarHabitacion que además garantiza tarifa vigente
// para el tipo recién creado. `precioPorNoche` es un parámetro aparte (no
// un campo de `extra`): Habitacion ya no tiene tarifaPorNoche, así que acá
// no hay ningún campo de la fila de donde leer el precio.
async function sembrarHabitacion(extra = {}, precioPorNoche = PRECIO_BASE_PRUEBA) {
  const fila = base._sembrarHabitacion(extra);
  await asegurarTarifaParaTipo(fila.tipoHabitacionId, precioPorNoche);
  return fila;
}

function hab(habitacionId, extra = {}) {
  return { habitacionId, adultos: 2, menores: 0, ...extra };
}
function habs(ids) {
  return ids.map((id) => hab(id));
}

async function esperaError(fn, textoEsperado) {
  try {
    await fn();
  } catch (err) {
    assert.ok(
      err.message.toLowerCase().includes(textoEsperado.toLowerCase()),
      `El error fue "${err.message}", se esperaba que mencionara "${textoEsperado}"`
    );
    return err;
  }
  throw new Error(`Se esperaba un error que mencionara "${textoEsperado}", pero no falló`);
}

// Crea una reserva de verdad (vía reservas.servicio.js, ya probado en
// pruebas-reservas.js) para usar como fixture en las pruebas de check-in.
// Etapa 4A — el total ya no lo inventa la prueba: sale de una cotización
// real contra el motor, mismo criterio que alta() en pruebas-reservas.js.
async function crearReservaFixture(extra = {}) {
  const { planBar } = await asegurarTemporadaYPlanBase();
  const fechaDesde = extra.fechaDesde ?? enDias(0);
  const fechaHasta = extra.fechaHasta ?? enDias(3);
  const habitaciones = extra.habitaciones ?? habs([1]);
  const planTarifarioId = extra.planTarifarioId ?? planBar.id;
  let totalEsperado = extra.totalEsperado;
  if (totalEsperado === undefined) {
    const cotizacion = await reservasServicio.cotizarParaReserva({ fechaDesde, fechaHasta, planTarifarioId, habitaciones, canal: "RECEPCION" });
    totalEsperado = cotizacion.planes[0]?.total ?? 0;
  }
  const reserva = await reservasServicio.crearReserva({
    fechaDesde,
    fechaHasta,
    habitaciones,
    planTarifarioId,
    totalEsperado,
    huesped: { ...HUESPED },
    ...extra,
  });
  return require("./_ocupantesFixture").completarFixture(reserva, habitaciones);
}

// Etapa 4A (ajuste A) — mismo criterio para el walk-in: planTarifarioId y
// totalEsperado a nivel reserva, habitaciones solo con ocupación.
async function walkInFixture(extra = {}) {
  const { planBar } = await asegurarTemporadaYPlanBase();
  const fechaDesde = enDias(0);
  const fechaHasta = extra.fechaHasta ?? enDias(2);
  const habitaciones = extra.habitaciones ?? habs([1]);
  const planTarifarioId = extra.planTarifarioId ?? planBar.id;
  let totalEsperado = extra.totalEsperado;
  if (totalEsperado === undefined) {
    const cotizacion = await reservasServicio.cotizarParaReserva({ fechaDesde, fechaHasta, planTarifarioId, habitaciones, canal: "RECEPCION" });
    totalEsperado = cotizacion.planes[0]?.total ?? 0;
  }
  return checkInServicio.registrarCheckInWalkIn({
    operador: "Prueba",
    personas: require("./_ocupantesFixture").personasFixture(
      habitaciones,
      extra.huesped || HUESPED,
      fechaDesde,
      fechaHasta,
    ),
    fechaHasta,
    habitaciones,
    planTarifarioId,
    totalEsperado,
    huesped: { ...HUESPED },
    ...extra,
  });
}

async function main() {
  seccion("HU-43 — Búsqueda y validación de vigencia");

  await prueba("encuentra una reserva vigente por código y habilita el check-in", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ codigo: reserva.codigoConfirmacion });
    assert.equal(resultado.puedeIniciarCheckIn, true);
    assert.equal(resultado.motivoBloqueo, null);
    assert.equal(resultado.reserva.id, reserva.id);
  });

  await prueba("encuentra una reserva vigente por el documento del huésped (no solo por código)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ codigo: reserva.huesped.numeroDocumento });
    assert.equal(resultado.reserva.id, reserva.id);
    assert.equal(resultado.puedeIniciarCheckIn, true);
  });

  await prueba("la búsqueda por documento no se limita al formato de DNI (pasaporte, por ejemplo)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture({
      huesped: {
        paisDocumento: "AR",
        fechaNacimiento: "1990-01-01",
        nombre: "John Smith",
        tipoDocumento: "Pasaporte",
        numeroDocumento: "AB1234567",
        contacto: "john@mail.com",
      },
    });
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ codigo: "AB1234567" });
    assert.equal(resultado.reserva.id, reserva.id);
  });

  await prueba("bloquea el check-in antes de la fecha de ingreso", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture({ fechaDesde: enDias(3), fechaHasta: enDias(6) });
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ id: reserva.id });
    assert.equal(resultado.puedeIniciarCheckIn, false);
    assert.ok(resultado.motivoBloqueo.includes("habilita a partir"));
  });

  await prueba("bloquea una reserva cancelada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: "Se arrepintió" });
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ id: reserva.id });
    assert.equal(resultado.puedeIniciarCheckIn, false);
    assert.ok(resultado.motivoBloqueo.includes("cancelada"));
  });

  await prueba("bloquea una reserva que ya tiene el check-in hecho", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await reservasServicio.marcarEnCurso(reserva.id);
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ id: reserva.id });
    assert.equal(resultado.puedeIniciarCheckIn, false);
    assert.ok(resultado.motivoBloqueo.includes("ya tiene el check-in"));
  });

  await prueba("falla con 404 si el código no existe", async () => {
    limpiar();
    const err = await esperaError(
      () => checkInServicio.buscarReservaParaCheckIn({ codigo: "ZZZZZZZZ" }),
      "No existe una reserva"
    );
    assert.equal(err.statusCode, 404);
  });

  seccion("HU-43 / HU-46 / HU-47 — Confirmar check-in de una reserva existente");

  await prueba("rechaza si el documento ingresado no coincide con el de la reserva", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "11111111",
          ...GARANTIA_OK,
        }),
      "no coincide"
    );
  });

  await prueba("acepta el documento sin importar mayúsculas ni espacios", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    const actualizada = await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "  30111222  ",
      ...GARANTIA_OK,
    });
    assert.equal(actualizada.estado, ESTADO_RESERVA.EN_CURSO);
  });

  await prueba("HU-46: no confirma sin marcar la garantía como validada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "30111222",
          garantiaConfirmada: false,
          medioGarantia: "Tarjeta crédito",
        }),
      "garantía"
    );
  });

  await prueba("HU-46: rechaza un medio de garantía fuera de la lista", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "30111222",
          garantiaConfirmada: true,
          medioGarantia: "Efectivo bajo la mesa",
        }),
      "medioGarantia"
    );
  });

  await prueba("HU-47: confirma el check-in y actualiza Reserva y Habitacion en la misma operación", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    const actualizada = await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      ...GARANTIA_OK,
    });
    assert.equal(actualizada.estado, ESTADO_RESERVA.EN_CURSO);
    assert.equal(base._datos.habitacion.find((h) => h.id === 1).estado, "ocupada");
  });

  await prueba("HU-47: una reserva grupal ocupa TODAS sus habitaciones a la vez", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    const reserva = await crearReservaFixture({ habitaciones: habs([1, 2]) });
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      ...GARANTIA_OK,
    });
    assert.equal(base._datos.habitacion.find((h) => h.id === 1).estado, "ocupada");
    assert.equal(base._datos.habitacion.find((h) => h.id === 2).estado, "ocupada");
  });

  seccion("HU-46 + garantía con tarjeta — la garantía del check-in es un monto FIJO y NO es un pago");

  const garantiaDe = (reservaId) => base._datos.garantiaEstadia.find((g) => g.reservaId === reservaId);
  const TARJETA = { titular: "ANA PEREZ", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2099, cvv: "123" };

  await prueba("Efectivo registra un DEPÓSITO por el monto fijo, NO un pago: no resta del saldo", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" }, 50000); // 3 noches = 150000
    const reserva = await crearReservaFixture();
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, totalPagado, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 0, "el depósito NO es un PagoEstadia: antes se registraba como pago y restaba del saldo");
    assert.equal(totalPagado, 0);
    assert.equal(saldo, 150000, "el saldo sigue completo: la garantía respalda, no se cobra");

    const g = garantiaDe(reserva.id);
    assert.equal(g.tipo, "DEPOSITO_EFECTIVO");
    assert.equal(Number(g.monto), 30000, "el monto es el fijo del hotel (MONTO_GARANTIA), no algo que mande el cliente");
    assert.equal(g.estado, "Pendiente");

    // Lo mismo mirado desde consolidarCargos (HU-48), que es lo que el check-out real consulta.
    const cuenta = await checkOutServicio.consolidarCargos(reserva.id);
    assert.equal(cuenta.totalPagado, 0);
    assert.equal(cuenta.saldo, 150000);
  });

  await prueba("Tarjeta de crédito nueva: PREAUTORIZA el monto fijo (no cobra) y nunca guarda el número ni el CVV", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" }, 50000);
    const reserva = await crearReservaFixture();
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Tarjeta crédito",
      garantiaTarjeta: TARJETA,
    });

    const { pagos, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 0, "una preautorización retiene, no cobra: no es un pago");
    assert.equal(saldo, 150000);
    const g = garantiaDe(reserva.id);
    assert.equal(g.tipo, "PREAUTORIZACION");
    assert.equal(Number(g.monto), 30000);
    assert.equal(g.ultimos4, "4242");
    assert.match(g.referencia, /^PRE-\d{6}$/);
    const guardado = JSON.stringify(base._datos.garantiaEstadia);
    assert.ok(!guardado.includes("4242424242424242") && !guardado.includes("cvv"), "ni el número completo ni el CVV se guardan");
  });

  await prueba("Tarjeta de crédito sin tarjeta guardada en la reserva ni tarjeta nueva: se rechaza", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "30111222",
          garantiaConfirmada: true,
          medioGarantia: "Tarjeta crédito",
        }),
      "no dejó una tarjeta en garantía"
    );
    assert.equal(base._datos.garantiaEstadia.length, 0, "no queda ninguna garantía a medio hacer");
  });

  await prueba("Tarjeta de débito no se preautoriza (el dinero sale de la cuenta del huésped)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "30111222",
          garantiaConfirmada: true,
          medioGarantia: "Tarjeta débito",
        }),
      "no se preautoriza"
    );
  });

  // Bug histórico (2026-09-25): al registrarse como pago, la garantía competía por saldo con la estadía y
  // el cobro fallaba si la estadía costaba menos que el monto fijo. Ahora no es un pago: no compite por nada.
  await prueba("la garantía se registra igual aunque la estadía cueste menos que el monto fijo (no compite con el saldo)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" }, 20000); // 1 noche = 20000 < 30000 de garantía
    const reserva = await crearReservaFixture({ fechaHasta: enDias(1) });
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 0);
    assert.equal(saldo, 20000, "el saldo es la estadía completa: la garantía no lo toca");
    assert.equal(Number(garantiaDe(reserva.id).monto), 30000);
  });

  await prueba("con un pago anticipado ya hecho, la garantía es independiente (un pago + una garantía)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" }, 20000); // 1 noche = 20000
    const reserva = await crearReservaFixture({ fechaHasta: enDias(1) });
    await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 4000 }], concepto: "Pago anticipado" });

    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, totalPagado, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 1, "solo el pago anticipado: la garantía vive en su propia tabla");
    assert.equal(totalPagado, 4000);
    assert.equal(saldo, 16000);
    assert.ok(garantiaDe(reserva.id));
  });

  await prueba("walk-in con depósito en efectivo registra la garantía (no un pago)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" }, 20000);
    const walkIn = await walkInFixture({
      fechaHasta: enDias(2),
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, totalPagado } = await pagoEstadiaServicio.listarPorReserva(walkIn.id);
    assert.equal(pagos.length, 0);
    assert.equal(totalPagado, 0);
    const g = garantiaDe(walkIn.id);
    assert.equal(g.tipo, "DEPOSITO_EFECTIVO");
    assert.equal(Number(g.monto), 30000);
  });

  await prueba("rechaza confirmar si la habitación ya no está libre (mantenimiento) y no deja nada a medio hacer", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const reserva = await crearReservaFixture();
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "30111222",
          ...GARANTIA_OK,
        }),
      "no está libre"
    );
    // La transacción se revirtió entera: la reserva NO quedó "En curso".
    assert.equal(base._datos.reserva.find((r) => r.id === reserva.id).estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("no permite confirmar el check-in dos veces", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      ...GARANTIA_OK,
    });
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "30111222",
          ...GARANTIA_OK,
        }),
      "ya tiene el check-in"
    );
  });

  seccion("HU-45 — Listado de habitaciones libres para asignación manual (walk-in)");

  await prueba("el resumenPorTipo cuenta 'libre ahora', no 'disponible por fecha' (encontrado probando el flujo real)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", tipo: "Doble", estado: "libre" });
    await sembrarHabitacion({ numero: "102", tipo: "Doble", estado: "mantenimiento" });
    const resultado = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2) });
    const doble = resultado.resumenPorTipo.find((r) => r.tipo === "Doble");
    assert.equal(doble.total, 2, "el total del universo sigue siendo 2 (eso no cambia)");
    assert.equal(doble.disponibles, 1, "disponibles tiene que coincidir con habitaciones.length, no con HU-38");
    assert.equal(resultado.habitaciones.length, 1);
  });

  await prueba("lista libres 'ahora' excluyendo una que está en mantenimiento, aunque no tenga reserva encimada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "libre" });
    await sembrarHabitacion({ numero: "102", estado: "mantenimiento" });
    const resultado = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2) });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].numero, "101");
  });

  await prueba("con entrada a futuro, Reservas NO excluye por estado físico (solo lo informa, HU-38)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const deReservas = await reservasServicio.consultarDisponibilidad({ fechaDesde: enDias(5), fechaHasta: enDias(7) });
    assert.equal(deReservas.habitaciones.length, 1, "una entrada a futuro sigue sin bloquearse por el estado de hoy");
    assert.equal(deReservas.habitaciones[0].estadoActual, "mantenimiento", "queda como dato informativo, no excluyente");
  });

  await prueba("con entrada HOY, Reservas y Check-in ya comparten el mismo criterio de 'libre ahora' (corrección posterior)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const deReservas = await reservasServicio.consultarDisponibilidad({ fechaDesde: enDias(0), fechaHasta: enDias(2) });
    assert.equal(deReservas.habitaciones.length, 0, "entrada hoy: Reservas también exige estado === 'libre'");
    const deCheckIn = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2) });
    assert.equal(deCheckIn.habitaciones.length, 0, "Check-in sigue exigiendo 'libre', ahora en paridad con Reservas");
  });

  await prueba("filtra por tipoHabitacionId y devuelve lista vacía si no hay ninguna disponible", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", tipo: "Doble" });
    const suite = base._resolverOCrearTipoHabitacion("Suite");
    const resultado = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2), tipoHabitacionId: suite.id });
    assert.equal(resultado.habitaciones.length, 0);
  });

  seccion("HU-44 — Check-in walk-in");

  await prueba("crea la reserva, la deja En curso y ocupa la habitación, todo en un paso", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await walkInFixture({
      fechaHasta: enDias(2),
      ...GARANTIA_OK,
    });
    assert.equal(reserva.estado, ESTADO_RESERVA.EN_CURSO);
    assert.equal(base._datos.habitacion.find((h) => h.id === 1).estado, "ocupada");
    assert.equal(base._datos.reserva.length, 1);
  });

  await prueba("la reserva walk-in arranca hoy mismo", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await walkInFixture({
      fechaHasta: enDias(1),
      ...GARANTIA_OK,
    });
    assert.equal(new Date(reserva.fechaDesde).toISOString().slice(0, 10), enDias(0));
  });

  await prueba("reusa la validación de Reservas: rechaza sin habitaciones con el mismo mensaje", async () => {
    limpiar();
    await esperaError(
      async () =>
        walkInFixture({
          fechaHasta: enDias(1),
          habitaciones: [],
          ...GARANTIA_OK,
        }),
      "al menos una habitación"
    );
  });

  await prueba("no confirma sin garantía, ni siquiera intenta crear la reserva", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(
      async () =>
        walkInFixture({
          fechaHasta: enDias(1),
          garantiaConfirmada: false,
          medioGarantia: "Tarjeta crédito",
        }),
      "garantía"
    );
    assert.equal(base._datos.reserva.length, 0);
  });

  await prueba("si la habitación elegida ya no está libre, no queda ni la reserva a medio crear", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "bloqueada" });
    await esperaError(
      async () =>
        walkInFixture({
          fechaHasta: enDias(1),
          ...GARANTIA_OK,
        }),
      "no está libre"
    );
    assert.equal(base._datos.reserva.length, 0, "la transacción tiene que revertir también la Reserva recién creada");
    assert.equal(base._datos.huesped.length, 0, "y también la ficha de huésped que se hubiera creado con ella");
  });

  await prueba("una reserva grupal walk-in ocupa todas las habitaciones elegidas", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await walkInFixture({
      fechaHasta: enDias(1),
      habitaciones: habs([1, 2]),
      ...GARANTIA_OK,
    });
    assert.equal(base._datos.habitacion.find((h) => h.id === 1).estado, "ocupada");
    assert.equal(base._datos.habitacion.find((h) => h.id === 2).estado, "ocupada");
  });

  // ------------------------------------------------------------
  console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
  if (fallaron.length > 0) {
    console.log("\nFallaron:");
    for (const f of fallaron) console.log(`  - ${f.nombre}: ${f.err.stack}`);
    process.exitCode = 1;
  }
}

main();
