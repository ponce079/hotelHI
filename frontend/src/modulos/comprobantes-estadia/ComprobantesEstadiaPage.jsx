import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Eye, Search } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { FilterBar } from "../../componentes/FilterBar";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { formatearTimestamp } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { useSesion } from "../../lib/sesion";
import { listarComprobantes } from "./comprobanteEstadia.api";
import { TIPO_COMPROBANTE_BADGE, TIPOS_COMPROBANTE_ESTADIA } from "./comprobanteEstadia.constantes";

export function ComprobantesEstadiaPage() {
  const { puede } = useSesion();
  // Admin ve el listado pero no opera (re-auditoría del 2026-09-21) — esta
  // pantalla solo lista y navega a "Ver", así que "ver" alcanza para todo
  // lo que hace acá; "gestionar" solo se usa en la ficha de detalle.
  const puedeVer = puede("verComprobantesEstadia");
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const hayFiltros = Boolean(q || tipo || desde || hasta);

  const comprobantesQuery = useQuery({
    queryKey: ["comprobantes-estadia", "lista", { q, tipo, desde, hasta }],
    queryFn: () =>
      listarComprobantes({
        q: q.trim() || undefined,
        tipo: tipo || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      }),
    enabled: puedeVer,
  });

  if (!puedeVer) return <SinPermiso />;

  const comprobantes = comprobantesQuery.data ?? [];

  function limpiarFiltros() {
    setQ("");
    setTipo("");
    setDesde("");
    setHasta("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Comprobantes de huésped</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 53, 55 y 56 — comprobantes de estadía y notas de crédito
        </p>
      </div>

      <FilterBar onClear={hayFiltros ? limpiarFiltros : undefined}>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra" />
          <Input
            className="w-full pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Número, huésped, reserva o razón social"
          />
        </div>
        <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS_COMPROBANTE_ESTADIA.map((t) => (
            <option key={t} value={t}>
              {t}
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
        {comprobantesQuery.isLoading ? (
          <p className="text-sm text-piedra">Cargando comprobantes…</p>
        ) : comprobantesQuery.isError ? (
          <p className="text-sm text-error-texto">
            {comprobantesQuery.error?.response?.data?.error ?? "No se pudieron cargar los comprobantes."}
          </p>
        ) : (
          <Table
            columnas={["Número", "Tipo", "A nombre de", "Reserva", "Emitido", "Total", "Estado", ""]}
            columnasDerecha={["Total"]}
            filas={comprobantes}
            vacio={hayFiltros ? "Ningún comprobante coincide con los filtros." : "Todavía no se emitió ningún comprobante."}
            renderFila={(c) => {
              const esNota = c.tipo === "Nota de Crédito";
              return (
                <tr key={c.id} className="h-12 border-b border-borde last:border-0">
                  <td className="px-3 py-2.5">
                    <CodigoClave>{c.numero}</CodigoClave>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variante={TIPO_COMPROBANTE_BADGE[c.tipo]}>{c.tipo}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">{c.razonSocialTercero ?? c.reserva?.huesped?.nombre ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px]">{c.reserva?.codigoConfirmacion ?? c.reservaId}</td>
                  <td className="px-3 py-2.5 text-[12.5px]">{formatearTimestamp(c.fecha)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {esNota ? "− " : ""}$ {formatearMonto(c.importeTotal)}
                  </td>
                  <td className="px-3 py-2.5">{c.anulado ? <Badge variante="neutro">Anulado</Badge> : <Badge variante="ok">Vigente</Badge>}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Button variante="secundario" tamano="fila" icono={Eye} onClick={() => navigate(`/comprobantes-estadia/${c.id}`)}>
                      Ver
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
