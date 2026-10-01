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

const HUESPED = { fechaNacimiento:"1990-01-01", nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };

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

// Etapa 4A — crearReserva ahora pasa por el motor de cotización: hace falta
// una temporada Base + un plan BAR + una Tarifa vigente por tipo. Esta suite
// no ejercita montos de alojamiento (solo consumos), así que el precio
// exacto no importa — cualquier valor fijo alcanza.
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

async function asegurarTarifaParaTipo(tipoHabitacionId) {
  const { temporadaBase } = await asegurarTemporadaYPlanBase();
  const yaTiene = base._datos.tarifa.some((t) => t.tipoHabitacionId === tipoHabitacionId && t.temporadaId === temporadaBase.id);
  if (!yaTiene) {
    await base.tarifa.create({
      data: {
        tipoHabitacionId,
        temporadaId: temporadaBase.id,
        precioBase: 50000,
        adicionalAdultoExtra: 0,
        vigenteDesde: new Date(`${enDias(-365)}T00:00:00.000Z`),
      },
    });
  }
}

async function sembrarHabitacion(extra = {}) {
  const fila = base._sembrarHabitacion(extra);
  await asegurarTarifaParaTipo(fila.tipoHabitacionId);
  return fila;
}

// Reserva "En curso" con una habitación — el estado en el que HU-61 permite
// cargar consumos. Reusa Reservas + marcarEnCurso, ya probados.
async function reservaEnCurso(habitacionId = 1) {
  const { planBar } = await asegurarTemporadaYPlanBase();
  const fechaDesde = enDias(0);
  const fechaHasta = enDias(3);
  const habitaciones = [{ habitacionId, adultos: 2, menores: 0 }];
  const cotizacion = await reservasServicio.cotizarParaReserva({
    fechaDesde,
    fechaHasta,
    planTarifarioId: planBar.id,
    habitaciones,
    canal: "RECEPCION",
  });
  const reserva = await reservasServicio.crearReserva({
    fechaDesde,
    fechaHasta,
    habitaciones,
    planTarifarioId: planBar.id,
    totalEsperado: cotizacion.planes[0]?.total ?? 0,
    huesped: { ...HUESPED },
  });
  await reservasServicio.marcarEnCurso(reserva.id);
  return reserva;
}

