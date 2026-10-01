// Pruebas de negocio específicas de la Etapa 4A de tarifas por temporada
// (HU-95/96) que no encajan en pruebas-reservas.js por necesitar un plan
// derivado no reembolsable (NRF) y un adicional por adulto extra real —
// pruebas-reservas.js usa una fixture de precio deliberadamente simple
// (un solo plan BAR, sin adicional) para no acoplar TODAS sus pruebas
// heredadas a esta fixture más rica.
//
// Cubre: regla 9 (un plan no reembolsable no admite cambiar fechas ni
// plan), ajuste B (ocupación que aumenta el precio se recotiza normal;
// ocupación que lo disminuye conserva el precio anterior, solo en un plan
// no reembolsable), ajuste C (el índice único de ReservaNoche por
// habitación+fecha no se pisa entre alta y modificación), soloPrevia
// (vista previa de una modificación sin persistir nada) y disponibilidad
// devolviendo motivoNoDisponible cuando un tipo no tiene tarifa vigente.
//
//   node scripts/pruebas-reserva-precio.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const servicio = require("../src/modulos/reservas/reservas.servicio");

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

const HUESPED = { paisDocumento:"AR", fechaNacimiento:"1990-01-01", nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };

// --------------------------------------------------------------
// Fixture — temporada Base + plan BAR (reembolsable) + plan NRF (derivado
// de BAR, -15%, no reembolsable) + Tarifa CON adicional por adulto extra
// real (a diferencia de pruebas-reservas.js): hace falta para poder
// ejercitar el ajuste B, que solo se nota cuando cambiar la ocupación
// cambia de verdad el precio.
// --------------------------------------------------------------
const PRECIO_BASE_PRUEBA = 100000;
const ADICIONAL_ADULTO_EXTRA = 20000;

async function asegurarFixture() {
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
  let planNrf = base._datos.planTarifario.find((p) => p.codigo === "NRF");
  if (!planNrf) {
    planNrf = await base.planTarifario.create({
      data: {
        codigo: "NRF",
        nombre: "No Reembolsable",
        tipo: "DERIVADO",
        planBaseId: planBar.id,
        descuentoPorcentaje: 15,
        reembolsable: false,
        horasCancelacionSinCargo: null,
        penalidadNoShow: "TOTAL_ESTADIA",
        visibleWeb: true,
        activo: true,
      },
    });
  }
  return { temporadaBase, planBar, planNrf };
}

async function asegurarTarifaParaTipo(tipoHabitacionId) {
  const { temporadaBase } = await asegurarFixture();
  const yaTiene = base._datos.tarifa.some((t) => t.tipoHabitacionId === tipoHabitacionId && t.temporadaId === temporadaBase.id);
  if (!yaTiene) {
    await base.tarifa.create({
      data: {
        tipoHabitacionId,
        temporadaId: temporadaBase.id,
        precioBase: PRECIO_BASE_PRUEBA,
        adicionalAdultoExtra: ADICIONAL_ADULTO_EXTRA,
        vigenteDesde: new Date(`${enDias(-365)}T00:00:00.000Z`),
      },
    });
  }
}

async function sembrarHabitacion(extra) {
  const fila = base._sembrarHabitacion(extra);
  await asegurarTarifaParaTipo(fila.tipoHabitacionId);
  return fila;
}

function hab(habitacionId, extra = {}) {
  return { habitacionId, adultos: 2, menores: 0, ...extra };
}
function habs(ids) {
  return ids.map((id) => hab(id));
}

