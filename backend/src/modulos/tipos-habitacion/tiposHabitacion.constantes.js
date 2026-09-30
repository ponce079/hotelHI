// Catálogo de Tipos de Habitación (HU-89) — Etapa 1 de tarifas por
// temporada. Listas fijas validadas en código, mismo criterio que
// habitaciones.constantes.js.

const LIMITES_TIPO_HABITACION = {
  codigoMin: 2,
  codigoMax: 10,
  nombre: 80,
  descripcion: 500,
};

// Etapa 2 de tarifas por temporada (HU-92) — ocupación por defecto de un
// tipo nuevo, y el mínimo aceptado (una habitación siempre aloja al menos
// a una persona).
const OCUPACION_BASE_DEFAULT = 2;
const OCUPACION_BASE_MIN = 1;

// Mayúsculas, letras/dígitos/guion — se normaliza a mayúsculas antes de
// validar (ver tiposHabitacion.servicio.js), así que esto solo rechaza
// símbolos no permitidos, no minúsculas sueltas.
const PATRON_CODIGO = /^[A-Z0-9-]+$/;

module.exports = { LIMITES_TIPO_HABITACION, PATRON_CODIGO, OCUPACION_BASE_DEFAULT, OCUPACION_BASE_MIN };
