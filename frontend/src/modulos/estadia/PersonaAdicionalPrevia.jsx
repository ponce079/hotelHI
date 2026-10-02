import { Button } from "../../componentes/Button";
import { formatearPrecio } from "../../lib/moneda";
import { formatearFechaDdMmAaaa } from "../../lib/fechas";

// Vista previa obligatoria de la persona adicional (supera la ocupación registrada de la habitación).
export function PersonaAdicionalPrevia({ vista, nombre, pendiente = false, onConfirmar, onCancelar }) {
  const conCargo = vista.noches.filter((n) => n.diferencia > 0);
  const iguales = conCargo.length > 0 && conCargo.every((n) => n.diferencia === conCargo[0].diferencia);
  return (
    <div className="space-y-4 p-5">
      <p className="text-sm">
        Con {nombre || "esta persona"} la habitación {vista.numero} pasa de{" "}
        {vista.ocupacionActual.adultos + vista.ocupacionActual.menores} a{" "}
        {vista.ocupacionNueva.adultos + vista.ocupacionNueva.menores} personas. Ingresa ahora como alojada.
      </p>
      <div className="rounded border border-laton-300 bg-laton-100 p-3 text-sm text-laton-700">
        {vista.categoria === "menor" ? (
          <p>Menor sin cargo.</p>
        ) : conCargo.length === 0 ? (
          <p>Dentro de la ocupación base: no se genera cargo.</p>
        ) : iguales ? (
          <p>
            +{formatearPrecio(conCargo[0].diferencia)} por noche × {conCargo.length}{" "}
            {conCargo.length === 1 ? "noche" : "noches"} = <strong>{formatearPrecio(vista.total)}</strong>. Se carga en
            la cuenta de la habitación como «Persona adicional».
          </p>
        ) : (
          <>
            <p>
              Total <strong>{formatearPrecio(vista.total)}</strong>. Se carga en la cuenta de la habitación como
              «Persona adicional».
            </p>
            <ul className="mt-2 space-y-0.5">
              {vista.noches.map((n) => (
                <li key={n.fecha}>
                  Noche del {formatearFechaDdMmAaaa(n.fecha)}: +{formatearPrecio(n.diferencia)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="text-xs text-piedra">
        El precio de la reserva no se recalcula: el cargo va a la cuenta de la habitación.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variante="secundario" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" cargando={pendiente} onClick={onConfirmar}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
