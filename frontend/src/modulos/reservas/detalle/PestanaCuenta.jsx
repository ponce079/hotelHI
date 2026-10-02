import { Badge } from "../../../componentes/Badge";
import { Button } from "../../../componentes/Button";
import { formatearFechaDdMmAaaa } from "../../../lib/fechas";
import { formatearPrecio } from "../../../lib/moneda";
import { FILTROS_CUENTA, filtrarMovimientos, totalesMovimientos } from "./reservaDetalle";

// Una sola lista por fecha: alojamiento noche por noche (con el precio congelado), consumos y pagos.
// Las noches futuras se ven "a devengar". La garantía no está: no es un pago de la cuenta.
export function PestanaCuenta({ movimientos, filtro, onFiltro, cargando, error, onReintentar, onAjustar, onAnular }) {
  const visibles = filtrarMovimientos(movimientos, filtro);
  const t = totalesMovimientos(movimientos);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar la cuenta">
          {FILTROS_CUENTA.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => onFiltro(f.id)}
              className={`cursor-pointer rounded-full border px-3 py-1 font-body text-[13px] font-semibold transition-colors ${
                filtro === f.id ? "border-pino bg-pino text-hueso" : "border-borde bg-white text-piedra hover:bg-hueso"
              }`}
            >
              {f.texto}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-piedra">Precios finales, IVA incluido</span>
      </div>
      {error && (
        <div role="alert" className="rounded border border-error bg-error-suave p-3 text-sm text-error-texto">
          <p>{error}</p>
          <Button className="mt-2" variante="secundario" onClick={onReintentar}>
            Volver a cargar
          </Button>
        </div>
      )}
      {cargando && <p className="text-sm text-piedra">Cargando la cuenta…</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {[
                ["Fecha", "text-left"],
                ["Concepto", "text-left"],
                ["Cargo", "text-right"],
                ["Pago", "text-right"],
                ["", "text-right"],
              ].map(([t, alineacion], i) => (
                <th
                  key={i}
                  className={`border-b border-borde px-3 pb-2 font-body text-xs font-semibold uppercase tracking-wide text-tinta/55 ${alineacion}`}
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-borde align-top last:border-0 ${m.previsto ? "text-piedra" : ""} ${m.anulado ? "text-piedra" : ""}`}
              >
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatearFechaDdMmAaaa(m.fecha)}</td>
                <td className="px-3 py-2.5">
                  <span className={`font-semibold ${m.anulado ? "line-through" : ""}`}>{m.concepto}</span>
                  {m.previsto && (
                    <span className="ml-2">
                      <Badge variante="neutro">a devengar</Badge>
                    </span>
                  )}
                  {m.ajustada && (
                    <span className="ml-2">
                      <Badge variante="alerta">Ajustado · antes {formatearPrecio(m.precioOriginal)}</Badge>
                    </span>
                  )}
                  {m.anulado && (
                    <span className="ml-2">
                      <Badge variante="error">Anulado</Badge>
                    </span>
                  )}
                  {m.detalle && <span className={`block text-[12.5px] text-piedra ${m.anulado ? "line-through" : ""}`}>{m.detalle}</span>}
                  {m.anulado && m.motivoAnulacion && <span className="block text-[12.5px] text-piedra">Motivo: {m.motivoAnulacion}</span>}
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${m.anulado ? "line-through" : ""}`}>
                  {m.cargo != null ? formatearPrecio(m.cargo) : ""}
                </td>
                <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${m.anulado ? "line-through" : ""}`}>
                  {m.pago != null ? formatearPrecio(m.pago) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {m.tipo === "aloj" && onAjustar && !m.anulado && (
                    <Button
                      variante="secundario"
                      tamano="fila"
                      aria-label={`Ajustar precio de ${m.concepto}`}
                      onClick={() => onAjustar(m.nocheId)}
                    >
                      Ajustar precio
                    </Button>
                  )}
                  {m.consumoId && onAnular && !m.anulado && (
                    <Button
                      variante="secundario"
                      tamano="fila"
                      aria-label={`Anular ${m.concepto}`}
                      onClick={() => onAnular(m)}
                    >
                      Anular
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!visibles.length && !cargando && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-piedra">
                  No hay movimientos de este tipo.
                </td>
              </tr>
            )}
            {filtro === "todo" && movimientos.length > 0 && (
              <tr className="border-t-2 border-borde font-semibold">
                <td />
                <td className="px-3 py-2.5">Totales</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatearPrecio(t.total)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatearPrecio(t.pagos)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
