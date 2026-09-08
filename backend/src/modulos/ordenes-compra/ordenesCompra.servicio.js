// src/modulos/ordenes-compra/ordenesCompra.servicio.js
//
// Lógica de negocio pura (HU-22 a 25, HU-85). No sabe nada de HTTP/Express.
// Sigue el mismo patrón que pagos.servicio.js y movimientosStock.servicio.js:
// clase ErrorDeNegocio con statusCode, prisma singleton, transacciones con
// timeout explícito.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { crearConNumeroSecuencial } = require("../../lib/numeracion");
const { ESTADOS_REQUERIMIENTO, TIPOS_REQUERIMIENTO } = require("../../lib/constantes");
const { reintentarTransferenciasPendientes } = require("../requerimientos/requerimientos.servicio");
const { calcularSaldosComprobantes } = require("../../lib/comprobantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// HU-22 · Generar OC desde un presupuesto adjudicado
// Este endpoint cuelga de /api/presupuestos/:id/generar-oc en el prototipo,
// pero la lógica es de este módulo — coordinar con Tomás/Agustín para que
// agreguen una sola línea a su presupuestos.routes.js apuntando acá.
// ---------------------------------------------------------------------------
async function generarOC({ presupuestoId, usuario }) {
  const id = Number(presupuestoId);
  if (!Number.isInteger(id)) {
    throw new ErrorDeNegocio("presupuestoId inválido.");
  }

  const presupuesto = await prisma.presupuesto.findUnique({
    where: { id },
    // El archivo adjunto (punto 9 de Presupuestos) es un BLOB de hasta
    // 5MB, sin uso acá — se omite para no traerlo de más.
    omit: { archivoAdjunto: true },
    include: {
      detalle: true, // PresupuestoDetalle[] -> { articuloId, precioUnitario }
      requerimiento: { include: { detalle: true } }, // RequerimientoDetalle[] -> { articuloId, cantidadSolicitada }
    },
  });
  if (!presupuesto) {
    throw new ErrorDeNegocio("Presupuesto no encontrado.", 404);
  }
  if (presupuesto.estado !== "Adjudicado") {
    throw new ErrorDeNegocio("Solo se puede generar una orden de compra desde un presupuesto adjudicado.", 409);
  }

  const ocExistente = await prisma.ordenCompra.findUnique({ where: { presupuestoId: id } });
  if (ocExistente) {
    throw new ErrorDeNegocio("Este presupuesto ya tiene una orden de compra generada.", 409);
  }

  // cantidad viene del requerimiento, precio viene del presupuesto -> se
  // cruzan por articuloId (PresupuestoDetalle no tiene columna de cantidad).
  const precioPorArticulo = new Map(
    presupuesto.detalle.map((d) => [d.articuloId, Number(d.precioUnitario)])
  );

  const lineasOC = presupuesto.requerimiento.detalle.map((linea) => {
    const precioUnitario = precioPorArticulo.get(linea.articuloId);
    if (precioUnitario === undefined) {
      throw new ErrorDeNegocio(
        `El presupuesto no tiene precio cargado para el artículo ${linea.articuloId}.`,
        409
      );
    }
    return { articuloId: linea.articuloId, cantidad: linea.cantidadSolicitada, precioUnitario };
  });

  const montoTotal = lineasOC.reduce(
    (acc, l) => acc + Number(l.cantidad) * Number(l.precioUnitario),
    0
  );
  const flete = presupuesto.costoFlete ?? null;

  let oc;
  try {
    oc = await prisma.$transaction(
      async (tx) => {
        const creada = await crearConNumeroSecuencial(tx, "ordenCompra", {
          prefijo: "OC",
          pad: 5,
          data: {
            proveedorId: presupuesto.proveedorId,
            presupuestoId: presupuesto.id,
            depositoId: presupuesto.requerimiento.depositoId,
            estado: "Pendiente",
            montoTotal,
            flete,
          },
        });

        await tx.ordenCompraDetalle.createMany({
          data: lineasOC.map((l) => ({
            ordenCompraId: creada.id,
            articuloId: l.articuloId,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
          })),
        });

        await tx.ordenCompraLog.create({
          data: {
            ordenCompraId: creada.id,
            usuario: usuario || "sistema",
            accion: "Orden generada desde presupuesto adjudicado",
          },
        });

        return creada;
      },
      { timeout: 30000, maxWait: 15000 }
    );
  } catch (err) {
    // El chequeo de ocExistente de arriba no bloquea una carrera real entre
    // dos requests concurrentes; el @unique de presupuestoId es la garantía
    // final, así que el P2002 se traduce al mismo 409 en vez de un 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ErrorDeNegocio("Este presupuesto ya tiene una orden de compra generada.", 409);
    }
    throw err;
  }

  return obtenerOCPorId(oc.id);
}

