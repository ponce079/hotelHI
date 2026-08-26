import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { listarDepositos } from "../depositos/depositos.api";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { useToast } from "../../lib/useToast";
import { hoyISO, primerDiaDelMesISO } from "../../lib/fechas";

function agruparConsumo(movimientos) {
  const map = new Map();
  (movimientos ?? []).forEach((m) => {
    m.detalleMovimientos.forEach((l) => {
      const key = m.depositoId + "|" + l.articuloId;
      if (!map.has(key)) {
        map.set(key, { deposito: m.deposito.nombre, articulo: l.articulo.nombre, unidadMedida: l.articulo.unidadMedida, cantidad: 0, movs: 0 });
      }
      const fila = map.get(key);
      fila.cantidad += Number(l.cantidad);
      fila.movs += 1;
    });
  });
  return [...map.values()].sort((a, b) => b.cantidad - a.cantidad);
}

export function ReportePage() {
  const { toast, mostrarToast } = useToast();
  const [depositoId, setDepositoId] = useState("");
  const [desde, setDesde] = useState(primerDiaDelMesISO());
  const [hasta, setHasta] = useState(hoyISO());

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: movimientos, isLoading } = useQuery({
    queryKey: ["movimientos", { tipo: "S", desde, hasta, depositoId: depositoId || undefined }],
    queryFn: () => listarMovimientos({ tipo: "S", desde, hasta, ...(depositoId ? { depositoId } : {}) }),
  });

  const filas = agruparConsumo(movimientos);
  const total = filas.reduce((acc, f) => acc + f.cantidad, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <BarChart3 size={22} className="text-pino" /> Reporte de Consumo
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">HU 9 — consumo por área y período</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[220px] flex-col gap-1.5 text-sm">
          <span className="text-[12px] text-tinta/70">Área / depósito</span>
          <select
            value={depositoId}
            onChange={(e) => setDepositoId(e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-3 py-2 text-sm"
          >
            <option value="">Todas las áreas</option>
            {depositos?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[12px] text-tinta/70">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-md border border-borde px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[12px] text-tinta/70">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-md border border-borde px-3 py-2 text-sm"
          />
        </label>
        <div className="ml-auto flex gap-2 pb-0.5">
          <Button variante="secundario" onClick={() => mostrarToast("Reporte exportado a Excel (simulado).")}>
            Exportar Excel
          </Button>
          <Button variante="secundario" onClick={() => mostrarToast("Reporte exportado a PDF (simulado).")}>
            Exportar PDF
          </Button>
        </div>
      </div>

      <div className="max-w-xs rounded-lg border border-borde bg-white p-5">
        <div className="font-body text-[10.5px] text-tinta/55">Unidades consumidas</div>
        <Cifra tamano={34}>{total}</Cifra>
        <div className="font-body text-[11.5px] text-tinta/55">Sólo movimientos de tipo Salida</div>
      </div>

      {isLoading && <p className="text-sm text-piedra">Cargando…</p>}

      <div className="rounded-lg border border-borde bg-white p-5">
        {!isLoading && filas.length === 0 && <p className="text-sm text-piedra">No hay salidas registradas para los filtros elegidos.</p>}
        {filas.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                <th className="pb-2">Área (depósito)</th>
                <th className="pb-2">Artículo</th>
                <th className="pb-2">Consumo</th>
                <th className="pb-2">Participación</th>
                <th className="pb-2">Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const pct = total ? Math.round((f.cantidad / total) * 100) : 0;
                return (
                  <tr key={i} className="border-t border-borde">
                    <td className="py-2 font-body text-[12.5px]">{f.deposito}</td>
                    <td className="py-2 font-body text-[13.5px] font-semibold">{f.articulo}</td>
                    <td className="py-2">
                      <Cifra tamano={15}>{f.cantidad}</Cifra> <span className="font-body text-[11px] text-tinta/50">{f.unidadMedida}</span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hueso">
                          <div className="h-full rounded-full bg-pino" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-9 font-body text-xs text-tinta/55">{pct}%</span>
                      </div>
                    </td>
                    <td className="py-2 font-body text-[12.5px] text-tinta/55">{f.movs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
