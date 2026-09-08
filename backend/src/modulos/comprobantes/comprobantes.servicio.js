const { Prisma } = require('@prisma/client');
const prisma = require('../../lib/prisma');
const { calcularSaldoComprobante, calcularSaldosComprobantes, calcularPagosAplicados, pagoVigente, calcularFechaVencimiento } = require('../../lib/comprobantes');
const { TIPOS_COMPROBANTE, ESTADOS_MATCHING, ESTADOS_COMPROBANTE } = require('./comprobantes.constantes');
const ordenesCompraServicio = require('../ordenes-compra/ordenesCompra.servicio');

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
  const { proveedorId, tipo, numero, fecha, importeTotal, ordenCompraId, comprobanteRelacionadoId } = data;

  // Validaciones básicas
  if (!proveedorId) throw new ErrorDeNegocio('proveedorId es obligatorio.');
  if (!TIPOS_COMPROBANTE.includes(tipo)) {
    throw new ErrorDeNegocio(`tipo inválido. Permitidos: ${TIPOS_COMPROBANTE.join(', ')}`);
  }
  if (!numero || !numero.trim()) throw new ErrorDeNegocio('El número de comprobante es obligatorio.');
  if (!fecha) throw new ErrorDeNegocio('La fecha es obligatoria.');
  if (typeof importeTotal !== 'number' || importeTotal <= 0) {
    throw new ErrorDeNegocio('importeTotal debe ser un número mayor a 0.');
  }
  // Una ND/NC solo se crea a través de este endpoint genérico si viene
  // vinculada a su factura original — el camino sin vínculo (nota
  // "suelta") se sacó del modal genérico y solo queda disponible desde
  // crearNota/NotaModal. Este chequeo es la barrera del lado del
  // servidor: sin esto, alguien podría colarse por API directa aunque el
  // frontend ya no ofrezca la opción.
  if (tipo !== 'Factura' && !comprobanteRelacionadoId) {
    throw new ErrorDeNegocio(
      'Las Notas de Débito/Crédito deben crearse vinculadas a una factura, usá la opción correspondiente.'
    );
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

  // Si es ND/NC (ya sabemos que comprobanteRelacionadoId vino, por el
  // chequeo de arriba), el original tiene que existir, ser una Factura
  // del mismo proveedor y no estar anulado — mismas condiciones que
  // exige crearNota, el camino normal para esto.
  if (comprobanteRelacionadoId) {
    const original = await prisma.comprobanteProveedor.findUnique({ where: { id: Number(comprobanteRelacionadoId) } });
    if (!original) throw new ErrorDeNegocio('El comprobante original no existe.', 404);
    if (original.proveedorId !== proveedorId) {
      throw new ErrorDeNegocio('El comprobante original no pertenece a este proveedor.');
    }
    if (original.tipo !== 'Factura') {
      throw new ErrorDeNegocio('Solo se pueden crear notas sobre comprobantes de tipo Factura.');
    }
    if (original.anulado) throw new ErrorDeNegocio('No se puede ajustar un comprobante anulado.');
  }

  // Vencimiento (solo Factura: una ND/NC no tiene saldo propio, ver
  // calcularEstadoComprobante) — se calcula una sola vez acá a partir de
  // la condición comercial pactada con el proveedor, no en cada lectura.
  const fechaVencimiento =
    tipo === 'Factura' ? calcularFechaVencimiento(proveedor.condicionComercial, fecha) : null;

  // Crear comprobante
  let comprobante;
  try {
    comprobante = await prisma.comprobanteProveedor.create({
      data: {
        proveedorId,
        tipo,
        numero: numero.trim(),
        fecha: new Date(fecha),
        importeTotal,
        ordenCompraId: ordenCompraId || null,
        comprobanteRelacionadoId: comprobanteRelacionadoId ? Number(comprobanteRelacionadoId) : null,
        fechaVencimiento
      },
      include: {
        proveedor: true,
        ordenCompra: { include: { detalle: true } }
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ErrorDeNegocio(
        `Ya existe un comprobante de tipo "${tipo}" con número "${numero}" para este proveedor.`,
        409
      );
    }
    throw err;
  }

  // HU-72: devolver el matching (y el saldo/estado) ya calculados en la
  // misma respuesta del alta — antes solo se veían al releer el
  // comprobante, así que el usuario no se enteraba de una diferencia
  // hasta entrar de nuevo a la ficha.
  //
  // El comprobante recién se creó: nadie pudo haberle aplicado un pago
  // ni una ND/NC todavía (su id ni existía), así que el saldo es
  // trivialmente el importeTotal — no hace falta pagarle 2 consultas más
  // a calcularSaldoComprobante para algo que ya se sabe.
  const saldo = comprobante.tipo === 'Factura' ? Number(comprobante.importeTotal) : null;
  let matching = null;
  try {
    if (comprobante.tipo === 'Factura' && comprobante.ordenCompraId) {
      matching = await calcularMatching(comprobante);
    }
  } catch (err) {
    // El comprobante ya está commiteado en la base — un fallo acá (ej. un
    // timeout transitorio contra la base remota) no puede convertirse en
    // un 500 "no se pudo crear", porque sí se creó. Se devuelve sin el
    // matching en vez de hacer que un reintento del cliente choque contra
    // el 409 de duplicado por lo que para él es el primer intento.
    console.error('Comprobante creado pero falló el cálculo de matching para la respuesta:', err);
  }

  return {
    ...comprobante,
    saldo,
    matching,
    estado: calcularEstadoComprobante(comprobante, saldo, false),
  };
}

// --------------------------------------------------------------
// Estado del comprobante (HU-74): Pendiente / Pagado Parcial / Pagado /
// Anulado. No es una columna — se deriva del saldo y de si hubo algún
// pago real aplicado. Solo aplica a Facturas: una ND/NC no tiene saldo
// ni estado de cobro propio (se ve reflejada en el saldo de la factura
// que ajusta).
//
// No alcanza con comparar saldo contra importeTotal: una Nota de Débito
// o de Crédito mueve el saldo independientemente de si se pagó algo
// (crearNota no exige ni bloquea según haya pagos previos). Por eso
// recibe `tienePago` aparte (calculado con calcularPagosAplicados, que
// solo mira OrdenPagoDetalle — nunca ND/NC) en vez de inferirlo del
// saldo: sin este dato, una factura con un pago real y una ND grande
// después volvía a mostrarse "Pendiente", y una factura nunca pagada
// pero con una NC podía mostrarse "Pagado Parcial".
function calcularEstadoComprobante(comprobante, saldo, tienePago) {
  if (comprobante.anulado) return ESTADOS_COMPROBANTE.ANULADO;
  if (comprobante.tipo !== 'Factura') return null;
  if (saldo <= 0) return ESTADOS_COMPROBANTE.PAGADO;
  return tienePago ? ESTADOS_COMPROBANTE.PAGADO_PARCIAL : ESTADOS_COMPROBANTE.PENDIENTE;
}

// --------------------------------------------------------------
// Listado de comprobantes (con filtros y saldo)
// --------------------------------------------------------------
async function listarComprobantes({ proveedorId, estado, desde, hasta, soloSaldo = true, ordenarPor = 'fecha' } = {}) {
  if (!['fecha', 'antiguedad'].includes(ordenarPor)) {
    throw new ErrorDeNegocio("ordenarPor inválido. Valores permitidos: 'fecha', 'antiguedad'.");
  }
  if (estado && !Object.values(ESTADOS_COMPROBANTE).includes(estado)) {
    throw new ErrorDeNegocio(`estado inválido. Valores permitidos: ${Object.values(ESTADOS_COMPROBANTE).join(', ')}.`);
  }
  const where = {};

  if (proveedorId) where.proveedorId = Number(proveedorId);
  // El filtro por estado usa los 4 estados reales del comprobante
  // (HU-74). "Anulado" se resuelve directo en la consulta; los otros tres
  // dependen del saldo, que recién se conoce después de calcularlo más
  // abajo, así que esos se filtran una vez armado el resultado.
  if (estado === ESTADOS_COMPROBANTE.ANULADO) where.anulado = true;
  else if (estado) where.anulado = false;
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
    // "antigüedad del saldo" (HU-74): el más viejo primero, para ver
    // arriba lo que lleva más tiempo pendiente de cobro. Por fecha (el
    // default) es al revés, lo más reciente primero.
    orderBy: { fecha: ordenarPor === 'antiguedad' ? 'asc' : 'desc' }
  });

  // Calcular saldos y pagos aplicados para todos (funciones en lote, sin
  // consultas por-comprobante). "estado" necesita las dos cosas: el saldo
  // solo no distingue "nunca se pagó, pero tiene una ND/NC" de "se pagó
  // algo de verdad" (ver calcularEstadoComprobante).
  const [saldosMap, pagosMap] = await Promise.all([
    calcularSaldosComprobantes(comprobantes),
    calcularPagosAplicados(comprobantes),
  ]);

  // Enriquecer cada comprobante con su saldo y flag de matching. c.ordenCompra
  // ya viene con .detalle desde el include de arriba, así que calcularMatching
  // lo reusa en vez de volver a pedirlo por comprobante (sin esto sería un
  // N+1: una consulta a ordenes_compra por cada factura con OC).
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
      estado: calcularEstadoComprobante(c, saldo, (pagosMap.get(c.id) ?? 0) > 0),
    };
  }));

  // Filtro por estado (Pendiente/Pagado Parcial/Pagado): "Anulado" ya se
  // resolvió en la consulta de arriba, así que acá solo falta cubrir los
  // tres que dependen del saldo.
  let filtrados = resultado;
  if (estado && estado !== ESTADOS_COMPROBANTE.ANULADO) {
    filtrados = filtrados.filter((c) => c.estado === estado);
  }

  // "Solo con saldo pendiente" (default true) solo se aplica si no se pidió
  // un estado puntual: elegir "Pagado" o "Anulado" ya implica saldo 0, así
  // que forzar soloSaldo en ese caso dejaría el listado vacío por error.
  // Un comprobante anulado tampoco cuenta como pendiente aunque conserve
  // su importeTotal — anular exige que no tenga pagos ni notas aplicadas
  // (HU-75), así que su saldo "crudo" sigue siendo el total completo si
  // no se lo excluye acá.
  if (soloSaldo && !estado) {
    filtrados = filtrados.filter((c) => c.saldo > 0 && !c.anulado);
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

  // pagosAplicados ya viene incluido arriba (con su ordenPago): alcanza
  // para saber si hubo algún pago vigente, sin otra consulta.
  const tienePago = comprobante.pagosAplicados.some((p) => pagoVigente(p.ordenPago));

  return {
    ...comprobante,
    saldo,
    matching,
    estado: calcularEstadoComprobante(comprobante, saldo, tienePago),
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

  // Todo en una transacción: una Nota de Crédito lo bastante grande deja
  // el saldo de la factura original en 0 sin que haya habido ningún pago
  // (calcularEstadoComprobante la muestra "Pagado" igual, por saldo) — si
  // esa factura está vinculada a una OC, hay que revisar el cierre
  // automático acá también, no solo al confirmar un pago (ver
  // verificarCierrePorPagos en ordenesCompra.servicio.js).
  const nota = await prisma.$transaction(async (tx) => {
    const creada = await tx.comprobanteProveedor.create({
      data: {
        proveedorId: original.proveedorId,
        tipo,
        numero: numero.trim(),
        fecha: new Date(),
        importeTotal,
        comprobanteRelacionadoId: original.id,
        motivo: motivo.trim(),
      },
      include: {
        proveedor: true,
        comprobanteRelacionado: true
      }
    });

    if (tipo === 'Nota de Crédito' && original.ordenCompraId) {
      await ordenesCompraServicio.verificarCierrePorPagos(tx, original.ordenCompraId);
    }

    return creada;
  }, { timeout: 15000, maxWait: 10000 });

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

  // Si el caller ya trajo comprobante.ordenCompra con su detalle (como
  // hacen listarComprobantes y obtenerComprobante), se reusa tal cual y
  // no se pega una consulta más — evita el N+1 de pedir la OC de nuevo,
  // artículo por comprobante, al listar. Si no vino incluida (ej. desde
  // pagos.servicio.js, que solo necesita el matching de unos pocos
  // comprobantes puntuales), se busca acá como antes.
  const orden =
    comprobante.ordenCompra ??
    (await prisma.ordenCompra.findUnique({
      where: { id: comprobante.ordenCompraId },
      include: { detalle: true },
    }));
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
  calcularEstadoComprobante,
  ErrorDeNegocio
};