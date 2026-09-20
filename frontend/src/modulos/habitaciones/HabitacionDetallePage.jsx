import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, RotateCw, Trash2, User, Wrench } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { NombreClave } from "../../componentes/NombreClave";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearFechaSinHora, formatearTimestamp } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { useVolver } from "../../lib/useVolver";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";
import { HabitacionModal } from "./HabitacionModal";
import { EstadoHabitacionModal } from "./EstadoHabitacionModal";
import { MantenimientoModal } from "./MantenimientoModal";
import { cambiarActivoHabitacion, obtenerHabitacion, resolverOrdenMantenimiento } from "./habitaciones.api";
import {
  ESTADO_HABITACION_LABEL,
  ESTADO_HABITACION_COLOR,
  ESTADO_ORDEN_MANTENIMIENTO_BADGE,
} from "./habitaciones.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

function Dato({ etiqueta, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-piedra">{etiqueta}</p>
      <p className="mt-0.5 text-[13.5px] text-tinta">{children ?? "—"}</p>
    </div>
  );
}

export function HabitacionDetallePage() {
  const { id } = useParams();
  const habitacionId = Number(id);
  const { rol, puede } = useSesion();
  const puedeVer = puede("verHabitaciones");
  const puedeAdministrar = puede("gestionarHabitaciones");
  const puedeMantenimiento = puede("gestionarMantenimiento");
  const puedeResolverMantenimiento = puede("resolverMantenimiento");
  const puedeEstado = puede("actualizarEstadoHabitacion");
  const volver = useVolver("/habitaciones");
  const [modal, setModal] = useState(null);
  const [cambioActivo, setCambioActivo] = useState(false);
  const [ordenAResolver, setOrdenAResolver] = useState(null);
  const [resueltaPor, setResueltaPor] = useState("");
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const habitacionQuery = useQuery({
    queryKey: ["habitaciones", "detalle", habitacionId],
    queryFn: () => obtenerHabitacion(habitacionId),
    enabled: puedeVer && Number.isInteger(habitacionId),
  });

  const habitacion = habitacionQuery.data;
  const ocupada = habitacion?.estado === "ocupada";

  // Misma reserva "En curso" que ya resuelve el "→ Agregar consumo" del
  // Panel (ConsumoPorHabitacion.jsx, retirado) — acá filtrando directo por
  // habitacionId en vez de por número, ya que reservas.servicio.js ya
  // soporta ese filtro (listarReservas({ habitacionId, estado })).
  const reservaQuery = useQuery({
    queryKey: ["reservas", "en-curso", "habitacion", habitacionId],
    queryFn: () => listarReservas({ habitacionId, estado: ESTADO_RESERVA.EN_CURSO }),
    enabled: puedeVer && ocupada,
  });
  const reservaActiva = reservaQuery.data?.[0];

  const mutacionActivo = useMutation({
    mutationFn: (valor) => cambiarActivoHabitacion(habitacionId, valor),
    onSuccess: (actualizada) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      mostrarToast(`Habitación ${actualizada.numero} ${actualizada.activo ? "reactivada" : "dada de baja"}.`);
      setCambioActivo(false);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar la vigencia de la habitación.");
      setCambioActivo(false);
    },
  });

  // Reparto de responsabilidad: solo Housekeeping resuelve (ver
  // resolverMantenimiento en sesion.jsx). Al resolver, el backend devuelve
  // la habitación a su estado previo a entrar en mantenimiento (no siempre
  // "libre" — ver Habitacion.estadoAnterior en habitaciones.servicio.js).
  const mutacionResolver = useMutation({
    mutationFn: () => resolverOrdenMantenimiento(ordenAResolver.id, resueltaPor.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      mostrarToast(`Orden de mantenimiento de la habitación ${habitacion.numero} marcada como resuelta.`);
      setOrdenAResolver(null);
      setResueltaPor("");
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo marcar la orden como resuelta.");
    },
  });

  function cerrarConExito(mensaje) {
    setModal(null);
    mostrarToast(mensaje);
  }

  if (!puedeVer) return <SinPermiso />;
  if (habitacionQuery.isLoading) return <p className="text-sm text-piedra">Cargando la habitación…</p>;
  if (habitacionQuery.isError || !habitacion) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-error-texto">
          {habitacionQuery.error?.response?.data?.error ?? "No se pudo cargar la habitación."}
        </p>
        <button type="button" onClick={volver} className="cursor-pointer text-[13px] text-piedra hover:text-tinta">
          ‹ Volver al Panel de Habitaciones
        </button>
      </div>
    );
  }

  const acciones = [];
  if (puedeEstado) acciones.push({ label: "Cambiar estado", onClick: () => setModal({ tipo: "estado" }) });
  if (puedeAdministrar) {
    acciones.push({
      label: habitacion.activo ? "Dar de baja" : "Reactivar",
      variante: habitacion.activo ? "destructivo" : undefined,
      onClick: () => setCambioActivo(true),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <button
          type="button"
          onClick={volver}
          className="mb-2 cursor-pointer text-xs text-hueso/70 hover:text-hueso"
        >
          ‹ Volver al Panel de Habitaciones
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[34px] font-semibold">Habitación {habitacion.numero}</h1>
          <span className="rounded-sm bg-hueso/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.03em] text-hueso">
            {ESTADO_HABITACION_LABEL[habitacion.estado] ?? habitacion.estado}
          </span>
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          {habitacion.tipo} · {FORMATO_MONEDA.format(Number(habitacion.tarifaPorNoche))}/noche
        </p>
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-heading text-[19px] font-semibold">Datos generales</h2>
          <div className="flex items-center gap-1">
            {puedeAdministrar && (
              <button
                type="button"
                onClick={() => setModal({ tipo: "form" })}
                className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-pino hover:underline"
              >
                <Pencil size={13} /> Editar
              </button>
            )}
            {acciones.length > 0 && <MenuAcciones acciones={acciones} />}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato etiqueta="Piso">{habitacion.piso}</Dato>
          <Dato etiqueta="Capacidad">{habitacion.capacidad} personas</Dato>
          <Dato etiqueta="Tarifa / noche">{FORMATO_MONEDA.format(Number(habitacion.tarifaPorNoche))}</Dato>
          <Dato etiqueta="Equipamiento">{habitacion.equipamiento}</Dato>
        </div>
      </div>

      {ocupada && reservaActiva && (
        <div
          className="rounded-lg p-5"
          style={{ backgroundColor: ESTADO_HABITACION_COLOR.ocupada.fondo, color: ESTADO_HABITACION_COLOR.ocupada.texto }}
        >
          <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
            <User size={17} /> Reserva activa
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-70">Huésped</p>
              <p className="mt-0.5 text-[13.5px]">
                <NombreClave>{reservaActiva.huesped?.nombre}</NombreClave> · {reservaActiva.huesped?.numeroDocumento}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-70">Estadía</p>
              <p className="mt-0.5 text-[13.5px]">
                {formatearFechaSinHora(reservaActiva.fechaDesde)} → {formatearFechaSinHora(reservaActiva.fechaHasta)} (
                {reservaActiva.noches} noche{reservaActiva.noches === 1 ? "" : "s"})
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide opacity-70">Código</p>
              <p className="mt-0.5"><CodigoClave>{reservaActiva.codigoConfirmacion}</CodigoClave></p>
            </div>
          </div>
          <div className="mt-4 text-right">
            <Link to={`/reservas/${reservaActiva.id}`} className="text-[12.5px] font-semibold underline-offset-2 hover:underline">
              Ver ficha completa de la reserva →
            </Link>
          </div>
        </div>
      )}

      {habitacion.estado === "bloqueada" && habitacion.motivoBloqueo && (
        <div
          className="rounded-lg p-5"
          style={{ backgroundColor: ESTADO_HABITACION_COLOR.bloqueada.fondo, color: ESTADO_HABITACION_COLOR.bloqueada.texto }}
        >
          <h2 className="mb-1 text-[11px] uppercase tracking-wide">Motivo de bloqueo</h2>
          <p className="text-[13.5px]">{habitacion.motivoBloqueo}</p>
        </div>
      )}

      <div className="rounded-lg border border-borde bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-heading text-[19px] font-semibold">
            <Wrench size={17} className="text-pino" /> Historial de mantenimiento
          </h2>
          {puedeMantenimiento && (
            <Button icono={Plus} onClick={() => setModal({ tipo: "mantenimiento" })}>
              Registrar mantenimiento
            </Button>
          )}
        </div>
        <Table
          columnas={["Fecha", "Tipo", "Responsable", "Prioridad", "Estado", ""]}
          columnasDerecha={[""]}
          filas={habitacion.ordenesMantenimiento ?? []}
          vacio="Todavía no hay órdenes de mantenimiento para esta habitación."
          renderFila={(orden) => (
            <tr key={orden.id} className="border-b border-borde last:border-0">
              <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{formatearTimestamp(orden.fecha)}</td>
              <td className="px-3 py-2.5 text-[13px]">{orden.tipoTarea}</td>
              <td className="px-3 py-2.5 text-[13px]">{orden.responsable}</td>
              <td className="px-3 py-2.5">
                {orden.urgente ? <Badge variante="error">Urgente</Badge> : <Badge variante="neutro">Normal</Badge>}
              </td>
              <td className="px-3 py-2.5">
                <Badge variante={ESTADO_ORDEN_MANTENIMIENTO_BADGE[orden.estado] ?? "neutro"}>{orden.estado}</Badge>
                {orden.estado === "Resuelta" && orden.resueltaPor && (
                  <p className="mt-0.5 text-[11px] text-piedra">por {orden.resueltaPor}</p>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                {orden.estado === "Pendiente" && puedeResolverMantenimiento && (
                  <button
                    type="button"
                    onClick={() => {
                      setResueltaPor("");
                      setOrdenAResolver(orden);
                    }}
                    className="cursor-pointer text-[12.5px] font-semibold text-pino hover:underline"
                  >
                    Marcar como resuelta
                  </button>
                )}
              </td>
            </tr>
          )}
        />
      </div>

      {modal?.tipo === "form" && <HabitacionModal habitacion={habitacion} onClose={() => setModal(null)} onExito={cerrarConExito} />}
      {modal?.tipo === "estado" && (
        <EstadoHabitacionModal
          habitacion={habitacion}
          soloHousekeeping={rol === "housekeeping"}
          onClose={() => setModal(null)}
          onExito={cerrarConExito}
        />
      )}
      {modal?.tipo === "mantenimiento" && <MantenimientoModal habitacion={habitacion} onClose={() => setModal(null)} onExito={cerrarConExito} />}

      <ConfirmDialog
        abierto={cambioActivo}
        titulo={habitacion.activo ? "¿Dar de baja la habitación?" : "¿Reactivar la habitación?"}
        mensaje={
          habitacion.activo
            ? `La habitación ${habitacion.numero} dejará de estar disponible para nuevas operaciones, pero conservará todo su historial.`
            : `La habitación ${habitacion.numero} volverá a estar disponible en el inventario.`
        }
        textoConfirmar={habitacion.activo ? "Sí, dar de baja" : "Sí, reactivar"}
        variante={habitacion.activo ? "destructivo" : "alta"}
        icono={habitacion.activo ? Trash2 : RotateCw}
        cargando={mutacionActivo.isPending}
        onCancelar={() => setCambioActivo(false)}
        onConfirmar={() => mutacionActivo.mutate(!habitacion.activo)}
      />

      <ConfirmDialog
        abierto={Boolean(ordenAResolver)}
        titulo="¿Marcar la orden como resuelta?"
        mensaje={`La habitación ${habitacion.numero} vuelve a estar disponible para operar (se restaura el estado que tenía antes de entrar en mantenimiento).`}
        textoConfirmar="Sí, marcar como resuelta"
        variante="alta"
        icono={Check}
        cargando={mutacionResolver.isPending}
        onCancelar={() => setOrdenAResolver(null)}
        onConfirmar={() => {
          if (!resueltaPor.trim()) return;
          mutacionResolver.mutate();
        }}
      >
        <label className="flex flex-col gap-1.5 font-body text-sm">
          <span className="text-[12px] text-tinta/70">Confirmado por *</span>
          <input
            value={resueltaPor}
            onChange={(e) => setResueltaPor(e.target.value)}
            placeholder="Nombre de quien confirma la resolución"
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
          {!resueltaPor.trim() && <span className="text-[11.5px] text-piedra">Sin nombre no se puede confirmar.</span>}
        </label>
      </ConfirmDialog>

      <Toast mensaje={toast} />
    </div>
  );
}
