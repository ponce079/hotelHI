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
const { hoyComoFechaUTC } = require("../src/lib/fechas");

const UN_DIA_MS = 24 * 60 * 60 * 1000;

// Payload completo válido para crear/actualizar una habitación — normalizarHabitacion
// exige los 5 campos siempre, no soporta actualización parcial.
function payloadHabitacion(extra = {}) {
  return { numero: "900", capacidad: 2, piso: 1, tarifaPorNoche: 50000, ...extra };
}

async function sembrarReservaSobre(habitacionId, { estado, fechaHasta, codigoConfirmacion }) {
  const huesped = await base.huesped.create({
    data: { nombre: "Huésped de prueba", tipoDocumento: "DNI", numeroDocumento: String(Math.random()), contacto: "x@x.com" },
  });
  const reserva = await base.reserva.create({
    data: { huespedId: huesped.id, fechaDesde: new Date("2026-01-01T00:00:00.000Z"), fechaHasta, estado, codigoConfirmacion },
  });
  await base.reservaHabitacion.create({ data: { reservaId: reserva.id, habitacionId } });
  return reserva;
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

  seccion("HU-89 — tipoHabitacionId al crear/editar una habitación");

  await prueba("rechaza crear con tipoHabitacionId inexistente", async () => {
    limpiar();
    await esperaError(
      () => habitacionesServicio.crearHabitacion(payloadHabitacion({ tipoHabitacionId: 999 })),
      "no existe"
    );
  });

  await prueba("rechaza crear con tipoHabitacionId de un tipo dado de baja", async () => {
    limpiar();
    const tipo = base._resolverOCrearTipoHabitacion("Suite");
    tipo.activo = false;
    await esperaError(
      () => habitacionesServicio.crearHabitacion(payloadHabitacion({ tipoHabitacionId: tipo.id })),
      "dado de baja"
    );
  });

  await prueba("permite editar otro campo sin tocar tipoHabitacionId aunque el tipo actual esté dado de baja", async () => {
    limpiar();
    const tipo = base._resolverOCrearTipoHabitacion("Doble");
    const h = base._sembrarHabitacion({ numero: "700", tipoHabitacionId: tipo.id });
    tipo.activo = false; // se da de baja DESPUÉS de que la habitación ya la tenía asignada
    const actualizada = await habitacionesServicio.actualizarHabitacion(
      h.id,
      payloadHabitacion({ numero: "700", tipoHabitacionId: tipo.id, piso: 3 })
    );
    assert.equal(actualizada.piso, 3, "el campo que sí cambió se tiene que haber guardado");
  });

  seccion("HU-89 — bloqueo de cambio de tipoHabitacionId con reservas vigentes (regla 5)");

  await prueba('bloquea el cambio de tipo con una reserva "En curso" sobre la habitación', async () => {
    limpiar();
    const tipoOrigen = base._resolverOCrearTipoHabitacion("Doble");
    const tipoDestino = base._resolverOCrearTipoHabitacion("Suite");
    const h = base._sembrarHabitacion({ numero: "701", tipoHabitacionId: tipoOrigen.id });
    await sembrarReservaSobre(h.id, {
      estado: "En curso",
      fechaHasta: new Date(hoyComoFechaUTC().getTime() - 5 * UN_DIA_MS), // vencida, pero "En curso" bloquea igual
      codigoConfirmacion: "ABC111",
    });
    const err = await esperaError(
      () => habitacionesServicio.actualizarHabitacion(h.id, payloadHabitacion({ numero: "701", tipoHabitacionId: tipoDestino.id })),
      "reservas vigentes"
    );
    assert.ok(err.message.includes("ABC111"), "el mensaje tiene que listar el código de confirmación que bloquea");
  });

  await prueba('bloquea el cambio de tipo con una reserva "Confirmada" cuya fechaHasta es >= hoy', async () => {
    limpiar();
    const tipoOrigen = base._resolverOCrearTipoHabitacion("Doble");
    const tipoDestino = base._resolverOCrearTipoHabitacion("Suite");
    const h = base._sembrarHabitacion({ numero: "702", tipoHabitacionId: tipoOrigen.id });
    await sembrarReservaSobre(h.id, {
      estado: "Confirmada",
      fechaHasta: new Date(hoyComoFechaUTC().getTime() + 2 * UN_DIA_MS),
      codigoConfirmacion: "ABC222",
    });
    await esperaError(
      () => habitacionesServicio.actualizarHabitacion(h.id, payloadHabitacion({ numero: "702", tipoHabitacionId: tipoDestino.id })),
      "reservas vigentes"
    );
  });

  await prueba(
    'NO bloquea el cambio de tipo con una reserva "Confirmada" cuya fechaHasta es anterior a hoy (no-show nunca procesado)',
    async () => {
      limpiar();
      const tipoOrigen = base._resolverOCrearTipoHabitacion("Doble");
      const tipoDestino = base._resolverOCrearTipoHabitacion("Suite");
      const h = base._sembrarHabitacion({ numero: "703", tipoHabitacionId: tipoOrigen.id });
      await sembrarReservaSobre(h.id, {
        estado: "Confirmada",
        fechaHasta: new Date(hoyComoFechaUTC().getTime() - 2 * UN_DIA_MS),
        codigoConfirmacion: "ABC333",
      });
      const actualizada = await habitacionesServicio.actualizarHabitacion(
        h.id,
        payloadHabitacion({ numero: "703", tipoHabitacionId: tipoDestino.id })
      );
      assert.equal(actualizada.tipoHabitacionId, tipoDestino.id);
    }
  );

  await prueba('NO bloquea el cambio de tipo si las únicas reservas de la habitación están "Cerrada" o "Cancelada"', async () => {
    limpiar();
    const tipoOrigen = base._resolverOCrearTipoHabitacion("Doble");
    const tipoDestino = base._resolverOCrearTipoHabitacion("Suite");
    const h = base._sembrarHabitacion({ numero: "704", tipoHabitacionId: tipoOrigen.id });
    await sembrarReservaSobre(h.id, {
      estado: "Cerrada",
      fechaHasta: new Date(hoyComoFechaUTC().getTime() + 2 * UN_DIA_MS),
      codigoConfirmacion: "ABC444",
    });
    await sembrarReservaSobre(h.id, {
      estado: "Cancelada",
      fechaHasta: new Date(hoyComoFechaUTC().getTime() + 2 * UN_DIA_MS),
      codigoConfirmacion: "ABC555",
    });
    const actualizada = await habitacionesServicio.actualizarHabitacion(
      h.id,
      payloadHabitacion({ numero: "704", tipoHabitacionId: tipoDestino.id })
    );
    assert.equal(actualizada.tipoHabitacionId, tipoDestino.id);
  });

  await prueba("NO bloquea el cambio de tipo si la habitación no tiene ninguna reserva", async () => {
    limpiar();
    const tipoOrigen = base._resolverOCrearTipoHabitacion("Doble");
    const tipoDestino = base._resolverOCrearTipoHabitacion("Suite");
    const h = base._sembrarHabitacion({ numero: "705", tipoHabitacionId: tipoOrigen.id });
    const actualizada = await habitacionesServicio.actualizarHabitacion(
      h.id,
      payloadHabitacion({ numero: "705", tipoHabitacionId: tipoDestino.id })
    );
    assert.equal(actualizada.tipoHabitacionId, tipoDestino.id);
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
