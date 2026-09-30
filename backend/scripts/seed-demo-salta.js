// scripts/seed-demo-salta.js
//
// Datos de demostración — Etapa 4C (cierre del módulo de tarifas por
// temporada). Carga un calendario realista de temporadas de Salta para lo
// que resta de 2026 y todo 2027, tarifas coherentes para cada tipo de
// habitación activo, el modificador de fin de semana, y entre 6 y 10
// reservas de ejemplo creadas a través del servicio real (nunca con un
// insert directo), para que sus ReservaNoche salgan del motor de
// cotización igual que en producción.
//
// Idempotente: cada temporada se busca por nombre antes de crearla (si ya
// existe — ej. "Media agosto-noviembre 2027" o "Milagro de Salta 2027",
// sembradas a mano durante la verificación manual de etapas anteriores —
// no se toca); cada tarifa se busca por (tipoHabitacionId, temporadaId)
// antes de crear una versión nueva; las reservas de demostración usan
// huéspedes con nombre "DEMO ..." y documento fijo — antes de crear cada
// una, el script busca si ese documento ya tiene alguna reserva y la
// saltea si es así. Correrlo dos veces no duplica nada (verificado
// corriéndolo dos veces seguidas).
//
// Se niega a correr con NODE_ENV=production (mismo patrón que
// seed-usuarios-prueba.js).
//
//   node scripts/seed-demo-salta.js

require("dotenv").config();

if (process.env.NODE_ENV === "production") {
  console.error(
    "seed-demo-salta.js crea datos de demostración (temporadas, tarifas y reservas de ejemplo): " +
      "nunca se corre con NODE_ENV=production. Abortado."
  );
  process.exit(1);
}

const prisma = require("../src/lib/prisma");
const reservasServicio = require("../src/modulos/reservas/reservas.servicio");
const { listarPlanesTarifarios } = require("../src/modulos/tarifas/planesTarifarios.servicio");
const { redondearAMultiploDe100 } = require("../src/modulos/tarifas/redondeo");
const { MODO_AJUSTE_PRECIO } = require("../src/modulos/tarifas/tarifas.constantes");

function fecha(iso) {
  return new Date(`${iso}T00:00:00.000Z`);
}

// --------------------------------------------------------------
// 1. Temporadas — calendario 2026 (resto del año) + 2027 completo.
//
// Fuente de las fechas verificables contra el calendario oficial de
// feriados de Argentina (WebSearch, 2026-09-30):
//   - 12/10/2026 (lunes, Día del Respeto a la Diversidad Cultural),
//     23/11/2026 (lunes, Día de la Soberanía Nacional trasladado) y
//     7-8/12/2026 (lunes no laborable + Inmaculada Concepción) son los 3
//     fines de semana largos oficiales que quedan en 2026 desde hoy.
//   - Carnaval 2027: lunes 8 y martes 9 de febrero — fin de semana largo
//     de 4 días (sábado 6 a martes 9). El calendario oficial 2027 todavía
//     no está confirmado por el Gobierno a la fecha de este seed; esta
//     fecha es la estimación eclesiástica estándar (fija respecto de la
//     Pascua), la misma que usan los sitios de turismo consultados.
// Semana Santa (21-28/3/2027) y Güemes (16-17/6/2027) vienen dados
// directamente en el pedido de la Etapa 4C, no se verifican acá.
//
// VERIFICAR: vacaciones de invierno 2027 — dependen del calendario escolar
// del Ministerio de Educación de Salta, que todavía no está publicado para
// 2027. Se usa un rango de ejemplo (segunda quincena de julio, patrón
// habitual de los últimos años) — ajustar cuando el equipo tenga la fecha
// oficial.
// --------------------------------------------------------------
const TEMPORADAS_DEMO = [
  {
    nombre: "Fin de semana largo 12 de octubre 2026",
    nivel: "MEDIA",
    fechaDesde: "2026-10-10",
    fechaHasta: "2026-10-12",
  },
  {
    nombre: "Fin de semana largo 23 de noviembre 2026",
    nivel: "MEDIA",
    fechaDesde: "2026-11-21",
    fechaHasta: "2026-11-23",
  },
  {
    nombre: "Fin de semana largo 8 de diciembre 2026",
    nivel: "MEDIA",
    fechaDesde: "2026-12-05",
    fechaHasta: "2026-12-08",
  },
  {
    nombre: "Fin de año y enero 2027",
    nivel: "ALTA",
    fechaDesde: "2026-12-20",
    fechaHasta: "2027-01-31",
  },
  {
    nombre: "Carnaval 2027",
    nivel: "MEDIA",
    fechaDesde: "2027-02-06",
    fechaHasta: "2027-02-09",
  },
  {
    nombre: "Semana Santa 2027",
    nivel: "ALTA",
    fechaDesde: "2027-03-21",
    fechaHasta: "2027-03-28",
  },
  {
    nombre: "Güemes 2027",
    nivel: "EVENTO",
    fechaDesde: "2027-06-16",
    fechaHasta: "2027-06-17",
  },
  {
    // VERIFICAR fechas del calendario escolar de Salta 2027 (ver nota de
    // arriba) — rango de ejemplo, segunda quincena de julio.
    nombre: "Vacaciones de invierno 2027",
    nivel: "ALTA",
    fechaDesde: "2027-07-12",
    fechaHasta: "2027-07-25",
  },
  // "Media agosto-noviembre 2027" y "Milagro de Salta 2027" (EVENTO,
  // estadía mínima 3) ya existen — sembradas a mano durante la
  // verificación manual de las Etapas 3/4A/4B sobre esta misma base. Se
  // buscan por nombre y se reutilizan, no se duplican.
];

