import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Flame, Bot, FileText, ChevronRight, Printer, Copy, AlertTriangle } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { PasoAPaso } from "../../componentes/PasoAPaso";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { useToast } from "../../lib/useToast";
import { obtenerRequerimiento, confirmarSugerencia } from "./requerimientos.api";
import { AnularRequerimientoModal } from "./AnularRequerimientoModal";
import { RequerimientoModal } from "./RequerimientoModal";
import { listarPresupuestos } from "../presupuestos/presupuestos.api";
import { consultarStock } from "../stock/stock.api";
import {
  ESTADOS_REQUERIMIENTO,
  VARIANTE_ESTADO_REQUERIMIENTO,
  VARIANTE_ESTADO_PRESUPUESTO,
  ORIGENES_REQUERIMIENTO,
  TIPOS_REQUERIMIENTO,
} from "../../lib/constantes";
import { formatearTimestamp } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { variantePorStock } from "../../lib/alertas";
import { useSesion } from "../../lib/sesion";
import { construirEtapasRequerimiento } from "../../lib/requerimientosTimeline";

// Texto (no pill) para el valor de stock línea por línea — mismos tonos
// que ya usa <Badge> por variante, aplicados directo al número en vez de
// envolverlo en una píldora.
const COLOR_TEXTO_POR_VARIANTE = {
  ok: "text-tinta",
  alerta: "text-laton-700",
  error: "text-error-texto",
};

