// Pruebas de negocio de Tarifas por tipo × temporada (HU-92) — Etapa 2 de
// tarifas por temporada. Corren SIN base de datos y sin red.
//
// Todas las fechas son RELATIVAS a hoyComoFechaUTC() (ajuste D) — el
// sistema rechaza vigencias retroactivas, así que un test con una fecha
// fija se rompería solo con el paso del calendario real.
//
//   node scripts/pruebas-precios.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const preciosServicio = require("../src/modulos/tarifas/precios.servicio");
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

// Universo mínimo: una temporada Base + un tipo de habitación.
async function sembrarUniverso() {
  const temporada = await base.temporada.create({ data: { nombre: "Base", nivel: "BASE", fechaDesde: null, fechaHasta: null } });
  const tipo = base._resolverOCrearTipoHabitacion("Doble");
  return { temporada, tipo };
}

async function main() {
  seccion("Alta (regla 6)");

  await prueba("rechaza una vigenteDesde anterior a hoy", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await esperaError(
      () =>
        preciosServicio.crearTarifa({
          tipoHabitacionId: tipo.id,
          temporadaId: temporada.id,
          precioBase: 50000,
          adicionalAdultoExtra: 5000,
          vigenteDesde: isoDias(-1),
        }),
      "no puede ser anterior a hoy"
    );
  });

  await prueba("permite vigenteDesde = hoy", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    const tarifa = await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(0),
    });
    assert.equal(Number(tarifa.precioBase), 50000);
  });

  await prueba("rechaza dos versiones con la misma vigenteDesde para la misma celda", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(5),
    });
    await esperaError(
      () =>
        preciosServicio.crearTarifa({
          tipoHabitacionId: tipo.id,
          temporadaId: temporada.id,
          precioBase: 60000,
          adicionalAdultoExtra: 5000,
          vigenteDesde: isoDias(5),
        }),
      "ya existe una versión"
    );
  });

  seccion("Edición y borrado — solo versiones futuras (regla 6)");

  await prueba("rechaza editar una versión ya vigente", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    const vigente = await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(0),
    });
    await esperaError(
      () => preciosServicio.actualizarTarifa(vigente.id, { precioBase: 60000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(0) }),
      "historial inmutable"
    );
  });

  await prueba("permite editar una versión futura", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    const futura = await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(10),
    });
    const editada = await preciosServicio.actualizarTarifa(futura.id, {
      precioBase: 55000,
      adicionalAdultoExtra: 6000,
      vigenteDesde: isoDias(10),
    });
    assert.equal(Number(editada.precioBase), 55000);
  });

  await prueba("rechaza borrar una versión ya vigente, permite borrar una futura", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    const vigente = await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(0),
    });
    const futura = await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 55000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(10),
    });
    await esperaError(() => preciosServicio.eliminarTarifa(vigente.id), "historial inmutable");
    await preciosServicio.eliminarTarifa(futura.id);
    const historial = await preciosServicio.historialTarifa(tipo.id, temporada.id);
    assert.equal(historial.length, 1);
  });

  seccion("Integridad de la cadena de versiones (mismo criterio que el ajuste B de anularLote)");

  await prueba("rechaza editar/borrar una versión que pertenece a un lote — hay que anular el lote completo", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    const lote = await base.loteActualizacionTarifaria.create({
      data: { numero: "ACT-00001", porcentaje: 8, vigenteDesde: fechaDias(10), motivo: "Ajuste de prueba" },
    });
    const deLote = await base.tarifa.create({
      data: {
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        precioBase: 55000,
        adicionalAdultoExtra: 5000,
        vigenteDesde: fechaDias(10),
        loteActualizacionId: lote.id,
      },
    });
    await esperaError(
      () => preciosServicio.actualizarTarifa(deLote.id, { precioBase: 60000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(10) }),
      "ACT-00001"
    );
    await esperaError(() => preciosServicio.eliminarTarifa(deLote.id), "ACT-00001");
  });

  await prueba("rechaza editar/borrar una versión futura cargada a mano si existe otra posterior para la misma celda", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    const anterior = await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(10),
    });
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 60000,
      adicionalAdultoExtra: 6000,
      vigenteDesde: isoDias(40),
    });
    await esperaError(
      () => preciosServicio.actualizarTarifa(anterior.id, { precioBase: 55000, adicionalAdultoExtra: 5000, vigenteDesde: isoDias(10) }),
      isoDias(40)
    );
    await esperaError(() => preciosServicio.eliminarTarifa(anterior.id), isoDias(40));
  });

  await prueba("permite editar/borrar la versión futura más nueva de la celda (nada posterior que la bloquee)", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(10),
    });
    const masNueva = await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 60000,
      adicionalAdultoExtra: 6000,
      vigenteDesde: isoDias(40),
    });
    const editada = await preciosServicio.actualizarTarifa(masNueva.id, {
      precioBase: 61000,
      adicionalAdultoExtra: 6000,
      vigenteDesde: isoDias(40),
    });
    assert.equal(Number(editada.precioBase), 61000);
    await preciosServicio.eliminarTarifa(editada.id);
  });

  seccion("obtenerTarifaVigente (regla 6) — versionado por fecha de venta");

  await prueba("con 2 versiones, resuelve la correcta para una venta entre ambas y para una posterior a la segunda", async () => {
    limpiar();
    const { temporada, tipo } = await sembrarUniverso();
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 50000,
      adicionalAdultoExtra: 5000,
      vigenteDesde: isoDias(10),
    });
    await preciosServicio.crearTarifa({
      tipoHabitacionId: tipo.id,
      temporadaId: temporada.id,
      precioBase: 60000,
      adicionalAdultoExtra: 6000,
      vigenteDesde: isoDias(40),
    });

    const ventaEntreAmbas = await preciosServicio.obtenerTarifaVigente(tipo.id, temporada.id, fechaDias(20));
    assert.equal(Number(ventaEntreAmbas.precioBase), 50000);

    const ventaPosterior = await preciosServicio.obtenerTarifaVigente(tipo.id, temporada.id, fechaDias(50));
    assert.equal(Number(ventaPosterior.precioBase), 60000);

    const ventaAntesDeCualquiera = await preciosServicio.obtenerTarifaVigente(tipo.id, temporada.id, fechaDias(5));
    assert.equal(ventaAntesDeCualquiera, null, "todavía no hay ninguna versión vigente para esa fecha");
  });

  await prueba(
    "ajuste C — una tarifa con vigenteDesde=mañana no es la vigente para una venta de 'hoy' (hoyComoFechaUTC resuelve el día calendario en hora argentina, nunca en UTC crudo — por eso una venta tarde a la noche en Argentina no 'salta' al día siguiente)",
    async () => {
      limpiar();
      const { temporada, tipo } = await sembrarUniverso();
      await preciosServicio.crearTarifa({
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        precioBase: 50000,
        adicionalAdultoExtra: 5000,
        vigenteDesde: isoDias(1),
      });
      const vigenteHoy = await preciosServicio.obtenerTarifaVigente(tipo.id, temporada.id, hoyComoFechaUTC());
      assert.equal(vigenteHoy, null, "todavía no debería aplicar la tarifa de mañana");
    }
  );

  seccion("Grilla (HU-92) — alerta de celdas sin tarifa vigente");

  await prueba("marca sinVigente=true en una celda sin ninguna versión, y false donde sí hay", async () => {
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

    const grilla = await preciosServicio.grillaTarifas();
    const celdaConTarifa = grilla.celdas.find((c) => c.tipoHabitacionId === tipo.id && c.temporadaId === temporada.id);
    const celdaSinTarifa = grilla.celdas.find((c) => c.tipoHabitacionId === tipoSinTarifa.id && c.temporadaId === temporada.id);
    assert.equal(celdaConTarifa.sinVigente, false);
    assert.equal(celdaSinTarifa.sinVigente, true);
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
