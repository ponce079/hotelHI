import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { BedDouble, History, Plus, Search, Trash2, RotateCw } from "lucide-react";
import { Button } from "../../componentes/Button";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { FilterBar } from "../../componentes/FilterBar";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { Cifra } from "../../componentes/Cifra";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { HabitacionModal } from "./HabitacionModal";
import { EstadoHabitacionModal } from "./EstadoHabitacionModal";
import { MantenimientoModal } from "./MantenimientoModal";
import { HistorialMantenimientoModal } from "./HistorialMantenimientoModal";
import { ConsumoModal } from "../servicios-adicionales/ConsumoModal";
import {
  cambiarActivoHabitacion,
  listarHabitaciones,
  listarOrdenesMantenimiento,
  listarTiposHabitacion,
} from "./habitaciones.api";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";
import {
  ESTADOS_HABITACION,
  ESTADO_HABITACION_LABEL,
  ESTADO_HABITACION_COLOR,
  COLOR_SALE_HOY,
} from "./habitaciones.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

// Fecha "solo día" (ver lib/fechas.js) reducida a d/m, formato del mockup
// ("hasta 24/9") — sin año, porque una estadía siempre es de corto plazo.
function formatoDiaMes(fechaISO) {
  const fecha = new Date(fechaISO);
  return `${fecha.getUTCDate()}/${fecha.getUTCMonth() + 1}`;
}

// Mismo criterio de comparación por día calendario UTC que estadoVencimiento
// (lib/fechas.js): "hoy" ancla en hora argentina, la fecha guardada es
// "solo día" (medianoche UTC del día elegido).
function esHoy(fechaISO) {
  if (!fechaISO) return false;
  const hoyUTC = Date.parse(`${hoyEnHoraLocal()}T00:00:00Z`);
  const fecha = new Date(fechaISO);
  const fechaUTC = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return fechaUTC === hoyUTC;
}

// Extraída de ConsumoPorHabitacion.jsx (retirado: el atajo de "Consumo
// rápido por habitación" ahora es la acción "→ Agregar consumo" de la
// propia tarjeta) — misma coincidencia EXACTA sobre el número de
// habitación que usaba ese componente (el filtro de texto del backend es
// "contains", así que buscar "10" no puede traer la habitación "101" por
// error). Acá no hace falta volver a pedir las reservas "En curso" por
// número: HabitacionesPage ya las tiene todas cargadas (enCursoQuery, para
// el nombre del huésped de las tarjetas ocupadas), así que se filtra en
// memoria en vez de repetir la búsqueda por red.
function reservasEnCursoDe(reservasEnCurso, numeroHabitacion) {
  return reservasEnCurso.filter((r) => r.habitaciones.some((h) => h.numero === numeroHabitacion));
}

