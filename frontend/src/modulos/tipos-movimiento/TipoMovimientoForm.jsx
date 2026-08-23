import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { crearTipoMovimiento } from "./tiposMovimiento.api";
import { TIPOS_VALIDOS, TIPOS_NOMBRES, DESCRIPCION_MAX_LENGTH } from "./tiposMovimiento.constantes";

const CARACTERES_INVALIDOS_DESCRIPCION = /[^\p{L}\p{N}\s]/gu;

const VACIO = { descripcion: "", tipo: "" };

export function TipoMovimientoForm() {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [toast, setToast] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const mutacion = useMutation({
    mutationFn: crearTipoMovimiento,
    onSuccess: (tipoMovimiento) => {
      queryClient.invalidateQueries({ queryKey: ["tipos-movimiento"] });
      setForm(VACIO);
      setErrores({});
      setToast(`Tipo de movimiento "${tipoMovimiento.descripcion}" guardado exitosamente.`);
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
      <h2 className="font-display text-lg font-semibold">Nuevo tipo de movimiento</h2>

      {errores.general && <p className="text-sm text-error">{errores.general}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Descripción"
          value={form.descripcion}
          onChange={(e) =>
            setForm({
              ...form,
              descripcion: e.target.value.toUpperCase().replace(CARACTERES_INVALIDOS_DESCRIPCION, ""),
            })
          }
          error={errores.descripcion}
          placeholder="ENTRADA POR COMPRA"
          maxLength={DESCRIPCION_MAX_LENGTH}
        />
        <Select
          label="Tipo"
          value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          error={errores.tipo}
        >
          <option value="">Seleccionar…</option>
          {TIPOS_VALIDOS.map((t) => (
            <option key={t} value={t}>
              {TIPOS_NOMBRES[t]}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        <Plus size={16} /> {mutacion.isPending ? "Guardando…" : "Dar de alta"}
      </Button>

      <Toast mensaje={toast} />
    </form>
  );
}
