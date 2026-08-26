import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { crearTipoMovimiento } from "./tiposMovimiento.api";
import { DESCRIPCION_MAX_LENGTH } from "./tiposMovimiento.constantes";
import { useToast } from "../../lib/useToast";

const CARACTERES_INVALIDOS_DESCRIPCION = /[^\p{L}\p{N}\s]/gu;

const VACIO = { descripcion: "", tipo: "" };

export function TipoMovimientoForm() {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: crearTipoMovimiento,
    onSuccess: (tipoMovimiento) => {
      queryClient.invalidateQueries({ queryKey: ["tipos-movimiento"] });
      setForm(VACIO);
      setErrores({});
      mostrarToast(`Tipo de movimiento "${tipoMovimiento.descripcion}" guardado exitosamente.`);
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo crear el tipo de movimiento.";
      if (error?.response?.status === 409) {
        setErrores({ descripcion: mensaje });
      } else {
        setErrores({ general: mensaje });
      }
    },
  });

  function validar() {
    const nuevosErrores = {};
    if (!form.descripcion.trim()) nuevosErrores.descripcion = "La descripción es obligatoria.";
    if (!form.tipo) nuevosErrores.tipo = "Elegí un tipo.";
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
      <h2 className="font-heading text-lg font-semibold">Nuevo tipo de movimiento</h2>

      {errores.general && <p className="text-sm text-error">{errores.general}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Descripción *"
          value={form.descripcion}
          onChange={(e) =>
            setForm({
              ...form,
              descripcion: e.target.value.toUpperCase().replace(CARACTERES_INVALIDOS_DESCRIPCION, ""),
            })
          }
          error={errores.descripcion}
          placeholder="ej. Entrada por Donación"
          maxLength={DESCRIPCION_MAX_LENGTH}
        />
        <div>
          <label className="mb-1.5 flex flex-col gap-1.5 text-sm">
            <span className="text-[12px] text-tinta/70">Tipo *</span>
          </label>
          <div className="inline-flex overflow-hidden rounded-full border border-borde">
            <button
              type="button"
              onClick={() => setForm({ ...form, tipo: "E" })}
              className={`cursor-pointer whitespace-nowrap px-4 py-2 text-sm ${
                form.tipo === "E" ? "bg-pino text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
              }`}
            >
              E — suma stock
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, tipo: "S" })}
              className={`cursor-pointer whitespace-nowrap border-l border-borde px-4 py-2 text-sm ${
                form.tipo === "S" ? "bg-pino text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
              }`}
            >
              S — resta stock
            </button>
          </div>
          {errores.tipo && <p className="mt-1 text-xs text-error">{errores.tipo}</p>}
        </div>
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        <Plus size={16} /> {mutacion.isPending ? "Guardando…" : "Guardar"}
      </Button>

      <Toast mensaje={toast} />
    </form>
  );
}
