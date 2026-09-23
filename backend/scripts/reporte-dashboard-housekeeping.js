// Datos reales para el Dashboard de Housekeeping — solo lectura, no escribe
// nada. Correr con:
//   node scripts/reporte-dashboard-housekeeping.js
require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  console.log("=== Dashboard housekeeping — datos reales ===\n");

  // 1) Habitaciones "en limpieza" ahora mismo
  const enLimpieza = await prisma.habitacion.findMany({
    where: { activo: true, estado: "en limpieza" },
    select: { id: true, numero: true, tipo: true, piso: true },
    orderBy: [{ piso: "asc" }, { numero: "asc" }],
  });
  console.log(`1) Habitaciones "en limpieza": ${enLimpieza.length}`);
  for (const h of enLimpieza) {
    console.log(`   Hab. ${h.numero} — tipo ${h.tipo} — piso ${h.piso}`);
  }

  // 2) Habitaciones "libres" ahora mismo
  const libres = await prisma.habitacion.count({ where: { activo: true, estado: "libre" } });
  console.log(`\n2) Habitaciones "libres": ${libres}`);

  // 3) Órdenes de mantenimiento "Pendiente"
  const pendientes = await prisma.ordenMantenimiento.findMany({
    where: { estado: "Pendiente" },
    select: {
      id: true,
      tipoTarea: true,
      urgente: true,
      fecha: true,
      habitacion: { select: { numero: true } },
    },
    orderBy: { fecha: "asc" },
  });
  const urgentes = pendientes.filter((o) => o.urgente);
  console.log(`\n3) Órdenes de mantenimiento "Pendiente": ${pendientes.length} (urgentes=${urgentes.length})`);
  for (const o of pendientes) {
    console.log(`   Hab. ${o.habitacion?.numero} — ${o.tipoTarea} — urgente=${o.urgente}`);
  }

  // 4) Desglose de "en limpieza" por piso
  const porPiso = new Map();
  for (const h of enLimpieza) {
    porPiso.set(h.piso, (porPiso.get(h.piso) ?? 0) + 1);
  }
  const pisosTotales = await prisma.habitacion.findMany({
    where: { activo: true },
    select: { piso: true },
    distinct: ["piso"],
    orderBy: { piso: "asc" },
  });
  console.log(`\n4) "En limpieza" por piso (todos los pisos existentes, incluso en 0):`);
  for (const { piso } of pisosTotales) {
    console.log(`   Piso ${piso}: ${porPiso.get(piso) ?? 0}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
