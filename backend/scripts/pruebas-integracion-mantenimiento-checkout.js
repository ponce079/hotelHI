// Pruebas de integración del camino cruzado check-in → orden de
// mantenimiento → check-out → resolver — cubre el fix que trajo la rama
// feature/checkout-facturacion (PR #34, commit e867c28) en
// checkOut.servicio.js:confirmarCheckOut para no dejar una habitación
// "trabada" en 'ocupada' cuando el check-out se completa con una orden de
// mantenimiento todavía sin resolver.
//
// El problema original (antes del fix): si a mitad de la estadía se cargaba
// una orden de mantenimiento, la habitación quedaba en 'mantenimiento' con
// estadoAnterior = 'ocupada'. Si el check-out no tocaba ese campo, al
// resolverse la orden más tarde resolverOrdenMantenimiento restauraba la
// habitación a 'ocupada' — con el huésped ya afuera, y desde 'ocupada' no
// hay transición manual de salida (ver pruebas-habitaciones.js), así que
// quedaba trabada para siempre.
//
// El fix (verificado acá): el check-out NO rechaza ni bloquea por la orden
// abierta — el huésped ya pagó y se va, el arreglo pendiente no depende de
// él. Pero si la habitación sigue en 'mantenimiento' al momento del
// check-out, reescribe estadoAnterior a 'en limpieza' (en vez de dejarlo en
// 'ocupada'), para que al resolver la orden más tarde la habitación caiga
// en 'en limpieza' y no en 'ocupada'.
//
// No es una prueba de facturación (HU-48 a 50, ya cubierta por otros
// caminos): las habitaciones se siembran con la Tarifa a $0 a propósito,
// así el saldo da 0 sin tener que simular un PagoEstadia real — el foco acá
// es exclusivamente la interacción Habitacion.estado/estadoAnterior entre
// Check-in, Habitaciones y Check-out.
//
// Corre SIN base de datos y sin red — mismo doble en memoria que
// pruebas-checkin.js / pruebas-habitaciones.js (_dobleSprint3.js, con
// cargoVerificacionCheckout/pagoEstadia/pagoEstadiaMedio sumadas ahí para
// que consolidarCargos no falle al leerlas — quedan vacías en estas
// pruebas, ver más arriba).
//
//   node scripts/pruebas-integracion-mantenimiento-checkout.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const checkInServicio = require("../src/modulos/check-in/checkIn.servicio");
const reservasServicio = require("../src/modulos/reservas/reservas.servicio");
const habitacionesServicio = require("../src/modulos/habitaciones/habitaciones.servicio");
const checkOutServicio = require("../src/modulos/check-out/checkOut.servicio");

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

// Mismo criterio de fecha que pruebas-checkin.js: "hoy" en hora argentina.
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
const GARANTIA_OK = { garantiaConfirmada: true, medioGarantia: "Tarjeta crédito", referenciaGarantia: "PRUEBA-LOCAL" };

// Etapa 4A — crearReserva ahora pasa por el motor de cotización: hace falta
// una temporada Base + un plan BAR + una Tarifa vigente por tipo, aunque
// sea a precio 0 (ver nota de arriba: acá no importa la plata).
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

