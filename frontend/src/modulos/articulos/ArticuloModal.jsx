import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Search } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearArticulo, actualizarArticulo } from "./articulos.api";
import { habilitarArticuloEnDeposito, listarHabilitaciones } from "../articulo-deposito/articuloDeposito.api";
import { listarDepositos } from "../depositos/depositos.api";
import { UNIDADES_MEDIDA, UNIDADES_MEDIDA_NOMBRES, CATEGORIAS, NOMBRE_MAX_LENGTH } from "./articulos.constantes";

const CARACTERES_INVALIDOS_NOMBRE = /[^\p{L}\p{N}\s]/gu;
const VACIO = { nombre: "", unidadMedida: "", categoria: "" };

export function ArticuloModal({ articulo, onClose, onExito }) {
  const editando = Boolean(articulo);
  const [form, setForm] = useState(articulo ? { nombre: articulo.nombre, unidadMedida: articulo.unidadMedida, categoria: articulo.categoria } : VACIO);
  const [errores, setErrores] = useState({});
  const [depositosSeleccionados, setDepositosSeleccionados] = useState([]);
  const [busquedaDeposito, setBusquedaDeposito] = useState("");
  const queryClient = useQueryClient();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: habilitacionesTodas } = useQuery({
    queryKey: ["articulo-depositos"],
    queryFn: listarHabilitaciones,
    enabled: editando,
  });

  const depositosYaHabilitados = editando
    ? (habilitacionesTodas ?? []).filter((h) => h.articuloId === articulo.id && h.activo).map((h) => h.depositoId)
    : [];

  const mutacion = useMutation({
    mutationFn: async () => {
      const articuloGuardado = editando
        ? await actualizarArticulo(articulo.id, form)
        : await crearArticulo(form);

      const nuevosDepositos = depositosSeleccionados.filter((id) => !depositosYaHabilitados.includes(id));
      let resultadosHabilitacion = null;
      if (nuevosDepositos.length > 0) {
        const resp = await habilitarArticuloEnDeposito({ articuloId: articuloGuardado.id, depositoIds: nuevosDepositos });
        resultadosHabilitacion = resp.resultados;
      }
      return { articuloGuardado, resultadosHabilitacion };
    },
    onSuccess: ({ articuloGuardado, resultadosHabilitacion }) => {
      queryClient.invalidateQueries({ queryKey: ["articulos"] });
      queryClient.invalidateQueries({ queryKey: ["articulo-depositos"] });

      let mensaje = editando
        ? `Artículo "${articuloGuardado.nombre}" actualizado.`
        : `Artículo "${articuloGuardado.nombre}" creado con código ${articuloGuardado.codigo}.`;
      if (resultadosHabilitacion) {
        const creadas = resultadosHabilitacion.filter((r) => r.estado === "creada").length;
        if (creadas > 0) mensaje += ` Habilitado en ${creadas} depósito${creadas > 1 ? "s" : ""}.`;
      }
      onExito(mensaje);
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? `No se pudo ${editando ? "editar" : "crear"} el artículo.`;
      if (error?.response?.status === 409) {
        setErrores({ nombre: mensaje });
      } else {
        setErrores({ general: mensaje });
      }
    },
  });

  function toggleDeposito(id) {
    if (depositosYaHabilitados.includes(id)) return;
    setDepositosSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const depositosFiltrados = (depositos ?? []).filter((d) => d.nombre.toLowerCase().includes(busquedaDeposito.toLowerCase()));
  const idsSeleccionables = depositosFiltrados.map((d) => d.id).filter((id) => !depositosYaHabilitados.includes(id));
  const todosSeleccionados = idsSeleccionables.length > 0 && idsSeleccionables.every((id) => depositosSeleccionados.includes(id));

  function toggleSeleccionarTodos() {
    setDepositosSeleccionados((prev) =>
      todosSeleccionados ? prev.filter((id) => !idsSeleccionables.includes(id)) : [...new Set([...prev, ...idsSeleccionables])]
    );
  }

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
    mutacion.mutate();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-tinta/45 p-6 py-10" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-borde px-6 py-5">
          <h3 className="font-display text-lg font-bold text-pino-oscuro">{editando ? "Editar artículo" : "Nuevo artículo"}</h3>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-piedra hover:text-error">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            {errores.general && <p className="text-sm text-error">{errores.general}</p>}

            {editando && (
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="font-semibold text-tinta">Código</span>
                <div className="rounded-md border border-dashed border-borde bg-hueso px-3 py-2 font-mono text-sm text-piedra">
                  {articulo.codigo}
                </div>
                <span className="text-xs text-piedra">Se asignó solo al crear el artículo. No se puede modificar.</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase().replace(CARACTERES_INVALIDOS_NOMBRE, "") })}
                  error={errores.nombre}
                  placeholder="PAPEL HIGIÉNICO"
                  maxLength={NOMBRE_MAX_LENGTH}
                />
              </div>
              <Select
                label="Unidad de medida"
                value={form.unidadMedida}
                onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })}
                error={errores.unidadMedida}
              >
                <option value="">Seleccionar…</option>
                {UNIDADES_MEDIDA.map((u) => (
                  <option key={u} value={u}>{UNIDADES_MEDIDA_NOMBRES[u]}</option>
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
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>

            <div className="border-t border-dashed border-borde pt-4">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-tinta">
                  Habilitar en depósitos <span className="font-normal text-piedra">(opcional)</span>
                </span>
                {idsSeleccionables.length > 0 && (
                  <button type="button" onClick={toggleSeleccionarTodos} className="cursor-pointer text-xs font-semibold text-pino hover:underline">
                    {todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"}
                  </button>
                )}
              </div>
              <p className="mb-2 text-xs text-piedra">
                {editando
                  ? "Los depósitos ya habilitados quedan bloqueados acá — para sacarlo de uno hace falta confirmación aparte (todavía no disponible)."
                  : "Podés dejarlo sin marcar y habilitarlo después."}
              </p>
              <div className="relative mb-2">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
                <input
                  value={busquedaDeposito}
                  onChange={(e) => setBusquedaDeposito(e.target.value)}
                  placeholder="Buscar depósito…"
                  className="w-full rounded-md border border-borde py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
                />
              </div>
              <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-md border border-borde px-3 py-2">
                {depositosFiltrados.length === 0 && <span className="text-xs text-piedra">Ningún depósito coincide con la búsqueda.</span>}
                {depositosFiltrados.map((d) => {
                  const bloqueado = depositosYaHabilitados.includes(d.id);
                  return (
                    <label key={d.id} className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${bloqueado ? "text-piedra" : "cursor-pointer text-tinta hover:bg-hueso"}`}>
                      <input
                        type="checkbox"
                        checked={bloqueado || depositosSeleccionados.includes(d.id)}
                        disabled={bloqueado}
                        onChange={() => toggleDeposito(d.id)}
                      />
                      {d.nombre}
                      {bloqueado && <span className="ml-auto rounded bg-hueso px-1.5 py-0.5 font-mono text-[10px] text-piedra">ya habilitado</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : editando ? "Guardar cambios" : "+ Dar de alta"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
