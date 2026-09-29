// Pruebas de negocio del Motor de Cotización (HU-94) — Etapa 3 de tarifas
// por temporada. Corren SIN base de datos y sin red.
//
// Todas las fechas son RELATIVAS a hoyComoFechaUTC() (mismo criterio que el
// resto de la suite de tarifas) — nunca fechas fijas, el sistema rechaza
// vigencias/ingresos retroactivos y esos tests se romperían solos con el
// paso del calendario real.
//
// Ajuste B: se fuerza TZ=America/Argentina/Buenos_Aires ACÁ (no solo al
// invocar el proceso) para que el test de día de semana sea reproducible
// sin depender de cómo se lo ejecute — es justamente el caso que
// delataría un getDay() colado en vez de getUTCDay().
process.env.TZ = "America/Argentina/Buenos_Aires";

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const cotizacionServicio = require("../src/modulos/tarifas/cotizacion.servicio");
const temporadasServicio = require("../src/modulos/tarifas/temporadas.servicio");
const planesServicio = require("../src/modulos/tarifas/planesTarifarios.servicio");
const preciosServicio = require("../src/modulos/tarifas/precios.servicio");
const { hoyComoFechaUTC } = require("../src/lib/fechas");

const UN_DIA_MS = 24 * 60 * 60 * 1000;
function fechaDias(n) {
  return new Date(hoyComoFechaUTC().getTime() + n * UN_DIA_MS);
}
function isoDias(n) {
  return fechaDias(n).toISOString().slice(0, 10);
}
// Primer offset (a partir de `desde`) cuya fecha cae en el día de semana
// pedido (0=domingo…6=sábado) — para el test de día de semana (ajuste B),
// que necesita un jueves y el viernes siguiente sin importar qué día de la
// semana sea "hoy" cuando corra la suite.
function offsetParaDiaSemana(diaSemanaDeseado, desde) {
  for (let n = desde; n < desde + 14; n++) {
    if (fechaDias(n).getUTCDay() === diaSemanaDeseado) return n;
  }
  throw new Error("No se encontró el día de semana pedido en los próximos 14 días.");
}

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

// Universo mínimo y reutilizable: temporada Base (obligatoria para que
// resolverTemporadasEfectivasEnRango no falle), un tipo "Doble" con una
// habitación activa de capacidad 4, y el plan BAR (BASE). Cada test suma
// encima lo que le haga falta (otra temporada, un derivado, modificadores).
async function sembrarUniverso({ capacidad = 4 } = {}) {
  const base_ = await temporadasServicio.crearTemporada({ nombre: "Base", nivel: "BASE" });
  const tipo = base._resolverOCrearTipoHabitacion("Doble");
  base._sembrarHabitacion({ tipo: "Doble", tipoHabitacionId: tipo.id, capacidad, activo: true });
  const bar = await planesServicio.crearPlanTarifario({
    codigo: "BAR",
    nombre: "Best Available Rate",
    tipo: "BASE",
    reembolsable: true,
    horasCancelacionSinCargo: 48,
    penalidadNoShow: "PRIMERA_NOCHE",
    visibleWeb: true,
  });
  return { temporadaBase: base_, tipo, bar };
}

async function sembrarModificadores(overrides = {}) {
  for (let dia = 0; dia <= 6; dia += 1) {
    await base.modificadorDiaSemana.create({ data: { diaSemana: dia, porcentaje: overrides[dia] ?? 0 } });
  }
}

