import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearArticulo } from "./articulos.api";
import { UNIDADES_MEDIDA, UNIDADES_MEDIDA_NOMBRES, CATEGORIAS } from "./articulos.constantes";

const VACIO = { nombre: "", unidadMedida: "", categoria: "" };

export function ArticuloForm() {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: crearArticulo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articulos"] });
      setForm(VACIO);
      setErrores({});
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo crear el artículo.";
      // El backend devuelve 409 con el nombre duplicado en el mensaje: se lo mostramos
      // pegado al campo nombre para que el feedback sea inmediato.
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
    if (!form.unidadMedida) nuevosErrores.unidadMedida = "Elegí una unidad de medida.";
    if (!form.categoria) nuevosErrores.categoria = "Elegí una categoría.";
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
      <h2 className="font-display text-lg font-semibold">Nuevo artículo</h2>

      {errores.general && <p className="text-sm text-error">{errores.general}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          error={errores.nombre}
          placeholder="Papel higiénico"
        />
        <Select
          label="Unidad de medida"
          value={form.unidadMedida}
          onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })}
          error={errores.unidadMedida}
        >
          <option value="">Seleccionar…</option>
          {UNIDADES_MEDIDA.map((u) => (
            <option key={u} value={u}>
              {UNIDADES_MEDIDA_NOMBRES[u]}
            </option>
          ))}
        </Select>
        <Select
          label="Categoría"
          value={form.categoria}
          onChange={(e) => setForm({ ...form, categoria: e.target.value })}
          error={errores.categoria}
        >
          <option value="">Seleccionar…</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        <Plus size={16} /> {mutacion.isPending ? "Guardando…" : "Dar de alta"}
      </Button>
    </form>
  );
}
