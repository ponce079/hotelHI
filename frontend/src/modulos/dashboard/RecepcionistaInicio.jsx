import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, DoorClosed, LogIn, Search, UtensilsCrossed, Wrench } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { NombreClave } from "../../componentes/NombreClave";
import { Toast } from "../../componentes/Toast";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";
import { listarHabitaciones, listarOrdenesMantenimiento } from "../habitaciones/habitaciones.api";
import { ESTADOS_HABITACION, ESTADO_HABITACION_LABEL, ESTADO_HABITACION_COLOR } from "../habitaciones/habitaciones.constantes";
import "../habitaciones/HabitacionesPage.css";

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

// Mismo criterio de comparación por día calendario UTC que esHoy en
// HabitacionesPage.jsx (duplicada acá a propósito, mismo criterio que el
// resto del proyecto: cada archivo se queda autocontenido en vez de
// compartir un helper de una sola línea entre módulos).
function esMismoDiaQueHoy(fechaISO) {
  if (!fechaISO) return false;
  const hoyUTC = Date.parse(`${hoyEnHoraLocal()}T00:00:00Z`);
  const fecha = new Date(fechaISO);
  const fechaUTC = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return fechaUTC === hoyUTC;
}

function saludoActual() {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_ARGENTINA, hour: "2-digit", hour12: false }).format(new Date())
  );
  if (hora < 12) return "Buenos días";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

