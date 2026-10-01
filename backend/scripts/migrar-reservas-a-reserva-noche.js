// scripts/migrar-reservas-a-reserva-noche.js
//
// Etapa 4A de tarifas por temporada (HU-95/96) — migración única de las
// reservas creadas ANTES de esta etapa (planTarifarioId todavía null) a la
// nueva forma: un plan tarifario por reserva y el precio de cada noche
// congelado en ReservaNoche.
//
// Regla explícita del prompt de la Etapa 4A: NO se recalcula nada con el
// motor de cotización — cada noche migrada usa el mismo importe que la
// reserva ya tenía (Habitacion.tarifaPorNoche, tal cual estaba al momento
// de migrar), para que consolidarCargos dé EXACTAMENTE el mismo total que
// daba antes de esta etapa. Por eso temporadaId/tarifaId quedan null y
// origen queda "MIGRACION" (no "MOTOR"): estas filas no vienen de una
// cotización real, son un backfill de un precio que ya estaba fijado por
// otro medio.
//
// Plan asignado: BAR (el único plan base, aprobado explícitamente por el
// usuario para esta migración). Ocupación asignada a cada ReservaHabitacion:
// min(TipoHabitacion.ocupacionBase, Habitacion.capacidad) — nunca más que la
// capacidad real de la habitación, aunque la ocupación base del tipo sea
// mayor (ej. una habitación puntual con capacidad reducida).
//
// Idempotente: solo toca reservas con planTarifarioId null (cualquier
// reserva ya migrada, o dada de alta después de la Etapa 4A, se salta). Cada
// reserva se migra en su propia transacción — si el proceso se corta a
// mitad de camino, correrlo de nuevo retoma exactamente donde quedó, sin
// migrar dos veces ninguna.
//
// ════════════════════════════════════════════════════════════
// CORREGIDO 2026-09-30 — contra la base compartida (Clever Cloud) apareció
// un caso real donde la transacción de una reserva agotó su presupuesto
// (timeout default de Prisma, 5000ms — la latencia de red hace que esto
// pase contra Clever Cloud aunque nunca pasó contra una base local) y el
// intento de COMMIT final fue rechazado ("cannot be executed on an expired
// transaction"). En 5 de 19 fallos, el resultado no fue un rollback limpio:
// la reserva quedó con planTarifarioId asignado pero CERO filas en
// ReservaNoche — un estado roto que el propio filtro de idempotencia
// (`planTarifarioId: null`) nunca vuelve a tocar. Cambios:
//   1. `$transaction` ahora pasa { timeout: 30000, maxWait: 15000 } en vez
//      del default — más margen sobre la latencia real de Clever Cloud.
//   2. Las ReservaNoche de cada habitación se crean con una sola
//      `createMany` (antes: un `create` por noche) — menos round-trips
//      dentro de la misma transacción, menos chance de agotar el timeout.
//   3. Cada reserva usa un PrismaClient + adapter NUEVO (nunca la conexión
//      de la reserva anterior) y se desconecta explícitamente al terminar
//      (éxito o error) — elimina la vía por la que un timeout en una
//      reserva podía dejar la conexión en un estado que la reserva
//      SIGUIENTE terminara confirmando sin querer.
//   4. Verificación post-commit OBLIGATORIA con una conexión nueva e
//      independiente, SIEMPRE de una sola reserva por vez, nunca dos
//      conexiones abiertas a la vez: cuenta las ReservaNoche reales contra
//      las esperadas (habitaciones × noches) y confirma que quedó un plan
//      asignado. Si no coincide — se haya tirado error la transacción o
//      no — revierte planTarifarioId a null y borra cualquier ReservaNoche
//      parcial de ESA reserva (nunca de otra) antes de seguir con la
//      próxima, para que quede exactamente en el mismo estado "pendiente"
//      que tenía antes de intentarlo. Nunca debe quedar una reserva con
//      plan y sin sus noches completas.
//   5. `--ids=1,4,5` — procesa solo esas reservas (sigue respetando
//      `planTarifarioId: null`, así que un id ya migrado se ignora igual).
//      Sin el parámetro, procesa todas las pendientes como antes.
// ════════════════════════════════════════════════════════════
//
// Correr con: node scripts/migrar-reservas-a-reserva-noche.js
//        o:   node scripts/migrar-reservas-a-reserva-noche.js --ids=1,4,5
//
// ════════════════════════════════════════════════════════════
// HISTÓRICO — Etapa 4C (cierre del módulo de tarifas) eliminó
// Habitacion.tarifaPorNoche, la columna que este script lee (línea de
// arriba). Ya no puede correr contra el schema final: solo funciona sobre
// el schema intermedio (tag de git `etapa4c-schema-intermedio`), en el
// paso 6 del runbook de despliegue (docs/despliegue-tarifas.md) — después
// de la Etapa 1 (migracion-tipo-habitacion.js) y de sembrar los planes
// (seed-tarifas.js), y ANTES de aplicar el schema final con las columnas
// eliminadas/NOT NULL. Se conserva en el repo como registro de cómo se
// migraron las reservas anteriores a la Etapa 4A, no para volver a correr.
// ════════════════════════════════════════════════════════════

