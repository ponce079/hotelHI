import { Button } from "../../componentes/Button";
import { formatearMonto } from "../../lib/moneda";

export function ConfirmarAmpliacion({ respuesta, pendiente, onConfirmar }) {
  if (respuesta?.codigo !== "AMPLIACION_OCUPACION_REQUIERE_CONFIRMACION") return null;
  const { detalle } = respuesta;
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-borde bg-hueso p-4">
      <p>La cantidad registrada supera la ocupación reservada.</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>Total anterior</dt>
        <dd>{formatearMonto(detalle.totalAnterior)}</dd>
        <dt>Nuevo total</dt>
        <dd className="font-semibold">{formatearMonto(detalle.totalNuevo)}</dd>
        <dt>Diferencia</dt>
        <dd>{formatearMonto(detalle.diferencia)}</dd>
      </dl>
      {detalle.mensajeAjustePerdido && <p>{detalle.mensajeAjustePerdido}</p>}
      {detalle.mensajeNoReembolsable && <p>{detalle.mensajeNoReembolsable}</p>}
      <Button disabled={pendiente} onClick={() => onConfirmar(detalle.token)}>
        Aceptar nueva cotización y confirmar check-in
      </Button>
    </div>
  );
}
