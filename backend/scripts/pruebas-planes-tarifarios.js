// Pruebas de negocio de Planes Tarifarios (HU-91) — Etapa 2 de tarifas por
// temporada. Corren SIN base de datos y sin red.
//
//   node scripts/pruebas-planes-tarifarios.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const planesServicio = require("../src/modulos/tarifas/planesTarifarios.servicio");

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

const BAR_VALIDO = {
  codigo: "bar",
  nombre: "Best Available Rate",
  tipo: "BASE",
  reembolsable: true,
  horasCancelacionSinCargo: 48,
  penalidadNoShow: "PRIMERA_NOCHE",
  visibleWeb: true,
};

async function main() {
  seccion("Plan BASE — único, código único e inmutable");

  await prueba("crea el plan BASE y normaliza el código a mayúsculas", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    assert.equal(bar.codigo, "BAR");
    assert.equal(bar.tipo, "BASE");
  });

  await prueba("rechaza crear un segundo plan BASE", async () => {
    limpiar();
    await planesServicio.crearPlanTarifario(BAR_VALIDO);
    await esperaError(
      () => planesServicio.crearPlanTarifario({ ...BAR_VALIDO, codigo: "BAR2", nombre: "Otro base" }),
      "ya existe un plan tipo base"
    );
  });

  await prueba("rechaza un código de plan duplicado", async () => {
    limpiar();
    await planesServicio.crearPlanTarifario(BAR_VALIDO);
    await esperaError(
      () =>
        planesServicio.crearPlanTarifario({
          codigo: "BAR",
          nombre: "Otro",
          tipo: "DERIVADO",
          planBaseId: 1,
          descuentoPorcentaje: 10,
          reembolsable: false,
          penalidadNoShow: "TOTAL_ESTADIA",
        }),
      "código"
    );
  });

  await prueba("el código no se puede tocar en una edición (se ignora si viene distinto)", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    const actualizado = await planesServicio.actualizarPlanTarifario(bar.id, { ...BAR_VALIDO, codigo: "OTRO", nombre: "BAR renombrado" });
    assert.equal(actualizado.codigo, "BAR", "el código tiene que seguir siendo el original");
    assert.equal(actualizado.nombre, "BAR renombrado");
  });

  seccion("Planes derivados");

  await prueba("crea un derivado válido con descuento sobre el plan base", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    const nrf = await planesServicio.crearPlanTarifario({
      codigo: "nrf",
      nombre: "No reembolsable",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 15,
      reembolsable: false,
      penalidadNoShow: "TOTAL_ESTADIA",
    });
    assert.equal(nrf.planBaseId, bar.id);
    assert.equal(Number(nrf.descuentoPorcentaje), 15);
  });

  await prueba("rechaza un descuento fuera de (0,100)", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    await esperaError(
      () =>
        planesServicio.crearPlanTarifario({
          codigo: "X",
          nombre: "X",
          tipo: "DERIVADO",
          planBaseId: bar.id,
          descuentoPorcentaje: 0,
          reembolsable: false,
          penalidadNoShow: "TOTAL_ESTADIA",
        }),
      "descuentoPorcentaje"
    );
    await esperaError(
      () =>
        planesServicio.crearPlanTarifario({
          codigo: "Y",
          nombre: "Y",
          tipo: "DERIVADO",
          planBaseId: bar.id,
          descuentoPorcentaje: 100,
          reembolsable: false,
          penalidadNoShow: "TOTAL_ESTADIA",
        }),
      "descuentoPorcentaje"
    );
  });

  await prueba("rechaza que un derivado derive de otro derivado", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    const nrf = await planesServicio.crearPlanTarifario({
      codigo: "NRF",
      nombre: "No reembolsable",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 15,
      reembolsable: false,
      penalidadNoShow: "TOTAL_ESTADIA",
    });
    await esperaError(
      () =>
        planesServicio.crearPlanTarifario({
          codigo: "SUPER-NRF",
          nombre: "Super no reembolsable",
          tipo: "DERIVADO",
          planBaseId: nrf.id,
          descuentoPorcentaje: 5,
          reembolsable: false,
          penalidadNoShow: "TOTAL_ESTADIA",
        }),
      "otro derivado"
    );
  });

  seccion("Condiciones de venta");

  await prueba("exige horasCancelacionSinCargo cuando reembolsable=true", async () => {
    limpiar();
    await esperaError(
      () => planesServicio.crearPlanTarifario({ ...BAR_VALIDO, horasCancelacionSinCargo: undefined }),
      "horasCancelacionSinCargo"
    );
  });

  await prueba("un plan no reembolsable no necesita horasCancelacionSinCargo", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    const nrf = await planesServicio.crearPlanTarifario({
      codigo: "NRF",
      nombre: "No reembolsable",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 15,
      reembolsable: false,
      penalidadNoShow: "TOTAL_ESTADIA",
    });
    assert.equal(nrf.horasCancelacionSinCargo, null);
  });

  seccion("Baja lógica (regla 5)");

  await prueba("rechaza dar de baja el plan BASE", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    await esperaError(() => planesServicio.cambiarActivoPlanTarifario(bar.id, false, "motivo"), "no se puede dar de baja");
  });

  await prueba("da de baja un plan derivado con motivo obligatorio", async () => {
    limpiar();
    const bar = await planesServicio.crearPlanTarifario(BAR_VALIDO);
    const nrf = await planesServicio.crearPlanTarifario({
      codigo: "NRF",
      nombre: "No reembolsable",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 15,
      reembolsable: false,
      penalidadNoShow: "TOTAL_ESTADIA",
    });
    await esperaError(() => planesServicio.cambiarActivoPlanTarifario(nrf.id, false, ""), "motivo");
    const dado = await planesServicio.cambiarActivoPlanTarifario(nrf.id, false, "Se discontinúa", "gerente1");
    assert.equal(dado.activo, false);
    assert.equal(dado.bajaPor, "gerente1");
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
