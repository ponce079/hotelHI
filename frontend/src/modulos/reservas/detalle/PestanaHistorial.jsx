import { Button } from "../../../componentes/Button";
import { formatearFechaHora } from "../../../lib/fechas";

// Todo lo que pasó con la reserva, del más reciente al más antiguo, con quién lo hizo. Lo arma el
// backend (GET /reservas/:id/historial): ficha, confirmaciones, pagos, consumos y ajustes de precio.
export function PestanaHistorial({ consulta }) {
  if (consulta.isError)
    return (
      <div role="alert" className="rounded border border-error bg-error-suave p-3 text-sm text-error-texto">
        <p>{consulta.error?.response?.data?.error || "No se pudo cargar el historial."}</p>
        <Button className="mt-2" variante="secundario" cargando={consulta.isFetching} onClick={() => consulta.refetch()}>
          Volver a cargar
        </Button>
      </div>
    );
  if (consulta.isLoading) return <p className="text-sm text-piedra">Cargando el historial…</p>;
  const eventos = consulta.data ?? [];
  if (!eventos.length) return <p className="py-6 text-center text-sm text-piedra">Todavía no hay movimientos registrados.</p>;
  return (
    <ul className="flex flex-col">
      {eventos.map((e, i) => (
        <li key={e.id} className="grid grid-cols-[96px_18px_minmax(0,1fr)] gap-x-2.5 py-2 md:grid-cols-[130px_18px_minmax(0,1fr)]">
          <span className="pt-px text-right text-[12.5px] tabular-nums text-piedra">{formatearFechaHora(e.fecha)}</span>
          <span aria-hidden className="relative">
            <span className="absolute left-[5px] top-[5px] h-[9px] w-[9px] rounded-full bg-pino" />
            {i < eventos.length - 1 && <span className="absolute -bottom-4 left-[9px] top-4 w-px bg-borde" />}
          </span>
          <div className="text-sm">
            <b className="font-semibold">{e.titulo}</b>
            {e.detalle && <span className="block text-[13px] text-piedra">{e.detalle}</span>}
            {e.operador && <span className="block text-[12px] text-piedra">por {e.operador}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
