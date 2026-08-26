// scripts/seed-tipos-movimiento.js
// Carga los tipos de movimiento base (HU-10, tarea 3).
// Correr con: node scripts/seed-tipos-movimiento.js

require("dotenv").config();
const prisma = require("../src/lib/prisma");

const TIPOS = [
  { descripcion: "Entrada por Compra", tipo: "E" },
  { descripcion: "Ajuste Positivo", tipo: "E" },
  { descripcion: "Entrada por Transferencia", tipo: "E" },
  { descripcion: "Salida por Transferencia", tipo: "S" },
  { descripcion: "Ajuste Negativo", tipo: "S" },
];

async function main() {
  for (const data of TIPOS) {
    const tipoMovimiento = await prisma.tipoMovimientoStock.upsert({
      where: { descripcion: data.descripcion },
      update: {},
      create: data,
    });
    console.log("OK:", tipoMovimiento.descripcion, "(", tipoMovimiento.tipo, ") id:", tipoMovimiento.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
