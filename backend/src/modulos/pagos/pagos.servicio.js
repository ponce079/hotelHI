// src/modulos/pagos/pagos.servicio.js
//
// Lógica de negocio pura (HU-76, HU-77: generar una orden de pago con
// varios comprobantes y varios medios de pago combinados). El resto de
// Pagos (HU-78 listado, HU-79 anular, HU-86 estado de cheque) se agrega
// en una rama aparte.

const crypto = require("crypto");
const prisma = require("../../lib/prisma");
const { calcularSaldoComprobante, listarFacturasConSaldo, pagoVigente } = require("../../lib/comprobantes");
const { MEDIOS_PAGO, BANCOS } = require("./pagos.constantes");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// Comparar en centavos (enteros) en vez de floats, para que 100.10 +
// 50.20 no falle un === por un error de redondeo binario.
function centavos(n) {
  return Math.round(Number(n) * 100);
}

// HU-76, paso 1: proveedores que tienen al menos una factura con saldo
// pendiente — son los unicos que tiene sentido ofrecer en el selector.
async function proveedoresConSaldo() {
  const filas = await prisma.comprobanteProveedor.findMany({
    where: { tipo: "Factura", anulado: false },
    distinct: ["proveedorId"],
    select: { proveedorId: true },
  });

  const resultado = [];
  for (const { proveedorId } of filas) {
    const pendientes = await listarFacturasConSaldo(proveedorId);
    if (pendientes.length > 0) {
      const proveedor = await prisma.proveedor.findUnique({ where: { id: proveedorId } });
      if (proveedor) resultado.push(proveedor);
    }
  }
  return resultado;
}

// HU-76, paso 1: facturas con saldo pendiente de un proveedor puntual.
async function comprobantesPendientes(proveedorId) {
  if (!proveedorId) throw new ErrorDeNegocio("proveedorId es obligatorio.");
  return listarFacturasConSaldo(Number(proveedorId));
}

