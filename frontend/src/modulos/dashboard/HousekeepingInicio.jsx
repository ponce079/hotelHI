import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { Wrench } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { Toast } from "../../componentes/Toast";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import {
  listarHabitaciones,
  listarOrdenesMantenimiento,
  actualizarEstadoHabitacion,
  resolverOrdenMantenimiento,
} from "../habitaciones/habitaciones.api";
import { ESTADO_HABITACION_COLOR } from "../habitaciones/habitaciones.constantes";
import "../habitaciones/HabitacionesPage.css";

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

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

// Tonos de las 3 tarjetas de pulso: "en limpieza" y "libre" reusan la misma
// rampa saturada del Panel de Habitaciones (ESTADO_HABITACION_COLOR), y
// mantenimiento pendiente toma el mismo tono laton/alerta que ya usa el chip
// "Pendientes" de Historial de Mantenimiento (duplicado acá a propósito,
// mismo criterio de archivo autocontenido que el resto de las pantallas de
// Inicio por rol).
const COLOR_LIMPIAR = ESTADO_HABITACION_COLOR["en limpieza"];
const COLOR_LISTAS = ESTADO_HABITACION_COLOR.libre;
const COLOR_MANTENIMIENTO = { fondo: "#f8f0df", texto: "#7c541f", borde: "#e0c896" };

function TarjetaPulso({ label, value, hint, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ backgroundColor: color.fondo, color: color.texto, borderColor: color.borde }}
      className="stat-chip flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border p-4 text-center"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.03em]">{label}</div>
      <Cifra tamano={34}>{value}</Cifra>
      {hint && <div className="mt-0.5 text-[11.5px] font-medium">{hint}</div>}
    </button>
  );
}

