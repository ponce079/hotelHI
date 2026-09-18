import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearOrdenMantenimiento } from "./habitaciones.api";
import {
  CANALES_NOTIFICACION,
  LIMITES_HABITACION,
  TIPOS_TAREA_MANTENIMIENTO,
} from "./habitaciones.constantes";

const VACIO = {
  tipoTarea: "Correctivo",
  responsable: "",
  urgente: false,
  destinatarioArea: "Mantenimiento",
  canal: "Interno",
  mensaje: "",
};

export function MantenimientoModal({ habitacion, onClose, onExito }) {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => crearOrdenMantenimiento(habitacion.id, form),
    onSuccess: ({ orden, notificacion }) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
      queryClient.invalidateQueries({ queryKey: ["notificaciones-mantenimiento"] });
      onExito(
        `Orden ${orden.tipoTarea.toLowerCase()} creada para la habitación ${habitacion.numero}.${
          notificacion ? " Se envió la notificación urgente." : ""
        }`
      );
    },
    onError: (error) => setErrores({ general: error?.response?.data?.error ?? "No se pudo crear la orden." }),
  });

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores({});
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    const nuevos = {};
    if (!form.responsable.trim()) nuevos.responsable = "El responsable es obligatorio.";
    if (form.urgente && !form.destinatarioArea.trim()) nuevos.destinatarioArea = "El área destino es obligatoria.";
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
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
              <span className="mt-0.5 block text-xs text-piedra">Genera y registra una notificación automática al confirmar.</span>
            </span>
          </label>

          {form.urgente && (
            <>
              <Input
                label="Área destinataria *"
                value={form.destinatarioArea}
                onChange={(e) => cambiar("destinatarioArea", e.target.value)}
                error={errores.destinatarioArea}
                maxLength={LIMITES_HABITACION.responsable}
              />
              <Select label="Canal *" value={form.canal} onChange={(e) => cambiar("canal", e.target.value)}>
                {CANALES_NOTIFICACION.map((canal) => <option key={canal} value={canal}>{canal}</option>)}
              </Select>
              <label className="sm:col-span-2 flex flex-col gap-1.5 font-body text-sm">
                <span className="text-[12px] text-tinta/70">Mensaje</span>
                <textarea
                  rows={3}
                  value={form.mensaje}
                  onChange={(e) => cambiar("mensaje", e.target.value)}
                  maxLength={LIMITES_HABITACION.mensaje}
                  placeholder="Opcional. Si queda vacío se genera un mensaje automático."
                  className="resize-y rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
                />
              </label>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>Cancelar</Button>
          <Button type="submit" icono={Save} cargando={mutacion.isPending}>Crear orden</Button>
        </div>
      </form>
    </Modal>
  );
}