// ---------------------------------------------------------------------------
// Listado y ficha
// ---------------------------------------------------------------------------

// A partir de cuántos días de "Recibida" sin ningún comprobante cargado se
// marca el indicador "Sin comprobante" en la lista — ajustable acá.
const UMBRAL_SIN_COMPROBANTE_DIAS = 3;
const MS_POR_DIA = 1000 * 60 * 60 * 24;

// Indicador de facturación/pago de una OC (rediseño de la lista de OC) —
// solo tiene sentido mientras la OC sigue "abierta" del lado de
// facturación (Recibida/Recibida con diferencia); una Cerrada ya tiene
// todo pagado por definición y una Anulada/Pendiente/Enviada todavía no
// llegó a esta etapa. Devuelve null si no hay nada que señalar.
function calcularAlertaFacturacion(oc, saldoPorComprobante) {
  if (!["Recibida", "Recibida con diferencia"].includes(oc.estado)) return null;

  const facturasActivas = oc.comprobantes.filter((c) => c.tipo === "Factura" && !c.anulado);
  const ahora = Date.now();

  const vencida = facturasActivas.find((f) => {
    if (!f.fechaVencimiento) return false;
    const saldo = saldoPorComprobante.get(f.id) ?? 0;
    return saldo > 0 && new Date(f.fechaVencimiento).getTime() < ahora;
  });
  if (vencida) {
    return {
      tipo: "facturaVencida",
      numero: vencida.numero,
      dias: Math.floor((ahora - new Date(vencida.fechaVencimiento).getTime()) / MS_POR_DIA),
    };
  }

  if (facturasActivas.length === 0 && oc.fechaRecibida) {
    const dias = Math.floor((ahora - new Date(oc.fechaRecibida).getTime()) / MS_POR_DIA);
    if (dias >= UMBRAL_SIN_COMPROBANTE_DIAS) return { tipo: "sinComprobante", dias };
  }

  return null;
}

// Orden por defecto de la lista (punto 4 del rediseño): lo que necesita
// atención arriba, lo que ya salió del circuito abajo. 0 = más urgente.
function calcularPrioridad(oc, alertaFacturacion) {
  if (oc.estado === "Recibida con diferencia" || alertaFacturacion?.tipo === "facturaVencida") return 0;
  if (oc.estado === "Enviada") return 1;
  if (["Cerrada", "Anulada"].includes(oc.estado)) return 3;
  return 2;
}

async function listarOCs({ estado, proveedorId, desde, hasta, q, page = 1, pageSize = 20 } = {}) {
  const where = {};
  if (estado) where.estado = estado;
  if (proveedorId) where.proveedorId = Number(proveedorId);
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) where.fecha.lte = new Date(hasta);
  }
  // Buscador manual (mismo criterio que Proveedores/Requerimientos): por
  // número de OC o razón social del proveedor.
  const texto = (q ?? "").trim();
  if (texto) {
    where.OR = [{ numero: { contains: texto } }, { proveedor: { razonSocial: { contains: texto } } }];
  }

  // El orden por defecto (prioridad de atención) depende del indicador de
  // facturación, que cruza datos de ComprobanteProveedor/OrdenPagoDetalle —
  // no se puede resolver con un simple ORDER BY de SQL. Por eso acá se trae
  // el conjunto COMPLETO que matchea el filtro (no solo la página pedida),
  // se calcula el indicador y la prioridad de cada uno, se ordena en
  // memoria y recién ahí se pagina — mismo criterio ya usado en
  // listarOrdenesPago (pagos.servicio.js) para los totales del período: en
  // este sistema (decenas/cientos de OC, no millones) es más barato que
  // duplicar esta lógica en SQL. select liviano en `comprobantes`: nada de
  // traer de más.
  const todas = await prisma.ordenCompra.findMany({
    where,
    include: {
      proveedor: true,
      comprobantes: {
        select: { id: true, tipo: true, anulado: true, fechaVencimiento: true, importeTotal: true, numero: true },
      },
    },
  });

  const facturasParaSaldo = todas.flatMap((oc) => oc.comprobantes.filter((c) => c.tipo === "Factura" && !c.anulado));
  const saldoPorComprobante = await calcularSaldosComprobantes(facturasParaSaldo);

  const enriquecidas = todas.map((oc) => {
    const alertaFacturacion = calcularAlertaFacturacion(oc, saldoPorComprobante);
    return { oc, alertaFacturacion, prioridad: calcularPrioridad(oc, alertaFacturacion) };
  });
  // Dentro de cada nivel de prioridad, más antigua primero — "esperando
  // hace más tiempo" para Enviada, y en general la que lleva más tiempo
  // sin resolverse dentro de su mismo nivel de urgencia.
  enriquecidas.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    return new Date(a.oc.fecha) - new Date(b.oc.fecha);
  });

  const total = enriquecidas.length;
  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const items = enriquecidas
    .slice((pageNum - 1) * pageSizeNum, (pageNum - 1) * pageSizeNum + pageSizeNum)
    .map(({ oc, alertaFacturacion }) => {
      const { comprobantes, ...resto } = oc;
      return { ...resto, alertaFacturacion };
    });

  return {
    items,
    total,
    page: pageNum,
    pageSize: pageSizeNum,
    totalPages: Math.max(1, Math.ceil(total / pageSizeNum)),
  };
}

