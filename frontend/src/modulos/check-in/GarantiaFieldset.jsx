import { useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Select } from "../../componentes/Select";
import { formatearMonto } from "../../lib/moneda";
import { TarjetaSimuladaPanel } from "../pagos-estadia/TarjetaSimuladaPanel";
import { MEDIOS_CON_TARJETA, MEDIOS_GARANTIA, MONTO_GARANTIA } from "./checkIn.constantes";
import { TituloSeccion } from "./TituloSeccion";

// Corrección posterior (pedido explícito 2026-09-25): la garantía es un
// depósito de seguridad por daños/faltantes — un monto FIJO (MONTO_GARANTIA)
// igual para todo el hotel, sin relación con el total de la estadía (eso es
// la seña, HU-88). Antes se pedía a mano para Efectivo/Transferencia y se
// autorizaba `reserva.totalEstimadoAlojamiento` completo para tarjeta —
// las dos formas fallaban apenas la reserva ya tenía una seña paga o la
// estadía costaba menos que ese total, porque terminaban registrándose con
// pagoEstadiaServicio.crearPago, que exige no superar el saldo pendiente
// (una regla que no aplica a un depósito ajeno al alojamiento). Ahora los 4
// medios muestran y cobran el mismo monto fijo, sin campo editable.
export function GarantiaFieldset({ garantiaConfirmada, medioGarantia, onCambiar }) {
  const esTarjeta = MEDIOS_CON_TARJETA.includes(medioGarantia);
  // Autorización de la tarjeta: estado propio de este fieldset (la
  // referencia en sí viaja al padre vía onCambiar, esto es solo para
  // mostrar el detalle en el badge "Autorizada").
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [referencia, setReferencia] = useState(null);

  function elegirMedio(nuevoMedio) {
    // Cambiar de medio invalida lo que ya se había confirmado del otro: una
    // tarjeta autorizada no tiene que dejar la casilla de efectivo
    // "pre-tildada", ni al revés.
    setPanelAbierto(false);
    setReferencia(null);
    onCambiar({ medioGarantia: nuevoMedio, garantiaConfirmada: false, referenciaGarantia: undefined });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-hueso px-5 py-4">
      <TituloSeccion icono={ShieldCheck} tono="laton">
        Validación de pago / garantía
      </TituloSeccion>

      <div className="rounded-md border border-laton-300 bg-laton-100 px-4 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-laton-700">Garantía requerida (monto fijo)</p>
        <Cifra tamano={22}>$ {formatearMonto(MONTO_GARANTIA)}</Cifra>
        <p className="mt-0.5 text-[11.5px] text-laton-700">
          Depósito por daños o faltantes — ajeno al total de la estadía, no se descuenta de ahí.
        </p>
      </div>

      <Select label="Medio de garantía *" value={medioGarantia} onChange={(e) => elegirMedio(e.target.value)}>
        {MEDIOS_GARANTIA.map((medio) => (
          <option key={medio} value={medio}>
            {medio}
          </option>
        ))}
      </Select>

      {!esTarjeta && (
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta">
          <input
            type="checkbox"
            checked={garantiaConfirmada}
            onChange={(e) => onCambiar({ garantiaConfirmada: e.target.checked })}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-pino"
          />
          <span>
            {medioGarantia === "Transferencia"
              ? `Confirmo la transferencia de $ ${formatearMonto(MONTO_GARANTIA)} recibida del huésped.`
              : `Confirmo que recibí $ ${formatearMonto(MONTO_GARANTIA)} en efectivo del huésped.`}
            <span className="mt-0.5 block text-[11.5px] text-piedra">
              Queda registrado como un pago real, aparte del alojamiento — se resuelve en el check-out.
            </span>
          </span>
        </label>
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
                  onCambiar({ garantiaConfirmada: false, referenciaGarantia: undefined });
                }}
                className="ml-auto cursor-pointer text-[11.5px] font-semibold text-piedra underline-offset-2 hover:underline"
              >
                Cambiar tarjeta
              </button>
            </div>
          ) : panelAbierto ? (
            <TarjetaSimuladaPanel
              tipo={medioGarantia}
              importe={MONTO_GARANTIA}
              onCancelar={() => setPanelAbierto(false)}
              onAutorizada={(nuevaReferencia) => {
                setReferencia(nuevaReferencia);
                setPanelAbierto(false);
                onCambiar({ garantiaConfirmada: true, referenciaGarantia: nuevaReferencia });
              }}
            />
          ) : (
            <Button variante="ok" tamano="fila" icono={CreditCard} onClick={() => setPanelAbierto(true)}>
              Autorizar tarjeta — $ {formatearMonto(MONTO_GARANTIA)}
            </Button>
          )}
          <p className="text-[11.5px] text-piedra">
            Terminal simulada, sin integración real con una pasarela de pago — al autorizar, la garantía queda
            registrada como un pago real, igual que Efectivo o Transferencia.
          </p>
        </>
      )}
    </div>
  );
}
