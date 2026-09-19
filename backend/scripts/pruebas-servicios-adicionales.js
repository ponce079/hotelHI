// Pruebas de negocio del módulo Servicios Adicionales (HU-61 a HU-64).
//
// Corren SIN base de datos y sin red — mismo doble compartido que
// pruebas-checkin.js (ver _dobleSprint3.js). El caso de Minibar ejercita
// código real de movimientoSalida.servicio.js (Sprint 1, incluida la
// variante `registrarSalidaEnTransaccion` agregada en este mismo trabajo)
// para probar que el descuento de stock es real y atómico con el alta del
// consumo — no una simulación aparte.
//
//   node scripts/pruebas-servicios-adicionales.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const serviciosAdicionalesServicio = require("../src/modulos/servicios-adicionales/serviciosAdicionales.servicio");
const reservasServicio = require("../src/modulos/reservas/reservas.servicio");

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

const HUESPED = { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222" };

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

// Reserva "En curso" con una habitación — el estado en el que HU-61 permite
// cargar consumos. Reusa Reservas + marcarEnCurso, ya probados.
async function reservaEnCurso(habitacionId = 1) {
  const reserva = await reservasServicio.crearReserva({
    fechaDesde: enDias(0),
    fechaHasta: enDias(3),
    habitacionIds: [habitacionId],
    huesped: { ...HUESPED },
  });
  await reservasServicio.marcarEnCurso(reserva.id);
  return reserva;
}

async function main() {
  seccion("HU-61/62 — Registrar consumo (Restaurante/Spa/Lavandería, sin stock)");

  await prueba("registra un consumo de Restaurante con reserva En curso", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    const consumo = await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Restaurante",
      monto: 4500,
      registradoPor: "Mozo Juan",
    });
    assert.equal(consumo.tipoServicio, "Restaurante");
    assert.equal(consumo.monto, 4500);
    assert.ok(consumo.fechaHora instanceof Date);
  });

  await prueba("HU-62: guarda fechaHora, habitacionId y tipoServicio para trazabilidad", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    const consumo = await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Spa",
      monto: 8000,
      registradoPor: "Recepción",
    });
    assert.equal(consumo.habitacionId, 1);
    assert.ok(consumo.fechaHora);
  });

  await prueba("rechaza un tipoServicio fuera de la lista", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Karaoke",
          monto: 100,
          registradoPor: "X",
        }),
      "tipoServicio"
    );
  });

  await prueba("rechaza monto cero o negativo", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Lavandería",
          monto: 0,
          registradoPor: "X",
        }),
      "monto"
    );
  });

  await prueba("exige quién registra el consumo", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Restaurante",
          monto: 100,
          registradoPor: "  ",
        }),
      "registradoPor"
    );
  });

  await prueba("rechaza un consumo si la reserva todavía no hizo check-in (Confirmada)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(3),
      habitacionIds: [1],
      huesped: { ...HUESPED },
    });
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Restaurante",
          monto: 100,
          registradoPor: "X",
        }),
      'En curso'
    );
  });

  await prueba("rechaza un consumo si la reserva ya hizo check-out (Cerrada)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await reservasServicio.marcarCerrada(reserva.id);
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Restaurante",
          monto: 100,
          registradoPor: "X",
        }),
      'En curso'
    );
  });

  await prueba("rechaza si la habitación no pertenece a esta reserva", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "999" });
    const reserva = await reservaEnCurso(1);
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 2,
          tipoServicio: "Restaurante",
          monto: 100,
          registradoPor: "X",
        }),
      "no pertenece"
    );
  });

  await prueba("rechaza articuloId/cantidad si el tipo no es Minibar", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Restaurante",
          monto: 100,
          registradoPor: "X",
          articuloId: 1,
        }),
      "solo aplican"
    );
  });

  seccion("HU-61/HU-64 — Minibar: descuento real de stock (Sprint 1), atómico");

  await prueba("registra el consumo Y descuenta stock real en la misma operación", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Bar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo({ nombre: "Vino Malbec" });
    base._habilitarConStock({ articuloId: articulo.id, depositoId: deposito.id, stockActual: 10 });
    const reserva = await reservaEnCurso();

    const consumo = await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Minibar",
      articuloId: articulo.id,
      cantidad: 2,
      depositoId: deposito.id,
      monto: 6000,
      registradoPor: "Housekeeping",
    });

    assert.equal(consumo.cantidad, 2);
    assert.equal(consumo.articuloNombre, "Vino Malbec");
    const stock = base._datos.articuloDepositoStock.find((s) => s.articuloDepositoId === 1);
    assert.equal(stock.stockActual, 8, "el stock real tiene que bajar de 10 a 8");
    assert.equal(base._datos.movimientoStock.length, 1, "tiene que quedar un MovimientoStock de Salida real");
  });

  await prueba("usa el tipo de movimiento 'Salida por Consumo Interno' sin que el usuario tenga que elegirlo", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Bar" });
    // Dos tipos activos: uno de Entrada (no debería usarse nunca) y el de
    // Salida por Consumo Interno — confirma que resuelve el correcto por
    // nombre, no "cualquiera".
    base._sembrarTipoMovimiento({ descripcion: "Entrada por Compra", tipo: "E" });
    const salida = base._sembrarTipoMovimiento({ descripcion: "Salida por Consumo Interno" });
    const articulo = base._sembrarArticulo();
    base._habilitarConStock({ articuloId: articulo.id, depositoId: deposito.id, stockActual: 5 });
    const reserva = await reservaEnCurso();

    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Minibar",
      articuloId: articulo.id,
      cantidad: 1,
      depositoId: deposito.id,
      monto: 3000,
      registradoPor: "X",
    });
    assert.equal(base._datos.movimientoStock[0].tipoMovStockId, salida.id);
  });

  await prueba("no reimplementa las validaciones de Salida: rechaza un artículo no habilitado en ese depósito", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Bar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo(); // nunca habilitado en el depósito
    const reserva = await reservaEnCurso();

    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Minibar",
          articuloId: articulo.id,
          cantidad: 1,
          depositoId: deposito.id,
          monto: 1000,
          registradoPor: "X",
        }),
      "no están habilitados"
    );
  });

  await prueba("rechaza consumir más de lo que hay en stock, y no deja el consumo cargado a medias", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Bar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo();
    base._habilitarConStock({ articuloId: articulo.id, depositoId: deposito.id, stockActual: 1 });
    const reserva = await reservaEnCurso();

    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Minibar",
          articuloId: articulo.id,
          cantidad: 5,
          depositoId: deposito.id,
          monto: 1000,
          registradoPor: "X",
        }),
      "Stock insuficiente"
    );
    // Atomicidad (HU-61, sección 5 del documento de referencia): si no se
    // pudo descontar el stock, el ConsumoServicioAdicional TAMPOCO queda.
    assert.equal(base._datos.consumoServicioAdicional.length, 0);
    assert.equal(base._datos.movimientoStock.length, 0);
    assert.equal(base._datos.articuloDepositoStock.find((s) => s.articuloDepositoId === 1).stockActual, 1);
  });

  await prueba("exige articuloId y cantidad cuando el tipo es Minibar", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Minibar",
          monto: 1000,
          registradoPor: "X",
          depositoId: 1,
        }),
      "articuloId"
    );
  });

  await prueba("no descuenta stock de un artículo dado de baja", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Bar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo({ activo: false });
    base._habilitarConStock({ articuloId: articulo.id, depositoId: deposito.id, stockActual: 10 });
    const reserva = await reservaEnCurso();

    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Minibar",
          articuloId: articulo.id,
          cantidad: 1,
          depositoId: deposito.id,
          monto: 1000,
          registradoPor: "X",
        }),
      "dados de baja"
    );
  });

  seccion("HU-63 — Consulta de cargos acumulados");

  await prueba("lista los consumos de una reserva ordenados del más reciente al más viejo", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Restaurante",
      monto: 1000,
      registradoPor: "X",
    });
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Spa",
      monto: 2000,
      registradoPor: "X",
    });
    const items = await serviciosAdicionalesServicio.listarPorReserva(reserva.id);
    assert.equal(items.length, 2);
    assert.equal(items[0].tipoServicio, "Spa"); // el último cargado, primero
  });

  await prueba("filtra por tipoServicio (para HU-87 de Integrante 4: minibar no registrado)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Bar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo();
    base._habilitarConStock({ articuloId: articulo.id, depositoId: deposito.id, stockActual: 10 });
    const reserva = await reservaEnCurso();
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Restaurante",
      monto: 1000,
      registradoPor: "X",
    });
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Minibar",
      articuloId: articulo.id,
      cantidad: 1,
      depositoId: deposito.id,
      monto: 3000,
      registradoPor: "X",
    });
    const soloMinibar = await serviciosAdicionalesServicio.listarPorReserva(reserva.id, { tipoServicio: "Minibar" });
    assert.equal(soloMinibar.length, 1);
    assert.equal(soloMinibar[0].tipoServicio, "Minibar");
  });

  await prueba("el contrato con Integrante 4 (HU-48) trae los campos documentados", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Restaurante",
      monto: 1000,
      registradoPor: "X",
    });
    const [item] = await serviciosAdicionalesServicio.listarPorReserva(reserva.id);
    for (const campo of ["id", "tipoServicio", "monto", "fechaHora"]) {
      assert.ok(campo in item, `Falta el campo "${campo}" del contrato con Integrante 4`);
    }
  });

  await prueba("HU-63: el resumen totaliza por tipo y en general", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Restaurante",
      monto: 1000,
      registradoPor: "X",
    });
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Restaurante",
      monto: 500,
      registradoPor: "X",
    });
    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Spa",
      monto: 2000,
      registradoPor: "X",
    });
    const resumen = await serviciosAdicionalesServicio.resumenPorReserva(reserva.id);
    assert.equal(resumen.totalGeneral, 3500);
    const restaurante = resumen.totalPorTipo.find((t) => t.tipoServicio === "Restaurante");
    assert.equal(restaurante.total, 1500);
    assert.equal(restaurante.cantidad, 2);
    const minibar = resumen.totalPorTipo.find((t) => t.tipoServicio === "Minibar");
    assert.equal(minibar.total, 0);
    assert.equal(minibar.cantidad, 0);
  });

  await prueba("una reserva sin consumos da un resumen en cero, no un error", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    const resumen = await serviciosAdicionalesServicio.resumenPorReserva(reserva.id);
    assert.equal(resumen.totalGeneral, 0);
    assert.equal(resumen.items.length, 0);
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
