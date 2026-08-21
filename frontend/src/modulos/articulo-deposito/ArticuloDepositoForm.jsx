import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { habilitarArticuloEnDeposito } from "./articuloDeposito.api";
import { listarArticulos } from "../articulos/articulos.api";
import { listarDepositos } from "../depositos/depositos.api";

const VACIO = { articuloId: "", depositoId: "" };

export function ArticuloDepositoForm() {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const { data: articulos } = useQuery({
    queryKey: ["articulos", "todos"],
    queryFn: () => listarArticulos({ pageSize: 100 }),
  });
  const { data: depositos } = useQuery({
    queryKey: ["depositos"],
    queryFn: listarDepositos,
  });

  const mutacion = useMutation({
    mutationFn: habilitarArticuloEnDeposito,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["articulo-depositos"] });
      setForm(VACIO);
      setErrores({});
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo habilitar el artículo en el depósito.";
      setErrores({ general: mensaje });
    },
  });

  function validar() {
    const nuevosErrores = {};
    if (!form.articuloId) nuevosErrores.articuloId = "Elegí un artículo.";
    if (!form.depositoId) nuevosErrores.depositoId = "Elegí un depósito.";
    return nuevosErrores;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    mutacion.mutate({ articuloId: Number(form.articuloId), depositoId: Number(form.depositoId) });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-5">
      <h2 className="font-display text-lg font-semibold">Habilitar artículo en depósito</h2>

      {errores.general && <p className="text-sm text-error">{errores.general}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Artículo"
          value={form.articuloId}
          onChange={(e) => setForm({ ...form, articuloId: e.target.value })}
          error={errores.articuloId}
        >
          <option value="">Seleccionar…</option>
          {articulos?.items?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigo} — {a.descripcion}
            </option>
          ))}
        </Select>
        <Select
          label="Depósito"
          value={form.depositoId}
          onChange={(e) => setForm({ ...form, depositoId: e.target.value })}
          error={errores.depositoId}
        >
          <option value="">Seleccionar…</option>
          {depositos?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        <Plus size={16} /> {mutacion.isPending ? "Guardando…" : "Habilitar"}
      </Button>
    </form>
  );
}
