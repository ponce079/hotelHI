const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
// src/modulos/movimientos-salida/movimientoSalida.servicio.js
//
// Lógica de negocio pura (HU-13: Movimiento de Salida). Mismo patrón que
// movimientos-stock/movimientosStock.servicio.js (HU-12, Entrada): no sabe
// nada de HTTP/Express, tira errores con "statusCode" para que el
// controlador decida cómo responder.
//
// NOTA: ErrorDeNegocio está duplicada a propósito acá (existe otra copia
// en movimientosStock.servicio.js). Es así para que esta carpeta sea
// autocontenida y no dependa de un módulo de otra persona. Si el equipo
// quiere unificarla más adelante, se puede mover a src/lib/errores.js.

const prisma = require("../../lib/prisma");
const { verificarStockMinimoCentralEnLote } = require("../requerimientos/requerimientos.servicio");
const { descontarStockEnLote } = require("../../lib/stockLote");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Núcleo real de HU-13, parametrizado por `cliente` (el `prisma` global o el
// `tx` de una transacción ya abierta por quien llama). Se separó de
// `registrarSalida` en Sprint 3 (Servicios Adicionales, HU-61: el consumo de
// Minibar necesita crear su propio registro Y descontar stock en una única
// transacción atómica) — mismo criterio que `crearReservaEnTransaccion` en
// `reservas.servicio.js`. Las validaciones de "existe y está habilitado" se
// hacen contra `cliente` para que, si se llama dentro de una transacción
// ajena, lean el mismo snapshot consistente que después van a escribir.
async function registrarSalidaConCliente(cliente, { depositoId, tipoMovStockId, detalle, usuario, items }) {
  // --- Validaciones básicas de payload ---
  if (!depositoId || !tipoMovStockId) {
    throw new ErrorDeNegocio("depositoId y tipoMovStockId son obligatorios.");
  }
  // Mismo chequeo que en movimientosStock.servicio.js (Entrada, HU-12): el
  // front exige "a donde va" antes de confirmar, pero no hay columna
  // dedicada para esa contraparte externa — viaja plegada en "detalle". Sin
  // este chequeo, la API aceptaba una Salida sin ningun dato de destino si
  // se llamaba directo (sin pasar por el formulario).
  if (!detalle || !String(detalle).trim()) {
    throw new ErrorDeNegocio("detalle es obligatorio: debe indicar el destino del movimiento (área, motivo).");
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
  const tipoMov = await cliente.tipoMovimientoStock.findUnique({ where: { id: Number(tipoMovStockId) } });
  if (!tipoMov || !tipoMov.activo) {
    throw new ErrorDeNegocio("El tipo de movimiento indicado no existe o está inactivo.");
  }
  if (tipoMov.tipo !== "S") {
    throw new ErrorDeNegocio(`El tipo de movimiento '${tipoMov.descripcion}' no es de Salida (tipo='S').`);
  }
  if (tipoMov.contexto !== "NORMAL") {
    throw new ErrorDeNegocio(
      `El tipo de movimiento '${tipoMov.descripcion}' es exclusivo del flujo de Transferencia y no se puede elegir a mano.`
    );
  }

  // --- Validar depósito ---
  const deposito = await cliente.deposito.findUnique({ where: { id: Number(depositoId) } });
  if (!deposito || !deposito.activo) {
    throw new ErrorDeNegocio("El depósito indicado no existe o está inactivo.");
  }

  // --- Validar habilitación Artículo-Depósito (HU-4) ---
  const habilitaciones = await cliente.articuloDeposito.findMany({
    where: { depositoId: Number(depositoId), articuloId: { in: articuloIds }, activo: true },
    include: { articulo: true },
  });
  const habilitadosIds = new Set(habilitaciones.map((h) => h.articuloId));
  const noHabilitados = articuloIds.filter((id) => !habilitadosIds.has(id));
  if (noHabilitados.length > 0) {
    throw new ErrorDeNegocio(
      `Los artículos [${noHabilitados.join(", ")}] no están habilitados en este depósito (HU-4).`
    );
  }

  // --- Validar que ningun articulo este dado de baja (HU-2) ---
  const deshabilitados = habilitaciones.filter((h) => !h.articulo.activo);
  if (deshabilitados.length > 0) {
    const nombres = deshabilitados.map((h) => h.articulo.nombre).join(", ");
    throw new ErrorDeNegocio(`Los siguientes artículos están dados de baja y no aceptan movimientos: ${nombres}.`);
  }

  const habilitacionPorArticulo = Object.fromEntries(habilitaciones.map((h) => [h.articuloId, h]));

  // --- Alta del movimiento + detalle + stock, todo contra el mismo `cliente` ---
  async function escribir(tx) {
    const movimiento = await tx.movimientoStock.create({
      data: {
        depositoId: Number(depositoId),
        tipoMovStockId: Number(tipoMovStockId),
        detalle: detalle || null,
        usuario: usuario || null,
      },
    });

    // Detalle y descuento en lote (una sentencia cada uno). "Verificar y descontar" sigue siendo atómico en una sola
    // sentencia SQL — dos salidas simultáneas sobre el mismo artículo no pueden pasar ambas la validación con el mismo
    // stock leído (evita quedar en negativo) — y si algún artículo no alcanza, no se descuenta ninguno.
    await tx.movimientoStockDetalle.createMany({
      data: items.map((item) => ({ movStockId: movimiento.id, articuloId: item.articuloId, cantidad: Number(item.cantidad) })),
    });
    const filas = items.map((item) => ({
      articuloDepositoId: habilitacionPorArticulo[item.articuloId].id,
      articuloId: item.articuloId,
      cantidad: Number(item.cantidad),
    }));
    const sinStock = await descontarStockEnLote(tx, filas);
    if (sinStock.length > 0) {
      const f = sinStock[0];
      throw new ErrorDeNegocio(`Stock insuficiente para el artículo ${f.articuloId}. Actual: ${f.stockActual}, Solicitado: ${f.cantidad}.`);
    }

    // Sprint 3 — Transferencia a Central: si este depósito es central y la salida lo dejó bajo el mínimo, dispara (o
    // acumula sobre) su reposición. Un solo chequeo en lote; no se consulta nada si el depósito no es central.
    if (deposito.esCentral) await verificarStockMinimoCentralEnLote(tx, filas.map((f) => f.articuloDepositoId));

    return tx.movimientoStock.findUnique({
      where: { id: movimiento.id },
      include: {
        deposito: true,
        tipoMovStock: true,
        detalleMovimientos: { include: { articulo: true } },
      },
    });
  }

  // Si `cliente` ya es un `tx` (tiene modelos pero no `$transaction`), las
  // escrituras van directo contra él, dentro de la transacción de quien
  // llama. Si es el `prisma` global, abrimos una transacción propia — este
  // es el único caso en el que `registrarSalida` (sin cliente externo)
  // sigue comportándose exactamente igual que antes de este refactor.
  if (typeof cliente.$transaction === "function") {
    return cliente.$transaction((tx) => escribir(tx), OPCIONES_TRANSACCION);
  }
  return escribir(cliente);
}

async function registrarSalida(data) {
  return registrarSalidaConCliente(prisma, data);
}

// Variante reusable desde una transacción ya abierta por otro módulo (ver
// comentario arriba) — mismo contrato que `registrarSalida`, solo que
// recibe el `tx` como primer argumento en vez de abrir el suyo.
async function registrarSalidaEnTransaccion(tx, data) {
  return registrarSalidaConCliente(tx, data);
}

module.exports = { registrarSalida, registrarSalidaEnTransaccion, ErrorDeNegocio };
