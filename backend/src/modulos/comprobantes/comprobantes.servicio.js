const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { calcularSaldoComprobante, calcularSaldosComprobantes } = require('../../lib/comprobantes');
const { TIPOS_COMPROBANTE, ESTADOS_MATCHING } = require('./comprobantes.constantes');

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// --------------------------------------------------------------
// Creación de comprobante (Factura / ND / NC)
// --------------------------------------------------------------
async function crearComprobante(data) {
  const { proveedorId, tipo, numero, fecha, importeNeto, alicuotaIva, ordenCompraId } = data;

  // Validaciones básicas
  if (!proveedorId) throw new ErrorDeNegocio('proveedorId es obligatorio.');
  if (!TIPOS_COMPROBANTE.includes(tipo)) {
    throw new ErrorDeNegocio(`tipo inválido. Permitidos: ${TIPOS_COMPROBANTE.join(', ')}`);
  }
  if (!numero || !numero.trim()) throw new ErrorDeNegocio('El número de comprobante es obligatorio.');
  if (!fecha) throw new ErrorDeNegocio('La fecha es obligatoria.');
  if (typeof importeNeto !== 'number' || importeNeto < 0) {
    throw new ErrorDeNegocio('importeNeto debe ser un número mayor o igual a 0.');
  }
  if (typeof alicuotaIva !== 'number' || alicuotaIva < 0 || alicuotaIva > 100) {
    throw new ErrorDeNegocio('alicuotaIva debe ser un número entre 0 y 100.');
  }

  // Verificar proveedor
  const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
  if (!proveedor) throw new ErrorDeNegocio('El proveedor no existe.', 404);

  // Verificar unicidad (proveedorId, tipo, numero)
  const existente = await prisma.comprobanteProveedor.findFirst({
    where: { proveedorId, tipo, numero: numero.trim() }
  });
  if (existente) {
    throw new ErrorDeNegocio(
      `Ya existe un comprobante de tipo "${tipo}" con número "${numero}" para este proveedor.`,
      409
    );
  }

  // Si se indica ordenCompraId, verificar que exista y no esté anulada
  let ordenCompra = null;
  if (ordenCompraId) {
    ordenCompra = await prisma.ordenCompra.findUnique({
      where: { id: ordenCompraId }
    });
    if (!ordenCompra) throw new ErrorDeNegocio('La orden de compra no existe.', 404);
    if (ordenCompra.estado === 'Anulada') {
      throw new ErrorDeNegocio('La orden de compra está anulada y no puede asociarse a un comprobante.');
    }
  }

  // Calcular IVA y total
  const importeIva = Math.round(importeNeto * (alicuotaIva / 100) * 100) / 100;
  const importeTotal = importeNeto + importeIva;

  // Crear comprobante
  const comprobante = await prisma.comprobanteProveedor.create({
    data: {
      proveedorId,
      tipo,
      numero: numero.trim(),
      fecha: new Date(fecha),
      importeNeto,
      alicuotaIva,
      importeIva,
      importeTotal,
      ordenCompraId: ordenCompraId || null
    },
    include: {
      proveedor: true,
      ordenCompra: true
    }
  });

  return comprobante;
}

// --------------------------------------------------------------
// Listado de comprobantes (con filtros y saldo)
// --------------------------------------------------------------
async function listarComprobantes({ proveedorId, estado, desde, hasta, soloSaldo = true } = {}) {
  const where = {};

  if (proveedorId) where.proveedorId = Number(proveedorId);
  if (estado) {
    if (estado === 'anulado') where.anulado = true;
    else if (estado === 'activo') where.anulado = false;
  }
  if (desde || hasta) {
    where.fecha = {};
    if (desde) {
      const fechaDesde = new Date(desde);
      if (isNaN(fechaDesde)) throw new ErrorDeNegocio('desde no es una fecha válida.');
      where.fecha.gte = fechaDesde;
    }
    if (hasta) {
      const fechaHasta = new Date(hasta);
      if (isNaN(fechaHasta)) throw new ErrorDeNegocio('hasta no es una fecha válida.');
      // Sumar un día para incluir todo el día
      fechaHasta.setDate(fechaHasta.getDate() + 1);
      where.fecha.lt = fechaHasta;
    }
  }

  // Obtener comprobantes (solo facturas si soloSaldo=true, pero el filtro es por tipo Factura)
  const comprobantes = await prisma.comprobanteProveedor.findMany({
    where,
    include: {
      proveedor: true,
      ordenCompra: {
        include: {
          detalle: true
        }
      }
    },
    orderBy: { fecha: 'desc' }
  });

  // Calcular saldos para todos (usando la función en lote)
  const saldosMap = await calcularSaldosComprobantes(comprobantes);

  // Enriquecer cada comprobante con su saldo y flag de matching
  const resultado = await Promise.all(comprobantes.map(async (c) => {
    const saldo = saldosMap.get(c.id) ?? 0;
    // Calcular matching solo si es factura y tiene OC
    let matching = null;
    if (c.tipo === 'Factura' && c.ordenCompraId) {
      matching = await calcularMatching(c);
    }
    return {
      ...c,
      saldo,
      matching,
      // Para filtro "solo con saldo" lo haremos en el controlador
    };
  }));

  // Aplicar filtro soloSaldo (si es true, devolver solo los que tengan saldo > 0)
  let filtrados = resultado;
  if (soloSaldo) {
    filtrados = filtrados.filter(c => c.saldo > 0);
  }

  return filtrados;
}