require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const UN_DIA_MS = 24 * 60 * 60 * 1000;

function nochesEntre(fechaDesde, fechaHasta) {
  const noches = [];
  for (let t = new Date(fechaDesde).getTime(); t < new Date(fechaHasta).getTime(); t += UN_DIA_MS) {
    noches.push(new Date(t));
  }
  return noches;
}

// Un PrismaClient nuevo por llamada — nunca se reutiliza la conexión de un
// intento anterior (ver corrección #3 arriba). Misma configuración que
// src/lib/prisma.js, duplicada a propósito: ese módulo exporta un único
// singleton por proceso, no sirve para crear instancias nuevas a demanda.
function crearCliente() {
  const dbUrl = new URL(process.env.DATABASE_URL);
  const adapter = new PrismaMariaDb({
    host: dbUrl.hostname,
    port: Number(dbUrl.port) || 3306,
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
    connectionLimit: 1,
    connectTimeout: 30000,
    acquireTimeout: 30000,
  });
  return new PrismaClient({ adapter });
}

async function migrarReserva(tx, reserva, planBarId) {
  for (const rh of reserva.reservaHabitaciones) {
    const ocupacionBase = rh.habitacion.tipoHabitacion.ocupacionBase;
    const adultos = Math.min(ocupacionBase, rh.habitacion.capacidad);
    await tx.reservaHabitacion.update({
      where: { id: rh.id },
      data: { adultos, menores: 0 },
    });

    const precioNoche = rh.habitacion.tarifaPorNoche;
    const noches = nochesEntre(reserva.fechaDesde, reserva.fechaHasta);
    await tx.reservaNoche.createMany({
      data: noches.map((fecha) => ({
        reservaHabitacionId: rh.id,
        fecha,
        temporadaId: null,
        tarifaId: null,
        planTarifarioId: planBarId,
        precioNoche,
        origen: "MIGRACION",
      })),
    });
  }

  await tx.reserva.update({ where: { id: reserva.id }, data: { planTarifarioId: planBarId } });
}

// Con una conexión NUEVA (nunca la que hizo la transacción de arriba):
// relee la reserva y confirma que tiene plan asignado y exactamente
// habitaciones × noches filas en ReservaNoche. Si no — completa o no la
// transacción anterior — deja la reserva exactamente como estaba antes de
// intentarla (planTarifarioId null, sin ReservaNoche parciales).
//
// Alcance ÚNICO de esta reserva: el `findUnique({ where: { id: reserva.id }})`
// solo puede devolver esa fila (id es @id, no hay ambigüedad posible), y
// `reservaHabitacionIds` sale exclusivamente de `actual.reservaHabitaciones`
// (la relación de ESA reserva) — el `deleteMany` de abajo nunca puede
// alcanzar una `ReservaNoche` de otra reserva, sea cual sea su estado.
async function verificarYCorregir(reserva) {
  const cliente = crearCliente();
  try {
    const nochesEsperadasPorHabitacion = nochesEntre(reserva.fechaDesde, reserva.fechaHasta).length;
    const totalEsperado = nochesEsperadasPorHabitacion * reserva.reservaHabitaciones.length;

    const actual = await cliente.reserva.findUnique({
      where: { id: reserva.id },
      include: { reservaHabitaciones: { include: { reservaNoches: true } } },
    });
    const totalReal = actual.reservaHabitaciones.reduce((acc, rh) => acc + rh.reservaNoches.length, 0);
    const completa = actual.planTarifarioId != null && totalReal === totalEsperado;
    if (completa) return { completa: true };

    const reservaHabitacionIds = actual.reservaHabitaciones.map((rh) => rh.id);
    if (reservaHabitacionIds.length > 0) {
      await cliente.reservaNoche.deleteMany({ where: { reservaHabitacionId: { in: reservaHabitacionIds } } });
    }
    await cliente.reserva.update({ where: { id: reserva.id }, data: { planTarifarioId: null } });
    return { completa: false, esperado: totalEsperado, real: totalReal };
  } finally {
    await cliente.$disconnect();
  }
}

