import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { History } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { listarArticulos } from "../articulos/articulos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { consultarStock } from "../stock/stock.api";

// Reconstruye el saldo corriente hacia adelante: arranca del stock actual,
// le resta el efecto neto de todos los movimientos listados para obtener
// el saldo inicial, y despues re-recorre en orden cronologico sumando cada
// movimiento — asi cada fila queda con el saldo que hubo DESPUES de aplicarla.
function calcularKardex(movimientos, articuloId, stockActual) {
  const lineaDe = (m) => m.detalleMovimientos.find((d) => d.articuloId === articuloId);
  const cantidadDe = (m) => Number(lineaDe(m)?.cantidad ?? 0);
  const ascendente = [...(movimientos ?? [])].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const neto = ascendente.reduce((acc, m) => acc + (m.tipoMovStock.tipo === "E" ? cantidadDe(m) : -cantidadDe(m)), 0);
  let saldo = Number(stockActual) - neto;
  const inicial = saldo;
  const filas = ascendente.map((m) => {
    const cantidad = cantidadDe(m);
    const linea = lineaDe(m);
    saldo += m.tipoMovStock.tipo === "E" ? cantidad : -cantidad;
    const tieneDiferencia = linea?.cantidadRecibida != null && Number(linea.cantidadRecibida) < Number(linea.cantidad);
    return { ...m, cantidad, saldo, tieneDiferencia, cantidadRecibida: linea?.cantidadRecibida };
  });
  return { filas: filas.reverse(), inicial, actual: Number(stockActual) };
}

function vinculadoDe(f) {
  if (f.movimientoRelacionadoId) return `MOV-${String(f.movimientoRelacionadoId).padStart(4, "0")}`;
  if (f.estado === "En tránsito") return "en tránsito";
  return "—";
}

export function KardexPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const articuloId = searchParams.get("articuloId") ?? "";
  const depositoId = searchParams.get("depositoId") ?? "";

  const { data: articulos } = useQuery({
    queryKey: ["articulos", { estado: "todos", pageSize: 500 }],
    queryFn: () => listarArticulos({ estado: "todos", pageSize: 500 }),
  });
  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: movimientos, isLoading } = useQuery({
    queryKey: ["movimientos", { articuloId, depositoId }],
    queryFn: () => listarMovimientos({ articuloId, depositoId }),
    enabled: Boolean(articuloId && depositoId),
  });
  const { data: stockFilas } = useQuery({
    queryKey: ["stock", { articuloId, depositoId, incluirInactivos: true }],
    queryFn: () => consultarStock({ articuloId, depositoId, incluirInactivos: true }),
    enabled: Boolean(articuloId && depositoId),
  });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    setSearchParams(params);
  }

  const stockActual = stockFilas?.[0]?.stockActual ?? 0;
  const unidadMedida = stockFilas?.[0]?.unidadMedida ?? "";
  const kardex = articuloId && depositoId ? calcularKardex(movimientos, Number(articuloId), stockActual) : null;
  const articuloSel = articulos?.items?.find((a) => String(a.id) === articuloId);
  const depositoSel = depositos?.find((d) => String(d.id) === depositoId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variante="fantasma"
          onClick={() => navigate(depositoId ? `/depositos/${depositoId}` : "/depositos")}
          className="mb-2 text-xs"
        >
          ← Volver
        </Button>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <History size={22} className="text-pino" /> Kardex del artículo
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 16 — historial del artículo en el depósito (se entra desde Depósitos y Stock)
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[300px] flex-col gap-1.5 text-sm">
          <span className="text-[12px] text-tinta/70">Artículo</span>
          <select
            value={articuloId}
            onChange={(e) => actualizarFiltro("articuloId", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-3 py-2 text-sm"
          >
            <option value="">Seleccionar…</option>
            {articulos?.items?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} · {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[220px] flex-col gap-1.5 text-sm">
          <span className="text-[12px] text-tinta/70">Depósito</span>
          <select
            value={depositoId}
            onChange={(e) => actualizarFiltro("depositoId", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-3 py-2 text-sm"
          >
            <option value="">Seleccionar…</option>
            {depositos?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!articuloId || !depositoId ? (
        <p className="text-sm text-piedra">Elegí un artículo y un depósito para ver su historial.</p>
      ) : isLoading ? (
        <p className="text-sm text-piedra">Cargando…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3.5">
            <div className="flex min-w-[170px] flex-col items-center gap-0.5 rounded-[18.4px] bg-white px-5 py-3.5 text-center">
              <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pino">Saldo inicial</div>
              <Cifra tamano={26}>{kardex.inicial}</Cifra>
            </div>
            <div className="flex min-w-[170px] flex-col items-center gap-0.5 rounded-[18.4px] bg-pino-100 px-5 py-3.5 text-center">
              <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pino">Saldo actual</div>
              <div>
                <Cifra tamano={26}>{kardex.actual}</Cifra> <span className="font-body text-xs">{unidadMedida}</span>
              </div>
            </div>
            <div className="flex min-w-[240px] flex-1 flex-col items-center gap-0.5 rounded-[18.4px] bg-white px-5 py-3.5 text-center">
              <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pino">Artículo / depósito</div>
              <div className="font-body text-[15px] font-semibold">
                {articuloSel?.nombre} — {depositoSel?.nombre}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-borde bg-white p-5">
            {kardex.filas.length === 0 ? (
              <p className="text-sm text-piedra">Este artículo no tiene movimientos registrados en ese depósito.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                      <th className="pb-2">Fecha</th>
                      <th className="pb-2">Movimiento</th>
                      <th className="pb-2">Tipo</th>
                      <th className="pb-2">Entrada</th>
                      <th className="pb-2">Salida</th>
                      <th className="pb-2">Saldo</th>
                      <th className="pb-2">Usuario</th>
                      <th className="pb-2">Vinculado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardex.filas.map((f) => (
                      <tr key={f.id} className="border-t border-borde">
                        <td className="py-2 font-body text-[12.5px]">{new Date(f.fecha).toLocaleDateString("es-AR")}</td>
                        <td className="py-2 font-mono text-xs">MOV-{String(f.id).padStart(4, "0")}</td>
                        <td className="py-2">
                          <Badge variante={f.tipoMovStock.tipo === "E" ? "ok" : "alerta"}>
                            {f.tipoMovStock.descripcion}
                            {f.tieneDiferencia ? ` (recibido ${f.cantidadRecibida} de ${f.cantidad})` : ""}
                          </Badge>
                        </td>
                        <td className="py-2 font-body text-[13px] text-pino">{f.tipoMovStock.tipo === "E" ? `+${f.cantidad}` : ""}</td>
                        <td className="py-2 font-body text-[13px] text-error-texto">{f.tipoMovStock.tipo === "S" ? `−${f.cantidad}` : ""}</td>
                        <td className="py-2"><Cifra tamano={14}>{f.saldo}</Cifra></td>
                        <td className="py-2 font-body text-xs text-tinta/60">{f.usuario ?? "—"}</td>
                        <td className="py-2 font-mono text-[11.5px] text-tinta/55">{vinculadoDe(f)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
