// Pruebas de negocio de la seña de reserva (HU-88, extensión de HU-36/HU-42)
// y de la política de cancelación atada a ella (ajuste a HU-37,
// cancelarReserva) — sumadas junto con el cierre del gap de garantía en
// efectivo de HU-46 (ver pruebas-checkin.js para ese último).
//
// Corren SIN base de datos y sin red — mismo doble compartido que
// pruebas-checkin.js / pruebas-checkout-facturacion.js (_dobleSprint3.js):
// hace falta el universo completo de Reservas + Pagos de estadía + Check-out
// para poder ejercitar crearPago/anularPago/consolidarCargos de verdad, no
// mockeados (el doble propio y autocontenido de pruebas-reservas.js no
// modela pagoEstadia a propósito, ver el comentario en ese archivo).
//
// La seña en sí (item 1, HU-36) NO agrega código nuevo al backend: el
// frontend simplemente encadena crearReserva + crearPago, dos endpoints que
// ya existen y ya se prueban por separado. Lo que sí se prueba acá es la
// INTEGRACIÓN (que un pago cargado apenas se crea la reserva se vea
// reflejado correctamente en consolidarCargos/calcularSaldoReserva) y la
// política de cancelación nueva (que si cancela, se anula sola).
//
//   node scripts/pruebas-senia-reserva.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const reservasServicio = require("../src/modulos/reservas/reservas.servicio");
const checkInServicio = require("../src/modulos/check-in/checkIn.servicio");
const checkOutServicio = require("../src/modulos/check-out/checkOut.servicio");
const pagoEstadiaServicio = require("../src/modulos/pagos-estadia/pagoEstadia.servicio");
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

const HUESPED = { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };

// Mismo 20% que va a usar ReservaWizard.jsx (PORCENTAJE_SEÑA en
// reservas.constantes.js, frontend) — el backend no lo valida como una regla
// propia (ver decisión documentada ahí: la exigencia del 20% vive en la UI,
// crearPago solo exige no superar el saldo real), así que acá se calcula
// igual que lo haría el wizard, no como una regla nueva del servicio.
function calcularSenia(total) {
  return Number((total * 0.2).toFixed(2));
}

// Mismo concepto que va a mandar ReservaWizard.jsx al cobrar la seña —
// centralizado acá para no repetir `concepto: "Seña"` en cada prueba.
function pagarSenia(reservaId, monto) {
  return pagoEstadiaServicio.crearPago({
    reservaId,
    medios: [{ tipo: "Efectivo", importe: monto }],
    concepto: "Seña",
  });
}

