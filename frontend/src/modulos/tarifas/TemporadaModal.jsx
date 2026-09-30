import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { useSesion } from "../../lib/sesion";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { crearTemporada, actualizarTemporada } from "./tarifas.api";
import { NIVELES_TEMPORADA, NIVEL_TEMPORADA_LABEL, LIMITES_TARIFAS } from "./tarifas.constantes";

function soloFecha(valorISO) {
  return valorISO ? String(valorISO).slice(0, 10) : "";
}

const VACIO = { nombre: "", nivel: "BAJA", fechaDesde: "", fechaHasta: "", estadiaMinima: "", cierreLlegada: false };

// Regla 4 — si fechaDesde ya pasó, no se puede tocar; si fechaHasta ya
// pasó, la temporada entera queda de solo lectura. Se calcula en el
// frontend para deshabilitar los campos correctos y mostrar por qué —
// el backend vuelve a validar esto igual, esto es solo UX.
export function TemporadaModal({ temporada, onClose, onExito }) {
  const editando = Boolean(temporada);
  const esBase = editando ? temporada.nivel === "BASE" : false;
  const { usuario } = useSesion();
  const hoy = hoyEnHoraLocal();
  const fechaDesdeYaPaso = editando && !esBase && soloFecha(temporada.fechaDesde) < hoy;
  const fechaHastaYaPaso = editando && !esBase && soloFecha(temporada.fechaHasta) < hoy;

  const [form, setForm] = useState(
    temporada
      ? {
          nombre: temporada.nombre,
          nivel: temporada.nivel,
          fechaDesde: soloFecha(temporada.fechaDesde),
          fechaHasta: soloFecha(temporada.fechaHasta),
          estadiaMinima: temporada.estadiaMinima ? String(temporada.estadiaMinima) : "",
          cierreLlegada: temporada.cierreLlegada,
        }
      : VACIO
  );
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = {
        nombre: form.nombre,
        nivel: form.nivel,
        ...(esBase ? {} : { fechaDesde: form.fechaDesde, fechaHasta: form.fechaHasta }),
        estadiaMinima: form.estadiaMinima || undefined,
        cierreLlegada: form.cierreLlegada,
        usuario,
      };
      return editando ? actualizarTemporada(temporada.id, payload) : crearTemporada(payload);
    },
    onSuccess: (guardada) => {
      queryClient.invalidateQueries({ queryKey: ["tarifas", "temporadas"] });
      onExito(`Temporada "${guardada.nombre}" ${editando ? "actualizada" : "creada"} correctamente.`);
    },
    onError: (error) => {
      setErrores({ general: error?.response?.data?.error ?? "No se pudo guardar la temporada." });
    },
  });

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, general: undefined }));
  }

  function validar() {
    const nuevos = {};
    if (!form.nombre.trim()) nuevos.nombre = "El nombre es obligatorio.";
    if (!esBase) {
      if (!form.fechaDesde) nuevos.fechaDesde = "La fecha de inicio es obligatoria.";
      if (!form.fechaHasta) nuevos.fechaHasta = "La fecha de fin es obligatoria.";
      if (form.fechaDesde && form.fechaHasta && form.fechaHasta < form.fechaDesde) {
        nuevos.fechaHasta = "No puede ser anterior a la fecha de inicio.";
      }
    }
    return nuevos;
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    if (fechaHastaYaPaso) return;
    const nuevos = validar();
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal
      titulo={editando ? `Editar temporada "${temporada.nombre}"` : "Nueva temporada"}
      subtitulo="Rango de fechas y nivel de demanda"
      onClose={onClose}
      ancho="max-w-xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {errores.general && <p className="sm:col-span-2 text-sm text-error-texto">{errores.general}</p>}
          {fechaHastaYaPaso && (
            <p className="sm:col-span-2 rounded-md bg-hueso px-3 py-2 text-[12.5px] text-piedra">
              Esta temporada ya terminó ({soloFecha(temporada.fechaHasta)}) — queda de solo lectura.
            </p>
          )}
          {fechaDesdeYaPaso && !fechaHastaYaPaso && (
            <p className="sm:col-span-2 rounded-md bg-hueso px-3 py-2 text-[12.5px] text-piedra">
              Ya empezó el {soloFecha(temporada.fechaDesde)} — esa fecha no se puede modificar, pero el resto sí.
            </p>
          )}
          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
            error={errores.nombre}
            maxLength={LIMITES_TARIFAS.nombreTemporada}
            disabled={fechaHastaYaPaso}
          />
          <Select label="Nivel *" value={form.nivel} onChange={(e) => cambiar("nivel", e.target.value)} disabled={editando}>
            {NIVELES_TEMPORADA.filter((n) => n !== "BASE" || esBase).map((n) => (
              <option key={n} value={n}>
                {NIVEL_TEMPORADA_LABEL[n]}
              </option>
            ))}
          </Select>
          {!esBase && (
            <>
              <Input
                label="Desde *"
                type="date"
                value={form.fechaDesde}
                onChange={(e) => cambiar("fechaDesde", e.target.value)}
                error={errores.fechaDesde}
                disabled={fechaDesdeYaPaso || fechaHastaYaPaso}
              />
              <Input
                label="Hasta *"
                type="date"
                value={form.fechaHasta}
                onChange={(e) => cambiar("fechaHasta", e.target.value)}
                error={errores.fechaHasta}
                disabled={fechaHastaYaPaso}
              />
            </>
          )}
          <Input
            label="Estadía mínima (noches)"
            type="number"
            min="1"
            step="1"
            value={form.estadiaMinima}
            onChange={(e) => cambiar("estadiaMinima", e.target.value)}
            placeholder="Sin mínimo"
            disabled={fechaHastaYaPaso}
          />
          <label className="flex items-center gap-2 pt-6 text-sm text-tinta">
            <input
              type="checkbox"
              checked={form.cierreLlegada}
              onChange={(e) => cambiar("cierreLlegada", e.target.checked)}
              disabled={fechaHastaYaPaso}
            />
            Cierre a llegadas
          </label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          {!fechaHastaYaPaso && (
            <Button type="submit" icono={Save} cargando={mutacion.isPending}>
              {editando ? "Guardar cambios" : "Crear temporada"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