async function obtenerOCPorId(id) {
  const ocId = Number(id);
  if (!Number.isInteger(ocId)) {
    throw new ErrorDeNegocio("id inválido.");
  }
  const oc = await prisma.ordenCompra.findUnique({
    where: { id: ocId },
    include: {
      proveedor: true,
      deposito: true,
      detalle: { include: { articulo: true } },
      log: { orderBy: { fecha: "asc" } }, // el campo en el schema es "log", no "logs"
      // Para el link Requerimiento/Presupuesto del detalle de OC — el
      // archivo adjunto del presupuesto (BLOB, hasta 5MB) se omite acá
      // porque esta ficha no lo usa, mismo criterio que generarOC más arriba.
      presupuesto: {
        omit: { archivoAdjunto: true },
        include: { requerimiento: true },
      },
      // Punto 4 del rediseño del detalle: solo para distinguir "todavía no
      // se recibió, es normal que no haya movimiento" (Pendiente/Enviada)
      // de "está Recibida pero el movimiento de entrada no existe" — un
      // problema de integridad real que no debería pasar (registrarRecepcion
      // siempre lo crea en la misma transacción), pero si pasa merece alerta,
      // no la misma pastilla neutra de "todavía no llegó". select liviano:
      // alcanza con saber si existe al menos uno.
      movimientos: { select: { id: true }, take: 1 },
    },
  });
  if (!oc) {
    throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  }
  return oc;
}

// ---------------------------------------------------------------------------
// HU-24 · Enviar. La OC no pasa por ninguna aprobación de gerente — esa
// aprobación ya se dio al adjudicar el presupuesto (aprobarPresupuesto en
// presupuestos.servicio.js); acá compras genera y envía directo.
// ---------------------------------------------------------------------------

async function enviarOC(id, usuario) {
  const ocId = Number(id);
  const oc = await prisma.ordenCompra.findUnique({ where: { id: ocId } });
  if (!oc) throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  if (oc.estado !== "Pendiente") {
    throw new ErrorDeNegocio("La orden no está en un estado válido para ser enviada.", 409);
  }

  return prisma.$transaction(
    async (tx) => {
      const actualizada = await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: "Enviada" },
      });
      await tx.ordenCompraLog.create({
        data: { ordenCompraId: oc.id, usuario: usuario || "compras", accion: "Orden enviada al proveedor" },
      });
      return actualizada;
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

// ---------------------------------------------------------------------------
// HU-25 · Anular
// ---------------------------------------------------------------------------

