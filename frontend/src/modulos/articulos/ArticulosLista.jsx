import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Package, Search, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { Table } from "../../componentes/Table";
import { FilterBar } from "../../componentes/FilterBar";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Pagination } from "../../componentes/Pagination";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { ArticuloModal } from "./ArticuloModal";
import { ArticuloDetalleModal } from "./ArticuloDetalleModal";
import { listarArticulos, cambiarEstadoArticulo } from "./articulos.api";
import { UNIDADES_MEDIDA, UNIDADES_MEDIDA_NOMBRES, CATEGORIAS } from "./articulos.constantes";

const PAGE_SIZE = 10;

export function ArticulosLista() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const q = searchParams.get("q") ?? "";
  const categoria = searchParams.get("categoria") ?? "";
  const unidadMedida = searchParams.get("unidadMedida") ?? "";
  const estado = searchParams.get("estado") ?? "todos";
  const page = Number(searchParams.get("page")) || 1;

  const [modal, setModal] = useState(null); // { tipo: "form" | "detalle", articulo }
  const [paraCambiarEstado, setParaCambiarEstado] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["articulos", { q, categoria, unidadMedida, estado, page }],
    queryFn: () => listarArticulos({ q, categoria, unidadMedida, estado, page, pageSize: PAGE_SIZE }),
  });

  const mutacionEstado = useMutation({
    mutationFn: ({ id, activo }) => cambiarEstadoArticulo(id, activo),
    onSuccess: (articulo) => {
      queryClient.invalidateQueries({ queryKey: ["articulos"] });
      mostrarToast(`${articulo.codigo} — ${articulo.nombre} ahora está ${articulo.activo ? "habilitado" : "deshabilitado"}.`);
      setParaCambiarEstado(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar el estado del artículo.");
      setParaCambiarEstado(null);
    },
  });

  function mostrarToast(texto) {
    setToast(texto);
  }

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor && valor !== "todos") {
      params.set(clave, valor);
    } else {
      params.delete(clave);
    }
    params.set("page", "1");
    setSearchParams(params);
  }

  function irAPagina(nuevaPagina) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nuevaPagina));
    setSearchParams(params);
  }

  const hayFiltros = Boolean(q || categoria || unidadMedida || (estado && estado !== "todos"));

  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <Package size={20} className="text-pino" /> Catálogo de artículos
        </h2>
        <Button onClick={() => setModal({ tipo: "form", articulo: null })}>+ Nuevo artículo</Button>
      </div>

      <div className="mb-4">
        <FilterBar onClear={hayFiltros ? () => setSearchParams({}) : undefined}>
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
            <input
              value={q}
              onChange={(e) => actualizarFiltro("q", e.target.value)}
              placeholder="Buscar por nombre…"
              className="w-full rounded-md border border-borde py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
            />
          </div>
          <select
            value={categoria}
            onChange={(e) => actualizarFiltro("categoria", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-2.5 py-1.5 text-sm"
          >
            <option value="">Categoría: todas</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={unidadMedida}
            onChange={(e) => actualizarFiltro("unidadMedida", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-2.5 py-1.5 text-sm"
          >
            <option value="">Unidad: todas</option>
            {UNIDADES_MEDIDA.map((u) => (
              <option key={u} value={u}>{UNIDADES_MEDIDA_NOMBRES[u]}</option>
            ))}
          </select>
          <select
            value={estado}
            onChange={(e) => actualizarFiltro("estado", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-2.5 py-1.5 text-sm"
          >
            <option value="todos">Estado: todos</option>
            <option value="activo">Habilitados</option>
            <option value="inactivo">Deshabilitados</option>
          </select>
        </FilterBar>
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando artículos…</p>}
      {isError && <p className="text-sm text-error">No se pudieron cargar los artículos.</p>}

      {data && (
        <>
          <Table
            columnas={["Código", "Nombre", "Unidad", "Categoría", "Estado", "Acciones"]}
            filas={data.items}
            vacio={hayFiltros ? "Ningún artículo coincide con los filtros." : "Todavía no hay artículos cargados."}
            renderFila={(a) => (
              <tr
                key={a.id}
                onClick={() => setModal({ tipo: "detalle", articulo: a })}
                className={`cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${a.activo ? "" : "text-piedra"}`}
              >
                <td className="px-3 py-2 font-mono text-xs">{a.codigo}</td>
                <td className="px-3 py-2 font-semibold">{a.nombre}</td>
                <td className="px-3 py-2">{UNIDADES_MEDIDA_NOMBRES[a.unidadMedida] ?? a.unidadMedida}</td>
                <td className="px-3 py-2">{a.categoria}</td>
                <td className="px-3 py-2">
                  <Badge variante={a.activo ? "ok" : "neutro"}>{a.activo ? "Habilitado" : "Deshabilitado"}</Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Editar artículo"
                      aria-label="Editar artículo"
                      onClick={() => setModal({ tipo: "form", articulo: a })}
                      className="cursor-pointer rounded-md bg-hueso p-1.5 text-piedra hover:bg-pino-suave hover:text-pino"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      title={a.activo ? "Deshabilitar artículo" : "Habilitar artículo"}
                      aria-label={a.activo ? "Deshabilitar artículo" : "Habilitar artículo"}
                      onClick={() => setParaCambiarEstado(a)}
                      className={`cursor-pointer rounded-md p-1.5 ${a.activo ? "bg-error-suave text-error" : "bg-exito-suave text-exito"}`}
                    >
                      {a.activo ? <Ban size={15} /> : <CheckCircle2 size={15} />}
                    </button>
                  </div>
                </td>
              </tr>
            )}
          />
          <div className="mt-3">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={irAPagina} />
          </div>
        </>
      )}

      <p className="mt-4 border-t border-dashed border-borde pt-3 text-xs text-piedra">
        Un artículo deshabilitado no puede elegirse en nuevas habilitaciones por depósito ni movimientos de stock, pero conserva su historial — nunca se borra.
      </p>

      {modal?.tipo === "form" && (
        <ArticuloModal
          articulo={modal.articulo}
          onClose={() => setModal(null)}
          onExito={(mensaje) => { setModal(null); mostrarToast(mensaje); }}
        />
      )}
      {modal?.tipo === "detalle" && (
        <ArticuloDetalleModal
          articulo={modal.articulo}
          onClose={() => setModal(null)}
          onEditar={() => setModal({ tipo: "form", articulo: modal.articulo })}
        />
      )}

      <ConfirmDialog
        abierto={Boolean(paraCambiarEstado)}
        titulo={paraCambiarEstado?.activo ? "¿Deshabilitar artículo?" : "¿Habilitar artículo?"}
        mensaje={
          paraCambiarEstado?.activo
            ? `${paraCambiarEstado?.codigo} — ${paraCambiarEstado?.nombre} dejará de poder elegirse en nuevas habilitaciones por depósito y movimientos de stock. Conserva todo su historial y podés volver a habilitarlo cuando quieras.`
            : `${paraCambiarEstado?.codigo} — ${paraCambiarEstado?.nombre} volverá a estar disponible para habilitaciones por depósito y movimientos de stock.`
        }
        textoConfirmar={paraCambiarEstado?.activo ? "Sí, deshabilitar" : "Sí, habilitar"}
        variante={paraCambiarEstado?.activo ? "peligro" : "exito"}
        onCancelar={() => setParaCambiarEstado(null)}
        onConfirmar={() => mutacionEstado.mutate({ id: paraCambiarEstado.id, activo: !paraCambiarEstado.activo })}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
