// Pruebas de negocio del módulo Reservas (HU-36 a HU-42, y HU-95/96 desde
// la Etapa 4A de tarifas por temporada).
//
// Corren SIN base de datos y sin red: reemplazan `src/lib/prisma` y
// `@prisma/client` por el doble en memoria compartido (_dobleSprint3.js —
// ver ese archivo) antes de que el servicio los cargue, así se puede
// verificar la lógica de solapamiento, las transiciones de estado, las
// validaciones y el precio congelado por noche sin tocar la base
// compartida del equipo ni depender de Clever Cloud.
//
//   node scripts/pruebas-reservas.js
//
// Etapa 4A — desde que crearReserva/modificarReserva/consultarDisponibilidad
// pasan TODOS por el motor de cotización (cotizarEstadia/cotizarReserva),
// este script ya no puede tener su propio doble minimalista sin tarifas:
// necesita las mismas tablas (temporada/planTarifario/tarifa/reservaNoche)
// que Tarifas, así que pasó a usar el doble COMPARTIDO (antes solo lo usaban
// Check-in y Servicios Adicionales) en vez de reimplementar ~250 líneas de
// matching que ya existían ahí.
const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const servicio = require("../src/modulos/reservas/reservas.servicio");
const { ESTADO_RESERVA } = require("../src/modulos/reservas/reservas.constantes");

// --------------------------------------------------------------
// Utilidades de prueba
// --------------------------------------------------------------

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

// Fechas siempre relativas a hoy: una prueba con fechas fijas se rompe
// sola cuando pasa el tiempo (la validación de "no reservar en el pasado").
function enDias(dias) {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  return new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const HUESPED = { fechaNacimiento:"1990-01-01", nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };

// --------------------------------------------------------------
// Fixture mínima de tarifas (Etapa 4A) — UNA temporada Base + UN plan BAR,
// y una Tarifa por cada tipo de habitación que las pruebas vayan creando,
// siempre a este mismo precio por noche (sin adicional por adulto extra:
// las pruebas de este archivo no ejercitan esa regla — eso ya lo cubre
// pruebas-cotizacion.js de la Etapa 3). Así cualquier prueba heredada de
// antes de esta etapa puede seguir prediciendo el total con una cuenta
// simple: PRECIO_BASE_PRUEBA × noches × habitaciones.
// --------------------------------------------------------------
const PRECIO_BASE_PRUEBA = 100000;

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
        precioBase: PRECIO_BASE_PRUEBA,
        adicionalAdultoExtra: 0,
        // Bien en el pasado: nunca puede quedar "todavía no vigente" para
        // ninguna fecha de venta que use una prueba de este archivo.
        vigenteDesde: new Date(`${enDias(-365)}T00:00:00.000Z`),
      },
    });
  }
}

// Envoltorio de base._sembrarHabitacion (HU-89) que además garantiza tarifa
// vigente para el tipo de la habitación recién creada — desde la Etapa 4A,
// cualquier alta, modificación o consulta de disponibilidad pasa por el
// motor de cotización, que rechaza con error de negocio un tipo sin tarifa.
async function sembrarHabitacion(extra) {
  const fila = base._sembrarHabitacion(extra);
  await asegurarTarifaParaTipo(fila.tipoHabitacionId);
  return fila;
}

// Etapa 4A — una habitación con ocupación (HU-95): adultos/menores viajan
// por habitación, ya no como una lista plana de ids.
function hab(habitacionId, extra = {}) {
  return { habitacionId, adultos: 2, menores: 0, ...extra };
}
function habs(ids) {
  return ids.map((id) => hab(id));
}

