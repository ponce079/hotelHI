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

  const skip = (Number(page) - 1) * Number(pageSize);

  const [items, total] = await Promise.all([
    prisma.ordenCompra.findMany({
      where,
      include: { proveedor: true },
      orderBy: { fecha: "desc" },
      skip,
      take: Number(pageSize),
    }),
    prisma.ordenCompra.count({ where }),
  ]);

  return {
    items,
    total,
    page: Number(page),
    pageSize: Number(pageSize),
    totalPages: Math.max(1, Math.ceil(total / Number(pageSize))),
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

      const ocActualizada = await tx.ordenCompra.update({
        where: { id: oc.id },
        data: { estado: estadoFinalOC },
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

      return ocActualizada;
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

module.exports = {
  generarOC,
  listarOCs,
  obtenerOCPorId,
  enviarOC,
  anularOC,
  registrarRecepcion,
  ErrorDeNegocio,
};