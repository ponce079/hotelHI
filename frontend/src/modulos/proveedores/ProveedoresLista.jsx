import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Plus, Trash2, RotateCw } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { Select } from "../../componentes/Select";
import { Pagination } from "../../componentes/Pagination";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { LimpiarFiltros } from "../../componentes/LimpiarFiltros";
import { ProveedorModal } from "./ProveedorModal";
import { listarProveedores, cambiarEstadoProveedor } from "./proveedores.api";
import { RUBROS, CONDICIONES_COMERCIALES } from "../../lib/constantes";
import { useToast } from "../../lib/useToast";

const PAGE_SIZE = 10;

// Mismos colores por estado que ArticulosLista (guía visual, sección 5).
const ESTADOS = [
  { valor: "todos", label: "Todos", activo: "border-tinta bg-tinta text-hueso" },
  { valor: "activo", label: "Activo", activo: "border-pino bg-pino text-hueso" },
  { valor: "inactivo", label: "Inactivo", activo: "border-inactivo bg-inactivo text-hueso" },
];

export function ProveedoresLista() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const q = searchParams.get("q") ?? "";
  const rubro = searchParams.get("rubro") ?? "";
  const condicionComercial = searchParams.get("condicionComercial") ?? "";
  const estado = searchParams.get("estado") ?? "activo";
  const page = Number(searchParams.get("page")) || 1;

  const [modal, setModal] = useState(null);
  const [paraCambiarEstado, setParaCambiarEstado] = useState(null);
  const { toast, mostrarToast } = useToast();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["proveedores", { q, rubro, condicionComercial, estado, page }],
    queryFn: () => listarProveedores({ q, rubro, condicionComercial, estado, page, pageSize: PAGE_SIZE }),
  });

  const mutacionEstado = useMutation({
    mutationFn: ({ id, activo }) => cambiarEstadoProveedor(id, activo),
    onSuccess: (proveedor) => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      mostrarToast(`${proveedor.razonSocial} ahora está ${proveedor.activo ? "activo" : "dado de baja"}.`);
      setParaCambiarEstado(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar el estado del proveedor.");
      setParaCambiarEstado(null);
    },
  });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    params.set("page", "1");
    setSearchParams(params);
  }

  function irAPagina(nuevaPagina) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nuevaPagina));
    setSearchParams(params);
  }

  function limpiarFiltros() {
    const params = new URLSearchParams(searchParams);
    ["q", "rubro", "condicionComercial", "estado"].forEach((k) => params.delete(k));
    params.set("page", "1");
    setSearchParams(params);
  }

  const hayFiltros = q || rubro || condicionComercial || estado !== "activo";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={q}
            onChange={(e) => actualizarFiltro("q", e.target.value)}
            placeholder="Buscar por razón social o CUIT…"
            className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>

        <Select value={condicionComercial} onChange={(e) => actualizarFiltro("condicionComercial", e.target.value)}>
          <option value="">Toda condición</option>
          {CONDICIONES_COMERCIALES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>

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

        {hayFiltros && <LimpiarFiltros onClick={limpiarFiltros} />}

        <Button onClick={() => setModal({ proveedor: null })} icono={Plus}>Nuevo proveedor</Button>
      </div>

      <div className="flex flex-wrap items-center gap-[7px]">
        <span className="mr-1 text-[11.5px] text-piedra">Rubro:</span>
        <button
          type="button"
          onClick={() => actualizarFiltro("rubro", "")}
          className={`cursor-pointer rounded-full border px-3 py-[5px] text-xs ${
            rubro === "" ? "border-tinta bg-tinta text-hueso" : "border-tinta/20 text-tinta hover:bg-hueso"
          }`}
        >
          Todos
        </button>
        {RUBROS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => actualizarFiltro("rubro", rubro === r ? "" : r)}
            className={`cursor-pointer rounded-full border px-3 py-[5px] text-xs ${
              rubro === r ? "border-pino bg-pino text-hueso" : "border-tinta/20 text-tinta hover:bg-hueso"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando proveedores…</p>}
      {isError && <p className="text-sm text-error">No se pudieron cargar los proveedores.</p>}

      {data && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <div className="mb-3 text-xs text-piedra">{data.total} proveedor{data.total === 1 ? "" : "es"}</div>
          <Table
            columnas={["Razón social", "CUIT", "Rubros", "Condición", "Contacto", "Estado", ""]}
            filas={data.items}
            vacio={hayFiltros ? "Ningún proveedor coincide con los filtros." : "Todavía no hay proveedores cargados."}
            renderFila={(p) => (
              <tr
                key={p.id}
                onClick={() => navigate(`/proveedores/${p.id}`)}
                className={`cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${p.activo ? "" : "text-piedra"}`}
              >
                <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{p.razonSocial}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.cuit}</td>
                <td className="px-3 py-2 font-body text-[12px] text-tinta/70">
                  {p.rubros.map((r) => r.rubro).join(" · ")}
                </td>
                <td className="px-3 py-2 font-body text-[12.5px]">{p.condicionComercial ?? "—"}</td>
                <td className="px-3 py-2 font-body text-[12px] text-tinta/70">
                  {p.contacto ?? "—"}
                  {p.telefono && <div className="text-[11px] text-piedra">{p.telefono}</div>}
                </td>
                <td className="px-3 py-2">
                  <Badge variante={p.activo ? "ok" : "neutro"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {/* Auditoría de botones, P3.3 */}
                    <MenuAcciones
                      acciones={[
                        { label: "Editar", onClick: () => setModal({ proveedor: p }) },
                        {
                          label: p.activo ? "Dar de baja" : "Reactivar",
                          variante: p.activo ? "destructivo" : undefined,
                          onClick: () => setParaCambiarEstado(p),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )}
          />
          <div className="mt-3">
            <Pagination page={data.page} totalPages={data.totalPages} onChange={irAPagina} />
          </div>
        </div>
      )}

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
        La baja es lógica: un proveedor inactivo no se puede invitar a cotizar ni elegir en una orden nueva, pero
        conserva su historial de compras y su cuenta corriente.
      </p>

      {modal && (
        <ProveedorModal
          proveedor={modal.proveedor}
          onClose={() => setModal(null)}
          onExito={(mensaje) => {
            setModal(null);
            mostrarToast(mensaje);
          }}
        />
      )}

      <ConfirmDialog
        abierto={Boolean(paraCambiarEstado)}
        titulo={paraCambiarEstado?.activo ? "¿Dar de baja el proveedor?" : "¿Reactivar el proveedor?"}
        mensaje={
          paraCambiarEstado?.activo
            ? `${paraCambiarEstado?.razonSocial} dejará de aparecer para invitar a cotizar y en altas nuevas. Su historial de órdenes de compra y su cuenta corriente se conservan.`
            : `${paraCambiarEstado?.razonSocial} volverá a estar disponible para pedirle presupuestos y emitirle órdenes de compra.`
        }
        textoConfirmar={paraCambiarEstado?.activo ? "Sí, dar de baja" : "Sí, reactivar"}
        variante={paraCambiarEstado?.activo ? "destructivo" : "alta"}
        icono={paraCambiarEstado?.activo ? Trash2 : RotateCw}
        onCancelar={() => setParaCambiarEstado(null)}
        onConfirmar={() => mutacionEstado.mutate({ id: paraCambiarEstado.id, activo: !paraCambiarEstado.activo })}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