async function asegurarTemporada(datos) {
  const existente = await prisma.temporada.findFirst({ where: { nombre: datos.nombre } });
  if (existente) return { fila: existente, creada: false };
  const fila = await prisma.temporada.create({
    data: {
      nombre: datos.nombre,
      nivel: datos.nivel,
      fechaDesde: fecha(datos.fechaDesde),
      fechaHasta: fecha(datos.fechaHasta),
      estadiaMinima: datos.estadiaMinima ?? null,
      cierreLlegada: false,
      activa: true,
      creadoPor: "seed-demo-salta",
    },
  });
  return { fila, creada: true };
}

// --------------------------------------------------------------
// 2. Tarifas coherentes — un multiplicador por nivel sobre el precio BASE
// que ya tenga cada tipo (o un default razonable si el tipo todavía no
// tiene ninguna tarifa cargada), redondeado al múltiplo de $100. Así el
// seed no depende de conocer de antemano los nombres de los tipos de
// habitación (útil también para cuando corra contra la base compartida,
// con su propio catálogo real) y la relación BASE < MEDIA < ALTA < EVENTO
// queda garantizada por construcción.
//
// Precios de EJEMPLO — ajustar a la política comercial real del hotel.
// --------------------------------------------------------------
const MULTIPLICADOR_NIVEL = { BAJA: 0.9, MEDIA: 1.2, ALTA: 1.5, EVENTO: 1.9 };
const PRECIO_BASE_DEFAULT = 45000;
const ADICIONAL_BASE_DEFAULT = 4500;

async function precioBaseDelTipo(tipoHabitacionId, temporadaBaseId) {
  const vigente = await prisma.tarifa.findFirst({
    where: { tipoHabitacionId, temporadaId: temporadaBaseId },
    orderBy: { vigenteDesde: "desc" },
  });
  if (vigente) return { precioBase: Number(vigente.precioBase), adicionalAdultoExtra: Number(vigente.adicionalAdultoExtra) };
  return { precioBase: PRECIO_BASE_DEFAULT, adicionalAdultoExtra: ADICIONAL_BASE_DEFAULT };
}

async function asegurarTarifa(tipoHabitacionId, temporada, precioBaseTipo) {
  const yaTiene = await prisma.tarifa.findFirst({ where: { tipoHabitacionId, temporadaId: temporada.id } });
  if (yaTiene) return { fila: yaTiene, creada: false };
  const multiplicador = temporada.nivel === "BASE" ? 1 : MULTIPLICADOR_NIVEL[temporada.nivel] ?? 1;
  const precioBase = Number(redondearAMultiploDe100(precioBaseTipo.precioBase * multiplicador));
  const adicionalAdultoExtra = Number(redondearAMultiploDe100(precioBaseTipo.adicionalAdultoExtra * multiplicador));
  const fila = await prisma.tarifa.create({
    data: {
      tipoHabitacionId,
      temporadaId: temporada.id,
      precioBase,
      adicionalAdultoExtra,
      // Vigente desde hoy — precios de ejemplo, se pueden versionar más
      // adelante con una actualización masiva real (HU-93) sin tocar este
      // seed.
      vigenteDesde: require("../src/lib/fechas").hoyComoFechaUTC(),
      creadoPor: "seed-demo-salta",
    },
  });
  return { fila, creada: true };
}

