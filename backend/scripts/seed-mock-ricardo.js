// scripts/seed-mock-ricardo.js
//
// Carga datos MÍNIMOS de prueba (artículo, depósito, tipo de movimiento y
// habilitación) para que Ricardo pueda probar sus 2 historias (Entrada y
// Consulta de Stock) sin depender de que Gimena y Tomi terminen las suyas.
//
// Correr con: node scripts/seed-mock-ricardo.js
// Se puede correr de nuevo sin problema (usa upsert, no duplica nada).

// Este script se corre directo con "node", no pasa por index.js, así que
// necesita cargar el .env por su cuenta antes de requerir lib/prisma.
require("dotenv").config();

const prisma = require("../lib/prisma");

async function main() {
  const articulo = await prisma.articulo.upsert({
    where: { codigo: "MOCK-001" },
    update: {},
    create: {
      codigo: "MOCK-001",
      descripcion: "Artículo de prueba (mock Ricardo)",
      unidadMedida: "Unidad",
      categoria: "Limpieza",
    },
  });

  const deposito = await prisma.deposito.upsert({
    where: { nombre: "Depósito Mock" },
    update: {},
    create: {
      nombre: "Depósito Mock",
      ubicacion: "Prueba",
      responsable: "Ricardo",
    },
  });

  const tipoEntrada = await prisma.tipoMovimientoStock.upsert({
    where: { descripcion: "Entrada Mock (prueba)" },
    update: {},
    create: {
      descripcion: "Entrada Mock (prueba)",
      tipo: "E",
    },
  });

  const habilitacion = await prisma.articuloDeposito.upsert({
    where: { articuloId_depositoId: { articuloId: articulo.id, depositoId: deposito.id } },
    update: {},
    create: {
      articuloId: articulo.id,
      depositoId: deposito.id,
    },
  });

  console.log("Datos de prueba listos:");
  console.log({
    articuloId: articulo.id,
    depositoId: deposito.id,
    tipoMovStockId: tipoEntrada.id,
    articuloDepositoId: habilitacion.id,
  });
  console.log("\nProbá el endpoint de Entrada con este body:");
  console.log(
    JSON.stringify(
      {
        depositoId: deposito.id,
        tipoMovStockId: tipoEntrada.id,
        detalle: "Prueba de entrada",
        usuario: "ricardo",
        items: [{ articuloId: articulo.id, cantidad: 10 }],
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());