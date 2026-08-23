import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { habilitarArticuloEnDeposito } from "./articuloDeposito.api";
import { listarArticulos } from "../articulos/articulos.api";
import { listarDepositos } from "../depositos/depositos.api";

const VACIO = { articuloId: "", depositoIds: [] };

function resumirResultados(resultados) {
  const creadas = resultados.filter((r) => r.estado === "creada").length;
  const yaExistian = resultados.filter((r) => r.estado === "ya_existia").length;

  const partes = [];
  if (creadas > 0) partes.push(`${creadas} habilitación${creadas > 1 ? "es" : ""} creada${creadas > 1 ? "s" : ""}`);
  if (yaExistian > 0) partes.push(`${yaExistian} ya existía${yaExistian > 1 ? "n" : ""}`);
  return partes.length > 0 ? `${partes.join(", ")}.` : "No se realizaron cambios.";
}

export function ArticuloDepositoForm() {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [toast, setToast] = useState("");
  const [busquedaDeposito, setBusquedaDeposito] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["articulo-depositos"] });
      setForm(VACIO);
      setErrores({});
      setBusquedaDeposito("");
      setToast(resumirResultados(data.resultados));
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo habilitar el artículo en los depósitos.";
      setErrores({ general: mensaje });
    },
  });

  function toggleDeposito(id) {
    setForm((f) => ({
      ...f,
      depositoIds: f.depositoIds.includes(id) ? f.depositoIds.filter((x) => x !== id) : [...f.depositoIds, id],
    }));
  }

  const depositosFiltrados =
    depositos?.filter((d) => d.nombre.toLowerCase().includes(busquedaDeposito.toLowerCase())) ?? [];
  const idsFiltrados = depositosFiltrados.map((d) => d.id);
  const todosFiltradosSeleccionados =
    idsFiltrados.length > 0 && idsFiltrados.every((id) => form.depositoIds.includes(id));

  function toggleSeleccionarTodos() {
    setForm((f) => ({
      ...f,
      depositoIds: todosFiltradosSeleccionados
        ? f.depositoIds.filter((id) => !idsFiltrados.includes(id))
        : [...new Set([...f.depositoIds, ...idsFiltrados])],
    }));
  }

  function validar() {
    const nuevosErrores = {};
    if (!form.articuloId) nuevosErrores.articuloId = "Elegí un artículo.";
    if (form.depositoIds.length === 0) nuevosErrores.depositoIds = "Elegí al menos un depósito.";
    return nuevosErrores;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    mutacion.mutate({ articuloId: Number(form.articuloId), depositoIds: form.depositoIds });
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
              {a.nombre}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-tinta">Depósitos</span>
            {depositos?.length > 0 && (
              <button
                type="button"
                onClick={toggleSeleccionarTodos}
                disabled={idsFiltrados.length === 0}
                className="cursor-pointer text-xs font-semibold text-pino hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {todosFiltradosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
            )}
          </div>

          {depositos?.length > 0 && (
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
              <input
                value={busquedaDeposito}
                onChange={(e) => setBusquedaDeposito(e.target.value)}
                placeholder="Buscar depósito…"
                className="w-full rounded-md border border-borde py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </div>
          )}

          <div
            className={`flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-md border px-3 py-2 ${
              errores.depositoIds ? "border-error" : "border-borde"
            }`}
          >
            {depositos?.length === 0 && <span className="text-xs text-piedra">No hay depósitos activos.</span>}
            {depositos?.length > 0 && depositosFiltrados.length === 0 && (
              <span className="text-xs text-piedra">Ningún depósito coincide con la búsqueda.</span>
            )}
            {depositosFiltrados.map((d) => (
              <label key={d.id} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.depositoIds.includes(d.id)}
                  onChange={() => toggleDeposito(d.id)}
                />
                {d.nombre}
              </label>
            ))}
          </div>
          {errores.depositoIds && <span className="text-xs text-error">{errores.depositoIds}</span>}
        </div>
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        <Plus size={16} /> {mutacion.isPending ? "Guardando…" : "Habilitar"}
      </Button>

      <Toast mensaje={toast} />
    </form>
  );
}
