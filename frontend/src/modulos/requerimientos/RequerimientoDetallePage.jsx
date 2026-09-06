import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Zap, FileText, ChevronRight } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { PasoAPaso } from "../../componentes/PasoAPaso";
import { SinPermiso } from "../../componentes/SinPermiso";
import { obtenerRequerimiento } from "./requerimientos.api";
import { listarPresupuestos } from "../presupuestos/presupuestos.api";
import { consultarStock } from "../stock/stock.api";
import {
  ESTADOS_REQUERIMIENTO,
  VARIANTE_ESTADO_REQUERIMIENTO,
  VARIANTE_ESTADO_PRESUPUESTO,
  ORIGENES_REQUERIMIENTO,
} from "../../lib/constantes";
import { formatearFechaSolo } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { variantePorStock } from "../../lib/alertas";
import { useSesion } from "../../lib/sesion";

// Texto (no pill) para el valor de stock línea por línea — mismos tonos
// que ya usa <Badge> por variante, aplicados directo al número en vez de
// envolverlo en una píldora.
const COLOR_TEXTO_POR_VARIANTE = {
  ok: "text-tinta",
  alerta: "text-laton-700",
  error: "text-error-texto",
};

// Mismo orden que ESTADOS_REQUERIMIENTO: un requerimiento nunca "retrocede"
// de paso, así que alcanza con comparar el índice del estado actual contra
// cada paso para saber si ya se cumplió, es el actual, o todavía no llega.
const PASOS = [
  { clave: ESTADOS_REQUERIMIENTO.PENDIENTE, label: "Pendiente" },
  { clave: ESTADOS_REQUERIMIENTO.EN_COTIZACION, label: "En cotización" },
  { clave: ESTADOS_REQUERIMIENTO.APROBADO, label: "Aprobado" },
];

