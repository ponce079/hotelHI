import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, ClipboardList, Flame, Bot, AlertTriangle, Clock, CheckCircle2, ShoppingCart } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { MiniPasos, COLOR_POR_ESTADO_PASO } from "../../componentes/MiniPasos";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { Pagination } from "../../componentes/Pagination";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { LimpiarFiltros } from "../../componentes/LimpiarFiltros";
import { RequerimientoModal } from "./RequerimientoModal";
import { AnularRequerimientoModal } from "./AnularRequerimientoModal";
import { CompraExpressModal } from "./CompraExpressModal";
import {
  listarRequerimientos,
  obtenerResumenRequerimientos,
  confirmarSugerencia,
} from "./requerimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import {
  ESTADOS_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  TIPOS_REQUERIMIENTO,
  CATEGORIAS_REQUERIMIENTO,
  VARIANTE_POR_CATEGORIA,
  categoriaDeRequerimiento,
} from "../../lib/constantes";
import { construirEtapasRequerimiento } from "../../lib/requerimientosTimeline";
import { formatearTimestamp } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";

const PAGE_SIZE = 10;

// Rediseño: reemplazan a los dos grupos de pills de estado que había antes
// (uno para el ciclo de compra, otro para los estados nuevos de
// transferencia) — cada tarjeta es un filtro rápido por categoría, no por
// estado puntual. El dropdown de más abajo sigue cubriendo "quiero este
// estado exacto".
const TARJETAS = [
  {
    categoria: CATEGORIAS_REQUERIMIENTO.NECESITA_ACCION,
    campoResumen: "necesitaAccion",
    label: "Esperan tu acción",
    icon: AlertTriangle,
    clase: "text-error-texto",
  },
  {
    categoria: CATEGORIAS_REQUERIMIENTO.EN_CURSO,
    campoResumen: "enCurso",
    label: "En curso",
    icon: Clock,
    clase: "text-info-texto",
  },
  {
    categoria: CATEGORIAS_REQUERIMIENTO.COMPLETADO,
    campoResumen: "completadas",
    label: "Completadas",
    icon: CheckCircle2,
    clase: "text-pino",
  },
];

// Punto 4 del pedido: referencia fija de qué significa cada color de la
// columna Progreso, para no depender de que el usuario lo infiera solo.
// Misma paleta que MiniPasos.jsx (importada de ahí, no repetida a mano) —
// ahora son 4 puntos por ESTADO DE PASO (completado/actual/advertencia/
// pendiente), no por categoría de fila: cada punto de MiniPasos es su
// propio estado, ya no "toda la fila pintada del mismo color". El color
// de categoría de la fila entera sigue viéndose en la columna Estado.
const LEYENDA_PROGRESO = [
  { clave: "completado", label: "Completado" },
  { clave: "actual", label: "En curso" },
  { clave: "advertencia", label: "Necesita revisión" },
  { clave: "pendiente", label: "Pendiente" },
];

