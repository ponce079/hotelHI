import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, CreditCard, Minus, Plus, RotateCcw, Search } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { CodigoClave } from "../../componentes/CodigoClave";
import { FilterBar } from "../../componentes/FilterBar";
import { Input } from "../../componentes/Input";
import { Pagination } from "../../componentes/Pagination";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { formatearFechaSinHora, formatearTimestamp } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { useSesion } from "../../lib/sesion";
import { listarMovimientosPago } from "./pagoEstadia.api";
import {
  CONCEPTO_GARANTIA,
  CONCEPTO_PAGO_FINAL,
  CONCEPTO_SENIA,
  CONCEPTOS_PAGO_ESTADIA,
} from "./pagoEstadia.constantes";

// HU-88 — todos los PagoEstadia de todas las reservas (seña, garantía, pago
// final), en un solo lugar: acá es donde queda visible, por ejemplo, la
// anulación automática de una seña al cancelar una reserva con 24hs+ de
// anticipación (ver reservas.servicio.js).
//
// Rediseño: una sola tabla continua (catálogo), no una tarjeta por reserva —
// las filas de una misma reserva se agrupan con una celda de rowSpan en la
// columna "Reserva" (mockup de referencia). Los filtros de fecha/concepto
// solo se aplican server-side por `q` (código/huésped — un dato que
// comparten TODOS los movimientos de una reserva, así que filtrar por fila
// o por grupo da lo mismo); concepto y fecha se resuelven acá abajo, a
// nivel de grupo: una reserva entra si ALGÚN movimiento suyo coincide, pero
// el grupo siempre muestra TODOS sus movimientos, no solo el que hizo
// matchear el filtro — cortarlo dejaría una reserva con su contexto
// incompleto.
function movimientoCoincideConcepto(m, concepto) {
  return !concepto || m.concepto === concepto;
}

function movimientoCoincideFecha(m, desde, hasta) {
  if (!desde && !hasta) return true;
  const fecha = new Date(m.fecha);
  if (desde && fecha < new Date(`${desde}T00:00:00`)) return false;
  if (hasta && fecha > new Date(`${hasta}T23:59:59.999`)) return false;
  return true;
}

// Agrupa por reservaId y ordena cada grupo cronológicamente (más viejo
// arriba, más nuevo abajo, para que se lea como una cuenta que avanza) — la
// lista de grupos, en cambio, va por el movimiento MÁS reciente de cada
// reserva (la que tuvo actividad de pago más nueva, arriba de la tabla).
function agruparPorReserva(movimientos, { concepto, desde, hasta }) {
  const porReserva = new Map();
  for (const m of movimientos) {
    const lista = porReserva.get(m.reservaId) ?? [];
    lista.push(m);
    porReserva.set(m.reservaId, lista);
  }

  return Array.from(porReserva.entries())
    .map(([reservaId, lista]) => {
      const ordenados = [...lista].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
      return {
        reservaId,
        reserva: ordenados[ordenados.length - 1].reserva,
        movimientos: ordenados,
        ultimaFecha: new Date(ordenados[ordenados.length - 1].fecha).getTime(),
      };
    })
    .filter(
      (g) =>
        g.movimientos.some((m) => movimientoCoincideConcepto(m, concepto)) &&
        g.movimientos.some((m) => movimientoCoincideFecha(m, desde, hasta))
    )
    .sort((a, b) => b.ultimaFecha - a.ultimaFecha);
}

// Ícono + tono sólido por concepto — así se distingue de un vistazo, sin
// tener que leer el label. "Nota de crédito" no es un concepto que hoy
// exista en pagoEstadia.constantes.js/el modelo (no se toca acá), pero se
// deja mapeado por si el backend lo suma más adelante.
const CONCEPTO_CHIP = {
  [CONCEPTO_SENIA]: { icono: Plus, clase: "bg-laton-100 text-laton-700" },
  [CONCEPTO_GARANTIA]: { icono: CreditCard, clase: "bg-info-suave text-info-texto" },
  [CONCEPTO_PAGO_FINAL]: { icono: Check, clase: "bg-pino-100 text-pino-700" },
  "Nota de crédito": { icono: RotateCcw, clase: "bg-error-suave text-error-texto" },
};
const CHIP_DEFAULT = { icono: Plus, clase: "bg-neutro-300 text-neutro-900" };