// `plan` = "BAR" | "NRF". Ocupación base del tipo sembrado (_dobleSprint3)
// es 2 — con 2 adultos no hay adicional; con 3, sí (1 × ADICIONAL_ADULTO_EXTRA).
async function alta(planCodigo, extra = {}) {
  const { planBar, planNrf } = await asegurarFixture();
  const plan = planCodigo === "NRF" ? planNrf : planBar;
  const fechaDesde = extra.fechaDesde ?? enDias(10);
  const fechaHasta = extra.fechaHasta ?? enDias(13);
  const habitaciones = extra.habitaciones ?? habs([1]);
  const canal = extra.origen === "WEB" ? "WEB" : "RECEPCION";
  let totalEsperado = extra.totalEsperado;
  if (totalEsperado === undefined) {
    const cotizacion = await servicio.cotizarParaReserva({
      fechaDesde,
      fechaHasta,
      planTarifarioId: plan.id,
      habitaciones,
      canal,
    });
    totalEsperado = cotizacion.planes[0]?.total ?? 0;
  }
  return {
    fechaDesde,
    fechaHasta,
    habitaciones,
    planTarifarioId: plan.id,
    totalEsperado,
    huesped: { ...HUESPED },
    ...extra,
  };
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
  seccion("HU-95 (regla 5) — cotizarParaReserva");

  await prueba("cotiza BAR y NRF (NRF un 15% más barato) y nunca lee fechaVenta del body", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const cotizacion = await servicio.cotizarParaReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(13),
      habitaciones: habs([1]),
      canal: "RECEPCION",
      // Un intento de mandar una fechaVenta falsa desde el "cliente": el
      // servicio la ignora — nunca la toma del body (regla 5).
      fechaVenta: enDias(-100),
    });
    const bar = cotizacion.planes.find((p) => p.codigo === "BAR");
    const nrf = cotizacion.planes.find((p) => p.codigo === "NRF");
    assert.equal(bar.total, PRECIO_BASE_PRUEBA * 3);
    assert.equal(nrf.total, Math.round(PRECIO_BASE_PRUEBA * 3 * 0.85 / 100) * 100);
  });

  await prueba("canal WEB solo devuelve planes visibleWeb", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const { planBar } = await asegurarFixture();
    await base.planTarifario.update({ where: { id: planBar.id }, data: { visibleWeb: false } });
    const cotizacion = await servicio.cotizarParaReserva({
      fechaDesde: enDias(10),
      fechaHasta: enDias(13),
      habitaciones: habs([1]),
      canal: "WEB",
    });
    assert.ok(!cotizacion.planes.some((p) => p.codigo === "BAR"));
    assert.ok(cotizacion.planes.some((p) => p.codigo === "NRF"));
  });

  seccion("HU-38/95 (regla 6) — disponibilidad informa motivoNoDisponible sin tarifa");

  await prueba("un tipo sin tarifa vigente aparece con motivoNoDisponible, sin romper el resto", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", tipo: "Doble" });
    // "Suite" se crea sin pasar por sembrarHabitacion (que le aseguraría
    // tarifa) — sin ninguna Tarifa para su tipo.
    base._sembrarHabitacion({ numero: "901", tipo: "Suite" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(13) });
    const doble = resultado.habitaciones.find((h) => h.numero === "101");
    const suite = resultado.habitaciones.find((h) => h.numero === "901");
    assert.ok(doble.planes.length > 0);
    assert.equal(suite.planes.length, 0);
    assert.ok(suite.motivoNoDisponible, "la Suite sin tarifa tiene que traer un motivo, no romper la consulta entera");
  });

  seccion("HU-96 (regla 9) — un plan no reembolsable no admite cambiar fechas ni plan");

  await prueba("rechaza cambiar fechaDesde/fechaHasta de una reserva NRF", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("NRF"));
    await esperaError(
      () => servicio.modificarReserva(reserva.id, { fechaHasta: enDias(15) }),
      "Las reservas con tarifa no reembolsable no admiten cambios de fechas ni de plan"
    );
  });

  await prueba("rechaza cambiar el plan de una reserva NRF", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const { planBar } = await asegurarFixture();
    const reserva = await servicio.crearReserva(await alta("NRF"));
    await esperaError(
      () => servicio.modificarReserva(reserva.id, { planTarifarioId: planBar.id }),
      "no admiten cambios de fechas ni de plan"
    );
  });

  await prueba("SÍ permite cambiar la ocupación de una reserva NRF (solo fechas/plan están bloqueados)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    const reserva = await servicio.crearReserva(await alta("NRF"));
    const modificada = await servicio.modificarReserva(reserva.id, {
      habitaciones: habs([1]).map((h) => ({ ...h, adultos: 3 })),
    });
    assert.equal(modificada.habitaciones[0].adultos, 3);
  });

  await prueba("una reserva BAR (reembolsable) sí admite cambiar fechas y plan sin restricción", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const modificada = await servicio.modificarReserva(reserva.id, { fechaHasta: enDias(15) });
    assert.equal(modificada.noches, 5);
  });

  seccion("HU-96 (ajuste B) — ocupación en un plan no reembolsable");

  await prueba("un aumento de ocupación en NRF se recotiza normalmente (precio sube)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    const reserva = await servicio.crearReserva(await alta("NRF", { habitaciones: habs([1]) })); // 2 adultos, sin adicional
    const precioAntes = reserva.habitaciones[0].subtotalAlojamiento;

    const modificada = await servicio.modificarReserva(reserva.id, {
      habitaciones: [{ habitacionId: 1, adultos: 3, menores: 0 }], // +1 adulto extra
    });
    assert.ok(
      modificada.habitaciones[0].subtotalAlojamiento > precioAntes,
      "el aumento de ocupación tiene que subir el precio, no dejarlo igual"
    );
    assert.ok(modificada.habitaciones[0].reservaNoches.every((n) => n.origen === "MOTOR"));
  });

  await prueba("una baja de ocupación en NRF CONSERVA el precio anterior (no hay reembolso)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    // Arranca con 3 adultos (con adicional) para que bajar a 2 sea una baja
    // de precio real si se recotizara sin la excepción del ajuste B.
    const reserva = await servicio.crearReserva(
      await alta("NRF", { habitaciones: [{ habitacionId: 1, adultos: 3, menores: 0 }] })
    );
    const precioAntes = reserva.habitaciones[0].subtotalAlojamiento;

    const modificada = await servicio.modificarReserva(reserva.id, {
      habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
    });
    assert.equal(
      modificada.habitaciones[0].subtotalAlojamiento,
      precioAntes,
      "la baja de ocupación en un plan no reembolsable no puede bajar el precio ya congelado"
    );
  });

  await prueba("soloPrevia de esa misma baja informa el mensaje de tarifa no reembolsable, sin persistir nada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    const reserva = await servicio.crearReserva(
      await alta("NRF", { habitaciones: [{ habitacionId: 1, adultos: 3, menores: 0 }] })
    );
    const previa = await servicio.modificarReserva(reserva.id, {
      habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
      soloPrevia: true,
    });
    assert.equal(previa.diferencia, 0, "con el precio conservado, la vista previa no puede mostrar diferencia");
    assert.ok(previa.mensajeNoReembolsable, "tiene que avisar por qué la baja no bajó el precio");

    // Nada se persistió: la ocupación real de la reserva sigue en 3.
    const sinTocar = await servicio.obtenerReserva(reserva.id);
    assert.equal(sinTocar.habitaciones[0].adultos, 3);
  });

  await prueba("una baja de ocupación en BAR (reembolsable) sí baja el precio normalmente", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    const reserva = await servicio.crearReserva(
      await alta("BAR", { habitaciones: [{ habitacionId: 1, adultos: 3, menores: 0 }] })
    );
    const precioAntes = reserva.habitaciones[0].subtotalAlojamiento;

    const modificada = await servicio.modificarReserva(reserva.id, {
      habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
    });
    assert.ok(
      modificada.habitaciones[0].subtotalAlojamiento < precioAntes,
      "en un plan reembolsable, bajar la ocupación sí tiene que bajar el precio"
    );
  });

  seccion("HU-95 (ajuste C) — @@unique([reservaHabitacionId, fecha]) entre alta y modificación");

  await prueba("modificar extendiendo la estadía agrega noches nuevas sin pisar las que ya existían", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR", { fechaDesde: enDias(10), fechaHasta: enDias(12) }));
    assert.equal(reserva.habitaciones[0].reservaNoches.length, 2);

    const modificada = await servicio.modificarReserva(reserva.id, { fechaHasta: enDias(14) });
    assert.equal(modificada.habitaciones[0].reservaNoches.length, 4);
    const fechas = modificada.habitaciones[0].reservaNoches.map((n) => new Date(n.fecha).toISOString().slice(0, 10));
    assert.equal(new Set(fechas).size, 4, "no puede haber dos ReservaNoche para la misma fecha de esa habitación");
  });

  await prueba("el índice único de la base rechaza una segunda ReservaNoche para la misma habitación y fecha", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const reservaHabitacionId = base._datos.reservaHabitacion.find((rh) => rh.reservaId === reserva.id).id;
    const fechaRepetida = base._datos.reservaNoche.find((n) => n.reservaHabitacionId === reservaHabitacionId).fecha;
    await esperaError(
      () =>
        base.reservaNoche.create({
          data: {
            reservaHabitacionId,
            fecha: fechaRepetida,
            temporadaId: null,
            tarifaId: null,
            planTarifarioId: reserva.planTarifarioId,
            precioNoche: 1,
            origen: "MOTOR",
          },
        }),
      "unique constraint"
    );
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
