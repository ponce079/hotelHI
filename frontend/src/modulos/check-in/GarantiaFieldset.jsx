import { useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Select } from "../../componentes/Select";
import { formatearMonto } from "../../lib/moneda";
import { TarjetaSimuladaPanel } from "../pagos-estadia/TarjetaSimuladaPanel";
import { MEDIOS_GARANTIA, MEDIO_GARANTIA_EFECTIVO } from "./checkIn.constantes";
import { TituloSeccion } from "./TituloSeccion";

export function GarantiaFieldset({ garantiaConfirmada, medioGarantia, montoGarantiaEfectivo, montoAGarantizar, onCambiar }) {
  const esEfectivo = medioGarantia === MEDIO_GARANTIA_EFECTIVO;
  // Autorización de la tarjeta: estado propio de este fieldset (no viaja al
  // backend — acá no se registra ningún PagoEstadia para tarjeta, sigue
  // siendo puramente una confirmación simulada). Lo único que sale hacia
  // afuera es `garantiaConfirmada: true`, recién cuando la terminal
  // simulada la aprueba — antes no hay forma de tildarla a mano.
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [referencia, setReferencia] = useState(null);

  function elegirMedio(nuevoMedio) {
    // Cambiar de medio invalida lo que ya se había confirmado del otro: una
    // tarjeta autorizada no tiene que dejar el efectivo "pre-tildado", ni
    // al revés.
    setPanelAbierto(false);
    setReferencia(null);
    onCambiar({ medioGarantia: nuevoMedio, garantiaConfirmada: false });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-hueso px-5 py-4">
      <TituloSeccion icono={ShieldCheck} tono="laton">
        Validación de pago / garantía
      </TituloSeccion>
      <Select label="Medio de garantía *" value={medioGarantia} onChange={(e) => elegirMedio(e.target.value)}>
        {MEDIOS_GARANTIA.map((medio) => (
          <option key={medio} value={medio}>
            {medio}
          </option>
        ))}
      </Select>

      {esEfectivo && (
        <>
          <MoneyInput
            label="Monto recibido en efectivo *"
            value={montoGarantiaEfectivo}
            onChange={(valor) => onCambiar({ montoGarantiaEfectivo: valor })}
          />
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta">
            <input
              type="checkbox"
              checked={garantiaConfirmada}
              onChange={(e) => onCambiar({ garantiaConfirmada: e.target.checked })}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-pino"
            />
            <span>
              Confirmo que el huésped presentó el monto en efectivo.
              <span className="mt-0.5 block text-[11.5px] text-piedra">
                El monto queda registrado como un pago real de la estadía — se descuenta solo al momento del check-out.
              </span>
            </span>
          </label>
        </>
      )}

      {!esEfectivo && (
        <>
          {garantiaConfirmada && referencia ? (
            <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-pino-300 bg-pino-100 px-4 py-2.5">
              <Badge variante="ok">Autorizada</Badge>
              <span className="text-[12px] text-pino-700">{referencia}</span>
              <button
                type="button"
                onClick={() => {
                  setReferencia(null);
                  onCambiar({ garantiaConfirmada: false });
                }}
                className="ml-auto cursor-pointer text-[11.5px] font-semibold text-piedra underline-offset-2 hover:underline"
              >
                Cambiar tarjeta
              </button>
            </div>
          ) : panelAbierto ? (
            <TarjetaSimuladaPanel
              tipo="Tarjeta crédito"
              importe={Number(montoAGarantizar) || 0}
              onCancelar={() => setPanelAbierto(false)}
              onAutorizada={(nuevaReferencia) => {
                setReferencia(nuevaReferencia);
                setPanelAbierto(false);
                onCambiar({ garantiaConfirmada: true });
              }}
            />
          ) : (
            <Button variante="ok" tamano="fila" icono={CreditCard} onClick={() => setPanelAbierto(true)}>
              Autorizar tarjeta{montoAGarantizar ? ` — $ ${formatearMonto(montoAGarantizar)}` : ""}
            </Button>
          )}
          <p className="text-[11.5px] text-piedra">
            No hay integración real con una pasarela de pago en este sprint — la terminal es simulada y no se cobra
            nada de verdad. Sirve como garantía: no genera ningún pago registrado contra la reserva.
          </p>
        </>
      )}
    </div>
  );
}
