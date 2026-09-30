import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Calculator, Check } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { useSesion } from "../../lib/sesion";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { listarTemporadas } from "./tarifas.api";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";
import { calcularVistaPreviaLote, confirmarLote } from "./tarifas.api";
import { LIMITES_TARIFAS, NIVEL_TEMPORADA_LABEL } from "./tarifas.constantes";

const VACIO = { porcentaje: "", vigenteDesde: "", temporadaIds: [], tipoHabitacionIds: [], motivo: "" };

// Alcance / vista previa / confirmar (HU-93) — la vista previa y la
// confirmación pegan al MISMO endpoint de cálculo (calcularCeldas en el
// backend), así que lo que se ve acá es exactamente lo que se va a crear:
// no hay drift entre lo que el usuario aprobó y lo que quedó guardado.
export function ActualizacionMasivaWizard({ onClose, onExito }) {
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const hoy = hoyEnHoraLocal();
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [vistaPrevia, setVistaPrevia] = useState(null);

  const { data: temporadas } = useQuery({
    queryKey: ["tarifas", "temporadas", "activas"],
    queryFn: () => listarTemporadas({ activo: "true" }),
  });
  const { data: tipos } = useQuery({
    queryKey: ["tipos-habitacion", "activos"],
    queryFn: () => listarTiposHabitacion({ activo: "true" }),
  });

  function alcancePayload() {
    return {
      porcentaje: Number(form.porcentaje),
      vigenteDesde: form.vigenteDesde,
      temporadaIds: form.temporadaIds,
      tipoHabitacionIds: form.tipoHabitacionIds,
    };
  }

  const mutacionPrevia = useMutation({
    mutationFn: () => calcularVistaPreviaLote(alcancePayload()),
    onSuccess: (resultado) => {
      setVistaPrevia(resultado);
      setErrores({});
    },
    onError: (error) => setErrores({ general: error?.response?.data?.error ?? "No se pudo calcular la vista previa." }),
  });

  const mutacionConfirmar = useMutation({
    mutationFn: () => confirmarLote({ ...alcancePayload(), motivo: form.motivo, usuario }),
    onSuccess: (lote) => {
      queryClient.invalidateQueries({ queryKey: ["tarifas", "lotes"] });
      queryClient.invalidateQueries({ queryKey: ["tarifas", "precios"] });
      onExito(`Lote ${lote.numero} confirmado — ${lote.tarifas?.length ?? 0} tarifa(s) actualizada(s).`);
    },
    onError: (error) => setErrores({ general: error?.response?.data?.error ?? "No se pudo confirmar la actualización." }),
  });

  function alternarId(campo, id) {
    setForm((f) => {
      const lista = f[campo].includes(id) ? f[campo].filter((x) => x !== id) : [...f[campo], id];
      return { ...f, [campo]: lista };
    });
  }

  function validarAlcance() {
    const nuevos = {};
    const porcentaje = Number(form.porcentaje);
    if (!Number.isFinite(porcentaje) || porcentaje === 0) nuevos.porcentaje = "Tiene que ser un número distinto de 0.";
    if (!form.vigenteDesde) nuevos.vigenteDesde = "Obligatoria.";
    else if (form.vigenteDesde < hoy) nuevos.vigenteDesde = "No puede ser anterior a hoy.";
    return nuevos;
  }

  function calcular() {
    const nuevos = validarAlcance();
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    setErrores({});
    mutacionPrevia.mutate();
  }

  function confirmar() {
    if (!form.motivo.trim()) {
      setErrores((e) => ({ ...e, motivo: "El motivo es obligatorio." }));
      return;
    }
    mutacionConfirmar.mutate();
  }

  const puedeConfirmar = vistaPrevia && vistaPrevia.conflictos.length === 0 && vistaPrevia.normales.length > 0;

  return (
    <Modal titulo="Actualización masiva de tarifas" subtitulo="Aplica un % a la tarifa vigente de cada celda del alcance (HU-93)" onClose={onClose} ancho="max-w-2xl">
      <div className="flex flex-col gap-4 px-6 py-5">
        {errores.general && <p className="text-sm text-error-texto">{errores.general}</p>}

        {!vistaPrevia ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Porcentaje *"
                type="number"
                step="0.5"
                placeholder="ej. 8 (aumento) o -5 (descuento)"
                value={form.porcentaje}
                onChange={(e) => setForm((f) => ({ ...f, porcentaje: e.target.value }))}
                error={errores.porcentaje}
              />
              <Input
                label="Vigente desde *"
                type="date"
                min={hoy}
                value={form.vigenteDesde}
                onChange={(e) => setForm((f) => ({ ...f, vigenteDesde: e.target.value }))}
                error={errores.vigenteDesde}
              />
            </div>

            <div>
              <p className="mb-1.5 text-[12px] text-tinta/70">Temporadas (vacío = todas las activas)</p>
              <div className="flex flex-wrap gap-2">
                {(temporadas ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => alternarId("temporadaIds", t.id)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] ${
                      form.temporadaIds.includes(t.id) ? "border-pino bg-pino-100 text-pino-700" : "border-borde text-tinta/70 hover:bg-hueso"
                    }`}
                  >
                    {t.nombre} <span className="text-[10.5px] text-piedra">({NIVEL_TEMPORADA_LABEL[t.nivel] ?? t.nivel})</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] text-tinta/70">Tipos de habitación (vacío = todos los activos)</p>
              <div className="flex flex-wrap gap-2">
                {(tipos ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => alternarId("tipoHabitacionIds", t.id)}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[12px] ${
                      form.tipoHabitacionIds.includes(t.id) ? "border-pino bg-pino-100 text-pino-700" : "border-borde text-tinta/70 hover:bg-hueso"
                    }`}
                  >
                    {t.nombre}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-borde pt-4">
              <Button type="button" variante="secundario" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="button" icono={Calculator} cargando={mutacionPrevia.isPending} onClick={calcular}>
                Calcular vista previa
              </Button>
            </div>
          </>
        ) : (
          <>
            {vistaPrevia.conflictos.length > 0 && (
              <div className="rounded-md border border-error bg-error-suave p-3 text-[12.5px] text-error-texto">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={14} /> {vistaPrevia.conflictos.length} celda(s) en conflicto — ya existe una tarifa con esa fecha de
                  vigencia. Hay que sacarlas del alcance o elegir otra fecha antes de poder confirmar.
                </p>
                <ul className="mt-1.5 list-disc pl-5">
                  {vistaPrevia.conflictos.map((c, i) => (
                    <li key={i}>{c.tipoNombre} / {c.temporadaNombre}</li>
                  ))}
                </ul>
              </div>
            )}
            {vistaPrevia.omitidas.length > 0 && (
              <div className="rounded-md border border-borde bg-hueso p-3 text-[12.5px] text-tinta/70">
                <p className="font-semibold">{vistaPrevia.omitidas.length} celda(s) omitida(s) — sin tarifa vigente a esa fecha, no se tocan.</p>
                <ul className="mt-1.5 list-disc pl-5">
                  {vistaPrevia.omitidas.map((c, i) => (
                    <li key={i}>{c.tipoNombre} / {c.temporadaNombre}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-borde">
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-borde bg-hueso text-[11px] text-piedra">
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Temporada</th>
                    <th className="px-3 py-2">Precio base</th>
                    <th className="px-3 py-2">Adicional adulto</th>
                  </tr>
                </thead>
                <tbody>
                  {vistaPrevia.normales.map((c, i) => (
                    <tr key={i} className="border-b border-borde last:border-0">
                      <td className="px-3 py-2">{c.tipoNombre}</td>
                      <td className="px-3 py-2">{c.temporadaNombre}</td>
                      <td className="px-3 py-2 font-mono">
                        $ {formatearMonto(c.precioBaseActual)} → <span className="font-semibold">$ {formatearMonto(c.precioBaseNuevo)}</span>
                      </td>
                      <td className="px-3 py-2 font-mono">
                        $ {formatearMonto(c.adicionalActual)} → <span className="font-semibold">$ {formatearMonto(c.adicionalNuevo)}</span>
                      </td>
                    </tr>
                  ))}
                  {vistaPrevia.normales.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-piedra">
                        Ninguna celda del alcance tiene tarifa vigente para actualizar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <label className="flex flex-col gap-1.5 font-body text-sm">
              <span className="text-[12px] text-tinta/70">Motivo *</span>
              <textarea
                rows={2}
                value={form.motivo}
                onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                maxLength={LIMITES_TARIFAS.motivoLote}
                placeholder="ej. Ajuste de temporada 2027 por inflación"
                className="rounded-md border border-borde px-3 py-2 text-[13px]"
              />
              {errores.motivo && <span className="text-[11.5px] text-error-texto">{errores.motivo}</span>}
            </label>

            <div className="flex justify-end gap-2 border-t border-borde pt-4">
              <Button type="button" variante="secundario" icono={ArrowLeft} onClick={() => setVistaPrevia(null)}>
                Volver
              </Button>
              <Button type="button" icono={Check} disabled={!puedeConfirmar} cargando={mutacionConfirmar.isPending} onClick={confirmar}>
                Confirmar actualización
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
