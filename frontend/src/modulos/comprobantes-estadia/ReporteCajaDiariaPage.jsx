import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { obtenerReporteCajaDiaria } from "./comprobanteEstadia.api";

const moneda = (n) => `$ ${formatearMonto(n)}`;

// HU-54 — caja diaria del gerente: lo COBRADO ese día por medio de pago,
// menos las notas de crédito del día, y aparte los CARGOS por tipo de
// servicio. Son dos cosas distintas y por eso van en tablas separadas: un
// consumo cargado a la cuenta de un huésped todavía no es plata cobrada.
export function ReporteCajaDiariaPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verCajaDiaria");
  const { toast, mostrarToast } = useToast();
  const [fecha, setFecha] = useState(hoyEnHoraLocal());

  const reporteQuery = useQuery({
    queryKey: ["comprobantes-estadia", "caja-diaria", fecha],
    queryFn: () => obtenerReporteCajaDiaria(fecha),
    enabled: puedeVer && Boolean(fecha),
  });

  if (!puedeVer) return <SinPermiso />;

  const reporte = reporteQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Caja diaria</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 54 — cobros por medio de pago y cargos por tipo de servicio
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-borde bg-white p-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[12px] text-tinta/70">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-md border border-borde px-3 py-2 text-sm"
          />
        </label>
        <div className="ml-auto flex gap-2 pb-0.5">
          <Button variante="secundario" icono={Download} onClick={() => mostrarToast("Caja diaria exportada a Excel (simulado).")}>
            Exportar Excel
          </Button>
          <Button variante="secundario" icono={Download} onClick={() => mostrarToast("Caja diaria exportada a PDF (simulado).")}>
            Exportar PDF
          </Button>
        </div>
      </div>

      {reporteQuery.isLoading ? (
        <p className="text-sm text-piedra">Calculando la caja del día…</p>
      ) : reporteQuery.isError ? (
        <p className="text-sm text-error-texto">
          {reporteQuery.error?.response?.data?.error ?? "No se pudo calcular la caja diaria."}
        </p>
      ) : (
        reporte && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-borde bg-white p-5">
                <div className="font-body text-[10.5px] text-tinta/55">Total cobrado</div>
                <Cifra tamano={30}>{moneda(reporte.totalCobrado)}</Cifra>
                <div className="font-body text-[11.5px] text-tinta/55">Pagos no anulados del día</div>
              </div>
              <div className="rounded-lg border border-borde bg-white p-5">
                <div className="font-body text-[10.5px] text-tinta/55">Notas de crédito</div>
                <Cifra tamano={30}>− {moneda(reporte.totalNotasCredito)}</Cifra>
                <div className="font-body text-[11.5px] text-tinta/55">Emitidas y no anuladas ese día</div>
              </div>
              <div className="rounded-lg border border-pino bg-white p-5">
                <div className="font-body text-[10.5px] text-tinta/55">Neto del día</div>
                <Cifra tamano={30} className="text-pino">
                  {moneda(reporte.totalNeto)}
                </Cifra>
                <div className="font-body text-[11.5px] text-tinta/55">Cobrado menos notas de crédito</div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-borde bg-white p-5">
                <h2 className="mb-4 font-heading text-[19px] font-semibold">Cobrado por medio de pago</h2>
                <Table
                  columnas={["Medio de pago", "Total"]}
                  columnasDerecha={["Total"]}
                  filas={reporte.totalPorMedio}
                  vacio="No se registraron cobros ese día."
                  renderFila={(m) => (
                    <tr key={m.medioPago} className="h-11 border-b border-borde last:border-0">
                      <td className="px-3 py-2 text-[13px]">{m.medioPago}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{moneda(m.total)}</td>
                    </tr>
                  )}
                />
              </div>

              <div className="rounded-lg border border-borde bg-white p-5">
                <h2 className="font-heading text-[19px] font-semibold">Cargos por tipo de servicio</h2>
                <p className="mb-4 mt-0.5 text-[12px] text-piedra">
                  Lo cargado a las cuentas ese día, cobrado o no. No se suma al total cobrado.
                </p>
                <Table
                  columnas={["Servicio", "Total"]}
                  columnasDerecha={["Total"]}
                  filas={reporte.totalPorServicio}
                  vacio="No se cargaron servicios adicionales ese día."
                  renderFila={(s) => (
                    <tr key={s.tipoServicio} className="h-11 border-b border-borde last:border-0">
                      <td className="px-3 py-2 text-[13px]">{s.tipoServicio}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{moneda(s.total)}</td>
                    </tr>
                  )}
                />
              </div>
            </div>
          </>
        )
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
