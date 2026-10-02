// scripts/seed-checkin-demo.js — datos de demo del check-in (pantalla única), con fechas
// relativas al día en que se corre. Pensado para la mañana de la presentación: ver
// docs/demo-checkin.md.
//
//   npm run seed:checkin-demo              crea o actualiza los casos de HOY
//   npm run seed:checkin-demo -- --limpiar  anula las Confirmadas de demo y cierra con check-out
//                                           real las estadías de demo En curso
//
// Mañana de la presentación: primero --limpiar y después sin argumentos (docs/demo-checkin.md).
// Todo caso que lista queda usable: ninguna de sus personas está alojada en otra estadía (si lo
// está, el caso se recrea con personas nuevas y lo informa). Un error en un caso no corta el
// script: se informa, se sigue con el resto y el código de salida es distinto de 0.
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
  // `personas`: las personas vigentes de cada caso (cambian si las anteriores quedaron alojadas).
  // `pagosDemo`: pagos en efectivo que registró --limpiar para cerrar estadías de demo.
  return {
    reservas: m.reservas ?? {},
    anteriores: m.anteriores ?? [],
    huespedes: m.huespedes ?? [],
    habitaciones: m.habitaciones ?? [],
    personas: m.personas ?? {},
    pagosDemo: m.pagosDemo ?? [],
  };
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
  i: { nombre: "Valeria Ríos", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99627351", fechaNacimiento: haceAnios(37), contacto: "valeria.rios@correo.com.ar" },
  g: { nombre: "Pedro Vargas", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99290417", fechaNacimiento: haceAnios(51), contacto: "+54 11 555-0190" },
};

// Acompañantes fijos de los casos que se crean con check-in real (f: estadía anterior; i: en curso).
const ACOMPANANTES = {
  f: { nombre: "Javier", apellido: "Paz", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99784206", fechaNacimiento: haceAnios(41) },
  i: { nombre: "Andrés", apellido: "Molina", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99627352", fechaNacimiento: haceAnios(39) },
};
// Nombres para reemplazar a personas que siguen alojadas en otra estadía de demo.
const NOMBRES_NUEVOS = [
  ["Julieta", "Sosa"], ["Tomás", "Aguirre"], ["Camila", "Benítez"], ["Nicolás", "Herrera"], ["Florencia", "Medina"],
  ["Matías", "Romero"], ["Agustina", "Castro"], ["Lautaro", "Giménez"], ["Rocío", "Domínguez"], ["Facundo", "Ortiz"],
  ["Micaela", "Ledesma"], ["Santiago", "Acosta"], ["Paula", "Quiroga"], ["Joaquín", "Villalba"], ["Abril", "Navarro"],
];

// Personas vigentes de un caso: las del manifiesto (si se renovaron) o las fijas.
function personasDelCaso(manifiesto, clave) {
  return manifiesto.personas[clave] ?? { titular: TITULARES[clave], ...(ACOMPANANTES[clave] ? { acompanante: ACOMPANANTES[clave] } : {}) };
}
const nombreCompleto = (persona) => (persona.apellido ? `${persona.nombre} ${persona.apellido}` : persona.nombre);

// ¿Alguna persona del caso está alojada en una estadía que no es la del propio caso?
async function alojadasEnOtraEstadia(manifiesto, clave, reservaPropiaId = null) {
  const personas = Object.values(personasDelCaso(manifiesto, clave));
  const alojadas = await prisma.ocupanteReserva.findMany({
    where: {
      identidadActiva: { not: null },
      ...(reservaPropiaId ? { reservaId: { not: reservaPropiaId } } : {}),
      OR: personas.map((p) => ({ tipoDocumento: p.tipoDocumento, numeroDocumento: p.numeroDocumento })),
    },
    select: { nombre: true, apellido: true, reserva: { select: { codigoConfirmacion: true } } },
  });
  return alojadas;
}

// Documento 99… que no usa nadie (ni como huésped ni como ocupante). Pasaporte: 99F + 5 dígitos.
async function documentoLibre(tipoDocumento = "DNI") {
  for (;;) {
    const azar = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0");
    const numero = tipoDocumento === "Pasaporte" ? `99F${azar(5)}` : `99${azar(6)}`;
    const [h, o] = await Promise.all([
      prisma.huesped.count({ where: { numeroDocumento: numero } }),
      prisma.ocupanteReserva.count({ where: { numeroDocumento: numero } }),
    ]);
    if (!h && !o) return numero;
  }
}

// Personas nuevas para el caso (mismo tipo de persona: titular adulto y, si corresponde, acompañante).
async function renovarPersonas(manifiesto, clave) {
  const usados = new Set(Object.values(manifiesto.personas).flatMap((c) => Object.values(c).map(nombreCompleto)));
  const libres = NOMBRES_NUEVOS.filter(([n, a]) => !usados.has(`${n} ${a}`));
  const elegir = () => (libres.length ? libres.shift() : NOMBRES_NUEVOS[Math.floor(Math.random() * NOMBRES_NUEVOS.length)]);
  const actual = personasDelCaso(manifiesto, clave);
  const [n, a] = elegir();
  const titular = {
    ...actual.titular,
    nombre: `${n} ${a}`,
    numeroDocumento: await documentoLibre(actual.titular.tipoDocumento),
    contacto: actual.titular.contacto?.includes("@") ? `${n}.${a}@correo.com.ar`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : actual.titular.contacto,
  };
  const nuevas = { titular };
  if (actual.acompanante) {
    const [n2] = elegir();
    nuevas.acompanante = { ...actual.acompanante, nombre: n2, apellido: a, numeroDocumento: await documentoLibre() };
  }
  manifiesto.personas[clave] = nuevas;
  return nuevas;
}

// Antes de reutilizar o crear un caso: si alguna persona está alojada en otra estadía, el caso
// pasa a usar personas nuevas. Devuelve el aviso para la salida o null.
async function asegurarPersonasLibres(manifiesto, clave, reservaPropiaId = null) {
  const alojadas = await alojadasEnOtraEstadia(manifiesto, clave, reservaPropiaId);
  if (!alojadas.length) return null;
  const codigos = [...new Set(alojadas.map((o) => o.reserva.codigoConfirmacion))].join(", ");
  await renovarPersonas(manifiesto, clave);
  return `recreado con personas nuevas: las anteriores siguen alojadas en ${codigos}`;
}

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
  const alta = { fechaDesde: desde, fechaHasta: hasta, habitaciones, planTarifarioId: plan.id, totalEsperado: total, huesped: personasDelCaso(manifiesto, caso.clave).titular, origen: "RECEPCION" };
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
  const titular = await prisma.huesped.findFirst({ where: { numeroDocumento: personasDelCaso(manifiesto, caso.clave).titular.numeroDocumento }, select: { id: true } });
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
  const { titular: t, acompanante: ac } = personasDelCaso(manifiesto, "f");
  const [nombre, apellido] = t.nombre.split(" ");
  const personas = [
    { id: 1, habitacionId, esTitular: true, nombre, apellido, tipoDocumento: t.tipoDocumento, paisDocumento: t.paisDocumento, numeroDocumento: t.numeroDocumento, fechaNacimiento: t.fechaNacimiento, nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", domicilio: "Av. Belgrano 1250", telefono: "+54 387 555-0142", email: t.contacto },
    { id: 2, habitacionId, esTitular: false, ...ac, nacionalidad: "AR", paisResidencia: "AR" },
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
  const acompanante = await prisma.huesped.findFirst({ where: { numeroDocumento: ac.numeroDocumento }, select: { id: true } });
  if (acompanante && !manifiesto.huespedes.includes(acompanante.id)) manifiesto.huespedes.push(acompanante.id);
  return reserva;
}

// Caso i: check-in real de hoy (2 adultos en una Doble de capacidad 3, 3 noches), para probar
// "Agregar persona" con la estadía en curso (persona adicional con cargo en la cuenta).
async function crearEstadiaEnCursoHoy(manifiesto) {
  const caso = { clave: "i", plan: "BAR", noches: 3, habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0, capacidadExacta: 3 }] };
  const reserva = await crearReservaCaso(manifiesto, caso);
  const habitacionId = reserva.habitaciones[0].id;
  const { titular: t, acompanante: ac } = personasDelCaso(manifiesto, "i");
  const [nombre, apellido] = t.nombre.split(" ");
  const personas = [
    { id: 1, habitacionId, esTitular: true, nombre, apellido, tipoDocumento: t.tipoDocumento, paisDocumento: t.paisDocumento, numeroDocumento: t.numeroDocumento, fechaNacimiento: t.fechaNacimiento, nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", domicilio: "Caseros 845", telefono: "+54 387 555-0161", email: t.contacto },
    { id: 2, habitacionId, esTitular: false, ...ac, nacionalidad: "AR", paisResidencia: "AR" },
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
  const acompanante = await prisma.huesped.findFirst({ where: { numeroDocumento: ac.numeroDocumento }, select: { id: true } });
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

// Cierra una estadía de demo En curso con el flujo real de check-out: verificación "sin novedades"
// de cada habitación que no la tenga, pago de demo en efectivo por el saldo (queda en el
// manifiesto) y confirmación del check-out (las personas quedan retiradas, sin estadía activa).
async function cerrarConCheckOut(manifiesto, r) {
  let cuenta = await checkout.consolidarCargos(r.id);
  for (const h of cuenta.habitaciones) {
    const verificada = cuenta.verificaciones.some(
      (v) => v.habitacionId === h.habitacionId || (!v.habitacionId && cuenta.habitaciones.length === 1),
    );
    if (!verificada)
      await checkout.registrarVerificacion(r.id, { habitacionId: h.habitacionId, tipo: "SinNovedades", registradoPor: OPERADOR });
  }
  cuenta = await checkout.consolidarCargos(r.id);
  let pagado = 0;
  if (cuenta.saldo > 0) {
    const pago = await pagos.crearPago({ reservaId: r.id, medios: [{ tipo: "Efectivo", importe: cuenta.saldo }] });
    pagado = cuenta.saldo;
    manifiesto.pagosDemo.push({ reservaId: r.id, codigo: r.codigoConfirmacion, pagoId: pago?.id ?? null, importe: cuenta.saldo, medio: "Efectivo", fecha: new Date().toISOString() });
    guardarManifiesto(manifiesto);
  }
  await checkout.confirmarCheckOut(r.id, { cargosValidados: true });
  return pagado;
}

async function limpiar() {
  const manifiesto = leerManifiesto();
  const noCerradas = [];
  const ids = [...Object.entries(manifiesto.reservas), ...manifiesto.anteriores.map((id) => ["anterior", id])];
  const vistos = new Set();
  console.log("Limpieza de los datos de demo del check-in:");
  for (const [caso, id] of ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    const r = await reservaDeDemo(id);
    if (!r) continue;
    const etiqueta = `${r.codigoConfirmacion}${caso === "anterior" ? "" : ` (caso ${caso})`}`;
    try {
      if (r.estado === "Confirmada") await anular(r);
      else if (r.estado === "En curso") {
        const pagado = await cerrarConCheckOut(manifiesto, r);
        console.log(`  ✔ ${etiqueta} cerrada con check-out${pagado > 0 ? ` (pago de demo en efectivo: $ ${pagado.toLocaleString("es-AR")})` : ""}`);
      }
    } catch (error) {
      noCerradas.push(`${etiqueta}: ${error.message}`);
      console.log(`  ✖ ${etiqueta} no se pudo cerrar: ${error.message}`);
    }
  }
  guardarManifiesto(manifiesto);
  if (noCerradas.length) {
    console.log(`\nNo se pudieron cerrar solas (revisarlas desde Check-out):\n  ${noCerradas.join("\n  ")}`);
    process.exitCode = 1;
  }
  console.log("Listo. Las habitaciones y personas de demo se conservan para la próxima corrida.");
}

async function sembrar() {
  const manifiesto = leerManifiesto();
  const enCurso = [];
  const fallas = [];
  console.log(`Casos de demo del check-in para hoy (${enDias(0).split("-").reverse().join("/")}):`);
  // Cada caso por separado: un error se informa y se sigue con los demás.
  async function caso(clave, fn) {
    try {
      await fn();
    } catch (error) {
      fallas.push(`${clave}) ${error.message}`);
      console.log(`  ✖ ${clave}) no se pudo preparar: ${error.message}`);
    } finally {
      guardarManifiesto(manifiesto);
    }
  }
  const conAviso = (aviso) => (aviso ? ` — ${aviso}` : "");

  // a–e, h: ingreso HOY. Se conserva la reserva si ya es de hoy, sigue Confirmada y sus personas
  // no están alojadas en otra estadía.
  for (const c of CASOS) {
    await caso(c.clave, async () => {
      const previa = await reservaDeDemo(manifiesto.reservas[c.clave]);
      if (previa?.estado === "En curso") enCurso.push(previa.codigoConfirmacion);
      const aviso = await asegurarPersonasLibres(manifiesto, c.clave);
      if (!aviso && previa?.estado === "Confirmada" && iso(previa.fechaDesde) === enDias(0)) {
        console.log(`  ↷ ${c.clave}) ${previa.codigoConfirmacion} ya está lista — ${c.descripcion}`);
        return;
      }
      if (previa?.estado === "Confirmada") await anular(previa);
      const r = await crearReservaCaso(manifiesto, c);
      console.log(`  ✔ ${c.clave}) ${r.codigoConfirmacion} — ${c.descripcion}${conAviso(aviso)}`);
    });
  }

  // f: estadía anterior cerrada. Sus personas son "la persona que vuelve": sin estadía activa.
  await caso("f", async () => {
    const anterior = await reservaDeDemo(manifiesto.reservas.f);
    const aviso = await asegurarPersonasLibres(manifiesto, "f");
    if (!aviso && anterior?.estado === "Cerrada") {
      console.log(`  ↷ f) ${anterior.codigoConfirmacion} estadía anterior ya cerrada`);
      return;
    }
    const r = await crearEstadiaAnterior(manifiesto);
    console.log(`  ✔ f) ${r.codigoConfirmacion} — estadía anterior cerrada (hace 30 días)${conAviso(aviso)}`);
  });

  // g: Confirmada con ingreso AYER, sin check-in (para el aviso de no-show).
  await caso("g", async () => {
    const ayer = await reservaDeDemo(manifiesto.reservas.g);
    if (ayer?.estado === "En curso") enCurso.push(ayer.codigoConfirmacion);
    const aviso = await asegurarPersonasLibres(manifiesto, "g");
    if (!aviso && ayer?.estado === "Confirmada" && iso(ayer.fechaDesde) === enDias(-1)) {
      console.log(`  ↷ g) ${ayer.codigoConfirmacion} ingreso de ayer ya está`);
      return;
    }
    if (ayer?.estado === "Confirmada") await anular(ayer);
    const datos = { clave: "g", plan: "BAR", noches: 2, habitaciones: [{ tipo: "Simple", adultos: 1, menores: 0 }] };
    const r = await crearReservaCaso(manifiesto, datos);
    await correrFechas(r.id, -1);
    console.log(`  ✔ g) ${r.codigoConfirmacion} — confirmada con ingreso ayer, sin check-in${conAviso(aviso)}`);
  });

  // i: estadía En curso desde hoy (Doble, 2 adultos, 3 noches), para sumar una persona adicional.
  // Sus personas pueden estar alojadas en la propia estadía del caso, en ninguna otra.
  await caso("i", async () => {
    const previa = await reservaDeDemo(manifiesto.reservas.i);
    const vigente = previa?.estado === "En curso" && iso(previa.fechaDesde) === enDias(0);
    const aviso = await asegurarPersonasLibres(manifiesto, "i", vigente ? previa.id : null);
    if (!aviso && vigente) {
      console.log(`  ↷ i) ${previa.codigoConfirmacion} estadía en curso de hoy ya está`);
      return;
    }
    if (previa?.estado === "Confirmada") await anular(previa);
    if (previa?.estado === "En curso") enCurso.push(previa.codigoConfirmacion);
    const r = await crearEstadiaEnCursoHoy(manifiesto);
    console.log(`  ✔ i) ${r.codigoConfirmacion} — en curso desde hoy, Doble con 2 adultos y 3 noches (persona adicional)${conAviso(aviso)}`);
  });

  // Al menos 4 habitaciones libres para el walk-in: 2 Doble y 2 Simple.
  console.log("\nHabitaciones libres para el walk-in:");
  for (const [nombre, capacidad] of [["Doble", 3], ["Simple", 2]]) {
    await caso(`walk-in ${nombre}`, async () => {
      const tipo = await tipoPorNombre(nombre);
      let libres = await libresHoy(tipo, 1, enDias(1));
      while (libres.length < 2) {
        await crearHabitacionDemo(manifiesto, tipo, capacidad);
        libres = await libresHoy(tipo, 1, enDias(1));
      }
      console.log(`  ${nombre}: ${libres.map((h) => h.numero).join(", ")}`);
    });
  }

  for (const id of manifiesto.anteriores) {
    const r = await reservaDeDemo(id);
    if (r?.estado === "En curso" && !enCurso.includes(r.codigoConfirmacion)) enCurso.push(r.codigoConfirmacion);
  }
  const casoI = await reservaDeDemo(manifiesto.reservas.i);
  const pendientes = enCurso.filter((codigo) => codigo !== casoI?.codigoConfirmacion);
  if (pendientes.length)
    console.log(`\nDe corridas anteriores quedaron En curso (las cierra "-- --limpiar"): ${[...new Set(pendientes)].join(", ")}.`);
  const vuelve = personasDelCaso(manifiesto, "f").titular;
  console.log(`\nPersona que vuelve: ${vuelve.tipoDocumento} ${vuelve.numeroDocumento} (Argentina) — ${vuelve.nombre}.`);
  console.log("Cargala como acompañante en cualquier llegada de hoy para ver la ficha encontrada.");
  if (fallas.length) {
    console.log(`\nCasos con error (${fallas.length}):\n  ${fallas.join("\n  ")}`);
    process.exitCode = 1;
  }
}

(process.argv.includes("--limpiar") ? limpiar() : sembrar())
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("Error en seed-checkin-demo:", error.message ?? error);
    await prisma.$disconnect();
    process.exit(1);
  });
