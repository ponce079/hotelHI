import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Search, ChevronRight, TriangleAlert, FileClock, Plus } from "lucide-react";
import { Select } from "../../componentes/Select";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { Pagination } from "../../componentes/Pagination";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { LimpiarFiltros } from "../../componentes/LimpiarFiltros";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";
import { formatearMonto } from "../../lib/moneda";
import { listarOrdenesCompra, generarOrdenCompra, enviarOrdenCompra, anularOrdenCompra } from "./ordenesCompra.api";
import { listarPresupuestos } from "../presupuestos/presupuestos.api";
import { ESTADOS_PRESUPUESTO } from "../../lib/constantes";
import { ESTADOS_OC, BADGE_ESTADO_OC } from "./ordenesCompra.constantes";

const FILTROS_VACIOS = { q: "", estado: "", proveedorId: "", desde: "", hasta: "" };
const PAGE_SIZE = 10;

// Mismo patrón de pastillas que Proveedores (fila "Rubro") y Requerimientos
// (fila "Estado") — acá con más opciones que esas, así que van sueltas con
// gap en vez de un único control segmentado. El color de cada pastilla
// activa sale de BADGE_ESTADO_OC (una sola fuente de verdad con el badge
// de la tabla), no se duplica.
const PILL_ACTIVO_POR_VARIANTE = {
  alerta: "border-laton-700 bg-laton-700 text-hueso",
  ok: "border-pino bg-pino text-hueso",
  neutro: "border-inactivo bg-inactivo text-hueso",
  error: "border-error bg-error text-hueso",
  info: "border-info bg-info text-hueso",
  cerrado: "border-neutro-700 bg-neutro-700 text-hueso",
};
const ESTADOS_FILTRO_OC = [
  { valor: "", label: "Todos", activo: "border-tinta bg-tinta text-hueso" },
  ...ESTADOS_OC.map((estado) => ({
    valor: estado,
    label: estado,
    activo: PILL_ACTIVO_POR_VARIANTE[BADGE_ESTADO_OC[estado]] ?? "border-tinta bg-tinta text-hueso",
  })),
];