async function main() {
  seccion("HU-36/88 — Seña al confirmar una reserva nueva");

  await prueba("cobra la seña (20%) contra la reserva recién creada y queda reflejada en el saldo", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(13), // 3 noches = 150000
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    assert.equal(reserva.estado, ESTADO_RESERVA.CONFIRMADA);
    const senia = calcularSenia(reserva.totalEstimadoAlojamiento);
    assert.equal(senia, 30000);

    const pago = await pagarSenia(reserva.id, senia);
    assert.equal(pago.estado, "Parcial", "20% de seña no salda la cuenta completa");
    assert.equal(pago.concepto, "Seña", "para que Movimientos de Pago (HU-88) la distinga de una garantía o un pago final");

    const { totalPagado, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(totalPagado, 30000);
    assert.equal(saldo, 120000);
  });

  await prueba("la seña queda correctamente descontada al llegar al check-out (consolidarCargos)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(3), // 3 noches = 150000
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    const senia = calcularSenia(reserva.totalEstimadoAlojamiento);
    await pagarSenia(reserva.id, senia);

    // El huésped llega, hace check-in normalmente — la seña ya cobrada sigue
    // contando en la cuenta consolidada sin que nadie tenga que volver a
    // cargarla.
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Tarjeta de crédito",
    });

    const cuenta = await checkOutServicio.consolidarCargos(reserva.id);
    assert.equal(cuenta.totalAdeudado, 150000);
    assert.equal(cuenta.totalPagado, 30000);
    assert.equal(cuenta.saldo, 120000, "el check-out tiene que ver la seña ya descontada, no cobrar el total de nuevo");
  });

  seccion("HU-37 (ajuste) — política de cancelación atada a la seña");

  await prueba("cancelar con 24hs o más de anticipación anula la seña automáticamente", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(13),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    const pago = await pagarSenia(reserva.id, calcularSenia(reserva.totalEstimadoAlojamiento));

    const cancelada = await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: "El huésped se arrepintió" });
    assert.equal(cancelada.estado, ESTADO_RESERVA.CANCELADA);

    const pagoActualizado = await pagoEstadiaServicio.obtenerPago(pago.id);
    assert.equal(pagoActualizado.anulado, true);
    assert.equal(pagoActualizado.motivoAnulacion, "Cancelación con anticipación (24hs+)");
  });

  await prueba("cancelar con menos de 24hs de anticipación NO anula la seña", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 });
    // fechaDesde = hoy: a esta hora del día, siempre quedan menos de 24hs
    // de anticipación real respecto al momento de cancelar.
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(3),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    const pago = await pagarSenia(reserva.id, calcularSenia(reserva.totalEstimadoAlojamiento));

    await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: "Cambio de planes de último momento" });

    const pagoActualizado = await pagoEstadiaServicio.obtenerPago(pago.id);
    assert.equal(pagoActualizado.anulado, false, "con menos de 24hs la seña queda como está, no se toca");
  });

  await prueba("no-show (fecha de ingreso ya pasada, nunca hubo check-in) NO anula la seña al cancelar", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(3),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    const pago = await pagarSenia(reserva.id, calcularSenia(reserva.totalEstimadoAlojamiento));
    // Simula que pasaron varios días sin que nadie se presentara a hacer
    // check-in: la reserva sigue "Confirmada" (nada la mueve sola), pero su
    // fechaDesde ya quedó en el pasado.
    base._datos.reserva.find((r) => r.id === reserva.id).fechaDesde = new Date(`${enDias(-3)}T00:00:00.000Z`);

    await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: "No-show, se cancela de oficio" });

    const pagoActualizado = await pagoEstadiaServicio.obtenerPago(pago.id);
    assert.equal(pagoActualizado.anulado, false);
  });

  await prueba("cancelar una reserva sin ninguna seña pagada no rompe nada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    const cancelada = await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    assert.equal(cancelada.estado, ESTADO_RESERVA.CANCELADA);
  });

  seccion("HU-88 — Movimientos de Pago (listado global)");

  await prueba("lista pagos de todas las reservas, con reserva y huésped incluidos", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 });
    base._sembrarHabitacion({ numero: "102", tarifaPorNoche: 30000 });
    const reservaA = await reservasServicio.crearReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    const reservaB = await reservasServicio.crearReserva({
      fechaDesde: enDias(5),
      fechaHasta: enDias(7),
      habitacionIds: [2],
      huesped: { ...HUESPED, nombre: "Julia Paz", numeroDocumento: "40222333" },
    });
    await pagarSenia(reservaA.id, calcularSenia(reservaA.totalEstimadoAlojamiento));
    await pagoEstadiaServicio.crearPago({
      reservaId: reservaB.id,
      medios: [{ tipo: "Efectivo", importe: 15000 }],
      concepto: "Garantía",
    });

    const movimientos = await pagoEstadiaServicio.listarMovimientos();
    assert.equal(movimientos.length, 2);
    const deA = movimientos.find((m) => m.reservaId === reservaA.id);
    assert.equal(deA.concepto, "Seña");
    assert.equal(deA.reserva.codigoConfirmacion, reservaA.codigoConfirmacion);
    assert.equal(deA.reserva.huesped.nombre, "Ana Pérez");
    const deB = movimientos.find((m) => m.reservaId === reservaB.id);
    assert.equal(deB.concepto, "Garantía");
    assert.equal(deB.reserva.huesped.nombre, "Julia Paz");
  });

  await prueba("filtra por concepto", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    await pagarSenia(reserva.id, calcularSenia(reserva.totalEstimadoAlojamiento));
    await pagoEstadiaServicio.crearPago({
      reservaId: reserva.id,
      medios: [{ tipo: "Tarjeta crédito", importe: 10000, referencia: "Visa ****4242 · aut. 123456" }],
      concepto: "Pago final",
    });

    const soloSenia = await pagoEstadiaServicio.listarMovimientos({ concepto: "Seña" });
    assert.equal(soloSenia.length, 1);
    assert.equal(soloSenia[0].concepto, "Seña");

    const soloPagoFinal = await pagoEstadiaServicio.listarMovimientos({ concepto: "Pago final" });
    assert.equal(soloPagoFinal.length, 1);
    assert.equal(soloPagoFinal[0].concepto, "Pago final");
  });

  await prueba("busca por código de reserva o nombre del huésped", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    const reservaA = await reservasServicio.crearReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    const reservaB = await reservasServicio.crearReserva({
      fechaDesde: enDias(5),
      fechaHasta: enDias(7),
      habitacionIds: [2],
      huesped: { ...HUESPED, nombre: "Julia Paz", numeroDocumento: "40222333" },
    });
    await pagarSenia(reservaA.id, calcularSenia(reservaA.totalEstimadoAlojamiento));
    await pagarSenia(reservaB.id, calcularSenia(reservaB.totalEstimadoAlojamiento));

    const porNombre = await pagoEstadiaServicio.listarMovimientos({ q: "Julia" });
    assert.equal(porNombre.length, 1);
    assert.equal(porNombre[0].reservaId, reservaB.id);

    const porCodigo = await pagoEstadiaServicio.listarMovimientos({ q: reservaA.codigoConfirmacion });
    assert.equal(porCodigo.length, 1);
    assert.equal(porCodigo[0].reservaId, reservaA.id);
  });

  await prueba("rechaza un concepto de filtro inválido", async () => {
    limpiar();
    await esperaError(() => pagoEstadiaServicio.listarMovimientos({ concepto: "Propina" }), "concepto inválido");
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
