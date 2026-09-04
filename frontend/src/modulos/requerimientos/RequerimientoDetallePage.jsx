import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { SinPermiso } from "../../componentes/SinPermiso";
import { obtenerRequerimiento } from "./requerimientos.api";
import {
  ESTADOS_REQUERIMIENTO,
  VARIANTE_ESTADO_REQUERIMIENTO,
  VARIANTE_ESTADO_PRESUPUESTO,
  ORIGENES_REQUERIMIENTO,
} from "../../lib/constantes";
import { formatearFechaSolo } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";

export function RequerimientoDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puede } = useSesion();

  const { data: req, isLoading, isError } = useQuery({
    queryKey: ["requerimiento", id],
    queryFn: () => obtenerRequerimiento(id),
  });

  if (!puede("crearRequerimiento")) return <SinPermiso />;
  if (isLoading) return <p className="text-sm text-piedra">Cargando requerimiento…</p>;
  if (isError || !req) return <p className="text-sm text-error">No se pudo cargar el requerimiento.</p>;

  const unidadesTotales = req.detalle.reduce((acc, d) => acc + Number(d.cantidadSolicitada), 0);
  const puedePedirPresupuestos = req.estado === ESTADOS_REQUERIMIENTO.PENDIENTE;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          onClick={() => navigate("/requerimientos")}
          className="mb-2 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
        >
          <ArrowLeft size={15} /> Volver a requerimientos
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
              REQ-{String(req.id).padStart(4, "0")}
              {req.origen === ORIGENES_REQUERIMIENTO.ALERTA && <Zap size={20} className="text-laton" />}
            </h1>
            <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
              {formatearFechaSolo(req.fecha)} · {req.deposito?.nombre}
              {req.solicitante && ` · solicitó ${req.solicitante}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[req.estado] ?? "neutro"}>{req.estado}</Badge>
            {puedePedirPresupuestos && (
              <Button onClick={() => navigate(`/requerimientos/${req.id}/solicitar-presupuestos`)}>
                Solicitar presupuestos →
              </Button>
            )}
            {req.presupuestos.length > 0 && (
              <Button variante="secundario" onClick={() => navigate(`/presupuestos?requerimientoId=${req.id}`)}>
                Comparar presupuestos
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Resumen etiqueta="Artículos" valor={req.detalle.length} />
        <Resumen etiqueta="Unidades totales" valor={unidadesTotales} />
        <Resumen
          etiqueta="Origen"
          valor={req.origen === ORIGENES_REQUERIMIENTO.ALERTA ? "Alerta de stock" : "Carga manual"}
        />
        <Resumen etiqueta="Requiere flete" valor={req.requiereFlete ? "Sí" : "No"} />
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-3 font-heading text-[18px] font-semibold text-tinta">Artículos solicitados</h2>
        <Table
          columnas={["Código", "Artículo", "Unidad", "Cantidad solicitada"]}
          columnasDerecha={["Cantidad solicitada"]}
          filas={req.detalle}
          renderFila={(d) => (
            <tr key={d.id} className="border-b border-borde last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{d.articulo?.codigo ?? "—"}</td>
              <td className="px-3 py-2 font-body text-[13px] font-semibold">{d.articulo?.nombre}</td>
              <td className="px-3 py-2 font-body text-[12.5px]">{d.articulo?.unidadMedida}</td>
              <td className="px-3 py-2 text-right font-heading text-[15px]">{Number(d.cantidadSolicitada)}</td>
            </tr>
          )}
        />
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-3 font-heading text-[18px] font-semibold text-tinta">Presupuestos pedidos</h2>
        <Table
          columnas={["Proveedor", "CUIT", "Plazo de entrega", "Estado", ""]}
          filas={req.presupuestos}
          vacio="Todavía no se pidió ningún presupuesto para este requerimiento."
          renderFila={(p) => (
            <tr key={p.id} className="border-b border-borde last:border-0">
              <td className="px-3 py-2 font-body text-[13px] font-semibold">{p.proveedor?.razonSocial}</td>
              <td className="px-3 py-2 font-mono text-xs">{p.proveedor?.cuit}</td>
              <td className="px-3 py-2 font-body text-[12.5px]">{p.plazoEntrega ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge variante={VARIANTE_ESTADO_PRESUPUESTO[p.estado] ?? "neutro"}>{p.estado}</Badge>
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-1.5">
                  {p.estado === "Solicitado" && puede("gestionarPresupuestos") && (
                    <Button variante="secundario" tamano="fila" onClick={() => navigate(`/presupuestos/${p.id}/cargar`)}>
                      Cargar cotización
                    </Button>
                  )}
                  <Button variante="secundario" tamano="fila" onClick={() => navigate(`/presupuestos/${p.id}`)}>
                    Ver
                  </Button>
                </div>
              </td>
            </tr>
          )}
        />
      </div>

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
        Un requerimiento pasa a "Aprobado" únicamente como consecuencia de que el gerente adjudique uno de sus
        presupuestos — no hay una acción de "aprobar requerimiento" por separado.
      </p>
    </div>
  );
}

function Resumen({ etiqueta, valor }) {
  return (
    <div className="rounded-lg border border-borde bg-white p-4">
      <div className="text-[10px] uppercase tracking-wide text-tinta/55">{etiqueta}</div>
      <Cifra tamano={20} className="mt-0.5 block">{valor}</Cifra>
    </div>
  );
}
