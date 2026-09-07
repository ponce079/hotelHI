// Migración única — consolidación de depósitos centrales de 4-5 a 2 +
// renombre de periféricos + altas de periféricos nuevos + baja de
// duplicados. Correr una sola vez con: node scripts/migracion-consolidar-centrales.js
//
// No usa $transaction: son muchas operaciones secuenciales contra una base
// remota con pool de 3 conexiones (mismo motivo documentado en
// pagos.servicio.js) — una transacción de este tamaño excedería cualquier
// timeout razonable. Si corta a la mitad, es reentrante: cada paso solo
// actúa sobre lo que todavía existe.
require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  console.log("\n========== 1. RENOMBRAR CENTRALES ==========");
  const secosInsumos = await prisma.deposito.update({
    where: { id: 7 },
    data: { nombre: "Central Secos/Insumos" },
  });
  console.log(`OK: id=7 "BODEGA CENTRAL" -> "${secosInsumos.nombre}" (esCentral ya era true)`);

  const perecederos = await prisma.deposito.update({
    where: { id: 10 },
    data: { nombre: "Central Perecederos", esCentral: true },
  });
  console.log(`OK: id=10 "DEPOSITO CENTRAL ALIMENTOS FRESCOS PERCEDEROS" -> "${perecederos.nombre}" (esCentral: false -> true)`);

  console.log("\n========== 2. RENOMBRAR PERIFÉRICOS EXISTENTES ==========");
  const renombres = [
    { id: 1, nombre: "Cocina" },
    { id: 8, nombre: "Bar" },
    { id: 6, nombre: "Housekeeping" },
    { id: 12, nombre: "Administración" },
  ];
  for (const r of renombres) {
    const antes = await prisma.deposito.findUnique({ where: { id: r.id } });
    const actualizado = await prisma.deposito.update({ where: { id: r.id }, data: { nombre: r.nombre } });
    console.log(`OK: id=${r.id} "${antes.nombre}" -> "${actualizado.nombre}"`);
  }

  console.log("\n========== 3. LIMPIAR ARTÍCULOS QUE NO ENCAJAN TEMÁTICAMENTE ==========");
  // Cocina (id=1): un vino suelto no pertenece a una cocina de trabajo —
  // los 5 vinos ya están completos en Bar (id=8).
  const quitarDeCocina = [27]; // VINO TANNAT PIATTELLI 750CC
  // Housekeeping (id=6): yerba y fideos no tienen nada que ver con
  // housekeeping (amenities/blancos) — quedaron ahí por error de carga.
  const quitarDeHousekeeping = [21, 22]; // YERBA MATE, FIDEOS AL HUEVO FAVORITA 500G

  async function quitarHabilitacion(depositoId, articuloId, nombreDeposito) {
    const habilitacion = await prisma.articuloDeposito.findUnique({
      where: { articuloId_depositoId: { articuloId, depositoId } },
    });
    if (!habilitacion) {
      console.log(`  (sin cambios: articulo=${articuloId} ya no estaba habilitado en ${nombreDeposito})`);
      return;
    }
    await prisma.articuloDepositoStock.deleteMany({ where: { articuloDepositoId: habilitacion.id } });
    const articulo = await prisma.articulo.findUnique({ where: { id: articuloId }, select: { nombre: true } });
    await prisma.articuloDeposito.delete({ where: { id: habilitacion.id } });
    console.log(`  quitado de ${nombreDeposito}: "${articulo.nombre}"`);
  }

  for (const articuloId of quitarDeCocina) await quitarHabilitacion(1, articuloId, "Cocina");
  for (const articuloId of quitarDeHousekeeping) await quitarHabilitacion(6, articuloId, "Housekeeping");

  console.log("\n========== 4. CREAR PERIFÉRICOS NUEVOS (vacíos) ==========");
  const nuevos = ["Room Service", "Mantenimiento", "Seguridad y Salud"];
  for (const nombre of nuevos) {
    const creado = await prisma.deposito.upsert({
      where: { nombre },
      update: {},
      create: { nombre, esCentral: false },
    });
    console.log(`OK: creado "${creado.nombre}" (id=${creado.id})`);
  }

  console.log("\n========== 5. BORRAR DEPÓSITOS DUPLICADOS/REDUNDANTES (cascada completa) ==========");
  const depositosBorrar = [2, 3, 4, 5, 9, 11];
  const nombresBorrar = await prisma.deposito.findMany({ where: { id: { in: depositosBorrar } }, select: { id: true, nombre: true } });
  console.log("A borrar:", nombresBorrar.map((d) => `${d.nombre} (id=${d.id})`).join(", "));

  // --- 5a. Requerimientos que cuelgan de estos depósitos (como origen o, por
  // las dudas, como central — ya confirmado 0 en la auditoría previa) ---
  const requerimientos = await prisma.requerimientoReposicion.findMany({
    where: { OR: [{ depositoId: { in: depositosBorrar } }, { depositoCentralId: { in: depositosBorrar } }] },
    select: { id: true },
  });
  const requerimientoIds = requerimientos.map((r) => r.id);
  console.log(`Requerimientos alcanzados: ${requerimientoIds.length}`, requerimientoIds);

  // --- 5b. Presupuestos y órdenes de compra de esos requerimientos, + OCs
  // que cuelguen directo del depósito (por si alguna no vino de un
  // requerimiento de esta lista) ---
  const presupuestos = await prisma.presupuesto.findMany({
    where: { requerimientoId: { in: requerimientoIds } },
    select: { id: true },
  });
  const presupuestoIds = presupuestos.map((p) => p.id);

  const ordenesCompra = await prisma.ordenCompra.findMany({
    where: { OR: [{ presupuestoId: { in: presupuestoIds } }, { depositoId: { in: depositosBorrar } }] },
    select: { id: true },
  });
  const ordenCompraIds = ordenesCompra.map((o) => o.id);
  console.log(`Presupuestos alcanzados: ${presupuestoIds.length} | Órdenes de compra alcanzadas: ${ordenCompraIds.length}`, ordenCompraIds);

  // --- 5c. Comprobantes de esas OCs, incluidas sus notas de crédito/débito
  // (ajustes, que apuntan a la factura original por comprobanteRelacionadoId) ---
  const comprobantesRaiz = await prisma.comprobanteProveedor.findMany({
    where: { ordenCompraId: { in: ordenCompraIds } },
    select: { id: true },
  });
  const comprobantesRaizIds = comprobantesRaiz.map((c) => c.id);
  const ajustes = await prisma.comprobanteProveedor.findMany({
    where: { comprobanteRelacionadoId: { in: comprobantesRaizIds } },
    select: { id: true },
  });
  const ajusteIds = ajustes.map((a) => a.id);
  console.log(`Comprobantes alcanzados: ${comprobantesRaizIds.length} raíz + ${ajusteIds.length} ajustes`);

  // Pagos aplicados a esos comprobantes (se borra el detalle de aplicación,
  // no la Orden de Pago entera — puede tener otros comprobantes de otros
  // proveedores/depósitos que no tienen nada que ver con esta migración).
  const todosComprobantes = [...ajusteIds, ...comprobantesRaizIds];
  const detallesPago = await prisma.ordenPagoDetalle.deleteMany({ where: { comprobanteId: { in: todosComprobantes } } });
  console.log(`Borrados ${detallesPago.count} OrdenPagoDetalle (aplicaciones de pago a estos comprobantes)`);

  // Ajustes antes que su comprobante raíz (por el self-FK).
  const bajaAjustes = await prisma.comprobanteProveedor.deleteMany({ where: { id: { in: ajusteIds } } });
  console.log(`Borrados ${bajaAjustes.count} comprobantes (ajustes)`);
  const bajaComprobantes = await prisma.comprobanteProveedor.deleteMany({ where: { id: { in: comprobantesRaizIds } } });
  console.log(`Borrados ${bajaComprobantes.count} comprobantes (raíz)`);

  // --- 5d. Movimientos de stock propios de los depósitos a borrar (origen
  // o destino). OJO: NO se filtra acá por ordenCompraId — un movimiento
  // registrado en un depósito que sobrevive pero que apunta a una OC
  // condenada solo pierde esa referencia (paso 5f), no se borra el
  // movimiento entero. ---
  const movimientos = await prisma.movimientoStock.findMany({
    where: { OR: [{ depositoId: { in: depositosBorrar } }, { depositoDestinoId: { in: depositosBorrar } }] },
    select: { id: true },
  });
  const movimientoIds = movimientos.map((m) => m.id);
  console.log(`Movimientos de stock alcanzados: ${movimientoIds.length}`);

  // --- 5e. Detalle de OC y su log ---
  const bajaOcDetalle = await prisma.ordenCompraDetalle.deleteMany({ where: { ordenCompraId: { in: ordenCompraIds } } });
  console.log(`Borradas ${bajaOcDetalle.count} líneas de OrdenCompraDetalle`);
  const bajaOcLog = await prisma.ordenCompraLog.deleteMany({ where: { ordenCompraId: { in: ordenCompraIds } } });
  console.log(`Borradas ${bajaOcLog.count} filas de OrdenCompraLog`);

  // --- 5f. Antes de borrar las OC, sacar la referencia que CUALQUIER
  // movimiento tenga hacia ellas (MovimientoStock.ordenCompraId) — no solo
  // los de movimientoIds: un movimiento registrado en un depósito que
  // SOBREVIVE también podría apuntar a una OC que se está por borrar. ---
  const desvincularMov = await prisma.movimientoStock.updateMany({
    where: { ordenCompraId: { in: ordenCompraIds } },
    data: { ordenCompraId: null },
  });
  console.log(`Desvinculados ${desvincularMov.count} movimientos de su OC (antes de borrar la OC)`);

  const bajaOc = await prisma.ordenCompra.deleteMany({ where: { id: { in: ordenCompraIds } } });
  console.log(`Borradas ${bajaOc.count} Órdenes de Compra`);

  // --- 5g. Presupuestos ---
  const bajaPresupuestoDetalle = await prisma.presupuestoDetalle.deleteMany({ where: { presupuestoId: { in: presupuestoIds } } });
  console.log(`Borradas ${bajaPresupuestoDetalle.count} líneas de PresupuestoDetalle`);
  const bajaPresupuestos = await prisma.presupuesto.deleteMany({ where: { id: { in: presupuestoIds } } });
  console.log(`Borrados ${bajaPresupuestos.count} Presupuestos`);

  // --- 5h. Requerimientos: primero anular referencias cruzadas (self-FK
  // requerimientoCompraId, en cualquier dirección) y el link a su
  // movimiento, después el log/detalle, después la cabecera. ---
  const limpiarRequerimientoCompra = await prisma.requerimientoReposicion.updateMany({
    where: { requerimientoCompraId: { in: requerimientoIds } },
    data: { requerimientoCompraId: null },
  });
  console.log(`Desvinculadas ${limpiarRequerimientoCompra.count} referencias requerimientoCompraId hacia requerimientos a borrar`);

  const limpiarMovimientoStockId = await prisma.requerimientoReposicion.updateMany({
    where: { id: { in: requerimientoIds } },
    data: { movimientoStockId: null, requerimientoCompraId: null },
  });
  console.log(`Limpiadas ${limpiarMovimientoStockId.count} cabeceras de requerimiento (movimientoStockId/requerimientoCompraId propios)`);

  const bajaReqLog = await prisma.requerimientoLog.deleteMany({ where: { requerimientoId: { in: requerimientoIds } } });
  console.log(`Borradas ${bajaReqLog.count} filas de RequerimientoLog`);
  const bajaReqDetalle = await prisma.requerimientoDetalle.deleteMany({ where: { requerimientoId: { in: requerimientoIds } } });
  console.log(`Borradas ${bajaReqDetalle.count} líneas de RequerimientoDetalle`);
  const bajaReq = await prisma.requerimientoReposicion.deleteMany({ where: { id: { in: requerimientoIds } } });
  console.log(`Borrados ${bajaReq.count} Requerimientos de Reposición`);

  // --- 5i. Movimientos de stock (ya sin nada que los referencie) ---
  const bajaMovDetalle = await prisma.movimientoStockDetalle.deleteMany({ where: { movStockId: { in: movimientoIds } } });
  console.log(`Borradas ${bajaMovDetalle.count} líneas de MovimientoStockDetalle`);
  const bajaMov = await prisma.movimientoStock.deleteMany({ where: { id: { in: movimientoIds } } });
  console.log(`Borrados ${bajaMov.count} Movimientos de Stock`);

  // --- 5j. Habilitaciones de artículo (stock por depósito) de los
  // depósitos a borrar ---
  const habilitaciones = await prisma.articuloDeposito.findMany({ where: { depositoId: { in: depositosBorrar } }, select: { id: true } });
  const habilitacionIds = habilitaciones.map((h) => h.id);
  const bajaStock = await prisma.articuloDepositoStock.deleteMany({ where: { articuloDepositoId: { in: habilitacionIds } } });
  console.log(`Borradas ${bajaStock.count} filas de stock por depósito`);
  const bajaHabilitaciones = await prisma.articuloDeposito.deleteMany({ where: { id: { in: habilitacionIds } } });
  console.log(`Borradas ${bajaHabilitaciones.count} habilitaciones de artículo`);

  // --- 5k. Chequeo de seguridad: ningún artículo debería tener su central
  // apuntando a un depósito que se está por borrar (la auditoría previa
  // confirmó 0 casos — esto solo lo revalida y corrige si apareciera algo
  // nuevo, en vez de asumirlo). ---
  const articulosConCentralADesvincular = await prisma.articulo.updateMany({
    where: { depositoCentralId: { in: depositosBorrar } },
    data: { depositoCentralId: null },
  });
  if (articulosConCentralADesvincular.count > 0) {
    console.log(`ATENCIÓN: se desvincularon ${articulosConCentralADesvincular.count} artículos que tenían un depósito a borrar como central (revisar y reasignar a mano).`);
  }

  // --- 5l. Por último, los depósitos ---
  const bajaDepositos = await prisma.deposito.deleteMany({ where: { id: { in: depositosBorrar } } });
  console.log(`Borrados ${bajaDepositos.count} depósitos`);

  console.log("\n========== RESULTADO FINAL ==========");
  const finales = await prisma.deposito.findMany({ orderBy: { id: "asc" }, select: { id: true, nombre: true, esCentral: true, activo: true } });
  finales.forEach((d) => console.log(`id=${d.id} | esCentral=${d.esCentral} | activo=${d.activo} | "${d.nombre}"`));
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
