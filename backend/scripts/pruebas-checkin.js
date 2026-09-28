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

const HUESPED = { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };
// Efectivo, sin referencia: el default más simple que pasa validarGarantia.
// El monto ya no lo manda el cliente — es fijo (MONTO_GARANTIA en
// checkIn.constantes.js), así que no hace falta pasarlo acá.
const GARANTIA_OK = { garantiaConfirmada: true, medioGarantia: "Efectivo" };

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
async function crearReservaFixture(extra = {}) {
  return reservasServicio.crearReserva({
    fechaDesde: enDias(0),
    fechaHasta: enDias(3),
    habitacionIds: [1],
    huesped: { ...HUESPED },
    ...extra,
  });
}

async function main() {
  seccion("HU-43 — Búsqueda y validación de vigencia");

  await prueba("encuentra una reserva vigente por código y habilita el check-in", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ codigo: reserva.codigoConfirmacion });
    assert.equal(resultado.puedeIniciarCheckIn, true);
    assert.equal(resultado.motivoBloqueo, null);
    assert.equal(resultado.reserva.id, reserva.id);
  });

  await prueba("encuentra una reserva vigente por el documento del huésped (no solo por código)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ codigo: reserva.huesped.numeroDocumento });
    assert.equal(resultado.reserva.id, reserva.id);
    assert.equal(resultado.puedeIniciarCheckIn, true);
  });

  await prueba("la búsqueda por documento no se limita al formato de DNI (pasaporte, por ejemplo)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture({
      huesped: { nombre: "John Smith", tipoDocumento: "Pasaporte", numeroDocumento: "AB1234567", contacto: "john@mail.com" },
    });
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ codigo: "AB1234567" });
    assert.equal(resultado.reserva.id, reserva.id);
  });

  await prueba("bloquea el check-in antes de la fecha de ingreso", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture({ fechaDesde: enDias(3), fechaHasta: enDias(6) });
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ id: reserva.id });
    assert.equal(resultado.puedeIniciarCheckIn, false);
    assert.ok(resultado.motivoBloqueo.includes("habilita a partir"));
  });

  await prueba("bloquea una reserva cancelada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await reservasServicio.cancelarReserva(reserva.id, { motivoCancelacion: "Se arrepintió" });
    const resultado = await checkInServicio.buscarReservaParaCheckIn({ id: reserva.id });
    assert.equal(resultado.puedeIniciarCheckIn, false);
    assert.ok(resultado.motivoBloqueo.includes("cancelada"));
  });

  await prueba("bloquea una reserva que ya tiene el check-in hecho", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
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
    base._sembrarHabitacion({ numero: "101" });
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
    base._sembrarHabitacion({ numero: "101" });
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
    base._sembrarHabitacion({ numero: "101" });
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
    base._sembrarHabitacion({ numero: "101" });
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
    base._sembrarHabitacion({ numero: "101" });
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
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    const reserva = await crearReservaFixture({ habitacionIds: [1, 2] });
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      ...GARANTIA_OK,
    });
    assert.equal(base._datos.habitacion.find((h) => h.id === 1).estado, "ocupada");
    assert.equal(base._datos.habitacion.find((h) => h.id === 2).estado, "ocupada");
  });

  seccion("HU-46 (corrección 2026-09-25) — la garantía es un monto FIJO (MONTO_GARANTIA), no el total de la habitación");

  await prueba("Efectivo registra un PagoEstadia real por el monto fijo, que se descuenta en el check-out", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 }); // 3 noches = 150000
    const reserva = await crearReservaFixture();
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, totalPagado, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 1, "el depósito quedó como un PagoEstadia real, no solo una casilla tildada");
    assert.equal(pagos[0].medios[0].medioPago, "Efectivo");
    assert.equal(Number(pagos[0].medios[0].importe), 30000, "el monto es el fijo del hotel (MONTO_GARANTIA), no algo que mande el cliente");
    assert.equal(pagos[0].concepto, "Garantía", "para distinguirlo de una seña o un pago final en Movimientos de Pago");
    assert.equal(totalPagado, 30000);
    assert.equal(saldo, 120000, "el check-out ya lo tiene que ver descontado del saldo (150000 - 30000)");

    // Y lo mismo mirado desde consolidarCargos (HU-48), que es lo que el
    // check-out real consulta.
    const cuenta = await checkOutServicio.consolidarCargos(reserva.id);
    assert.equal(cuenta.totalPagado, 30000);
    assert.equal(cuenta.saldo, 120000);
  });

  await prueba("Tarjeta crédito/débito también registra el monto fijo como PagoEstadia real, con su referencia", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 50000 }); // 3 noches = 150000
    const reserva = await crearReservaFixture();
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Tarjeta crédito",
      referenciaGarantia: "VISA •••• 4242 - AUT123456",
    });

    const { pagos, totalPagado, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 1, "antes la tarjeta no generaba ningún PagoEstadia — ahora sí, igual que la seña");
    assert.equal(pagos[0].medios[0].medioPago, "Tarjeta crédito");
    assert.equal(pagos[0].medios[0].referencia, "VISA •••• 4242 - AUT123456");
    assert.equal(Number(pagos[0].medios[0].importe), 30000);
    assert.equal(pagos[0].concepto, "Garantía");
    assert.equal(totalPagado, 30000);
    assert.equal(saldo, 120000);
  });

  await prueba("tarjeta (crédito o débito) sin la referencia de autorización no se puede confirmar", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await crearReservaFixture();
    await esperaError(
      () =>
        checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: "30111222",
          garantiaConfirmada: true,
          medioGarantia: "Tarjeta débito",
        }),
      "autorización de la tarjeta"
    );
  });

  // Este es el bug real reportado (2026-09-25): antes se autorizaba/cobraba
  // el TOTAL de la habitación como garantía — apenas la reserva ya tenía
  // una seña paga (HU-88), o la estadía costaba menos que ese total, crearPago
  // rechazaba el cobro porque "superaba el saldo pendiente". La garantía es
  // plata aparte del alojamiento, así que no tiene que competir por saldo
  // con nada — tiene que poder cobrarse SIEMPRE, exceda o no lo que queda
  // pendiente de la estadía.
  await prueba("la garantía se cobra igual aunque supere el saldo pendiente (estadía más barata que el monto fijo)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 20000 }); // 1 noche = 20000 < 30000 de garantía
    const reserva = await crearReservaFixture({ fechaHasta: enDias(1) });
    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, totalPagado, saldo } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 1, "antes esto tiraba \"el total a pagar supera el saldo pendiente\"");
    assert.equal(Number(pagos[0].medios[0].importe), 30000);
    assert.equal(totalPagado, 30000);
    assert.equal(saldo, 0, "el saldo nunca es negativo (Math.max(0, ...) en consolidarCargos)");
  });

  await prueba("la garantía se cobra igual con una seña ya pagada de antes (mismo bug, otro camino)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 20000 }); // 1 noche = 20000
    const reserva = await crearReservaFixture({ fechaHasta: enDias(1) });
    // Simula la seña (HU-88) que ya se cobró al reservar: 20% de 20000 = 4000.
    await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 4000 }], concepto: "Seña" });

    await checkInServicio.confirmarCheckInConReserva({
      reservaId: reserva.id,
      numeroDocumentoIngresado: "30111222",
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, totalPagado } = await pagoEstadiaServicio.listarPorReserva(reserva.id);
    assert.equal(pagos.length, 2, "seña + garantía, dos PagoEstadia distintos");
    assert.equal(totalPagado, 34000, "4000 de seña + 30000 de garantía");
  });

  await prueba("walk-in con garantía en efectivo también registra el monto fijo como PagoEstadia real", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 20000 });
    const walkIn = await checkInServicio.registrarCheckInWalkIn({
      fechaHasta: enDias(2),
      habitacionIds: [1],
      huesped: { ...HUESPED },
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    });

    const { pagos, totalPagado } = await pagoEstadiaServicio.listarPorReserva(walkIn.id);
    assert.equal(pagos.length, 1);
    assert.equal(totalPagado, 30000);
  });

  await prueba("rechaza confirmar si la habitación ya no está libre (mantenimiento) y no deja nada a medio hacer", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
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
    base._sembrarHabitacion({ numero: "101" });
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
    base._sembrarHabitacion({ numero: "101", tipo: "Doble", estado: "libre" });
    base._sembrarHabitacion({ numero: "102", tipo: "Doble", estado: "mantenimiento" });
    const resultado = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2) });
    const doble = resultado.resumenPorTipo.find((r) => r.tipo === "Doble");
    assert.equal(doble.total, 2, "el total del universo sigue siendo 2 (eso no cambia)");
    assert.equal(doble.disponibles, 1, "disponibles tiene que coincidir con habitaciones.length, no con HU-38");
    assert.equal(resultado.habitaciones.length, 1);
  });

  await prueba("lista libres 'ahora' excluyendo una que está en mantenimiento, aunque no tenga reserva encimada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "libre" });
    base._sembrarHabitacion({ numero: "102", estado: "mantenimiento" });
    const resultado = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2) });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].numero, "101");
  });

  await prueba("con entrada a futuro, Reservas NO excluye por estado físico (solo lo informa, HU-38)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const deReservas = await reservasServicio.consultarDisponibilidad({ fechaDesde: enDias(5), fechaHasta: enDias(7) });
    assert.equal(deReservas.habitaciones.length, 1, "una entrada a futuro sigue sin bloquearse por el estado de hoy");
    assert.equal(deReservas.habitaciones[0].estadoActual, "mantenimiento", "queda como dato informativo, no excluyente");
  });

  await prueba("con entrada HOY, Reservas y Check-in ya comparten el mismo criterio de 'libre ahora' (corrección posterior)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const deReservas = await reservasServicio.consultarDisponibilidad({ fechaDesde: enDias(0), fechaHasta: enDias(2) });
    assert.equal(deReservas.habitaciones.length, 0, "entrada hoy: Reservas también exige estado === 'libre'");
    const deCheckIn = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2) });
    assert.equal(deCheckIn.habitaciones.length, 0, "Check-in sigue exigiendo 'libre', ahora en paridad con Reservas");
  });

  await prueba("filtra por tipoHabitacionId y devuelve lista vacía si no hay ninguna disponible", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tipo: "Doble" });
    const suite = base._resolverOCrearTipoHabitacion("Suite");
    const resultado = await checkInServicio.listarHabitacionesLibresAhora({ fechaHasta: enDias(2), tipoHabitacionId: suite.id });
    assert.equal(resultado.habitaciones.length, 0);
  });

  seccion("HU-44 — Check-in walk-in");

  await prueba("crea la reserva, la deja En curso y ocupa la habitación, todo en un paso", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await checkInServicio.registrarCheckInWalkIn({
      fechaHasta: enDias(2),
      habitacionIds: [1],
      huesped: { ...HUESPED },
      ...GARANTIA_OK,
    });
    assert.equal(reserva.estado, ESTADO_RESERVA.EN_CURSO);
    assert.equal(base._datos.habitacion.find((h) => h.id === 1).estado, "ocupada");
    assert.equal(base._datos.reserva.length, 1);
  });

  await prueba("la reserva walk-in arranca hoy mismo", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await checkInServicio.registrarCheckInWalkIn({
      fechaHasta: enDias(1),
      habitacionIds: [1],
      huesped: { ...HUESPED },
      ...GARANTIA_OK,
    });
    assert.equal(new Date(reserva.fechaDesde).toISOString().slice(0, 10), enDias(0));
  });

  await prueba("reusa la validación de Reservas: rechaza sin habitaciones con el mismo mensaje", async () => {
    limpiar();
    await esperaError(
      () =>
        checkInServicio.registrarCheckInWalkIn({
          fechaHasta: enDias(1),
          habitacionIds: [],
          huesped: { ...HUESPED },
          ...GARANTIA_OK,
        }),
      "al menos una habitación"
    );
  });

  await prueba("no confirma sin garantía, ni siquiera intenta crear la reserva", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(
      () =>
        checkInServicio.registrarCheckInWalkIn({
          fechaHasta: enDias(1),
          habitacionIds: [1],
          huesped: { ...HUESPED },
          garantiaConfirmada: false,
          medioGarantia: "Tarjeta crédito",
        }),
      "garantía"
    );
    assert.equal(base._datos.reserva.length, 0);
  });

  await prueba("si la habitación elegida ya no está libre, no queda ni la reserva a medio crear", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "bloqueada" });
    await esperaError(
      () =>
        checkInServicio.registrarCheckInWalkIn({
          fechaHasta: enDias(1),
          habitacionIds: [1],
          huesped: { ...HUESPED },
          ...GARANTIA_OK,
        }),
      "no está libre"
    );
    assert.equal(base._datos.reserva.length, 0, "la transacción tiene que revertir también la Reserva recién creada");
    assert.equal(base._datos.huesped.length, 0, "y también la ficha de huésped que se hubiera creado con ella");
  });

  await prueba("una reserva grupal walk-in ocupa todas las habitaciones elegidas", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    await checkInServicio.registrarCheckInWalkIn({
      fechaHasta: enDias(1),
      habitacionIds: [1, 2],
      huesped: { ...HUESPED },
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
