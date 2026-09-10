import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { FileText, ArrowLeft, Eye } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { PasoAPaso } from "../../componentes/PasoAPaso";
import { SinPermiso } from "../../componentes/SinPermiso";
import { obtenerPresupuesto } from "./presupuestos.api";
import { ESTADOS_PRESUPUESTO, VARIANTE_ESTADO_PRESUPUESTO } from "../../lib/constantes";
import { formatearMonto } from "../../lib/moneda";
import { formatearTimestamp, formatearFechaSinHora, estadoVencimiento } from "../../lib/fechas";
import { UMBRAL_VENCIMIENTO_DIAS, VARIANTE_VENCIMIENTO, LABEL_VENCIMIENTO } from "../comprobantes/comprobantes.constantes";
import { useSesion } from "../../lib/sesion";
import { useVolver } from "../../lib/useVolver";

// Un presupuesto solicitado tiene un solo camino "ganador" — Solicitado ->
// cotiza (Pendiente de aprobación) -> lo adjudican (Adjudicado). Rechazado
// es la rama alternativa que le pasa a los que NO ganan cuando el gerente
// adjudica a otro proveedor del mismo requerimiento: no es "un paso más"
// de este camino, así que no entra en la barra de progreso (ver más abajo).
const PASOS = [
  { clave: ESTADOS_PRESUPUESTO.SOLICITADO, label: "Solicitado" },
  { clave: ESTADOS_PRESUPUESTO.PENDIENTE_APROBACION, label: "Cotizado" },
  { clave: ESTADOS_PRESUPUESTO.ADJUDICADO, label: "Adjudicado" },
];