async function anularOC(id, motivo, usuario) {
  const ocId = Number(id);
  const oc = await prisma.ordenCompra.findUnique({ where: { id: ocId } });
  if (!oc) throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  if (["Recibida", "Recibida con diferencia", "Anulada", "Cerrada"].includes(oc.estado)) {
    throw new ErrorDeNegocio("No se puede anular una orden ya recibida, anulada o cerrada.", 409);
  }

  const movimientoDeEntrada = await prisma.movimientoStock.findFirst({
    where: { ordenCompraId: oc.id },
  });
  if (movimientoDeEntrada) {
    throw new ErrorDeNegocio("La orden ya generó un movimiento de stock de entrada y no puede anularse.", 409);
  }

  return prisma.$transaction(
    async (tx) => {
      // Re-chequeo protegido contra carreras: FOR UPDATE bloquea la fila de
      // la OC hasta que esta transacción termine, así una recepción (HU-85)
      // que llegue casi al mismo tiempo espera a que esta commitee y ve el
      // estado "Anulada" ya puesto, en vez de generar un movimiento de stock
      // sobre una orden que se está anulando a la vez. Mismo patrón que
      // aprobarPresupuesto en presupuestos.servicio.js.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ordenes_compra WHERE id = ${oc.id} FOR UPDATE`);
      const ocFresca = await tx.ordenCompra.findUnique({ where: { id: oc.id } });
      if (["Recibida", "Recibida con diferencia", "Anulada", "Cerrada"].includes(ocFresca.estado)) {
        throw new ErrorDeNegocio("No se puede anular una orden ya recibida, anulada o cerrada.", 409);
      }
      const movimientoFresco = await tx.movimientoStock.findFirst({ where: { ordenCompraId: oc.id } });
      if (movimientoFresco) {
        throw new ErrorDeNegocio("La orden ya generó un movimiento de stock de entrada y no puede anularse.", 409);
      }

      const actualizada = await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: "Anulada", motivoAnulacion: motivo },
      });
      await tx.ordenCompraLog.create({
        data: { ordenCompraId: oc.id, usuario: usuario || "compras", accion: `Orden anulada: ${motivo}` },
      });
      return actualizada;
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

// ---------------------------------------------------------------------------
// HU-85 · Recepción — toca Depósito y Stock
// ---------------------------------------------------------------------------

