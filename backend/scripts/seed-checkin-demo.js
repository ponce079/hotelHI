// scripts/seed-checkin-demo.js — datos de demo del check-in (pantalla única), con fechas
// relativas al día en que se corre. Pensado para la mañana de la presentación: ver
// docs/demo-checkin.md.
//
//   npm run seed:checkin-demo              crea o actualiza los casos de HOY
//   npm run seed:checkin-demo -- --limpiar  anula (baja lógica) las reservas de demo
//
// Solo corre contra una base LOCAL (misma guardia que db:push). Todo se crea con los servicios
// reales (alta, seña, check-in, pago, check-out), así que precios y ReservaNoche salen del motor.
//
// Identificación de lo que es demo, sin marcas visibles en pantalla:
//   - documento de las personas con prefijo 99…;
//   - manifiesto local backend/scripts/.demo-checkin.json (ignorado por Git) con los ids creados.
// --limpiar y la recreación diaria solo tocan reservas que están en el manifiesto Y cuyo titular
// tiene documento 99…: nunca nada fuera de eso.
//
// El manifiesto separa los ids por base de datos (host y nombre), para no cruzarlos entre bases.
//
// Idempotente: correrlo dos veces el mismo día no duplica habitaciones, huéspedes ni reservas
// (cada caso se reconoce por el manifiesto; las personas, por su documento).
const path = require("node:path");
const fs = require("node:fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { exigirBaseLocal } = require("./_baseLocal");

if (process.env.NODE_ENV === "production") {
  console.error("seed-checkin-demo.js crea datos de demostración: nunca con NODE_ENV=production.");
  process.exit(1);
}
try {
  exigirBaseLocal(process.env, "el seed de demo del check-in");
} catch (error) {
  console.error(`seed-checkin-demo cancelado: ${error.message}`);
  process.exit(1);
}

const { Prisma } = require("@prisma/client");
const prisma = require("../src/lib/prisma");
// Sin correos reales: la demo no le escribe a nadie.
const rutaCorreo = require.resolve("../src/lib/correo");
require.cache[rutaCorreo] = { id: rutaCorreo, filename: rutaCorreo, loaded: true, exports: { enviarCorreo: async () => ({ enviado: false }) } };
const reservas = require("../src/modulos/reservas/reservas.servicio");
const checkin = require("../src/modulos/check-in/checkIn.servicio");
const checkout = require("../src/modulos/check-out/checkOut.servicio");
const pagos = require("../src/modulos/pagos-estadia/pagoEstadia.servicio");
const { hoyComoFechaUTC } = require("../src/lib/fechas");

const MANIFIESTO = path.join(__dirname, ".demo-checkin.json");
const PREFIJO = "99";
const MOTIVO_BAJA = "Datos de demo";
const OPERADOR = "recepcion.demo";
const DIA = 86400000;

const hoy = hoyComoFechaUTC();
const iso = (d) => d.toISOString().slice(0, 10);
const enDias = (n) => iso(new Date(hoy.getTime() + n * DIA));
// Nacimiento "hace N años" (un día antes del cumpleaños), relativo a hoy.
function haceAnios(n) {
  const d = new Date(hoy);
  d.setUTCFullYear(d.getUTCFullYear() - n);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

// El manifiesto guarda los ids POR BASE (host + nombre): los ids de una base nunca se usan en otra.
const BASE = (() => {
  const u = new URL(process.env.DATABASE_URL);
  return `${u.hostname}:${u.port || 3306}${u.pathname}`;
})();
function leerTodo() {
  try {
    return JSON.parse(fs.readFileSync(MANIFIESTO, "utf8"));
  } catch {
    return {};
  }
}
function leerManifiesto() {
  const m = leerTodo()[BASE] ?? {};
  // `anteriores`: reservas de demo reemplazadas por una nueva (por ejemplo, quedaron En curso).
  return { reservas: m.reservas ?? {}, anteriores: m.anteriores ?? [], huespedes: m.huespedes ?? [], habitaciones: m.habitaciones ?? [] };
}
function guardarManifiesto(m) {
  const todo = leerTodo();
  todo[BASE] = { ...m, actualizado: new Date().toISOString() };
  fs.writeFileSync(MANIFIESTO, JSON.stringify(todo, null, 2));
}

// --------------------------------------------------------------- casos
// Cada titular tiene documento 99… fijo: así la persona se reutiliza (no se duplica).
const TITULARES = {
  a: { nombre: "Martín Gutiérrez", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99512874", fechaNacimiento: haceAnios(42), contacto: "martin.gutierrez@correo.com.ar" },
  b: { nombre: "Sofía Ruiz Díaz", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99331908", fechaNacimiento: haceAnios(48), contacto: "+54 261 555-0110" },
  c: { nombre: "Lucía Fernández", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99218664", fechaNacimiento: haceAnios(35), contacto: "lucia.fernandez@correo.com.ar" },
  d: { nombre: "Diego Morales", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99104455", fechaNacimiento: haceAnios(39), contacto: "+54 387 555-0177" },
  e: { nombre: "María José Fernández Ruiz", tipoDocumento: "Pasaporte", paisDocumento: "CL", numeroDocumento: "99F22904", fechaNacimiento: haceAnios(51), contacto: "mjfernandez@correo.cl" },
  f: { nombre: "Carolina Paz", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99784205", fechaNacimiento: haceAnios(39), contacto: "carolina.paz@correo.com.ar" },
  h: { nombre: "Federico Álvarez", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99460318", fechaNacimiento: haceAnios(45), contacto: "+54 381 555-0123" },
  g: { nombre: "Pedro Vargas", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99290417", fechaNacimiento: haceAnios(51), contacto: "+54 11 555-0190" },
};

const CASOS = [
  { clave: "a", descripcion: "familia 2 adultos + 1 menor en Doble, tarifa flexible, con seña con tarjeta", plan: "BAR", noches: 3, habitaciones: [{ tipo: "Doble", adultos: 2, menores: 1 }], senia: "tarjeta" },
  { clave: "b", descripcion: "2 habitaciones: Doble con 2 adultos + Simple con 1 adulto y 1 menor", plan: "BAR", noches: 2, habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }, { tipo: "Simple", adultos: 1, menores: 1 }], senia: "transferencia" },
  { clave: "c", descripcion: "2 adultos con tarifa no reembolsable", plan: "NRF", noches: 2, habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }] },
  { clave: "d", descripcion: "3 adultos en Doble de capacidad 3, tarifa flexible (quitar un adulto baja el precio)", plan: "BAR", noches: 2, habitaciones: [{ tipo: "Doble", adultos: 3, menores: 0, capacidadExacta: 3 }] },
  { clave: "e", descripcion: "titular con el nombre completo en un solo campo (pasaporte de Chile)", plan: "BAR", noches: 1, habitaciones: [{ tipo: "Doble", adultos: 1, menores: 0 }] },
  // Extra para la demo: con 2 adultos (caso c) la Doble ya incluye a los dos y quitar a uno no
  // cambia el precio con ninguna tarifa; con 3 adultos en no reembolsable se ve que el precio no baja.
  { clave: "h", descripcion: "3 adultos con tarifa no reembolsable (quitar un adulto no baja el precio)", plan: "NRF", noches: 2, habitaciones: [{ tipo: "Doble", adultos: 3, menores: 0, capacidadExacta: 3 }] },
];

// --------------------------------------------------------------- habitaciones
// Números verosímiles para el hotel (pisos 4 y 5); se saltean los que ya existen.
const NUMEROS_DEMO = [
  ...Array.from({ length: 20 }, (_, i) => String(401 + i)),
  ...Array.from({ length: 12 }, (_, i) => String(501 + i)),
];
const EQUIPAMIENTO = {
  Doble: (capacidad) =>
    capacidad >= 3 ? "Cama Queen y cama individual, TV, wifi, frigobar y aire acondicionado" : "Cama Queen, TV, wifi, frigobar y aire acondicionado",
  Simple: () => "Cama individual, TV, wifi, escritorio y aire acondicionado",
};

async function tipoPorNombre(nombre) {
  const tipo = await prisma.tipoHabitacion.findFirst({ where: { nombre, activo: true } });
  if (!tipo) throw new Error(`No existe el tipo de habitación "${nombre}" (activo). La base tiene que tener Doble y Simple.`);
  return tipo;
}

// Libres para entrar HOY con esa ocupación (mismo criterio que el check-in).
async function libresHoy(tipo, personas, hasta, capacidadExacta) {
  const r = await reservas.consultarDisponibilidad({
    fechaDesde: iso(hoy),
    fechaHasta: hasta,
    tipoHabitacionId: tipo.id,
    capacidadMinima: personas,
    canal: "RECEPCION",
  });
  return r.habitaciones.filter((h) => h.estado === "libre" && (!capacidadExacta || h.capacidad === capacidadExacta));
}

// Habitación de demo nueva: número verosímil (piso 4) que no choque con las existentes.
async function crearHabitacionDemo(manifiesto, tipo, capacidad) {
  const existentes = new Set((await prisma.habitacion.findMany({ select: { numero: true } })).map((h) => h.numero));
  const numero = NUMEROS_DEMO.find((n) => !existentes.has(n));
  if (!numero) throw new Error("No quedan números libres para habitaciones de demo (401 a 420 y 501 a 512).");
  const h = await prisma.habitacion.create({
    data: { numero, tipoHabitacionId: tipo.id, capacidad, piso: Number(numero[0]), equipamiento: EQUIPAMIENTO[tipo.nombre]?.(capacidad) ?? null },
  });
  manifiesto.habitaciones.push(h.id);
  console.log(`  ＋ habitación ${numero} (${tipo.nombre}, capacidad ${capacidad})`);
  return h;
}

// Una habitación libre del tipo para la ocupación; si no hay, se crea una de demo.
async function habitacionPara(manifiesto, { tipo: nombreTipo, adultos, menores, capacidadExacta }, hasta) {
  const tipo = await tipoPorNombre(nombreTipo);
  const personas = adultos + menores;
  const libres = await libresHoy(tipo, personas, hasta, capacidadExacta);
  // Primero las de demo (así no se toman las del inventario real si no hace falta).
  const deDemo = libres.find((h) => manifiesto.habitaciones.includes(h.id));
  if (deDemo) return deDemo.id;
  if (libres[0]) return libres[0].id;
  return (await crearHabitacionDemo(manifiesto, tipo, capacidadExacta ?? Math.max(personas, nombreTipo === "Simple" ? 2 : 3))).id;
}

// --------------------------------------------------------------- reservas
async function planPorCodigo(codigo) {
  const plan = await prisma.planTarifario.findFirst({ where: { codigo, activo: true } });
  if (!plan) throw new Error(`No existe el plan tarifario "${codigo}" activo (correr antes scripts/seed-tarifas.js).`);
  return plan;
}

async function crearReservaCaso(manifiesto, caso, desde = enDias(0)) {
  const hasta = iso(new Date(new Date(`${desde}T00:00:00Z`).getTime() + caso.noches * DIA));
  const habitaciones = [];
  for (const h of caso.habitaciones) {
    const habitacionId = await habitacionPara(manifiesto, h, hasta);
    habitaciones.push({ habitacionId, adultos: h.adultos, menores: h.menores });
  }
  const plan = await planPorCodigo(caso.plan);
  const cotizacion = await reservas.cotizarParaReserva({ fechaDesde: desde, fechaHasta: hasta, habitaciones, planTarifarioId: plan.id, canal: "RECEPCION" });
  const total = cotizacion.planes[0].total;
  const alta = { fechaDesde: desde, fechaHasta: hasta, habitaciones, planTarifarioId: plan.id, totalEsperado: total, huesped: TITULARES[caso.clave], origen: "RECEPCION" };
  let reserva;
  if (caso.senia) {
    const importe = Math.round((total * 0.2) / 100) * 100;
    const medio =
      caso.senia === "tarjeta"
        ? { tipo: "Tarjeta crédito", importe, referencia: "VISA ****4242 · aut. 552143" }
        : { tipo: "Transferencia", importe };
    reserva = await reservas.crearReservaConSena({ ...alta, medios: [medio] });
  } else {
    reserva = await reservas.crearReserva(alta);
  }
  const titular = await prisma.huesped.findFirst({ where: { numeroDocumento: TITULARES[caso.clave].numeroDocumento }, select: { id: true } });
  if (titular && !manifiesto.huespedes.includes(titular.id)) manifiesto.huespedes.push(titular.id);
  const previa = manifiesto.reservas[caso.clave];
  if (previa && previa !== reserva.id && !manifiesto.anteriores.includes(previa)) manifiesto.anteriores.push(previa);
  manifiesto.reservas[caso.clave] = reserva.id;
  return reserva;
}

// Corre todas las fechas de una reserva (y de su estadía) `dias` días. En un solo paso por tabla.
async function correrFechas(reservaId, dias) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.reserva.findUnique({ where: { id: reservaId }, include: { reservaHabitaciones: true } });
    const ms = dias * DIA;
    await tx.reserva.update({
      where: { id: reservaId },
      data: { fechaDesde: new Date(r.fechaDesde.getTime() + ms), fechaHasta: new Date(r.fechaHasta.getTime() + ms) },
    });
    const ids = r.reservaHabitaciones.map((rh) => rh.id);
    // Orden para no chocar con el índice único (reservaHabitacionId, fecha) al correr las noches.
    const orden = Prisma.raw(dias < 0 ? "ASC" : "DESC");
    await tx.$executeRaw`UPDATE reservas_noche SET fecha = DATE_ADD(fecha, INTERVAL ${dias} DAY) WHERE reservaHabitacionId IN (${Prisma.join(ids)}) ORDER BY fecha ${orden}`;
    await tx.$executeRaw`UPDATE ocupantes_reserva SET fechaDesde = DATE_ADD(fechaDesde, INTERVAL ${dias} DAY), fechaHasta = DATE_ADD(fechaHasta, INTERVAL ${dias} DAY), ingresoReal = DATE_ADD(ingresoReal, INTERVAL ${dias} DAY), salidaReal = DATE_ADD(salidaReal, INTERVAL ${dias} DAY), verificadoEn = DATE_ADD(verificadoEn, INTERVAL ${dias} DAY) WHERE reservaId = ${reservaId}`;
    await tx.$executeRaw`UPDATE asignaciones_ocupantes a JOIN ocupantes_reserva o ON o.id = a.ocupanteId SET a.desde = DATE_ADD(a.desde, INTERVAL ${dias} DAY), a.hasta = DATE_ADD(a.hasta, INTERVAL ${dias} DAY) WHERE o.reservaId = ${reservaId}`;
    await tx.$executeRaw`UPDATE pagos_estadia SET fecha = DATE_ADD(fecha, INTERVAL ${dias} DAY) WHERE reservaId = ${reservaId}`;
    await tx.$executeRaw`UPDATE eventos_estadia SET fecha = DATE_ADD(fecha, INTERVAL ${dias} DAY) WHERE reservaId = ${reservaId}`;
    await tx.$executeRaw`UPDATE notificaciones SET fechaEnvio = DATE_ADD(fechaEnvio, INTERVAL ${dias} DAY) WHERE reservaId = ${reservaId}`;
    await tx.$executeRaw`UPDATE cargos_verificacion_checkout SET fechaHora = DATE_ADD(fechaHora, INTERVAL ${dias} DAY) WHERE reservaId = ${reservaId}`;
  });
}

// Caso f: estadía anterior ya cerrada (check-in, pago, verificación y check-out reales), corrida
// 30 días atrás. El check-out no emite comprobantes (se emiten aparte), así que ninguna numeración
// correlativa queda fuera de orden; los pagos se corren de fecha para no aparecer en la caja de hoy.
async function crearEstadiaAnterior(manifiesto) {
  const caso = { clave: "f", plan: "BAR", noches: 2, habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }] };
  const reserva = await crearReservaCaso(manifiesto, caso);
  const habitacionId = reserva.habitaciones[0].id;
  const t = TITULARES.f;
  const [nombre, apellido] = t.nombre.split(" ");
  const personas = [
    { id: 1, habitacionId, esTitular: true, nombre, apellido, tipoDocumento: t.tipoDocumento, paisDocumento: t.paisDocumento, numeroDocumento: t.numeroDocumento, fechaNacimiento: t.fechaNacimiento, nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", domicilio: "Av. Belgrano 1250", telefono: "+54 387 555-0142", email: t.contacto },
    { id: 2, habitacionId, esTitular: false, nombre: "Javier", apellido: "Paz", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99784206", fechaNacimiento: haceAnios(41), nacionalidad: "AR", paisResidencia: "AR" },
  ];
  await checkin.confirmarCheckInConReserva({
    reservaId: reserva.id,
    operador: OPERADOR,
    habitaciones: [{ habitacionIdAnterior: habitacionId, adultos: 2, menores: 0 }],
    personas,
    totalEsperado: reserva.totalEstimadoAlojamiento,
    garantiaConfirmada: true,
    medioGarantia: "Efectivo",
  });
  await checkout.registrarVerificacion(reserva.id, { habitacionId, tipo: "SinNovedades", registradoPor: OPERADOR });
  const cuenta = await checkout.consolidarCargos(reserva.id);
  if (cuenta.saldo > 0) await pagos.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: cuenta.saldo }] });
  await checkout.confirmarCheckOut(reserva.id, { cargosValidados: true });
  await correrFechas(reserva.id, -30);
  // La habitación queda "en limpieza" por el check-out de hoy: la estadía es de hace un mes.
  await prisma.habitacion.update({ where: { id: habitacionId }, data: { estado: "libre", estadoAnterior: null } });
  const acompanante = await prisma.huesped.findFirst({ where: { numeroDocumento: "99784206" }, select: { id: true } });
  if (acompanante && !manifiesto.huespedes.includes(acompanante.id)) manifiesto.huespedes.push(acompanante.id);
  return reserva;
}

