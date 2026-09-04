import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { SinPermiso } from "../../componentes/SinPermiso";
import { ComparacionPresupuestosPage } from "./ComparacionPresupuestosPage";
import { listarRequerimientos } from "../requerimientos/requerimientos.api";
import { ESTADOS_REQUERIMIENTO, VARIANTE_ESTADO_REQUERIMIENTO } from "../../lib/constantes";
import { formatearFechaSolo } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";

// Una sola ruta /presupuestos con dos caras: con ?requerimientoId= es la
// comparación en columnas (HU-84); sin parámetro es la bandeja de
// requerimientos en cotización, que es por dónde entra el gerente cuando
// hace click en el menú y todavía no eligió cuál mirar.
export function PresupuestosPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { puede } = useSesion();

  const requerimientoId = searchParams.get("requerimientoId");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["requerimientos", { estado: ESTADOS_REQUERIMIENTO.EN_COTIZACION, pageSize: 50 }],
    queryFn: () => listarRequerimientos({ estado: ESTADOS_REQUERIMIENTO.EN_COTIZACION, pageSize: 50 }),
    enabled: !requerimientoId && (puede("gestionarPresupuestos") || puede("aprobarPresupuesto")),
  });

  if (requerimientoId) return <ComparacionPresupuestosPage />;
  if (!puede("gestionarPresupuestos") && !puede("aprobarPresupuesto")) return <SinPermiso />;

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
          {puede("aprobarPresupuesto")
            ? "Elegí un requerimiento para ver lo que cotizó cada proveedor y adjudicar uno."
            : "Requerimientos con presupuestos pedidos. Entrá a cada uno para cargar lo que cotizó cada proveedor."}
        </p>
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando…</p>}
      {isError && <p className="text-sm text-error">No se pudieron cargar los requerimientos en cotización.</p>}

      {data && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <Table
            columnas={["#", "Fecha", "Depósito", "Artículos", "Cotizaciones", "Estado", ""]}
            columnasDerecha={["Artículos", "Cotizaciones"]}
            filas={data.items}
            vacio="No hay requerimientos en cotización en este momento."
            renderFila={(r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/presupuestos?requerimientoId=${r.id}`)}
                className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
              >
                <td className="px-3 py-2 font-mono text-xs">REQ-{String(r.id).padStart(4, "0")}</td>
                <td className="px-3 py-2 font-body text-[12.5px]">{formatearFechaSolo(r.fecha)}</td>
                <td className="px-3 py-2 font-body text-[12.5px] font-semibold">{r.deposito?.nombre}</td>
                <td className="px-3 py-2 text-right font-body text-[12.5px]">{r.cantidadArticulos}</td>
                <td className="px-3 py-2 text-right font-body text-[12.5px]">
                  {r.presupuestosCotizados}/{r.cantidadPresupuestos}
                </td>
                <td className="px-3 py-2">
                  <Badge variante={VARIANTE_ESTADO_REQUERIMIENTO[r.estado] ?? "neutro"}>{r.estado}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variante="secundario" tamano="fila">Comparar →</Button>
                </td>
              </tr>
            )}
          />
        </div>
      )}
    </div>
  );
}
