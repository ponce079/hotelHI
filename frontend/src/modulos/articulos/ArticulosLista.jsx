import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Pagination } from "../../componentes/Pagination";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { ArticuloModal } from "./ArticuloModal";
import { ArticuloDetalleModal } from "./ArticuloDetalleModal";
import { listarArticulos, cambiarEstadoArticulo, obtenerArticulo } from "./articulos.api";
import { listarHabilitaciones } from "../articulo-deposito/articuloDeposito.api";
import { UNIDADES_MEDIDA_NOMBRES } from "../articulos/articulos.constantes";
import { useToast } from "../../lib/useToast";

const PAGE_SIZE = 10;

// Cada estado tiene su propio color cuando esta activo (guia visual SGH,
// seccion 5: "Todos=tinta, Activo=pino, Dado de baja=gris").
const ESTADOS = [
  { valor: "todos", label: "Todos", activo: "border-tinta bg-tinta text-hueso" },
  { valor: "activo", label: "Activo", activo: "border-pino bg-pino text-hueso" },
  { valor: "inactivo", label: "Dado de baja", activo: "border-[#867d68] bg-[#867d68] text-hueso" },
];

export function ArticulosLista() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const q = searchParams.get("q") ?? "";
  const estado = searchParams.get("estado") ?? "todos";
  const page = Number(searchParams.get("page")) || 1;

  const [modal, setModal] = useState(null); // { tipo: "form" | "detalle", articulo }
  const [paraCambiarEstado, setParaCambiarEstado] = useState(null);
  const { toast, mostrarToast } = useToast();

  // Alta desde "Nuevo requerimiento" (RequerimientoModal): cuando el
  // artículo buscado no existe en el catálogo, ese link manda para acá con
  // ?nuevo=1 para abrir el alta directo — mismo criterio que el
  // origen=ALERTA de RequerimientosPage. Se lee una sola vez al montar y se
  // limpia de la URL para no reabrirse en cada refresh.
  useEffect(() => {
    if (searchParams.get("nuevo") === "1") {
      setModal({ tipo: "form", articulo: null });
      const params = new URLSearchParams(searchParams);
      params.delete("nuevo");
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mismo criterio que ?nuevo=1 arriba, pero para editar un artículo puntual:
  // lo usa el link "Asignarle un central" del error de "sin depósito central
  // asignado" en RequerimientoModal, así la persona cae directo en su
  // edición en vez de tener que buscarlo a mano en el catálogo.
  const idAEditar = Number(searchParams.get("editar"));
  const { data: articuloAEditar } = useQuery({
    queryKey: ["articulo", idAEditar],
    queryFn: () => obtenerArticulo(idAEditar),
    enabled: Number.isInteger(idAEditar) && idAEditar > 0,
  });

  useEffect(() => {
    if (articuloAEditar) {
      setModal({ tipo: "form", articulo: articuloAEditar });
      const params = new URLSearchParams(searchParams);
      params.delete("editar");
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloAEditar]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["articulos", { q, estado, page }],
    queryFn: () => listarArticulos({ q, estado, page, pageSize: PAGE_SIZE }),
  });
  // Total del catalogo sin filtros, solo para el contador "X de Y articulos".
  const { data: totalCatalogo } = useQuery({
    queryKey: ["articulos", { estado: "todos", pageSize: 1 }],
    queryFn: () => listarArticulos({ estado: "todos", pageSize: 1 }),
  });

  // "Habilitado en": nombres de depósito por artículo, para la columna de
  // la tabla. Se pide siempre (no solo cuando hay filas activas) porque es
  // liviano y ya lo usa articulo-deposito en otros lados con la misma key.
  const { data: habilitaciones } = useQuery({
    queryKey: ["articulo-depositos"],
    queryFn: listarHabilitaciones,
  });

  function depositosDe(articuloId) {
    return (habilitaciones ?? [])
      .filter((h) => h.articuloId === articuloId && h.activo)
      .map((h) => h.deposito?.nombre)
      .filter(Boolean);
  }

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={q}
            onChange={(e) => actualizarFiltro("q", e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>

        <div className="inline-flex overflow-hidden rounded-full border border-borde">
          {ESTADOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              onClick={() => actualizarFiltro("estado", e.valor)}
              className={`cursor-pointer whitespace-nowrap px-4 py-2 text-[12.5px] font-medium ${
                estado === e.valor ? e.activo : "bg-transparent text-tinta hover:bg-hueso"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>

        {data && (
          <span className="mr-auto text-xs text-piedra">
            {data.total} de {totalCatalogo?.total ?? data.total} artículos
          </span>
        )}

        <Button onClick={() => setModal({ tipo: "form", articulo: null })}>+ Nuevo artículo</Button>
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando artículos…</p>}
      {isError && <p className="text-sm text-error">No se pudieron cargar los artículos.</p>}

      {data && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <Table
            columnas={["Código", "Nombre", "Unidad", "Categoría", "Habilitado en", "Estado", ""]}
            filas={data.items}
            vacio={q || estado !== "todos" ? "Ningún artículo coincide con los filtros." : "Todavía no hay artículos cargados."}
            renderFila={(a) => {
              const deps = depositosDe(a.id);
              return (
                <tr
                  key={a.id}
                  onClick={() => setModal({ tipo: "detalle", articulo: a })}
                  className={`cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${a.activo ? "" : "text-piedra"}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{a.codigo}</td>
                  <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{a.nombre}</td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{UNIDADES_MEDIDA_NOMBRES[a.unidadMedida] ?? a.unidadMedida}</td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{a.categoria}</td>
                  <td className="px-3 py-2 font-body text-xs text-tinta/55">{deps.length ? deps.join(" · ") : "sin depósitos"}</td>
                  <td className="px-3 py-2">
                    <Badge variante={a.activo ? "ok" : "neutro"}>{a.activo ? "Activo" : "Dado de baja"}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button variante="secundario" tamano="fila" onClick={() => setModal({ tipo: "form", articulo: a })}>
                        Editar
                      </Button>
                      <Button
                        variante={a.activo ? "baja" : "alta"}
                        tamano="fila"
                        onClick={() => setParaCambiarEstado(a)}
                      >
                        {a.activo ? "Dar de baja" : "Reactivar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            }}
          />
          <div className="mt-3">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={irAPagina} />
          </div>
        </div>
      )}

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
        Un artículo deshabilitado no puede elegirse en nuevas habilitaciones por depósito ni movimientos de stock, pero conserva su historial — nunca se borra.
      </p>

      {modal?.tipo === "form" && (
        <ArticuloModal
          articulo={modal.articulo}
          onClose={() => setModal(null)}
          onExito={(mensaje) => {
            setModal(null);
            mostrarToast(mensaje);
          }}
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
        titulo={paraCambiarEstado?.activo ? "¿Dar de baja el artículo?" : "¿Reactivar el artículo?"}
        mensaje={
          paraCambiarEstado?.activo
            ? `${paraCambiarEstado?.codigo} — ${paraCambiarEstado?.nombre} dejará de poder elegirse en nuevas habilitaciones por depósito y movimientos de stock. Conserva todo su historial y podés volver a habilitarlo cuando quieras.`
            : `${paraCambiarEstado?.codigo} — ${paraCambiarEstado?.nombre} volverá a estar disponible para habilitaciones por depósito y movimientos de stock.`
        }
        textoConfirmar={paraCambiarEstado?.activo ? "Sí, dar de baja" : "Sí, reactivar"}
        variante={paraCambiarEstado?.activo ? "baja" : "alta"}
        onCancelar={() => setParaCambiarEstado(null)}
        onConfirmar={() => mutacionEstado.mutate({ id: paraCambiarEstado.id, activo: !paraCambiarEstado.activo })}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
