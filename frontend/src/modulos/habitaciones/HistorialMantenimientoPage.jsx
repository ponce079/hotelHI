import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Wrench } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearTimestamp } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { listarOrdenesMantenimiento, resolverOrdenMantenimiento } from "./habitaciones.api";
import { ESTADO_HABITACION_COLOR, ESTADO_ORDEN_MANTENIMIENTO_BADGE } from "./habitaciones.constantes";

// "Todos" no es un estado de habitación (a diferencia de los otros 3 chips,
// que sí reusan ESTADO_HABITACION_COLOR) — necesita su propio color,
// neutro/grisáceo a propósito para no confundirse con "Pendientes" (que ya
// usa el mismo dorado que "mantenimiento").
const COLOR_TODOS = { fondo: "#e2dccd", texto: "#67604e", borde: "#a79e88" };

// Orden por defecto (sin filtro, o dentro del subconjunto que haya
// quedado visible tras aplicar los chips de abajo): Pendiente antes que
// Resuelta, y dentro de un mismo estado, Urgente antes que Normal. Empate
// final por fecha, más reciente primero (mismo criterio con el que ya
// viene ordenado listarOrdenesMantenimiento, pero no hay que asumirlo acá
// una vez que se filtra/reordena en memoria).
function compararOrdenes(a, b) {
  if (a.estado !== b.estado) return a.estado === "Pendiente" ? -1 : 1;
  if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
  return new Date(b.fecha) - new Date(a.fecha);
}

