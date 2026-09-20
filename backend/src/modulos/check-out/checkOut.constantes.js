// Tipos de cargo que puede registrar el recepcionista al verificar la
// habitación en el check-out (HU-87). Mismos valores que documenta
// CargoVerificacionCheckout.tipo en schema.prisma.
const TIPOS_CARGO_VERIFICACION = ['Daño', 'Faltante', 'ConsumoNoRegistrado'];

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
  ESTADO_HABITACION_POST_CHECKOUT,
  TIPO_NOTIFICACION_HOUSEKEEPING,
  AREA_HOUSEKEEPING,
  CANAL_INTERNO,
  LIMITES_VERIFICACION,
};
