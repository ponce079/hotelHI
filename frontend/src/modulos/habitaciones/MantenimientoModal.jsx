import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearOrdenMantenimiento } from "./habitaciones.api";
import { LIMITES_HABITACION, TIPOS_TAREA_MANTENIMIENTO } from "./habitaciones.constantes";

const VACIO = {
  tipoTarea: "Correctivo",
  responsable: "",
  urgente: false,
};

export function MantenimientoModal({ habitacion, onClose, onExito }) {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => crearOrdenMantenimiento(habitacion.id, form),
    onSuccess: (orden) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
      onExito(`Orden ${orden.tipoTarea.toLowerCase()} creada para la habitación ${habitacion.numero}.`);
    },
    onError: (error) => setErrores({ general: error?.response?.data?.error ?? "No se pudo crear la orden." }),
  });

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores({});
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    if (!form.responsable.trim()) {
      setErrores({ responsable: "El responsable es obligatorio." });
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal
      titulo={`Orden de mantenimiento · Hab. ${habitacion.numero}`}
      subtitulo="La habitación pasará a estado En mantenimiento"
      onClose={onClose}
      ancho="max-w-2xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {errores.general && <p className="sm:col-span-2 text-sm text-error-texto">{errores.general}</p>}
          <Select label="Tipo de tarea *" value={form.tipoTarea} onChange={(e) => cambiar("tipoTarea", e.target.value)}>
            {TIPOS_TAREA_MANTENIMIENTO.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
          </Select>
          <Input
            label="Responsable *"
            value={form.responsable}
            onChange={(e) => cambiar("responsable", e.target.value)}
            error={errores.responsable}
            maxLength={LIMITES_HABITACION.responsable}
            placeholder="Nombre o equipo responsable"
          />
          <label className="sm:col-span-2 flex items-start gap-2.5 rounded-md border border-borde bg-hueso px-3.5 py-3 text-sm text-tinta">
            <input
              type="checkbox"
              checked={form.urgente}
              onChange={(e) => cambiar("urgente", e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-borde"
            />
            <span>
              Incidente urgente
              <span className="mt-0.5 block text-xs text-piedra">
                Prioriza la orden y la destaca en el historial de mantenimiento — no envía ningún aviso, mantenimiento se resuelve de palabra.
              </span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>Cancelar</Button>
          <Button type="submit" icono={Save} cargando={mutacion.isPending}>Crear orden</Button>
        </div>
      </form>
    </Modal>
  );
}
