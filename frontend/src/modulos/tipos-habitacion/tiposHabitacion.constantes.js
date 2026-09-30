// Duplicado a mano del backend (tiposHabitacion.constantes.js) — mismo
// criterio que el resto de los módulos con listas fijas/límites.
export const LIMITES_TIPO_HABITACION = {
  codigoMin: 2,
  codigoMax: 10,
  nombre: 80,
  descripcion: 500,
};

export const PATRON_CODIGO = /^[A-Z0-9-]+$/;