function totalDe(m) {
  return m.medios.reduce((acc, medio) => acc + Number(medio.importe), 0);
}

// Chip inline compacto (círculo de 20px + label en la misma fila) para la
// columna Concepto. Un movimiento anulado pisa el ícono/tono del concepto
// con el de "reversión" — así se ve de un vistazo, sin tener que llegar a
// leer el badge de Estado al final de la fila.
function ConceptoChip({ concepto, anulado }) {
  const config = anulado ? { icono: Minus, clase: "bg-error-suave text-error-texto" } : (CONCEPTO_CHIP[concepto] ?? CHIP_DEFAULT);
  const Icono = config.icono;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${config.clase}`}>
        <Icono size={11} />
      </span>
      <span className={`text-[13px] font-semibold ${anulado ? "text-error-texto" : "text-tinta"}`}>{concepto}</span>
    </span>
  );
}

// Borde inferior de cada fila: 6% de opacidad entre movimientos de la
// MISMA reserva, 14% en el corte hacia la próxima — la celda "Reserva"
// (rowSpan) siempre usa el de corte, porque su borde inferior cae justo
// donde termina su grupo.
const BORDE_FILA = "border-b border-tinta/6";
const BORDE_GRUPO = "border-b border-tinta/14";

function CeldaReserva({ reserva, reservaId, filasDelGrupo }) {
  const habitaciones = reserva?.habitaciones ?? [];
  return (
    <td rowSpan={filasDelGrupo} className={`w-[220px] border-r-2 border-pino/18 ${BORDE_GRUPO} px-4 py-3 align-top`}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <CodigoClave>{reserva?.codigoConfirmacion ?? reservaId}</CodigoClave>
          {habitaciones.length > 1 && <Badge variante="info">Grupal</Badge>}
        </div>
        <span className="font-heading text-[15px] font-semibold text-tinta">{reserva?.huesped?.nombre ?? "—"}</span>
        <span className="text-[12px] leading-tight text-piedra">
          Hab. {habitaciones.map((h) => h.numero).join(", ") || "—"}
          {reserva?.fechaDesde && (
            <>
              {" "}
              · {formatearFechaSinHora(reserva.fechaDesde)} → {formatearFechaSinHora(reserva.fechaHasta)}
            </>
          )}
        </span>
      </div>
    </td>
  );
}

function FilaMovimiento({ movimiento: m, reserva, reservaId, esPrimero, filasDelGrupo, esUltimo, onClick }) {
  const borde = esUltimo ? BORDE_GRUPO : BORDE_FILA;
  return (
    <tr onClick={onClick} className="cursor-pointer hover:bg-hueso">
      {esPrimero && <CeldaReserva reserva={reserva} reservaId={reservaId} filasDelGrupo={filasDelGrupo} />}
      <td className={`px-3 py-2.5 ${borde}`}>
        <ConceptoChip concepto={m.concepto} anulado={m.anulado} />
      </td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-[12.5px] text-tinta/80 ${borde}`}>{formatearTimestamp(m.fecha)}</td>
      <td className={`px-3 py-2.5 text-[12.5px] text-tinta/80 ${borde}`}>
        {m.medios.map((medio) => medio.medioPago).join(", ")}
      </td>
      <td
        className={`whitespace-nowrap px-3 py-2.5 text-right font-mono text-[13px] font-semibold ${
          m.anulado ? "text-error-texto line-through" : "text-tinta"
        } ${borde}`}
      >
        $ {formatearMonto(totalDe(m))}
      </td>
      <td className={`px-3 py-2.5 ${borde}`}>
        <Badge variante={m.anulado ? "error" : "ok"}>{m.anulado ? "Anulado" : "Vigente"}</Badge>
      </td>
    </tr>
  );
}

const COLUMNAS = ["Reserva", "Concepto", "Fecha", "Medio", "Importe", "Estado"];

// Reservas por página, no movimientos: paginar por movimiento suelto podría
// cortar el grupo de una reserva a la mitad entre dos páginas, con su celda
// de rowSpan apuntando a filas que ya no están. Mismo PAGE_SIZE que el resto
// de los listados paginados de la app (Proveedores, Requerimientos).
const PAGE_SIZE = 10;

