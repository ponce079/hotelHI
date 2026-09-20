// Alta del depósito "Minibar" (Sprint 3, HU-61/62) — decisión de negocio:
// el consumo de Minibar descuenta SIEMPRE de un depósito periférico propio
// e independiente de "Bar", no de uno que se elija en el formulario (ver
// resolverDepositoMinibar en serviciosAdicionales.servicio.js).
//
// Criterio para elegir qué habilitar acá: de todo lo ya habilitado hoy en
// Bar (id=8) o en Central Perecederos (id=10, depósito central de compra
// de "Alimentos y Bebidas"), solo los 5 vinos de Bar tienen sentido como
// consumo de minibar de habitación — se venden por botella individual. El
// resto de lo habilitado en esos dos depósitos son ingredientes de cocina
// (carnes, huevos, tomate, manteca, fideos) que no se dejan en una
// habitación. El catálogo real no tiene hoy gaseosas ni snacks cargados;
// si se agregan más adelante, se habilitan acá con el mismo criterio.
//
// Reentrante: upsert del depósito por nombre, y cada artículo se saltea si
// ya tiene stock cargado (no repite la carga inicial en una segunda
// corrida). Correr con: node scripts/crear-deposito-minibar.js
require("dotenv").config();
const prisma = require("../src/lib/prisma");
const articuloDepositoServicio = require("../src/modulos/articulo-deposito/articulo-deposito.servicio");
const stockServicio = require("../src/modulos/stock/stock.servicio");
const movimientosStockServicio = require("../src/modulos/movimientos-stock/movimientosStock.servicio");
const { DEPOSITO_MINIBAR_NOMBRE } = require("../src/modulos/servicios-adicionales/serviciosAdicionales.constantes");

const ARTICULOS_MINIBAR = [23, 24, 25, 26, 27]; // los 5 vinos ya habilitados en Bar

const STOCK_INICIAL = { stockMinimo: 5, stockMaximo: 20, cantidadInicial: 15 };

async function main() {
  const deposito = await prisma.deposito.upsert({
    where: { nombre: DEPOSITO_MINIBAR_NOMBRE },
    update: {},
    create: { nombre: DEPOSITO_MINIBAR_NOMBRE, esCentral: false },
  });
  console.log(`Depósito "${deposito.nombre}" (id=${deposito.id}, esCentral=${deposito.esCentral})`);

  const tipoEntrada = await prisma.tipoMovimientoStock.findFirst({
    where: { descripcion: "Ajuste Positivo", tipo: "E", contexto: "NORMAL", activo: true },
  });
  if (!tipoEntrada) {
    throw new Error('No existe el tipo de movimiento "Ajuste Positivo" (E/NORMAL) para cargar el stock inicial.');
  }

  for (const articuloId of ARTICULOS_MINIBAR) {
    const articulo = await prisma.articulo.findUnique({ where: { id: articuloId } });
    if (!articulo) {
      console.log(`  SALTEADO: articuloId=${articuloId} no existe.`);
      continue;
    }

    const habilitacion = await articuloDepositoServicio.habilitarArticuloEnDeposito({
      articuloId,
      depositoId: deposito.id,
    });
    await stockServicio.actualizarParametrosStock(habilitacion.id, {
      stockMinimo: STOCK_INICIAL.stockMinimo,
      stockMaximo: STOCK_INICIAL.stockMaximo,
    });

    const stockActual = await prisma.articuloDepositoStock.findUnique({
      where: { articuloDepositoId: habilitacion.id },
    });
    if (Number(stockActual?.stockActual ?? 0) > 0) {
      console.log(`  "${articulo.nombre}": ya tenía stock cargado (${stockActual.stockActual}), no se repite la carga inicial.`);
      continue;
    }

    await movimientosStockServicio.registrarEntrada({
      depositoId: deposito.id,
      tipoMovStockId: tipoEntrada.id,
      detalle: `Carga inicial de stock — apertura depósito ${DEPOSITO_MINIBAR_NOMBRE}`,
      usuario: "sistema",
      items: [{ articuloId, cantidad: STOCK_INICIAL.cantidadInicial }],
    });
    console.log(
      `  "${articulo.nombre}": habilitado, min=${STOCK_INICIAL.stockMinimo} max=${STOCK_INICIAL.stockMaximo}, stock inicial=${STOCK_INICIAL.cantidadInicial}`
    );
  }

  console.log("\nListo.");
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
