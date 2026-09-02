// src/modulos/pagos/pagos.servicio.js
//
// Lógica de negocio pura (HU-76, HU-77: generar una orden de pago con
// varios comprobantes y varios medios de pago combinados). El resto de
// Pagos (HU-78 listado, HU-79 anular, HU-86 estado de cheque) se agrega
// en una rama aparte.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { calcularSaldosComprobantes, listarFacturasConSaldo, pagoVigente } = require("../../lib/comprobantes");
const { crearConNumeroSecuencial } = require("../../lib/numeracion");
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
// En lote: 1 consulta de facturas + 2 de calcularSaldosComprobantes +
// 1 de proveedores, sin importar cuantos proveedores/facturas haya.
async function proveedoresConSaldo() {
  const facturas = await prisma.comprobanteProveedor.findMany({
    where: { tipo: "Factura", anulado: false },
  });
  const saldos = await calcularSaldosComprobantes(facturas);
  const proveedorIds = [...new Set(facturas.filter((f) => (saldos.get(f.id) ?? 0) > 0).map((f) => f.proveedorId))];
  if (proveedorIds.length === 0) return [];
  return prisma.proveedor.findMany({ where: { id: { in: proveedorIds } }, orderBy: { razonSocial: "asc" } });
}

// HU-76, paso 1: facturas con saldo pendiente de un proveedor puntual.
async function comprobantesPendientes(proveedorId) {
  const id = Number(proveedorId);
  if (!proveedorId || !Number.isInteger(id)) {
    throw new ErrorDeNegocio("proveedorId es obligatorio y debe ser un número entero.");
  }
  return listarFacturasConSaldo(id);
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

  const idsCrudos = aplicaciones.map((a) => Number(a.comprobanteId));
  if (new Set(idsCrudos).size !== idsCrudos.length) {
    throw new ErrorDeNegocio("No se puede aplicar el mismo comprobante dos veces en la misma orden.");
  }
  // Orden fijo (ascendente) antes de lockear filas: si dos pedidos
  // concurrentes tocan un conjunto de comprobantes que se superpone,
  // lockear siempre en el mismo orden evita que se hagan deadlock entre si.
  const comprobanteIds = idsCrudos.slice().sort((a, b) => a - b);

  const comprobantes = await prisma.comprobanteProveedor.findMany({ where: { id: { in: comprobanteIds } } });
  if (comprobantes.length !== comprobanteIds.length) {
    throw new ErrorDeNegocio("Alguno de los comprobantes indicados no existe.");
  }
  for (const c of comprobantes) {
    if (c.anulado) throw new ErrorDeNegocio(`El comprobante ${c.numero} está anulado.`);
    if (c.proveedorId !== Number(proveedorId)) {
      throw new ErrorDeNegocio(`El comprobante ${c.numero} no pertenece a este proveedor.`);
    }
  }

  // Chequeo rápido ("fail fast") antes de abrir la transacción — buena
  // UX, no toma locks si el pedido ya está mal armado. No es lo que
  // protege contra una carrera: eso pasa de nuevo, con las filas
  // bloqueadas, dentro de la transacción de más abajo.
  const saldosPrevios = await calcularSaldosComprobantes(comprobantes);
  let totalAplicado = 0;
  for (const a of aplicaciones) {
    const comprobante = comprobantes.find((c) => c.id === Number(a.comprobanteId));
    const saldo = saldosPrevios.get(comprobante.id) ?? 0;
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

  // Validar medios: tipo válido, cheque completo, cheque no repetido
  // (ni dentro del mismo request ni contra pagos vigentes existentes en
  // todo el sistema — HU-77). Un solo query en lote para todos los
  // cheques del pedido, no uno por cheque.
  let totalMedios = 0;
  const chequesEnRequest = new Set();
  const clavesCheque = [];
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
      clavesCheque.push({ banco: m.banco, numeroCheque: String(m.numeroCheque).trim() });
    }
  }

  if (clavesCheque.length > 0) {
    const existentes = await prisma.ordenPagoMedio.findMany({
      where: { OR: clavesCheque.map((c) => ({ banco: c.banco, numeroCheque: c.numeroCheque })) },
      include: { ordenPago: true },
    });
    for (const { banco, numeroCheque } of clavesCheque) {
      const conflicto = existentes.find((e) => e.banco === banco && e.numeroCheque === numeroCheque && pagoVigente(e.ordenPago));
      if (conflicto) {
        throw new ErrorDeNegocio(`Ya existe un cheque N° ${numeroCheque} de ${banco} registrado en el sistema.`);
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
      // Re-chequeo protegido contra carreras (dos pagos concurrentes al
      // mismo comprobante): FOR UPDATE bloquea estas filas hasta que
      // esta transacción termine, así una segunda solicitud que pague
      // el mismo comprobante espera a que ésta commitee y recalcula el
      // saldo ya actualizado — el chequeo de arriba, al ser una lectura
      // sin lock, no alcanza para garantizar esto solo.
      await tx.$queryRaw(Prisma.sql`SELECT id FROM comprobantes_proveedor WHERE id IN (${Prisma.join(comprobanteIds)}) FOR UPDATE`);
      const comprobantesFrescos = await tx.comprobanteProveedor.findMany({ where: { id: { in: comprobanteIds } } });
      const saldosFrescos = await calcularSaldosComprobantes(comprobantesFrescos, tx);
      for (const a of aplicaciones) {
        const comprobante = comprobantesFrescos.find((c) => c.id === Number(a.comprobanteId));
        const saldo = saldosFrescos.get(comprobante.id) ?? 0;
        if (centavos(Number(a.importeAplicado)) > centavos(saldo)) {
          throw new ErrorDeNegocio(
            `El importe aplicado al comprobante ${comprobante.numero} (${a.importeAplicado}) supera su saldo pendiente actual (${saldo}). ` +
              "Puede haber cambiado por otro pago registrado al mismo tiempo — revisá e intentá de nuevo."
          );
        }
      }

      // Re-chequeo de cheques por la misma razón: sin @@unique en la base
      // (ver comentario en schema.prisma), la única garantía es esta
      // consulta — repetirla con datos frescos justo antes del insert
      // acorta al máximo la ventana en la que dos requests concurrentes
      // podrían colarse con el mismo (banco, numeroCheque).
      if (clavesCheque.length > 0) {
        const existentesFrescos = await tx.ordenPagoMedio.findMany({
          where: { OR: clavesCheque.map((c) => ({ banco: c.banco, numeroCheque: c.numeroCheque })) },
          include: { ordenPago: true },
        });
        for (const { banco, numeroCheque } of clavesCheque) {
          const conflicto = existentesFrescos.find(
            (e) => e.banco === banco && e.numeroCheque === numeroCheque && pagoVigente(e.ordenPago)
          );
          if (conflicto) {
            throw new ErrorDeNegocio(`Ya existe un cheque N° ${numeroCheque} de ${banco} registrado en el sistema.`);
          }
        }
      }

      return crearConNumeroSecuencial(tx, "ordenPago", {
        prefijo: "OP",
        data: {
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

// HU-78: listado con filtros + total del período + desglose por medio.
// Los totales solo cuentan ordenes vigentes (no anuladas ni rechazadas
// por un cheque) — el listado en si muestra todas, para que se vea el
// historial completo, pero lo que se suma es lo que de verdad afecta la
// cuenta corriente del proveedor.
async function listarOrdenesPago({ proveedorId, medio, desde, hasta } = {}) {
  const where = {};
  if (proveedorId) where.proveedorId = Number(proveedorId);
  if (medio && MEDIOS_PAGO.includes(medio)) {
    where.medios = { some: { medioPago: medio } };
  }
  if (desde || hasta) {
    where.fecha = {};
    if (desde) where.fecha.gte = new Date(desde);
    if (hasta) {
      // "hasta" = menor al dia siguiente (limite exclusivo), no
      // setHours(23,59,59) — mismo criterio que listarMovimientos en
      // movimientosStock.servicio.js, para no perder pagos del propio
      // dia "hasta" por una comparacion en hora local del server.
      const siguienteDia = new Date(hasta);
      siguienteDia.setUTCDate(siguienteDia.getUTCDate() + 1);
      where.fecha.lt = siguienteDia;
    }
  }

  const ordenes = await prisma.ordenPago.findMany({
    where,
    include: { proveedor: true, medios: true, detalle: { include: { comprobante: true } } },
    orderBy: { fecha: "desc" },
  });

  const vigentes = ordenes.filter(pagoVigente);
  const totalPeriodo = vigentes.reduce((acc, o) => acc + o.medios.reduce((a, m) => a + Number(m.importe), 0), 0);
  const desglose = MEDIOS_PAGO.map((tipo) => {
    const conEsteMedio = vigentes.filter((o) => o.medios.some((m) => m.medioPago === tipo));
    const importe = conEsteMedio.reduce(
      (acc, o) => acc + o.medios.filter((m) => m.medioPago === tipo).reduce((a, m) => a + Number(m.importe), 0),
      0
    );
    return { medio: tipo, importe, cantidadOrdenes: conEsteMedio.length };
  });

  return {
    items: ordenes.map((o) => ({
      id: o.id,
      numero: o.numero,
      fecha: o.fecha,
      proveedorId: o.proveedorId,
      proveedor: o.proveedor.razonSocial,
      medios: o.medios.map((m) => m.medioPago),
      importe: o.medios.reduce((a, m) => a + Number(m.importe), 0),
      comprobantes: o.detalle.map((d) => d.comprobante.numero),
      estado: o.anulado ? "Anulada" : o.estado,
      vigente: pagoVigente(o),
    })),
    totalPeriodo,
    cantidadVigentes: vigentes.length,
    cantidadTotal: ordenes.length,
    desglose,
  };
}

module.exports = {
  ErrorDeNegocio,
  proveedoresConSaldo,
  comprobantesPendientes,
  crearOrdenPago,
  obtenerOrdenPago,
  listarOrdenesPago,
};
