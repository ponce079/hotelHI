import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Modal } from "../../componentes/Modal";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Select } from "../../componentes/Select";
import { formatearTimestamp } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { useSesion } from "../../lib/sesion";
import { registrarVerificacion } from "./checkOut.api";
import { LIMITES_VERIFICACION, TIPOS_CARGO_VERIFICACION } from "./checkOut.constantes";

const VACIO = { tipo: "", descripcion: "", monto: "" };

// HU-87 — el recepcionista revisa la habitación y carga lo que encuentra
// (daño, faltante o consumo de minibar que nadie registró). El cargo se
// suma a la cuenta consolidada; `registradoPor` sale de la sesión.
//
// `consumosMinibar` son los consumos de Minibar que YA figuran en la cuenta:
// se muestran arriba para que el recepcionista compare contra el minibar
// real antes de cargar uno de más (o de menos).
export function CargoVerificacionCheckoutModal({
  reservaId,
  habitaciones = [],
  consumosMinibar = [],
  onClose,
  onExito,
}) {
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    ...VACIO,
    habitacionId: habitaciones.length === 1 ? String(habitaciones[0].habitacionId) : "",
  });
  const [error, setError] = useState("");

  const mutacion = useMutation({
    mutationFn: () =>
      registrarVerificacion(reservaId, {
        habitacionId: Number(form.habitacionId),
        tipo: form.tipo,
        descripcion: form.descripcion.trim(),
        monto: Number(form.monto),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      onExito("Cargo de verificación registrado.");
    },
    onError: (err) => {
      setError(err?.response?.data?.error ?? "No se pudo registrar el cargo.");
    },
  });

  function guardar() {
    if (!form.habitacionId) return setError("Elegí la habitación que revisaste.");
    if (!form.tipo) return setError("Elegí qué encontraste en la habitación.");
    if (!form.descripcion.trim()) return setError("Describí qué encontraste: queda como respaldo del cargo.");
    if (!(Number(form.monto) > 0)) return setError("El monto del cargo tiene que ser mayor a cero.");
    setError("");
    mutacion.mutate();
  }

  return (
    <Modal
      titulo="Registrar cargo de verificación"
      subtitulo="Daños, faltantes o consumos de minibar sin registrar"
      onClose={mutacion.isPending ? () => {} : onClose}
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <Select
          label="Habitación *"
          value={form.habitacionId}
          onChange={(e) => setForm({ ...form, habitacionId: e.target.value })}
        >
          <option value="">Elegí una habitación</option>
          {habitaciones.map((h) => (
            <option key={h.habitacionId} value={h.habitacionId}>
              {h.numero}
            </option>
          ))}
        </Select>
        <div className="rounded-lg border border-borde bg-hueso px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-piedra">Minibar ya registrado en la cuenta</p>
          {consumosMinibar.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-tinta/70">Ningún consumo de minibar registrado durante la estadía.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-tinta">
              {consumosMinibar.map((c) => (
                <li key={c.id} className="flex justify-between gap-4">
                  <span>{formatearTimestamp(c.fechaHora)}</span>
                  <span className="font-mono">$ {formatearMonto(c.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Select label="Qué se encontró *" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
          <option value="">Seleccionar…</option>
          {TIPOS_CARGO_VERIFICACION.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </Select>

        <label className="flex flex-col gap-1.5 font-body text-sm">
          <span className="text-[12px] text-tinta/70">Descripción *</span>
          <textarea
            rows={3}
            value={form.descripcion}
            maxLength={LIMITES_VERIFICACION.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Espejo del baño roto, falta el control remoto, 2 botellas de agua del minibar…"
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </label>

        <div className="w-55">
          <MoneyInput label="Monto a cargar *" value={form.monto} onChange={(monto) => setForm({ ...form, monto })} />
        </div>

        <p className="text-[12px] text-piedra">
          Lo registra: <span className="font-semibold text-tinta">{usuario}</span>. Un cargo cargado no se puede borrar,
          así que revisá el monto antes de guardar.
        </p>

        {error && (
          <div className="rounded-md bg-error-suave px-4 py-3">
            <p className="text-[12.5px] text-error-texto">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-borde pt-4">
          <Button variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button variante="ok" icono={Check} cargando={mutacion.isPending} onClick={guardar}>
            {mutacion.isPending ? "Guardando…" : "Registrar cargo"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
