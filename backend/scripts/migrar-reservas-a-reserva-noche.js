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
// Correr con: node scripts/migrar-reservas-a-reserva-noche.js

require("dotenv").config();
const prisma = require("../src/lib/prisma");

const UN_DIA_MS = 24 * 60 * 60 * 1000;

function nochesEntre(fechaDesde, fechaHasta) {
  const noches = [];
  for (let t = new Date(fechaDesde).getTime(); t < new Date(fechaHasta).getTime(); t += UN_DIA_MS) {
    noches.push(new Date(t));
  }
  return noches;
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
    for (const fecha of nochesEntre(reserva.fechaDesde, reserva.fechaHasta)) {
      await tx.reservaNoche.create({
        data: {
          reservaHabitacionId: rh.id,
          fecha,
          temporadaId: null,
          tarifaId: null,
          planTarifarioId: planBarId,
          precioNoche,
          origen: "MIGRACION",
        },
      });
    }
  }

  await tx.reserva.update({ where: { id: reserva.id }, data: { planTarifarioId: planBarId } });
}

async function main() {
  const bar = await prisma.planTarifario.findUnique({ where: { codigo: "BAR" } });
  if (!bar) {
    throw new Error("No existe el plan BAR — correr antes scripts/seed-tarifas.js.");
  }
  console.log("Plan asignado a las reservas migradas: BAR (id:", bar.id, ")");

  const pendientes = await prisma.reserva.findMany({
    where: { planTarifarioId: null },
    include: {
      reservaHabitaciones: {
        include: { habitacion: { include: { tipoHabitacion: true } } },
      },
    },
    orderBy: { id: "asc" },
  });

  console.log(`Reservas por migrar: ${pendientes.length}`);
  if (pendientes.length === 0) {
    console.log("Nada para hacer: no hay reservas con planTarifarioId null.");
    return;
  }

  let migradas = 0;
  const errores = [];
  for (const reserva of pendientes) {
    try {
      await prisma.$transaction(async (tx) => migrarReserva(tx, reserva, bar.id));
      migradas += 1;
      console.log(`OK: reserva ${reserva.id} (${reserva.codigoConfirmacion}) — ${reserva.reservaHabitaciones.length} habitación(es).`);
    } catch (err) {
      errores.push({ reservaId: reserva.id, mensaje: err.message });
      console.error(`ERROR: reserva ${reserva.id} (${reserva.codigoConfirmacion}):`, err.message);
    }
  }

  console.log(`\nMigradas: ${migradas} / ${pendientes.length}.`);
  if (errores.length > 0) {
    console.log("Reservas que fallaron (revisar y volver a correr el script para reintentarlas):");
    for (const e of errores) console.log(`  - reserva ${e.reservaId}: ${e.mensaje}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