function fechaCompletaHoy() {
  const texto = new Date().toLocaleDateString("es-AR", {
    timeZone: ZONA_ARGENTINA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function habitacionesDeReserva(reserva) {
  return reserva.habitaciones.map((h) => `${h.numero} · ${h.tipo}`).join(", ");
}

const ACCESOS = [
  { label: "Check-in", icon: LogIn, to: "/check-in" },
  { label: "Check-out", icon: DoorClosed, to: "/check-out" },
  { label: "Reservas", icon: CalendarDays, to: "/reservas" },
  { label: "Servicios Adicionales", icon: UtensilsCrossed, to: "/servicios-adicionales" },
];

function ListaReservas({ titulo, reservas, vacio, etiquetaAccion, onAccion }) {
  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="mb-3 font-heading text-[16px] font-semibold">
        {titulo} · {reservas.length}
      </h2>
      {reservas.length === 0 ? (
        <p className="text-sm text-piedra">{vacio}</p>
      ) : (
        <div className="flex flex-col divide-y divide-borde">
          {reservas.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <NombreClave className="block">{r.huesped?.nombre}</NombreClave>
                <p className="text-[12px] text-piedra">Hab. {habitacionesDeReserva(r)}</p>
              </div>
              <button
                type="button"
                onClick={() => onAccion(r)}
                className="shrink-0 cursor-pointer text-[12.5px] font-semibold text-pino underline-offset-2 hover:underline"
              >
                {etiquetaAccion}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecepcionistaInicio() {
  const navigate = useNavigate();
  const { usuario, rolInfo } = useSesion();
  const [busqueda, setBusqueda] = useState("");
  const { toast, mostrarToast } = useToast();

  const reservasConfirmadasQuery = useQuery({
    queryKey: ["reservas", "confirmadas"],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.CONFIRMADA }),
  });
  const reservasEnCursoQuery = useQuery({
    queryKey: ["reservas", "en-curso"],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO }),
  });
  const habitacionesQuery = useQuery({
    queryKey: ["habitaciones", "resumen"],
    queryFn: () => listarHabitaciones({ activo: "true" }),
  });
  const ordenesQuery = useQuery({
    queryKey: ["ordenes-mantenimiento"],
    queryFn: () => listarOrdenesMantenimiento(),
  });

  // Buscador único del header: primero prueba como reserva (mismo endpoint
  // que ya usa Check-in — reservasServicio.obtenerPorCodigoODocumento, ver
  // checkIn.api.js), y si no matchea ninguna, cae a número de habitación
  // exacto. No reimplementa ninguna de las dos búsquedas.
  const busquedaMutation = useMutation({
    mutationFn: async (termino) => {
      try {
        const resultado = await buscarReservaParaCheckIn({ codigo: termino });
        return { tipo: "reserva", id: resultado.reserva.id };
      } catch (error) {
        if (error?.response?.status !== 404) throw error;
      }
      const habitaciones = await listarHabitaciones({ q: termino, activo: "true" });
      const habitacion = habitaciones.find((h) => h.numero === termino);
      if (!habitacion) throw new Error(`No se encontró ninguna reserva ni habitación para "${termino}".`);
      return { tipo: "habitacion", id: habitacion.id };
    },
    onSuccess: (resultado) => {
      navigate(resultado.tipo === "reserva" ? `/reservas/${resultado.id}` : `/habitaciones/${resultado.id}`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? error.message ?? "No se pudo completar la búsqueda."),
  });

  function manejarBusqueda(e) {
    e.preventDefault();
    const termino = busqueda.trim();
    if (termino) busquedaMutation.mutate(termino);
  }

  const llegadasHoy = (reservasConfirmadasQuery.data ?? []).filter((r) => esMismoDiaQueHoy(r.fechaDesde));
  const salidasHoy = (reservasEnCursoQuery.data ?? []).filter((r) => esMismoDiaQueHoy(r.fechaHasta));
  const habitaciones = habitacionesQuery.data ?? [];
  const mantenimientoPendiente = (ordenesQuery.data ?? []).filter((o) => o.estado === "Pendiente").slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-pino px-6 py-5 text-hueso">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">
            {saludoActual()}, {usuario ?? rolInfo?.label}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
            {rolInfo?.label} · {fechaCompletaHoy()}
          </p>
        </div>
        <form onSubmit={manejarBusqueda} className="relative w-full max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código, documento o N° de habitación…"
            className="w-full rounded-md border border-borde bg-white py-2.5 pl-9 pr-3 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino-300"
          />
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACCESOS.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => navigate(a.to)}
            className="room-card flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-borde bg-white px-4 py-5 text-center"
          >
            <a.icon size={20} className="text-pino" />
            <span className="font-heading text-[14px] font-semibold">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          <ListaReservas
            titulo="Llegadas de hoy"
            reservas={llegadasHoy}
            vacio="Sin llegadas para hoy."
            etiquetaAccion="→ Iniciar check-in"
            onAccion={(r) => navigate(`/check-in?codigo=${encodeURIComponent(r.codigoConfirmacion)}`)}
          />
          <ListaReservas
            titulo="Salidas de hoy"
            reservas={salidasHoy}
            vacio="Sin salidas para hoy."
            etiquetaAccion="→ Iniciar check-out"
            onAccion={(r) => navigate(`/check-out/${r.id}`)}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-borde bg-white p-5">
            <h2 className="mb-3 font-heading text-[16px] font-semibold">Habitaciones</h2>
            <div className="flex flex-col gap-2">
              {ESTADOS_HABITACION.map((valor) => {
                const cantidad = habitaciones.filter((h) => h.estado === valor).length;
                const color = ESTADO_HABITACION_COLOR[valor];
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => navigate(`/habitaciones?estado=${encodeURIComponent(valor)}`)}
                    style={{ backgroundColor: color.fondo, color: color.texto, borderColor: color.borde }}
                    className="stat-chip flex cursor-pointer items-center justify-between rounded-lg border px-4 py-2.5 text-left"
                  >
                    <span className="text-[13px] font-semibold">{ESTADO_HABITACION_LABEL[valor]}</span>{" "}
                    <Cifra tamano={20}>{cantidad}</Cifra>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-borde bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 font-heading text-[16px] font-semibold">
                <Wrench size={15} className="text-pino" /> Mantenimiento pendiente
              </h2>
              <Link to="/historial-mantenimiento" className="shrink-0 text-[12.5px] font-semibold text-pino hover:underline">
                Ver todo →
              </Link>
            </div>
            {mantenimientoPendiente.length === 0 ? (
              <p className="text-sm text-piedra">Sin órdenes de mantenimiento pendientes.</p>
            ) : (
              <div className="flex flex-col divide-y divide-borde">
                {mantenimientoPendiente.map((orden) => (
                  <div key={orden.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-[13px] font-medium">Hab. {orden.habitacion?.numero}</p>
                      <p className="text-[12px] text-piedra">{orden.tipoTarea}</p>
                    </div>
                    {orden.urgente && <Badge variante="error">Urgente</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
