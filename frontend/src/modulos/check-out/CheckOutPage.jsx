import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DoorClosed, Eye, Search } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { FilterBar } from "../../componentes/FilterBar";
import { Input } from "../../componentes/Input";
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
  // Admin ve el listado pero no opera (re-auditoría del 2026-09-21, mismo
  // criterio que Habitaciones/Mantenimiento) — condiciona el botón de cada
  // fila más abajo, no el acceso a la pantalla.
  const puedeGestionar = puede("gestionarCheckOut");
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
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Check-out</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 48 a 52 y 87 — cuenta consolidada, verificación de la habitación, pago y cierre
        </p>
      </div>

      <FilterBar onClear={q ? () => setQ("") : undefined}>
        <div className="relative w-full max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra" />
          <Input
            className="w-full pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código, huésped, documento o habitación"
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
            columnas={["Código", "Huésped", "Habitaciones", "Entrada", "Salida", ""]}
            filas={reservas}
            vacio={q ? "Ninguna reserva en curso coincide con la búsqueda." : "No hay huéspedes alojados en este momento."}
            renderFila={(r) => {
              const salida = r.fechaHasta.slice(0, 10);
              return (
                <tr key={r.id} className="h-12 border-b border-borde last:border-0">
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
                  <td className="px-3 py-2.5 text-right">
                    <Button
                      variante={puedeGestionar ? "ok" : "secundario"}
                      tamano="fila"
                      icono={puedeGestionar ? DoorClosed : Eye}
                      onClick={() => navigate(`/check-out/${r.id}`)}
                    >
                      {puedeGestionar ? "Iniciar check-out" : "Ver"}
                    </Button>
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
