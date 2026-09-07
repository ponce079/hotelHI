// Script de inspección de solo lectura para planear la consolidación de
// depósitos centrales — no escribe nada. Correr con: node scripts/inspeccionar-centrales.js
require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  const depositos = await prisma.deposito.findMany({
    orderBy: { id: "asc" },
    select: { id: true, nombre: true, esCentral: true, activo: true },
  });

  console.log("\n=== DEPÓSITOS ===");
  for (const d of depositos) {
    const articulosHabilitados = await prisma.articuloDeposito.count({ where: { depositoId: d.id } });
    const movimientosOrigen = await prisma.movimientoStock.count({ where: { depositoId: d.id } });
    const movimientosDestino = await prisma.movimientoStock.count({ where: { depositoDestinoId: d.id } });
    const articulosQueLoTienenComoCentral = await prisma.articulo.count({ where: { depositoCentralId: d.id } });
    const requerimientosComoCentral = await prisma.requerimientoReposicion.count({ where: { depositoCentralId: d.id } });
    console.log(
      `id=${d.id} | esCentral=${d.esCentral} | activo=${d.activo} | "${d.nombre}" | articulosHabilitados=${articulosHabilitados} | movOrigen=${movimientosOrigen} | movDestino=${movimientosDestino} | articulosConEsteComoCentral=${articulosQueLoTienenComoCentral} | requerimientosComoCentral=${requerimientosComoCentral}`
    );
  }

  console.log("\n=== ARTÍCULOS (categoría y depósito central asignado) ===");
  const articulos = await prisma.articulo.findMany({
    orderBy: { id: "asc" },
    select: { id: true, nombre: true, categoria: true, depositoCentralId: true, depositoCentral: { select: { nombre: true } } },
  });
  for (const a of articulos) {
    console.log(`id=${a.id} | categoria="${a.categoria}" | central=${a.depositoCentralId ?? "—"} (${a.depositoCentral?.nombre ?? "sin asignar"}) | "${a.nombre}"`);
  }

  console.log("\n=== CATEGORÍAS DISTINTAS DE ARTÍCULO ===");
  const categorias = [...new Set(articulos.map((a) => a.categoria))];
  console.log(categorias);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