// Esta pantalla es de seguimiento — mostrar en qué estado está el
// requerimiento y qué se pidió. Las únicas acciones que viven acá son
// Anular, Solicitar presupuesto (o Confirmar/Descartar si nació como
// sugerencia del central) y Duplicar; elegir a qué proveedores invitar a
// cotizar (y todo lo demás: cargar cotizaciones, comparar, adjudicar) pasa
// a la sección Presupuestos.
export function RequerimientoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puede, usuario } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [paraAnular, setParaAnular] = useState(false);
  const [duplicando, setDuplicando] = useState(false);

  const { data: req, isLoading, isError } = useQuery({
    queryKey: ["requerimiento", id],
    queryFn: () => obtenerRequerimiento(id),
  });

  const mutacionConfirmarSugerencia = useMutation({
    mutationFn: () => confirmarSugerencia(id, usuario),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requerimiento", id] });
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      mostrarToast(`Sugerencia REQ-${String(id).padStart(4, "0")} confirmada.`);
    },
    onError: (err) => mostrarToast(err?.response?.data?.error ?? "No se pudo confirmar la sugerencia."),
  });

  // Stock actual por artículo en el depósito SOLICITANTE, para marcar en
  // la tabla si lo pedido sigue siendo crítico (mismo criterio que HU-8).
  const { data: filasStock } = useQuery({
    queryKey: ["stock", { depositoId: req?.depositoId }],
    queryFn: () => consultarStock({ depositoId: req.depositoId }),
    enabled: Boolean(req?.depositoId),
  });

  // Punto 6 — "Disponible en central": solo hace falta pedirlo cuando la
  // transferencia está bloqueada por falta de stock; en cualquier otro
  // estado la tabla no necesita esta columna.
  const bloqueadaPorStock = req?.tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA && req?.estado === ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK;
  const { data: filasStockCentral } = useQuery({
    queryKey: ["stock", { depositoId: req?.depositoCentralId }],
    queryFn: () => consultarStock({ depositoId: req.depositoCentralId }),
    enabled: Boolean(bloqueadaPorStock && req?.depositoCentralId),
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

  const esTransferencia = req.tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA;
  const { pasos: etapasConSublabel, pasoActual: etapaActual } = construirEtapasRequerimiento(req);
  const stockPorArticulo = new Map((filasStock ?? []).map((f) => [f.articuloId, f]));
  const stockCentralPorArticulo = new Map((filasStockCentral ?? []).map((f) => [f.articuloId, f]));
  const presupuestos = presupuestosData?.items ?? [];

  // Punto 4 — motivo guardado y visible para Rechazada/Anulada, con
  // "Duplicar" como única acción disponible.
  const esTerminalNegativo = req.anulado || req.estado === ESTADOS_REQUERIMIENTO.RECHAZADA;
  const motivoTerminal = req.anulado ? req.motivoAnulacion : req.log?.slice().reverse().find((l) => l.accion?.toLowerCase().includes("rechaz"))?.accion;

  function accionesContextuales() {
    if (esTerminalNegativo) return null;
    if (req.estado === ESTADOS_REQUERIMIENTO.SUGERIDA && puede("gestionarSugerencias")) {
      return (
        <div className="flex gap-2.5 print:hidden">
          <Button
            className="flex-1 justify-center py-3 text-[14px]"
            disabled={mutacionConfirmarSugerencia.isPending}
            onClick={() => mutacionConfirmarSugerencia.mutate()}
          >
            {mutacionConfirmarSugerencia.isPending ? "Confirmando…" : "Confirmar"}
          </Button>
          <Button variante="destructivo" className="flex-1 justify-center py-3 text-[14px]" onClick={() => setParaAnular(true)}>
            Descartar
          </Button>
        </div>
      );
    }
    if (req.estado === ESTADOS_REQUERIMIENTO.PENDIENTE && puede("crearRequerimiento")) {
      return (
        <div className="flex gap-2.5 print:hidden">
          {!esTransferencia && puede("gestionarPresupuestos") && (
            <Button
              className="flex-1 justify-center gap-2 py-3 text-[14px]"
              onClick={() => navigate(`/presupuestos?solicitarRequerimientoId=${req.id}`)}
            >
              <FileText size={16} /> Solicitar presupuesto
            </Button>
          )}
          <Button variante="destructivo" className="flex-1 justify-center py-3 text-[14px]" onClick={() => setParaAnular(true)}>
            Anular
          </Button>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Auditoría de botones, P2.2: "Volver" es navegación de bajo
          compromiso — mismo componente que el resto de las pantallas de
          detalle, ya no un <button> aparte con su propio estilo. */}
      <Button
        variante="fantasma"
        onClick={() => navigate("/requerimientos")}
        className="w-fit text-xs print:hidden"
      >
        <ArrowLeft size={15} /> Volver a requerimientos
      </Button>

      {/* Todo el seguimiento de este requerimiento vive en un solo
          contenedor — título, estado, timeline, artículos, acción y
          presupuestos recibidos — en vez de repartirlo en varias tarjetas
          sueltas. Punto 5: al imprimir, print:hidden saca todo lo que no
          es el comprobante en sí (mismo patrón que ya usa Layout.jsx para
          el sidebar). */}
      <div className="flex flex-col gap-5 rounded-lg border border-borde bg-white p-6 print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-2.5 font-heading text-[28px] font-semibold">
              REQ-{String(req.id).padStart(4, "0")}
              {req.urgente && (
                <Badge variante="error">
                  <Flame size={11} /> Urgente
                </Badge>
              )}
              {req.origen !== ORIGENES_REQUERIMIENTO.MANUAL && (
                <Badge variante="neutro">
                  <Bot size={11} /> Automática
                </Badge>
              )}
              {req.anulado ? (
                <Badge variante="neutro">Anulado</Badge>
              ) : (
                <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[req.estado] ?? "neutro"}>{req.estado}</Badge>
              )}
            </h1>
            <p className="mt-1.5 text-[12.5px] text-tinta/60">
              {req.deposito?.nombre} · {esTransferencia ? "Transferencia" : "Compra"}
              {" · "}
              {req.origen === ORIGENES_REQUERIMIENTO.ALERTA
                ? "Generado automáticamente · alerta de stock mínimo"
                : req.origen === ORIGENES_REQUERIMIENTO.TRANSFERENCIA_BLOQUEADA
                  ? "Generado automáticamente · reposición del central"
                  : "Carga manual"}
              {" · "}
              {formatearTimestamp(req.fecha)}
              {req.solicitante && ` · solicitó ${req.solicitante}`}
            </p>
          </div>
          <Button
            type="button"
            variante="secundario"
            className="print:hidden"
            onClick={() => window.print()}
          >
            <Printer size={15} /> Imprimir
          </Button>
        </div>

        {req.anulado ? (
          <div className="rounded-lg border border-error bg-error-suave px-5 py-4 text-[13px] text-error-texto">
            <strong>Requerimiento anulado.</strong> {req.motivoAnulacion}
          </div>
        ) : req.estado === ESTADOS_REQUERIMIENTO.RECHAZADA ? (
          <div className="rounded-lg border border-error bg-error-suave px-5 py-4 text-[13px] text-error-texto">
            <strong>Requerimiento rechazado.</strong> {motivoTerminal || "Sin motivo registrado."}
          </div>
        ) : (
          <PasoAPaso pasos={etapasConSublabel} pasoActual={etapaActual} ultimoPasoRequiereLlegada />
        )}

        {/* Punto 6 — aviso destacado de Pendiente de stock: nada que hacer
            del lado de compras, solo esperar a que se reciba la reposición
            del central que ya se generó sola. */}
        {bloqueadaPorStock && (
          <div className="flex items-start gap-2.5 rounded-lg border border-error bg-error-suave px-4 py-3.5 text-[13px] text-error-texto">
            <AlertTriangle size={18} className="mt-0.5 flex-none" />
            <div>
              <p className="font-semibold">El central no tuvo stock suficiente para completar esta transferencia.</p>
              <p className="mt-1">
                Se generó automáticamente una solicitud de reposición para el central
                {req.requerimientoCompra && (
                  <>
                    {" "}
                    (
                    <button
                      type="button"
                      onClick={() => navigate(`/requerimientos/${req.requerimientoCompra.id}`)}
                      className="cursor-pointer font-semibold underline hover:opacity-80"
                    >
                      REQ-{String(req.requerimientoCompra.id).padStart(4, "0")}
                    </button>
                    )
                  </>
                )}
                . Esta transferencia se completa sola apenas esa reposición se reciba — no hay ninguna acción manual
                pendiente de compras acá, solo esperar.
              </p>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-borde">
          <Table
            columnas={[
              "N° Requerimiento",
              "Artículo",
              "Cantidad",
              "Stock actual",
              ...(esTransferencia ? ["Central destino"] : []),
              ...(bloqueadaPorStock ? ["Disponible en central"] : []),
            ]}
            columnasDerecha={["Cantidad", "Stock actual", ...(bloqueadaPorStock ? ["Disponible en central"] : [])]}
            encabezadoDestacado
            filas={req.detalle}
            renderFila={(d) => {
              const stock = stockPorArticulo.get(d.articuloId);
              const varianteStock = stock ? variantePorStock(stock.stockActual, stock.stockMinimo) : "ok";
              const stockCentral = stockCentralPorArticulo.get(d.articuloId);
              // Punto 6: resalta SOLO la línea puntual que no tiene stock
              // suficiente en el central — si la solicitud tiene varios
              // artículos y uno solo causó el bloqueo, el resto no debe
              // verse igual de frenado.
              // Sin fila de stock en el central (nunca se habilitó ahí)
              // cuenta como 0 disponible para esta cuenta — no como "sin
              // dato": si el central ni siquiera tiene el artículo, el
              // bloqueo es igual de real que si lo tuviera en 0.
              const disponibleEnCentral = stockCentral ? Number(stockCentral.stockActual) : 0;
              const esLineaBloqueante = bloqueadaPorStock && disponibleEnCentral < Number(d.cantidadSolicitada);
              return (
                <tr
                  key={d.id}
                  className={`border-b border-borde last:border-0 ${esLineaBloqueante ? "bg-error-suave" : ""}`}
                >
                  <td className="px-3 py-3.5">
                    <CodigoClave className="text-tinta/70">REQ-{String(req.id).padStart(4, "0")}</CodigoClave>
                  </td>
                  <td className="px-3 py-3.5">
                    <NombreClave title={d.articulo?.nombre}>{d.articulo?.nombre}</NombreClave>
                    {esLineaBloqueante && <span className="ml-1.5 text-[11px] font-semibold text-error-texto">· sin stock suficiente</span>}
                  </td>
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
                  {esTransferencia && (
                    <td className="px-3 py-3.5 font-body text-[13px] text-tinta">{req.depositoCentral?.nombre ?? "—"}</td>
                  )}
                  {bloqueadaPorStock && (
                    <td className={`px-3 py-3.5 text-right font-body text-[14px] font-semibold ${esLineaBloqueante ? "text-error-texto" : "text-tinta"}`}>
                      {stockCentral ? Number(stockCentral.stockActual) : "—"}
                    </td>
                  )}
                </tr>
              );
            }}
          />
        </div>

        {accionesContextuales()}

        {esTerminalNegativo && (
          // Única acción disponible en este estado (accionesContextuales()
          // devuelve null) — primario, no secundario (auditoría de
          // botones, P1.3): sin esto no había ningún botón que orientara
          // "esto es lo que podés hacer acá".
          <Button
            variante="ok"
            className="w-full justify-center gap-2 py-3 text-[14px] print:hidden"
            onClick={() => setDuplicando(true)}
          >
            <Copy size={15} /> Duplicar como nueva solicitud
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
                className="cursor-pointer text-[12.5px] font-semibold text-pino hover:underline print:hidden"
              >
                Ver presupuesto asociado →
              </button>
            )}
          </div>

          {!tienePresupuestos ? (
            <p className="text-[12.5px] text-piedra">
              {esTransferencia
                ? "Las transferencias no piden presupuesto — se resuelven contra el depósito central."
                : "Todavía no se solicitó ningún presupuesto para este requerimiento."}
            </p>
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
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-borde px-4 py-3 hover:bg-hueso print:cursor-default print:hover:bg-transparent"
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
                      <ChevronRight size={16} className="text-piedra print:hidden" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra print:hidden">
        Un requerimiento pasa a "Aprobado" únicamente como consecuencia de que el gerente adjudique uno de sus
        presupuestos — no hay una acción de "aprobar requerimiento" por separado.
      </p>

      {paraAnular && (
        <AnularRequerimientoModal
          requerimiento={req}
          onClose={() => setParaAnular(false)}
          onExito={(mensaje) => {
            setParaAnular(false);
            queryClient.invalidateQueries({ queryKey: ["requerimiento", id] });
            queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
            mostrarToast(mensaje);
          }}
        />
      )}

      {duplicando && (
        <RequerimientoModal
          prefill={{ depositoId: req.depositoId, detalle: req.detalle.map((d) => ({ articuloId: d.articuloId, cantidadSolicitada: d.cantidadSolicitada })) }}
          onClose={() => setDuplicando(false)}
          onExito={(mensaje, creado) => {
            setDuplicando(false);
            mostrarToast(mensaje);
            if (creado?.id) navigate(`/requerimientos/${creado.id}`);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