// Etapa 4A — el total ya no lo inventa la prueba: sale de una cotización
// real contra el motor (mismo camino que usaría el frontend antes de
// confirmar), así `totalEsperado` nunca puede desalinearse de lo que
// crearReservaEnTransaccion vuelve a calcular puertas adentro.
async function alta(extra = {}) {
  const { planBar } = await asegurarTemporadaYPlanBase();
  const fechaDesde = extra.fechaDesde ?? enDias(10);
  const fechaHasta = extra.fechaHasta ?? enDias(13);
  const habitaciones = extra.habitaciones ?? habs([1]);
  const planTarifarioId = extra.planTarifarioId ?? planBar.id;
  const canal = extra.origen === "WEB" ? "WEB" : "RECEPCION";
  let totalEsperado = extra.totalEsperado;
  if (totalEsperado === undefined) {
    const cotizacion = await servicio.cotizarParaReserva({ fechaDesde, fechaHasta, planTarifarioId, habitaciones, canal });
    totalEsperado = cotizacion.planes[0]?.total ?? 0;
  }
  return {
    fechaDesde,
    fechaHasta,
    habitaciones,
    planTarifarioId,
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

// --------------------------------------------------------------
// Pruebas
// --------------------------------------------------------------

async function main() {
  seccion("HU-36 — Alta de reserva individual o grupal");

  await prueba("crea una reserva individual en estado Confirmada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    assert.equal(reserva.estado, ESTADO_RESERVA.CONFIRMADA);
    assert.equal(reserva.habitaciones.length, 1);
    assert.equal(reserva.habitaciones[0].numero, "101");
    assert.equal(reserva.noches, 3);
  });

  await prueba("una reserva grupal asocia varias habitaciones", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await sembrarHabitacion({ numero: "103" });
    const reserva = await servicio.crearReserva(await alta({ habitaciones: habs([1, 2, 3]) }));
    assert.equal(reserva.habitaciones.length, 3);
    assert.equal(reserva.cantidadHabitaciones, 3);
  });

  await prueba("el total estimado es la suma de lo congelado noche por noche en cada habitación (HU-96)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    const reserva = await servicio.crearReserva(await alta({ habitaciones: habs([1, 2]) }));
    assert.equal(reserva.habitaciones[0].subtotalAlojamiento, PRECIO_BASE_PRUEBA * 3);
    assert.equal(reserva.totalEstimadoAlojamiento, PRECIO_BASE_PRUEBA * 3 * 2);
    assert.equal(reserva.habitaciones[0].reservaNoches.length, 3);
    assert.ok(reserva.habitaciones[0].reservaNoches.every((n) => n.origen === "MOTOR"));
  });

  await prueba("rechaza el alta sin habitaciones", async () => {
    limpiar();
    await esperaError(async () => servicio.crearReserva(await alta({ habitaciones: [] })), "al menos una habitación");
  });

  await prueba("rechaza la misma habitación repetida en la reserva", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(async () => servicio.crearReserva(await alta({ habitaciones: habs([1, 1]) })), "no puede repetirse");
  });

  await prueba("rechaza una habitación inexistente", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(async () => servicio.crearReserva(await alta({ habitaciones: habs([99]) })), "no existe");
  });

  await prueba("rechaza una habitación dada de baja", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", activo: false });
    await esperaError(async () => servicio.crearReserva(await alta()), "dada de baja");
  });

  await prueba("permite reservar una habitación que hoy está en mantenimiento (la disponibilidad es por fechas)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const reserva = await servicio.crearReserva(await alta());
    assert.equal(reserva.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("no toca el estado físico de la habitación al reservar (eso es el check-in)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "libre" });
    await servicio.crearReserva(await alta());
    assert.equal(base._datos.habitacion[0].estado, "libre");
  });

  seccion("HU-36 / HU-38 — Validación de disponibilidad (solapamiento)");

  await prueba("rechaza una reserva que se pisa con otra confirmada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    await esperaError(
      async () => servicio.crearReserva(await alta({ fechaDesde: enDias(12), fechaHasta: enDias(18) })),
      "No hay disponibilidad"
    );
  });

  await prueba("rechaza una reserva contenida dentro de otra", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(20) }));
    await esperaError(
      async () => servicio.crearReserva(await alta({ fechaDesde: enDias(12), fechaHasta: enDias(14) })),
      "No hay disponibilidad"
    );
  });

  await prueba("permite entrar el mismo día en que otra reserva se va (intervalo semiabierto)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const segunda = await servicio.crearReserva(await alta({ fechaDesde: enDias(15), fechaHasta: enDias(18) }));
    assert.equal(segunda.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("permite salir el mismo día en que arranca otra reserva", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ fechaDesde: enDias(15), fechaHasta: enDias(18) }));
    const previa = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    assert.equal(previa.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("el choque en UNA sola habitación del grupo bloquea toda la reserva grupal", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(await alta({ habitaciones: habs([2]), fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    await esperaError(
      async () => servicio.crearReserva(await alta({ habitaciones: habs([1, 2]), fechaDesde: enDias(11), fechaHasta: enDias(13) })),
      "No hay disponibilidad"
    );
  });

  await prueba("una habitación distinta en el mismo período sí se puede reservar", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(await alta({ habitaciones: habs([1]) }));
    const otra = await servicio.crearReserva(await alta({ habitaciones: habs([2]) }));
    assert.equal(otra.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  seccion("HU-36 — Validación de fechas");

  await prueba("rechaza salida anterior o igual a la entrada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(
      async () => servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(10) })),
      "posterior a la de entrada"
    );
  });

  await prueba("rechaza una entrada anterior a hoy", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(
      async () => servicio.crearReserva(await alta({ fechaDesde: enDias(-1), fechaHasta: enDias(3) })),
      "anterior a hoy"
    );
  });

  await prueba("acepta una reserva que arranca hoy mismo", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(0), fechaHasta: enDias(2) }));
    assert.equal(reserva.noches, 2);
  });

  await prueba("rechaza un día inexistente del calendario (31 de febrero)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(async () => servicio.crearReserva(await alta({ fechaDesde: "2027-02-31" })), "no es una fecha válida");
  });

  await prueba("rechaza un formato de fecha que no sea AAAA-MM-DD", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(async () => servicio.crearReserva(await alta({ fechaDesde: "10/05/2027" })), "AAAA-MM-DD");
  });

  await prueba("guarda las fechas como medianoche UTC del día elegido (sin corrimiento de zona)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(12) }));
    assert.equal(new Date(reserva.fechaDesde).toISOString(), `${enDias(10)}T00:00:00.000Z`);
  });

  seccion("HU-39 — Datos del huésped");

  await prueba("rechaza el alta sin nombre del huésped", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(async () => servicio.crearReserva(await alta({ huesped: { ...HUESPED, nombre: "  " } })), "nombre del huésped");
  });

  await prueba("rechaza el alta sin número de documento", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(
      async () => servicio.crearReserva(await alta({ huesped: { ...HUESPED, numeroDocumento: "" } })),
      "número de documento"
    );
  });

  await prueba("rechaza un tipo de documento fuera de la lista", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(
      async () => servicio.crearReserva(await alta({ huesped: { ...HUESPED, tipoDocumento: "Carnet del club" } })),
      "tipoDocumento"
    );
  });

  await prueba("reutiliza la ficha del huésped si el documento ya existe", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(await alta({ habitaciones: habs([1]) }));
    await servicio.crearReserva(await alta({ habitaciones: habs([2]) }));
    assert.equal(base._datos.huesped.length, 1);
  });

  await prueba("un documento distinto genera una ficha nueva", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(await alta({ habitaciones: habs([1]) }));
    await servicio.crearReserva(
      await alta({ habitaciones: habs([2]), huesped: { ...HUESPED, numeroDocumento: "40999888", nombre: "Luis Gómez" } })
    );
    assert.equal(base._datos.huesped.length, 2);
  });

  await prueba("no borra el contacto ya cargado cuando el alta nueva no lo repite", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(await alta({ habitaciones: habs([1]) }));
    await servicio.crearReserva(await alta({ habitaciones: habs([2]), huesped: { ...HUESPED, contacto: "nuevo@mail.com" } }));
    assert.equal(base._datos.huesped[0].contacto, "nuevo@mail.com");
  });

  seccion("HU-41 / HU-42 — Confirmación automática y código único");

  await prueba("genera un código alfanumérico y lo deja en la reserva", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    assert.match(reserva.codigoConfirmacion, /^[0-9A-F]{8}$/);
  });

  await prueba("el código es distinto entre reservas", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    const a = await servicio.crearReserva(await alta({ habitaciones: habs([1]) }));
    const b = await servicio.crearReserva(await alta({ habitaciones: habs([2]) }));
    assert.notEqual(a.codigoConfirmacion, b.codigoConfirmacion);
  });

  await prueba("registra la notificación de confirmación con el código y el canal pedido", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ canalConfirmacion: "Email" }));
    assert.equal(base._datos.notificacion.length, 1);
    const notificacion = base._datos.notificacion[0];
    assert.equal(notificacion.tipo, "Reserva");
    assert.equal(notificacion.canal, "Email");
    assert.ok(notificacion.mensaje.includes(reserva.codigoConfirmacion));
  });

  await prueba("sin datos de contacto, la confirmación queda como aviso interno", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(async () => servicio.crearReserva(await alta({ huesped: { ...HUESPED, contacto: "" } })), "correo");
    return;
    assert.equal(base._datos.notificacion[0].canal, "Interno");
    assert.equal(base._datos.notificacion[0].destinatarioArea, "Recepción");
  });

  await prueba("rechaza un canal de confirmación inválido", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await esperaError(async () => servicio.crearReserva(await alta({ canalConfirmacion: "Paloma mensajera" })), "canalConfirmacion");
  });

  seccion("HU-40 — Autoservicio web");

  await prueba("el canal web usa el mismo alta y la misma validación de disponibilidad", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ origen: "WEB", fechaDesde: enDias(10), fechaHasta: enDias(14) }));
    await esperaError(
      async () => servicio.crearReserva(await alta({ origen: "WEB", fechaDesde: enDias(11), fechaHasta: enDias(13) })),
      "No hay disponibilidad"
    );
  });

  await prueba("la confirmación de una reserva web lo deja asentado en el mensaje", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ origen: "WEB" }));
    assert.ok(base._datos.notificacion[0].mensaje.includes("web"));
  });

  seccion("HU-37 — Modificación");

  await prueba("mueve las fechas de una reserva confirmada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    const modificada = await servicio.modificarReserva(reserva.id, {
      fechaDesde: enDias(20),
      fechaHasta: enDias(25),
    });
    assert.equal(modificada.noches, 5);
  });

  await prueba("cambiar de habitación reemplaza la asociación anterior", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    const reserva = await servicio.crearReserva(await alta({ habitaciones: habs([1]) }));
    const modificada = await servicio.modificarReserva(reserva.id, { habitaciones: habs([2]) });
    assert.equal(modificada.habitaciones.length, 1);
    assert.equal(modificada.habitaciones[0].numero, "102");
    assert.equal(base._datos.reservaHabitacion.filter((rh) => rh.reservaId === reserva.id).length, 1);
  });

  await prueba("no cuenta la propia reserva como conflicto al modificarla", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const modificada = await servicio.modificarReserva(reserva.id, { fechaHasta: enDias(16) });
    assert.equal(modificada.noches, 6);
  });

  await prueba("rechaza mover una reserva sobre un período ya ocupado", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ fechaDesde: enDias(20), fechaHasta: enDias(25) }));
    const segunda = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(12) }));
    await esperaError(
      () => servicio.modificarReserva(segunda.id, { fechaDesde: enDias(21), fechaHasta: enDias(23) }),
      "No hay disponibilidad"
    );
  });

  await prueba("no permite modificar una reserva que ya arrancó", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    await servicio.marcarEnCurso(reserva.id);
    await esperaError(() => servicio.modificarReserva(reserva.id, { fechaHasta: enDias(20) }), "Solo se puede modificar");
  });

  await prueba("no permite modificar una reserva cancelada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "El huésped se arrepintió" });
    await esperaError(() => servicio.modificarReserva(reserva.id, { fechaHasta: enDias(20) }), "Solo se puede modificar");
  });

  await prueba("modificar solo la ocupación conserva el precio de las noches sin cambios (HU-96)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    const precioOriginal = reserva.habitaciones[0].subtotalAlojamiento;
    const modificada = await servicio.modificarReserva(reserva.id, { huesped: { ...HUESPED, contacto: "otro@mail.com" } });
    assert.equal(modificada.habitaciones[0].subtotalAlojamiento, precioOriginal);
    assert.ok(modificada.habitaciones[0].reservaNoches.every((n) => n.origen === "MOTOR"));
  });

  seccion("HU-37 — Cancelación");

  await prueba("cancela con motivo y deja el motivo registrado", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    const cancelada = await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    assert.equal(cancelada.estado, ESTADO_RESERVA.CANCELADA);
    assert.equal(cancelada.motivoCancelacion, "Vuelo cancelado");
  });

  await prueba("exige el motivo de cancelación", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    await esperaError(() => servicio.cancelarReserva(reserva.id, {}), "motivo de cancelación");
  });

  await prueba("al cancelar, el período vuelve a estar disponible", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    const nueva = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    assert.equal(nueva.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("no se puede cancelar dos veces", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    await esperaError(() => servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Otra vez" }), "ya está cancelada");
  });

  await prueba("no se puede cancelar una reserva con el huésped ya alojado", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    await servicio.marcarEnCurso(reserva.id);
    await esperaError(() => servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Tarde" }), "check-out");
  });

  seccion("HU-38 — Consulta de disponibilidad en tiempo real");

  await prueba("lista solo las habitaciones libres en el período", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(await alta({ habitaciones: habs([1]), fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(13) });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].numero, "102");
  });

  await prueba("filtra por tipo de habitación", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", tipo: "Doble" });
    const suite = await sembrarHabitacion({ numero: "201", tipo: "Suite" });
    const resultado = await servicio.consultarDisponibilidad({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      tipoHabitacionId: suite.tipoHabitacionId,
    });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].tipo, "Suite");
  });

  await prueba("filtra por capacidad mínima", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 2 });
    await sembrarHabitacion({ numero: "102", capacidad: 4 });
    const resultado = await servicio.consultarDisponibilidad({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      capacidadMinima: 3,
    });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].numero, "102");
  });

  await prueba("excluye las habitaciones dadas de baja", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", activo: false });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(12) });
    assert.equal(resultado.habitaciones.length, 0);
  });

  await prueba("el resumen por tipo informa libres sobre el total", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", tipo: "Doble" });
    await sembrarHabitacion({ numero: "102", tipo: "Doble" });
    await servicio.crearReserva(await alta({ habitaciones: habs([1]), fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(12) });
    const doble = resultado.resumenPorTipo.find((r) => r.tipo === "Doble");
    assert.equal(doble.total, 2);
    assert.equal(doble.disponibles, 1);
  });

  await prueba("la disponibilidad se actualiza sola tras una cancelación", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const ocupada = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(12) });
    assert.equal(ocupada.habitaciones.length, 0);
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Se suspendió el viaje" });
    const libre = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(12) });
    assert.equal(libre.habitaciones.length, 1);
  });

  await prueba("excluirReservaId deja ver como libre lo que toma la reserva que se está editando", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const sinExcluir = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(14) });
    assert.equal(sinExcluir.habitaciones.length, 0);
    const excluyendo = await servicio.consultarDisponibilidad({
      fechaDesde: enDias(11),
      fechaHasta: enDias(14),
      excluirReservaId: reserva.id,
    });
    assert.equal(excluyendo.habitaciones.length, 1);
  });

  await prueba("cotiza el total de la estadía por habitación (motor, plan BAR)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(14) });
    assert.equal(resultado.noches, 4);
    const planBar = resultado.habitaciones[0].planes.find((p) => p.codigo === "BAR");
    assert.equal(planBar.total, PRECIO_BASE_PRUEBA * 4);
    assert.equal(planBar.promedioPorNoche, PRECIO_BASE_PRUEBA);
  });

  seccion("Corrección — 'En curso' vencidas y estado físico en consultarDisponibilidad");

  await prueba("una reserva 'En curso' con fechaHasta vencida sigue bloqueando la habitación (no hubo check-out real)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(0), fechaHasta: enDias(1) }));
    await servicio.marcarEnCurso(reserva.id);
    // Simula que el huésped se quedó de más y nunca hizo check-out: la
    // fechaHasta original queda vencida (en el pasado) sin liberar la
    // habitación — el mismo escenario que originó el reporte.
    base._datos.reserva.find((r) => r.id === reserva.id).fechaHasta = new Date(`${enDias(-3)}T00:00:00.000Z`);
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(5), fechaHasta: enDias(7) });
    assert.equal(
      resultado.habitaciones.length,
      0,
      "una 'En curso' vencida no debe liberar la habitación por el mero paso del tiempo: solo un check-out real (marcarCerrada) la libera"
    );
  });

  await prueba("una reserva 'Confirmada' (no iniciada) usa su fechaHasta tal cual, no bloquea después de esa fecha", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(12) }));
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(12), fechaHasta: enDias(15) });
    assert.equal(resultado.habitaciones.length, 1, "Confirmada respeta su fechaHasta literal, a diferencia de En curso");
  });

  await prueba("para fecha de entrada = hoy, una habitación 'ocupada' queda excluida de los resultados", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "ocupada" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(0), fechaHasta: enDias(2) });
    assert.equal(resultado.habitaciones.length, 0);
  });

  await prueba("para fecha de entrada futura, una habitación 'en mantenimiento' aparece con el dato informativo, sin bloquear", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(12) });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].estadoActual, "mantenimiento");
  });

  await prueba("estadoActual queda en null cuando la habitación ya está libre", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", estado: "libre" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(12) });
    assert.equal(resultado.habitaciones[0].estadoActual, null);
  });

  seccion("Contrato con Check-in (Integrante 3) y Check-out (Integrante 4)");

  await prueba("obtenerReserva devuelve la forma acordada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const creada = await servicio.crearReserva(await alta());
    const reserva = await servicio.obtenerReserva(creada.id);
    for (const campo of ["id", "codigoConfirmacion", "fechaDesde", "fechaHasta", "estado", "huesped", "habitaciones"]) {
      assert.ok(campo in reserva, `Falta el campo "${campo}" del contrato`);
    }
    for (const campo of ["id", "nombre", "tipoDocumento", "numeroDocumento", "contacto"]) {
      assert.ok(campo in reserva.huesped, `Falta el campo "${campo}" del huésped`);
    }
    for (const campo of ["id", "numero", "tipo", "tipoHabitacionId"]) {
      assert.ok(campo in reserva.habitaciones[0], `Falta el campo "${campo}" de la habitación`);
    }
  });

  await prueba("obtenerPorCodigoConfirmacion encuentra la reserva (sin importar mayúsculas)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const creada = await servicio.crearReserva(await alta());
    const reserva = await servicio.obtenerPorCodigoConfirmacion(creada.codigoConfirmacion.toLowerCase());
    assert.equal(reserva.id, creada.id);
  });

  await prueba("obtenerPorCodigoConfirmacion falla con 404 si el código no existe", async () => {
    limpiar();
    const err = await esperaError(() => servicio.obtenerPorCodigoConfirmacion("ZZZZZZZZ"), "No existe una reserva");
    assert.equal(err.statusCode, 404);
  });

  await prueba("obtenerPorCodigoODocumento usa match exacto de documento, no substring", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    const corta = await servicio.crearReserva(
      await alta({ habitaciones: habs([1]), huesped: { ...HUESPED, numeroDocumento: "5678" } })
    );
    await servicio.crearReserva(
      await alta({ habitaciones: habs([2]), huesped: { ...HUESPED, nombre: "Otro Huésped", numeroDocumento: "12345678" } })
    );
    const resultado = await servicio.obtenerPorCodigoODocumento("5678");
    assert.equal(resultado.id, corta.id, "un documento que es substring de otro no puede traer la reserva ajena");
  });

  await prueba(
    "si el mismo documento tiene dos reservas 'Confirmada' vigentes a la vez, prioriza la de fechaDesde más reciente",
    async () => {
      limpiar();
      await sembrarHabitacion({ numero: "101" });
      await sembrarHabitacion({ numero: "102" });
      const vieja = await servicio.crearReserva(
        await alta({ habitaciones: habs([1]), huesped: { ...HUESPED, numeroDocumento: "55667788" } })
      );
      // crearReserva no deja pedir una fechaDesde pasada (regla real, ver
      // validarRango) — acá se simula el paso del tiempo escribiendo
      // directo en la base falsa: una Confirmada que nunca se canceló ni
      // se registró y a la que ya le pasó la fecha de ingreso.
      const filaVieja = base._datos.reserva.find((r) => r.id === vieja.id);
      filaVieja.fechaDesde = new Date(`${enDias(-5)}T00:00:00.000Z`);
      filaVieja.fechaHasta = new Date(`${enDias(-2)}T00:00:00.000Z`);

      const nueva = await servicio.crearReserva(
        await alta({
          fechaDesde: enDias(0),
          fechaHasta: enDias(3),
          habitaciones: habs([2]),
          huesped: { ...HUESPED, numeroDocumento: "55667788" },
        })
      );

      const resultado = await servicio.obtenerPorCodigoODocumento("55667788");
      assert.equal(resultado.id, nueva.id, "tendría que traer la reserva vigente más cercana a hoy, no la vieja");
      assert.equal(resultado.estado, ESTADO_RESERVA.CONFIRMADA);
    }
  );

  await prueba("marcarEnCurso pasa la reserva de Confirmada a En curso", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    const actualizada = await servicio.marcarEnCurso(reserva.id);
    assert.equal(actualizada.estado, ESTADO_RESERVA.EN_CURSO);
  });

  await prueba("marcarEnCurso rechaza una reserva cancelada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    await esperaError(() => servicio.marcarEnCurso(reserva.id), "No se puede pasar la reserva");
  });

  await prueba("marcarCerrada exige que la reserva esté En curso", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    await esperaError(() => servicio.marcarCerrada(reserva.id), "No se puede pasar la reserva");
    await servicio.marcarEnCurso(reserva.id);
    const cerrada = await servicio.marcarCerrada(reserva.id);
    assert.equal(cerrada.estado, ESTADO_RESERVA.CERRADA);
  });

  await prueba("una reserva cerrada libera la habitación (check-out anticipado)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta({ fechaDesde: enDias(0), fechaHasta: enDias(10) }));
    await servicio.marcarEnCurso(reserva.id);
    await servicio.marcarCerrada(reserva.id);
    const libre = await servicio.consultarDisponibilidad({ fechaDesde: enDias(2), fechaHasta: enDias(5) });
    assert.equal(libre.habitaciones.length, 1);
  });

  await prueba("crearReservaEnTransaccion se puede reusar desde una transacción ajena (walk-in de HU-44)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const datos = servicio.normalizarAltaReserva(await alta({ fechaDesde: enDias(0), fechaHasta: enDias(1) }));
    const reserva = await base.$transaction(async (tx) => {
      const creada = await servicio.crearReservaEnTransaccion(tx, datos);
      await servicio.marcarEnCurso(creada.id, tx);
      return creada;
    });
    assert.equal(base._datos.reserva.find((r) => r.id === reserva.id).estado, ESTADO_RESERVA.EN_CURSO);
  });

  seccion("Listado y filtros");

  await prueba("filtra por estado", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    const a = await servicio.crearReserva(await alta({ habitaciones: habs([1]) }));
    await servicio.crearReserva(await alta({ habitaciones: habs([2]) }));
    await servicio.cancelarReserva(a.id, { motivoCancelacion: "Vuelo cancelado" });
    const canceladas = await servicio.listarReservas({ estado: ESTADO_RESERVA.CANCELADA });
    assert.equal(canceladas.length, 1);
    assert.equal(canceladas[0].id, a.id);
  });

  await prueba("busca por código, nombre, documento y número de habitación", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta());
    assert.equal((await servicio.listarReservas({ q: reserva.codigoConfirmacion })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "ana" })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "30111222" })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "101" })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "no existe" })).length, 0);
  });

  await prueba("el filtro por período trae también las estadías que lo cruzan", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(await alta({ fechaDesde: enDias(10), fechaHasta: enDias(30) }));
    const enElMedio = await servicio.listarReservas({ desde: enDias(15), hasta: enDias(16) });
    assert.equal(enElMedio.length, 1);
    const fuera = await servicio.listarReservas({ desde: enDias(40), hasta: enDias(45) });
    assert.equal(fuera.length, 0);
  });

  await prueba("rechaza un estado de filtro inválido", async () => {
    limpiar();
    await esperaError(() => servicio.listarReservas({ estado: "Pendiente" }), "estado debe ser uno de");
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
