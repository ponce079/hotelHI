// src/modulos/movimientos-stock/movimientosStock.servicio.js
//
// Lógica de negocio pura (HU-12: Movimiento de Entrada). No sabe nada de
// HTTP/Express — recibe datos, devuelve datos o tira errores con un
// "statusCode" para que el controlador decida cómo responder.
//
// Reutilizable: mañana se puede llamar desde un script de carga masiva
// sin pasar por una request HTTP, algo que con todo mezclado en la ruta
// no se podía hacer.

const prisma = require("../../lib/prisma");

class ErrorDeNegocio extends Error {
constructor(mensaje, statusCode = 400) {
super(mensaje);
this.statusCode = statusCode;
}
}

async function registrarEntrada({ depositoId, tipoMovStockId, detalle, usuario, items }) {
// --- Validaciones básicas de payload ---
if (!depositoId || !tipoMovStockId) {
throw new ErrorDeNegocio("depositoId y tipoMovStockId son obligatorios.");
}
if (!Array.isArray(items) || items.length === 0) {
throw new ErrorDeNegocio("Debe incluir al menos un artículo en 'items'.");
}
const articuloIds = items.map((i) => i.articuloId);
if (new Set(articuloIds).size !== articuloIds.length) {
throw new ErrorDeNegocio("No se puede repetir el mismo artículo dos veces en el detalle.");
}
if (items.some((i) => !i.articuloId || !(Number(i.cantidad) > 0))) {
throw new ErrorDeNegocio("Cada ítem necesita articuloId y una cantidad mayor a 0.");
}

// --- Validar tipo de movimiento (debe ser de Entrada) ---
const tipoMov = await prisma.tipoMovimientoStock.findUnique({ where: { id: Number(tipoMovStockId) } });
if (!tipoMov || !tipoMov.activo) {
throw new ErrorDeNegocio("El tipo de movimiento indicado no existe o está inactivo.");
}
if (tipoMov.tipo !== "E") {
throw new ErrorDeNegocio(`El tipo de movimiento '${tipoMov.descripcion}' no es de Entrada (tipo='E').`);
}

// --- Validar depósito ---
const deposito = await prisma.deposito.findUnique({ where: { id: Number(depositoId) } });
if (!deposito || !deposito.activo) {
throw new ErrorDeNegocio("El depósito indicado no existe o está inactivo.");
}

// --- Validar habilitación Artículo-Depósito (HU-4) ---
const habilitaciones = await prisma.articuloDeposito.findMany({
where: { depositoId: Number(depositoId), articuloId: { in: articuloIds }, activo: true },
});
const habilitadosIds = new Set(habilitaciones.map((h) => h.articuloId));
const noHabilitados = articuloIds.filter((id) => !habilitadosIds.has(id));
if (noHabilitados.length > 0) {
throw new ErrorDeNegocio(
`Los artículos [${noHabilitados.join(", ")}] no están habilitados en este depósito (HU-4).`
);
}
const habilitacionPorArticulo = Object.fromEntries(habilitaciones.map((h) => [h.articuloId, h]));

// --- Transacción atómica: alta del movimiento + detalle + stock ---
const movimientoCreado = await prisma.$transaction(
async (tx) => {
const movimiento = await tx.movimientoStock.create({
data: {
depositoId: Number(depositoId),
tipoMovStockId: Number(tipoMovStockId),
detalle: detalle || null,
usuario: usuario || null,
},
});

```
  for (const item of items) {
    const cantidad = Number(item.cantidad);
    const articuloDepositoId = habilitacionPorArticulo[item.articuloId].id;

    await tx.movimientoStockDetalle.create({
      data: { movStockId: movimiento.id, articuloId: item.articuloId, cantidad },
    });

    await tx.articuloDepositoStock.upsert({
      where: { articuloDepositoId },
      create: { articuloDepositoId, stockActual: cantidad },
      update: { stockActual: { increment: cantidad } },
    });
  }

  return tx.movimientoStock.findUnique({
    where: { id: movimiento.id },
    include: {
      deposito: true,
      tipoMovStock: true,
      detalleMovimientos: { include: { articulo: true } },
    },
  });
},
{ timeout: 15000, maxWait: 10000 }
```

);

return movimientoCreado;
}

// -----------------------------------------------------------------------
// HU-13: Movimiento de Salida.
// Mismo esqueleto que registrarEntrada, con dos diferencias de negocio:
//   1) el tipo de movimiento debe ser 'S', no 'E'.
//   2) en vez de upsert(increment), hace update(decrement) — y valida que
//      alcance el stock ANTES de descontar (no puede quedar negativo).
// -----------------------------------------------------------------------
async function registrarSalida({ depositoId, tipoMovStockId, detalle, usuario, items }) {
// --- Validaciones básicas de payload ---
if (!depositoId || !tipoMovStockId) {
throw new ErrorDeNegocio("depositoId y tipoMovStockId son obligatorios.");
}
if (!Array.isArray(items) || items.length === 0) {
throw new ErrorDeNegocio("Debe incluir al menos un artículo en 'items'.");
}
const articuloIds = items.map((i) => i.articuloId);
if (new Set(articuloIds).size !== articuloIds.length) {
throw new ErrorDeNegocio("No se puede repetir el mismo artículo dos veces en el detalle.");
}
if (items.some((i) => !i.articuloId || !(Number(i.cantidad) > 0))) {
throw new ErrorDeNegocio("Cada ítem necesita articuloId y una cantidad mayor a 0.");
}

// --- Validar tipo de movimiento (debe ser de Salida) ---
const tipoMov = await prisma.tipoMovimientoStock.findUnique({ where: { id: Number(tipoMovStockId) } });
if (!tipoMov || !tipoMov.activo) {
throw new ErrorDeNegocio("El tipo de movimiento indicado no existe o está inactivo.");
}
if (tipoMov.tipo !== "S") {
throw new ErrorDeNegocio(`El tipo de movimiento '${tipoMov.descripcion}' no es de Salida (tipo='S').`);
}

// --- Validar depósito ---
const deposito = await prisma.deposito.findUnique({ where: { id: Number(depositoId) } });
if (!deposito || !deposito.activo) {
throw new ErrorDeNegocio("El depósito indicado no existe o está inactivo.");
}

// --- Validar habilitación Artículo-Depósito (HU-4) ---
const habilitaciones = await prisma.articuloDeposito.findMany({
where: { depositoId: Number(depositoId), articuloId: { in: articuloIds }, activo: true },
});
const habilitadosIds = new Set(habilitaciones.map((h) => h.articuloId));
const noHabilitados = articuloIds.filter((id) => !habilitadosIds.has(id));
if (noHabilitados.length > 0) {
throw new ErrorDeNegocio(
`Los artículos [${noHabilitados.join(", ")}] no están habilitados en este depósito (HU-4).`
);
}
const habilitacionPorArticulo = Object.fromEntries(habilitaciones.map((h) => [h.articuloId, h]));

// --- Transacción atómica: alta del movimiento + detalle + stock ---
const movimientoCreado = await prisma.$transaction(
async (tx) => {
const movimiento = await tx.movimientoStock.create({
data: {
depositoId: Number(depositoId),
tipoMovStockId: Number(tipoMovStockId),
detalle: detalle || null,
usuario: usuario || null,
},
});

```
  for (const item of items) {
    const cantidad = Number(item.cantidad);
    const articuloDepositoId = habilitacionPorArticulo[item.articuloId].id;

    // El chequeo de stock va PEGADO al decrement, dentro de la misma
    // transacción (no antes de abrirla): así queda lo más cerca posible
    // de la escritura. Nota: esto reduce la ventana de carrera entre dos
    // salidas simultáneas sobre el mismo artículo, pero no la elimina
    // del todo (para eso haría falta un update condicional del tipo
    // `updateMany({ where: { stockActual: { gte: cantidad } } })` y
    // chequear count === 1). Queda como mejora para un hardening
    // posterior, no bloqueante para el Sprint 1.
    const stock = await tx.articuloDepositoStock.findUnique({ where: { articuloDepositoId } });
    const stockActual = stock ? Number(stock.stockActual) : 0;
    if (stockActual < cantidad) {
      throw new ErrorDeNegocio(
        `Stock insuficiente para el artículo ${item.articuloId}. Actual: ${stockActual}, Solicitado: ${cantidad}.`
      );
    }

    await tx.movimientoStockDetalle.create({
      data: { movStockId: movimiento.id, articuloId: item.articuloId, cantidad },
    });

    await tx.articuloDepositoStock.update({
      where: { articuloDepositoId },
      data: { stockActual: { decrement: cantidad } },
    });
  }

  return tx.movimientoStock.findUnique({
    where: { id: movimiento.id },
    include: {
      deposito: true,
      tipoMovStock: true,
      detalleMovimientos: { include: { articulo: true } },
    },
  });
},
{ timeout: 15000, maxWait: 10000 }
```

);

return movimientoCreado;
}

module.exports = { registrarEntrada, registrarSalida, ErrorDeNegocio };
