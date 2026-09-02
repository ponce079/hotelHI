// src/lib/comprobantes.js
//
// Calculo de saldo de comprobantes de proveedor — compartido entre
// Pagos, Cuenta Corriente y el futuro modulo de Comprobantes. El saldo
// nunca se persiste como columna: se calcula siempre a partir del
// importeTotal + los ajustes (ND/NC) que lo referencian - los pagos
// vigentes aplicados, para que nunca pueda desincronizarse de la
// realidad. Si tocas esta cuenta, avisale al resto del equipo: la usan
// tres modulos distintos (Sprint 2, HU-72 a 80).
//
// Todas las funciones aceptan un segundo parametro `db` opcional
// (default: el cliente global) para poder llamarlas con un cliente de
// transaccion (`tx`) cuando alguien necesita releer el saldo con un
// lock tomado — ver crearOrdenPago en pagos.servicio.js.

const prisma = require("./prisma");

function redondear(n) {
  return Math.round(n * 100) / 100;
}

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

// Version en lote: calcula el saldo de varias facturas con 2 consultas
// en total (no 2 por factura). Devuelve un Map(comprobanteId -> saldo).
// Las que no son factura (ND/NC) quedan afuera del resultado — no
// tienen saldo propio.
async function calcularSaldosComprobantes(comprobantes, db = prisma) {
  const facturas = comprobantes.filter(esFactura);
  const saldos = new Map();
  if (facturas.length === 0) return saldos;

  const ids = facturas.map((f) => f.id);
  const [ajustes, aplicaciones] = await Promise.all([
    db.comprobanteProveedor.findMany({
      where: { comprobanteRelacionadoId: { in: ids }, anulado: false },
    }),
    db.ordenPagoDetalle.findMany({
      where: { comprobanteId: { in: ids } },
      include: { ordenPago: true },
    }),
  ]);

  for (const f of facturas) {
    const sumaND = ajustes
      .filter((a) => a.comprobanteRelacionadoId === f.id && a.tipo === "Nota de Débito")
      .reduce((acc, a) => acc + Number(a.importeTotal), 0);
    const sumaNC = ajustes
      .filter((a) => a.comprobanteRelacionadoId === f.id && a.tipo === "Nota de Crédito")
      .reduce((acc, a) => acc + Number(a.importeTotal), 0);
    const sumaPagos = aplicaciones
      .filter((a) => a.comprobanteId === f.id && pagoVigente(a.ordenPago))
      .reduce((acc, a) => acc + Number(a.importeAplicado), 0);

    const saldo = Number(f.importeTotal) + sumaND - sumaNC - sumaPagos;
    // Mismo criterio que una Nota de Credito que supera el saldo: nunca negativo.
    saldos.set(f.id, Math.max(0, redondear(saldo)));
  }
  return saldos;
}

// Conveniencia para un solo comprobante (pantallas de ficha/detalle que
// solo necesitan uno). Internamente usa la version en lote de arriba —
// no reimplementa el calculo.
async function calcularSaldoComprobante(comprobante, db = prisma) {
  if (!comprobante || !esFactura(comprobante)) return null;
  const saldos = await calcularSaldosComprobantes([comprobante], db);
  return saldos.get(comprobante.id) ?? null;
}

// Facturas de un proveedor con saldo pendiente > 0 (no ND/NC, no
// anuladas). Es lo que necesita el paso 1 del wizard de Pagos y el
// listado de Comprobantes con el filtro "solo con saldo pendiente".
// 2 consultas en total, sin importar cuantas facturas tenga el proveedor.
async function listarFacturasConSaldo(proveedorId, db = prisma) {
  const facturas = await db.comprobanteProveedor.findMany({
    where: { proveedorId: Number(proveedorId), tipo: "Factura", anulado: false },
    orderBy: { fecha: "asc" },
  });
  const saldos = await calcularSaldosComprobantes(facturas, db);
  return facturas.map((f) => ({ ...f, saldo: saldos.get(f.id) ?? 0 })).filter((f) => f.saldo > 0);
}

// Suma el importe de un conjunto de medios de pago de una OrdenPago
// (Decimal -> Number). Compartido entre Pagos y Cuenta Corriente — las
// dos pantallas necesitan "cuanto sumo esta orden en total".
function sumarImportesMedios(medios) {
  return medios.reduce((acc, m) => acc + Number(m.importe), 0);
}

// Saldo agregado por proveedor, en lote (2 consultas, sin importar
// cuantos proveedores/facturas haya) — compartido entre Pagos
// (proveedoresConSaldo, solo necesita los IDs) y Cuenta Corriente
// (resumenCuentaCorriente, necesita ademas el conteo de comprobantes
// impagos). select liviano: solo los campos que hacen falta para sumar.
async function resumenSaldosPorProveedor(db = prisma) {
  const facturas = await db.comprobanteProveedor.findMany({
    where: { tipo: "Factura", anulado: false },
    select: { id: true, tipo: true, proveedorId: true, importeTotal: true },
  });
  const saldos = await calcularSaldosComprobantes(facturas, db);

  const porProveedor = new Map();
  let comprobantesImpagos = 0;
  for (const f of facturas) {
    const saldo = saldos.get(f.id) ?? 0;
    if (saldo <= 0) continue;
    comprobantesImpagos += 1;
    porProveedor.set(f.proveedorId, redondear((porProveedor.get(f.proveedorId) ?? 0) + saldo));
  }
  return { porProveedor, comprobantesImpagos };
}

module.exports = {
  calcularSaldosComprobantes,
  calcularSaldoComprobante,
  listarFacturasConSaldo,
  pagoVigente,
  esFactura,
  sumarImportesMedios,
  resumenSaldosPorProveedor,
  redondear,
};