export function PresupuestoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const volver = useVolver("/presupuestos");
  const { puede } = useSesion();

  const { data: p, isLoading, isError } = useQuery({
    queryKey: ["presupuesto", id],
    queryFn: () => obtenerPresupuesto(id),
  });

  if (!puede("gestionarPresupuestos") && !puede("aprobarPresupuesto")) return <SinPermiso />;
  if (isLoading) return <p className="text-sm text-piedra">Cargando presupuesto…</p>;
  if (isError || !p) return <p className="text-sm text-error">No se pudo cargar el presupuesto.</p>;

  const cantidades = new Map((p.requerimiento?.detalle ?? []).map((d) => [d.articuloId, Number(d.cantidadSolicitada)]));
  // "Cotizó de verdad" sale de si mandó precios, no del estado: ver
  // ComparacionPresupuestosPage.jsx y el criterio del backend.
  const cotizo = (p.detalle?.length ?? 0) > 0;
  const rechazado = p.estado === ESTADOS_PRESUPUESTO.RECHAZADO;
  const pasoActual = PASOS.findIndex((paso) => paso.clave === p.estado);

  return (
    <div className="flex flex-col gap-6">
      <Button variante="fantasma" onClick={volver} className="w-fit text-xs" icono={ArrowLeft}>
        Volver
      </Button>

      <div>
        <h1 className="flex flex-wrap items-center gap-2.5 font-heading text-[34px] font-semibold">
          <FileText size={24} className="text-pino" /> {p.proveedor?.razonSocial}
          <Badge variante={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? "neutro"}>{p.estado}</Badge>
        </h1>
        <p className="mt-1.5 text-[12.5px] text-tinta/60">
          REQ-{String(p.requerimientoId).padStart(4, "0")} · {formatearTimestamp(p.fecha)}
        </p>
      </div>

      {rechazado ? (
        <div className="rounded-lg border border-error bg-error-suave px-5 py-4 text-[13px] text-error-texto">
          Este presupuesto quedó rechazado: el gerente adjudicó a otro proveedor para este requerimiento.
        </div>
      ) : (
        <PasoAPaso pasos={PASOS} pasoActual={pasoActual} />
      )}

      <div className="flex justify-end">
        <Button variante="secundario" onClick={() => navigate(`/presupuestos?requerimientoId=${p.requerimientoId}`)} icono={Eye}>
          Ver comparación
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Dato etiqueta="CUIT" valor={p.proveedor?.cuit} />
        <Dato etiqueta="Condición comercial" valor={p.proveedor?.condicionComercial} />
        <Dato etiqueta="Plazo de entrega" valor={p.plazoEntrega} />
        <Dato
          etiqueta="Oferta válida hasta"
          valor={
            p.fechaLimiteVigencia ? (
              <span className="inline-flex items-center gap-1.5">
                {formatearFechaSinHora(p.fechaLimiteVigencia)}
                {(() => {
                  const vencimiento = estadoVencimiento(p.fechaLimiteVigencia, UMBRAL_VENCIMIENTO_DIAS);
                  return (
                    vencimiento && (
                      <Badge variante={VARIANTE_VENCIMIENTO[vencimiento]}>{LABEL_VENCIMIENTO[vencimiento]}</Badge>
                    )
                  );
                })()}
              </span>
            ) : null
          }
        />
        <Dato etiqueta="Requerimiento" valor={`REQ-${String(p.requerimientoId).padStart(4, "0")}`} />
      </div>

      {!cotizo ? (
        <div className="rounded-lg border border-borde bg-white p-6">
          <p className="text-sm">
            Este proveedor todavía no cotizó. La carga de precios se hace desde la comparación de presupuestos.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-borde bg-white p-5">
            <h2 className="mb-3 font-heading text-[18px] font-semibold text-tinta">Detalle de precios</h2>
            <Table
              columnas={["Artículo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"]}
              columnasDerecha={["Cantidad", "Precio unitario", "Subtotal"]}
              filas={p.detalle}
              renderFila={(d) => {
                const cant = cantidades.get(d.articuloId) ?? 0;
                return (
                  <tr key={d.id} className="border-b border-borde last:border-0">
                    <td className="px-3 py-2 font-body text-[13px] font-semibold">{d.articulo?.nombre}</td>
                    <td className="px-3 py-2 font-body text-[12.5px]">{d.articulo?.unidadMedida}</td>
                    <td className="px-3 py-2 text-right font-body text-[13px]">{cant}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">$ {formatearMonto(d.precioUnitario)}</td>
                    <td className="px-3 py-2 text-right font-heading text-[14px]">
                      $ {formatearMonto(Number(d.precioUnitario) * cant)}
                    </td>
                  </tr>
                );
              }}
            />
          </div>

          <div className="flex flex-col items-end gap-1 rounded-lg border border-borde bg-white p-5">
            <div className="flex w-full max-w-xs justify-between text-[13px] text-tinta/70">
              <span>Subtotal artículos</span>
              <span className="font-mono">$ {formatearMonto(p.subtotal)}</span>
            </div>
            {p.requerimiento?.requiereFlete && (
              <div className="flex w-full max-w-xs justify-between text-[13px] text-tinta/70">
                <span>Flete</span>
                <span className="font-mono">$ {formatearMonto(p.flete)}</span>
              </div>
            )}
            <div className="mt-2 flex w-full max-w-xs items-baseline justify-between border-t border-borde pt-2">
              <span className="text-[11px] uppercase tracking-wide text-tinta/55">Total</span>
              <Cifra tamano={26}>$ {formatearMonto(p.total)}</Cifra>
            </div>
          </div>
        </>
      )}

      {p.estado === ESTADOS_PRESUPUESTO.ADJUDICADO && (
        <p className="rounded-md border border-pino bg-pino-100 px-4 py-3 text-[12.5px] text-pino-700">
          Este presupuesto está adjudicado: es el que habilita generar la orden de compra al proveedor.
        </p>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="rounded-lg border border-borde bg-white p-4">
      <div className="text-[10px] uppercase tracking-wide text-tinta/55">{etiqueta}</div>
      <div className="mt-0.5 font-body text-[13.5px] text-tinta">{valor || "—"}</div>
    </div>
  );
}
