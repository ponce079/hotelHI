// E-commerce (/api/web) — HU-99 (búsqueda por tipo) y HU-100 (cotización
// por tipo). Se construye AL LADO de lo existente: usa consultarDisponibilidad
// y cotizarParaReserva de reservas.servicio.js tal cual (canal "WEB": solo
// planes visibleWeb, precios con IVA incluido) y nunca los modifica. Solo
// lecturas, fuera de transacciones.
const prisma = require("../../lib/prisma");
const reservasServicio = require("../reservas/reservas.servicio");
const { ErrorWeb, CODIGO, datosInvalidos } = require("./ecommerce.errores");
const { validarBusqueda, validarCotizacion } = require("./ecommerce.validacion");
const {
  armarTiposWeb,
  armarDisponibilidadWeb,
  elegirRepresentantes,
  armarCotizacionWeb,
} = require("./ecommerce.transformacion");

const CANAL_WEB = "WEB";
const isoDeFecha = (fecha) => fecha.toISOString().slice(0, 10);

async function tiposVendibles() {
  const habitaciones = await prisma.habitacion.findMany({
    where: { activo: true, tipoHabitacion: { activo: true } },
    select: {
      capacidad: true,
      tipoHabitacionId: true,
      tipoHabitacion: { select: { nombre: true, activo: true } },
    },
  });
  return armarTiposWeb(habitaciones);
}

// GET /api/web/tipos
async function obtenerTipos() {
  return { tipos: await tiposVendibles() };
}

// GET /api/web/disponibilidad. Sin capacidadMinima a propósito: así vuelven
// las habitaciones libres de TODAS las capacidades y la transformación puede
// distinguir "la ocupación supera la capacidad del tipo" de "no queda
// ninguna libre que alcance".
async function consultarDisponibilidad(query) {
  const busqueda = validarBusqueda(query);
  const fechaDesde = isoDeFecha(busqueda.fechaDesde);
  const fechaHasta = isoDeFecha(busqueda.fechaHasta);
  const [tipos, disponibilidad] = await Promise.all([
    tiposVendibles(),
    reservasServicio.consultarDisponibilidad({
      fechaDesde,
      fechaHasta,
      adultos: busqueda.adultos,
      menores: busqueda.menores,
      canal: CANAL_WEB,
    }),
  ]);
  return armarDisponibilidadWeb({
    tipos,
    disponibilidad,
    adultos: busqueda.adultos,
    menores: busqueda.menores,
    fechaDesde,
    fechaHasta,
  });
}

// POST /api/web/cotizar. Por cada línea elige una habitación representante
// libre (mismo criterio que usará el alta, ver elegirRepresentantes) y cotiza
// con cotizarParaReserva: es el mismo cálculo que hará el alta, así el
// totalEsperado que manda el frontend coincide.
async function cotizar(cuerpo) {
  const datos = validarCotizacion(cuerpo);
  const fechaDesde = isoDeFecha(datos.fechaDesde);
  const fechaHasta = isoDeFecha(datos.fechaHasta);

  const tipos = await tiposVendibles();
  const nombrePorTipo = new Map(tipos.map((t) => [t.tipoHabitacionId, t.nombre]));
  datos.habitaciones.forEach((linea, i) => {
    if (!nombrePorTipo.has(linea.tipoHabitacionId)) {
      throw datosInvalidos(`habitaciones[${i}].tipoHabitacionId`, "El tipo de habitación elegido no está disponible.");
    }
  });
  // Solo tarifas activas y visibles en la web; se valida acá para no
  // mostrarle al huésped el mensaje interno del motor.
  const plan = await prisma.planTarifario.findFirst({
    where: { id: datos.planTarifarioId, activo: true, visibleWeb: true },
    select: { id: true },
  });
  if (!plan) throw datosInvalidos("planTarifarioId", "La tarifa elegida no está disponible.");

  // Mismo criterio de "libre" que el resto del sistema (incluida la regla de
  // entrada hoy). La ocupación de esta consulta no importa: sus precios no
  // se usan, solo la lista de habitaciones libres.
  const disponibilidad = await reservasServicio.consultarDisponibilidad({
    fechaDesde,
    fechaHasta,
    adultos: 1,
    menores: 0,
    canal: CANAL_WEB,
  });
  const representantes = elegirRepresentantes(disponibilidad.habitaciones, datos.habitaciones);
  if (!representantes) throw new ErrorWeb(409, CODIGO.SIN_DISPONIBILIDAD);

  const cotizacion = await reservasServicio.cotizarParaReserva({
    fechaDesde,
    fechaHasta,
    planTarifarioId: datos.planTarifarioId,
    habitaciones: datos.habitaciones.map((linea, i) => ({
      habitacionId: representantes[i],
      adultos: linea.adultos,
      menores: linea.menores,
    })),
    canal: CANAL_WEB,
  });
  if (!cotizacion.planes?.length) {
    throw datosInvalidos("planTarifarioId", "La tarifa elegida no está disponible para estas fechas.");
  }
  return armarCotizacionWeb({ cotizacion, lineas: datos.habitaciones, representantes, nombrePorTipo });
}

module.exports = { obtenerTipos, consultarDisponibilidad, cotizar };
