import { useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Select } from "../../componentes/Select";
import { formatearMonto } from "../../lib/moneda";
import { armarTarjetaParaEnviar, validarTarjeta } from "../garantias/garantias.constantes";
import { TarjetaForm } from "../garantias/TarjetaForm";
import { MEDIOS_GARANTIA, MONTO_GARANTIA } from "./checkIn.constantes";
import { TituloSeccion } from "./TituloSeccion";

const TARJETA_VACIA = { titular: "", numero: "", vencimiento: "", cvv: "" };

// Garantía del check-in: respalda los consumos y daños DURANTE la estadía.
//
// NO es un pago. Con tarjeta de crédito es una PREAUTORIZACIÓN (se retiene el
// monto, no se cobra); en efectivo es un DEPÓSITO en custodia. En el check-out
// se libera, se usa para cubrir el saldo o se devuelve. Antes se registraba como
// un pago real "Garantía" que restaba del saldo sin liberarse nunca.
//
//  - Reserva con tarjeta en garantía (`tarjetaGuardada`): se preautoriza ESA
//    tarjeta, sin volver a pedirla (se puede elegir otra).
//  - Walk-in, o reserva sin tarjeta guardada: se piden los datos de una tarjeta
//    de crédito (viajan una vez al backend, que los valida y descarta) o se
//    recibe el depósito en efectivo.
//  - Débito y transferencia ya no se ofrecen: con débito el dinero sale de la
//    cuenta del huésped y no se puede retener.
//
// El monto es fijo (política del hotel, server-side; MONTO_GARANTIA solo se
// muestra). El número y el CVV viven solo en el estado de esta pantalla.
export function GarantiaFieldset({ garantiaConfirmada, medioGarantia, garantiaTarjeta, tarjetaGuardada, fechaHasta, onCambiar }) {
  const esTarjeta = medioGarantia === "Tarjeta crédito";
  const [tarjeta, setTarjeta] = useState(TARJETA_VACIA);
  const [usarOtra, setUsarOtra] = useState(false);
  const [mostrarErrores, setMostrarErrores] = useState(false);

  const usaGuardada = esTarjeta && Boolean(tarjetaGuardada) && !usarOtra;
  const errores = validarTarjeta(tarjeta, fechaHasta);

  function reiniciar(cambios = {}) {
    setTarjeta(TARJETA_VACIA);
    setMostrarErrores(false);
    onCambiar({ garantiaConfirmada: false, garantiaTarjeta: undefined, ...cambios });
  }

  function elegirMedio(nuevoMedio) {
    // Cambiar de medio invalida lo que ya se había confirmado del otro.
    setUsarOtra(false);
    reiniciar({ medioGarantia: nuevoMedio });
  }

  function confirmarTarjetaNueva() {
    if (Object.keys(errores).length > 0) {
      setMostrarErrores(true);
      return;
    }
    onCambiar({ garantiaConfirmada: true, garantiaTarjeta: armarTarjetaParaEnviar(tarjeta) });
    setTarjeta(TARJETA_VACIA); // lo que se envía queda en garantiaTarjeta; el formulario no conserva nada
  }

  const monto = `$ ${formatearMonto(MONTO_GARANTIA)}`;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-hueso px-5 py-4">
      <TituloSeccion icono={ShieldCheck} tono="laton">
        Validación de pago / garantía
      </TituloSeccion>

      <div className="rounded-md border border-laton-300 bg-laton-100 px-4 py-2.5">
        <p className="text-[11px] uppercase tracking-wide text-laton-700">Garantía requerida (monto fijo)</p>
        <Cifra tamano={22}>{monto}</Cifra>
        <p className="mt-0.5 text-[11.5px] text-laton-700">
          Respalda consumos y daños durante la estadía. No es un pago: no se descuenta del alojamiento.
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
            Confirmo que recibí {monto} en efectivo del huésped como depósito.
            <span className="mt-0.5 block text-[11.5px] text-piedra">
              Queda en custodia, no como un pago: se aplica a los consumos en el check-out y se devuelve lo que sobre.
            </span>
          </span>
        </label>
      )}

      {usaGuardada && (
        <div className="flex flex-col gap-2.5 rounded-md border border-pino-300 bg-pino-100 px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] text-pino-700">
            <CreditCard size={15} />
            Tarjeta en garantía de la reserva:{" "}
            <span className="font-semibold">
              {tarjetaGuardada.marca} ****{tarjetaGuardada.ultimos4}
            </span>
          </p>
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta">
            <input
              type="checkbox"
              checked={garantiaConfirmada}
              onChange={(e) => onCambiar({ garantiaConfirmada: e.target.checked, garantiaTarjeta: undefined })}
              className="mt-0.5 h-4 w-4 cursor-pointer accent-pino"
            />
            <span>
              Confirmo la preautorización de {monto} en esa tarjeta.
              <span className="mt-0.5 block text-[11.5px] text-piedra">
                No se cobra: es una retención que se libera en el check-out (o se usa para cubrir el saldo).
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={() => {
              setUsarOtra(true);
              reiniciar();
            }}
            className="cursor-pointer self-start text-[11.5px] font-semibold text-piedra underline-offset-2 hover:underline"
          >
            Usar otra tarjeta
          </button>
        </div>
      )}

      {esTarjeta && !usaGuardada && (
        <>
          {garantiaConfirmada && garantiaTarjeta ? (
            <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-pino-300 bg-pino-100 px-4 py-2.5">
              <Badge variante="ok">Tarjeta lista</Badge>
              <span className="text-[12px] text-pino-700">
                ****{garantiaTarjeta.numero.slice(-4)} · se preautorizan {monto} al confirmar el check-in
              </span>
              <button
                type="button"
                onClick={() => reiniciar()}
                className="ml-auto cursor-pointer text-[11.5px] font-semibold text-piedra underline-offset-2 hover:underline"
              >
                Cambiar tarjeta
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-md border border-laton-300 bg-laton-100 px-4 py-3">
              <TarjetaForm
                tarjeta={tarjeta}
                errores={errores}
                mostrarErrores={mostrarErrores}
                onChange={(campo, valor) => setTarjeta((t) => ({ ...t, [campo]: valor }))}
              />
              <Button variante="ok" tamano="fila" icono={CreditCard} onClick={confirmarTarjetaNueva}>
                Confirmar tarjeta · {monto}
              </Button>
              {tarjetaGuardada && (
                <button
                  type="button"
                  onClick={() => {
                    setUsarOtra(false);
                    reiniciar();
                  }}
                  className="cursor-pointer self-start text-[11.5px] font-semibold text-piedra underline-offset-2 hover:underline"
                >
                  Usar la tarjeta de la reserva
                </button>
              )}
            </div>
          )}
          <p className="text-[11.5px] text-piedra">
            Pasarela simulada. El número y el código de seguridad no se guardan: solo queda el token, la marca y los
            últimos 4 dígitos. La retención se hace al confirmar el check-in y se libera en el check-out.
          </p>
        </>
      )}
    </div>
  );
}
