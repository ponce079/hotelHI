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
    ...c,
    precioUnitario: c.precioUnitario == null ? null : Number(c.precioUnitario),
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
  const reservaId=enteroPositivo(data?.reservaId,'reservaId');
  const habitacionId=enteroPositivo(data?.habitacionId,'habitacionId');
  const tipoServicio=normalizarTipoServicio(data?.tipoServicio);
  const registradoPor=textoObligatorio(data?.registradoPor,'registradoPor',100);
  const cantidad=Number(data.cantidad ?? 1);
  const incluido=data.incluido===true;
  const precioUnitario=Number(data.precioUnitario ?? (Number(data.monto)/cantidad));
  const decimal=n=>Number.isFinite(n)&&Math.abs(n*100-Math.round(n*100))<0.000001;
  if(!decimal(cantidad)||cantidad<=0||cantidad>99999999||!decimal(precioUnitario)||precioUnitario<0||(!incluido&&precioUnitario===0))throw new ErrorDeNegocio('Cantidad o precio unitario inválidos.');
  const monto=incluido?0:Math.round(cantidad*precioUnitario*100)/100;
  if(monto>9999999999.99)throw new ErrorDeNegocio('El monto supera el máximo permitido.');
  const descripcion=textoObligatorio(data.descripcion||tipoServicio,'Descripción',500);
  const claveOperacion=data.claveOperacion?textoObligatorio(data.claveOperacion,'Clave de operación',100):null;
  const fechaServicio=data.fechaServicio?new Date(data.fechaServicio):new Date();
  if(!Number.isFinite(fechaServicio.getTime()))throw new ErrorDeNegocio('Fecha del servicio inválida.');
  if(tipoServicio!=='Minibar'&&data.articuloId)throw new ErrorDeNegocio('El artículo solo corresponde al minibar.');
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${reservaId} FOR UPDATE`;
    const reserva=await tx.reserva.findUnique({where:{id:reservaId},include:{reservaHabitaciones:true}});
    if(!reserva)throw new ErrorDeNegocio('Reserva inexistente.',404);
    if(reserva.estado===ESTADO_RESERVA.CERRADA)throw new ErrorDeNegocio('No se pueden registrar cargos sobre una reserva cerrada.',409);
    if(reserva.estado!==ESTADO_RESERVA.EN_CURSO)throw new ErrorDeNegocio('Solo se pueden registrar consumos con la reserva "En curso".');
    if(!reserva.reservaHabitaciones.some(h=>h.habitacionId===habitacionId))throw new ErrorDeNegocio('La habitación no pertenece a esta reserva.');
    if(claveOperacion){const previo=await tx.consumoServicioAdicional.findUnique({where:{claveOperacion},include:{articulo:true,habitacion:true}});if(previo){if(previo.reservaId!==reservaId||previo.habitacionId!==habitacionId)throw new ErrorDeNegocio('Clave de operación usada en otra habitación.',409);return formatearConsumo(previo);}}
    // Las fechas de reserva son días calendario; el instante del servicio
    // se compara en Argentina. Se admite el día de salida antes del cierre.
    const diaServicio=fechaServicio.toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
    const desde=reserva.fechaDesde.toISOString().slice(0,10);
    const hasta=reserva.fechaHasta.toISOString().slice(0,10);
    if(diaServicio<desde||diaServicio>hasta)throw new ErrorDeNegocio(`La fecha del servicio debe estar dentro de la estadía (${desde} al ${hasta}).`);
    let articuloId=null,movimientoStockId=null;
    if(tipoServicio==='Minibar'){
      articuloId=enteroPositivo(data.articuloId,'articuloId');
      const tipoMovStockId=await resolverTipoMovimientoMinibar(tx);
      const depositoId=await resolverDepositoMinibar(tx);
      const movimiento=await movimientoSalidaServicio.registrarSalidaEnTransaccion(tx,{depositoId,tipoMovStockId,detalle:'Consumo Minibar - Habitación '+habitacionId+' - Reserva '+reservaId,usuario:registradoPor,items:[{articuloId,cantidad}]});
      movimientoStockId=movimiento.id;
    }
    const consumo=await tx.consumoServicioAdicional.create({data:{reservaId,habitacionId,tipoServicio,registradoPor,cantidad,precioUnitario,monto,incluido,descripcion,fechaServicio,claveOperacion,articuloId,movimientoStockId},include:{articulo:true,habitacion:true}});
    await require('../estadia/estadia.servicio').evento(tx,reservaId,'Agregar cargo',{consumoId:consumo.id,habitacionId,monto},registradoPor);
    return formatearConsumo(consumo);
  },{timeout:15000,maxWait:10000});
}

async function anularConsumo(id,data) {
  id=enteroPositivo(id,'id');
  const motivo=textoObligatorio(data.motivo,'Motivo',500);
  const operador=textoObligatorio(data.operador,'Operador',191);
  return prisma.$transaction(async tx=>{
    const c=await tx.consumoServicioAdicional.findUnique({where:{id}});
    if(!c)throw new ErrorDeNegocio('Consumo inexistente.',404);
    await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${c.reservaId} FOR UPDATE`;
    const r=await tx.reserva.findUnique({where:{id:c.reservaId}});
    if(r.estado!=='En curso')throw new ErrorDeNegocio('Solo se anulan cargos de estadías en curso.');
    const actual=await tx.consumoServicioAdicional.findUnique({where:{id}});
    if(actual.anulado)throw new ErrorDeNegocio('El cargo ya está anulado.');
    const saved=await tx.consumoServicioAdicional.update({where:{id},data:{anulado:true,anuladoEn:new Date(),anuladoPor:operador,motivoAnulacion:motivo},include:{articulo:true,habitacion:true}});
    await require('../estadia/estadia.servicio').evento(tx,c.reservaId,'Anular cargo',{consumoId:id,habitacionId:c.habitacionId,motivo},operador);
    return formatearConsumo(saved);
  },{timeout:15000});
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
    const delTipo = items.filter((i) => !i.anulado && i.tipoServicio === tipo);
    return {
      tipoServicio: tipo,
      cantidad: delTipo.length,
      total: delTipo.reduce((acc, i) => acc + i.monto, 0),
    };
  });
  return {
    items,
    totalPorTipo,
    totalGeneral: items.filter(i=>!i.anulado).reduce((acc, i) => acc + i.monto, 0),
  };
}

