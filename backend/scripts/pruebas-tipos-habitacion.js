// Pruebas de negocio del catálogo de Tipos de Habitación (HU-89 — Etapa 1
// de tarifas por temporada).
//
// Corren SIN base de datos y sin red — mismo doble en memoria que
// pruebas-habitaciones.js / pruebas-checkin.js.
//
//   node scripts/pruebas-tipos-habitacion.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const tiposHabitacionServicio = require("../src/modulos/tipos-habitacion/tiposHabitacion.servicio");

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
  seccion("Alta");

  await prueba("crea un tipo con código y nombre válidos", async () => {
    limpiar();
    const tipo = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "std-dbl", nombre: "  Doble Estándar  " });
    assert.equal(tipo.codigo, "STD-DBL", "el código se guarda en mayúsculas");
    assert.equal(tipo.nombre, "Doble Estándar", "el nombre se guarda trimeado");
    assert.equal(tipo.activo, true);
  });

  await prueba("rechaza un código con símbolos no permitidos", async () => {
    limpiar();
    await esperaError(() => tiposHabitacionServicio.crearTipoHabitacion({ codigo: "STD_DBL!", nombre: "Doble" }), "letras");
  });

  await prueba("rechaza un código de menos de 2 caracteres", async () => {
    limpiar();
    await esperaError(() => tiposHabitacionServicio.crearTipoHabitacion({ codigo: "A", nombre: "Doble" }), "caracteres");
  });

  await prueba("rechaza un código de más de 10 caracteres", async () => {
    limpiar();
    await esperaError(
      () => tiposHabitacionServicio.crearTipoHabitacion({ codigo: "ABCDEFGHIJK", nombre: "Doble" }),
      "caracteres"
    );
  });

  await prueba("rechaza un nombre duplicado exacto", async () => {
    limpiar();
    await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    await esperaError(() => tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL2", nombre: "Doble" }), "nombre");
  });

  await prueba("rechaza un nombre duplicado salvo mayúsculas/espacios", async () => {
    limpiar();
    await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    await esperaError(
      () => tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL2", nombre: "  doble  " }),
      "nombre"
    );
  });

  await prueba("rechaza un código duplicado", async () => {
    limpiar();
    await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    await esperaError(() => tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Suite" }), "código");
  });

  seccion("Edición");

  await prueba("edita código y nombre sin tocar las habitaciones que lo referencian", async () => {
    limpiar();
    const tipo = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    const h = base._sembrarHabitacion({ numero: "101", tipoHabitacionId: tipo.id });
    const actualizado = await tiposHabitacionServicio.actualizarTipoHabitacion(tipo.id, { codigo: "STD-DBL", nombre: "Doble Estándar" });
    assert.equal(actualizado.codigo, "STD-DBL");
    assert.equal(actualizado.nombre, "Doble Estándar");
    assert.equal(base._datos.habitacion.find((x) => x.id === h.id).tipoHabitacionId, tipo.id, "la relación es por id, no cambia");
  });

  await prueba("rechaza editar a un nombre duplicado de otro tipo", async () => {
    limpiar();
    await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    const suite = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "STE", nombre: "Suite" });
    await esperaError(
      () => tiposHabitacionServicio.actualizarTipoHabitacion(suite.id, { codigo: "STE", nombre: "Doble" }),
      "nombre"
    );
  });

  seccion("Baja lógica (regla 3)");

  await prueba("da de baja un tipo sin habitaciones activas", async () => {
    limpiar();
    const tipo = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    const actualizado = await tiposHabitacionServicio.cambiarActivoTipoHabitacion(tipo.id, false);
    assert.equal(actualizado.activo, false);
  });

  await prueba("rechaza la baja si el tipo tiene habitaciones activas, con el conteo en el mensaje", async () => {
    limpiar();
    const tipo = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    base._sembrarHabitacion({ numero: "101", tipoHabitacionId: tipo.id, activo: true });
    base._sembrarHabitacion({ numero: "102", tipoHabitacionId: tipo.id, activo: true });
    const err = await esperaError(() => tiposHabitacionServicio.cambiarActivoTipoHabitacion(tipo.id, false), "no se puede dar de baja");
    assert.ok(err.message.includes("2"), "el mensaje tiene que incluir el conteo (2)");
  });

  await prueba("permite la baja si las únicas habitaciones del tipo están inactivas", async () => {
    limpiar();
    const tipo = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    base._sembrarHabitacion({ numero: "101", tipoHabitacionId: tipo.id, activo: false });
    const actualizado = await tiposHabitacionServicio.cambiarActivoTipoHabitacion(tipo.id, false);
    assert.equal(actualizado.activo, false);
  });

  await prueba("reactivar (false -> true) no tiene la restricción de habitaciones activas", async () => {
    limpiar();
    const tipo = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    await tiposHabitacionServicio.cambiarActivoTipoHabitacion(tipo.id, false);
    base._sembrarHabitacion({ numero: "101", tipoHabitacionId: tipo.id, activo: true });
    const reactivado = await tiposHabitacionServicio.cambiarActivoTipoHabitacion(tipo.id, true);
    assert.equal(reactivado.activo, true);
  });

  seccion("Listado");

  await prueba("listarTiposHabitacion(activo=true) excluye los dados de baja", async () => {
    limpiar();
    await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    const suite = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "STE", nombre: "Suite" });
    await tiposHabitacionServicio.cambiarActivoTipoHabitacion(suite.id, false);
    const activos = await tiposHabitacionServicio.listarTiposHabitacion({ activo: "true" });
    assert.equal(activos.length, 1);
    assert.equal(activos[0].nombre, "Doble");
  });

  await prueba("listarTiposHabitacion(activo=todos) incluye los dados de baja", async () => {
    limpiar();
    const tipo = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    await tiposHabitacionServicio.cambiarActivoTipoHabitacion(tipo.id, false);
    const todos = await tiposHabitacionServicio.listarTiposHabitacion({ activo: "todos" });
    assert.equal(todos.length, 1);
  });

  await prueba("conHabitacionActiva=true solo trae tipos con al menos una habitación activa", async () => {
    limpiar();
    const conHabitacion = await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "DBL", nombre: "Doble" });
    await tiposHabitacionServicio.crearTipoHabitacion({ codigo: "STE", nombre: "Suite" });
    base._sembrarHabitacion({ numero: "101", tipoHabitacionId: conHabitacion.id, activo: true });
    const resultado = await tiposHabitacionServicio.listarTiposHabitacion({ activo: "true", conHabitacionActiva: "true" });
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].nombre, "Doble");
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
