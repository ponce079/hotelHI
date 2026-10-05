import { CircleAlert } from "lucide-react";
import { CODIGO_ERROR } from "../ecommerce.constantes";
import { formatearPrecio } from "../formato";

// Traduce un error normalizado ({ codigo, mensaje, ...extra }, ver
// ecommerce.api.js) a un texto para el huésped. Qué hace la pantalla en
// cada caso: docs/ecommerce/CONTRATO.md → "Errores".
export function textoDeError(error) {
  if (!error) return "";
  switch (error.codigo) {
    case CODIGO_ERROR.DATOS_INVALIDOS:
      return error.mensaje || "Revisá los datos marcados.";
    case CODIGO_ERROR.NO_ENCONTRADA:
      return "No encontramos una reserva con esos datos. Revisá el código y el email, o contactá a recepción.";
    case CODIGO_ERROR.PRECIO_CAMBIADO:
      return error.totalNuevo != null
        ? `El precio de tu estadía cambió: el total nuevo es ${formatearPrecio(error.totalNuevo)}. Revisalo y confirmá de nuevo.`
        : "El precio de tu estadía cambió. Revisalo y confirmá de nuevo.";
    case CODIGO_ERROR.SIN_DISPONIBILIDAD:
      return "Ya no queda disponibilidad para esta habitación en tus fechas. Elegí otra opción.";
    case CODIGO_ERROR.CLAVE_REUTILIZADA:
      return "Detectamos un envío repetido con datos distintos. Volvé a confirmar.";
    case CODIGO_ERROR.PENALIDAD_CAMBIO:
      if (error.motivo) return error.motivo;
      return error.montoNuevo != null
        ? `El cargo por cancelar cambió: ahora es ${formatearPrecio(error.montoNuevo)}. Revisalo antes de confirmar.`
        : "El cargo por cancelar cambió. Revisalo antes de confirmar.";
    case CODIGO_ERROR.PAGO_RECHAZADO:
      return `La tarjeta fue rechazada${error.motivo ? ` (${error.motivo})` : ""}. Probá con otra tarjeta de crédito.`;
    case CODIGO_ERROR.TARJETA_VENCE_ANTES:
      return "La tarjeta vence antes de la fecha de salida. Usá otra tarjeta de crédito.";
    case CODIGO_ERROR.DEMASIADOS_INTENTOS:
      return "Hiciste demasiados intentos seguidos. Esperá unos minutos y volvé a intentar.";
    case CODIGO_ERROR.ERROR_RED:
      return "No pudimos comunicarnos con el hotel. Revisá tu conexión e intentá de nuevo.";
    case CODIGO_ERROR.ERROR_INTERNO:
    default:
      return "Tuvimos un problema y no pudimos completar la operación. Intentá de nuevo en unos minutos.";
  }
}

export function MensajeError({ error, titulo }) {
  if (!error) return null;
  return (
    <div className="ec-alerta ec-alerta--error" role="alert">
      <CircleAlert size={20} strokeWidth={1.7} aria-hidden="true" />
      <div>
        {titulo && <p className="ec-alerta__titulo">{titulo}</p>}
        <p>{textoDeError(error)}</p>
      </div>
    </div>
  );
}
