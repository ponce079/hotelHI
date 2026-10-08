import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowRight, TrendingDown, Clock, Paperclip, ArrowLeft, Plus, Check } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { Toast } from "../../componentes/Toast";
import { SinPermiso } from "../../componentes/SinPermiso";
import { PresupuestoCargaModal } from "./PresupuestoCargaModal";
import { SolicitarPresupuestosModal } from "./SolicitarPresupuestosModal";
import { listarPresupuestos, aprobarPresupuesto, urlAdjuntoPresupuesto } from "./presupuestos.api";
import { ESTADOS_PRESUPUESTO, ESTADOS_REQUERIMIENTO, VARIANTE_ESTADO_PRESUPUESTO } from "../../lib/constantes";
import { formatearMonto } from "../../lib/moneda";
import { diasDesde, parsearDiasPlazo } from "../../lib/fechas";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";
import { useVolver } from "../../lib/useVolver";

export function ComparacionPresupuestosPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const volver = useVolver("/presupuestos");
  const queryClient = useQueryClient();
  const { puede, usuario } = useSesion();
  const { toast, mostrarToast } = useToast();

  const requerimientoId = searchParams.get("requerimientoId");
  const [paraAprobar, setParaAprobar] = useState(null);
  const [paraCargar, setParaCargar] = useState(null);
  const [solicitandoMas, setSolicitandoMas] = useState(false);
  // Punto 4: comentario opcional de por qué se elige este presupuesto —
  // vive en el mismo ConfirmDialog de adjudicar, se limpia al abrir/cerrar.
  const [comentarioAdjudicacion, setComentarioAdjudicacion] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["presupuestos", { requerimientoId }],
    queryFn: () => listarPresupuestos({ requerimientoId }),
    enabled: Boolean(requerimientoId),
  });

  const mutacion = useMutation({
    mutationFn: (id) => aprobarPresupuesto(id, usuario, comentarioAdjudicacion),
    onSuccess: (presupuesto) => {
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      mostrarToast(
        `Presupuesto de ${presupuesto.proveedor?.razonSocial} adjudicado. El requerimiento quedó aprobado y el resto de los presupuestos, rechazados.`
      );
      setParaAprobar(null);
      setComentarioAdjudicacion("");
    },
    onError: (err) => {
      mostrarToast(err?.response?.data?.error ?? "No se pudo aprobar el presupuesto.");
      setParaAprobar(null);
    },
  });

  if (!requerimientoId) {
    return (
      <div className="rounded-lg border border-borde bg-white p-6">
        <p className="text-sm">
          Esta pantalla compara los presupuestos de un requerimiento. Entrá desde la ficha del requerimiento.
        </p>
        <Button className="mt-3" variante="secundario" onClick={() => navigate("/requerimientos")}>
          Ir a requerimientos <ArrowRight size={16} className="flex-none" />
        </Button>
      </div>
    );
  }

  // La comparación la mira compras (para seguir el estado) y el gerente
  // (que es quien adjudica). El botón de aprobar se controla aparte.
  if (!puede("gestionarPresupuestos") && !puede("aprobarPresupuesto")) return <SinPermiso />;
  if (isLoading) return <p className="text-sm text-piedra">Cargando presupuestos…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los presupuestos.</p>;

  // El requerimiento (con su detalle y depósito) ya viene incluido en cada
  // presupuesto vía INCLUDE_FICHA — no hace falta un fetch aparte, y todos
  // los presupuestos de un mismo requerimientoId comparten el mismo.
  const presupuestos = data?.items ?? [];
  const req = presupuestos[0]?.requerimiento;
  const lineasReq = req?.detalle ?? [];
  const adjudicado = presupuestos.find((p) => p.estado === ESTADOS_PRESUPUESTO.ADJUDICADO);
  const yaAdjudicado = Boolean(adjudicado);
  // Punto 3 del rediseño: mismo criterio de "cotizó de verdad" que ya usa
  // cada card (detalle con precios cargados, no el estado — ver comentario
  // de abajo), para un vistazo rápido sin tener que leer card por card.
  const cantidadCotizados = presupuestos.filter((p) => (p.detalle?.length ?? 0) > 0).length;
  // Punto 7: "comparar objetivamente por tiempo de entrega" — mismo
  // criterio visual que ya usa "Oferta más baja" (esMasBajo), pero para el
  // plazo. Solo entra en juego para plazos que se pudieron parsear (ver
  // parsearDiasPlazo) — un valor viejo en texto libre simplemente no
  // compite por esta marca, no rompe nada.
  const diasPlazoPorPresupuesto = new Map(presupuestos.map((p) => [p.id, parsearDiasPlazo(p.plazoEntrega)]));
  const diasPlazoValidos = [...diasPlazoPorPresupuesto.values()].filter((d) => d != null);
  const menorPlazoDias = diasPlazoValidos.length > 0 ? Math.min(...diasPlazoValidos) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variante="fantasma" onClick={volver} className="mb-2 w-fit text-xs" icono={ArrowLeft}>
          Volver
        </Button>
        <h1 className="font-heading text-[34px] font-semibold">Comparación de presupuestos</h1>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-tinta/55">
          <CodigoClave className="text-tinta">REQ-{String(requerimientoId).padStart(4, "0")}</CodigoClave>
          {req?.deposito?.nombre && ` — ${req.deposito.nombre}`}
        </p>
      </div>

      {presupuestos.length === 0 && (
        <div className="rounded-lg border border-borde bg-white p-6">
          <p className="text-sm">Todavía no hay presupuestos para este requerimiento.</p>
        </div>
      )}

      {presupuestos.length > 0 && !yaAdjudicado && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-piedra">
            Esperando cotizaciones: <strong className="text-tinta">{cantidadCotizados}/{presupuestos.length}</strong> recibidas
          </p>
          {/* Punto 4: solo tiene sentido sumar un proveedor mientras la
              comparación sigue abierta (En cotización) — una vez adjudicado
              ya no hay nada que comparar. */}
          {req?.estado === ESTADOS_REQUERIMIENTO.EN_COTIZACION && puede("gestionarPresupuestos") && (
            <Button variante="secundario" tamano="fila" onClick={() => setSolicitandoMas(true)} icono={Plus}>
              Solicitar a otro proveedor
            </Button>
          )}
        </div>
      )}

      {presupuestos.length > 0 && (
        <div className="overflow-x-auto">
          <div className="flex min-w-fit gap-4">
            {presupuestos.map((p) => {
              // "Cotizó de verdad" sale de si mandó precios, no del estado:
              // aprobarPresupuesto pone en "Rechazado" a todos los no
              // ganadores, incluidos los que se quedaron en "Solicitado"
              // sin responder nunca. Mismo criterio que el backend.
              const cotizo = (p.detalle?.length ?? 0) > 0;
              const preciosPorArticulo = new Map(p.detalle.map((d) => [d.articuloId, Number(d.precioUnitario)]));
              const dias = diasDesde(p.fecha);
              const diasPlazo = diasPlazoPorPresupuesto.get(p.id);
              const esMasRapido = cotizo && diasPlazo != null && diasPlazo === menorPlazoDias;
              // Punto 3: "esMasBajo" (precio más barato) y "el que ganó" no
              // son lo mismo — el gerente puede adjudicar uno que no sea el
              // más barato (mejor plazo, mejor proveedor, etc.). El anillo
              // verde de "destacado" tiene que seguir al que de verdad ganó
              // una vez que hay un ganador, no seguir marcando el más
              // barato como si lo fuera.
              const esGanador = p.estado === ESTADOS_PRESUPUESTO.ADJUDICADO;
              const destacar = yaAdjudicado ? esGanador : p.esMasBajo;
              return (
                <div
                  key={p.id}
                  className={`flex w-[340px] flex-none flex-col rounded-lg border bg-white ${
                    esGanador
                      ? "border-exito ring-2 ring-exito/25 bg-exito-suave/40"
                      : destacar
                        ? "border-pino ring-2 ring-pino/25"
                        : "border-borde"
                  }`}
                >
                  <div className="border-b border-borde px-5 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <NombreClave tamano="card" className="block truncate" title={p.proveedor?.razonSocial}>
                          {p.proveedor?.razonSocial}
                        </NombreClave>
                        <div className="font-mono text-[11px] text-tinta/55">{p.proveedor?.cuit}</div>
                      </div>
                      <Badge variante={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? "neutro"}>{p.estado}</Badge>
                    </div>
                    {p.estado === ESTADOS_PRESUPUESTO.SOLICITADO && (
                      <div className="mt-1.5 text-[11px] text-piedra">
                        {dias <= 0 ? "Solicitado hoy" : `Solicitado hace ${dias} día${dias === 1 ? "" : "s"}`}
                      </div>
                    )}
                    {/* Punto 5 */}
                    {esGanador && p.fechaAdjudicacion && (
                      <div className="mt-1.5 text-[11px] font-semibold text-exito">
                        Adjudicado el {new Date(p.fechaAdjudicacion).toLocaleDateString("es-AR")}
                      </div>
                    )}
                    {/* Punto 4 */}
                    {esGanador && p.comentarioAdjudicacion && (
                      <p className="mt-1.5 text-[11.5px] italic text-tinta/70">"{p.comentarioAdjudicacion}"</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.esMasBajo && (
                        <span className="inline-flex items-center gap-1 rounded-sm bg-pino-100 px-2 py-0.5 text-[11px] font-semibold text-pino-700">
                          <TrendingDown size={12} /> Oferta más baja
                        </span>
                      )}
                      {esMasRapido && (
                        <span className="inline-flex items-center gap-1 rounded-sm bg-info-suave px-2 py-0.5 text-[11px] font-semibold text-info-texto">
                          <Clock size={12} /> Entrega más rápida
                        </span>
                      )}
                    </div>
                    {/* Punto 9: respaldo documental — independiente de si
                        ya cotizó (se puede adjuntar antes de cargar
                        precios), visible acá para quien tiene que
                        adjudicar sin necesidad de abrir el modal de carga. */}
                    {p.archivoNombre && (
                      <a
                        href={urlAdjuntoPresupuesto(p.id)}
                        target="_blank"
                        rel="noreferrer"
                        title={p.archivoNombre}
                        className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-pino hover:underline"
                      >
                        <Paperclip size={12} /> Ver presupuesto adjunto
                      </a>
                    )}
                  </div>

                  <div className="flex-1 px-5 py-4">
                    {!cotizo ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-[12.5px] text-piedra">Todavía no cotizó.</p>
                        {p.estado === ESTADOS_PRESUPUESTO.SOLICITADO && puede("gestionarPresupuestos") && (
                          <Button variante="secundario" className="w-full justify-center" onClick={() => setParaCargar(p.id)}>
                            Cargar cotización
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {lineasReq.map((d) => {
                          const precio = preciosPorArticulo.get(d.articuloId);
                          return (
                            <div key={d.id} className="flex items-baseline justify-between gap-2">
                              {/* Punto 1: la cantidad estaba ausente acá — el
                                  subtotal de la card no se explicaba visualmente
                                  sin saber cuánto de cada artículo se cotizó. */}
                              <span className="min-w-0 truncate">
                                <NombreClave title={d.articulo?.nombre}>{d.articulo?.nombre}</NombreClave>
                                <span className="text-[12px] text-tinta/55"> × {Number(d.cantidadSolicitada)}</span>
                              </span>
                              <span className="flex-none font-mono text-xs text-tinta/70">
                                {precio ? `$ ${formatearMonto(precio)} c/u` : "—"}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {cotizo && (
                    <div className="border-t border-borde px-5 py-4">
                      <div className="flex justify-between text-[12px] text-tinta/70">
                        <span>Subtotal artículos</span>
                        <span className="font-mono">$ {formatearMonto(p.subtotal)}</span>
                      </div>
                      {req?.requiereFlete && (
                        <div className="mt-1 flex justify-between text-[12px] text-tinta/70">
                          <span>Flete</span>
                          <span className="font-mono">$ {formatearMonto(p.flete)}</span>
                        </div>
                      )}
                      <div className="mt-1 flex justify-between text-[12px] text-tinta/70">
                        <span>Plazo de entrega</span>
                        <span className={esMasRapido ? "font-semibold text-info-texto" : ""}>
                          {p.plazoEntrega ?? "—"}
                        </span>
                      </div>
                      <div className="mt-3 border-t border-borde pt-3">
                        <div className="text-[10px] uppercase tracking-wide text-tinta/55">Total</div>
                        <Cifra tamano={26} className={esGanador ? "text-exito" : destacar ? "text-pino-700" : ""}>
                          $ {formatearMonto(p.total)}
                        </Cifra>
                      </div>

                      {puede("aprobarPresupuesto") &&
                        p.estado === ESTADOS_PRESUPUESTO.PENDIENTE_APROBACION &&
                        !yaAdjudicado && (
                          <Button className="mt-3 w-full justify-center" onClick={() => setParaAprobar(p)} icono={Check}>
                            Aprobar este presupuesto
                          </Button>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {yaAdjudicado && adjudicado?.ordenCompra && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pino bg-pino-100 px-5 py-4">
          <p className="text-[13px] text-pino-700">
            Ya se generó la orden de compra <strong>{adjudicado.ordenCompra.numero}</strong> para el presupuesto adjudicado de{" "}
            {adjudicado.proveedor?.razonSocial}.
          </p>
          <Button variante="secundario" onClick={() => navigate(`/ordenes-compra/${adjudicado.ordenCompra.id}`)}>
            Ver orden de compra <ArrowRight size={15} />
          </Button>
        </div>
      )}

      {yaAdjudicado && !adjudicado?.ordenCompra && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borde bg-white px-5 py-4">
          <p className="text-[13px] text-tinta/70">
            El presupuesto de <strong className="text-tinta">{adjudicado?.proveedor?.razonSocial}</strong> está adjudicado por{" "}
            <strong className="text-tinta">$ {formatearMonto(adjudicado?.total)}</strong>. La orden de compra se genera desde
            Órdenes de Compra, no acá.
          </p>
          {puede("gestionarOC") ? (
            <Button
              variante="secundario"
              onClick={() => navigate(`/ordenes-compra?generarPresupuestoId=${adjudicado.id}`)}
            >
              Ir a Órdenes de Compra <ArrowRight size={15} />
            </Button>
          ) : (
            <span className="text-[12px] text-piedra">La genera el área de compras.</span>
          )}
        </div>
      )}

      {!puede("aprobarPresupuesto") && presupuestos.length > 0 && !yaAdjudicado && (
        <p className="rounded-md bg-hueso px-4 py-3 text-[12.5px] text-piedra">
          La adjudicación la hace el gerente: desde este perfil podés comparar y hacer seguimiento, pero no aprobar.
        </p>
      )}

      <ConfirmDialog
        abierto={Boolean(paraAprobar)}
        titulo="¿Adjudicar este presupuesto?"
        mensaje={
          paraAprobar
            ? `Se adjudica el presupuesto de ${paraAprobar.proveedor?.razonSocial} por $ ${formatearMonto(paraAprobar.total)}. Los demás presupuestos de este requerimiento quedan rechazados y el requerimiento pasa a "Aprobado". Después se podrá generar la orden de compra.`
            : ""
        }
        textoConfirmar="Sí, adjudicar"
        variante="ok"
        icono={Check}
        onCancelar={() => {
          setParaAprobar(null);
          setComentarioAdjudicacion("");
        }}
        onConfirmar={() => mutacion.mutate(paraAprobar.id)}
      >
        <label className="flex flex-col gap-1.5 font-body text-sm">
          <span className="text-[12px] text-tinta/70">Comentario (opcional)</span>
          <textarea
            value={comentarioAdjudicacion}
            onChange={(e) => setComentarioAdjudicacion(e.target.value)}
            rows={2}
            placeholder="Ej. mejor relación precio-calidad, entrega más rápida…"
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </label>
      </ConfirmDialog>

      {paraCargar && (
        <PresupuestoCargaModal
          presupuestoId={paraCargar}
          onClose={() => setParaCargar(null)}
          onExito={(mensaje) => {
            setParaCargar(null);
            mostrarToast(mensaje);
          }}
        />
      )}

      {solicitandoMas && (
        <SolicitarPresupuestosModal
          requerimientoId={requerimientoId}
          onClose={() => setSolicitandoMas(false)}
          onExito={(mensaje) => {
            setSolicitandoMas(false);
            queryClient.invalidateQueries({ queryKey: ["presupuestos", { requerimientoId }] });
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
