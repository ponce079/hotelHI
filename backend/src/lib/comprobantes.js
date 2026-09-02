// src/lib/comprobantes.js
//
// Calculo de saldo de comprobantes de proveedor — compartido entre
// Pagos, Cuenta Corriente y el futuro modulo de Comprobantes. El saldo
// nunca se persiste como columna: se calcula siempre a partir del
// importeTotal + los ajustes (ND/NC) que lo referencian - los pagos
// vigentes aplicados, para que nunca pueda desincronizarse de la
// realidad. Si tocas esta cuenta, avisale al resto del equipo: la usan
// tres modulos distintos (Sprint 2, HU-72 a 80).

const prisma = require("./prisma");

function esFactura(comprobante) {
  return comprobante.tipo === "Factura";
}

// Una orden de pago deja de "contar" contra el saldo si se anulo o si
// uno de sus cheques fue rechazado (HU-79, HU-86) — en ambos casos el
// comprobante recupera el saldo automaticamente sin tocar ninguna fila
// de ComprobanteProveedor, porque el calculo simplemente deja de sumarla.
function pagoVigente(ordenPago) {
  return !ordenPago.anulado && ordenPago.estado !== "Rechazada";
}

// Acepta el id o el comprobante ya cargado (para listados que ya lo
// tienen a mano y no quieren pagar una consulta extra por fila).
async function calcularSaldoComprobante(comprobanteOId) {
  const comprobante =
    typeof comprobanteOId === "object"
      ? comprobanteOId
      : await prisma.comprobanteProveedor.findUnique({ where: { id: comprobanteOId } });
  if (!comprobante) return null;
  // Una ND/NC no tiene saldo propio: ajusta el saldo del comprobante
  // original al que apunta (comprobanteRelacionadoId).
  if (!esFactura(comprobante)) return null;

  const [ajustes, aplicaciones] = await Promise.all([
    prisma.comprobanteProveedor.findMany({
      where: { comprobanteRelacionadoId: comprobante.id, anulado: false },
    }),
    prisma.ordenPagoDetalle.findMany({
      where: { comprobanteId: comprobante.id },
      include: { ordenPago: true },
    }),
  ]);

  const sumaND = ajustes
    .filter((a) => a.tipo === "Nota de Débito")
    .reduce((acc, a) => acc + Number(a.importeTotal), 0);
  const sumaNC = ajustes
    .filter((a) => a.tipo === "Nota de Crédito")
    .reduce((acc, a) => acc + Number(a.importeTotal), 0);
  const sumaPagos = aplicaciones
    .filter((a) => pagoVigente(a.ordenPago))
    .reduce((acc, a) => acc + Number(a.importeAplicado), 0);

  const saldo = Number(comprobante.importeTotal) + sumaND - sumaNC - sumaPagos;
  // Mismo criterio que una Nota de Credito que supera el saldo: nunca negativo.
  return Math.max(0, Math.round(saldo * 100) / 100);
}

// Facturas de un proveedor con saldo pendiente > 0 (no ND/NC, no
// anuladas). Es lo que necesita el paso 1 del wizard de Pagos y el
// listado de Comprobantes con el filtro "solo con saldo pendiente".
async function listarFacturasConSaldo(proveedorId) {
  const facturas = await prisma.comprobanteProveedor.findMany({
    where: { proveedorId: Number(proveedorId), tipo: "Factura", anulado: false },
    orderBy: { fecha: "asc" },
  });
  const conSaldo = [];
  for (const f of facturas) {
    const saldo = await calcularSaldoComprobante(f);
    if (saldo > 0) conSaldo.push({ ...f, saldo });
  }
  return conSaldo;
}

module.exports = { calcularSaldoComprobante, listarFacturasConSaldo, pagoVigente, esFactura };
