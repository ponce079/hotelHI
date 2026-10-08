import { ETIQUETA_CAMPO, TEXTO_ACTUALIZAR_FICHA } from "./ficha";

// Aviso de datos que el recepcionista cambió respecto de la ficha del huésped, con la casilla EXPLÍCITA (siempre sin
// tildar al empezar) para guardarlos en la ficha. Sin tildarla, la ficha no se toca: los datos valen solo para esta
// reserva o estadía. Nunca se pisa un dato de la ficha en silencio.
export function ActualizarFicha({ cambiados, marcada, onCambiar, id, className = "" }) {
  if (!cambiados?.length) return null;
  const lista = cambiados.map((c) => ETIQUETA_CAMPO[c] ?? c).join(", ");
  return (
    <div className={`flex flex-col gap-1 rounded-md bg-laton-100 px-2.5 py-2 text-[13px] text-laton-700 ${className}`}>
      <span>Cambiaste datos respecto de la ficha del huésped: {lista}.</span>
      <label className="flex items-center gap-2 font-semibold">
        <input id={id} type="checkbox" checked={Boolean(marcada)} onChange={(e) => onCambiar(e.target.checked)} />
        {TEXTO_ACTUALIZAR_FICHA}
      </label>
    </div>
  );
}
