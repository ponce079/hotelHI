import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { crearDeposito } from "./depositos.api";

const VACIO = { nombre: "", ubicacion: "", responsable: "" };

export function DepositoForm() {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: crearDeposito,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["depositos"] });
      setForm(VACIO);
      setErrores({});
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo crear el depósito.";
      if (error?.response?.status === 409) {
        setErrores({ nombre: mensaje });
      } else {
        setErrores({ general: mensaje });
      }
    },
  });

  function validar() {
    const nuevosErrores = {};
    if (!form.nombre.trim()) nuevosErrores.nombre = "El nombre es obligatorio.";
    if (!form.ubicacion.trim()) nuevosErrores.ubicacion = "La ubicación es obligatoria.";
    if (!form.responsable.trim()) nuevosErrores.responsable = "El responsable es obligatorio.";
    return nuevosErrores;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    mutacion.mutate(form);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-5">
      <h2 className="font-display text-lg font-semibold">Nuevo depósito</h2>

      {errores.general && <p className="text-sm text-error">{errores.general}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input
          label="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          error={errores.nombre}
          placeholder="Depósito Central"
        />
        <Input
          label="Ubicación"
          value={form.ubicacion}
          onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
          error={errores.ubicacion}
          placeholder="Subsuelo"
        />
        <Input
          label="Responsable"
          value={form.responsable}
          onChange={(e) => setForm({ ...form, responsable: e.target.value })}
          error={errores.responsable}
          placeholder="Encargado de Depósito"
        />
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        <Plus size={16} /> {mutacion.isPending ? "Guardando…" : "Dar de alta"}
      </Button>
    </form>
  );
}