async function registrarRecepcion(id, detalleRecibido, usuario) {
  const ocId = Number(id);
  const oc = await prisma.ordenCompra.findUnique({
    where: { id: ocId },
    include: { detalle: true, deposito: true, presupuesto: true },
  });
  if (!oc) throw new ErrorDeNegocio("Orden de compra no encontrada.", 404);
  if (oc.estado !== "Enviada") {
    throw new ErrorDeNegocio("Solo se puede registrar recepción de una orden en estado Enviada.", 409);
  }

  const articuloIds = detalleRecibido.map((l) => Number(l.articuloId));
  if (new Set(articuloIds).size !== articuloIds.length) {
    throw new ErrorDeNegocio("No se puede repetir el mismo artículo dos veces en el detalle.");
  }

  const detallePorArticulo = new Map(oc.detalle.map((d) => [d.articuloId, d]));

  // 1) Validar TODO antes de tocar la base: si una línea se pasa, no se
  // guarda nada (ni siquiera dentro de la transacción se llega a intentar).
  for (const linea of detalleRecibido) {
    const original = detallePorArticulo.get(Number(linea.articuloId));
    if (!original) {
      throw new ErrorDeNegocio(`El artículo ${linea.articuloId} no pertenece a esta orden de compra.`);
    }
    const cantidadRecibida = Number(linea.cantidadRecibida);
    if (!Number.isFinite(cantidadRecibida) || cantidadRecibida < 0) {
      throw new ErrorDeNegocio(`Cantidad inválida para el artículo ${linea.articuloId}.`);
    }
    if (cantidadRecibida > Number(original.cantidad)) {
      throw new ErrorDeNegocio(`La cantidad recibida del artículo ${linea.articuloId} supera lo solicitado.`);
    }
  }

  // 2) Tipo de movimiento (sembrado por seed-tipos-movimiento.js: tipo "E",
  // contexto "NORMAL" — confirmado contra backend/scripts/seed-tipos-movimiento.js).
  const tipoEntradaPorCompra = await prisma.tipoMovimientoStock.findFirst({
    where: { descripcion: "Entrada por Compra", activo: true },
  });
  if (!tipoEntradaPorCompra) {
    throw new ErrorDeNegocio(
      'No se encontró el tipo de movimiento "Entrada por Compra" activo; correr seed-tipos-movimiento.js.',
      500
    );
  }

  // 3) Habilitación Artículo-Depósito (mismo chequeo que registrarEntrada en
  // movimientosStock.servicio.js — no sumar stock a un artículo no habilitado).
  const habilitaciones = await prisma.articuloDeposito.findMany({
    where: { depositoId: oc.depositoId, articuloId: { in: articuloIds }, activo: true },
    include: { articulo: true },
  });
  const habilitacionPorArticulo = Object.fromEntries(habilitaciones.map((h) => [h.articuloId, h]));
  const noHabilitados = articuloIds.filter((aid) => !habilitacionPorArticulo[aid]);
  if (noHabilitados.length > 0) {
    throw new ErrorDeNegocio(
      `Los artículos [${noHabilitados.join(", ")}] no están habilitados en el depósito de esta orden.`
    );
  }

  const huboDiferencia = detalleRecibido.some((linea) => {
    const original = detallePorArticulo.get(Number(linea.articuloId));
    return Number(linea.cantidadRecibida) < Number(original.cantidad);
  });
  const estadoFinalOC = huboDiferencia ? "Recibida con diferencia" : "Recibida";

  return prisma.$transaction(
    async (tx) => {
      // Re-chequeo protegido contra carreras: FOR UPDATE bloquea la fila de
      // la OC hasta que esta transacción termine — un doble envío del mismo
      // formulario (doble clic, reintento de red) o una anulación (HU-25)
      // concurrente ven el estado ya actualizado en vez de duplicar el
      // movimiento de stock de entrada. Mismo patrón que anularOC.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM ordenes_compra WHERE id = ${oc.id} FOR UPDATE`);
      const ocFresca = await tx.ordenCompra.findUnique({ where: { id: oc.id } });
      if (ocFresca.estado !== "Enviada") {
        throw new ErrorDeNegocio("Solo se puede registrar recepción de una orden en estado Enviada.", 409);
      }

      // Actualizar cantidadRecibida en cada línea de la OC
      for (const linea of detalleRecibido) {
        await tx.ordenCompraDetalle.update({
          where: {
            ordenCompraId_articuloId: { ordenCompraId: oc.id, articuloId: Number(linea.articuloId) },
          },
          data: { cantidadRecibida: linea.cantidadRecibida },
        });
      }

      // Movimiento de Entrada por Compra
      const movimiento = await tx.movimientoStock.create({
        data: {
          depositoId: oc.depositoId,
          tipoMovStockId: tipoEntradaPorCompra.id,
          ordenCompraId: oc.id,
          detalle: `Recepción de ${oc.numero}`,
          usuario: usuario || null,
          // estado queda en su default "Confirmado": a diferencia de una
          // transferencia, la recepción de una OC es un solo paso — la
          // diferencia (si la hay) se refleja en OrdenCompra.estado, no acá.
        },
      });

      // Detalle del movimiento + suma de stock, solo por lo efectivamente recibido
      for (const linea of detalleRecibido) {
        const cantidadRecibida = Number(linea.cantidadRecibida);
        if (cantidadRecibida === 0) continue;

        await tx.movimientoStockDetalle.create({
          data: { movStockId: movimiento.id, articuloId: Number(linea.articuloId), cantidad: cantidadRecibida },
        });

        const habilitacion = habilitacionPorArticulo[Number(linea.articuloId)];
        await tx.articuloDepositoStock.upsert({
          where: { articuloDepositoId: habilitacion.id },
          create: { articuloDepositoId: habilitacion.id, stockActual: cantidadRecibida },
          update: { stockActual: { increment: cantidadRecibida } },
        });

        // Sprint 3 — Fase 4: si esta OC repone un depósito central,
        // retoma las transferencias que se habían quedado "Pendiente de
        // stock" esperando este artículo. No hace nada si el depósito no
        // es central.
        if (oc.deposito.esCentral) {
          await reintentarTransferenciasPendientes(tx, {
            depositoCentralId: oc.depositoId,
            articuloId: Number(linea.articuloId),
          });
        }
      }

      await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: estadoFinalOC, fechaRecibida: new Date() },
      });

      await tx.ordenCompraLog.create({
        data: {
          ordenCompraId: oc.id,
          usuario: usuario || "deposito",
          accion: `Recepción registrada — ${estadoFinalOC}`,
        },
      });

      // Sprint 3 — Fase 4: si esta OC viene de una reposición automática o
      // sugerida del central, su trabajo termina acá — se cierra el
      // círculo completo (punto 8). Ojo: el filtro es `oc.deposito.esCentral`,
      // NO `tipo === COMPRA` — COMPRA es el tipo de CUALQUIER compra común
      // (incluidas todas las de Sprint 1/2, desde depósitos no centrales);
      // sin este filtro, cualquier requerimiento de compra ordinario se
      // cerraría solo al recibir su OC, un estado nuevo que ese flujo
      // nunca tuvo antes de este sprint.
      if (oc.deposito.esCentral && oc.presupuesto?.requerimientoId) {
        const origen = await tx.requerimientoReposicion.findUnique({
          where: { id: oc.presupuesto.requerimientoId },
        });
        if (origen && origen.tipo === TIPOS_REQUERIMIENTO.COMPRA && origen.estado === ESTADOS_REQUERIMIENTO.APROBADO) {
          await tx.requerimientoReposicion.update({
            where: { id: origen.id },
            data: { estado: ESTADOS_REQUERIMIENTO.CERRADA },
          });
          await tx.requerimientoLog.create({
            data: {
              requerimientoId: origen.id,
              usuario: usuario || "sistema",
              accion: `Cerrada — recepción de ${oc.numero} registrada (${estadoFinalOC})`,
            },
          });
        }
      }

      // Si el pago ya se había completado ANTES de esta recepción (ej. un
      // anticipo), nada más vuelve a revisar el cierre automático después
      // de este punto — se chequea acá también, no solo al confirmar un
      // pago (ver verificarCierrePorPagos más abajo).
      await verificarCierrePorPagos(tx, oc.id, { usuario });

      return tx.ordenCompra.findUnique({ where: { id: oc.id } });
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

