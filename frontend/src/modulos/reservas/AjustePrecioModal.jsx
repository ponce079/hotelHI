import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { formatearFechaDdMmAaaa } from "../../lib/fechas";
import { ajustarPrecioReserva } from "./reservas.api";
import { MODO_AJUSTE_PRECIO, MODOS_AJUSTE_PRECIO, MODO_AJUSTE_PRECIO_LABEL, LIMITES_TARIFAS } from "../tarifas/tarifas.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

// Etapa 4B (HU-97) — el gerente elige una o más noches YA congeladas de la
// reserva y les pisa el precio a mano (precio fijo por noche o un
// porcentaje de descuento sobre lo que cada una ya tenía), con motivo
// obligatorio. Mismo patrón que la vista previa automática de
// ReservaWizard.jsx en edición: mientras la selección/modo/valor/motivo son
// válidos, se consulta sola una vista previa (soloPrevia: true) antes de
// que el gerente confirme.
export function AjustePrecioModal({ reserva, onClose, onExito }) {
  const [seleccionadas, setSeleccionadas] = useState(() => new Set());
  const [modo, setModo] = useState(MODO_AJUSTE_PRECIO.PRECIO_FIJO);
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [errorGeneral, setErrorGeneral] = useState("");
  const queryClient = useQueryClient();

  const todasLasNoches = reserva.habitaciones.flatMap((h) =>
    h.reservaNoches.map((n) => ({ ...n, habitacionNumero: h.numero, habitacionTipo: h.tipo }))
  );

  function alternar(nocheId) {
    setErrorGeneral("");
    setSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(nocheId)) siguiente.delete(nocheId);
      else siguiente.add(nocheId);
      return siguiente;
    });
  }

  const nocheIds = [...seleccionadas];
  const valorNumero = Number(valor);
  const valorValido =
    valor !== "" &&
    Number.isFinite(valorNumero) &&
    (modo === MODO_AJUSTE_PRECIO.PRECIO_FIJO ? valorNumero >= 0 : valorNumero > 0 && valorNumero <= 100);
  const motivoValido = motivo.trim().length >= LIMITES_TARIFAS.motivoAjusteMin;
  const formularioCompleto = nocheIds.length > 0 && valorValido && motivoValido;

  const previaQuery = useQuery({
    queryKey: ["reservas", "ajuste-precio-previa", reserva.id, nocheIds.join(","), modo, valor, motivo],
    queryFn: () =>
      ajustarPrecioReserva(reserva.id, { nocheIds, modo, valor: valorNumero, motivo: motivo.trim(), soloPrevia: true }),
    enabled: formularioCompleto,
  });

  const mutacion = useMutation({
    mutationFn: () => ajustarPrecioReserva(reserva.id, { nocheIds, modo, valor: valorNumero, motivo: motivo.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservas", "detalle", String(reserva.id)] });
      onExito(`Precio ajustado en ${nocheIds.length} noche${nocheIds.length === 1 ? "" : "s"}.`);
    },
    onError: (error) => setErrorGeneral(error?.response?.data?.error ?? "No se pudo ajustar el precio."),
  });

  function handleSubmit(evento) {
    evento.preventDefault();
    if (!formularioCompleto) return;
    mutacion.mutate();
  }

  return (
    <Modal titulo="Ajustar precio" subtitulo={`Reserva ${reserva.codigoConfirmacion}`} onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 px-6 py-5">
          {errorGeneral && <p className="text-sm text-error-texto">{errorGeneral}</p>}

          <div>
            <p className="mb-2 text-[12px] text-tinta/70">Noches a ajustar *</p>
            <div className="flex flex-col gap-1.5 rounded-lg border border-borde bg-hueso px-4 py-3">
              {todasLasNoches.map((n) => (
                <label key={n.id} className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={seleccionadas.has(n.id)}
                      onChange={() => alternar(n.id)}
                      className="h-4 w-4 cursor-pointer accent-pino"
                    />
                    {n.habitacionNumero} ({n.habitacionTipo}) · {formatearFechaDdMmAaaa(n.fecha)}
                    {n.ajustada && <span className="text-[11px] text-laton-700"> · ya ajustada</span>}
                  </span>
                  <span className="font-mono">{FORMATO_MONEDA.format(n.precioNoche)}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Modo *"
              value={modo}
              onChange={(e) => {
                setModo(e.target.value);
                setValor("");
              }}
            >
              {MODOS_AJUSTE_PRECIO.map((m) => (
                <option key={m} value={m}>
                  {MODO_AJUSTE_PRECIO_LABEL[m]}
                </option>
              ))}
            </Select>

            {modo === MODO_AJUSTE_PRECIO.PRECIO_FIJO ? (
              <MoneyInput label="Precio nuevo por noche * (0 = cortesía)" value={valor} onChange={setValor} />
            ) : (
              <Input
                label="Descuento (%) *"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="15"
              />
            )}
          </div>

          <div>
            <label className="flex flex-col gap-1.5 font-body text-sm">
              <span className="text-[12px] text-tinta/70">Motivo * (mínimo {LIMITES_TARIFAS.motivoAjusteMin} caracteres)</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={LIMITES_TARIFAS.motivoAjuste}
                rows={3}
                placeholder="Ej: cortesía por reclamo del huésped durante la estadía"
                className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </label>
          </div>

          {formularioCompleto && previaQuery.isLoading && <p className="text-[13px] text-piedra">Calculando vista previa…</p>}
          {formularioCompleto && previaQuery.isError && (
            <p className="text-[12.5px] text-error-texto">
              {previaQuery.error?.response?.data?.error ?? "No se pudo calcular la vista previa."}
            </p>
          )}
          {previaQuery.data && (
            <div className="rounded-lg border border-borde bg-hueso px-5 py-4 text-[13px]">
              <p className="font-semibold">Vista previa</p>
              <p className="mt-1 text-piedra">
                Antes: {FORMATO_MONEDA.format(previaQuery.data.totalAnterior)} · Ahora:{" "}
                {FORMATO_MONEDA.format(previaQuery.data.totalNuevo)} ·{" "}
                {previaQuery.data.diferencia === 0
                  ? "sin diferencia"
                  : `diferencia ${FORMATO_MONEDA.format(previaQuery.data.diferencia)}`}
              </p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icono={Save} cargando={mutacion.isPending} disabled={!formularioCompleto}>
            Confirmar ajuste
          </Button>
        </div>
      </form>
    </Modal>
  );
}