// --------------------------------------------------------------
// 3. Modificador de fin de semana — viernes y sábado +10% (el resto de
// seed-tarifas.js ya los deja en 0%, no se tocan).
// --------------------------------------------------------------
async function asegurarModificadorFinDeSemana() {
  for (const diaSemana of [5, 6]) {
    await prisma.modificadorDiaSemana.upsert({
      where: { diaSemana },
      update: { porcentaje: 10 },
      create: { diaSemana, porcentaje: 10 },
    });
  }
}

// --------------------------------------------------------------
// 4. Reservas de demostración — SIN seña (alta normal de mostrador,
// crearReserva/cotizarParaReserva reales — nunca crearReservaConSena: el
// equipo de garantía va a eliminar la seña, y este seed no puede depender
// de algo que está por desaparecer). Huéspedes "DEMO ..." con documento
// fijo para poder detectar en la próxima corrida si ya se creó cada una.
// --------------------------------------------------------------

async function reservaDemoYaExiste(numeroDocumento) {
  const huesped = await prisma.huesped.findFirst({ where: { numeroDocumento } });
  if (!huesped) return false;
  const alguna = await prisma.reserva.findFirst({ where: { huespedId: huesped.id } });
  return Boolean(alguna);
}

async function elegirHabitaciones({ tipoNombre, fechaDesde, fechaHasta, adultos, menores, cantidad = 1 }) {
  const tipo = await prisma.tipoHabitacion.findFirst({ where: { nombre: tipoNombre, activo: true } });
  if (!tipo) throw new Error(`No existe (o no está activo) el tipo de habitación "${tipoNombre}".`);
  const disponibilidad = await reservasServicio.consultarDisponibilidad({
    fechaDesde,
    fechaHasta,
    tipoHabitacionId: tipo.id,
    capacidadMinima: adultos + menores,
    adultos,
    menores,
    canal: "RECEPCION",
  });
  if (disponibilidad.habitaciones.length < cantidad) {
    throw new Error(
      `No hay ${cantidad} habitación/es libres de tipo "${tipoNombre}" para ${fechaDesde} al ${fechaHasta} ` +
        `(hay ${disponibilidad.habitaciones.length}).`
    );
  }
  return disponibilidad.habitaciones.slice(0, cantidad).map((h) => ({ habitacionId: h.id, adultos, menores }));
}

// `elegirHabitaciones` viaja como función (no ya resuelta): si la reserva
// ya existe, el chequeo de idempotencia de abajo tiene que poder saltear
// TODO el resto sin haber consultado disponibilidad — si no, una segunda
// corrida falla igual al intentar elegir una habitación que la primera
// corrida ya dejó ocupada, aunque la reserva en sí se vaya a saltear.
async function crearReservaDemo({ nombre, numeroDocumento, contacto, fechaDesde, fechaHasta, elegirHabitaciones: elegir, planCodigo }) {
  if (await reservaDemoYaExiste(numeroDocumento)) {
    console.log(`  ↷ ${nombre} (documento ${numeroDocumento}) ya existe, se saltea.`);
    return null;
  }
  const habitaciones = await elegir();
  const planes = await listarPlanesTarifarios({ activo: "true" });
  const plan = planes.find((p) => p.codigo === planCodigo);
  if (!plan) throw new Error(`No existe el plan tarifario "${planCodigo}".`);

  const cotizacion = await reservasServicio.cotizarParaReserva({
    fechaDesde,
    fechaHasta,
    planTarifarioId: plan.id,
    habitaciones,
    canal: "RECEPCION",
  });
  const cotizadoPlan = cotizacion.planes.find((p) => p.codigo === planCodigo);
  if (!cotizadoPlan) {
    throw new Error(`El plan "${planCodigo}" no está disponible para ${nombre} en ${fechaDesde}-${fechaHasta}.`);
  }

  const reserva = await reservasServicio.crearReserva({
    fechaDesde,
    fechaHasta,
    habitaciones,
    planTarifarioId: plan.id,
    totalEsperado: cotizadoPlan.total,
    huesped: { nombre, tipoDocumento: "DNI", numeroDocumento, contacto },
    origen: "RECEPCION",
  });
  console.log(`  ✔ ${nombre} — ${reserva.codigoConfirmacion} — ${fechaDesde} al ${fechaHasta} — $${reserva.totalEstimadoAlojamiento}`);
  return reserva;
}

