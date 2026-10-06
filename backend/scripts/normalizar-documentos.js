// Normaliza los números de documento ya guardados y unifica las fichas duplicadas.
//
//   node scripts/normalizar-documentos.js            -> SIMULACIÓN: muestra qué cambiaría, no escribe nada
//   node scripts/normalizar-documentos.js --aplicar  -> aplica los cambios
//
// Corre solo contra una base local; para la compartida hace falta CONFIRMAR_BASE_COMPARTIDA y la
// confirmación por teclado de scripts/_destinoMigracion.js. Hacer un backup antes de --aplicar.
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });
const { exigirDestino } = require("./_destinoMigracion");
const { planificar } = require("./_normalizarDocumentos");

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  await exigirDestino(process.env, aplicar ? "la normalización de documentos" : "la simulación de normalización", {
    confirmarPorTeclado: aplicar,
  });
  const prisma = require("../src/lib/prisma");
  try {
    const [huespedes, ocupantes] = await Promise.all([
      prisma.huesped.findMany({
        select: { id: true, tipoDocumento: true, paisDocumento: true, numeroDocumento: true, identidadDocumento: true },
      }),
      prisma.ocupanteReserva.findMany({
        select: {
          id: true,
          tipoDocumento: true,
          paisDocumento: true,
          numeroDocumento: true,
          identidadActiva: true,
        },
      }),
    ]);
    const plan = planificar({ huespedes, ocupantes });
    console.log(`Huéspedes revisados: ${huespedes.length} | ocupantes revisados: ${ocupantes.length}`);
    console.log(`Fichas a corregir: ${plan.fichasACorregir.length}`);
    console.log(`Documentos duplicados a unificar: ${plan.fusiones.length}`);
    for (const f of plan.fusiones) console.log(`  ficha ${f.principalId} absorbe ${f.duplicadosIds.join(", ")}`);
    console.log(`Ocupantes a corregir: ${plan.ocupantesACorregir.length}`);
    console.log(`Conflictos (revisar a mano): ${plan.conflictos.length}`);
    for (const c of plan.conflictos)
      console.log(`  ocupantes ${c.ocupanteIds.join(" y ")} alojados a la vez con el documento ${c.documento}`);
    if (!aplicar) return console.log("\nSimulación: no se escribió nada. Para aplicar: --aplicar");

    await prisma.$transaction(
      async (tx) => {
        for (const { principalId, duplicadosIds } of plan.fusiones) {
          await tx.reserva.updateMany({ where: { huespedId: { in: duplicadosIds } }, data: { huespedId: principalId } });
          await tx.ocupanteReserva.updateMany({
            where: { huespedId: { in: duplicadosIds } },
            data: { huespedId: principalId },
          });
          await tx.huesped.deleteMany({ where: { id: { in: duplicadosIds } } });
        }
        for (const f of plan.fichasACorregir) {
          await tx.huesped.update({
            where: { id: f.id },
            data: { numeroDocumento: f.numeroDocumento, identidadDocumento: f.identidadDocumento },
          });
        }
        for (const o of plan.ocupantesACorregir) {
          await tx.ocupanteReserva.update({
            where: { id: o.id },
            data: { numeroDocumento: o.numeroDocumento, identidadActiva: o.identidadActiva },
          });
        }
      },
      { maxWait: 60000, timeout: 300000 },
    );
    console.log("\nListo: documentos normalizados.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`normalizar-documentos cancelado: ${error.message}`);
  process.exit(1);
});
