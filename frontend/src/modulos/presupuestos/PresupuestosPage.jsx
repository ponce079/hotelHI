import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FileText, Search, Zap } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { LimpiarFiltros } from "../../componentes/LimpiarFiltros";
import { Toast } from "../../componentes/Toast";
import { ComparacionPresupuestosPage } from "./ComparacionPresupuestosPage";
import { SolicitarPresupuestosModal } from "./SolicitarPresupuestosModal";
import { listarRequerimientos } from "../requerimientos/requerimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { ESTADOS_REQUERIMIENTO, VARIANTE_ESTADO_REQUERIMIENTO, ORIGENES_REQUERIMIENTO } from "../../lib/constantes";
import { formatearFechaSolo } from "../../lib/fechas";
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["requerimientos", { estado, q, depositoId, pageSize: 50 }],
    queryFn: () => listarRequerimientos({ estado, q, depositoId, pageSize: 50 }),
    enabled: !requerimientoId && (puede("gestionarPresupuestos") || puede("aprobarPresupuesto")),
  });

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
            {data.total} requerimiento{data.total === 1 ? "" : "s"}{" "}
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
            filas={data.items}
            vacio={hayFiltros ? "Ningún requerimiento coincide con los filtros." : "No hay requerimientos en este estado por ahora."}
            renderFila={(r) => {
              const esPorSolicitar = r.estado === ESTADOS_REQUERIMIENTO.PENDIENTE;
              // Solicitar presupuestos es tarea de Compras — el gerente
              // puede ver este tab (transparencia sobre el pipeline) pero
              // no dispara el modal de acción.
              const puedeSolicitar = esPorSolicitar && puede("gestionarPresupuestos");
              return (
                <tr
                  key={r.id}
                  onClick={() => {
                    if (esPorSolicitar) {
                      if (puedeSolicitar) setParaSolicitar(r);
                    } else {
                      navigate(`/presupuestos?requerimientoId=${r.id}`);
                    }
                  }}
                  className={`border-b border-borde last:border-0 hover:bg-hueso ${
                    esPorSolicitar && !puedeSolicitar ? "" : "cursor-pointer"
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <span className="inline-flex items-center gap-1">
                      REQ-{String(r.id).padStart(4, "0")}
                      {r.origen === ORIGENES_REQUERIMIENTO.ALERTA && (
                        <Zap size={13} className="text-laton" title="Generado desde una alerta de stock mínimo" />
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{formatearFechaSolo(r.fecha)}</td>
                  <td className="px-3 py-2 font-body text-[12.5px] font-semibold">{r.deposito?.nombre}</td>
                  <td className="px-3 py-2 text-right font-body text-[12.5px]">{r.cantidadArticulos}</td>
                  <td className="px-3 py-2 text-right font-body text-[12.5px]">
                    {r.cantidadPresupuestos === 0 ? (
                      <span className="text-piedra">—</span>
                    ) : (
                      <Badge variante={varianteCotizaciones(r.presupuestosCotizados, r.cantidadPresupuestos)}>
                        {r.presupuestosCotizados}/{r.cantidadPresupuestos}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[r.estado] ?? "neutro"}>{r.estado}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {esPorSolicitar && !puedeSolicitar ? (
                      <span className="text-[11.5px] text-piedra">Sin acción</span>
                    ) : (
                      <Button variante="secundario" tamano="fila">
                        {esPorSolicitar ? "Solicitar →" : "Comparar →"}
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