// Una reserva es "de demo" solo si está en el manifiesto Y su titular tiene documento 99….
async function reservaDeDemo(id) {
  if (!id) return null;
  const r = await prisma.reserva.findUnique({ where: { id }, include: { huesped: true } });
  return r && String(r.huesped?.numeroDocumento ?? "").startsWith(PREFIJO) ? r : null;
}

async function anular(r) {
  await reservas.cancelarReserva(r.id, { motivoCancelacion: MOTIVO_BAJA });
  console.log(`  − ${r.codigoConfirmacion} anulada (${MOTIVO_BAJA})`);
}

async function limpiar() {
  const manifiesto = leerManifiesto();
  const enCurso = [];
  const ids = [...Object.entries(manifiesto.reservas), ...manifiesto.anteriores.map((id) => ["anterior", id])];
  for (const [caso, id] of ids) {
    const r = await reservaDeDemo(id);
    if (!r) continue;
    if (r.estado === "Confirmada") await anular(r);
    else if (r.estado === "En curso") enCurso.push(`${r.codigoConfirmacion}${caso === "anterior" ? "" : ` (caso ${caso})`}`);
  }
  if (enCurso.length) console.log(`\nEstán En curso y hay que cerrarlas con check-out: ${enCurso.join(", ")}.`);
  console.log("Listo. Las habitaciones y personas de demo se conservan para la próxima corrida.");
}

