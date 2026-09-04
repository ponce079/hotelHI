// src/modulos/pagos/pagos.servicio.js
//
// Lógica de negocio pura (HU-76, HU-77: generar una orden de pago con
// varios comprobantes y varios medios de pago combinados). El resto de
// Pagos (HU-78 listado, HU-79 anular, HU-86 estado de cheque) se agrega
// en una rama aparte.

const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const {
  calcularSaldosComprobantes,
  listarFacturasConSaldo,
  pagoVigente,
  sumarImportesMedios,
  resumenSaldosPorProveedor,
} = require("../../lib/comprobantes");
const { crearConNumeroSecuencial } = require("../../lib/numeracion");
const { MEDIOS_PAGO, BANCOS, ESTADOS_CHEQUE } = require("./pagos.constantes");
// HU-76: para exigir confirmación de diferencia de matching antes de
// pagar (ver más abajo), se reutiliza el cálculo de HU-72 tal cual —no
// se reimplementa una segunda vez.
const { calcularMatching } = require("../comprobantes/comprobantes.servicio");

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
  const { porProveedor } = await resumenSaldosPorProveedor();
  const proveedorIds = [...porProveedor.keys()];
  if (proveedorIds.length === 0) return [];
  return prisma.proveedor.findMany({ where: { id: { in: proveedorIds } }, orderBy: { razonSocial: "asc" } });
}