export function RequerimientosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { puede, usuario } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const q = searchParams.get("q") ?? "";
  const estado = searchParams.get("estado") ?? "";
  const categoria = searchParams.get("categoria") ?? "";
  const soloUrgentesAbiertas = searchParams.get("urgente") === "1" && searchParams.get("soloAbiertas") === "1";
  const depositoId = searchParams.get("depositoId") ?? "";
  const tipo = searchParams.get("tipo") ?? "";
  const page = Number(searchParams.get("page")) || 1;

  const [modal, setModal] = useState(null); // null | { prefill } | { requerimiento }
  const [paraAnular, setParaAnular] = useState(null);
  const [paraCompraExpress, setParaCompraExpress] = useState(null);

  function invalidarYAvisar(mensaje) {
    queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
    queryClient.invalidateQueries({ queryKey: ["requerimientos-resumen"] });
    mostrarToast(mensaje);
  }

  const mutacionConfirmarSugerencia = useMutation({
    mutationFn: (id) => confirmarSugerencia(id, usuario),
    onSuccess: (_data, id) => invalidarYAvisar(`Sugerencia REQ-${String(id).padStart(4, "0")} confirmada.`),
    onError: (err) => mostrarToast(err?.response?.data?.error ?? "No se pudo confirmar la sugerencia."),
  });

  // Alta desde Alertas (HU-8 -> HU-81): la alerta navega acá con estos
  // parámetros para abrir el modal ya precargado. Se leen una sola vez al
  // montar y se limpian de la URL para no quedar mezclados con los
  // filtros del listado.
  useEffect(() => {
    const origenParam = searchParams.get("origen");
    const articuloIdParam = Number(searchParams.get("articuloId"));
    if (origenParam === ORIGENES_REQUERIMIENTO.ALERTA && Number.isInteger(articuloIdParam) && articuloIdParam > 0) {
      setModal({
        prefill: {
          origen: ORIGENES_REQUERIMIENTO.ALERTA,
          depositoId: searchParams.get("depositoId") ?? "",
          articuloId: articuloIdParam,
          cantidad: searchParams.get("cantidad") ?? "",
        },
      });
      const params = new URLSearchParams(searchParams);
      ["origen", "articuloId", "cantidad", "depositoId"].forEach((k) => params.delete(k));
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const puedeVerPagina = puede("crearRequerimiento");

  const { data: resumen } = useQuery({
    queryKey: ["requerimientos-resumen", { q, depositoId, tipo }],
    queryFn: () => obtenerResumenRequerimientos({ q, depositoId, tipo }),
    enabled: puedeVerPagina,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["requerimientos", { q, estado, categoria, soloUrgentesAbiertas, depositoId, tipo, page }],
    // incluirAnulados: esta es la pantalla de seguimiento — un anulado se ve
    // igual (con su propio badge), no desaparece del historial.
    queryFn: () =>
      listarRequerimientos({
        q,
        estado,
        categoria,
        urgente: soloUrgentesAbiertas ? "1" : undefined,
        soloAbiertas: soloUrgentesAbiertas ? "1" : undefined,
        depositoId,
        tipo,
        page,
        pageSize: PAGE_SIZE,
        incluirAnulados: true,
      }),
    enabled: puedeVerPagina,
  });

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });

  // Estado (dropdown), categoría (tarjeta) y "urgentes abiertas" (tarjeta)
  // son 3 formas mutuamente excluyentes de acotar por estado — elegir una
  // limpia las otras dos, así nunca se pisan entre sí.
  function limpiarFiltrosDeEstado(params) {
    ["estado", "categoria", "urgente", "soloAbiertas"].forEach((k) => params.delete(k));
  }

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (clave === "estado") limpiarFiltrosDeEstado(params);
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    params.set("page", "1");
    setSearchParams(params);
  }

  function alternarCategoria(cat) {
    const params = new URLSearchParams(searchParams);
    limpiarFiltrosDeEstado(params);
    if (categoria !== cat) params.set("categoria", cat);
    params.set("page", "1");
    setSearchParams(params);
  }

  function alternarUrgentesAbiertas() {
    const params = new URLSearchParams(searchParams);
    limpiarFiltrosDeEstado(params);
    if (!soloUrgentesAbiertas) {
      params.set("urgente", "1");
      params.set("soloAbiertas", "1");
    }
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
    ["q", "estado", "categoria", "urgente", "soloAbiertas", "depositoId", "tipo"].forEach((k) => params.delete(k));
    params.set("page", "1");
    setSearchParams(params);
  }

  const hayFiltros = q || estado || categoria || soloUrgentesAbiertas || depositoId || tipo;

  // Acción principal de la fila (punto 6): una sola, siempre visible,
  // cambia según el estado. "Ver" es el default para cualquier estado sin
  // acción propia — reemplaza a los tres bloques de botones sueltos que
  // había antes (uno por cada acción condicional).
  function accionPrincipal(r) {
    const ver = { label: "Ver", variante: "secundario", onClick: () => navigate(`/requerimientos/${r.id}`) };
    if (r.anulado) return ver;
    if (r.estado === ESTADOS_REQUERIMIENTO.SUGERIDA && puede("gestionarSugerencias")) {
      return {
        label: "Confirmar",
        disabled: mutacionConfirmarSugerencia.isPending,
        onClick: () => mutacionConfirmarSugerencia.mutate(r.id),
      };
    }
    if (
      r.estado === ESTADOS_REQUERIMIENTO.PENDIENTE &&
      r.tipo === TIPOS_REQUERIMIENTO.COMPRA &&
      puede("gestionarPresupuestos")
    ) {
      return { label: "Solicitar presupuesto", onClick: () => navigate(`/presupuestos?solicitarRequerimientoId=${r.id}`) };
    }
    return ver;
  }

  // Acciones secundarias: las mismas que ya existían por estado, solo que
  // ahora conviven al lado de una acción principal fija en vez de ser tres
  // grupos que se mostraban o no según el caso.
  function accionesSecundarias(r) {
    if (r.anulado) return [];
    if (r.estado === ESTADOS_REQUERIMIENTO.SUGERIDA) {
      return puede("gestionarSugerencias") ? [{ label: "Descartar", variante: "destructivo", onClick: () => setParaAnular(r) }] : [];
    }
    if (r.estado === ESTADOS_REQUERIMIENTO.PENDIENTE && puede("crearRequerimiento")) {
      const secundarias = [];
      if (r.tipo === TIPOS_REQUERIMIENTO.COMPRA && r.urgente && puede("gestionarPresupuestos")) {
        secundarias.push({ label: "Compra express", onClick: () => setParaCompraExpress(r) });
      }
      secundarias.push({ label: "Editar", variante: "secundario", onClick: () => setModal({ requerimientoId: r.id }) });
      secundarias.push({ label: "Anular", variante: "destructivo", onClick: () => setParaAnular(r) });
      return secundarias;
    }
    return [];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <ClipboardList size={24} className="text-pino" /> Requerimientos de Reposición
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU-81 — el pedido interno que arranca el ciclo de compra
        </p>
      </div>

      {!puedeVerPagina ? (
        <SinPermiso />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {TARJETAS.map((t) => {
              const activa = categoria === t.categoria;
              return (
                <button
                  key={t.categoria}
                  type="button"
                  onClick={() => alternarCategoria(t.categoria)}
                  className={`cursor-pointer rounded-[18px] bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(46,43,37,0.14)] transition-colors ${
                    activa ? "ring-2 ring-pino" : "hover:bg-hueso"
                  }`}
                >
                  <div className={`flex items-center gap-1.5 font-body text-[11px] uppercase tracking-[0.08em] ${t.clase}`}>
                    <t.icon size={13} /> {t.label}
                  </div>
                  <Cifra tamano={28}>{resumen?.[t.campoResumen] ?? "—"}</Cifra>
                </button>
              );
            })}
            <button
              type="button"
              onClick={alternarUrgentesAbiertas}
              className={`cursor-pointer rounded-[18px] bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(46,43,37,0.14)] transition-colors ${
                soloUrgentesAbiertas ? "ring-2 ring-pino" : "hover:bg-hueso"
              }`}
            >
              <div className="flex items-center gap-1.5 font-body text-[11px] uppercase tracking-[0.08em] text-error-texto">
                <Flame size={13} /> Urgentes abiertas
              </div>
              <Cifra tamano={28}>{resumen?.urgentesAbiertas ?? "—"}</Cifra>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
              <input
                value={q}
                onChange={(e) => actualizarFiltro("q", e.target.value)}
                placeholder="Buscar por número, depósito o solicitante…"
                className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </div>

            <Select value={depositoId} onChange={(e) => actualizarFiltro("depositoId", e.target.value)}>
              <option value="">Todos los depósitos</option>
              {(depositos ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </Select>

            <Select value={tipo} onChange={(e) => actualizarFiltro("tipo", e.target.value)}>
              <option value="">Compra y transferencia</option>
              <option value={TIPOS_REQUERIMIENTO.COMPRA}>Solo compra</option>
              <option value={TIPOS_REQUERIMIENTO.TRANSFERENCIA}>Solo transferencia</option>
            </Select>

            <Select value={estado} onChange={(e) => actualizarFiltro("estado", e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.values(ESTADOS_REQUERIMIENTO).map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>

            {hayFiltros && <LimpiarFiltros onClick={limpiarFiltros} />}

            {puede("crearRequerimiento") && (
              <Button onClick={() => setModal({ prefill: null })}>+ Nuevo requerimiento</Button>
            )}
          </div>

          {isLoading && <p className="text-sm text-piedra">Cargando requerimientos…</p>}
          {isError && <p className="text-sm text-error">No se pudieron cargar los requerimientos.</p>}

          {data && (
            <div className="rounded-lg border border-borde bg-white p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-piedra">
                  {data.total} requerimiento{data.total === 1 ? "" : "s"}
                </div>
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 font-body text-[11px] text-piedra">
                  <span className="font-semibold uppercase tracking-[0.06em] text-tinta/55">Progreso:</span>
                  {LEYENDA_PROGRESO.map((l) => (
                    <span key={l.clave} className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${COLOR_POR_ESTADO_PASO[l.clave]}`} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
              <Table
                columnas={["N°", "Tipo", "Fecha", "Depósito", "Artículos", "Progreso", "Estado", "Acciones"]}
                columnasDerecha={["Artículos", "Acciones"]}
                filas={data.items}
                vacio={hayFiltros ? "Ningún requerimiento coincide con los filtros." : "Todavía no hay requerimientos cargados."}
                renderFila={(r) => {
                  const cat = categoriaDeRequerimiento(r);
                  const principal = accionPrincipal(r);
                  const secundarias = accionesSecundarias(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/requerimientos/${r.id}`)}
                      className={`cursor-pointer border-b border-borde align-middle transition-colors last:border-0 hover:bg-hueso ${r.anulado ? "opacity-55" : ""}`}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex flex-col gap-1">
                          <CodigoClave>REQ-{String(r.id).padStart(4, "0")}</CodigoClave>
                          {(r.urgente || r.origen !== ORIGENES_REQUERIMIENTO.MANUAL) && (
                            <span className="flex flex-wrap gap-1">
                              {r.urgente && (
                                <Badge variante="error">
                                  <Flame size={11} /> Urgente
                                </Badge>
                              )}
                              {r.origen !== ORIGENES_REQUERIMIENTO.MANUAL && (
                                <Badge variante="neutro">
                                  <Bot size={11} /> Automática
                                </Badge>
                              )}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <Badge variante="neutro">
                          {r.tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA ? "Transferencia" : "Compra"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 align-middle font-body text-[12.5px] whitespace-nowrap">{formatearTimestamp(r.fecha)}</td>
                      <td className="max-w-[160px] truncate px-3 py-2.5 align-middle font-body text-[12.5px] font-semibold" title={r.deposito?.nombre}>
                        {r.deposito?.nombre}
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle font-body text-[12.5px]">{r.cantidadArticulos}</td>
                      <td className="px-3 py-2.5 align-middle">
                        {!r.anulado && r.estado !== ESTADOS_REQUERIMIENTO.RECHAZADA && (
                          <MiniPasos {...construirEtapasRequerimiento(r)} />
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-1.5">
                          {r.anulado ? (
                            <Badge variante="neutro">Anulado</Badge>
                          ) : (
                            <Badge variante={VARIANTE_POR_CATEGORIA[cat] ?? "neutro"}>{r.estado}</Badge>
                          )}
                          {/* Secundario a propósito — un ícono chico con
                              tooltip, no otro badge, mismo criterio que
                              alertaFacturacion en OrdenesCompraPage. Solo
                              tiene sentido para COMPRA: una TRANSFERENCIA
                              nunca pasa por presupuesto/OC. */}
                          {!r.anulado &&
                            r.estado === ESTADOS_REQUERIMIENTO.APROBADO &&
                            r.tipo === TIPOS_REQUERIMIENTO.COMPRA &&
                            (r.tieneOC ? (
                              <span title="Ya tiene una Orden de Compra generada">
                                <ShoppingCart size={13} className="text-pino/70" />
                              </span>
                            ) : (
                              <span title="Aprobado — todavía no se generó la Orden de Compra">
                                <Clock size={13} className="text-laton-700" />
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right align-middle">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button variante={principal.variante} tamano="fila" disabled={principal.disabled} onClick={principal.onClick}>
                            {principal.label}
                          </Button>
                          <MenuAcciones acciones={secundarias} />
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

          <p className="flex items-center gap-1.5 border-t border-dashed border-borde pt-3 text-xs text-piedra">
            <Bot size={13} className="flex-none" /> marca los requerimientos que generó el sistema solo (alerta de
            stock mínimo o transferencia sin stock). Un requerimiento llega a "Aprobado" solamente cuando el gerente
            adjudica uno de sus presupuestos.
          </p>
        </div>
      )}

      {modal && (
        <RequerimientoModal
          prefill={modal.prefill}
          requerimientoId={modal.requerimientoId}
          onClose={() => setModal(null)}
          onExito={(mensaje) => {
            setModal(null);
            invalidarYAvisar(mensaje);
          }}
        />
      )}

      {paraAnular && (
        <AnularRequerimientoModal
          requerimiento={paraAnular}
          onClose={() => setParaAnular(null)}
          onExito={(mensaje) => {
            setParaAnular(null);
            invalidarYAvisar(mensaje);
          }}
        />
      )}

      {paraCompraExpress && (
        <CompraExpressModal
          requerimientoId={paraCompraExpress.id}
          onClose={() => setParaCompraExpress(null)}
          onExito={(mensaje) => {
            setParaCompraExpress(null);
            invalidarYAvisar(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
