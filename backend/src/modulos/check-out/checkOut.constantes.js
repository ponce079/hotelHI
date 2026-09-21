// Tipos de cargo que puede registrar el recepcionista al verificar la
// habitación en el check-out (HU-87). Mismos valores que documenta
// CargoVerificacionCheckout.tipo en schema.prisma.
const TIPOS_CARGO_VERIFICACION = ['Daño', 'Faltante', 'ConsumoNoRegistrado'];

// Sentinela para persistir "se verificó la habitación y no había nada que
// cobrar" — hasta la re-auditoría del 2026-09-21 este caso vivía solo en
// estado de React (se perdía al recargar la página) y confirmarCheckOut no
// exigía ninguna verificación previa. Reusa la misma tabla
// CargoVerificacionCheckout (con monto=0) en vez de sumar un modelo nuevo:
// no es un tipo que el recepcionista elija en el desplegable de "qué se
// encontró" (eso sigue siendo solo TIPOS_CARGO_VERIFICACION), es el valor
// que manda el botón "Verificación sin novedades".
const TIPO_VERIFICACION_SIN_NOVEDADES = 'SinNovedades';
const DESCRIPCION_VERIFICACION_SIN_NOVEDADES = 'Habitación revisada: sin daños, faltantes ni consumos sin registrar.';

// Estado en el que queda cada habitación al confirmar el check-out (HU-51).
//
// OJO: el backlog dice "pendiente de limpieza", pero ese valor NO existe en
// ESTADOS_HABITACION (habitaciones.constantes.js): los válidos son libre |
// ocupada | mantenimiento | bloqueada | en limpieza. El equivalente real es
// 'en limpieza' — housekeeping lo pasa a 'libre' al terminar (HU-35).
const ESTADO_HABITACION_POST_CHECKOUT = 'en limpieza';

// Notificacion (tabla polimórfica compartida) — HU-52.
const TIPO_NOTIFICACION_HOUSEKEEPING = 'Housekeeping';
const AREA_HOUSEKEEPING = 'Housekeeping';
const CANAL_INTERNO = 'Interno';

const LIMITES_VERIFICACION = { descripcion: 500, registradoPor: 120 };

module.exports = {
  TIPOS_CARGO_VERIFICACION,
  TIPO_VERIFICACION_SIN_NOVEDADES,
  DESCRIPCION_VERIFICACION_SIN_NOVEDADES,
  ESTADO_HABITACION_POST_CHECKOUT,
  TIPO_NOTIFICACION_HOUSEKEEPING,
  AREA_HOUSEKEEPING,
  CANAL_INTERNO,
  LIMITES_VERIFICACION,
};