// Esta pantalla es de seguimiento — mostrar en qué estado está el
// requerimiento y qué se pidió. La única acción que vive acá es el
// disparador de "Solicitar presupuesto"; elegir a qué proveedores
// invitar a cotizar (y todo lo demás: cargar cotizaciones, comparar,
// adjudicar) pasa a la sección Presupuestos.
export function RequerimientoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puede } = useSesion();

  const { data: req, isLoading, isError } = useQuery({
    queryKey: ["requerimiento", id],
    queryFn: () => obtenerRequerimiento(id),
  });

  // Stock actual por artículo, para marcar en la tabla si lo pedido sigue
  // siendo crítico (mismo criterio que HU-8: stockActual <= stockMinimo).
  const { data: filasStock } = useQuery({
    queryKey: ["stock", { depositoId: req?.depositoId }],
    queryFn: () => consultarStock({ depositoId: req.depositoId }),
    enabled: Boolean(req?.depositoId),
  });

  // Totales ya calculados del lado del servidor (subtotal, flete, total) —
  // mismo endpoint que usa la comparación de HU-84, no se recalcula nada
  // acá. req.presupuestos (de obtenerRequerimiento) no trae esos totales,
  // solo alcanza para saber si hay alguno y en qué estado.
  const tienePresupuestos = (req?.presupuestos?.length ?? 0) > 0;
  const { data: presupuestosData } = useQuery({
    queryKey: ["presupuestos", { requerimientoId: id }],
    queryFn: () => listarPresupuestos({ requerimientoId: id }),
    enabled: tienePresupuestos,
  });

  if (!puede("crearRequerimiento")) return <SinPermiso />;
  if (isLoading) return <p className="text-sm text-piedra">Cargando requerimiento…</p>;
  if (isError || !req) return <p className="text-sm text-error">No se pudo cargar el requerimiento.</p>;

  const origenAlerta = req.origen === ORIGENES_REQUERIMIENTO.ALERTA;
  const pasoActual = PASOS.findIndex((p) => p.clave === req.estado);
  const stockPorArticulo = new Map((filasStock ?? []).map((f) => [f.articuloId, f]));
  const presupuestos = presupuestosData?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => navigate("/requerimientos")}
        className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
      >
        <ArrowLeft size={15} /> Volver a requerimientos
      </button>

      {/* Todo el seguimiento de este requerimiento vive en un solo
          contenedor — título, estado, artículos, acción y presupuestos
          recibidos — en vez de repartirlo en varias tarjetas sueltas. */}
      <div className="flex flex-col gap-5 rounded-lg border border-borde bg-white p-6">
        <div>
          <h1 className="flex flex-wrap items-center gap-2.5 font-heading text-[28px] font-semibold">
            REQ-{String(req.id).padStart(4, "0")}
            {req.deposito?.nombre && ` · ${req.deposito.nombre}`}
            {origenAlerta && (
              <span className="inline-flex items-center gap-1 rounded-full bg-laton-100 px-2.5 py-1 text-[11px] font-semibold text-laton-700">
                <Zap size={12} /> Automático
              </span>
            )}
            {req.anulado ? (
              <Badge variante="neutro">Anulado</Badge>
            ) : (
              <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[req.estado] ?? "neutro"}>{req.estado}</Badge>
            )}
          </h1>
          <p className="mt-1.5 text-[12.5px] text-tinta/60">
            {origenAlerta ? "Generado automáticamente · alerta de stock mínimo" : "Carga manual"}
            {" · "}
            {formatearFechaSolo(req.fecha)}
            {req.solicitante && ` · solicitó ${req.solicitante}`}
          </p>
        </div>

        {req.anulado ? (
          <div className="rounded-lg border border-error bg-error-suave px-5 py-4 text-[13px] text-error-texto">
            <strong>Requerimiento anulado.</strong> {req.motivoAnulacion}
          </div>
        ) : (
          // Un requerimiento nunca retrocede de paso — el mismo orden que
          // ESTADOS_REQUERIMIENTO, sin acción manual de por medio (la única
          // forma de llegar a "Aprobado" es que el gerente adjudique un
          // presupuesto, ver nota al pie).
          <PasoAPaso pasos={PASOS} pasoActual={pasoActual} />
        )}

        <div className="overflow-hidden rounded-xl border border-borde">
          <Table
            columnas={["N° Requerimiento", "Artículo", "Cantidad", "Stock actual"]}
            columnasDerecha={["Cantidad", "Stock actual"]}
            encabezadoDestacado
            filas={req.detalle}
            renderFila={(d) => {
              const stock = stockPorArticulo.get(d.articuloId);
              const varianteStock = stock ? variantePorStock(stock.stockActual, stock.stockMinimo) : "ok";
              return (
                <tr key={d.id} className="border-b border-borde last:border-0">
                  <td className="px-3 py-3.5 font-mono text-xs text-tinta/70">REQ-{String(req.id).padStart(4, "0")}</td>
                  <td className="px-3 py-3.5 font-body text-[14px] text-tinta">{d.articulo?.nombre}</td>
                  <td className="px-3 py-3.5 text-right font-body text-[14px] text-tinta">
                    {Number(d.cantidadSolicitada)} <span className="text-tinta/55">{d.articulo?.unidadMedida}</span>
                  </td>
                  <td className={`px-3 py-3.5 text-right font-body text-[14px] font-semibold ${COLOR_TEXTO_POR_VARIANTE[varianteStock]}`}>
                    {stock ? (
                      <>
                        {Number(stock.stockActual)} <span className="font-normal text-tinta/55">{d.articulo?.unidadMedida}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            }}
          />
        </div>

        {!req.anulado && req.estado === ESTADOS_REQUERIMIENTO.PENDIENTE && puede("gestionarPresupuestos") && (
          <Button
            className="w-full justify-center gap-2 py-3 text-[14px]"
            onClick={() => navigate(`/presupuestos?solicitarRequerimientoId=${req.id}`)}
          >
            <FileText size={16} /> Solicitar presupuesto
          </Button>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-[16px] font-semibold text-tinta">
              {tienePresupuestos ? `Presupuestos recibidos · ${req.presupuestos.length}` : "Presupuestos"}
            </h2>
            {tienePresupuestos && (
              <button
                type="button"
                onClick={() => navigate(`/presupuestos?requerimientoId=${req.id}`)}
                className="cursor-pointer text-[12.5px] font-semibold text-pino hover:underline"
              >
                Comparar
              </button>
            )}
          </div>

          {!tienePresupuestos ? (
            <p className="text-[12.5px] text-piedra">Todavía no se solicitó ningún presupuesto para este requerimiento.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {presupuestos.map((p) => {
                const cotizo = (p.detalle?.length ?? 0) > 0;
                return (
                  // Solo lectura: entra a ver el presupuesto (proveedor,
                  // precios, estado) — nunca a cargarlo. Esa acción vive
                  // exclusivamente en la comparación de Presupuestos.
                  <div
                    key={p.id}
                    onClick={() => navigate(`/presupuestos/${p.id}`)}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-borde px-4 py-3 hover:bg-hueso"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-body text-[14px] font-semibold text-tinta">{p.proveedor?.razonSocial}</div>
                      <div className="text-[11.5px] text-piedra">
                        {p.plazoEntrega ? `Entrega ${p.plazoEntrega}` : "Plazo de entrega sin cargar"}
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-3">
                      <span className="font-heading text-[15px] text-tinta">{cotizo ? `$ ${formatearMonto(p.total)}` : "—"}</span>
                      <Badge variante={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? "neutro"}>{p.estado}</Badge>
                      <ChevronRight size={16} className="text-piedra" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
        Un requerimiento pasa a "Aprobado" únicamente como consecuencia de que el gerente adjudique uno de sus
        presupuestos — no hay una acción de "aprobar requerimiento" por separado.
      </p>
    </div>
  );
}