export function MovimientosPagoPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verPagosEstadia");
  const navigate = useNavigate();
  // ?q=<código> — así ReservaDetallePage.jsx puede linkear directo a la
  // fila de una reserva puntual (ej. la seña) sin que el huésped tenga que
  // volver a tipear el código. Solo se lee al montar: si el usuario edita
  // el filtro a mano después, no queremos que el back del navegador se lo
  // pise.
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [concepto, setConcepto] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const hayFiltros = Boolean(q || concepto || desde || hasta);

  const movimientosQuery = useQuery({
    queryKey: ["pagos-estadia", "movimientos", { q }],
    queryFn: () => listarMovimientosPago({ q: q.trim() || undefined }),
    enabled: puedeVer,
  });

  if (!puedeVer) return <SinPermiso />;

  const movimientos = movimientosQuery.data ?? [];
  const grupos = agruparPorReserva(movimientos, { concepto, desde, hasta });
  const totalPaginas = Math.max(1, Math.ceil(grupos.length / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);
  const gruposPagina = grupos.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);

  function actualizarFiltro(setter) {
    return (valor) => {
      setter(valor);
      setPagina(1);
    };
  }
  const actualizarQ = actualizarFiltro(setQ);
  const actualizarConcepto = actualizarFiltro(setConcepto);
  const actualizarDesde = actualizarFiltro(setDesde);
  const actualizarHasta = actualizarFiltro(setHasta);

  function limpiarFiltros() {
    setQ("");
    setConcepto("");
    setDesde("");
    setHasta("");
    setPagina(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Movimientos de pago</h1>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          Seña, garantía y pago final de todas las reservas, agrupados por reserva
        </p>
      </div>

      <FilterBar onClear={hayFiltros ? limpiarFiltros : undefined}>
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra" />
          <Input
            className="w-full pl-9"
            value={q}
            onChange={(e) => actualizarQ(e.target.value)}
            placeholder="Código de reserva o huésped"
          />
        </div>
        <Select value={concepto} onChange={(e) => actualizarConcepto(e.target.value)}>
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
            onChange={(e) => actualizarDesde(e.target.value)}
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta"
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-tinta/70">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => actualizarHasta(e.target.value)}
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta"
          />
        </label>
      </FilterBar>

      {movimientosQuery.isLoading ? (
        <div className="rounded-lg border border-borde bg-white p-5">
          <p className="text-sm text-piedra">Cargando movimientos…</p>
        </div>
      ) : movimientosQuery.isError ? (
        <div className="rounded-lg border border-borde bg-white p-5">
          <p className="text-sm text-error-texto">
            {movimientosQuery.error?.response?.data?.error ?? "No se pudieron cargar los movimientos de pago."}
          </p>
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-lg border border-borde bg-white p-5">
          <p className="text-sm text-piedra">
            {hayFiltros ? "Ninguna reserva coincide con los filtros." : "Todavía no hay movimientos de pago."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-borde bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <colgroup>
                <col style={{ width: 220 }} />
                <col />
                <col style={{ width: 110 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 100 }} />
              </colgroup>
              <thead>
                <tr>
                  {COLUMNAS.map((col) => (
                    <th
                      key={col}
                      className={`border-b border-borde px-3 pb-2.5 pt-4 text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55 ${
                        col === "Importe" ? "text-right" : ""
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gruposPagina.map((g) => {
                  const irADetalle = () => navigate(`/reservas/${g.reservaId}`);
                  return (
                    <Fragment key={g.reservaId}>
                      {g.movimientos.map((m, i) => (
                        <FilaMovimiento
                          key={m.id}
                          movimiento={m}
                          reserva={g.reserva}
                          reservaId={g.reservaId}
                          esPrimero={i === 0}
                          filasDelGrupo={g.movimientos.length}
                          esUltimo={i === g.movimientos.length - 1}
                          onClick={irADetalle}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPaginas > 1 && (
            <div className="px-4 py-3">
              <Pagination page={paginaActual} totalPages={totalPaginas} onChange={setPagina} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
