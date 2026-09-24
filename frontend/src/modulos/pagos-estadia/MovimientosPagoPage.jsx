import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { CodigoClave } from "../../componentes/CodigoClave";
import { FilterBar } from "../../componentes/FilterBar";
import { Input } from "../../componentes/Input";
import { NombreClave } from "../../componentes/NombreClave";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { formatearTimestamp } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { useSesion } from "../../lib/sesion";
import { listarMovimientosPago } from "./pagoEstadia.api";
import { CONCEPTO_PAGO_BADGE, CONCEPTOS_PAGO_ESTADIA } from "./pagoEstadia.constantes";

// HU-88 — todos los PagoEstadia de todas las reservas (seña, garantía, pago
// final), en un solo lugar: acá es donde queda visible, por ejemplo, la
// anulación automática de una seña al cancelar una reserva con 24hs+ de
// anticipación (ver reservas.servicio.js). Mismo patrón que
// ComprobantesEstadiaPage.jsx (solo lectura, filtros por fecha/concepto,
// fila clickeable) — no duplica su lógica de filtros, la calca porque
// resuelve el mismo problema sobre otra tabla.
export function MovimientosPagoPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verPagosEstadia");
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [concepto, setConcepto] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const hayFiltros = Boolean(q || concepto || desde || hasta);

  const movimientosQuery = useQuery({
    queryKey: ["pagos-estadia", "movimientos", { q, concepto, desde, hasta }],
    queryFn: () =>
      listarMovimientosPago({
        q: q.trim() || undefined,
        concepto: concepto || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      }),
    enabled: puedeVer,
  });

  if (!puedeVer) return <SinPermiso />;

  const movimientos = movimientosQuery.data ?? [];

  function limpiarFiltros() {
    setQ("");
    setConcepto("");
    setDesde("");
    setHasta("");
  }

  function totalDe(m) {
    return m.medios.reduce((acc, medio) => acc + Number(medio.importe), 0);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Movimientos de pago</h1>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          HU 88 — seña, garantía y pago final de todas las reservas, en un solo listado
        </p>
      </div>

      <FilterBar onClear={hayFiltros ? limpiarFiltros : undefined}>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra" />
          <Input
            className="w-full pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código de reserva o huésped"
          />
        </div>
        <Select value={concepto} onChange={(e) => setConcepto(e.target.value)}>
          <option value="">Todos los conceptos</option>
          {CONCEPTOS_PAGO_ESTADIA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-[12px] text-tinta/70">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta"
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-tinta/70">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta"
          />
        </label>
      </FilterBar>

      <div className="rounded-lg border border-borde bg-white p-5">
        {movimientosQuery.isLoading ? (
          <p className="text-sm text-piedra">Cargando movimientos…</p>
        ) : movimientosQuery.isError ? (
          <p className="text-sm text-error-texto">
            {movimientosQuery.error?.response?.data?.error ?? "No se pudieron cargar los movimientos de pago."}
          </p>
        ) : (
          <Table
            columnas={["Fecha", "Reserva", "Huésped", "Concepto", "Medio", "Importe", "Estado", "Motivo"]}
            columnasDerecha={["Importe"]}
            filas={movimientos}
            vacio={hayFiltros ? "Ningún movimiento coincide con los filtros." : "Todavía no hay movimientos de pago."}
            renderFila={(m) => (
              <tr
                key={m.id}
                onClick={() => navigate(`/reservas/${m.reservaId}`)}
                className="h-12 cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
              >
                <td className="px-3 py-2.5 text-[12.5px]">{formatearTimestamp(m.fecha)}</td>
                <td className="px-3 py-2.5">
                  <CodigoClave>{m.reserva?.codigoConfirmacion ?? m.reservaId}</CodigoClave>
                </td>
                <td className="px-3 py-2.5">
                  <NombreClave>{m.reserva?.huesped?.nombre ?? "—"}</NombreClave>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variante={CONCEPTO_PAGO_BADGE[m.concepto] ?? "neutro"}>{m.concepto}</Badge>
                </td>
                <td className="px-3 py-2.5 text-[12.5px]">{m.medios.map((medio) => medio.medioPago).join(", ")}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">$ {formatearMonto(totalDe(m))}</td>
                <td className="px-3 py-2.5">
                  {m.anulado ? <Badge variante="error">Anulado</Badge> : <Badge variante="ok">Vigente</Badge>}
                </td>
                <td className="px-3 py-2.5 text-[12px] text-piedra">{m.anulado ? (m.motivoAnulacion ?? "—") : "—"}</td>
              </tr>
            )}
          />
        )}
      </div>
    </div>
  );
}
