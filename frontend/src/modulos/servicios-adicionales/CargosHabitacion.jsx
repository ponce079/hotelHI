import { useQuery } from "@tanstack/react-query";
import { listarConsumosPorReserva } from "./serviciosAdicionales.api";
import { formatearTimestamp } from "../../lib/fechas";
const moneda = (valor) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(valor);

export function CargosHabitacion({ reservaId, habitacionId }) {
  const consulta = useQuery({
    queryKey: ["consumos-servicios", "detalle", reservaId],
    queryFn: () => listarConsumosPorReserva(reservaId),
  });
  const cargos = (consulta.data ?? []).filter((c) => c.habitacionId === habitacionId);
  return (
    <section className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-4 font-heading text-[19px] font-semibold">Cargos de esta habitación</h2>
      {consulta.isPending ? (
        <p>Cargando cargos…</p>
      ) : consulta.isError ? (
        <div role="alert">
          <p>No se pudieron cargar los cargos.</p>
          <button type="button" onClick={() => consulta.refetch()} className="underline">
            Volver a cargar
          </button>
        </div>
      ) : (
        <>
          {!cargos.length && (
            <p className="text-sm text-piedra">No hay cargos registrados para esta habitación en la estadía actual.</p>
          )}
          {cargos.map((c) => (
            <div key={c.id} className="flex justify-between gap-4 border-b border-borde py-3 text-sm">
              <div>
                <p>
                  {c.descripcion || c.tipoServicio}
                  {c.anulado ? " · Anulado" : c.incluido ? " · Incluido" : ""}
                </p>
                <p className="text-xs text-piedra">
                  {formatearTimestamp(c.fechaHora)} · {c.registradoPor}
                </p>
              </div>
              <span className={c.anulado ? "line-through text-piedra" : "font-semibold"}>{moneda(c.monto)}</span>
            </div>
          ))}
          <p className="mt-4 text-right font-semibold">
            Total adicionales:{" "}
            {moneda(cargos.filter((c) => !c.anulado).reduce((total, c) => total + Number(c.monto), 0))}
          </p>
        </>
      )}
    </section>
  );
}
