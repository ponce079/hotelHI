import { useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Select } from "../../componentes/Select";
import { formatearMonto } from "../../lib/moneda";
import { TarjetaSimuladaPanel } from "../pagos-estadia/TarjetaSimuladaPanel";
import { MEDIOS_CON_TARJETA, MEDIOS_GARANTIA } from "./checkIn.constantes";
import { TituloSeccion } from "./TituloSeccion";

// Corrección posterior (pedido explícito 2026-09-25): los 4 medios pasan a
// ser los mismos que ya usa la seña de reserva (HU-88) — Efectivo,
// Transferencia, Tarjeta crédito y Tarjeta débito — y los 4 terminan como un
// PagoEstadia real (concepto Garantía), no solo Efectivo como antes.
// Efectivo/Transferencia siguen pidiendo un monto a mano (el recepcionista
// declara cuánto recibió o transfirió, no necesariamente el total de la
// estadía) — eso YA era así para Efectivo y no se lo saca. Tarjeta sigue
// autorizando `montoAGarantizar` (el total estimado) con la terminal
// simulada, igual que siempre, solo que ahora esa autorización también
// queda como pago real.
export function GarantiaFieldset({ garantiaConfirmada, medioGarantia, montoGarantia, montoAGarantizar, onCambiar }) {
  const esTarjeta = MEDIOS_CON_TARJETA.includes(medioGarantia);
  // Autorización de la tarjeta: estado propio de este fieldset (la
  // referencia en sí viaja al padre vía onCambiar, esto es solo para
  // mostrar el detalle en el badge "Autorizada").
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [referencia, setReferencia] = useState(null);

  function elegirMedio(nuevoMedio) {
    // Cambiar de medio invalida lo que ya se había confirmado del otro: una
    // tarjeta autorizada no tiene que dejar un monto en efectivo
    // "pre-tildado", ni al revés.
    setPanelAbierto(false);
    setReferencia(null);
    onCambiar({ medioGarantia: nuevoMedio, garantiaConfirmada: false, montoGarantia: "", referenciaGarantia: undefined });
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

      {!esTarjeta && (
        <>
          <MoneyInput
            label={medioGarantia === "Transferencia" ? "Monto de la transferencia *" : "Monto recibido en efectivo *"}
            value={montoGarantia}
            onChange={(valor) => onCambiar({ montoGarantia: valor })}
          />
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta">
            <input
              type="checkbox"
              checked={garantiaConfirmada}
              onChange={(e) => onCambiar({ garantiaConfirmada: e.target.checked })}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-pino"
            />
            <span>
              {medioGarantia === "Transferencia"
                ? "Confirmo la transferencia recibida del huésped."
                : "Confirmo que el huésped presentó el monto en efectivo."}
              <span className="mt-0.5 block text-[11.5px] text-piedra">
                El monto queda registrado como un pago real de la estadía — se descuenta solo al momento del check-out.
              </span>
            </span>
          </label>
        </>
      )}

      {esTarjeta && (
        <>
          {garantiaConfirmada && referencia ? (
            <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-pino-300 bg-pino-100 px-4 py-2.5">
              <Badge variante="ok">Autorizada</Badge>
              <span className="text-[12px] text-pino-700">{referencia}</span>
              <button
                type="button"
                onClick={() => {
                  setReferencia(null);
                  onCambiar({ garantiaConfirmada: false, montoGarantia: "", referenciaGarantia: undefined });
                }}
                className="ml-auto cursor-pointer text-[11.5px] font-semibold text-piedra underline-offset-2 hover:underline"
              >
                Cambiar tarjeta
              </button>
            </div>
          ) : panelAbierto ? (
            <TarjetaSimuladaPanel
              tipo={medioGarantia}
              importe={Number(montoAGarantizar) || 0}
              onCancelar={() => setPanelAbierto(false)}
              onAutorizada={(nuevaReferencia) => {
                setReferencia(nuevaReferencia);
                setPanelAbierto(false);
                onCambiar({ garantiaConfirmada: true, montoGarantia: montoAGarantizar, referenciaGarantia: nuevaReferencia });
              }}
            />
          ) : (
            <Button variante="ok" tamano="fila" icono={CreditCard} onClick={() => setPanelAbierto(true)}>
              Autorizar tarjeta{montoAGarantizar ? ` — $ ${formatearMonto(montoAGarantizar)}` : ""}
            </Button>
          )}
          <p className="text-[11.5px] text-piedra">
            Terminal simulada, sin integración real con una pasarela de pago — al autorizar, la garantía queda
            registrada como un pago real de la estadía, igual que Efectivo o Transferencia.
          </p>
        </>
      )}
    </div>
  );
}
