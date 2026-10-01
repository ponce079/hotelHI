// Pruebas de negocio de la Actualización Masiva de Tarifas (HU-93) — Etapa
// 2 de tarifas por temporada. Corren SIN base de datos y sin red.
//
// Fechas relativas a hoyComoFechaUTC() (ajuste D).
//
//   node scripts/pruebas-actualizacion-masiva.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const preciosServicio = require("../src/modulos/tarifas/precios.servicio");
const lotesServicio = require("../src/modulos/tarifas/lotesActualizacion.servicio");
const { hoyComoFechaUTC } = require("../src/lib/fechas");

const UN_DIA_MS = 24 * 60 * 60 * 1000;
function fechaDias(n) {
  return new Date(hoyComoFechaUTC().getTime() + n * UN_DIA_MS);
}
function isoDias(n) {
  return fechaDias(n).toISOString().slice(0, 10);
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

async function sembrarUniverso() {
  const temporada = await base.temporada.create({ data: { nombre: "Base", nivel: "BASE", fechaDesde: null, fechaHasta: null } });
  const tipo = base._resolverOCrearTipoHabitacion("Doble");
  return { temporada, tipo };
}

async function main() {
  seccion("Redondeo (regla 9)");

  await prueba("redondea al múltiplo de $100 más cercano (ejemplo del enunciado: $87.450 +8% -> $94.400)", async () => {
    assert.equal(lotesServicio.redondearAMultiploDe100(87450 * 1.08), 94400);
  });

  await prueba("ajuste A — redondea el límite exacto hacia arriba (102.850 -> 102.900, ROUND_HALF_UP con Decimal)", async () => {
    assert.equal(lotesServicio.redondearAMultiploDe100(102850).toNumber(), 102900);
  });

  await prueba("ajuste A — un centavo antes del límite redondea para abajo (102.849,99 -> 102.800)", async () => {
    assert.equal(lotesServicio.redondearAMultiploDe100(102849.99).toNumber(), 102800);
  });

  seccion("Base de cálculo — acumulativa sobre la fecha de vigencia del lote (ajuste 1)");

  await prueba(
    "si ya hay un aumento futuro programado, el lote parte de ESE precio (a la fecha de su propia vigencia), no del de hoy",
    async () => {
      limpiar();
      const { temporada, tipo } = await sembrarUniverso();
      await preciosServicio.crearTarifa({
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        precioBase: 50000,
        adicionalAdultoExtra: 5000,
        vigenteDesde: isoDias(0),
      });
      // Aumento futuro ya cargado a mano (ej. para el 1/11 del ejemplo).
      await preciosServicio.crearTarifa({
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        precioBase: 90000,
        adicionalAdultoExtra: 9000,
        vigenteDesde: isoDias(10),
      });

      const vistaPrevia = await lotesServicio.calcularVistaPrevia({
        porcentaje: 8,
        vigenteDesde: isoDias(30),
        temporadaIds: [temporada.id],
        tipoHabitacionIds: [tipo.id],
      });
      assert.equal(vistaPrevia.normales.length, 1);
      const celda = vistaPrevia.normales[0];
      assert.equal(celda.precioBaseActual, 90000, "tiene que partir del aumento futuro ya cargado, no del de hoy (50000)");
      assert.equal(celda.precioBaseNuevo, 97200, "90000 * 1.08 = 97200, ya es múltiplo de 100");
    }
  );

  seccion("Conflictos y omitidas (ajuste A)");

  await prueba("una celda con una versión ya cargada en la misma vigenteDesde del lote queda como conflicto y la confirmación se rechaza", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(0),
    });
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 55000,
      adicionalAdultoExtra: 5500,
      vigenteDesde: isoDias(20),
    });

    const vistaPrevia = await lotesServicio.calcularVistaPrevia({
      porcentaje: 10,
      vigenteDesde: isoDias(20),
      temporadaIds: [temporada.id],
      tipoHabitacionIds: [tipo.id],
    });
    assert.equal(vistaPrevia.conflictos.length, 1);
    assert.equal(vistaPrevia.conflictos[0].tipoNombre, "Doble");

    await esperaError(
      () =>
        lotesServicio.confirmarActualizacion(
          { porcentaje: 10, vigenteDesde: isoDias(20), temporadaIds: [temporada.id], tipoHabitacionIds: [tipo.id], motivo: "Ajuste" },
          "gerente1"
        ),
      "ya existe una tarifa"
    );
  });

  await prueba("una celda sin tarifa vigente a la fecha del lote queda 'omitida' sin romper el resto del alcance", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    const tipoSinTarifa = base._resolverOCrearTipoHabitacion("Suite");
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(0),
    });
    // tipoSinTarifa no tiene ninguna tarifa cargada.

    const vistaPrevia = await lotesServicio.calcularVistaPrevia({ porcentaje: 10, vigenteDesde: isoDias(5) });
    const omitida = vistaPrevia.omitidas.find((o) => o.tipoHabitacionId === tipoSinTarifa.id);
    const normal = vistaPrevia.normales.find((n) => n.tipoHabitacionId === tipo.id);
    assert.ok(omitida, "el tipo sin tarifa tiene que aparecer como omitida");
    assert.ok(normal, "el tipo con tarifa se calcula igual, sin verse afectado por la omitida");
  });

  seccion("Confirmación (regla 9) — lote correlativo, transacción atómica");

  await prueba("confirma la actualización, numera el lote ACT-00001 y crea las versiones con loteActualizacionId", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 87450,
      adicionalAdultoExtra: 10000,
      vigenteDesde: isoDias(0),
    });

    const lote = await lotesServicio.confirmarActualizacion(
      { porcentaje: 8, vigenteDesde: isoDias(15), motivo: "Ajuste por inflación" },
      "gerente1"
    );
    assert.equal(lote.numero, "ACT-00001");
    assert.equal(lote.estado, "Aplicado");
    assert.equal(lote.tarifas.length, 1);
    assert.equal(Number(lote.tarifas[0].precioBase), 94400);

    const vigenteEnLaFecha = await preciosServicio.obtenerTarifaVigente(tipo.id, temporada.id, fechaDias(15));
    assert.equal(Number(vigenteEnLaFecha.precioBase), 94400);
  });

  seccion("Anulación (regla 9 + ajuste B)");

  await prueba("anula un lote todavía no vigente y borra sus versiones", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(0),
    });
    const lote = await lotesServicio.confirmarActualizacion({ porcentaje: 10, vigenteDesde: isoDias(15), motivo: "Prueba" }, "gerente1");

    await esperaError(() => lotesServicio.anularLote(lote.id, ""), "motivo");
    const anulado = await lotesServicio.anularLote(lote.id, "Se decidió no aumentar", "gerente1");
    assert.equal(anulado.estado, "Anulado");
    assert.equal(anulado.anuladoPor, "gerente1");

    const historial = await preciosServicio.historialTarifa(tipo.id, temporada.id);
    assert.equal(historial.length, 1, "la versión del lote anulado tiene que haber desaparecido");
  });

  await prueba("rechaza anular un lote que ya está vigente", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    // Base cargada en el pasado (no en isoDias(0)) para que el lote pueda
    // apuntar su vigenteDesde a "hoy" sin chocar con un conflicto de fecha
    // idéntica — acá lo que se prueba es la vigencia del LOTE, no del
    // conflicto. Se siembra directo por el doble (no por crearTarifa: el
    // alta real también rechaza vigenteDesde retroactiva, a propósito).
    await base.tarifa.create({
      data: {
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        precioBase: 50000,
        adicionalAdultoExtra: 5000,
        vigenteDesde: fechaDias(-10),
      },
    });
    // vigenteDesde = hoy: ya está vigente apenas se confirma.
    const lote = await lotesServicio.confirmarActualizacion({ porcentaje: 10, vigenteDesde: isoDias(0), motivo: "Prueba" }, "gerente1");
    await esperaError(() => lotesServicio.anularLote(lote.id, "motivo"), "ya está vigente");
  });

  await prueba("ajuste B — rechaza anular un lote si alguna de sus celdas tiene una versión posterior (de otro lote o a mano)", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(0),
    });
    const lote = await lotesServicio.confirmarActualizacion({ porcentaje: 10, vigenteDesde: isoDias(15), motivo: "Primer ajuste" }, "gerente1");
    // Versión posterior cargada a mano sobre la misma celda, después de la
    // vigencia del lote — pudo haberse calculado sobre esos precios.
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 60000,
      adicionalAdultoExtra: 6000,
      vigenteDesde: isoDias(25),
    });

    await esperaError(() => lotesServicio.anularLote(lote.id, "motivo"), "versiones posteriores");
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