// --------------------------------------------------------------
// Detalle de un comprobante (ficha completa)
// --------------------------------------------------------------
async function obtenerComprobante(id) {
  const comprobante = await prisma.comprobanteProveedor.findUnique({
    where: { id: Number(id) },
    include: {
      proveedor: true,
      ordenCompra: {
        include: {
          detalle: true,
          presupuesto: {
            include: { proveedor: true }
          }
        }
      },
      // Notas que ajustan este comprobante
      ajustes: {
        where: { anulado: false }
      },
      // Pagos aplicados
      pagosAplicados: {
        include: {
          ordenPago: true
        }
      },
      // Notas referenciadas por este comprobante (si es ND/NC)
      comprobanteRelacionado: true
    }
  });

  if (!comprobante) throw new ErrorDeNegocio('Comprobante no encontrado.', 404);

  // Calcular saldo
  const saldo = await calcularSaldoComprobante(comprobante);

  // Calcular matching si aplica
  let matching = null;
  if (comprobante.tipo === 'Factura' && comprobante.ordenCompraId) {
    matching = await calcularMatching(comprobante);
  }

  return {
    ...comprobante,
    saldo,
    matching
  };
}

// --------------------------------------------------------------
// Crear Nota de Débito / Crédito vinculada a un comprobante
// --------------------------------------------------------------
async function crearNota(comprobanteId, data) {
  const { tipo, numero, importeTotal, motivo } = data;

  // Validaciones
  if (!TIPOS_COMPROBANTE.includes(tipo) || tipo === 'Factura') {
    throw new ErrorDeNegocio('tipo debe ser "Nota de Débito" o "Nota de Crédito".');
  }
  if (!numero || !numero.trim()) throw new ErrorDeNegocio('El número de nota es obligatorio.');
  if (typeof importeTotal !== 'number' || importeTotal <= 0) {
    throw new ErrorDeNegocio('importeTotal debe ser un número mayor a 0.');
  }
  if (!motivo || !motivo.trim()) throw new ErrorDeNegocio('El motivo es obligatorio.');

  // Verificar comprobante original
  const original = await prisma.comprobanteProveedor.findUnique({
    where: { id: Number(comprobanteId) }
  });
  if (!original) throw new ErrorDeNegocio('El comprobante original no existe.', 404);
  if (original.anulado) throw new ErrorDeNegocio('No se puede ajustar un comprobante anulado.');
  if (original.tipo !== 'Factura') {
    throw new ErrorDeNegocio('Solo se pueden crear notas sobre comprobantes de tipo Factura.');
  }

  // Verificar unicidad de la nota
  const existente = await prisma.comprobanteProveedor.findFirst({
    where: { proveedorId: original.proveedorId, tipo, numero: numero.trim() }
  });
  if (existente) {
    throw new ErrorDeNegocio(
      `Ya existe una nota de tipo "${tipo}" con número "${numero}" para este proveedor.`,
      409
    );
  }

  // Para Nota de Crédito: si el importe supera el saldo actual, se acota (el cálculo de saldo lo maneja)
  // No bloqueamos, simplemente guardamos el importe tal cual; el saldo se calculará después.

  // Crear la nota, apuntando al original
  const nota = await prisma.comprobanteProveedor.create({
    data: {
      proveedorId: original.proveedorId,
      tipo,
      numero: numero.trim(),
      fecha: new Date(),
      importeNeto: 0, // No aplica para notas, solo importeTotal
      alicuotaIva: 0,
      importeIva: 0,
      importeTotal,
      comprobanteRelacionadoId: original.id,
      // Se podría guardar el motivo en algún campo; no hay campo específico, usaremos un campo extra o en la lógica no se guarda.
      // Añadimos un campo 'motivo' en el modelo? No existe. Podemos usar 'detalle' o crear una tabla de ajustes.
      // Como no se pidió persistir el motivo, lo dejamos como comentario o lo agregamos en la descripción.
    },
    include: {
      proveedor: true,
      comprobanteRelacionado: true
    }
  });

  // Nota: el motivo no se persiste, pero se puede almacenar en un campo 'detalle' si se añade.
  // Por ahora, lo ignoramos.
  return nota;
}

