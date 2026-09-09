import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FileText, Search, Zap } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { CodigoClave } from "../../componentes/CodigoClave";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { LimpiarFiltros } from "../../componentes/LimpiarFiltros";
import { Toast } from "../../componentes/Toast";
import { ComparacionPresupuestosPage } from "./ComparacionPresupuestosPage";
import { SolicitarPresupuestosModal } from "./SolicitarPresupuestosModal";
import { listarRequerimientos } from "../requerimientos/requerimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import {
  ESTADOS_REQUERIMIENTO,
  VARIANTE_ESTADO_REQUERIMIENTO,
  ORIGENES_REQUERIMIENTO,
  TIPOS_REQUERIMIENTO,
} from "../../lib/constantes";
import { formatearTimestamp, diasDesde } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";

// El ciclo completo que se ve acá, en un solo lugar (nada de esto pasa por
// la ficha del requerimiento, que es solo seguimiento): "Por solicitar"
// (Pendiente, todavía no se invitó a ningún proveedor) -> "En cotización"
// (ya se pidió, puede tener respuestas cargadas o no) -> "Adjudicados"
// (HU-84, ya se eligió un ganador). "Todos" (valor "", igual que
// RequerimientosPage/ArticulosLista/ProveedoresLista) es la bandeja por
// defecto: todo lo que pasó o está pasando por el circuito, para después
// acotar con estas mismas pestañas — mismos colores que RequerimientosPage
// (Todos=tinta, Por solicitar/En cotización=laton, Adjudicados=pino) para
// que el mismo estado se vea igual en las dos pantallas.
// "Todos" (bug reportado) no es de verdad "todo lo que hay tipo COMPRA" —
// es "todo lo que sigue activo en ESTE circuito de 3 etapas". "Sugerida"
// vive en /requerimientos (todavía no es un pedido confirmado, nada que
// cotizar); "Cerrada"/"Rechazada" ya salieron del circuito (la compra
// terminó o se descartó) — mostrarlas acá era ruido, no señal.
const ESTADOS_CIRCUITO_PRESUPUESTOS = [
  ESTADOS_REQUERIMIENTO.PENDIENTE,
  ESTADOS_REQUERIMIENTO.EN_COTIZACION,
  ESTADOS_REQUERIMIENTO.APROBADO,
];

const ESTADOS_FILTRO = [
  { valor: "", label: "Todos", activo: "border-tinta bg-tinta text-hueso" },
  { valor: ESTADOS_REQUERIMIENTO.PENDIENTE, label: "Por solicitar", activo: "border-laton bg-laton text-hueso" },
  { valor: ESTADOS_REQUERIMIENTO.EN_COTIZACION, label: "En cotización", activo: "border-laton bg-laton text-hueso" },
  { valor: ESTADOS_REQUERIMIENTO.APROBADO, label: "Adjudicados", activo: "border-pino bg-pino text-hueso" },
];

// Progreso de cotización dentro de la columna "Cotizaciones": ninguno
// cargó todavía (error, rojo — necesita seguimiento), algunos cargaron pero
// no todos (alerta, ámbar — en curso), todos los invitados cargaron (ok,
// verde — listo para comparar/adjudicar). Solo se llama cuando ya se
// solicitó al menos un presupuesto (cantidadPresupuestos > 0) — "Por
// solicitar" sigue mostrando "—", eso no es "cero cotizados" sino "nada
// pedido todavía", un caso distinto.
function varianteCotizaciones(cotizados, total) {
  if (cotizados === 0) return "error";
  if (cotizados < total) return "alerta";
  return "ok";
}

// Punto 4 del rediseño: más de este umbral sin respuesta de ningún
// proveedor invitado amerita seguimiento manual — número elegido a criterio
// (no hay un SLA formal de proveedores todavía), fácil de ajustar acá si
// hace falta más adelante.
const DIAS_ALERTA_SIN_RESPUESTA = 3;

// Orden por defecto (punto 5): prioriza lo más urgente de resolver dentro
// del circuito de presupuestos — primero lo que ni se solicitó (más viejo
// primero, porque es lo que lleva más tiempo sin arrancar), después lo que
// ya se solicitó y espera respuesta (más días esperando primero), y al
// final lo ya adjudicado (más reciente primero, es solo referencia). El
// pin de "urgente abierto" que ya aplica el backend se respeta como
// criterio previo — un urgente sigue arriba de todo, esto solo decide el
// orden DENTRO de cada uno de esos dos grupos.
function prioridadEstado(estado) {
  if (estado === ESTADOS_REQUERIMIENTO.PENDIENTE) return 0;
  if (estado === ESTADOS_REQUERIMIENTO.EN_COTIZACION) return 1;
  if (estado === ESTADOS_REQUERIMIENTO.APROBADO) return 2;
  // Cualquier otro estado no pertenece de verdad a este circuito (ver punto
  // 1, todavía sin resolver) — se dejan al final, no se les inventa un
  // criterio de orden que no pidieron.
  return 3;
}

