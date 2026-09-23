import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { CodigoClave } from "../../componentes/CodigoClave";
import { FilterBar } from "../../componentes/FilterBar";
import { NombreClave } from "../../componentes/NombreClave";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { formatearFechaSinHora, hoyEnHoraLocal } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";

// Punto de entrada del check-out: las reservas que hoy tienen al huésped
// alojado ("En curso"). Elegir una lleva al flujo completo de esa reserva
// (/check-out/:reservaId).
export function CheckOutPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verCheckOut");
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const reservasQuery = useQuery({
    queryKey: ["reservas", "check-out", q],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO, q: q.trim() || undefined }),
    enabled: puedeVer,
  });

  if (!puedeVer) return <SinPermiso />;

  const hoy = hoyEnHoraLocal();
  const reservas = reservasQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Check-out</h1>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          HU 48 a 52 y 87 — cuenta consolidada, verificación de la habitación, pago y cierre
        </p>
      </div>

      <FilterBar onClear={q ? () => setQ("") : undefined}>
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código, huésped, documento o habitación"
            className="w-full rounded-md border border-borde bg-white py-2 pl-8 pr-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
      </FilterBar>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-4 font-heading text-[19px] font-semibold">Huéspedes alojados</h2>
        {reservasQuery.isLoading ? (
          <p className="text-sm text-piedra">Cargando reservas…</p>
        ) : reservasQuery.isError ? (
          <p className="text-sm text-error-texto">
            {reservasQuery.error?.response?.data?.error ?? "No se pudieron cargar las reservas."}
          </p>
        ) : (
          <Table
            columnas={["Código", "Huésped", "Habitaciones", "Entrada", "Salida"]}
            filas={reservas}
            vacio={q ? "Ninguna reserva en curso coincide con la búsqueda." : "No hay huéspedes alojados en este momento."}
            renderFila={(r) => {
              const salida = r.fechaHasta.slice(0, 10);
              return (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/check-out/${r.id}`)}
                  className="h-12 cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
                >
                  <td className="px-3 py-2.5">
                    <CodigoClave>{r.codigoConfirmacion}</CodigoClave>
                  </td>
                  <td className="px-3 py-2.5">
                    <NombreClave>{r.huesped?.nombre}</NombreClave>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[13px]">{r.habitaciones.map((h) => h.numero).join(", ")}</td>
                  <td className="px-3 py-2.5 text-[12.5px]">{formatearFechaSinHora(r.fechaDesde)}</td>
                  <td className="px-3 py-2.5 text-[12.5px]">
                    <span className="mr-2">{formatearFechaSinHora(r.fechaHasta)}</span>
                    {salida === hoy && <Badge variante="alerta">Sale hoy</Badge>}
                    {salida < hoy && <Badge variante="error">Salida vencida</Badge>}
                  </td>
                </tr>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