// --ids=1,4,5 — procesa solo esas reservas (siempre respetando
// planTarifarioId: null, así que un id ya migrado se ignora igual). Sin el
// parámetro, procesa todas las pendientes como antes.
function parsearIdsDeArgv(argv) {
  const arg = argv.find((a) => a.startsWith("--ids="));
  if (!arg) return null;
  const ids = arg
    .slice("--ids=".length)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) throw new Error("--ids= no tiene ningún id numérico válido.");
  return ids;
}

async function main() {
  const idsFiltro = parsearIdsDeArgv(process.argv);
  let bar;
  let pendientes;

  const clienteSetup = crearCliente();
  try {
    bar = await clienteSetup.planTarifario.findUnique({ where: { codigo: "BAR" } });
    if (!bar) {
      throw new Error("No existe el plan BAR — correr antes scripts/seed-tarifas.js.");
    }
    console.log("Plan asignado a las reservas migradas: BAR (id:", bar.id, ")");

    pendientes = await clienteSetup.reserva.findMany({
      where: idsFiltro ? { planTarifarioId: null, id: { in: idsFiltro } } : { planTarifarioId: null },
      include: {
        reservaHabitaciones: {
          include: { habitacion: { include: { tipoHabitacion: true } } },
        },
      },
      orderBy: { id: "asc" },
    });
  } finally {
    await clienteSetup.$disconnect();
  }

  if (idsFiltro) console.log(`--ids= activo: procesando solo ${idsFiltro.join(", ")} (los que sigan pendientes).`);
  console.log(`Reservas por migrar: ${pendientes.length}`);
  if (pendientes.length === 0) {
    console.log("Nada para hacer: no hay reservas con planTarifarioId null.");
    return;
  }

  let migradas = 0;
  const errores = [];
  for (const reserva of pendientes) {
    const cliente = crearCliente();
    let errorTransaccion = null;
    try {
      await cliente.$transaction(async (tx) => migrarReserva(tx, reserva, bar.id), {
        timeout: 30000,
        maxWait: 15000,
      });
    } catch (err) {
      errorTransaccion = err;
    } finally {
      await cliente.$disconnect();
    }

    // Ejecución estrictamente secuencial: `await cliente.$disconnect()` de
    // arriba ya terminó (esta línea no se alcanza hasta que esa promesa
    // resuelve) antes de que `verificarYCorregir` abra su propia conexión
    // nueva — nunca hay dos conexiones abiertas al mismo tiempo. Se verifica
    // SIEMPRE, haya tirado error la transacción o no: un error del lado del
    // cliente no garantiza que no haya quedado nada escrito a medias del
    // lado del servidor (fue exactamente el caso real que motivó esta
    // corrección).
    let verificacion;
    try {
      verificacion = await verificarYCorregir(reserva);
    } catch (errVerif) {
      errores.push({ reservaId: reserva.id, mensaje: `No se pudo verificar/corregir tras la migración: ${errVerif.message}` });
      console.error(`ERROR CRÍTICO: no se pudo verificar la reserva ${reserva.id} — revisar a mano:`, errVerif.message);
      continue;
    }

    if (verificacion.completa) {
      migradas += 1;
      console.log(`OK: reserva ${reserva.id} (${reserva.codigoConfirmacion}) — ${reserva.reservaHabitaciones.length} habitación(es).`);
    } else {
      const motivo = errorTransaccion
        ? errorTransaccion.message
        : `verificación post-commit: esperaba ${verificacion.esperado} noches, encontró ${verificacion.real}`;
      errores.push({ reservaId: reserva.id, mensaje: motivo });
      console.error(`ERROR (revertida a pendiente): reserva ${reserva.id} (${reserva.codigoConfirmacion}): ${motivo}`);
    }
  }

  console.log(`\nMigradas: ${migradas} / ${pendientes.length}.`);
  if (errores.length > 0) {
    console.log("Reservas que fallaron (quedaron pendientes — revisar y volver a correr el script para reintentarlas):");
    for (const e of errores) console.log(`  - reserva ${e.reservaId}: ${e.mensaje}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