async function crearReservasDemo() {
  const resultados = [];

  // (a) Cruce MEDIA → EVENTO Milagro de Salta 2027.
  resultados.push(
    await crearReservaDemo({
      nombre: "DEMO Cruce Milagro de Salta",
      numeroDocumento: "90000001",
      contacto: "demo1@hotelhi.test",
      fechaDesde: "2027-09-10",
      fechaHasta: "2027-09-16",
      elegirHabitaciones: () => elegirHabitaciones({
        tipoNombre: "Doble",
        fechaDesde: "2027-09-10",
        fechaHasta: "2027-09-16",
        adultos: 2,
        menores: 0,
      }),
      planCodigo: "BAR",
    })
  );

  // (b) NRF (no reembolsable) — dentro de Semana Santa 2027.
  resultados.push(
    await crearReservaDemo({
      nombre: "DEMO No Reembolsable Semana Santa",
      numeroDocumento: "90000002",
      contacto: "demo2@hotelhi.test",
      fechaDesde: "2027-03-22",
      fechaHasta: "2027-03-25",
      elegirHabitaciones: () => elegirHabitaciones({
        tipoNombre: "Doble",
        fechaDesde: "2027-03-22",
        fechaHasta: "2027-03-25",
        adultos: 2,
        menores: 0,
      }),
      planCodigo: "NRF",
    })
  );

  // (c) 2 habitaciones (reserva grupal) — dentro de Fin de año 2026-27.
  resultados.push(
    await crearReservaDemo({
      nombre: "DEMO Grupal Fin de Año",
      numeroDocumento: "90000003",
      contacto: "demo3@hotelhi.test",
      fechaDesde: "2026-12-27",
      fechaHasta: "2026-12-30",
      elegirHabitaciones: () => elegirHabitaciones({
        tipoNombre: "Doble",
        fechaDesde: "2026-12-27",
        fechaHasta: "2026-12-30",
        adultos: 2,
        menores: 0,
        cantidad: 2,
      }),
      planCodigo: "BAR",
    })
  );

  // (d) Con menores — dentro de Carnaval 2027. 2 adultos + 1 menor (no 2):
  // la capacidad máxima real de una Doble en este hotel es 3.
  resultados.push(
    await crearReservaDemo({
      nombre: "DEMO Familia con Menores Carnaval",
      numeroDocumento: "90000004",
      contacto: "demo4@hotelhi.test",
      fechaDesde: "2027-02-06",
      fechaHasta: "2027-02-09",
      elegirHabitaciones: () => elegirHabitaciones({
        tipoNombre: "Doble",
        fechaDesde: "2027-02-06",
        fechaHasta: "2027-02-09",
        adultos: 2,
        menores: 1,
      }),
      planCodigo: "BAR",
    })
  );

  // (e) Fin de año — la propia temporada ALTA "Fin de año y enero 2027",
  // en enero (distinta de la (c), que ya cubre las noches de fin de año).
  resultados.push(
    await crearReservaDemo({
      nombre: "DEMO Enero Alta Temporada",
      numeroDocumento: "90000005",
      contacto: "demo5@hotelhi.test",
      fechaDesde: "2027-01-08",
      fechaHasta: "2027-01-12",
      elegirHabitaciones: () => elegirHabitaciones({
        tipoNombre: "Doble",
        fechaDesde: "2027-01-08",
        fechaHasta: "2027-01-12",
        adultos: 2,
        menores: 0,
      }),
      planCodigo: "BAR",
    })
  );

  // (f) Ajuste manual de cortesía, hecho por el gerente de prueba —
  // Güemes 2027.
  const reservaParaCortesia = await crearReservaDemo({
    nombre: "DEMO Cortesía Gerente Güemes",
    numeroDocumento: "90000006",
    contacto: "demo6@hotelhi.test",
    fechaDesde: "2027-06-16",
    fechaHasta: "2027-06-18",
    elegirHabitaciones: () => elegirHabitaciones({
      tipoNombre: "Doble",
      fechaDesde: "2027-06-16",
      fechaHasta: "2027-06-18",
      adultos: 2,
      menores: 0,
    }),
    planCodigo: "BAR",
  });
  if (reservaParaCortesia) {
    const primeraNoche = reservaParaCortesia.habitaciones[0]?.reservaNoches[0];
    if (primeraNoche) {
      await reservasServicio.ajustarPrecioReserva(reservaParaCortesia.id, {
        nocheIds: [primeraNoche.id],
        modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
        valor: 0,
        motivo: "Cortesía de demostración — seed-demo-salta.js",
        usuario: "gerente.prueba",
      });
      console.log(`  ✔ Ajuste de cortesía aplicado sobre la reserva ${reservaParaCortesia.codigoConfirmacion} (noche del ${primeraNoche.fecha.toISOString?.() ?? primeraNoche.fecha}).`);
    }
  }
  resultados.push(reservaParaCortesia);

  // (g) Vacaciones de invierno 2027 (calendario "VERIFICAR", ver arriba).
  resultados.push(
    await crearReservaDemo({
      nombre: "DEMO Vacaciones de Invierno",
      numeroDocumento: "90000007",
      contacto: "demo7@hotelhi.test",
      fechaDesde: "2027-07-15",
      fechaHasta: "2027-07-18",
      elegirHabitaciones: () => elegirHabitaciones({
        tipoNombre: "Doble",
        fechaDesde: "2027-07-15",
        fechaHasta: "2027-07-18",
        adultos: 2,
        menores: 0,
      }),
      planCodigo: "BAR",
    })
  );

  return resultados.filter(Boolean);
}

