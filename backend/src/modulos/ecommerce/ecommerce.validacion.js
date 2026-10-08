// Validación de parámetros del e-commerce (/api/web). Todo error es
// 400 DATOS_INVALIDOS con el `campo` que falló, ANTES de llegar al motor.
const { parsearFechaSinHora, hoyComoFechaUTC } = require("../../lib/fechas");
const { MAX_NOCHES_ESTADIA } = require("../tarifas/tarifas.constantes");
const { datosInvalidos } = require("./ecommerce.errores");

const MAX_HABITACIONES_WEB = 3;
const MILISEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

function fecha(valor, campo, etiqueta) {
  try {
    return parsearFechaSinHora(valor, etiqueta);
  } catch (err) {
    throw datosInvalidos(campo, err.message);
  }
}

function entero(valor, campo, minimo, mensaje) {
  const texto = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : "";
  if (!/^\d+$/.test(texto) || Number(texto) < minimo || !Number.isSafeInteger(Number(texto))) {
    throw datosInvalidos(campo, mensaje);
  }
  return Number(texto);
}

function validarFechas({ fechaDesde, fechaHasta }) {
  const desde = fecha(fechaDesde, "fechaDesde", "La fecha de entrada");
  const hasta = fecha(fechaHasta, "fechaHasta", "La fecha de salida");
  // Hoy en hora argentina (lib/fechas.js): entrar hoy está permitido.
  if (desde.getTime() < hoyComoFechaUTC().getTime()) {
    throw datosInvalidos("fechaDesde", "La fecha de entrada no puede ser anterior a hoy.");
  }
  if (hasta.getTime() <= desde.getTime()) {
    throw datosInvalidos("fechaHasta", "La fecha de salida tiene que ser posterior a la de entrada.");
  }
  const noches = Math.round((hasta.getTime() - desde.getTime()) / MILISEGUNDOS_POR_DIA);
  if (noches > MAX_NOCHES_ESTADIA) {
    throw datosInvalidos("fechaHasta", `La estadía no puede superar las ${MAX_NOCHES_ESTADIA} noches.`);
  }
  return { fechaDesde: desde, fechaHasta: hasta, noches };
}

function validarOcupacion(datos, prefijo = "") {
  const adultos = entero(datos?.adultos, `${prefijo}adultos`, 1, "La cantidad de adultos tiene que ser un número entero, al menos 1.");
  const menores =
    datos?.menores === undefined || datos?.menores === null || datos?.menores === ""
      ? 0
      : entero(datos.menores, `${prefijo}menores`, 0, "La cantidad de menores tiene que ser un número entero.");
  return { adultos, menores };
}

// GET /api/web/disponibilidad?fechaDesde&fechaHasta&adultos&menores
function validarBusqueda(query) {
  return { ...validarFechas(query ?? {}), ...validarOcupacion(query ?? {}) };
}

// POST /api/web/cotizar
function validarCotizacion(cuerpo) {
  const datos = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
  const fechas = validarFechas(datos);
  const planTarifarioId = entero(datos.planTarifarioId, "planTarifarioId", 1, "Elegí una tarifa.");
  const lineas = datos.habitaciones;
  if (!Array.isArray(lineas) || lineas.length < 1 || lineas.length > MAX_HABITACIONES_WEB) {
    throw datosInvalidos("habitaciones", `Elegí entre 1 y ${MAX_HABITACIONES_WEB} habitaciones.`);
  }
  const habitaciones = lineas.map((linea, i) => ({
    tipoHabitacionId: entero(linea?.tipoHabitacionId, `habitaciones[${i}].tipoHabitacionId`, 1, "Elegí un tipo de habitación."),
    ...validarOcupacion(linea, `habitaciones[${i}].`),
  }));
  return { ...fechas, planTarifarioId, habitaciones };
}

module.exports = { MAX_HABITACIONES_WEB, validarBusqueda, validarCotizacion };
