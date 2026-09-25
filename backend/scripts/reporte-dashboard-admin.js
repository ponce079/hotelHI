// Script de solo lectura para sacar los números reales que va a mostrar el
// dashboard de admin (en vez de los de ejemplo del mockup). No escribe nada.
// Correr con: node scripts/reporte-dashboard-admin.js
require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  const articulosActivos = await prisma.articulo.count({ where: { activo: true } });

  const depositosActivos = await prisma.deposito.count({ where: { activo: true } });
  const depositosCentrales = await prisma.deposito.count({ where: { activo: true, esCentral: true } });
  const depositosPerifericos = depositosActivos - depositosCentrales;

  const proveedoresActivos = await prisma.proveedor.count({ where: { activo: true } });

  const habitacionesTotal = await prisma.habitacion.count();
  const habitacionesActivas = await prisma.habitacion.count({ where: { activo: true } });

  const articulosSinCentralAsignado = await prisma.articulo.count({
    where: { activo: true, depositoCentralId: null },
  });

  // "Por debajo de su stock mínimo" en un depósito central: mismo criterio
  // que usa AlertasPage (stockActual <= stockMinimo), sobre articulosDeposito
  // habilitados (activo=true) en depósitos con esCentral=true.
  const stockCentral = await prisma.articuloDepositoStock.findMany({
    where: {
      articuloDeposito: {
        activo: true,
        deposito: { esCentral: true, activo: true },
      },
    },
    select: { stockActual: true, stockMinimo: true },
  });
  const articulosCentralBajoMinimo = stockCentral.filter(
    (s) => Number(s.stockActual) <= Number(s.stockMinimo)
  ).length;

  const proveedoresSinRubro = await prisma.proveedor.count({
    where: { activo: true, rubros: { none: {} } },
  });

  console.log("=== Dashboard admin — números reales ===");
  console.log(`Artículos activos: ${articulosActivos}`);
  console.log(`Depósitos activos: ${depositosActivos} (centrales=${depositosCentrales}, perifericos=${depositosPerifericos})`);
  console.log(`Proveedores activos: ${proveedoresActivos}`);
  console.log(`Habitaciones: ${habitacionesTotal} (activas=${habitacionesActivas})`);
  console.log(`Artículos activos sin depósito central asignado: ${articulosSinCentralAsignado}`);
  console.log(`Artículos de depósito central por debajo de su stock mínimo: ${articulosCentralBajoMinimo} (de ${stockCentral.length} habilitados en centrales)`);
  console.log(`Proveedores activos sin ningún rubro asignado: ${proveedoresSinRubro}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
