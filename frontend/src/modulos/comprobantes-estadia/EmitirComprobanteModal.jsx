import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Receipt, X } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Modal } from "../../componentes/Modal";
import { Select } from "../../componentes/Select";
import { formatearMonto } from "../../lib/moneda";
import { emitirComprobanteEstadia } from "./comprobanteEstadia.api";
import {
  ALICUOTA_IVA_DEFAULT,
  ALICUOTAS_IVA,
  CUIT_REGEX,
  desglosarTotalConIva,
  formatearCuit,
  RAZON_SOCIAL_MAX_LENGTH,
} from "./comprobanteEstadia.constantes";

const moneda = (n) => `$ ${formatearMonto(n)}`;

// HU-53 — emite el comprobante de la estadía por el total de la cuenta.
// HU-55 — opcionalmente a nombre de un tercero (empresa): razón social y
// CUIT, los dos o ninguno.
//
// El total de la cuenta se toma como PRECIO FINAL con IVA incluido (así se
// muestran las tarifas al consumidor); el backend separa neto e IVA. Si el
// equipo decide que las tarifas son netas, cambia acá y en
// crearComprobante, no en el resto del flujo.
export function EmitirComprobanteModal({ reservaId, total, huesped, onClose, onExito }) {
  const queryClient = useQueryClient();
  const [alicuota, setAlicuota] = useState(String(ALICUOTA_IVA_DEFAULT));
  const [aTercero, setATercero] = useState(false);
  const [razonSocial, setRazonSocial] = useState("");
  const [cuit, setCuit] = useState("");
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState("");

  const desglose = desglosarTotalConIva(Number(total), Number(alicuota));

  const mutacion = useMutation({
    mutationFn: () =>
      emitirComprobanteEstadia({
        reservaId: Number(reservaId),
        importeTotal: Number(total),
        alicuotaIVA: Number(alicuota),
        razonSocialTercero: aTercero ? razonSocial.trim() : undefined,
        cuitTercero: aTercero ? cuit : undefined,
      }),
    onSuccess: (comprobante) => {
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      queryClient.invalidateQueries({ queryKey: ["comprobantes-estadia"] });
      onExito(comprobante);
    },
    onError: (err) => {
      setErrorGeneral(err?.response?.data?.error ?? "No se pudo emitir el comprobante.");
    },
  });

  function emitir() {
    const nuevos = {};
    if (aTercero) {
      if (!razonSocial.trim()) nuevos.razonSocial = "Ingresá la razón social.";
      if (!CUIT_REGEX.test(cuit)) nuevos.cuit = "Formato esperado: 00-00000000-0 (11 dígitos).";
    }
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    setErrorGeneral("");
    mutacion.mutate();
  }

  return (
    <Modal
      titulo="Emitir comprobante"
      subtitulo="HU 53 y 55 — comprobante de la estadía, opcionalmente a nombre de un tercero"
      onClose={mutacion.isPending ? () => {} : onClose}
    >
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="rounded-lg border border-borde bg-hueso px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-piedra">Se emite a nombre de</p>
          <p className="mt-0.5 text-[13.5px] font-medium text-tinta">
            {aTercero && razonSocial.trim() ? razonSocial.trim() : (huesped ?? "el huésped")}
          </p>
        </div>

        <div className="w-45">
          <Select label="Alícuota de IVA" value={alicuota} onChange={(e) => setAlicuota(e.target.value)}>
            {ALICUOTAS_IVA.map((a) => (
              <option key={a} value={a}>
                {String(a).replace(".", ",")} %
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-end gap-6 rounded-lg border border-borde bg-white px-5 py-4">
          <div className="flex min-w-50 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-6 text-[12.5px] text-piedra">
              <span>Importe neto</span>
              <span className="font-mono text-[13px] text-tinta">{moneda(desglose.neto)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-6 text-[12.5px] text-piedra">
              <span>IVA {String(alicuota).replace(".", ",")} %</span>
              <span className="font-mono text-[13px] text-tinta">{moneda(desglose.iva)}</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-piedra">Total</p>
            <Cifra tamano={28}>{moneda(desglose.total)}</Cifra>
          </div>
        </div>
        <p className="-mt-2 text-[11.5px] text-piedra">
          El total de la cuenta se toma como precio final con IVA incluido; el sistema separa el neto y el IVA al emitir.
        </p>

        <label className="flex cursor-pointer items-center gap-3 text-[13.5px]">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-pino"
            checked={aTercero}
            onChange={(e) => setATercero(e.target.checked)}
          />
          Facturar a nombre de un tercero (empresa)
        </label>

        {aTercero && (
          <div className="flex flex-col gap-3 rounded-lg border border-laton-300 bg-laton-100 px-4 py-4">
            <Input
              label="Razón social *"
              value={razonSocial}
              maxLength={RAZON_SOCIAL_MAX_LENGTH}
              error={errores.razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Empresa S.A."
            />
            <div className="w-55">
              <Input
                label="CUIT *"
                value={cuit}
                error={errores.cuit}
                onChange={(e) => setCuit(formatearCuit(e.target.value))}
                placeholder="30-12345678-9"
              />
            </div>
          </div>
        )}

        {errorGeneral && (
          <div className="rounded-md bg-error-suave px-4 py-3">
            <p className="text-[12.5px] text-error-texto">{errorGeneral}</p>
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-borde pt-4">
          <Button variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button variante="ok" icono={Receipt} cargando={mutacion.isPending} onClick={emitir}>
            {mutacion.isPending ? "Emitiendo…" : "Emitir comprobante"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
