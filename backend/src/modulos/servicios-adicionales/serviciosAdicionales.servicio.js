// Servicios Adicionales (HU-61 a HU-64).
//
// Consumo de restaurante/spa/lavandería/minibar durante la estadía. Cuando
// tipoServicio = 'Minibar', además de registrar el consumo hay que
// descontar stock real (relación cruzada con Sprint 1) — se reusa el mismo
// servicio de Salida de Stock que ya usa el resto del sistema, dentro de una
// única transacción (ver movimientoSalida.servicio.js: registrarSalidaEnTransaccion).
//
// HU-64 no agrega modelo ni pantalla propia: reutiliza Articulo +
// ArticuloDeposito + ArticuloDepositoStock de Sprint 1 tal cual, vía
// stock.servicio.js (GET /api/stock) para poblar el selector de artículos.

const prisma = require("../../lib/prisma");
const reservasServicio = require("../reservas/reservas.servicio");
const { ESTADO_RESERVA } = require("../reservas/reservas.constantes");
const movimientoSalidaServicio = require("../movimientos-salida/movimientoSalida.servicio");
const {
  TIPOS_SERVICIO,
  DESCRIPCION_TIPO_MOVIMIENTO_MINIBAR,
  DEPOSITO_MINIBAR_NOMBRE,
  LIMITES_SERVICIOS_ADICIONALES,
} = require("./serviciosAdicionales.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

function enteroPositivo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor a 0.`);
  return numero;
}

function textoObligatorio(valor, campo, maximo) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw new ErrorDeNegocio(`${campo} es obligatorio.`);
  if (texto.length > maximo) throw new ErrorDeNegocio(`${campo} no puede superar los ${maximo} caracteres.`);
  return texto;
}

function normalizarTipoServicio(valor) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!TIPOS_SERVICIO.includes(texto)) {
    throw new ErrorDeNegocio(`tipoServicio debe ser uno de: ${TIPOS_SERVICIO.join(", ")}.`);
  }
  return texto;
}

function formatearConsumo(c) {
  return {
    id: c.id,
    reservaId: c.reservaId,
    habitacionId: c.habitacionId,
    habitacionNumero: c.habitacion?.numero ?? null,
    tipoServicio: c.tipoServicio,
    articuloId: c.articuloId,
    articuloNombre: c.articulo?.nombre ?? null,
    cantidad: c.cantidad !== null && c.cantidad !== undefined ? Number(c.cantidad) : null,
    monto: Number(c.monto),
    fechaHora: c.fechaHora,
    registradoPor: c.registradoPor,
    // Solo seteado para Minibar (ver registrarConsumo) — la referencia real
    // al MovimientoStock que descontó el stock, para poder saber de qué
    // depósito salió sin parsear texto libre.
    movimientoStockId: c.movimientoStockId ?? null,
  };
}

// HU-61/64: no se pide el tipo de movimiento de stock en el formulario — se
// resuelve solo. Busca primero el que ya existe en la base real del
// proyecto ("Salida por Consumo Interno"); si algún entorno no lo tiene
// cargado, cae a cualquier otro tipo de Salida normal activo en vez de
// bloquear el consumo por un dato de catálogo faltante.
async function resolverTipoMovimientoMinibar(cliente) {
  const porNombre = await cliente.tipoMovimientoStock.findFirst({
    where: { descripcion: DESCRIPCION_TIPO_MOVIMIENTO_MINIBAR, tipo: "S", contexto: "NORMAL", activo: true },
  });
  if (porNombre) return porNombre.id;

  const cualquiera = await cliente.tipoMovimientoStock.findFirst({
    where: { tipo: "S", contexto: "NORMAL", activo: true },
    orderBy: { id: "asc" },
  });
  if (!cualquiera) {
    throw new ErrorDeNegocio(
      "No hay ningún tipo de movimiento de Salida activo configurado — pedile a un administrador que dé de alta uno en Tipos de Movimiento antes de registrar consumos de Minibar.",
      409
    );
  }
  return cualquiera.id;
}

// Sprint 3 — decisión de negocio: a diferencia del resto de Salidas de
// Stock, acá NO se le pide a quien carga el consumo que elija de qué
// depósito sale (evita repetir el bug ya encontrado una vez de descontar
// del depósito equivocado cuando el mismo artículo está habilitado en más
// de uno). Siempre es el depósito fijo "Minibar" — a diferencia de
// resolverTipoMovimientoMinibar, acá no hay un fallback razonable a
// "cualquier otro depósito" si no existe: sin él no hay de dónde descontar.
async function resolverDepositoMinibar(cliente) {
  const deposito = await cliente.deposito.findFirst({
    where: { nombre: DEPOSITO_MINIBAR_NOMBRE, activo: true },
  });
  if (!deposito) {
    throw new ErrorDeNegocio(
      `No existe el depósito "${DEPOSITO_MINIBAR_NOMBRE}" (o está inactivo) — pedile a un administrador que lo cree antes de registrar consumos de Minibar.`,
      409
    );
  }
  return deposito.id;
}

// --------------------------------------------------------------
// HU-61/62 — registrar consumo
// --------------------------------------------------------------

async function registrarConsumo(data) {
  const reservaId = enteroPositivo(data?.reservaId, "reservaId");
  const habitacionId = enteroPositivo(data?.habitacionId, "habitacionId");
  const tipoServicio = normalizarTipoServicio(data?.tipoServicio);
  const monto = Number(data?.monto);
  if (!(monto > 0)) throw new ErrorDeNegocio("monto debe ser un número mayor a 0.");
  const registradoPor = textoObligatorio(data?.registradoPor, "registradoPor", LIMITES_SERVICIOS_ADICIONALES.registradoPor);

  // La reserva tiene que existir y estar "En curso": antes del check-in
  // (Confirmada) el huésped todavía no llegó, y después del check-out
  // (Cerrada) ya no hay estadía a la que cargarle un consumo nuevo.
  const reserva = await reservasServicio.obtenerReserva(reservaId);
  if (reserva.estado !== ESTADO_RESERVA.EN_CURSO) {
    throw new ErrorDeNegocio(
      `Solo se pueden registrar consumos con la reserva "En curso" (ésta está "${reserva.estado}").`
    );
  }
  if (!reserva.habitaciones.some((h) => h.id === habitacionId)) {
    throw new ErrorDeNegocio("La habitación indicada no pertenece a esta reserva.");
  }

  if (tipoServicio === "Minibar") {
    const articuloId = enteroPositivo(data?.articuloId, "articuloId");
    const cantidad = Number(data?.cantidad);
    if (!(cantidad > 0)) throw new ErrorDeNegocio("cantidad debe ser un número mayor a 0 para Minibar.");

    const habitacion = await prisma.habitacion.findUnique({ where: { id: habitacionId } });

    return prisma.$transaction(
      async (tx) => {
        const tipoMovStockId = await resolverTipoMovimientoMinibar(tx);
        // Sprint 3 — decisión de negocio: el depósito no se recibe del
        // caller ni se pide en el formulario, se resuelve acá siempre al
        // mismo depósito fijo (ver resolverDepositoMinibar arriba).
        const depositoId = await resolverDepositoMinibar(tx);
        // No reimplementa el descuento de stock: reusa el mismo servicio
        // que ya usa el resto del sistema para una Salida (HU-13), dentro
        // de esta misma transacción — si no hay stock suficiente, todo se
        // revierte y el consumo tampoco queda registrado (no tiene sentido
        // cobrar un minibar que no se pudo descontar del stock real). Se
        // crea PRIMERO para poder guardar su id en el consumo
        // (movimientoStockId): un mismo artículo puede estar habilitado en
        // más de un depósito a la vez (encontrado auditando a mano), así que
        // sin esta referencia no hay forma de saber con certeza de qué
        // depósito salió un consumo puntual sin parsear el texto libre de
        // `detalle`.
        const movimiento = await movimientoSalidaServicio.registrarSalidaEnTransaccion(tx, {
          depositoId,
          tipoMovStockId,
          detalle: `Consumo Minibar - Habitación ${habitacion?.numero ?? habitacionId} - Reserva ${reservaId}`,
          usuario: registradoPor,
          items: [{ articuloId, cantidad }],
        });
        const consumo = await tx.consumoServicioAdicional.create({
          data: {
            reservaId,
            habitacionId,
            tipoServicio,
            articuloId,
            cantidad,
            monto,
            registradoPor,
            movimientoStockId: movimiento.id,
          },
          include: { articulo: true, habitacion: true },
        });
        return formatearConsumo(consumo);
      },
      { timeout: 15000, maxWait: 10000 }
    );
  }

  if (data?.articuloId || data?.cantidad) {
    throw new ErrorDeNegocio("articuloId y cantidad solo aplican cuando tipoServicio es 'Minibar'.");
  }

  const consumo = await prisma.consumoServicioAdicional.create({
    data: { reservaId, habitacionId, tipoServicio, monto, registradoPor },
    include: { articulo: true, habitacion: true },
  });
  return formatearConsumo(consumo);
}

// --------------------------------------------------------------
// HU-63 — consulta de cargos acumulados (y contrato de salida hacia
// Integrante 4, HU-48/HU-87 — ver Sprint3_..._CheckIn...md sección 4)
// --------------------------------------------------------------

async function listarPorReserva(reservaId, { tipoServicio } = {}) {
  const id = enteroPositivo(reservaId, "reservaId");
  if (tipoServicio) normalizarTipoServicio(tipoServicio);

  const consumos = await prisma.consumoServicioAdicional.findMany({
    where: { reservaId: id, ...(tipoServicio ? { tipoServicio } : {}) },
    include: { articulo: true, habitacion: true },
    orderBy: { fechaHora: "desc" },
  });
  return consumos.map(formatearConsumo);
}

async function resumenPorReserva(reservaId) {
  const items = await listarPorReserva(reservaId);
  const totalPorTipo = TIPOS_SERVICIO.map((tipo) => {
    const delTipo = items.filter((i) => i.tipoServicio === tipo);
    return {
      tipoServicio: tipo,
      cantidad: delTipo.length,
      total: delTipo.reduce((acc, i) => acc + i.monto, 0),
    };
  });
  return {
    items,
    totalPorTipo,
    totalGeneral: items.reduce((acc, i) => acc + i.monto, 0),
  };
}

module.exports = {
  registrarConsumo,
  listarPorReserva,
  resumenPorReserva,
  ErrorDeNegocio,
};
