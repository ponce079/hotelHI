import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { SinPermiso } from "../../componentes/SinPermiso";
import { obtenerPresupuesto } from "./presupuestos.api";
import { ESTADOS_PRESUPUESTO, VARIANTE_ESTADO_PRESUPUESTO } from "../../lib/constantes";
import { formatearMonto } from "../../lib/moneda";
import { formatearFechaSolo } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";

export function PresupuestoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          onClick={() => navigate(`/requerimientos/${p.requerimientoId}`)}
          className="mb-2 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
        >
          <ArrowLeft size={15} /> Volver al requerimiento
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
              <FileText size={24} className="text-pino" /> Presupuesto #{p.id}
            </h1>
            <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
              {p.proveedor?.razonSocial} · REQ-{String(p.requerimientoId).padStart(4, "0")} ·{" "}
              {formatearFechaSolo(p.fecha)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variante={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? "neutro"}>{p.estado}</Badge>
            <Button variante="secundario" onClick={() => navigate(`/presupuestos?requerimientoId=${p.requerimientoId}`)}>
              Ver comparación
            </Button>
            {p.estado === ESTADOS_PRESUPUESTO.SOLICITADO && puede("gestionarPresupuestos") && (
              <Button onClick={() => navigate(`/presupuestos/${p.id}/cargar`)}>Cargar cotización</Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Dato etiqueta="Proveedor" valor={p.proveedor?.razonSocial} />
        <Dato etiqueta="CUIT" valor={p.proveedor?.cuit} />
        <Dato etiqueta="Condición comercial" valor={p.proveedor?.condicionComercial} />
        <Dato etiqueta="Plazo de entrega" valor={p.plazoEntrega} />
      </div>

      {!cotizo ? (
        <div className="rounded-lg border border-borde bg-white p-6">
          <p className="text-sm">
            Este proveedor todavía no cotizó. Cuando conteste, cargá sus precios desde "Cargar cotización".
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
