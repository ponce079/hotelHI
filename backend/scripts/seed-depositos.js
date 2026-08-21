// scripts/seed-depositos.js
// Carga los depositos reales del hotel (HU-3, tarea 4).
// Correr con: node scripts/seed-depositos.js

require("dotenv").config();
const prisma = require("../src/lib/prisma");

const DEPOSITOS = [
  { nombre: "Deposito Central", ubicacion: "Subsuelo", responsable: "Encargado de Deposito" },
  { nombre: "Cocina", ubicacion: "Planta Baja", responsable: "Jefe de Cocina" },
  { nombre: "Housekeeping", ubicacion: "Piso 1", responsable: "Encargada de Housekeeping" },
];

async function main() {
  for (const data of DEPOSITOS) {
    const deposito = await prisma.deposito.upsert({
      where: { nombre: data.nombre },
      update: {},
      create: data,
    });
    console.log("OK:", deposito.nombre, "id:", deposito.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