// --------------------------------------------------------------
// Anular comprobante
// --------------------------------------------------------------
async function anularComprobante(id, motivo) {
  if (!motivo || !motivo.trim()) {
    throw new ErrorDeNegocio('El motivo de anulación es obligatorio.');
  }

  const comprobante = await prisma.comprobanteProveedor.findUnique({
    where: { id: Number(id) },
    include: {
      pagosAplicados: true,
      ajustes: {
        where: { anulado: false } // Notas activas que referencian este comprobante
      }
    }
  });

  if (!comprobante) throw new ErrorDeNegocio('Comprobante no encontrado.', 404);
  if (comprobante.anulado) throw new ErrorDeNegocio('El comprobante ya está anulado.');

  // Bloquear si tiene pagos aplicados
  if (comprobante.pagosAplicados.length > 0) {
    throw new ErrorDeNegocio('No se puede anular un comprobante que tiene pagos aplicados.');
  }

  // Bloquear si tiene notas ND/NC aplicadas
  if (comprobante.ajustes.length > 0) {
    throw new ErrorDeNegocio('No se puede anular un comprobante que tiene notas de débito o crédito asociadas.');
  }

  // Anular (baja lógica)
  const actualizado = await prisma.comprobanteProveedor.update({
    where: { id: Number(id) },
    data: {
      anulado: true,
      motivoAnulacion: motivo.trim()
    },
    include: {
      proveedor: true,
      ordenCompra: true
    }
  });

  return actualizado;
}

// --------------------------------------------------------------
// Matching de 3 vías (cálculo)
// --------------------------------------------------------------
async function calcularMatching(comprobante) {
  // Solo para facturas con ordenCompraId
  if (!comprobante.ordenCompraId) return null;

  const orden = await prisma.ordenCompra.findUnique({
    where: { id: comprobante.ordenCompraId },
    include: {
      detalle: true
    }
  });
  if (!orden) return null;

  // 1. Total de la OC (montoTotal + flete)
  const totalOC = Number(orden.montoTotal) + (orden.flete ? Number(orden.flete) : 0);

  // 2. Valor de recepción = sum(cantidadRecibida * precioUnitario) de los detalles de la OC
  let totalRecibido = 0;
  for (const det of orden.detalle) {
    const cantRecibida = det.cantidadRecibida ? Number(det.cantidadRecibida) : 0;
    totalRecibido += cantRecibida * Number(det.precioUnitario);
  }

  // 3. Importe total del comprobante
  const totalFactura = Number(comprobante.importeTotal);

  // Comparar: permitimos una pequeña tolerancia (0.01) por redondeos
  const tolerancia = 0.01;
  const diffOCvsRecepcion = Math.abs(totalOC - totalRecibido);
  const diffRecepcionVsFactura = Math.abs(totalRecibido - totalFactura);
  const diffOCvsFactura = Math.abs(totalOC - totalFactura);

  const tieneDiferencia = diffOCvsRecepcion > tolerancia ||
                          diffRecepcionVsFactura > tolerancia ||
                          diffOCvsFactura > tolerancia;

  return {
    ordenCompraId: orden.id,
    totalOC,
    totalRecibido,
    totalFactura,
    tieneDiferencia,
    // Detalles opcionales para UI
    diffOCvsRecepcion,
    diffRecepcionVsFactura,
    diffOCvsFactura
  };
}

// --------------------------------------------------------------
// Exportar servicio
// --------------------------------------------------------------
module.exports = {
  crearComprobante,
  listarComprobantes,
  obtenerComprobante,
  crearNota,
  anularComprobante,
  calcularMatching,
  ErrorDeNegocio
};