export function OrdenesCompraPage() {
  const { puede, usuario } = useSesion();
  const tienePermiso = puede("verOrdenesCompra");
  const navigate = useNavigate();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  // Llega acá desde el botón "Ir a Órdenes de Compra" de la comparación de
  // presupuestos (que ya no genera la OC directamente, solo te trae hasta
  // acá) — resalta la fila de ese presupuesto en la bandeja de abajo. Se
  // lee una sola vez al montar y se limpia de la URL, mismo patrón que el
  // prefill de Alertas en RequerimientosPage.
  const [destacarPresupuestoId, setDestacarPresupuestoId] = useState(null);
  useEffect(() => {
    const id = Number(searchParams.get("generarPresupuestoId"));
    if (Number.isInteger(id) && id > 0) {
      setDestacarPresupuestoId(id);
      const params = new URLSearchParams(searchParams);
      params.delete("generarPresupuestoId");
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setPagina(1), [filtros]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ordenes-compra", "listado", filtros, pagina],
    queryFn: () => listarOrdenesCompra({ ...filtros, page: pagina, pageSize: PAGE_SIZE }),
    enabled: tienePermiso,
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
  }

  // Presupuestos ya adjudicados por el gerente (HU-84) que todavía no
  // tienen una orden de compra generada — es la bandeja de trabajo de
  // compras para HU-22. Ya no se genera desde la comparación de
  // presupuestos, se genera acá.
  const { data: adjudicadosData } = useQuery({
    queryKey: ["presupuestos", { estado: ESTADOS_PRESUPUESTO.ADJUDICADO }],
    queryFn: () => listarPresupuestos({ estado: ESTADOS_PRESUPUESTO.ADJUDICADO }),
    enabled: tienePermiso,
  });
  const presupuestosPorGenerar = (adjudicadosData?.items ?? []).filter((p) => !p.ordenCompra);

  const mutacionGenerar = useMutation({
    mutationFn: (presupuestoId) => generarOrdenCompra(presupuestoId, usuario),
    onSuccess: (oc) => {
      invalidar();
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      mostrarToast(`Orden de compra ${oc.numero} generada.`);
      navigate(`/ordenes-compra/${oc.id}`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo generar la orden de compra."),
  });

  // Punto 7 del rediseño — acciones rápidas desde el menú de 3 puntos de
  // cada fila. "Marcar como enviada" pide confirmación (mismo texto que
  // OrdenCompraDetallePage.jsx, para que la fricción sea igual sin
  // importar desde dónde se dispare). "Anular" pide el motivo con
  // `prompt()` — mismo criterio ya usado en ComprobantesPage.jsx para una
  // acción rápida de lista que necesita un dato extra sin abrir un modal.
  const [confirmarEnviar, setConfirmarEnviar] = useState(null); // OC | null

  const mutacionEnviar = useMutation({
    mutationFn: (o) => enviarOrdenCompra(o.id, usuario),
    onSuccess: (ocActualizada) => {
      invalidar();
      setConfirmarEnviar(null);
      mostrarToast(`Orden ${ocActualizada.numero} enviada al proveedor.`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo enviar la orden."),
  });

  const mutacionAnular = useMutation({
    mutationFn: ({ id, motivo }) => anularOrdenCompra(id, motivo, usuario),
    onSuccess: (ocActualizada) => {
      invalidar();
      mostrarToast(`Orden ${ocActualizada.numero} anulada.`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo anular la orden."),
  });

  function anularDesdeLista(o) {
    const motivo = window.prompt(`Motivo de anulación de ${o.numero}:`);
    if (motivo && motivo.trim()) mutacionAnular.mutate({ id: o.id, motivo });
  }

  // Mismas reglas que ya usa OrdenCompraDetallePage.jsx (puedeEnviar/
  // puedeAnular/puedeRecibir) — no se duplica el criterio, solo se repite
  // la condición porque una vive en la ficha y la otra en la lista.
  function accionesDeFila(o) {
    const acciones = [{ label: "Ver detalle", onClick: () => navigate(`/ordenes-compra/${o.id}`) }];
    if (puede("gestionarOC") && o.estado === "Pendiente") {
      acciones.push({ label: "Marcar como enviada", onClick: () => setConfirmarEnviar(o) });
    }
    if (puede("recibirOC") && o.estado === "Enviada") {
      acciones.push({ label: "Registrar recepción", onClick: () => navigate(`/ordenes-compra/${o.id}/recepcion`) });
    }
    if (puede("gestionarOC") && !["Recibida", "Recibida con diferencia", "Anulada", "Cerrada"].includes(o.estado)) {
      acciones.push({ label: "Anular OC", variante: "destructivo", onClick: () => anularDesdeLista(o) });
    }
    return acciones;
  }

  // Mismo truco que PagosPage.jsx: todavía no existe GET /api/proveedores
  // (HU-18 a 21, Tomás/Agustín), así que el selector de proveedor se arma
  // con los proveedores que ya trajo el propio listado, filtrado solo por
  // estado/fecha (no por proveedor) para no autoestrecharse.
  const { data: dataParaFiltro } = useQuery({
    queryKey: ["ordenes-compra", "proveedores-filtro", filtros.estado, filtros.desde, filtros.hasta],
    queryFn: () => listarOrdenesCompra({ estado: filtros.estado, desde: filtros.desde, hasta: filtros.hasta, pageSize: 500 }),
    enabled: tienePermiso,
  });
  const proveedoresDisponibles = useMemo(() => {
    const vistos = new Map();
    (dataParaFiltro?.items ?? []).forEach((o) => vistos.set(o.proveedorId, o.proveedor?.razonSocial));
    return [...vistos.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [dataParaFiltro]);

  if (!tienePermiso) return <SinPermiso />;

  const hayFiltros = filtros.q || filtros.estado || filtros.proveedorId || filtros.desde || filtros.hasta;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <ShoppingCart size={26} className="text-pino" /> Órdenes de Compra
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 22, 24, 25, 85 — seguimiento de envío, recepción y cierre
        </p>
      </div>

      {presupuestosPorGenerar.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-laton bg-laton-100/50 p-5">
          <div>
            <h2 className="font-heading text-[16px] font-semibold text-tinta">
              Presupuestos adjudicados por generar · {presupuestosPorGenerar.length}
            </h2>
            <p className="mt-0.5 text-[12px] text-tinta/60">
              El gerente ya los adjudicó — falta generar la orden de compra para formalizar el pedido.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {presupuestosPorGenerar.map((p) => (
              <div
                key={p.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 ${
                  p.id === destacarPresupuestoId ? "border-pino ring-2 ring-pino/25" : "border-borde"
                }`}
              >
                <div className="min-w-0">
                  <NombreClave className="block truncate" title={p.proveedor?.razonSocial}>
                    {p.proveedor?.razonSocial}
                  </NombreClave>
                  <div className="text-[11.5px] text-piedra">
                    <CodigoClave className="text-piedra">REQ-{String(p.requerimientoId).padStart(4, "0")}</CodigoClave>
                    {p.requerimiento?.deposito?.nombre && ` · ${p.requerimiento.deposito.nombre}`}
                    {" · "}$ {formatearMonto(p.total)}
                  </div>
                </div>
                {puede("gestionarOC") ? (
                  <Button
                    disabled={mutacionGenerar.isPending && mutacionGenerar.variables === p.id}
                    onClick={() => mutacionGenerar.mutate(p.id)}
                    icono={Plus}
                  >
                    {mutacionGenerar.isPending && mutacionGenerar.variables === p.id
                      ? "Generando…"
                      : "Generar Orden de Compra"}
                  </Button>
                ) : (
                  <span className="text-[12px] text-piedra">La genera el área de compras.</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={filtros.q}
            onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
            placeholder="Buscar por N° de OC o proveedor…"
            className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>

        <Select value={filtros.proveedorId} onChange={(e) => setFiltros((f) => ({ ...f, proveedorId: e.target.value }))}>
          <option value="">Todos los proveedores</option>
          {proveedoresDisponibles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-piedra">Desde</span>
          <input
            type="date"
            value={filtros.desde}
            onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))}
            className="rounded-md border border-borde bg-white px-2.5 py-[7px] text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-piedra">Hasta</span>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))}
            className="rounded-md border border-borde bg-white px-2.5 py-[7px] text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>

        {hayFiltros && <LimpiarFiltros onClick={() => setFiltros(FILTROS_VACIOS)} />}
      </div>

      <div className="flex flex-wrap items-center gap-[7px]">
        <span className="mr-1 text-[11.5px] text-piedra">Estado:</span>
        {ESTADOS_FILTRO_OC.map((e) => (
          <button
            key={e.valor || "todos"}
            type="button"
            onClick={() => setFiltros((f) => ({ ...f, estado: e.valor }))}
            className={`cursor-pointer rounded-full border px-3 py-[5px] text-xs ${
              filtros.estado === e.valor ? e.activo : "border-tinta/20 text-tinta hover:bg-hueso"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar las órdenes de compra.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-piedra">
              <span>{data?.total ?? 0} orden(es) de compra</span>
              <span className="flex items-center gap-4 text-tinta/50">
                <span className="flex items-center gap-1.5">
                  <TriangleAlert size={13} className="text-error" /> Factura vencida
                </span>
                <span className="flex items-center gap-1.5">
                  <FileClock size={13} className="text-piedra" /> Sin comprobante cargado
                </span>
              </span>
            </div>
            <Table
              columnas={["N° OC", "Proveedor", "Monto total", "Estado", "Fecha", ""]}
              columnasDerecha={["Monto total", ""]}
              filas={data?.items ?? []}
              vacio="Ninguna orden de compra coincide con los filtros."
              renderFila={(o) => {
                // Cerrada/Anulada ya salieron del circuito — atenuadas para
                // que lo que sí necesita atención resalte más de un vistazo
                // (punto 4 del rediseño: jerarquía visual, no solo orden).
                const fueraDeCirculo = ["Cerrada", "Anulada"].includes(o.estado);
                const alerta = o.alertaFacturacion;
                return (
                  <tr
                    key={o.id}
                    onClick={() => navigate(`/ordenes-compra/${o.id}`)}
                    className={`group cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${
                      fueraDeCirculo ? "opacity-70" : ""
                    }`}
                  >
                    <td className="px-2 py-2.5">
                      <CodigoClave>{o.numero}</CodigoClave>
                    </td>
                    <td className="max-w-[260px] px-2 py-2.5">
                      <NombreClave className="block truncate" title={o.proveedor?.razonSocial}>
                        {o.proveedor?.razonSocial}
                      </NombreClave>
                    </td>
                    <td className="px-2 py-2.5 text-right text-[13.5px] font-semibold">
                      $ {formatearMonto(Number(o.montoTotal) + Number(o.flete || 0))}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Badge variante={BADGE_ESTADO_OC[o.estado] ?? "neutro"}>{o.estado}</Badge>
                        {/* Secundario a propósito — un ícono chico con tooltip,
                            no otro badge, para no competir con el estado
                            principal (punto 3 del rediseño). */}
                        {alerta?.tipo === "facturaVencida" && (
                          <span title={`Factura ${alerta.numero} vencida hace ${alerta.dias} día(s)`}>
                            <TriangleAlert size={13} className="text-error" />
                          </span>
                        )}
                        {alerta?.tipo === "sinComprobante" && (
                          <span title={`Recibida hace ${alerta.dias} día(s) sin comprobante cargado`}>
                            <FileClock size={13} className="text-piedra/70" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-[12.5px] text-tinta/70">{new Date(o.fecha).toLocaleDateString("es-AR")}</td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Punto 7: todas las acciones de cambio de estado
                            posibles para ESTA OC puntual, ya filtradas por
                            estado/permiso — nunca deshabilitadas, directamente
                            ocultas si no corresponden. */}
                        <MenuAcciones acciones={accionesDeFila(o)} />
                        {/* Chevron: la fila entera ya navega al detalle, esto
                            solo lo hace obvio a simple vista (punto 1). */}
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-tinta/25 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-tinta/60"
                        />
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
            {data && (
              <div className="mt-3">
                <Pagination page={data.page} totalPages={data.totalPages} onChange={setPagina} />
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        abierto={Boolean(confirmarEnviar)}
        titulo="Marcar como enviada"
        mensaje={`Se marcará ${confirmarEnviar?.numero} como Enviada al proveedor. Después de esto solo se puede registrar la recepción o anular.`}
        textoConfirmar="Marcar enviada"
        variante="ok"
        onCancelar={() => setConfirmarEnviar(null)}
        onConfirmar={() => mutacionEnviar.mutate(confirmarEnviar)}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
