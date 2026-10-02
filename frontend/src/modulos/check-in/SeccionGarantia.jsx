import { GarantiaFieldset } from "./GarantiaFieldset";
import { Tarjeta } from "./ui";
import { formatearPrecio } from "../../lib/moneda";

// "Garantía para consumos": envuelve GarantiaFieldset tal cual (lo define el módulo de
// garantía). Una sola garantía por reserva. Si la reserva tiene seña, una línea informativa.
export function SeccionGarantia({ garantia, dispatch, senia }) {
  const medios = senia?.medios ?? [];
  return (
    <Tarjeta titulo="Garantía para consumos" id="ci-garantia">
      {medios.length > 0 && (
        <p className="mb-3 text-[13.5px] text-piedra">
          Seña registrada en la reserva:{" "}
          {medios.map((m) => m.referencia || `${m.medioPago} · ${formatearPrecio(m.importe)}`).join(" · ")}
        </p>
      )}
      <GarantiaFieldset
        garantiaConfirmada={garantia.garantiaConfirmada}
        medioGarantia={garantia.medioGarantia}
        onCambiar={(cambios) => dispatch({ tipo: "garantia", cambios })}
      />
    </Tarjeta>
  );
}