export function HabitacionesPage() {
  const { rol, puede } = useSesion();
  const puedeVer = puede("verHabitaciones");
  const puedeAdministrar = puede("gestionarHabitaciones");
  const puedeMantenimiento = puede("gestionarMantenimiento");
  const puedeEstado = puede("actualizarEstadoHabitacion");
  const puedeRegistrarConsumo = puede("registrarConsumoServicio");
  const [searchParams, setSearchParams] = useSearchParams();
  const [modal, setModal] = useState(null);
  const [cambioActivo, setCambioActivo] = useState(null);
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  // Solo para refrescar el texto "Actualizado hace Ns" cada segundo — el
  // dato en sí ya lo refresca refetchInterval, esto no dispara ningún fetch.
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const q = searchParams.get("q") ?? "";
  const tipo = searchParams.get("tipo") ?? "";
  const piso = searchParams.get("piso") ?? "";
  const estado = searchParams.get("estado") ?? "";

  const habitacionesQuery = useQuery({
    queryKey: ["habitaciones", { q, tipo, estado }],
    queryFn: () => listarHabitaciones({ q: q || undefined, tipo: tipo || undefined, estado: estado || undefined, activo: "true" }),
    enabled: puedeVer,
    refetchInterval: 10000,
  });
  const resumenQuery = useQuery({
    queryKey: ["habitaciones", "resumen"],
    queryFn: () => listarHabitaciones({ activo: "true" }),
    enabled: puedeVer,
    refetchInterval: 10000,
  });
  const tiposQuery = useQuery({
    queryKey: ["tipos-habitacion"],
    queryFn: listarTiposHabitacion,
    enabled: puedeVer,
  });
  // Nombre del huésped + fecha de salida de las tarjetas "ocupada", y la
  // reserva que resuelve el "→ Agregar consumo" de esas mismas tarjetas
  // ("En curso" = ya hizo check-in).
  const enCursoQuery = useQuery({
    queryKey: ["reservas", "en-curso"],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO }),
    enabled: puedeVer,
    refetchInterval: 10000,
  });
  // Motivo de las tarjetas "mantenimiento": la última orden cargada para esa
  // habitación (tipo de tarea + responsable). No hay un campo de "motivo"
  // propio para "bloqueada" en el modelo — esas tarjetas no muestran línea.
  const ordenesQuery = useQuery({
    queryKey: ["habitaciones", "mantenimiento", "ultimas"],
    queryFn: () => listarOrdenesMantenimiento(),
    enabled: puedeVer,
  });

  const mutacionActivo = useMutation({
    mutationFn: ({ id, valor }) => cambiarActivoHabitacion(id, valor),
    onSuccess: (habitacion) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      queryClient.invalidateQueries({ queryKey: ["tipos-habitacion"] });
      mostrarToast(`Habitación ${habitacion.numero} ${habitacion.activo ? "reactivada" : "dada de baja"}.`);
      setCambioActivo(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar la vigencia de la habitación.");
      setCambioActivo(null);
    },
  });

  const reservasEnCurso = enCursoQuery.data ?? [];

  const ultimaOrdenPorHabitacion = useMemo(() => {
    const mapa = new Map();
    // listarOrdenesMantenimiento ya viene ordenado por fecha desc: la
    // primera que aparece para cada habitacionId es la más reciente.
    for (const orden of ordenesQuery.data ?? []) {
      if (!mapa.has(orden.habitacionId)) mapa.set(orden.habitacionId, orden);
    }
    return mapa;
  }, [ordenesQuery.data]);

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    setSearchParams(params);
  }

  function cerrarConExito(mensaje) {
    setModal(null);
    mostrarToast(mensaje);
  }

  // Mismos mensajes que tenía ConsumoPorHabitacion.jsx para estos dos casos
  // límite (0 o >1 reservas "En curso" coincidentes) — acá se resuelven con
  // un toast en vez de un listado para elegir, porque ya se parte de una
  // habitación puntual (la de la tarjeta), no de una búsqueda por texto.
  function manejarAgregarConsumo(habitacion) {
    const coincidencias = reservasEnCursoDe(reservasEnCurso, habitacion.numero);
    if (coincidencias.length === 0) {
      mostrarToast(`No hay una reserva "En curso" para la habitación ${habitacion.numero}.`);
      return;
    }
    if (coincidencias.length > 1) {
      mostrarToast(`Hay más de una reserva "En curso" para la habitación ${habitacion.numero} — revisá los datos.`);
      return;
    }
    setModal({ tipo: "consumo", reserva: coincidencias[0] });
  }

  if (!puedeVer) return <SinPermiso />;

  const habitaciones = habitacionesQuery.data ?? [];
  const resumen = resumenQuery.data ?? [];

  const pisos = [...new Set(resumen.map((h) => h.piso))].sort((a, b) => a - b);

  const habitacionesFiltradas = piso ? habitaciones.filter((h) => String(h.piso) === piso) : habitaciones;

  const gruposPorPiso = new Map();
  for (const habitacion of habitacionesFiltradas) {
    if (!gruposPorPiso.has(habitacion.piso)) gruposPorPiso.set(habitacion.piso, []);
    gruposPorPiso.get(habitacion.piso).push(habitacion);
  }
  const grupos = [...gruposPorPiso.entries()].sort((a, b) => a[0] - b[0]);

  const hayFiltrosActivos = Boolean(q || tipo || piso || estado);

  const segundosDesdeActualizacion = habitacionesQuery.dataUpdatedAt
    ? Math.max(0, Math.floor((ahora - habitacionesQuery.dataUpdatedAt) / 1000))
    : null;
  const textoActualizacion =
    segundosDesdeActualizacion === null
      ? "Actualizando…"
      : segundosDesdeActualizacion < 1
        ? "Actualizado justo ahora"
        : `Actualizado hace ${segundosDesdeActualizacion}s`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-pino px-6 py-5 text-hueso">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Habitaciones</h1>
          <p className="mt-1.5 font-mono text-[11px] text-hueso/65">Vista general del estado operativo de cada habitación</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-hueso/70">
            <span className="h-2 w-2 rounded-full bg-pino-300" /> {textoActualizacion}
          </span>
          <Button variante="secundario" tamano="fila" icono={History} className="border-hueso/30 text-hueso hover:bg-pino-oscuro" onClick={() => setModal({ tipo: "historial" })}>
            Historial
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {ESTADOS_HABITACION.map((valor) => {
          const cantidad = resumen.filter((habitacion) => habitacion.estado === valor).length;
          const color = ESTADO_HABITACION_COLOR[valor];
          const activo = estado === valor;
          return (
            <button
              type="button"
              key={valor}
              onClick={() => actualizarFiltro("estado", activo ? "" : valor)}
              style={{
                backgroundColor: color.fondo,
                color: color.texto,
                borderColor: activo ? color.texto : color.borde,
              }}
              className={`cursor-pointer rounded-lg border p-4 text-left transition-shadow ${activo ? "ring-2 ring-offset-1" : "hover:shadow-sm"}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.03em]">{ESTADO_HABITACION_LABEL[valor]}</div>
              <Cifra tamano={30} className="mt-1">{cantidad}</Cifra>
            </button>
          );
        })}
      </div>

      <FilterBar>
        <div className="relative min-w-[240px]">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={q}
            onChange={(e) => actualizarFiltro("q", e.target.value)}
            placeholder="Buscar por número de habitación…"
            className="w-full rounded-md border border-borde bg-white py-2 pl-8 pr-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
        <Select aria-label="Filtrar por piso" value={piso} onChange={(e) => actualizarFiltro("piso", e.target.value)} className="min-w-[150px]">
          <option value="">Todos los pisos</option>
          {pisos.map((p) => <option key={p} value={p}>Piso {p}</option>)}
        </Select>
        <Select aria-label="Filtrar por tipo" value={tipo} onChange={(e) => actualizarFiltro("tipo", e.target.value)} className="min-w-[150px]">
          <option value="">Todos los tipos</option>
          {(tiposQuery.data ?? []).map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-2.5">
          {hayFiltrosActivos && (
            <button type="button" onClick={() => setSearchParams({})} className="cursor-pointer text-[12.5px] text-piedra hover:text-tinta">
              Limpiar filtros
            </button>
          )}
          {puedeAdministrar && <Button icono={Plus} onClick={() => setModal({ tipo: "form", habitacion: null })}>Nueva habitación</Button>}
        </div>
      </FilterBar>

      {habitacionesQuery.isLoading && <p className="text-sm text-piedra">Cargando habitaciones…</p>}
      {habitacionesQuery.isError && <p className="text-sm text-error-texto">No se pudieron cargar las habitaciones.</p>}

      {!habitacionesQuery.isLoading && !habitacionesQuery.isError && grupos.length === 0 && (
        <p className="rounded-lg border border-borde bg-white p-6 text-center text-sm text-piedra">
          {hayFiltrosActivos ? "Ninguna habitación coincide con los filtros." : "Todavía no hay habitaciones cargadas."}
        </p>
      )}

      {!habitacionesQuery.isLoading && !habitacionesQuery.isError && grupos.length > 0 && (
        <div className="flex flex-col gap-5">
          {grupos.map(([numeroPiso, habitacionesDelPiso]) => (
            <div key={numeroPiso} className="flex flex-col gap-2.5">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.03em] text-piedra">
                Piso {numeroPiso} · {habitacionesDelPiso.length} habitación{habitacionesDelPiso.length === 1 ? "" : "es"}
              </p>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                {habitacionesDelPiso.map((habitacion) => {
                  const [reservaEnCurso] = reservasEnCursoDe(reservasEnCurso, habitacion.numero);
                  return (
                    <TarjetaHabitacion
                      key={habitacion.id}
                      habitacion={habitacion}
                      huesped={reservaEnCurso ? { nombre: reservaEnCurso.huesped?.nombre, fechaHasta: reservaEnCurso.fechaHasta } : null}
                      ordenMantenimiento={ultimaOrdenPorHabitacion.get(habitacion.id)}
                      puedeAdministrar={puedeAdministrar}
                      puedeEstado={puedeEstado}
                      puedeMantenimiento={puedeMantenimiento}
                      puedeRegistrarConsumo={puedeRegistrarConsumo}
                      onEditar={() => setModal({ tipo: "form", habitacion })}
                      onCambiarEstado={() => setModal({ tipo: "estado", habitacion })}
                      onCrearMantenimiento={() => setModal({ tipo: "mantenimiento", habitacion })}
                      onCambiarActivo={() => setCambioActivo(habitacion)}
                      onAgregarConsumo={() => manejarAgregarConsumo(habitacion)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal?.tipo === "form" && <HabitacionModal habitacion={modal.habitacion} onClose={() => setModal(null)} onExito={cerrarConExito} />}
      {modal?.tipo === "estado" && (
        <EstadoHabitacionModal
          habitacion={modal.habitacion}
          soloHousekeeping={rol === "housekeeping"}
          onClose={() => setModal(null)}
          onExito={cerrarConExito}
        />
      )}
      {modal?.tipo === "mantenimiento" && <MantenimientoModal habitacion={modal.habitacion} onClose={() => setModal(null)} onExito={cerrarConExito} />}
      {modal?.tipo === "historial" && <HistorialMantenimientoModal onClose={() => setModal(null)} />}
      {modal?.tipo === "consumo" && <ConsumoModal reserva={modal.reserva} onClose={() => setModal(null)} onExito={cerrarConExito} />}

      <ConfirmDialog
        abierto={Boolean(cambioActivo)}
        titulo={cambioActivo?.activo ? "¿Dar de baja la habitación?" : "¿Reactivar la habitación?"}
        mensaje={
          cambioActivo?.activo
            ? `La habitación ${cambioActivo?.numero} dejará de estar disponible para nuevas operaciones, pero conservará todo su historial.`
            : `La habitación ${cambioActivo?.numero} volverá a estar disponible en el inventario.`
        }
        textoConfirmar={cambioActivo?.activo ? "Sí, dar de baja" : "Sí, reactivar"}
        variante={cambioActivo?.activo ? "destructivo" : "alta"}
        icono={cambioActivo?.activo ? Trash2 : RotateCw}
        cargando={mutacionActivo.isPending}
        onCancelar={() => setCambioActivo(null)}
        onConfirmar={() => mutacionActivo.mutate({ id: cambioActivo.id, valor: !cambioActivo.activo })}
      />

      <Toast mensaje={toast} />
    </div>
  );
}

function TarjetaHabitacion({
  habitacion,
  huesped,
  ordenMantenimiento,
  puedeAdministrar,
  puedeEstado,
  puedeMantenimiento,
  puedeRegistrarConsumo,
  onEditar,
  onCambiarEstado,
  onCrearMantenimiento,
  onCambiarActivo,
  onAgregarConsumo,
}) {
  const color = ESTADO_HABITACION_COLOR[habitacion.estado] ?? ESTADO_HABITACION_COLOR.libre;
  const saleHoy = habitacion.estado === "ocupada" && esHoy(huesped?.fechaHasta);

  const acciones = [];
  if (puedeAdministrar) acciones.push({ label: "Editar inventario", onClick: onEditar });
  if (puedeEstado) acciones.push({ label: "Cambiar estado", onClick: onCambiarEstado });
  if (puedeMantenimiento) acciones.push({ label: "Crear orden de mantenimiento", onClick: onCrearMantenimiento });
  if (puedeAdministrar) {
    acciones.push({ label: habitacion.activo ? "Dar de baja" : "Reactivar", variante: habitacion.activo ? "destructivo" : undefined, onClick: onCambiarActivo });
  }

  return (
    <div
      style={{ backgroundColor: color.fondo, color: color.texto, borderColor: color.borde }}
      className="flex flex-col gap-2 rounded-lg border p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <Cifra tamano={26} className="flex items-center gap-1.5">
          <BedDouble size={18} className="inline -mt-0.5" /> {habitacion.numero}
        </Cifra>
        <div className="flex items-center gap-1">
          <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.03em]">{ESTADO_HABITACION_LABEL[habitacion.estado]}</span>
          {acciones.length > 0 && <MenuAcciones acciones={acciones} />}
        </div>
      </div>

      <p className="text-[12.5px]">
        {habitacion.tipo} · {FORMATO_MONEDA.format(Number(habitacion.tarifaPorNoche))}/noche
      </p>

      {habitacion.estado === "ocupada" && (
        <div className="flex flex-col gap-1.5">
          {huesped && (
            <>
              <p className="text-[13px] font-medium">{huesped.nombre}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px]">hasta {formatoDiaMes(huesped.fechaHasta)}</span>
                {saleHoy && (
                  <span
                    style={{ backgroundColor: COLOR_SALE_HOY.fondo, color: COLOR_SALE_HOY.texto }}
                    className="rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.02em]"
                  >
                    Sale hoy
                  </span>
                )}
              </div>
            </>
          )}
          {puedeRegistrarConsumo && (
            <button
              type="button"
              onClick={onAgregarConsumo}
              className="w-fit cursor-pointer text-[12.5px] font-semibold underline-offset-2 hover:underline"
            >
              → Agregar consumo
            </button>
          )}
        </div>
      )}

      {habitacion.estado === "mantenimiento" && ordenMantenimiento && (
        <p className="text-[12.5px]">{ordenMantenimiento.tipoTarea} · {ordenMantenimiento.responsable}</p>
      )}

      {habitacion.estado === "libre" && (
        <Link
          to={`/check-in?habitacion=${encodeURIComponent(habitacion.numero)}`}
          className="mt-1 text-[12.5px] font-semibold underline-offset-2 hover:underline"
        >
          → Iniciar check-in
        </Link>
      )}
    </div>
  );
}
