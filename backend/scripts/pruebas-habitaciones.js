// Pruebas de negocio del módulo Habitaciones — matriz de transiciones
// manuales de estado (corrección post-auditoría: cambiarEstadoHabitacion no
// validaba nada según el estado de origen).
//
// Corren SIN base de datos y sin red — mismo doble en memoria que
// pruebas-checkin.js / pruebas-reservas.js.
//
//   node scripts/pruebas-habitaciones.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const habitacionesServicio = require("../src/modulos/habitaciones/habitaciones.servicio");

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

async function main() {
  seccion("cambiarEstadoHabitacion — el caso que motivó la corrección: ocupada → libre/en limpieza sin check-out");

  await prueba('rechaza "ocupada" → "libre" (esa transición requiere un check-out real)', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "301", estado: "ocupada" });
    await esperaError(() => habitacionesServicio.cambiarEstadoHabitacion(h.id, "libre"), "check-out");
    assert.equal(base._datos.habitacion.find((x) => x.id === h.id).estado, "ocupada", "no se tiene que haber tocado el estado");
  });

  await prueba('rechaza "ocupada" → "en limpieza" (mismo motivo: falta el check-out)', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "301", estado: "ocupada" });
    await esperaError(() => habitacionesServicio.cambiarEstadoHabitacion(h.id, "en limpieza"), "check-out");
  });

  seccion('"ocupada" solo se llega por check-in real, nunca por acá');

  await prueba('rechaza "libre" → "ocupada" por el endpoint manual', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "204", estado: "libre" });
    await esperaError(() => habitacionesServicio.cambiarEstadoHabitacion(h.id, "ocupada"), "check-in");
  });

  seccion('"mantenimiento" solo se llega por crearOrdenMantenimiento, nunca por acá — y no se sale por acá tampoco');

  await prueba('rechaza "libre" → "mantenimiento" por el endpoint manual', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "204", estado: "libre" });
    await esperaError(() => habitacionesServicio.cambiarEstadoHabitacion(h.id, "mantenimiento"), "orden de mantenimiento");
  });

  await prueba('rechaza salir de "mantenimiento" por el endpoint manual (la única salida es resolverOrdenMantenimiento)', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "23", estado: "mantenimiento", estadoAnterior: "libre" });
    await esperaError(() => habitacionesServicio.cambiarEstadoHabitacion(h.id, "libre"), "resolver la orden");
  });

  seccion("transiciones que sí quedan permitidas por el endpoint manual");

  await prueba('permite "libre" → "bloqueada" con motivo', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "55", estado: "libre" });
    const actualizada = await habitacionesServicio.cambiarEstadoHabitacion(h.id, "bloqueada", "Reforma de baño");
    assert.equal(actualizada.estado, "bloqueada");
    assert.equal(actualizada.motivoBloqueo, "Reforma de baño");
  });

  await prueba('permite "libre" → "en limpieza" (limpieza fuera de ciclo de estadía, sin check-out de por medio)', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "55", estado: "libre" });
    const actualizada = await habitacionesServicio.cambiarEstadoHabitacion(h.id, "en limpieza");
    assert.equal(actualizada.estado, "en limpieza");
  });

  await prueba('permite "bloqueada" → "libre"', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "55", estado: "bloqueada", motivoBloqueo: "Ya arreglada" });
    const actualizada = await habitacionesServicio.cambiarEstadoHabitacion(h.id, "libre");
    assert.equal(actualizada.estado, "libre");
  });

  await prueba('permite "bloqueada" → "en limpieza" (ej. terminó una reforma, necesita limpieza antes de estar libre)', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "55", estado: "bloqueada", motivoBloqueo: "Reforma" });
    const actualizada = await habitacionesServicio.cambiarEstadoHabitacion(h.id, "en limpieza");
    assert.equal(actualizada.estado, "en limpieza");
  });

  await prueba('rechaza "bloqueada" → "ocupada"', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "55", estado: "bloqueada", motivoBloqueo: "Reforma" });
    await esperaError(() => habitacionesServicio.cambiarEstadoHabitacion(h.id, "ocupada"), "check-in");
  });

  await prueba('permite "en limpieza" → "libre"', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "101", estado: "en limpieza" });
    const actualizada = await habitacionesServicio.cambiarEstadoHabitacion(h.id, "libre");
    assert.equal(actualizada.estado, "libre");
  });

  await prueba('permite "en limpieza" → "bloqueada" con motivo', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "101", estado: "en limpieza" });
    const actualizada = await habitacionesServicio.cambiarEstadoHabitacion(h.id, "bloqueada", "Pérdida de agua");
    assert.equal(actualizada.estado, "bloqueada");
  });

  await prueba('rechaza "en limpieza" → "ocupada"', async () => {
    limpiar();
    const h = base._sembrarHabitacion({ numero: "101", estado: "en limpieza" });
    await esperaError(() => habitacionesServicio.cambiarEstadoHabitacion(h.id, "ocupada"), "check-in");
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
