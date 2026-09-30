// Pruebas de negocio de Temporadas (HU-90) — Etapa 2 de tarifas por
// temporada. Corren SIN base de datos y sin red — mismo doble en memoria
// que pruebas-habitaciones.js.
//
// Todas las fechas son RELATIVAS a hoyComoFechaUTC() (ajuste D): el
// sistema no restringe fechas pasadas de Temporada (al revés que Tarifa),
// pero igual conviene no depender de fechas absolutas para que los
// ejemplos del enunciado (Milagro 13-15/9, etc.) no queden atados a un
// año calendario en particular.
//
//   node scripts/pruebas-temporadas.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const temporadasServicio = require("../src/modulos/tarifas/temporadas.servicio");
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

async function main() {
  seccion("Solapamiento dentro del mismo nivel (regla 2)");

  await prueba('rechaza dos temporadas del mismo nivel con fechas cruzadas (caso borde: una termina el mismo día que empieza la otra)', async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Media A", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(15) });
    await esperaError(
      () => temporadasServicio.crearTemporada({ nombre: "Media B", nivel: "MEDIA", fechaDesde: isoDias(15), fechaHasta: isoDias(30) }),
      "se solapa"
    );
  });

  await prueba("permite crear dos temporadas del mismo nivel si NO se cruzan (una termina el día antes de que empiece la otra)", async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Media A", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(14) });
    const b = await temporadasServicio.crearTemporada({ nombre: "Media B", nivel: "MEDIA", fechaDesde: isoDias(15), fechaHasta: isoDias(30) });
    assert.equal(b.nombre, "Media B");
  });

  await prueba("permite que se solapen temporadas de nivel DISTINTO (se resuelve por prioridad, no se rechaza)", async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(30) });
    const evento = await temporadasServicio.crearTemporada({ nombre: "Evento", nivel: "EVENTO", fechaDesde: isoDias(10), fechaHasta: isoDias(12) });
    assert.equal(evento.nivel, "EVENTO");
  });

  await prueba("rechaza editar una temporada a fechas que ahora se solapan con otra del mismo nivel", async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Media A", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(14) });
    const b = await temporadasServicio.crearTemporada({ nombre: "Media B", nivel: "MEDIA", fechaDesde: isoDias(20), fechaHasta: isoDias(30) });
    await esperaError(
      () => temporadasServicio.actualizarTemporada(b.id, { nombre: "Media B", fechaDesde: isoDias(10), fechaHasta: isoDias(30) }),
      "se solapa"
    );
  });

  seccion("resolverTemporadaEfectiva (regla 3) — ejemplo del enunciado, en fechas relativas");

  await prueba("BASE + MEDIA(todo el rango) + EVENTO(3 días adentro): devuelve EVENTO/MEDIA/BASE según corresponda", async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Base", nivel: "BASE" });
    await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(0), fechaHasta: isoDias(29) });
    await temporadasServicio.crearTemporada({ nombre: "Milagro", nivel: "EVENTO", fechaDesde: isoDias(12), fechaHasta: isoDias(14) });

    const enEvento = await temporadasServicio.resolverTemporadaEfectiva(fechaDias(13));
    assert.equal(enEvento.nivel, "EVENTO", "día adentro del evento");

    const enMedia = await temporadasServicio.resolverTemporadaEfectiva(fechaDias(19));
    assert.equal(enMedia.nivel, "MEDIA", "día adentro de MEDIA pero fuera del evento");

    const enBase = await temporadasServicio.resolverTemporadaEfectiva(fechaDias(40));
    assert.equal(enBase.nivel, "BASE", "día fuera de cualquier temporada específica");
  });

  await prueba("resuelve correctamente en los extremos inclusive del rango del evento", async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Base", nivel: "BASE" });
    await temporadasServicio.crearTemporada({ nombre: "Milagro", nivel: "EVENTO", fechaDesde: isoDias(12), fechaHasta: isoDias(14) });

    assert.equal((await temporadasServicio.resolverTemporadaEfectiva(fechaDias(12))).nivel, "EVENTO", "primer día inclusive");
    assert.equal((await temporadasServicio.resolverTemporadaEfectiva(fechaDias(14))).nivel, "EVENTO", "último día inclusive");
    assert.equal((await temporadasServicio.resolverTemporadaEfectiva(fechaDias(15))).nivel, "BASE", "el día siguiente ya no es evento");
  });

  await prueba("sin ninguna temporada Base configurada, tira ErrorDeNegocio (nunca devuelve null)", async () => {
    limpiar();
    await esperaError(() => temporadasServicio.resolverTemporadaEfectiva(hoyComoFechaUTC()), "no hay temporada base");
  });

  await prueba("resolverTemporadasEfectivasEnRango también tira si no hay Base, y si la hay da un resultado por día con estadiaMinima/cierreLlegada", async () => {
    limpiar();
    await esperaError(() => temporadasServicio.resolverTemporadasEfectivasEnRango(fechaDias(0), fechaDias(2)), "no hay temporada base");

    await temporadasServicio.crearTemporada({ nombre: "Base", nivel: "BASE" });
    await temporadasServicio.crearTemporada({
      nombre: "Milagro",
      nivel: "EVENTO",
      fechaDesde: isoDias(0),
      fechaHasta: isoDias(2),
      estadiaMinima: 3,
      cierreLlegada: true,
    });
    const resultado = await temporadasServicio.resolverTemporadasEfectivasEnRango(fechaDias(0), fechaDias(2));
    assert.equal(resultado.length, 3);
    assert.ok(resultado.every((d) => d.nivel === "EVENTO" && d.estadiaMinima === 3 && d.cierreLlegada === true));
  });

  seccion("Única temporada Base, y nunca se puede dar de baja");

  await prueba("rechaza crear una segunda temporada Base", async () => {
    limpiar();
    await temporadasServicio.crearTemporada({ nombre: "Base", nivel: "BASE" });
    await esperaError(() => temporadasServicio.crearTemporada({ nombre: "Base 2", nivel: "BASE" }), "ya existe la temporada base");
  });

  await prueba("rechaza dar de baja la temporada Base", async () => {
    limpiar();
    const baseCreada = await temporadasServicio.crearTemporada({ nombre: "Base", nivel: "BASE" });
    await esperaError(
      () => temporadasServicio.cambiarActivaTemporada(baseCreada.id, false, "porque sí"),
      "no se puede dar de baja"
    );
  });

  await prueba("da de baja una temporada normal con motivo obligatorio", async () => {
    limpiar();
    const media = await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(1), fechaHasta: isoDias(30) });
    await esperaError(() => temporadasServicio.cambiarActivaTemporada(media.id, false, ""), "motivo");
    const dada = await temporadasServicio.cambiarActivaTemporada(media.id, false, "Se reprograma", "gerente1");
    assert.equal(dada.activa, false);
    assert.equal(dada.motivoBaja, "Se reprograma");
    assert.equal(dada.bajaPor, "gerente1");
  });

  seccion("Edición (regla 4)");

  await prueba("rechaza cambiar fechaDesde si ya pasó", async () => {
    limpiar();
    const temporada = await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(-10), fechaHasta: isoDias(10) });
    await esperaError(
      () => temporadasServicio.actualizarTemporada(temporada.id, { nombre: "Media", fechaDesde: isoDias(-5), fechaHasta: isoDias(10) }),
      "ya pasó"
    );
  });

  await prueba("permite editar estadiaMinima/cierreLlegada de una temporada vigente sin tocar fechaDesde", async () => {
    limpiar();
    const temporada = await temporadasServicio.crearTemporada({ nombre: "Media", nivel: "MEDIA", fechaDesde: isoDias(-10), fechaHasta: isoDias(10) });
    const actualizada = await temporadasServicio.actualizarTemporada(temporada.id, {
      nombre: "Media",
      fechaDesde: isoDias(-10),
      fechaHasta: isoDias(10),
      estadiaMinima: 2,
      cierreLlegada: true,
    });
    assert.equal(actualizada.estadiaMinima, 2);
    assert.equal(actualizada.cierreLlegada, true);
  });

  await prueba("una temporada con fechaHasta ya pasada queda de solo lectura", async () => {
    limpiar();
    const temporada = await temporadasServicio.crearTemporada({ nombre: "Vieja", nivel: "BAJA", fechaDesde: isoDias(-30), fechaHasta: isoDias(-5) });
    await esperaError(
      () => temporadasServicio.actualizarTemporada(temporada.id, { nombre: "Vieja 2", fechaDesde: isoDias(-30), fechaHasta: isoDias(-5) }),
      "solo lectura"
    );
  });

  await prueba("permite extender fechaHasta de una temporada futura sin restricciones", async () => {
    limpiar();
    const temporada = await temporadasServicio.crearTemporada({ nombre: "Alta", nivel: "ALTA", fechaDesde: isoDias(10), fechaHasta: isoDias(20) });
    const actualizada = await temporadasServicio.actualizarTemporada(temporada.id, { nombre: "Alta", fechaDesde: isoDias(10), fechaHasta: isoDias(25) });
    assert.equal(actualizada.fechaHasta.toISOString().slice(0, 10), isoDias(25));
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
