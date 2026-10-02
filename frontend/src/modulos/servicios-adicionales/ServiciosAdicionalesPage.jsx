import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, UtensilsCrossed } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearTimestamp, hoyEnHoraLocal } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { BuscarConsumoModal } from "./BuscarConsumoModal";
import { ConsumoModal } from "./ConsumoModal";
import { obtenerResumenHotel } from "./serviciosAdicionales.api";
import { TIPO_SERVICIO_BADGE, TIPOS_SERVICIO } from "./serviciosAdicionales.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

// Ajuste de flujo (Sprint 3): esta pantalla dejó de ser el lugar donde se
// busca una reserva y se carga un consumo (eso vivía únicamente en la ficha
// de la reserva, ver ReservaDetallePage.jsx, más el atajo por habitación en
// HabitacionesPage.jsx). Sigue siendo sobre todo una consulta de solo
// lectura de TODO el hotel por período — útil para cambio de turno o
// control de minibar — pero el nombre de la pantalla hace que sea el primer
// lugar donde una recepcionista va a buscar para cargar un consumo, así que
// suma un tercer camino de entrada acá (botón "Cargar consumo" en la barra
// de filtros): busca por código/documento/habitación (BuscarConsumoModal,
// que reusa la misma búsqueda de Check-in) y reabre el mismo ConsumoModal
// de siempre, sin duplicar ninguno de los dos.
export function ServiciosAdicionalesPage() {
  const navigate = useNavigate();
  const { puede } = useSesion();
  const puedeVer = puede("verConsumosServicio");
  const puedeRegistrar = puede("registrarConsumoServicio");
  const [desde, setDesde] = useState(hoyEnHoraLocal());
  const [hasta, setHasta] = useState(hoyEnHoraLocal());
  const [tipoServicio, setTipoServicio] = useState("");
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [reservaConsumo, setReservaConsumo] = useState(null);
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

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
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Servicios Adicionales</h1>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          Consumos de todo el hotel por período (restaurante, spa, lavandería y minibar)
        </p>
      </div>

      {resumen && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-lg border border-pino-300 bg-pino-200 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-pino-700">Total del período</p>
            <Cifra tamano={26} className="mt-1 text-pino-700">{FORMATO_MONEDA.format(resumen.totalGeneral)}</Cifra>
          </div>
          {resumen.totalPorTipo.map((t) => (
            <div key={t.tipoServicio} className="rounded-lg border border-laton-300 bg-laton-100 p-4 text-center">
              <p className="mb-1 uppercase tracking-[0.03em]">
                <Badge variante={TIPO_SERVICIO_BADGE[t.tipoServicio]}>{t.tipoServicio}</Badge>
              </p>
              <Cifra tamano={20} className="mt-1 text-laton-700">{FORMATO_MONEDA.format(t.total)}</Cifra>
              <p className="mt-0.5 text-[11px] text-laton-700">{t.cantidad} cargo{t.cantidad === 1 ? "" : "s"}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] items-center gap-3 rounded-lg border border-borde bg-white px-4 py-2.5">
        <label className="flex items-center gap-2 text-[12.5px] text-tinta/70">
          <span className="shrink-0">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full min-w-0 rounded-md border border-borde bg-white px-3.5 py-2 text-[13.5px] text-tinta focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-tinta/70">
          <span className="shrink-0">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full min-w-0 rounded-md border border-borde bg-white px-3.5 py-2 text-[13.5px] text-tinta focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </label>
        <Select
          aria-label="Filtrar por tipo de servicio"
          value={tipoServicio}
          onChange={(e) => setTipoServicio(e.target.value)}
          className="w-full"
        >
          <option value="">Todos los servicios</option>
          {TIPOS_SERVICIO.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </Select>
        {puedeRegistrar && (
          <Button icono={Plus} onClick={() => setBuscadorAbierto(true)} className="w-full justify-center">
            Cargar consumo
          </Button>
        )}
      </div>

      {resumenQuery.isLoading && <p className="text-sm text-piedra">Cargando…</p>}
      {resumenQuery.isError && <p className="text-sm text-error-texto">No se pudieron cargar los consumos.</p>}

      {resumen && (
        <>
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
                <tr
                  key={c.id}
                  onClick={() => navigate(`/reservas/${c.reservaId}`)}
                  className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
                >
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

      {buscadorAbierto && (
        <BuscarConsumoModal
          onClose={() => setBuscadorAbierto(false)}
          onEncontrada={(reserva) => {
            setBuscadorAbierto(false);
            setReservaConsumo(reserva);
          }}
        />
      )}

      {reservaConsumo && (
        <ConsumoModal
          reserva={reservaConsumo}
          onClose={() => setReservaConsumo(null)}
          onExito={(mensaje) => {
            setReservaConsumo(null);
            mostrarToast(mensaje);
            queryClient.invalidateQueries({ queryKey: ["consumos-servicios"] });
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