function compararParaPresupuestos(a, b) {
  const pa = prioridadEstado(a.estado);
  const pb = prioridadEstado(b.estado);
  if (pa !== pb) return pa - pb;
  if (pa === 0) return new Date(a.fecha) - new Date(b.fecha); // Por solicitar: más antiguo primero
  if (pa === 1) {
    return diasDesde(b.fechaSolicitudCotizacion ?? b.fecha) - diasDesde(a.fechaSolicitudCotizacion ?? a.fecha); // En cotización: más días esperando primero
  }
  return new Date(b.fecha) - new Date(a.fecha); // Adjudicados (y el resto): más reciente primero
}

function ordenarPresupuestos(items) {
  const estadosFinalizados = [ESTADOS_REQUERIMIENTO.CERRADA, ESTADOS_REQUERIMIENTO.RECHAZADA];
  const esUrgenteAbierto = (r) => r.urgente && !r.anulado && !estadosFinalizados.includes(r.estado);
  return [...items].sort((a, b) => {
    const urgenteDiff = Number(esUrgenteAbierto(b)) - Number(esUrgenteAbierto(a));
    if (urgenteDiff !== 0) return urgenteDiff;
    return compararParaPresupuestos(a, b);
  });
}

// Una sola ruta /presupuestos con dos caras: con ?requerimientoId= es la
// comparación en columnas (HU-84); sin parámetro es la bandeja de
// requerimientos con presupuestos (en cualquier etapa), que es por dónde
// entra Compras/el gerente cuando hace click en el menú.
export function PresupuestosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const [paraSolicitar, setParaSolicitar] = useState(null);

  const requerimientoId = searchParams.get("requerimientoId");
  const q = searchParams.get("q") ?? "";
  const depositoId = searchParams.get("depositoId") ?? "";
  const estadoParam = searchParams.get("estado");
  const estado = ESTADOS_FILTRO.some((e) => e.valor === estadoParam) ? estadoParam : "";

  // Llega acá desde el botón "Solicitar presupuesto" de la ficha del
  // requerimiento (que es solo seguimiento, no elige proveedores) — abre
  // directo el selector para ese requerimiento puntual, parado en la
  // pestaña "Por solicitar". Se lee una sola vez al montar y se limpia de
  // la URL, mismo patrón que el prefill de Alertas en RequerimientosPage.
  useEffect(() => {
    const solicitarId = Number(searchParams.get("solicitarRequerimientoId"));
    if (Number.isInteger(solicitarId) && solicitarId > 0) {
      setParaSolicitar({ id: solicitarId });
      const params = new URLSearchParams(searchParams);
      params.delete("solicitarRequerimientoId");
      params.set("estado", ESTADOS_REQUERIMIENTO.PENDIENTE);
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bug reportado: sin `tipo`, esta pantalla traía TRANSFERENCIA además de
  // COMPRA (una transferencia nunca pide presupuesto a proveedores, no
  // pertenece acá bajo ningún estado).
  const { data, isLoading, isError } = useQuery({
    queryKey: ["requerimientos", { estado, q, depositoId, tipo: TIPOS_REQUERIMIENTO.COMPRA, pageSize: 50 }],
    queryFn: () => listarRequerimientos({ estado, q, depositoId, tipo: TIPOS_REQUERIMIENTO.COMPRA, pageSize: 50 }),
    enabled: !requerimientoId && (puede("gestionarPresupuestos") || puede("aprobarPresupuesto")),
  });

  // "Todos" (estado === "") no filtra por un único valor en el backend —
  // acá se lo acota al circuito de 3 etapas real (ver comentario de
  // ESTADOS_CIRCUITO_PRESUPUESTOS). Con una pestaña puntual seleccionada
  // esto no hace nada (el backend ya trajo un solo estado exacto).
  const items = (data?.items ?? []).filter(
    (r) => estado !== "" || ESTADOS_CIRCUITO_PRESUPUESTOS.includes(r.estado)
  );

  const { data: depositos } = useQuery({
    queryKey: ["depositos"],
    queryFn: listarDepositos,
    enabled: !requerimientoId,
  });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    setSearchParams(params);
  }

  function limpiarFiltros() {
    const params = new URLSearchParams(searchParams);
    ["q", "depositoId", "estado"].forEach((k) => params.delete(k));
    setSearchParams(params);
  }

  if (requerimientoId) return <ComparacionPresupuestosPage />;
  if (!puede("gestionarPresupuestos") && !puede("aprobarPresupuesto")) return <SinPermiso />;

  const hayFiltros = q || depositoId || estado !== "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <FileText size={24} className="text-pino" /> Presupuestos
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 82 a 84 — cotizaciones pedidas a proveedores, listas para comparar
        </p>
        <p className="mt-2 text-sm text-piedra">
          {estado === ""
            ? "Todos los requerimientos del circuito de presupuestos: filtrá por estado para acotar."
            : estado === ESTADOS_REQUERIMIENTO.PENDIENTE
              ? "Requerimientos listos para invitar proveedores a cotizar."
              : puede("aprobarPresupuesto")
                ? "Elegí un requerimiento para ver lo que cotizó cada proveedor y adjudicar uno."
                : "Requerimientos con presupuestos pedidos. Entrá a cada uno para cargar lo que cotizó cada proveedor."}
        </p>
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

        <div className="inline-flex overflow-hidden rounded-full border border-borde">
          {ESTADOS_FILTRO.map((e) => (
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
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando…</p>}
      {isError && <p className="text-sm text-error">No se pudieron cargar los requerimientos.</p>}

      {data && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <div className="mb-3 text-xs text-piedra">
            {items.length} requerimiento{items.length === 1 ? "" : "s"}{" "}
            {estado === ""
              ? "en el circuito de presupuestos"
              : estado === ESTADOS_REQUERIMIENTO.APROBADO
                ? "adjudicado(s)"
                : estado === ESTADOS_REQUERIMIENTO.PENDIENTE
                  ? "por solicitar"
                  : "en cotización"}
          </div>
          <Table
            columnas={["N°", "Fecha", "Depósito", "Artículos", "Cotizaciones", "Estado", ""]}
            columnasDerecha={["Artículos", "Cotizaciones"]}
            filas={ordenarPresupuestos(items)}
            vacio={hayFiltros ? "Ningún requerimiento coincide con los filtros." : "No hay requerimientos en este estado por ahora."}
            renderFila={(r) => {
              // Punto 2 del rediseño: tanto el botón como el click de la
              // fila reflejan si YA se solicitó cotización (tenga o no
              // respuestas todavía), no el estado puntual — más directo, y
              // evita que el botón diga "Solicitar" mientras el click de la
              // fila abriera la comparación (vacía) en vez del modal, que es
              // justo lo que pasaba con las filas que no pertenecen de
              // verdad a este circuito (ver punto 1, TRANSFERENCIA/Sugerida
              // sin presupuestos). Si de verdad no se puede pedir para este
              // requerimiento (tipo TRANSFERENCIA, o ya no está en
              // "Pendiente"), el propio modal lo va a rechazar con el error
              // real del backend — mejor eso que navegar a una pantalla
              // vacía sin explicación.
              const necesitaSolicitar = r.cantidadPresupuestos === 0;
              // Solicitar presupuestos es tarea de Compras — el gerente
              // puede ver este tab (transparencia sobre el pipeline) pero
              // no dispara el modal de acción.
              const puedeSolicitar = necesitaSolicitar && puede("gestionarPresupuestos");
              return (
                <tr
                  key={r.id}
                  onClick={() => {
                    if (necesitaSolicitar) {
                      if (puedeSolicitar) setParaSolicitar(r);
                    } else {
                      navigate(`/presupuestos?requerimientoId=${r.id}`);
                    }
                  }}
                  className={`border-b border-borde last:border-0 hover:bg-hueso ${
                    necesitaSolicitar && !puedeSolicitar ? "" : "cursor-pointer"
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <CodigoClave>REQ-{String(r.id).padStart(4, "0")}</CodigoClave>
                      {r.origen === ORIGENES_REQUERIMIENTO.ALERTA && (
                        <Zap size={13} className="text-laton" title="Generado desde una alerta de stock mínimo" />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{formatearTimestamp(r.fecha)}</td>
                  <td className="px-3 py-2 font-body text-[12.5px] font-semibold">{r.deposito?.nombre}</td>
                  <td className="px-3 py-2 text-right font-body text-[12.5px]">{r.cantidadArticulos}</td>
                  <td className="px-3 py-2 text-right font-body text-[12.5px]">
                    {r.cantidadPresupuestos === 0 ? (
                      <span className="text-piedra">Sin solicitar</span>
                    ) : (
                      <Badge variante={varianteCotizaciones(r.presupuestosCotizados, r.cantidadPresupuestos)}>
                        {r.presupuestosCotizados}/{r.cantidadPresupuestos}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[r.estado] ?? "neutro"}>{r.estado}</Badge>
                    {r.estado === ESTADOS_REQUERIMIENTO.EN_COTIZACION &&
                      r.fechaSolicitudCotizacion &&
                      (() => {
                        const dias = diasDesde(r.fechaSolicitudCotizacion);
                        const alerta = dias > DIAS_ALERTA_SIN_RESPUESTA;
                        return (
                          <div className={`mt-1 flex items-center gap-1 text-[10.5px] ${alerta ? "text-error" : "text-piedra"}`}>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${alerta ? "bg-error" : "bg-piedra"}`} />
                            {dias === 0 ? "Solicitado hoy" : `${dias} día${dias === 1 ? "" : "s"} esperando respuesta`}
                          </div>
                        );
                      })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {necesitaSolicitar && !puedeSolicitar ? (
                      <span className="text-[11.5px] text-piedra">Sin acción</span>
                    ) : (
                      <Button variante="secundario" tamano="fila">
                        {necesitaSolicitar ? "Solicitar →" : "Comparar →"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            }}
          />
        </div>
      )}

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
        El ⚡ marca los requerimientos generados desde una alerta de stock mínimo.
      </p>

      {paraSolicitar && (
        <SolicitarPresupuestosModal
          requerimientoId={paraSolicitar.id}
          onClose={() => setParaSolicitar(null)}
          onExito={(mensaje) => {
            setParaSolicitar(null);
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