export function HousekeepingInicio() {
  const navigate = useNavigate();
  const { usuario, rolInfo } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [ordenAResolver, setOrdenAResolver] = useState(null);

  const habitacionesQuery = useQuery({
    queryKey: ["habitaciones", "resumen"],
    queryFn: () => listarHabitaciones({ activo: "true" }),
  });
  const ordenesQuery = useQuery({
    queryKey: ["ordenes-mantenimiento"],
    queryFn: () => listarOrdenesMantenimiento(),
  });

  // Atajo "→ Marcar como limpia" (HU-35): mismo mutationFn que ya usa el
  // Panel de Habitaciones (HabitacionesPage.jsx), no se reimplementa.
  const mutacionMarcarLimpia = useMutation({
    mutationFn: (id) => actualizarEstadoHabitacion(id, "libre"),
    onSuccess: (actualizada) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      mostrarToast(`Habitación ${actualizada.numero} marcada como libre.`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo marcar la habitación como limpia."),
  });

  // "Resolver →" con confirmación: mismo mutationFn y mismo ConfirmDialog que
  // ya usa Historial de Mantenimiento (HistorialMantenimientoPage.jsx), no
  // se duplica la lógica de resolución acá.
  const mutacionResolver = useMutation({
    mutationFn: () => resolverOrdenMantenimiento(ordenAResolver.id, usuario),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
      mostrarToast(`Orden de mantenimiento de la habitación ${ordenAResolver.habitacion?.numero} marcada como resuelta.`);
      setOrdenAResolver(null);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo marcar la orden como resuelta."),
  });

  const habitaciones = habitacionesQuery.data ?? [];
  const enLimpieza = [...habitaciones]
    .filter((h) => h.estado === "en limpieza")
    .sort((a, b) => a.piso - b.piso || a.numero.localeCompare(b.numero));
  const libres = habitaciones.filter((h) => h.estado === "libre").length;

  const ordenes = ordenesQuery.data ?? [];
  const pendientes = ordenes.filter((o) => o.estado === "Pendiente");
  const urgentes = pendientes.filter((o) => o.urgente);

  // Pisos del gráfico: derivados de las habitaciones activas reales (no hay
  // un enum fijo de pisos en el sistema, ver piso Int en el schema), así que
  // se muestran TODOS los pisos existentes aunque no tengan ninguna
  // habitación en limpieza — a diferencia de las alertas en cero que sí se
  // ocultan en otras pantallas, acá la lista de pisos da el panorama
  // completo del edificio.
  const pisos = [...new Set(habitaciones.map((h) => h.piso))].sort((a, b) => a - b);
  const porPiso = pisos.map((piso) => ({
    piso,
    cantidad: enLimpieza.filter((h) => h.piso === piso).length,
  }));
  const maxPorPiso = Math.max(1, ...porPiso.map((p) => p.cantidad));

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
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <TarjetaPulso
          label="Para limpiar ahora"
          value={enLimpieza.length}
          color={COLOR_LIMPIAR}
          onClick={() => navigate(`/habitaciones?estado=${encodeURIComponent("en limpieza")}`)}
        />
        <TarjetaPulso
          label="Habitaciones listas"
          value={libres}
          color={COLOR_LISTAS}
          onClick={() => navigate(`/habitaciones?estado=${encodeURIComponent("libre")}`)}
        />
        <TarjetaPulso
          label="Mantenimiento pendiente"
          value={pendientes.length}
          hint={urgentes.length > 0 ? `· ${urgentes.length} urgente${urgentes.length === 1 ? "" : "s"}` : null}
          color={COLOR_MANTENIMIENTO}
          onClick={() => navigate("/historial-mantenimiento")}
        />
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-3 font-heading text-[16px] font-semibold">Pendientes de limpieza por piso</h2>
        {porPiso.length === 0 ? (
          <p className="text-sm text-piedra">No hay pisos registrados.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {porPiso.map(({ piso, cantidad }) => (
              <div key={piso}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="font-medium">Piso {piso}</span>
                  <span className="font-mono text-tinta/60">{cantidad}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutro-200">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(cantidad / maxPorPiso) * 100}%`, backgroundColor: COLOR_LIMPIAR.texto }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-borde bg-white p-5">
          <h2 className="mb-3 font-heading text-[16px] font-semibold">Habitaciones en limpieza · {enLimpieza.length}</h2>
          {enLimpieza.length === 0 ? (
            <p className="text-sm text-piedra">No hay habitaciones pendientes de limpieza ahora.</p>
          ) : (
            <div className="flex flex-col divide-y divide-borde">
              {enLimpieza.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-[13px] font-medium">
                      Hab. {h.numero} · {h.tipo}
                    </p>
                    <p className="text-[12px] text-piedra">Piso {h.piso}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => mutacionMarcarLimpia.mutate(h.id)}
                    className="shrink-0 cursor-pointer text-[12.5px] font-semibold text-pino underline-offset-2 hover:underline"
                  >
                    → Marcar como limpia
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-borde bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-heading text-[16px] font-semibold">
              <Wrench size={15} className="text-pino" /> Mantenimiento pendiente · {pendientes.length}
            </h2>
            <Link to="/historial-mantenimiento" className="shrink-0 text-[12.5px] font-semibold text-pino hover:underline">
              Ver historial completo →
            </Link>
          </div>
          {pendientes.length === 0 ? (
            <p className="text-sm text-piedra">Sin órdenes de mantenimiento pendientes.</p>
          ) : (
            <div className="flex flex-col divide-y divide-borde">
              {pendientes.map((orden) => (
                <div key={orden.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-[13px] font-medium">Hab. {orden.habitacion?.numero}</p>
                    <p className="text-[12px] text-piedra">{orden.tipoTarea}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {orden.urgente && <Badge variante="error">Urgente</Badge>}
                    <button
                      type="button"
                      onClick={() => setOrdenAResolver(orden)}
                      className="cursor-pointer text-[12.5px] font-semibold text-pino underline-offset-2 hover:underline"
                    >
                      Resolver →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        abierto={Boolean(ordenAResolver)}
        titulo={`¿Confirmás que el problema en la habitación ${ordenAResolver?.habitacion?.numero ?? ""} fue resuelto?`}
        mensaje="La habitación va a volver a su estado anterior."
        textoConfirmar="Confirmar"
        variante="alta"
        cargando={mutacionResolver.isPending}
        onCancelar={() => setOrdenAResolver(null)}
        onConfirmar={() => mutacionResolver.mutate()}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
