import { RotateCw } from "lucide-react";
import { Boton } from "./Boton";
import { MensajeError } from "./MensajeError";
import { CODIGO_ERROR } from "../ecommerce.constantes";

// Errores que se pueden reintentar con el mismo pedido (sin respuesta
// definitiva del servidor).
const REINTENTABLES = [CODIGO_ERROR.ERROR_RED, CODIGO_ERROR.ERROR_INTERNO, CODIGO_ERROR.DEMASIADOS_INTENTOS];

export function esReintentable(error) {
  return REINTENTABLES.includes(error?.codigo);
}

// MensajeError (sin cambios) + "Reintentar" cuando el error es reintentable
// o cuando la pantalla pide mostrarlo siempre (siempreReintentar).
export function ErrorConReintento({ error, onReintentar, reintentando = false, siempreReintentar = false, titulo }) {
  if (!error) return null;
  return (
    <div className="ec-error-reintento">
      <MensajeError error={error} titulo={titulo} />
      {onReintentar && (siempreReintentar || esReintentable(error)) && (
        <Boton variante="secundario" onClick={onReintentar} disabled={reintentando}>
          <RotateCw size={18} strokeWidth={1.8} aria-hidden="true" /> {reintentando ? "Reintentando…" : "Reintentar"}
        </Boton>
      )}
    </div>
  );
}
