import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useSesion } from "../../lib/sesion";
import { Button } from "../../componentes/Button";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { activa, esMenorDeEdad, fechaISO } from "./estadiaUtils";

// Mover a una persona alojada a otra habitación de la MISMA reserva: con motivo, respetando la
// capacidad y un titular por habitación (si se mueve al titular, se elige quién queda en su lugar).
export function MoverHabitacion({ persona, reserva, personas = [], onClose, onMovida }) {
  const { usuario } = useSesion();
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [nuevoTitularId, setNuevoTitularId] = useState("");
  const [intento, setIntento] = useState(false);
  const origen = activa(persona)?.habitacionId;
  const activas = personas.filter((p) => ["Previsto", "Alojado"].includes(p.estado));
  const enHabitacion = (habitacionId) => activas.filter((p) => activa(p)?.habitacionId === habitacionId);
  const quedan = enHabitacion(origen).filter((p) => p.id !== persona.id);
  const pideTitular = Boolean(persona.esTitular && quedan.length);
  const candidatos = quedan.filter(
    (p) => fechaISO(p.fechaNacimiento) && !esMenorDeEdad(p.fechaNacimiento, p.fechaDesde),
  );
  const opciones = reserva.habitaciones.filter((h) => h.id !== origen);
  const errores = {};
  if (!destino) errores.destino = "Elegí la habitación de destino.";
  if (!motivo.trim()) errores.motivo = "Indicá el motivo del cambio de habitación.";
  if (pideTitular && !nuevoTitularId)
    errores.nuevoTitularId = "Elegí quién queda como titular de la habitación que deja.";
  const mutacion = useMutation({
    mutationFn: () =>
      api.post(`/estadia/${reserva.id}/ocupantes/${persona.id}/mover`, {
        habitacionId: Number(destino),
        motivo: motivo.trim(),
        ...(pideTitular ? { nuevoTitularId: Number(nuevoTitularId) } : {}),
        operador: usuario,
      }),
    onSuccess: () => onMovida?.(),
  });
  const visible = (campo) => (intento ? errores[campo] : undefined);
  return (
    <form
      noValidate
      className="space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setIntento(true);
        if (Object.keys(errores).length || mutacion.isPending) return;
        mutacion.mutate();
      }}
    >
      <p className="text-sm">
        {persona.nombre} {persona.apellido} · hoy en la habitación{" "}
        {reserva.habitaciones.find((h) => h.id === origen)?.numero ?? "—"}. Solo se puede mover a otra habitación de
        esta reserva.
      </p>
      <Select
        label="Habitación de destino *"
        name="destino"
        error={visible("destino")}
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
      >
        <option value="">Elegí la habitación</option>
        {opciones.map((h) => {
          const ocupadas = enHabitacion(h.id).length;
          return (
            <option key={h.id} value={h.id} disabled={ocupadas >= h.capacidad}>
              Habitación {h.numero} · {ocupadas} de {h.capacidad}
              {ocupadas >= h.capacidad ? " · completa" : ""}
            </option>
          );
        })}
      </Select>
      {pideTitular && (
        <Select
          label="Nuevo titular de la habitación que deja *"
          name="nuevoTitularId"
          error={visible("nuevoTitularId")}
          value={nuevoTitularId}
          onChange={(e) => setNuevoTitularId(e.target.value)}
        >
          <option value="">Elegí quién queda como titular</option>
          {candidatos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.apellido}
            </option>
          ))}
        </Select>
      )}
      <p className="rounded border border-laton-300 bg-laton-100 p-3 text-sm text-laton-700">
        El precio de la estadía no se recalcula por este cambio.
      </p>
      <Input
        label="Motivo *"
        name="motivo"
        error={visible("motivo")}
        value={motivo}
        maxLength={500}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {mutacion.isError && (
        <p role="alert" className="text-error-texto">
          {mutacion.error?.response?.data?.error || "No se pudo mover a la persona."}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variante="secundario" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" cargando={mutacion.isPending}>
          Mover
        </Button>
      </div>
    </form>
  );
}
