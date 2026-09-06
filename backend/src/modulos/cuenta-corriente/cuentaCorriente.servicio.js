// src/modulos/cuenta-corriente/cuentaCorriente.servicio.js
//
// HU-80: de solo lectura — agrega comprobantes (Factura/ND/NC, modulo de
// Comprobantes) y pagos (OrdenPago, modulo de Pagos) en una sola linea
// de tiempo por proveedor, con saldo acumulado fila por fila. No crea
// ni edita nada, asi que no necesita transacciones ni locks.

const prisma = require("../../lib/prisma");
const { calcularSaldosComprobantes, pagoVigente, sumarImportesMedios, resumenSaldosPorProveedor, redondear } = require("../../lib/comprobantes");
const { TIPOS_MOVIMIENTO } = require("./cuentaCorriente.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Limite de fecha en hora Argentina (UTC-3), mismo criterio que
// pagos.servicio.js — las fechas de comprobantes/ordenes son timestamps
// reales, no "solo dia", asi que medianoche UTC corre el limite.
function limiteFecha(fechaISO, sumarUnDia) {
  const limite = new Date(`${fechaISO}T00:00:00-03:00`);
  if (Number.isNaN(limite.getTime())) return null;
  if (sumarUnDia) limite.setUTCDate(limite.getUTCDate() + 1);
  return limite;
}

async function cuentaCorrienteDeProveedor(proveedorId, { tipo, desde, hasta } = {}) {
  const id = Number(proveedorId);
  if (!Number.isInteger(id)) throw new ErrorDeNegocio("proveedorId debe ser un número entero.");
  if (tipo && !TIPOS_MOVIMIENTO.includes(tipo)) {
    throw new ErrorDeNegocio(`tipo inválido. Valores permitidos: ${TIPOS_MOVIMIENTO.join(", ")}`);
  }
  let fechaDesde = null;
  let fechaHasta = null;
  if (desde) {
    fechaDesde = limiteFecha(desde, false);
    if (!fechaDesde) throw new ErrorDeNegocio("desde no es una fecha válida.");
  }
  if (hasta) {
    fechaHasta = limiteFecha(hasta, true);
    if (!fechaHasta) throw new ErrorDeNegocio("hasta no es una fecha válida.");
  }

  const proveedor = await prisma.proveedor.findUnique({ where: { id } });
  if (!proveedor) throw new ErrorDeNegocio("El proveedor no existe.", 404);

  // Secuencial (no Promise.all): el pool de conexiones a la base remota
  // es chico (limit=3) — ver el mismo criterio en listarOrdenesPago de
  // pagos.servicio.js, que tuvo que dejar de pedir en paralelo por esto.
  const comprobantes = await prisma.comprobanteProveedor.findMany({ where: { proveedorId: id, anulado: false } });
  const ordenes = await prisma.ordenPago.findMany({ where: { proveedorId: id }, include: { medios: true } });

  // El saldo total es la suma de los saldos ya calculados de las
  // facturas no anuladas — misma cuenta que usa Pagos, no una nueva.
  const saldosFacturas = await calcularSaldosComprobantes(comprobantes);
  const saldoTotal = redondear([...saldosFacturas.values()].reduce((acc, s) => acc + s, 0));

  // Debe = suma lo que el proveedor cobra (Factura, Nota de Débito).
  // Haber = suma lo que reduce la deuda (Nota de Crédito, Pago vigente).
  const movimientosComprobantes = comprobantes.map((c) => ({
    id: c.id,
    fecha: c.fecha,
    tipo: c.tipo,
    numero: c.numero,
    debe: c.tipo === "Nota de Crédito" ? 0 : Number(c.importeTotal),
    haber: c.tipo === "Nota de Crédito" ? Number(c.importeTotal) : 0,
  }));
  // Se incluyen TODAS las ordenes, no solo las vigentes — una orden
  // anulada o rechazada no debe afectar el saldo (haber=0), pero
  // ocultarla del todo dejaria a Cuenta Corriente sin rastro de un pago
  // que se intento y no se concreto, aunque Pagos si lo muestra (con
  // badge). "estado" viaja en la fila para que el frontend la marque.
  const movimientosPagos = ordenes.map((o) => ({
    id: o.id,
    fecha: o.fecha,
    tipo: "Pago",
    numero: o.numero,
    estado: o.anulado ? "Anulada" : o.estado,
    debe: 0,
    haber: pagoVigente(o) ? sumarImportesMedios(o.medios) : 0,
    // HU-86: el estado de cada cheque de la orden tiene que ser visible
    // acá también, no solo en el detalle de la orden de pago.
    cheques: o.medios
      .filter((m) => m.medioPago === "Cheque")
      .map((m) => ({ banco: m.banco, numeroCheque: m.numeroCheque, estadoCheque: m.estadoCheque })),
  }));

  // El saldo acumulado se calcula sobre TODO el historial en orden
  // cronologico, no sobre el subconjunto filtrado — si no, filtrar por
  // tipo o por fecha mostraria un saldo por fila que no coincide con la
  // realidad de la cuenta. Se acota en 0 fila a fila: es una
  // aproximacion del piso por-factura que usa saldoTotal (ver arriba) —
  // coinciden salvo en el caso raro de una ND/NC que se pasa del saldo
  // de su factura relacionada, mientras el proveedor tiene otra factura
  // todavia impaga (ahi saldoTotal, no el acumulado, es el numero
  // correcto: HU-80 no tiene forma de reconstruir a que factura
  // puntual afecto cada ND/NC/pago sin re-implementar todo
  // calcularSaldosComprobantes fila por fila).
  let acumulado = 0;
  const movimientos = [...movimientosComprobantes, ...movimientosPagos]
    // Desempate estable cuando dos movimientos comparten la misma fecha
    // exacta: lo que suma (debe) va antes que lo que resta (haber), asi
    // el orden no queda librado al orden de retorno de la base.
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || (a.debe > 0 ? -1 : 1) - (b.debe > 0 ? -1 : 1))
    .map((m) => {
      acumulado = Math.max(0, redondear(acumulado + m.debe - m.haber));
      return { ...m, debe: redondear(m.debe), haber: redondear(m.haber), saldoAcumulado: acumulado };
    })
    .filter((m) => {
      if (tipo && m.tipo !== tipo) return false;
      const fecha = new Date(m.fecha);
      if (fechaDesde && fecha < fechaDesde) return false;
      if (fechaHasta && fecha >= fechaHasta) return false;
      return true;
    });

  return {
    proveedor: { id: proveedor.id, razonSocial: proveedor.razonSocial },
    saldoTotal,
    movimientos,
  };
}

// HU-80: resumen para la pantalla general — saldo por proveedor + KPIs
// (saldo total adeudado, mayor acreedor, comprobantes impagos).
async function resumenCuentaCorriente() {
  const { porProveedor, comprobantesImpagos } = await resumenSaldosPorProveedor();

  const proveedorIds = [...porProveedor.keys()];
  const proveedores = proveedorIds.length
    ? await prisma.proveedor.findMany({ where: { id: { in: proveedorIds } } })
    : [];

  const lista = proveedores
    .map((p) => ({ proveedorId: p.id, razonSocial: p.razonSocial, saldo: porProveedor.get(p.id) ?? 0 }))
    .sort((a, b) => b.saldo - a.saldo);

  return {
    saldoTotal: redondear(lista.reduce((acc, p) => acc + p.saldo, 0)),
    mayorAcreedor: lista[0] ?? null,
    comprobantesImpagos,
    proveedores: lista,
  };
}

module.exports = { ErrorDeNegocio, cuentaCorrienteDeProveedor, resumenCuentaCorriente };