async function sembrar() {
  const manifiesto = leerManifiesto();
  const enCurso = [];
  console.log(`Casos de demo del check-in para hoy (${enDias(0)}):`);

  // a–e: ingreso HOY. Se conserva la reserva del caso si ya es de hoy y sigue Confirmada.
  for (const caso of CASOS) {
    const previa = await reservaDeDemo(manifiesto.reservas[caso.clave]);
    if (previa?.estado === "Confirmada" && iso(previa.fechaDesde) === enDias(0)) {
      console.log(`  ↷ ${caso.clave}) ${previa.codigoConfirmacion} ya está lista — ${caso.descripcion}`);
      continue;
    }
    if (previa?.estado === "Confirmada") await anular(previa);
    if (previa?.estado === "En curso") enCurso.push(previa.codigoConfirmacion);
    const r = await crearReservaCaso(manifiesto, caso);
    console.log(`  ✔ ${caso.clave}) ${r.codigoConfirmacion} — ${caso.descripcion}`);
    guardarManifiesto(manifiesto);
  }

  // f: estadía anterior cerrada (una sola vez).
  const anterior = await reservaDeDemo(manifiesto.reservas.f);
  if (anterior?.estado === "Cerrada") console.log(`  ↷ f) ${anterior.codigoConfirmacion} estadía anterior ya cerrada`);
  else {
    const r = await crearEstadiaAnterior(manifiesto);
    console.log(`  ✔ f) ${r.codigoConfirmacion} — estadía anterior cerrada (hace 30 días)`);
    guardarManifiesto(manifiesto);
  }

  // g: Confirmada con ingreso AYER, sin check-in (para el aviso de no-show).
  const ayer = await reservaDeDemo(manifiesto.reservas.g);
  if (ayer?.estado === "Confirmada" && iso(ayer.fechaDesde) === enDias(-1)) console.log(`  ↷ g) ${ayer.codigoConfirmacion} ingreso de ayer ya está`);
  else {
    if (ayer?.estado === "Confirmada") await anular(ayer);
    const caso = { clave: "g", plan: "BAR", noches: 2, habitaciones: [{ tipo: "Simple", adultos: 1, menores: 0 }] };
    const r = await crearReservaCaso(manifiesto, caso);
    await correrFechas(r.id, -1);
    console.log(`  ✔ g) ${r.codigoConfirmacion} — confirmada con ingreso ayer, sin check-in`);
    guardarManifiesto(manifiesto);
  }

  // Al menos 4 habitaciones libres para el walk-in: 2 Doble y 2 Simple.
  console.log("\nHabitaciones libres para el walk-in:");
  for (const [nombre, capacidad] of [["Doble", 3], ["Simple", 2]]) {
    const tipo = await tipoPorNombre(nombre);
    let libres = await libresHoy(tipo, 1, enDias(1));
    while (libres.length < 2) {
      await crearHabitacionDemo(manifiesto, tipo, capacidad);
      libres = await libresHoy(tipo, 1, enDias(1));
    }
    console.log(`  ${nombre}: ${libres.map((h) => h.numero).join(", ")}`);
  }
  guardarManifiesto(manifiesto);

  for (const id of manifiesto.anteriores) {
    const r = await reservaDeDemo(id);
    if (r?.estado === "En curso" && !enCurso.includes(r.codigoConfirmacion)) enCurso.push(r.codigoConfirmacion);
  }
  if (enCurso.length) console.log(`\nDe corridas anteriores quedaron En curso (cerrarlas con check-out): ${enCurso.join(", ")}.`);
  console.log(`\nPersona que vuelve: DNI ${TITULARES.f.numeroDocumento} (Argentina) — ${TITULARES.f.nombre}.`);
  console.log("Cargala como acompañante en cualquier llegada de hoy para ver la ficha encontrada.");
}

(process.argv.includes("--limpiar") ? limpiar() : sembrar())
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Error en seed-checkin-demo:", error.message ?? error);
    await prisma.$disconnect();
    process.exit(1);
  });