// HU-76, paso 1: facturas con saldo pendiente de un proveedor puntual.
// Cada una viaja con su matching de 3 vías (HU-72) para que el wizard
// pueda avisar y exigir confirmación antes de incluirla en el pago.
async function comprobantesPendientes(proveedorId) {
  const id = Number(proveedorId);
  if (!proveedorId || !Number.isInteger(id)) {
    throw new ErrorDeNegocio("proveedorId es obligatorio y debe ser un número entero.");
  }
  const facturas = await listarFacturasConSaldo(id);
  return Promise.all(
    facturas.map(async (f) => ({
      ...f,
      matching: f.ordenCompraId ? await calcularMatching(f) : null,
    }))
  );
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

  // ordenCompra con su detalle va incluido acá para que calcularMatching
  // (más abajo, gate de HU-76) lo reuse en vez de volver a pedirlo a la
  // base por cada comprobante con OC — mismo criterio que listarComprobantes.
  const comprobantes = await prisma.comprobanteProveedor.findMany({
    where: { id: { in: comprobanteIds } },
    include: { ordenCompra: { include: { detalle: true } } },
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

  // HU-76: un comprobante marcado "Con diferencia de matching" (HU-72)
  // exige confirmación explícita del usuario antes de poder incluirse en
  // la orden de pago — cada aplicación necesita su propio
  // `confirmarDiferencia: true`, no alcanza con confirmar una sola vez
  // para toda la orden.
  for (const c of comprobantes) {
    if (c.tipo !== "Factura" || !c.ordenCompraId) continue;
    const matching = await calcularMatching(c);
    if (!matching?.tieneDiferencia) continue;
    const aplicacion = aplicaciones.find((a) => Number(a.comprobanteId) === c.id);
    if (!aplicacion?.confirmarDiferencia) {
      throw new ErrorDeNegocio(
        `El comprobante ${c.numero} tiene una diferencia de matching (OC vs. recepción vs. factura) — hay que confirmarla explícitamente antes de incluirlo en el pago.`
      );
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
      //
      // Como el cheque nuevo todavía no tiene fila propia, un SELECT normal
      // no bloquea nada: dos requests concurrentes pueden leer "no existe"
      // los dos y colarse igual. El FOR UPDATE de acá abajo sí alcanza —
      // bajo REPEATABLE READ (default de InnoDB) toma un gap lock sobre el
      // índice (banco, numeroCheque) para cada par exacto, así que una
      // segunda transacción que intente insertar el mismo (banco,
      // numeroCheque) espera a que ésta termine, en vez de colarse en el
      // hueco entre el SELECT y el INSERT.
      if (clavesCheque.length > 0) {
        const condicionesCheque = clavesCheque.map(
          (c) => Prisma.sql`(banco = ${c.banco} AND numeroCheque = ${c.numeroCheque})`
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM ordenes_pago_medio WHERE ${Prisma.join(condicionesCheque, " OR ")} FOR UPDATE`
        );
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

// HU-79: anular una orden de pago. No hace falta tocar OrdenPagoMedio ni
// recalcular nada mas — pagoVigente() deja de contarla apenas anulado
// pasa a true, asi que el saldo del comprobante y la reutilizacion del
// N° de cheque se recalculan solos en cuanto alguien vuelve a leerlos.
async function anularOrdenPago(id, motivo, confirmarCheque) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) throw new ErrorDeNegocio("id inválido.");
  if (!motivo || !motivo.trim()) throw new ErrorDeNegocio("El motivo de anulación es obligatorio.");

  // Chequeo rapido ("fail fast") antes de la transaccion, no toma locks.
  const ordenPrevia = await prisma.ordenPago.findUnique({ where: { id: idNum }, include: { medios: true } });
  if (!ordenPrevia) throw new ErrorDeNegocio("La orden de pago no existe.", 404);
  if (!pagoVigente(ordenPrevia)) {
    throw new ErrorDeNegocio("La orden de pago ya no está vigente (anulada o rechazada).");
  }
  // HU-79: una orden que incluye un pago con cheque no puede anularse sin
  // confirmación explícita adicional del usuario — el motivo solo no alcanza.
  if (ordenPrevia.medios.some((m) => m.medioPago === "Cheque") && !confirmarCheque) {
    throw new ErrorDeNegocio(
      "Esta orden incluye un pago con cheque — confirmá explícitamente la anulación antes de continuar."
    );
  }

  return prisma.$transaction(async (tx) => {
    // Re-chequeo protegido contra carreras: FOR UPDATE bloquea la fila
    // hasta que esta transaccion termine, asi una segunda anulacion (o
    // un rechazo de cheque) que llegue casi al mismo tiempo espera a
    // que esta commitee y ve el estado ya actualizado, en vez de pisar
    // el motivo o dejar anulado=true + estado="Rechazada" a la vez.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM ordenes_pago WHERE id = ${idNum} FOR UPDATE`);
    const ordenFresca = await tx.ordenPago.findUnique({ where: { id: idNum } });
    if (!pagoVigente(ordenFresca)) {
      throw new ErrorDeNegocio("La orden de pago ya no está vigente (anulada o rechazada).");
    }
    return tx.ordenPago.update({
      where: { id: idNum },
      data: { anulado: true, motivoAnulacion: motivo.trim() },
      include: { proveedor: true, detalle: { include: { comprobante: true } }, medios: true },
    });
  }, { timeout: 15000, maxWait: 10000 });
}

// HU-86: seguimiento de estado de cheque. Solo se puede pasar de
// Emitido a Cobrado o Rechazado (no hay vuelta atras — si alguien se
// equivoca, se anula la orden entera en vez de "revertir" el cheque).
// Rechazado ademas marca la orden como estado "Rechazada": es la unica
// forma que tiene pagoVigente() de dejar de contarla, asi el
// comprobante recupera el saldo y el cheque queda libre para reusarse.
//
// Esto es a nivel de TODA la orden, no solo de este medio — el modelo
// de datos no vincula cada aplicacion de comprobante (OrdenPagoDetalle)
// con el medio que la cubrio, asi que no hay forma de saber que parte
// del pago corresponde a este cheque puntual. Por eso, si la orden
// combina mas de un medio (otro cheque, efectivo, transferencia),
// rechazar aca sobre-acreditaria el saldo del comprobante por la parte
// que si se cobro, y dejaria a cualquier otro cheque de la misma orden
// sin ninguna accion posible (pagoVigente ya bloquearia la orden
// entera). Esos casos se resuelven anulando la orden completa (HU-79).
async function actualizarEstadoCheque(ordenPagoId, medioId, estado, fechaCobro) {
  const ordenId = Number(ordenPagoId);
  const medioIdNum = Number(medioId);
  if (!Number.isInteger(ordenId) || !Number.isInteger(medioIdNum)) {
    throw new ErrorDeNegocio("id inválido.");
  }
  if (estado === "Emitido" || !ESTADOS_CHEQUE.includes(estado)) {
    throw new ErrorDeNegocio('estado inválido. Valores permitidos: "Cobrado", "Rechazado".');
  }
  // HU-86: el criterio pide guardar la fecha de cobro al marcar "Cobrado".
  let fechaCobroValida = null;
  if (estado === "Cobrado") {
    if (!fechaCobro) throw new ErrorDeNegocio("La fecha de cobro es obligatoria para marcar el cheque como Cobrado.");
    fechaCobroValida = new Date(fechaCobro);
    if (Number.isNaN(fechaCobroValida.getTime())) throw new ErrorDeNegocio("fechaCobro no es una fecha válida.");
  }

  // Chequeo rapido ("fail fast") antes de la transaccion, no toma locks.
  const ordenPrevia = await prisma.ordenPago.findUnique({ where: { id: ordenId }, include: { medios: true } });
  if (!ordenPrevia) throw new ErrorDeNegocio("La orden de pago no existe.", 404);
  if (!pagoVigente(ordenPrevia)) {
    throw new ErrorDeNegocio("La orden de pago no está vigente (anulada o rechazada).");
  }
  const medioPrevio = ordenPrevia.medios.find((m) => m.id === medioIdNum);
  if (!medioPrevio) throw new ErrorDeNegocio("El medio de pago indicado no pertenece a esta orden.");
  if (medioPrevio.medioPago !== "Cheque") {
    throw new ErrorDeNegocio("Solo se puede actualizar el estado de un medio de pago Cheque.");
  }
  if (estado === "Rechazado" && ordenPrevia.medios.length > 1) {
    throw new ErrorDeNegocio(
      "Esta orden combina más de un medio de pago — no se puede rechazar un cheque individual sin afectar el resto. Anulá la orden completa e indicá el motivo."
    );
  }
  if (medioPrevio.estadoCheque !== "Emitido") {
    throw new ErrorDeNegocio(`El cheque ya está en estado "${medioPrevio.estadoCheque}" y no se puede modificar.`);
  }

  return prisma.$transaction(async (tx) => {
    // Re-chequeo protegido contra carreras, mismo criterio que
    // anularOrdenPago — bloquea la fila de la orden hasta commitear.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM ordenes_pago WHERE id = ${ordenId} FOR UPDATE`);
    const ordenFresca = await tx.ordenPago.findUnique({ where: { id: ordenId }, include: { medios: true } });
    if (!pagoVigente(ordenFresca)) {
      throw new ErrorDeNegocio("La orden de pago no está vigente (anulada o rechazada).");
    }
    const medioFresco = ordenFresca.medios.find((m) => m.id === medioIdNum);
    if (!medioFresco || medioFresco.estadoCheque !== "Emitido") {
      throw new ErrorDeNegocio(
        `El cheque ya está en estado "${medioFresco?.estadoCheque ?? "desconocido"}" y no se puede modificar.`
      );
    }

    await tx.ordenPagoMedio.update({
      where: { id: medioIdNum },
      data: { estadoCheque: estado, fechaCobro: estado === "Cobrado" ? fechaCobroValida : null },
    });
    if (estado === "Rechazado") {
      await tx.ordenPago.update({ where: { id: ordenId }, data: { estado: "Rechazada" } });
    }
    return tx.ordenPago.findUnique({
      where: { id: ordenId },
      include: { proveedor: true, detalle: { include: { comprobante: true } }, medios: true },
    });
  }, { timeout: 15000, maxWait: 10000 });
}

// HU-78: listado con filtros + total del período + desglose por medio.
// Los totales solo cuentan ordenes vigentes (no anuladas ni rechazadas
// por un cheque) — el listado en si muestra todas, para que se vea el
// historial completo, pero lo que se suma es lo que de verdad afecta la
// cuenta corriente del proveedor.
async function listarOrdenesPago({ proveedorId, medio, desde, hasta, page = 1, pageSize = 20 } = {}) {
  const where = {};
  if (proveedorId) {
    const id = Number(proveedorId);
    if (!Number.isInteger(id)) throw new ErrorDeNegocio("proveedorId debe ser un número entero.");
    where.proveedorId = id;
  }
  if (medio) {
    if (!MEDIOS_PAGO.includes(medio)) {
      throw new ErrorDeNegocio(`medio inválido. Valores permitidos: ${MEDIOS_PAGO.join(", ")}`);
    }
    where.medios = { some: { medioPago: medio } };
  }
  if (desde || hasta) {
    where.fecha = {};
    if (desde) {
      // OrdenPago.fecha es un timestamp real (no "solo día"), asi que el
      // limite se arma en hora Argentina (UTC-3, sin horario de verano)
      // y no en medianoche UTC — si no, un pago de la noche del propio
      // "desde" quedaria afuera del rango.
      const fechaDesde = new Date(`${desde}T00:00:00-03:00`);
      if (Number.isNaN(fechaDesde.getTime())) throw new ErrorDeNegocio("desde no es una fecha válida.");
      where.fecha.gte = fechaDesde;
    }
    if (hasta) {
      const siguienteDia = new Date(`${hasta}T00:00:00-03:00`);
      if (Number.isNaN(siguienteDia.getTime())) throw new ErrorDeNegocio("hasta no es una fecha válida.");
      siguienteDia.setUTCDate(siguienteDia.getUTCDate() + 1);
      where.fecha.lt = siguienteDia;
    }
  }

  const pageNum = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const pageSizeNum = Number.isInteger(Number(pageSize)) && Number(pageSize) > 0 ? Number(pageSize) : 20;

  // El listado (items) va paginado, pero el total del período y el
  // desglose por medio tienen que reflejar TODAS las ordenes que
  // cumplen el filtro, no solo la pagina actual — por eso se piden por
  // separado, liviano (solo los campos que hacen falta para sumar).
  // Secuencial (no Promise.all): el pool de conexiones a la base
  // remota es chico (limit=3) y esta misma consulta ya se pide dos
  // veces por carga de pantalla (listado + combo de proveedor) — tres
  // queries en paralelo por llamada lo saturaba y tiraba timeouts.
  // "total" sale de ordenesParaTotales.length, no hace falta un count()
  // aparte porque ya se trae el set completo que matchea el filtro.
  const ordenesParaTotales = await prisma.ordenPago.findMany({
    where,
    select: { anulado: true, estado: true, medios: { select: { medioPago: true, importe: true } } },
  });
  const ordenesPagina = await prisma.ordenPago.findMany({
    where,
    include: {
      proveedor: { select: { razonSocial: true } },
      medios: true,
      detalle: { include: { comprobante: { select: { numero: true } } } },
    },
    orderBy: { fecha: "desc" },
    skip: (pageNum - 1) * pageSizeNum,
    take: pageSizeNum,
  });
  const total = ordenesParaTotales.length;

  const vigentes = ordenesParaTotales.filter(pagoVigente);
  // Si hay un medio filtrado, el total del período solo cuenta la parte
  // de cada orden pagada con ESE medio (no la orden entera) — si no, una
  // orden combinada (ej. Efectivo + Transferencia) infla el total al
  // filtrar por Efectivo con el importe de la Transferencia tambien.
  const totalPeriodo = vigentes.reduce((acc, o) => {
    const mediosRelevantes = medio ? o.medios.filter((m) => m.medioPago === medio) : o.medios;
    return acc + sumarImportesMedios(mediosRelevantes);
  }, 0);
  const desglose = MEDIOS_PAGO.map((tipo) => {
    const mediosDeEsteTipo = vigentes.flatMap((o) => o.medios.filter((m) => m.medioPago === tipo));
    const cantidadOrdenes = vigentes.filter((o) => o.medios.some((m) => m.medioPago === tipo)).length;
    return { medio: tipo, importe: sumarImportesMedios(mediosDeEsteTipo), cantidadOrdenes };
  });

  return {
    items: ordenesPagina.map((o) => ({
      id: o.id,
      numero: o.numero,
      fecha: o.fecha,
      proveedorId: o.proveedorId,
      proveedor: o.proveedor.razonSocial,
      // HU-86: además del tipo de medio, el estado del cheque tiene que
      // ser visible en este listado (antes solo se veía en el detalle
      // de la orden).
      medios: o.medios.map((m) => ({ tipo: m.medioPago, estadoCheque: m.estadoCheque })),
      importe: sumarImportesMedios(o.medios),
      comprobantes: o.detalle.map((d) => d.comprobante.numero),
      estado: o.anulado ? "Anulada" : o.estado,
      vigente: pagoVigente(o),
    })),
    total,
    page: pageNum,
    pageSize: pageSizeNum,
    totalPages: Math.max(1, Math.ceil(total / pageSizeNum)),
    totalPeriodo,
    cantidadVigentes: vigentes.length,
    cantidadTotal: ordenesParaTotales.length,
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
  anularOrdenPago,
  actualizarEstadoCheque,
};
