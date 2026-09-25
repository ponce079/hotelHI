// Datos reales para el Dashboard de Admin (Sprint 3) — solo lectura, no
// escribe nada. "Hoy" se calcula en hora argentina, mismo criterio que
// frontend/src/lib/fechas.js (hoyEnHoraLocal). Correr con:
//   node scripts/reporte-dashboard-admin-v2.js
require("dotenv").config();
const prisma = require("../src/lib/prisma");

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

function hoyEnHoraLocal() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA_ARGENTINA });
}

function soloDia(fecha) {
  return new Date(fecha).toISOString().slice(0, 10);
}

async function main() {
  const hoy = hoyEnHoraLocal();
  console.log(`=== Dashboard admin — datos reales (hoy=${hoy}) ===\n`);

  // 1) Reservas activas (Confirmada + En curso)
  const confirmadas = await prisma.reserva.findMany({
    where: { estado: "Confirmada" },
    select: { id: true, fechaDesde: true, fechaHasta: true },
  });
  const enCurso = await prisma.reserva.findMany({
    where: { estado: "En curso" },
    select: { id: true, fechaDesde: true, fechaHasta: true },
  });
  console.log(`1) Reservas activas (Confirmada + En curso): ${confirmadas.length + enCurso.length}`);
  console.log(`   - Confirmada: ${confirmadas.length} | En curso: ${enCurso.length}`);
  console.log(`   - "Creadas hoy": NO CALCULABLE — Reserva no tiene ningún campo de fecha de creación en el schema.`);

  // 2) Check-ins de hoy: pendientes (Confirmada, fechaDesde=hoy) vs ya
  // realizados (En curso, fechaDesde=hoy) — mismo criterio que
  // RecepcionistaInicio.jsx (llegadasHoy).
  const checkinsPendientesHoy = confirmadas.filter((r) => soloDia(r.fechaDesde) === hoy);
  const checkinsRealizadosHoy = enCurso.filter((r) => soloDia(r.fechaDesde) === hoy);
  console.log(`\n2) Check-ins de hoy: ${checkinsPendientesHoy.length} pendientes, ${checkinsRealizadosHoy.length} ya realizados`);

  // 3) Check-outs de hoy: total (En curso, fechaHasta=hoy) y vencidos
  // (En curso, fechaHasta < hoy) — mismo criterio que CheckOutPage.jsx.
  const checkoutsHoy = enCurso.filter((r) => soloDia(r.fechaHasta) === hoy);
  const checkoutsVencidos = enCurso.filter((r) => soloDia(r.fechaHasta) < hoy);
  console.log(`\n3) Check-outs de hoy: ${checkoutsHoy.length} (de los cuales ${checkoutsVencidos.length >= 0 ? "—" : ""}`);
  console.log(`   Check-outs vencidos (salida ya pasada, sigue "En curso"): ${checkoutsVencidos.length}`);

  // 4 y 5) Habitaciones por estado
  const habitaciones = await prisma.habitacion.findMany({ where: { activo: true }, select: { estado: true } });
  const ESTADOS = ["libre", "ocupada", "mantenimiento", "bloqueada", "en limpieza"];
  console.log(`\n4/5) Habitaciones activas: ${habitaciones.length}`);
  for (const e of ESTADOS) {
    console.log(`   ${e}: ${habitaciones.filter((h) => h.estado === e).length}`);
  }

  // 6) Cobertura de stock por cada depósito central
  const centrales = await prisma.deposito.findMany({ where: { esCentral: true, activo: true }, select: { id: true, nombre: true } });
  console.log(`\n6) Cobertura de stock por depósito central:`);
  for (const central of centrales) {
    const stocks = await prisma.articuloDepositoStock.findMany({
      where: { articuloDeposito: { activo: true, depositoId: central.id } },
      select: { stockActual: true, stockMinimo: true },
    });
    const porEncima = stocks.filter((s) => Number(s.stockActual) > Number(s.stockMinimo)).length;
    const pct = stocks.length ? Math.round((porEncima / stocks.length) * 100) : null;
    console.log(`   ${central.nombre}: ${porEncima}/${stocks.length} por encima del mínimo (${pct}%)`);
  }

  // 7) Órdenes de mantenimiento urgentes sin resolver
  const urgentesPendientes = await prisma.ordenMantenimiento.findMany({
    where: { estado: "Pendiente", urgente: true },
    select: { id: true, tipoTarea: true, habitacion: { select: { numero: true } } },
    orderBy: { fecha: "asc" },
  });
  console.log(`\n7) Órdenes de mantenimiento urgentes sin resolver: ${urgentesPendientes.length}`);
  for (const o of urgentesPendientes) {
    console.log(`   Hab. ${o.habitacion?.numero} — ${o.tipoTarea}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