// Mockup revisado: colores sutiles (pastel solo cuando está activo, nunca
// relleno sólido) y SIN el hover con movimiento de .stat-chip (ese efecto
// queda reservado a las tarjetas de habitación) — por eso este chip no
// reusa esa clase ni ese componente, es su propio estilo estático.
function ChipFiltro({ label, cantidad, color, activo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={activo ? { backgroundColor: color.fondo, borderColor: color.borde, color: color.texto } : undefined}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] ${
        activo ? "" : "border-borde bg-white text-piedra"
      }`}
    >
      <Cifra tamano={15}>{cantidad}</Cifra>{" "}
      <span className="font-body">{label}</span>
    </button>
  );
}

// Ya no es de solo lectura: HU-33/34 le suma la acción "Marcar como
// resuelta" para que las órdenes pendientes no "se pierdan" acá esperando
// a que alguien entre al Detalle de la habitación puntual.
export function HistorialMantenimientoPage() {
  const { puede, usuario } = useSesion();
  const puedeVer = puede("verHabitaciones");
  // Mismo permiso que ya usa este mismo botón en el Detalle de Habitación
  // (ver HabitacionDetallePage.jsx: puede("resolverMantenimiento"), housekeeping
  // exclusivo) — no se inventa un gate nuevo para esta pantalla.
  const puedeResolver = puede("resolverMantenimiento");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();

  // Mismo queryKey que el badge del menú lateral (Layout.jsx) y que
  // MantenimientoModal.jsx ya invalida al crear una orden: comparten
  // caché, así que tener esta tabla y el badge montados a la vez no
  // duplica el pedido de red.
  const ordenes = useQuery({
    queryKey: ["ordenes-mantenimiento"],
    queryFn: () => listarOrdenesMantenimiento(),
    enabled: puedeVer,
  });

  const [filtroEstado, setFiltroEstado] = useState(null); // null | "Pendiente" | "Resuelta"
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [ordenAResolver, setOrdenAResolver] = useState(null);

  // Confirmación simple (sin pedir un nombre a mano, a diferencia del
  // flujo del Detalle de Habitación): esta pantalla ya conoce quién está
  // operando por la sesión activa, así que resuelve con `usuario` directo.
  const mutacionResolver = useMutation({
    mutationFn: () => resolverOrdenMantenimiento(ordenAResolver.id, usuario),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes-mantenimiento"] });
      mostrarToast(`Orden de mantenimiento de la habitación ${ordenAResolver.habitacion?.numero} marcada como resuelta.`);
      setOrdenAResolver(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo marcar la orden como resuelta.");
    },
  });

  if (!puedeVer) return <SinPermiso />;

  const todas = ordenes.data ?? [];
  // Conteos de los chips: siempre sobre el total real, no sobre lo que haya
  // quedado visible tras aplicar otro filtro — así el número no "salta"
  // cuando el usuario combina chips.
  const cantidadPendientes = todas.filter((orden) => orden.estado === "Pendiente").length;
  const cantidadResueltas = todas.filter((orden) => orden.estado === "Resuelta").length;
  const cantidadUrgentes = todas.filter((orden) => orden.urgente).length;

  const hayFiltroActivo = filtroEstado !== null || soloUrgentes;

  const visibles = todas
    .filter((orden) => !filtroEstado || orden.estado === filtroEstado)
    .filter((orden) => !soloUrgentes || orden.urgente)
    .sort(compararOrdenes);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Historial de Mantenimiento</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          Órdenes registradas en todas las habitaciones
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <ChipFiltro
          label="Todos"
          cantidad={todas.length}
          color={COLOR_TODOS}
          activo={!hayFiltroActivo}
          onClick={() => {
            setFiltroEstado(null);
            setSoloUrgentes(false);
          }}
        />
        <ChipFiltro
          label="Pendientes"
          cantidad={cantidadPendientes}
          color={ESTADO_HABITACION_COLOR.mantenimiento}
          activo={filtroEstado === "Pendiente"}
          onClick={() => setFiltroEstado((actual) => (actual === "Pendiente" ? null : "Pendiente"))}
        />
        <ChipFiltro
          label="Urgentes"
          cantidad={cantidadUrgentes}
          color={ESTADO_HABITACION_COLOR.bloqueada}
          activo={soloUrgentes}
          onClick={() => setSoloUrgentes((actual) => !actual)}
        />
        <ChipFiltro
          label="Resueltas"
          cantidad={cantidadResueltas}
          color={ESTADO_HABITACION_COLOR.libre}
          activo={filtroEstado === "Resuelta"}
          onClick={() => setFiltroEstado((actual) => (actual === "Resuelta" ? null : "Resuelta"))}
        />
      </div>

      {ordenes.isLoading && <p className="text-sm text-piedra">Cargando historial…</p>}
      {ordenes.isError && <p className="text-sm text-error-texto">No se pudo cargar el historial.</p>}

      {!ordenes.isLoading && !ordenes.isError && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
            <Wrench size={17} className="text-pino" /> Órdenes de mantenimiento
          </h2>
          <Table
            // "Acciones" es solo para quien puede resolver (Housekeeping) — a
            // Recepcionista y Admin (solo lectura acá, ver resolverMantenimiento
            // en sesion.jsx) no se les muestra la columna vacía, se las saca
            // del todo en vez de dejarles una columna sin nada adentro.
            columnas={
              puedeResolver
                ? ["Fecha", "Habitación", "Tipo", "Responsable", "Prioridad", "Estado", "Acciones"]
                : ["Fecha", "Habitación", "Tipo", "Responsable", "Prioridad", "Estado"]
            }
            columnasDerecha={puedeResolver ? ["Acciones"] : []}
            filas={visibles}
            vacio={todas.length === 0 ? "Todavía no hay órdenes de mantenimiento." : "Ninguna orden coincide con el filtro elegido."}
            renderFila={(orden) => (
              <tr
                key={orden.id}
                onClick={() => navigate(`/habitaciones/${orden.habitacion?.id}`)}
                className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
              >
                <td className="px-3 py-2.5 font-mono text-xs">{formatearTimestamp(orden.fecha)}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{orden.habitacion?.numero ?? "—"}</td>
                <td className="px-3 py-2.5 text-[13px]">{orden.tipoTarea}</td>
                <td className="px-3 py-2.5 text-[13px]">{orden.responsable}</td>
                <td className="px-3 py-2.5">
                  {orden.urgente ? <Badge variante="error">Urgente</Badge> : <Badge variante="neutro">Normal</Badge>}
                </td>
                <td className="px-3 py-2.5">
                  <Badge variante={ESTADO_ORDEN_MANTENIMIENTO_BADGE[orden.estado] ?? "neutro"}>{orden.estado}</Badge>
                </td>
                {puedeResolver && (
                  <td className="px-3 py-2.5 text-right">
                    {orden.estado === "Pendiente" && (
                      <Button
                        variante="secundario"
                        tamano="fila"
                        // Pedido explícito de que ESTE botón resalte más que el
                        // resto de los "secundario" de la app (esa variante
                        // sigue igual en todos lados) — el !hover: hace falta
                        // porque Tailwind genera hover:bg-hueso (de la propia
                        // variante) con la misma especificidad, y sin
                        // !important gana según el orden de generación, no el
                        // de esta clase.
                        className="hover:!border-pino hover:!bg-pino hover:!text-hueso"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOrdenAResolver(orden);
                        }}
                      >
                        Marcar como resuelta
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            )}
          />
        </div>
      )}

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
