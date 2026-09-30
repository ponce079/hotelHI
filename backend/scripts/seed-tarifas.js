// scripts/seed-tarifas.js
// Maestros base de la Etapa 2 de tarifas por temporada (HU-90 a HU-93):
// temporada Base, planes BAR/NRF y los 7 modificadores por día de semana
// en 0%. NO carga temporadas con fechas ni tarifas — eso se hace a mano
// desde el ABM (verificación manual).
// Correr con: node scripts/seed-tarifas.js — idempotente, se puede correr
// las veces que haga falta.

require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  console.log("=== Temporada Base ===");
  const base = await prisma.temporada.findFirst({ where: { nivel: "BASE" } });
  if (base) {
    console.log("OK: ya existe la temporada Base (id:", base.id, ")");
  } else {
    const creada = await prisma.temporada.create({
      data: { nombre: "Base", nivel: "BASE", fechaDesde: null, fechaHasta: null, activa: true },
    });
    console.log("OK: creada la temporada Base (id:", creada.id, ")");
  }

  console.log("\n=== Plan BAR (base) ===");
  const bar = await prisma.planTarifario.upsert({
    where: { codigo: "BAR" },
    update: {},
    create: {
      codigo: "BAR",
      nombre: "Best Available Rate",
      tipo: "BASE",
      reembolsable: true,
      horasCancelacionSinCargo: 48,
      penalidadNoShow: "PRIMERA_NOCHE",
      visibleWeb: true,
    },
  });
  console.log("OK:", bar.codigo, "id:", bar.id);

  console.log("\n=== Plan NRF (derivado de BAR, -15%) ===");
  const nrf = await prisma.planTarifario.upsert({
    where: { codigo: "NRF" },
    update: { planBaseId: bar.id },
    create: {
      codigo: "NRF",
      nombre: "No Reembolsable",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 15,
      reembolsable: false,
      horasCancelacionSinCargo: null,
      penalidadNoShow: "TOTAL_ESTADIA",
      visibleWeb: true,
    },
  });
  console.log("OK:", nrf.codigo, "id:", nrf.id, "(planBaseId:", nrf.planBaseId, ")");

  console.log("\n=== Modificadores por día de semana (0%) ===");
  for (let diaSemana = 0; diaSemana <= 6; diaSemana += 1) {
    const modificador = await prisma.modificadorDiaSemana.upsert({
      where: { diaSemana },
      update: {},
      create: { diaSemana, porcentaje: 0 },
    });
    console.log("OK: día", modificador.diaSemana, "->", modificador.porcentaje, "%");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