async function main() {
  seccion("Validaciones previas (regla 2)");

  await prueba("rechaza una fecha de ingreso anterior a hoy", async () => {
    limpiar();
    const { tipo } = await sembrarUniverso();
    await sembrarModificadores();
    await esperaError(
      () => cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(-1), fechaEgreso: isoDias(2), adultos: 2 }),
      "no puede ser anterior a hoy"
    );
  });

  await prueba("rechaza egreso igual o anterior al ingreso", async () => {
    limpiar();
    const { tipo } = await sembrarUniverso();
    await sembrarModificadores();
    await esperaError(
      () => cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(5), fechaEgreso: isoDias(5), adultos: 2 }),
      "posterior a la de ingreso"
    );
  });

  await prueba("rechaza una estadía de más de 30 noches", async () => {
    limpiar();
    const { tipo } = await sembrarUniverso();
    await sembrarModificadores();
    await esperaError(
      () => cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(1), fechaEgreso: isoDias(32), adultos: 2 }),
      "30 noches"
    );
  });

  await prueba("rechaza si el tipo no tiene ninguna habitación activa", async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Base", nivel: "BASE" });
    const tipoSinHabitaciones = base._resolverOCrearTipoHabitacion("Suite");
    await sembrarModificadores();
    await esperaError(
      () =>
        cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipoSinHabitaciones.id, fechaIngreso: isoDias(1), fechaEgreso: isoDias(2), adultos: 2 }),
      "no tiene habitaciones activas"
    );
  });

  seccion("Capacidad (regla 2) — menores no pagan pero sí cuentan para la capacidad");

  await prueba("2 adultos + 2 menores en capacidad 4: se cotiza sin cargo por los menores", async () => {
    limpiar();
    const { tipo, temporadaBase } = await sembrarUniverso({ capacidad: 4 });
    await sembrarModificadores();
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });

    const resultado = await cotizacionServicio.cotizarEstadia({
      tipoHabitacionId: tipo.id,
      fechaIngreso: isoDias(5),
      fechaEgreso: isoDias(6),
      adultos: 2,
      menores: 2,
    });
    const bar = resultado.planes.find((p) => p.codigo === "BAR");
    assert.equal(bar.detalle[0].precioNoche, 50000, "2 adultos = ocupación base, sin adicional, los menores no suman");
  });

  await prueba("3 adultos + 2 menores en capacidad 4 (5 huéspedes): rechazada por capacidad", async () => {
    limpiar();
    const { tipo, temporadaBase } = await sembrarUniverso({ capacidad: 4 });
    await sembrarModificadores();
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });

    await esperaError(
      () =>
        cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(5), fechaEgreso: isoDias(6), adultos: 3, menores: 2 }),
      "capacidad máxima"
    );
  });

  seccion("Ejemplo numérico exacto (regla 6)");

  await prueba("precioBase 90.000, adicional 20.000, 3 adultos, +10% ese día: BAR=121.000, NRF(15%)=102.850→102.900", async () => {
    limpiar();
    const { tipo, temporadaBase, bar } = await sembrarUniverso({ capacidad: 6 });
    const nrf = await planesServicio.crearPlanTarifario({
      codigo: "NRF",
      nombre: "No Reembolsable",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 15,
      reembolsable: false,
      penalidadNoShow: "TOTAL_ESTADIA",
      visibleWeb: true,
    });
    const offsetNoche = 5;
    const diaSemanaNoche = fechaDias(offsetNoche).getUTCDay();
    await sembrarModificadores({ [diaSemanaNoche]: 10 });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 90000, adicionalAdultoExtra: 20000, vigenteDesde: isoDias(0) });

    const resultado = await cotizacionServicio.cotizarEstadia({
      tipoHabitacionId: tipo.id,
      fechaIngreso: isoDias(offsetNoche),
      fechaEgreso: isoDias(offsetNoche + 1),
      adultos: 3,
    });

    const planBar = resultado.planes.find((p) => p.codigo === "BAR");
    const planNrf = resultado.planes.find((p) => p.codigo === "NRF");
    assert.equal(planBar.detalle[0].precioNoche, 121000);
    assert.equal(planBar.total, 121000);
    assert.equal(planNrf.detalle[0].precioNoche, 102900);
    assert.equal(planNrf.detalle[0].porcentajeDescuentoPlan, 15);
    void nrf;
  });

  seccion("Cruce de temporadas (regla 3) — cada noche con su propia tarifa, la de salida no se cobra");

  await prueba("estadía de 4 noches que cruza Media → Evento: la noche de egreso no se cobra", async () => {
    limpiar();
    const { tipo } = await sembrarUniverso();
    await sembrarModificadores();
    const media = await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(60) });
    const evento = await temporadasServicio.crearTemporada({ nombre: "Evento especial", nivel: "EVENTO", fechaDesde: isoDias(10), fechaHasta: isoDias(12) });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: media.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: evento.id, precioBase: 90000, adicionalAdultoExtra: 10000, vigenteDesde: isoDias(0) });

    // Ingreso el 9 (Media) — noches: 9(Media), 10/11/12(Evento). El 13
    // (Media otra vez) es el egreso: no debe aparecer en el detalle.
    const resultado = await cotizacionServicio.cotizarEstadia({
      tipoHabitacionId: tipo.id,
      fechaIngreso: isoDias(9),
      fechaEgreso: isoDias(13),
      adultos: 2,
    });
    const bar = resultado.planes.find((p) => p.codigo === "BAR");
    assert.equal(resultado.noches, 4);
    assert.equal(bar.detalle.length, 4);
    assert.equal(bar.detalle[0].fecha, isoDias(9));
    assert.equal(bar.detalle[0].temporadaNivel, "MEDIA");
    assert.equal(bar.detalle[0].precioNoche, 50000);
    for (let i = 1; i <= 3; i += 1) {
      assert.equal(bar.detalle[i].temporadaNivel, "EVENTO");
      assert.equal(bar.detalle[i].precioNoche, 90000);
    }
    assert.equal(bar.total, 50000 + 90000 * 3);
    assert.ok(!bar.detalle.some((d) => d.fecha === isoDias(13)), "la noche de egreso no debe cobrarse");
  });

  seccion("Estadía mínima (regla 4)");

  await prueba("Evento con estadía mínima 3: una estadía de 2 noches cuya segunda noche cae en el evento se rechaza", async () => {
    limpiar();
    const { tipo } = await sembrarUniverso();
    await sembrarModificadores();
    const media = await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(60) });
    const evento = await temporadasServicio.crearTemporada({
      nombre: "Milagro",
      nivel: "EVENTO",
      fechaDesde: isoDias(10),
      fechaHasta: isoDias(12),
      estadiaMinima: 3,
    });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: media.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: evento.id, precioBase: 90000, adicionalAdultoExtra: 10000, vigenteDesde: isoDias(0) });

    // Ingreso el 9 (Media), egreso el 11: noches = 9(Media), 10(Evento).
    await esperaError(
      () => cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(9), fechaEgreso: isoDias(11), adultos: 2 }),
      "estadía mínima de 3 noches"
    );
  });

  await prueba("Evento con estadía mínima 3: una estadía de 3 noches que incluye el evento se acepta", async () => {
    limpiar();
    const { tipo } = await sembrarUniverso();
    await sembrarModificadores();
    const media = await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(60) });
    const evento = await temporadasServicio.crearTemporada({
      nombre: "Milagro",
      nivel: "EVENTO",
      fechaDesde: isoDias(10),
      fechaHasta: isoDias(12),
      estadiaMinima: 3,
    });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: media.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: evento.id, precioBase: 90000, adicionalAdultoExtra: 10000, vigenteDesde: isoDias(0) });

    // Ingreso el 9, egreso el 12: noches = 9(Media), 10(Evento), 11(Evento).
    const resultado = await cotizacionServicio.cotizarEstadia({
      tipoHabitacionId: tipo.id,
      fechaIngreso: isoDias(9),
      fechaEgreso: isoDias(12),
      adultos: 2,
    });
    assert.equal(resultado.noches, 3);
    assert.equal(resultado.estadiaMinimaExigida, 3);
  });

  seccion("Cierre a llegadas (regla 5)");

  await prueba("rechaza si la fecha de ingreso tiene cierre a llegadas", async () => {
    limpiar();
    const { tipo, temporadaBase } = await sembrarUniverso();
    await sembrarModificadores();
    const cierre = await temporadasServicio.crearTemporada({
      nombre: "Fin de año",
      nivel: "ALTA",
      fechaDesde: isoDias(10),
      fechaHasta: isoDias(15),
      cierreLlegada: true,
    });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: cierre.id, precioBase: 90000, adicionalAdultoExtra: 10000, vigenteDesde: isoDias(0) });

    await esperaError(
      () => cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(10), fechaEgreso: isoDias(12), adultos: 2 }),
      "cierre a llegadas"
    );
  });

  await prueba("acepta una estadía que empieza antes del cierre y pasa por esa fecha", async () => {
    limpiar();
    const { tipo, temporadaBase } = await sembrarUniverso();
    await sembrarModificadores();
    const cierre = await temporadasServicio.crearTemporada({
      nombre: "Fin de año",
      nivel: "ALTA",
      fechaDesde: isoDias(10),
      fechaHasta: isoDias(15),
      cierreLlegada: true,
    });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: cierre.id, precioBase: 90000, adicionalAdultoExtra: 10000, vigenteDesde: isoDias(0) });

    const resultado = await cotizacionServicio.cotizarEstadia({
      tipoHabitacionId: tipo.id,
      fechaIngreso: isoDias(8),
      fechaEgreso: isoDias(12),
      adultos: 2,
    });
    assert.equal(resultado.noches, 4);
  });

  seccion("Tarifa faltante (regla 6a)");

  await prueba("rechaza listando la fecha y la temporada cuando falta la tarifa de alguna noche", async () => {
    limpiar();
    await sembrarUniverso();
    await sembrarModificadores();
    const tipo = base._resolverOCrearTipoHabitacion("Doble");
    // Ninguna tarifa cargada para ninguna temporada — hasta la Base queda
    // sin precio.
    await esperaError(
      () => cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(5), fechaEgreso: isoDias(7), adultos: 2 }),
      "no hay tarifa vigente"
    );
    const err = await esperaError(
      () => cotizacionServicio.cotizarEstadia({ tipoHabitacionId: tipo.id, fechaIngreso: isoDias(5), fechaEgreso: isoDias(7), adultos: 2 }),
      isoDias(5)
    );
    assert.ok(err.message.includes("Base"), "el mensaje tiene que nombrar la temporada de la noche faltante");
  });

  seccion("fechaVenta (regla 6a, ajuste C) — misma estadía, dos resultados según cuándo se vende");

  await prueba("con 2 versiones de tarifa, fechaVenta=hoy usa la primera y fechaVenta=hoy+10 usa la segunda", async () => {
    limpiar();
    const { tipo, temporadaBase } = await sembrarUniverso();
    await sembrarModificadores();
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 60000, adicionalAdultoExtra: 6000, vigenteDesde: isoDias(10) });

    const params = { tipoHabitacionId: tipo.id, fechaIngreso: isoDias(20), fechaEgreso: isoDias(21), adultos: 2 };
    const conVentaHoy = await cotizacionServicio.cotizarEstadia({ ...params, fechaVenta: isoDias(0) });
    const conVentaMasDiez = await cotizacionServicio.cotizarEstadia({ ...params, fechaVenta: isoDias(10) });

    assert.equal(conVentaHoy.planes.find((p) => p.codigo === "BAR").detalle[0].precioNoche, 50000);
    assert.equal(conVentaMasDiez.planes.find((p) => p.codigo === "BAR").detalle[0].precioNoche, 60000);
  });

  seccion("Canal (regla 8)");

  await prueba("un plan con visibleWeb=false no aparece en canal WEB, sí en RECEPCION", async () => {
    limpiar();
    const { tipo, temporadaBase, bar } = await sembrarUniverso();
    await sembrarModificadores();
    await planesServicio.crearPlanTarifario({
      codigo: "PROMO-INTERNA",
      nombre: "Promoción interna",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 10,
      reembolsable: true,
      horasCancelacionSinCargo: 24,
      penalidadNoShow: "PRIMERA_NOCHE",
      visibleWeb: false,
    });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });

    const params = { tipoHabitacionId: tipo.id, fechaIngreso: isoDias(5), fechaEgreso: isoDias(6), adultos: 2 };
    const enRecepcion = await cotizacionServicio.cotizarEstadia({ ...params, canal: "RECEPCION" });
    const enWeb = await cotizacionServicio.cotizarEstadia({ ...params, canal: "WEB" });

    assert.ok(enRecepcion.planes.some((p) => p.codigo === "PROMO-INTERNA"));
    assert.ok(!enWeb.planes.some((p) => p.codigo === "PROMO-INTERNA"));
    assert.ok(enWeb.planes.some((p) => p.codigo === "BAR"), "BAR es visibleWeb=true, tiene que seguir apareciendo");
  });

  seccion("Día de semana (ajuste B) — getUTCDay(), nunca getDay()");

  await prueba("con modificador solo en viernes (+10%), la noche del viernes lo lleva y la del jueves no", async () => {
    limpiar();
    const { tipo, temporadaBase } = await sembrarUniverso();
    const offsetJueves = offsetParaDiaSemana(4, 15);
    const offsetViernes = offsetJueves + 1;
    assert.equal(fechaDias(offsetViernes).getUTCDay(), 5, "el día siguiente al jueves elegido tiene que ser viernes");
    await sembrarModificadores({ 5: 10 });
    await preciosServicio.crearTarifa({ tipoHabitacionId: tipo.id, temporadaId: temporadaBase.id, precioBase: 50000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) });

    const resultado = await cotizacionServicio.cotizarEstadia({
      tipoHabitacionId: tipo.id,
      fechaIngreso: isoDias(offsetJueves),
      fechaEgreso: isoDias(offsetViernes + 1),
      adultos: 2,
    });
    const bar = resultado.planes.find((p) => p.codigo === "BAR");
    const nocheJueves = bar.detalle.find((d) => d.fecha === isoDias(offsetJueves));
    const nocheViernes = bar.detalle.find((d) => d.fecha === isoDias(offsetViernes));
    assert.equal(nocheJueves.porcentajeModificador, 0);
    assert.equal(nocheJueves.precioNoche, 50000);
    assert.equal(nocheViernes.porcentajeModificador, 10);
    assert.equal(nocheViernes.precioNoche, 55000);
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
