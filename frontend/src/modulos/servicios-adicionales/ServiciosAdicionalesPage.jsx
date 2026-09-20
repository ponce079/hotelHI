import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UtensilsCrossed } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { formatearTimestamp, hoyEnHoraLocal } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { obtenerResumenHotel } from "./serviciosAdicionales.api";
import { TIPO_SERVICIO_BADGE, TIPOS_SERVICIO } from "./serviciosAdicionales.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

// Ajuste de flujo (Sprint 3): esta pantalla dejó de ser el lugar donde se
// busca una reserva y se carga un consumo (eso vive ahora únicamente en la
// ficha de la reserva, ver ReservaDetallePage.jsx, más el atajo por
// habitación en HabitacionesPage.jsx). Acá queda una consulta de solo
// lectura de TODO el hotel por período — útil para cambio de turno o
// control de minibar — sin botón de alta.
export function ServiciosAdicionalesPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verConsumosServicio");
  const [desde, setDesde] = useState(hoyEnHoraLocal());
  const [hasta, setHasta] = useState(hoyEnHoraLocal());
  const [tipoServicio, setTipoServicio] = useState("");

  const resumenQuery = useQuery({
    queryKey: ["consumos-servicios", "hotel", desde, hasta, tipoServicio],
    queryFn: () => obtenerResumenHotel({ desde, hasta, tipoServicio: tipoServicio || undefined }),
    enabled: puedeVer,
    refetchInterval: 10000,
  });

  if (!puedeVer) return <SinPermiso />;

  const resumen = resumenQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Servicios Adicionales</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 61 a 64 — consulta de consumos de todo el hotel por período (restaurante, spa, lavandería y minibar)
        </p>
        <p className="mt-1 text-[12.5px] text-piedra">
          Para registrar un consumo, entrá a la ficha de la reserva del huésped o usá el atajo por número de
          habitación desde el Panel de Habitaciones.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-borde bg-white p-5">
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
        <Select
          aria-label="Filtrar por tipo de servicio"
          value={tipoServicio}
          onChange={(e) => setTipoServicio(e.target.value)}
          className="min-w-[190px]"
        >
          <option value="">Todos los servicios</option>
          {TIPOS_SERVICIO.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </Select>
      </div>

      {resumenQuery.isLoading && <p className="text-sm text-piedra">Cargando…</p>}
      {resumenQuery.isError && <p className="text-sm text-error-texto">No se pudieron cargar los consumos.</p>}

      {resumen && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-pino-300 bg-pino-100 p-4">
              <p className="text-[11px] uppercase tracking-wide text-pino-700">Total del período</p>
              <Cifra tamano={26}>{FORMATO_MONEDA.format(resumen.totalGeneral)}</Cifra>
            </div>
            {resumen.totalPorTipo.map((t) => (
              <div key={t.tipoServicio} className="rounded-lg border border-borde bg-white p-4">
                <p className="mb-1">
                  <Badge variante={TIPO_SERVICIO_BADGE[t.tipoServicio]}>{t.tipoServicio}</Badge>
                </p>
                <Cifra tamano={20}>{FORMATO_MONEDA.format(t.total)}</Cifra>
                <p className="mt-0.5 text-[11px] text-piedra">{t.cantidad} cargo{t.cantidad === 1 ? "" : "s"}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-borde bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
              <UtensilsCrossed size={17} className="text-pino" /> Cargos del período
            </h2>
            <Table
              columnas={["Fecha", "Habitación", "Reserva", "Huésped", "Tipo", "Detalle", "Registrado por", "Monto"]}
              columnasDerecha={["Monto"]}
              filas={resumen.items}
              vacio="No hay consumos registrados para el período y filtro elegidos."
              renderFila={(c) => (
                <tr key={c.id} className="border-b border-borde last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{formatearTimestamp(c.fechaHora)}</td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px]">{c.habitacionNumero}</td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px]">{c.reservaCodigoConfirmacion}</td>
                  <td className="px-3 py-2.5 text-[12.5px]">{c.huespedNombre}</td>
                  <td className="px-3 py-2.5">
                    <Badge variante={TIPO_SERVICIO_BADGE[c.tipoServicio]}>{c.tipoServicio}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-piedra">
                    {c.articuloNombre ? `${c.articuloNombre} × ${c.cantidad}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px]">{c.registradoPor}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[13px] font-semibold">
                    {FORMATO_MONEDA.format(c.monto)}
                  </td>
                </tr>
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}