// HU-76 + HU-77: crear la orden de pago con la distribución de importes
// por comprobante y los medios de pago combinados, todo en una sola
// transacción.
async function crearOrdenPago({ proveedorId, aplicaciones, medios }) {
  if (!proveedorId) throw new ErrorDeNegocio("proveedorId es obligatorio.");
  if (!Array.isArray(aplicaciones) || aplicaciones.length === 0) {
    throw new ErrorDeNegocio("Debe incluir al menos un comprobante en 'aplicaciones'.");
  }
  if (!Array.isArray(medios) || medios.length === 0) {
    throw new ErrorDeNegocio("Debe incluir al menos un medio de pago en 'medios'.");
  }

  const comprobanteIds = aplicaciones.map((a) => Number(a.comprobanteId));
  if (new Set(comprobanteIds).size !== comprobanteIds.length) {
    throw new ErrorDeNegocio("No se puede aplicar el mismo comprobante dos veces en la misma orden.");
  }

  const comprobantes = await prisma.comprobanteProveedor.findMany({
    where: { id: { in: comprobanteIds } },
  });
  if (comprobantes.length !== comprobanteIds.length) {
    throw new ErrorDeNegocio("Alguno de los comprobantes indicados no existe.");
  }
  for (const c of comprobantes) {
    if (c.anulado) throw new ErrorDeNegocio(`El comprobante ${c.numero} está anulado.`);
    if (c.proveedorId !== Number(proveedorId)) {
      throw new ErrorDeNegocio(`El comprobante ${c.numero} no pertenece a este proveedor.`);
    }
  }

  // Validar cada importe aplicado contra el saldo *ahora mismo*, nunca
  // contra un valor que haya traido el cliente.
  let totalAplicado = 0;
  for (const a of aplicaciones) {
    const comprobante = comprobantes.find((c) => c.id === Number(a.comprobanteId));
    const saldo = await calcularSaldoComprobante(comprobante);
    const importe = Number(a.importeAplicado);
    if (!(importe > 0)) {
      throw new ErrorDeNegocio(`El importe aplicado al comprobante ${comprobante.numero} debe ser mayor a cero.`);
    }
    if (centavos(importe) > centavos(saldo)) {
      throw new ErrorDeNegocio(
        `El importe aplicado al comprobante ${comprobante.numero} (${importe}) supera su saldo pendiente (${saldo}).`
      );
    }
    totalAplicado += importe;
  }

  // Validar medios: tipo valido, cheque completo, cheque no repetido
  // (ni dentro del mismo request ni contra pagos vigentes existentes en
  // todo el sistema — HU-77).
  let totalMedios = 0;
  const chequesEnRequest = new Set();
  for (const m of medios) {
    if (!MEDIOS_PAGO.includes(m.tipo)) {
      throw new ErrorDeNegocio(`medioPago inválido. Valores permitidos: ${MEDIOS_PAGO.join(", ")}`);
    }
    const importe = Number(m.importe);
    if (!(importe > 0)) {
      throw new ErrorDeNegocio("Cada medio de pago necesita un importe mayor a cero.");
    }
    totalMedios += importe;

    if (m.tipo === "Cheque") {
      if (!m.numeroCheque || !m.banco || !m.fecha) {
        throw new ErrorDeNegocio("Un medio de pago Cheque necesita numeroCheque, banco y fecha.");
      }
      if (!BANCOS.includes(m.banco)) {
        throw new ErrorDeNegocio(`banco inválido. Valores permitidos: ${BANCOS.join(", ")}`);
      }
      const clave = `${m.banco}|${String(m.numeroCheque).trim()}`;
      if (chequesEnRequest.has(clave)) {
        throw new ErrorDeNegocio(`El cheque N° ${m.numeroCheque} de ${m.banco} está repetido en la misma orden.`);
      }
      chequesEnRequest.add(clave);

      const existente = await prisma.ordenPagoMedio.findFirst({
        where: { banco: m.banco, numeroCheque: String(m.numeroCheque).trim() },
        include: { ordenPago: true },
      });
      if (existente && pagoVigente(existente.ordenPago)) {
        throw new ErrorDeNegocio(`Ya existe un cheque N° ${m.numeroCheque} de ${m.banco} registrado en el sistema.`);
      }
    }
  }

  if (centavos(totalMedios) !== centavos(totalAplicado)) {
    throw new ErrorDeNegocio(
      `El total distribuido en medios de pago (${totalMedios}) debe coincidir con el total aplicado a comprobantes (${totalAplicado}).`
    );
  }

  return prisma.$transaction(
    async (tx) => {
      // numero definitivo (OP-00007) se arma despues del insert, con el
      // id — igual criterio que el codigo de Articulo. El placeholder es
      // un uuid random, no un texto fijo, para que dos altas
      // concurrentes nunca puedan chocar contra el mismo valor temporal.
      const creada = await tx.ordenPago.create({
        data: {
          numero: `OP-PENDIENTE-${crypto.randomUUID()}`,
          proveedorId: Number(proveedorId),
          estado: "Pagado",
          detalle: {
            create: aplicaciones.map((a) => ({
              comprobanteId: Number(a.comprobanteId),
              importeAplicado: Number(a.importeAplicado),
            })),
          },
          medios: {
            create: medios.map((m) => ({
              medioPago: m.tipo,
              importe: Number(m.importe),
              numeroCheque: m.tipo === "Cheque" ? String(m.numeroCheque).trim() : null,
              banco: m.tipo === "Cheque" ? m.banco : null,
              fechaCheque: m.tipo === "Cheque" ? new Date(m.fecha) : null,
              estadoCheque: m.tipo === "Cheque" ? "Emitido" : null,
            })),
          },
        },
      });

      return tx.ordenPago.update({
        where: { id: creada.id },
        data: { numero: `OP-${String(creada.id).padStart(5, "0")}` },
        include: {
          proveedor: true,
          detalle: { include: { comprobante: true } },
          medios: true,
        },
      });
    },
    { timeout: 30000, maxWait: 15000 }
  );
}

async function obtenerOrdenPago(id) {
  return prisma.ordenPago.findUnique({
    where: { id },
    include: {
      proveedor: true,
      detalle: { include: { comprobante: true } },
      medios: true,
    },
  });
}

module.exports = {
  ErrorDeNegocio,
  proveedoresConSaldo,
  comprobantesPendientes,
  crearOrdenPago,
  obtenerOrdenPago,
};