async function main() {
  seccion("HU-61/62 — Registrar consumo (Restaurante/Spa/Lavandería, sin stock)");

  await prueba("registra un consumo de Restaurante con reserva En curso", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
    const { planBar } = await asegurarTemporadaYPlanBase();
    const habitaciones = [{ habitacionId: 1, adultos: 2, menores: 0 }];
    const cotizacion = await reservasServicio.cotizarParaReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(3),
      planTarifarioId: planBar.id,
      habitaciones,
      canal: "RECEPCION",
    });
    const reserva = await reservasServicio.crearReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(3),
      habitaciones,
      planTarifarioId: planBar.id,
      totalEsperado: cotizacion.planes[0]?.total ?? 0,
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
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "999" });
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
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Minibar" });
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
      monto: 6000,
      registradoPor: "Housekeeping",
    });

    assert.equal(consumo.cantidad, 2);
    assert.equal(consumo.articuloNombre, "Vino Malbec");
    const stock = base._datos.articuloDepositoStock.find((s) => s.articuloDepositoId === 1);
    assert.equal(stock.stockActual, 8, "el stock real tiene que bajar de 10 a 8");
    assert.equal(base._datos.movimientoStock.length, 1, "tiene que quedar un MovimientoStock de Salida real");
    assert.ok(consumo.movimientoStockId, "el consumo tiene que quedar asociado al MovimientoStock que generó");
    assert.equal(consumo.movimientoStockId, base._datos.movimientoStock[0].id);
  });

  await prueba("un consumo que no es Minibar no queda asociado a ningún MovimientoStock", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    const consumo = await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Restaurante",
      monto: 1000,
      registradoPor: "X",
    });
    assert.equal(consumo.movimientoStockId, null);
  });

  await prueba("el movimientoStockId identifica el depósito real, aunque el artículo esté habilitado en más de uno a la vez (el bug encontrado auditando a mano)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const bar = base._sembrarDeposito({ nombre: "Bar" });
    const minibar = base._sembrarDeposito({ nombre: "Minibar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo({ nombre: "Vino Malbec" });
    // Mismo artículo habilitado en DOS depósitos distintos a la vez — la
    // situación real que hizo imposible saber, sin este campo, de cuál de
    // los dos salió el descuento de un consumo puntual.
    base._habilitarConStock({ articuloId: articulo.id, depositoId: bar.id, stockActual: 5 });
    base._habilitarConStock({ articuloId: articulo.id, depositoId: minibar.id, stockActual: 10 });
    const reserva = await reservaEnCurso();

    const consumo = await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Minibar",
      articuloId: articulo.id,
      cantidad: 2,
      monto: 6000,
      registradoPor: "X",
    });

    const movimiento = base._datos.movimientoStock.find((m) => m.id === consumo.movimientoStockId);
    assert.ok(movimiento, "el consumo tiene que apuntar a un MovimientoStock real");
    assert.equal(movimiento.depositoId, minibar.id, "tiene que ser el depósito fijo Minibar, no Bar");
    // Y el stock de Bar, que también tenía el mismo artículo habilitado, no
    // se tiene que haber tocado — la ambigüedad que causaba el bug (Sprint
    // 3: ahora ni siquiera se elige a mano, así que tampoco puede pasar por
    // error de quien carga el consumo).
    const stockBar = base._datos.articuloDepositoStock.find((s) => s.articuloDepositoId === 1);
    assert.equal(stockBar.stockActual, 5, "el stock de Bar no debe cambiar");
    const stockMinibar = base._datos.articuloDepositoStock.find((s) => s.articuloDepositoId === 2);
    assert.equal(stockMinibar.stockActual, 8, "el stock de Minibar sí baja de 10 a 8");
  });

  await prueba("usa el tipo de movimiento 'Salida por Consumo Interno' sin que el usuario tenga que elegirlo", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Minibar" });
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
      monto: 3000,
      registradoPor: "X",
    });
    assert.equal(base._datos.movimientoStock[0].tipoMovStockId, salida.id);
  });

  await prueba("una Salida de Minibar SIEMPRE va contra el depósito fijo Minibar, no contra Bar (bug ya pisado una vez)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const bar = base._sembrarDeposito({ nombre: "Bar" });
    const minibar = base._sembrarDeposito({ nombre: "Minibar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo({ nombre: "Vino Malbec" });
    base._habilitarConStock({ articuloId: articulo.id, depositoId: bar.id, stockActual: 20 });
    base._habilitarConStock({ articuloId: articulo.id, depositoId: minibar.id, stockActual: 15 });
    const reserva = await reservaEnCurso();

    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: 1,
      tipoServicio: "Minibar",
      articuloId: articulo.id,
      cantidad: 3,
      monto: 9000,
      registradoPor: "X",
    });

    assert.equal(base._datos.movimientoStock.length, 1);
    assert.equal(base._datos.movimientoStock[0].depositoId, minibar.id, "el movimiento tiene que quedar contra Minibar");
    const stockBar = base._datos.articuloDepositoStock.find((s) => s.articuloDepositoId === 1);
    assert.equal(stockBar.stockActual, 20, "Bar no puede perder stock por un consumo de Minibar");
    const stockMinibar = base._datos.articuloDepositoStock.find((s) => s.articuloDepositoId === 2);
    assert.equal(stockMinibar.stockActual, 12, "Minibar sí baja de 15 a 12");
  });

  await prueba("no reimplementa las validaciones de Salida: rechaza un artículo no habilitado en el depósito Minibar", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    base._sembrarDeposito({ nombre: "Minibar" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo(); // nunca habilitado en el depósito Minibar
    const reserva = await reservaEnCurso();

    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Minibar",
          articuloId: articulo.id,
          cantidad: 1,
          monto: 1000,
          registradoPor: "X",
        }),
      "no están habilitados"
    );
  });

  await prueba("rechaza registrar un consumo de Minibar si no existe el depósito Minibar", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    base._sembrarTipoMovimiento();
    const articulo = base._sembrarArticulo();
    const reserva = await reservaEnCurso();

    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Minibar",
          articuloId: articulo.id,
          cantidad: 1,
          monto: 1000,
          registradoPor: "X",
        }),
      'No existe el depósito "Minibar"'
    );
  });

  await prueba("rechaza consumir más de lo que hay en stock, y no deja el consumo cargado a medias", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Minibar" });
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
    await sembrarHabitacion({ numero: "101" });
    const reserva = await reservaEnCurso();
    await esperaError(
      () =>
        serviciosAdicionalesServicio.registrarConsumo({
          reservaId: reserva.id,
          habitacionId: 1,
          tipoServicio: "Minibar",
          monto: 1000,
          registradoPor: "X",
        }),
      "articuloId"
    );
  });

  await prueba("no descuenta stock de un artículo dado de baja", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Minibar" });
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
          monto: 1000,
          registradoPor: "X",
        }),
      "dados de baja"
    );
  });

  seccion("HU-63 — Consulta de cargos acumulados");

  await prueba("lista los consumos de una reserva ordenados del más reciente al más viejo", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
    const deposito = base._sembrarDeposito({ nombre: "Minibar" });
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
      monto: 3000,
      registradoPor: "X",
    });
    const soloMinibar = await serviciosAdicionalesServicio.listarPorReserva(reserva.id, { tipoServicio: "Minibar" });
    assert.equal(soloMinibar.length, 1);
    assert.equal(soloMinibar[0].tipoServicio, "Minibar");
  });

  await prueba("el contrato con Integrante 4 (HU-48) trae los campos documentados", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
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
    await sembrarHabitacion({ numero: "101" });
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
