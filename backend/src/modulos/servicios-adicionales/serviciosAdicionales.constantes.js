// Servicios Adicionales (HU-61 a HU-64). Lista fija validada en código,
// mismo criterio que habitaciones.constantes.js / reservas.constantes.js —
// duplicada a mano en frontend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js.
const TIPOS_SERVICIO = ["Restaurante", "Spa", "Lavandería", "Minibar"];

// HU-61/HU-64: solo Minibar descuenta stock real de Sprint 1. El tipo de
// movimiento no se pide en el formulario (no tiene sentido que quien
// registra un consumo de minibar tenga que conocer la taxonomía interna de
// movimientos de stock) — se resuelve solo, buscando este tipo por nombre.
// Ya existe en la base real del proyecto (activo, tipo 'S', contexto
// 'NORMAL'); si no existiera, `resolverTipoMovimientoMinibar` cae a
// cualquier otro tipo de Salida normal activo, para no bloquear el consumo
// por un dato de catálogo que un admin todavía no cargó.
const DESCRIPCION_TIPO_MOVIMIENTO_MINIBAR = "Salida por Consumo Interno";

// Sprint 3 — decisión de negocio: el descuento de stock de un consumo de
// Minibar SIEMPRE sale de este depósito fijo, nunca de uno que elija quien
// carga el consumo (a diferencia del resto de Salidas de Stock de Sprint 1,
// donde el depósito sí se elige a mano). Se resuelve por nombre en
// resolverDepositoMinibar (serviciosAdicionales.servicio.js), mismo criterio
// que DESCRIPCION_TIPO_MOVIMIENTO_MINIBAR de arriba.
const DEPOSITO_MINIBAR_NOMBRE = "Minibar";

const LIMITES_SERVICIOS_ADICIONALES = {
  registradoPor: 100,
};

module.exports = {
  TIPOS_SERVICIO,
  DESCRIPCION_TIPO_MOVIMIENTO_MINIBAR,
  DEPOSITO_MINIBAR_NOMBRE,
  LIMITES_SERVICIOS_ADICIONALES,
};