// --------------------------------------------------------------

async function main() {
  console.log("Temporadas:");
  const temporadaBase = await prisma.temporada.findFirst({ where: { nivel: "BASE" } });
  if (!temporadaBase) {
    throw new Error("No existe la temporada Base — correr antes scripts/seed-tarifas.js.");
  }
  const temporadasCreadas = [];
  for (const datos of TEMPORADAS_DEMO) {
    const { fila, creada } = await asegurarTemporada(datos);
    console.log(`  ${creada ? "✔ creada" : "↷ ya existía"} — ${fila.nombre} (${fila.nivel})`);
    temporadasCreadas.push(fila);
  }
  // Suma también las que ya existían de etapas anteriores, para sembrarles
  // tarifa si les faltara.
  const otrasTemporadas = await prisma.temporada.findMany({
    where: { nivel: { not: "BASE" }, nombre: { in: ["Media agosto-noviembre 2027", "Milagro de Salta 2027"] } },
  });
  const temporadas = [...temporadasCreadas, ...otrasTemporadas];

  console.log("\nModificador de fin de semana (viernes/sábado +10%):");
  await asegurarModificadorFinDeSemana();
  console.log("  ✔ listo");

  console.log("\nTarifas:");
  const tipos = await prisma.tipoHabitacion.findMany({ where: { activo: true } });
  let tarifasCreadas = 0;
  for (const tipo of tipos) {
    const base = await precioBaseDelTipo(tipo.id, temporadaBase.id);
    for (const temporada of temporadas) {
      const { creada } = await asegurarTarifa(tipo.id, temporada, base);
      if (creada) tarifasCreadas += 1;
    }
  }
  console.log(`  ✔ ${tarifasCreadas} tarifa/s nueva/s creada/s (para ${tipos.length} tipo/s activo/s × ${temporadas.length} temporada/s).`);

  console.log("\nReservas de demostración:");
  const reservas = await crearReservasDemo();

  console.log("\n── Resumen ──");
  console.log(`Temporadas en el calendario de demo: ${temporadasCreadas.length} nuevas + ${otrasTemporadas.length} reutilizadas.`);
  console.log(`Tarifas nuevas: ${tarifasCreadas}.`);
  console.log(`Reservas de demostración creadas en esta corrida: ${reservas.length}.`);
  for (const r of reservas) {
    console.log(`  - ${r.codigoConfirmacion}: ${r.huesped.nombre}, $${r.totalEstimadoAlojamiento}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error en seed-demo-salta.js:", err);
    process.exit(1);
  });