// ---------------------------------------------------------------------------
// Cierre automático — una OC pasa a "Cerrada" cuando todos los comprobantes
// vinculados a ella (Facturas con ordenCompraId = esta OC) llegan a
// "Pagado" (saldo <= 0, mismo criterio que calcularEstadoComprobante en
// comprobantes.servicio.js — ahí el estado nunca se persiste, se deriva
// del saldo en cada lectura). Por eso este chequeo no vive en un único
// lugar: hay que llamarlo desde cualquier operación que pueda llevar un
// saldo a 0 sin pasar por acá (un pago que la cubre, o una Nota de
// Crédito lo bastante grande) Y desde la recepción (si el pago ya se
// había completado ANTES de recibir la mercadería, nada más vuelve a
// revisar el cierre después).
//
// Un comprobante Anulado nunca tuvo un pago ni un ajuste real aplicado
// (anularComprobante lo bloquea si los tiene), así que no cuenta como
// "Pagado" pero tampoco bloquea el cierre — se excluye del chequeo. Si
// no queda ninguna Factura activa (todas anuladas), no se cierra: nada
// que declarar pagado.
//
// Debe llamarse SIEMPRE dentro de la misma transacción (`tx`) que la
// operación que la dispara, para no crear una ventana donde otro proceso
// vea un estado a medio actualizar.
async function verificarCierrePorPagos(tx, ordenCompraId, { usuario } = {}) {
  const oc = await tx.ordenCompra.findUnique({
    where: { id: ordenCompraId },
    include: { comprobantes: true },
  });
  if (!oc) return;
  if (!["Recibida", "Recibida con diferencia"].includes(oc.estado)) return;

  const facturasActivas = oc.comprobantes.filter((c) => c.tipo === "Factura" && !c.anulado);
  if (facturasActivas.length === 0) return;

  // FOR UPDATE recién acá (no antes del chequeo de estado/facturas de
  // arriba, que no necesita el lock): evita que dos pagos concurrentes a
  // distintas facturas de la misma OC pisen el estado si ambos llegan a
  // "todo pagado" casi al mismo tiempo. Mismo patrón que anularOC/
  // registrarRecepcion.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM ordenes_compra WHERE id = ${oc.id} FOR UPDATE`);
  const ocFresca = await tx.ordenCompra.findUnique({ where: { id: oc.id } });
  if (!["Recibida", "Recibida con diferencia"].includes(ocFresca.estado)) return;

  const saldos = await calcularSaldosComprobantes(facturasActivas, tx);
  const todasPagadas = facturasActivas.every((f) => (saldos.get(f.id) ?? 0) <= 0);
  if (!todasPagadas) return;

  await tx.ordenCompra.update({ where: { id: oc.id }, data: { estado: "Cerrada" } });
  await tx.ordenCompraLog.create({
    data: {
      ordenCompraId: oc.id,
      usuario: usuario || "sistema",
      accion: `Cerrada automáticamente — comprobante(s) ${facturasActivas.map((f) => f.numero).join(", ")} totalmente pagado(s)`,
    },
  });
}

module.exports = {
  generarOC,
  listarOCs,
  obtenerOCPorId,
  enviarOC,
  anularOC,
  registrarRecepcion,
  verificarCierrePorPagos,
  ErrorDeNegocio,
};