// --------------------------------------------------------------
// Ajuste de flujo (Sprint 3): el ítem de menú "Servicios Adicionales" deja
// de ser un lugar donde se busca una reserva y se carga un consumo — eso
// ahora vive únicamente en la ficha de la reserva (ver
// ReservaDetallePage.jsx). El menú pasa a ser una consulta de solo lectura
// de TODO el hotel por período, útil para cambio de turno o control de
// minibar. No filtra por reservaId (a diferencia de listarPorReserva de
// arriba, que sigue igual y la sigue usando la ficha de reserva) — filtra
// por rango de fechas, mismo criterio de "hasta" exclusivo (medianoche del
// día siguiente) que reservas.servicio.js/movimientosStock.servicio.js.
// --------------------------------------------------------------

async function listarConsumosHotel({ desde, hasta, tipoServicio } = {}) {
  if (tipoServicio) normalizarTipoServicio(tipoServicio);

  const fechaHora = {};
  // Los filtros representan días del hotel, no medianoches UTC.
  const { parsearFechaSinHora, combinarFechaConHoraArgentina } = require('../../lib/fechas');
  const inicioDia = (valor, campo) => {
    try { return combinarFechaConHoraArgentina(parsearFechaSinHora(valor, campo), 0); }
    catch (error) { throw new ErrorDeNegocio(error.message); }
  };
  if (desde) fechaHora.gte = inicioDia(desde, 'Desde');
  if (hasta) {
    const siguienteDia = inicioDia(hasta, 'Hasta');
    siguienteDia.setUTCDate(siguienteDia.getUTCDate() + 1);
    fechaHora.lt = siguienteDia;
  }
  if (fechaHora.gte && fechaHora.lt && fechaHora.gte >= fechaHora.lt) throw new ErrorDeNegocio('Desde no puede ser posterior a Hasta.');

  const consumos = await prisma.consumoServicioAdicional.findMany({
    where: {
      ...(tipoServicio ? { tipoServicio } : {}),
      ...(Object.keys(fechaHora).length ? { fechaHora } : {}),
    },
    include: {
      articulo: true,
      habitacion: true,
      // Solo lo que hace falta mostrar en una vista de todo el hotel (a
      // qué huésped/reserva corresponde cada fila) — no trae la reserva
      // completa, esto no reemplaza a listarPorReserva.
      reserva: { select: { codigoConfirmacion: true, huesped: { select: { nombre: true } } } },
    },
    orderBy: { fechaHora: "desc" },
  });

  return consumos.map((c) => ({
    ...formatearConsumo(c),
    reservaCodigoConfirmacion: c.reserva?.codigoConfirmacion ?? null,
    huespedNombre: c.reserva?.huesped?.nombre ?? null,
  }));
}

async function resumenConsumosHotel(filtros = {}) {
  const items = await listarConsumosHotel(filtros);
  const totalPorTipo = TIPOS_SERVICIO.map((tipo) => {
    const delTipo = items.filter((i) => !i.anulado && i.tipoServicio === tipo);
    return {
      tipoServicio: tipo,
      cantidad: delTipo.length,
      total: delTipo.reduce((acc, i) => acc + i.monto, 0),
    };
  });
  return {
    items,
    totalPorTipo,
    totalGeneral: items.filter(i=>!i.anulado).reduce((acc, i) => acc + i.monto, 0),
  };
}

module.exports = {
  anularConsumo,
  registrarConsumo,
  listarPorReserva,
  resumenPorReserva,
  listarConsumosHotel,
  resumenConsumosHotel,
  ErrorDeNegocio,
};