async function asegurarTarifaParaTipo(tipoHabitacionId, precioPorNoche) {
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

// Deja una reserva "En curso" con la habitación "ocupada" — mismo camino
// real que HU-43/47 (reservasServicio.crearReserva + confirmarCheckInConReserva
// de checkIn.servicio.js, ya probados en pruebas-checkin.js). Tarifa en 0
// (ver nota de arriba) para que el check-out nunca se frene por saldo.
//
// También registra la verificación "sin novedades" (HU-87): desde la
// re-auditoría del 2026-09-21, confirmarCheckOut la exige — sin esto,
// las 6 pruebas de este archivo (que no son sobre HU-87, son sobre el
// estado de la habitación) fallarían por un motivo que no les compete.
async function crearReservaEnCurso(numeroHabitacion) {
  const habitacion = base._sembrarHabitacion({ numero: numeroHabitacion });
  await asegurarTarifaParaTipo(habitacion.tipoHabitacionId, 0);
  const { planBar } = await asegurarTemporadaYPlanBase();
  const fechaDesde = enDias(0);
  const fechaHasta = enDias(2);
  const habitaciones = [{ habitacionId: habitacion.id, adultos: 2, menores: 0 }];
  const reserva = await reservasServicio.crearReserva({
    fechaDesde,
    fechaHasta,
    habitaciones,
    planTarifarioId: planBar.id,
    totalEsperado: 0,
    huesped: { ...HUESPED },
  });
  await require("./_ocupantesFixture").completarFixture(reserva, habitaciones);
  await checkInServicio.confirmarCheckInConReserva({
    reservaId: reserva.id,
    numeroDocumentoIngresado: HUESPED.numeroDocumento,
    ...GARANTIA_OK,
  });
  await checkOutServicio.registrarVerificacion(reserva.id, { tipo: "SinNovedades", registradoPor: "Ana" });
  return { habitacion, reserva };
}

function habitacionActual(id) {
  return base._datos.habitacion.find((h) => h.id === id);
}

async function main() {
  seccion('Caso 1 — check-out con una orden de mantenimiento SIN resolver (el bug que motivó el fix de Ricardo)');

  await prueba("el check-out se completa igual — NO se rechaza por la orden abierta", async () => {
    limpiar();
    const { habitacion, reserva } = await crearReservaEnCurso("301");
    await habitacionesServicio.crearOrdenMantenimiento(habitacion.id, {
      tipoTarea: "Correctivo",
      responsable: "Housekeeping",
      urgente: true,
    });
    assert.equal(habitacionActual(habitacion.id).estado, "mantenimiento", "sanity check antes del check-out");

    const resultado = await checkOutServicio.confirmarCheckOut(reserva.id, { cargosValidados: true });

    assert.equal(resultado.estadoReserva, "Cerrada");
  });

  await prueba('la habitación queda en "mantenimiento" (NO pasa a "en limpieza" con la orden todavía abierta)', async () => {
    limpiar();
    const { habitacion, reserva } = await crearReservaEnCurso("301");
    await habitacionesServicio.crearOrdenMantenimiento(habitacion.id, { tipoTarea: "Correctivo", responsable: "Housekeeping" });

    await checkOutServicio.confirmarCheckOut(reserva.id, { cargosValidados: true });

    assert.equal(habitacionActual(habitacion.id).estado, "mantenimiento");
  });

  await prueba('estadoAnterior queda reescrito a "en limpieza" (no se deja en el "ocupada" original)', async () => {
    limpiar();
    const { habitacion, reserva } = await crearReservaEnCurso("301");
    await habitacionesServicio.crearOrdenMantenimiento(habitacion.id, { tipoTarea: "Correctivo", responsable: "Housekeeping" });
    assert.equal(habitacionActual(habitacion.id).estadoAnterior, "ocupada", "sanity check: así queda apenas se crea la orden");

    await checkOutServicio.confirmarCheckOut(reserva.id, { cargosValidados: true });

    assert.equal(habitacionActual(habitacion.id).estadoAnterior, "en limpieza");
  });

  await prueba('al resolver la orden DESPUÉS del check-out, la habitación pasa a "en limpieza" (no vuelve a "ocupada")', async () => {
    limpiar();
    const { habitacion, reserva } = await crearReservaEnCurso("301");
    const orden = await habitacionesServicio.crearOrdenMantenimiento(habitacion.id, {
      tipoTarea: "Correctivo",
      responsable: "Housekeeping",
    });
    await checkOutServicio.confirmarCheckOut(reserva.id, { cargosValidados: true });

    await habitacionesServicio.resolverOrdenMantenimiento(orden.id, "Ana");

    assert.equal(habitacionActual(habitacion.id).estado, "en limpieza");
    assert.equal(habitacionActual(habitacion.id).estadoAnterior, null);
  });

  seccion("Caso 2 — la orden de mantenimiento se resuelve ANTES del check-out");

  await prueba('la habitación vuelve a "ocupada" al resolver, y el check-out la deja "en limpieza" con normalidad', async () => {
    limpiar();
    const { habitacion, reserva } = await crearReservaEnCurso("301");
    const orden = await habitacionesServicio.crearOrdenMantenimiento(habitacion.id, {
      tipoTarea: "Correctivo",
      responsable: "Housekeeping",
    });

    await habitacionesServicio.resolverOrdenMantenimiento(orden.id, "Ana");
    assert.equal(habitacionActual(habitacion.id).estado, "ocupada", "sanity check: resuelta antes del check-out, vuelve a ocupada");

    const resultado = await checkOutServicio.confirmarCheckOut(reserva.id, { cargosValidados: true });

    assert.equal(resultado.estadoReserva, "Cerrada");
    assert.equal(habitacionActual(habitacion.id).estado, "en limpieza");
  });

  seccion("Caso 3 — control: check-in → check-out directo, sin mantenimiento de por medio (nada se rompió)");

  await prueba('la habitación pasa de "ocupada" a "en limpieza" y la reserva queda "Cerrada", igual que siempre', async () => {
    limpiar();
    const { habitacion, reserva } = await crearReservaEnCurso("301");

    const resultado = await checkOutServicio.confirmarCheckOut(reserva.id, { cargosValidados: true });

    assert.equal(resultado.estadoReserva, "Cerrada");
    assert.equal(habitacionActual(habitacion.id).estado, "en limpieza");
    assert.equal(habitacionActual(habitacion.id).estadoAnterior, null);
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
