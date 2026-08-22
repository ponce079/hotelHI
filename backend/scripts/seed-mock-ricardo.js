// scripts/seed-mock-ricardo.js
// Carga datos mínimos de prueba para probar Entrada y Consulta de Stock.
// Correr con: node scripts/seed-mock-ricardo.js
//
// NOTA: el modelo Articulo cambió — ya no tiene "codigo" ni "descripcion"
// por separado, ahora es un solo campo "nombre" (único).

require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  const articulo = await prisma.articulo.upsert({
    where: { nombre: "MOCK-001 - Artículo de prueba (Ricardo)" },
    update: {},
    create: {
      nombre: "MOCK-001 - Artículo de prueba (Ricardo)",
      unidadMedida: "Unidad",
      categoria: "Limpieza",
    },
  });

  const deposito = await prisma.deposito.upsert({
    where: { nombre: "Depósito Mock" },
    update: {},
    create: { nombre: "Depósito Mock", ubicacion: "Prueba", responsable: "Ricardo" },
  });

  const tipoEntrada = await prisma.tipoMovimientoStock.upsert({
    where: { descripcion: "Entrada Mock (prueba)" },
    update: {},
    create: { descripcion: "Entrada Mock (prueba)", tipo: "E" },
  });

  const habilitacion = await prisma.articuloDeposito.upsert({
    where: { articuloId_depositoId: { articuloId: articulo.id, depositoId: deposito.id } },
    update: {},
    create: { articuloId: articulo.id, depositoId: deposito.id },
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