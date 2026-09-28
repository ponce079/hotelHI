import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearHabitacion, actualizarHabitacion } from "./habitaciones.api";
import { LIMITES_HABITACION } from "./habitaciones.constantes";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";

const VACIO = {
  numero: "",
  tipoHabitacionId: "",
  capacidad: "",
  piso: "",
  equipamiento: "",
  tarifaPorNoche: "",
};

export function HabitacionModal({ habitacion, onClose, onExito }) {
  const editando = Boolean(habitacion);
  const [form, setForm] = useState(
    habitacion
      ? {
          numero: habitacion.numero,
          tipoHabitacionId: String(habitacion.tipoHabitacionId ?? ""),
          capacidad: String(habitacion.capacidad),
          piso: String(habitacion.piso),
          equipamiento: habitacion.equipamiento ?? "",
          tarifaPorNoche: String(habitacion.tarifaPorNoche),
        }
      : VACIO
  );
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  // HU-89: catálogo completo (activos e inactivos) — una habitación cuyo
  // tipo se dio de baja después de asignado tiene que seguir pudiendo
  // editarse sin perder ese valor (regla 4). El filtrado de qué opciones
  // se muestran (activos + el actual aunque esté inactivo) pasa más abajo.
  const { data: tipos } = useQuery({
    queryKey: ["tipos-habitacion", "todos"],
    queryFn: () => listarTiposHabitacion({ activo: "todos" }),
  });
  const opcionesTipo = (tipos ?? []).filter(
    (t) => t.activo || t.id === Number(form.tipoHabitacionId)
  );

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        tipoHabitacionId: Number(form.tipoHabitacionId),
        capacidad: Number(form.capacidad),
        piso: Number(form.piso),
        tarifaPorNoche: Number(form.tarifaPorNoche),
      };
      return editando ? actualizarHabitacion(habitacion.id, payload) : crearHabitacion(payload);
    },
    onSuccess: (guardada) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      onExito(`Habitación ${guardada.numero} ${editando ? "actualizada" : "creada"} correctamente.`);
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo guardar la habitación.";
      if (error?.response?.status === 409) setErrores({ numero: mensaje });
      else setErrores({ general: mensaje });
    },
  });

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => ({ ...actual, [campo]: undefined, general: undefined }));
  }

  function validar() {
    const nuevos = {};
    if (!form.numero.trim()) nuevos.numero = "El número es obligatorio.";
    if (!form.tipoHabitacionId) nuevos.tipoHabitacionId = "Elegí un tipo de habitación.";
    if (!Number.isInteger(Number(form.capacidad)) || Number(form.capacidad) <= 0) nuevos.capacidad = "Ingresá una capacidad mayor a 0.";
    if (!Number.isInteger(Number(form.piso)) || Number(form.piso) < 0) nuevos.piso = "Ingresá un piso mayor o igual a 0.";
    if (!(Number(form.tarifaPorNoche) > 0)) nuevos.tarifaPorNoche = "Ingresá una tarifa mayor a 0.";
    return nuevos;
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    const nuevos = validar();
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal
      titulo={editando ? `Editar habitación ${habitacion.numero}` : "Nueva habitación"}
      subtitulo="Inventario y tarifa de la habitación"
      onClose={onClose}
      ancho="max-w-2xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {errores.general && <p className="sm:col-span-2 text-sm text-error-texto">{errores.general}</p>}
          <Input
            label="Número de habitación *"
            value={form.numero}
            onChange={(e) => cambiar("numero", e.target.value)}
            error={errores.numero}
            maxLength={LIMITES_HABITACION.numero}
            placeholder="ej. 204"
          />
          <Select
            label="Tipo de habitación *"
            value={form.tipoHabitacionId}
            onChange={(e) => cambiar("tipoHabitacionId", e.target.value)}
            error={errores.tipoHabitacionId}
          >
            <option value="">Elegí un tipo…</option>
            {opcionesTipo.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
                {!t.activo ? " (dado de baja)" : ""}
              </option>
            ))}
          </Select>
          <Input
            label="Capacidad *"
            type="number"
            min="1"
            step="1"
            value={form.capacidad}
            onChange={(e) => cambiar("capacidad", e.target.value)}
            error={errores.capacidad}
          />
          <Input
            label="Piso *"
            type="number"
            min="0"
            step="1"
            value={form.piso}
            onChange={(e) => cambiar("piso", e.target.value)}
            error={errores.piso}
          />
          <Input
            label="Tarifa por noche *"
            type="number"
            min="0.01"
            step="0.01"
            value={form.tarifaPorNoche}
            onChange={(e) => cambiar("tarifaPorNoche", e.target.value)}
            error={errores.tarifaPorNoche}
            placeholder="0,00"
          />
          <div className="sm:col-span-2">
            <label className="flex flex-col gap-1.5 font-body text-sm">
              <span className="text-[12px] text-tinta/70">Equipamiento</span>
              <textarea
                rows={4}
                value={form.equipamiento}
                onChange={(e) => cambiar("equipamiento", e.target.value)}
                maxLength={LIMITES_HABITACION.equipamiento}
                placeholder="Cama king, frigobar, escritorio, TV…"
                className="resize-y rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>Cancelar</Button>
          <Button type="submit" icono={Save} cargando={mutacion.isPending}>{editando ? "Guardar cambios" : "Crear habitación"}</Button>
        </div>
      </form>
    </Modal>
  );
}
