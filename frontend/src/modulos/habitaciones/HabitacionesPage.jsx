import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BedDouble, History, Plus, Search, Trash2, RotateCw } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { FilterBar } from "../../componentes/FilterBar";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { Cifra } from "../../componentes/Cifra";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { HabitacionModal } from "./HabitacionModal";
import { EstadoHabitacionModal } from "./EstadoHabitacionModal";
import { MantenimientoModal } from "./MantenimientoModal";
import { HistorialMantenimientoModal } from "./HistorialMantenimientoModal";
import {
  cambiarActivoHabitacion,
  listarHabitaciones,
  listarTiposHabitacion,
} from "./habitaciones.api";
import {
  ESTADOS_HABITACION,
  ESTADO_HABITACION_BADGE,
  ESTADO_HABITACION_LABEL,
} from "./habitaciones.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function HabitacionesPage() {
  const { rol, puede } = useSesion();
  const puedeVer = puede("verHabitaciones");
  const puedeAdministrar = puede("gestionarHabitaciones");
  const puedeMantenimiento = puede("gestionarMantenimiento");
  const puedeEstado = puede("actualizarEstadoHabitacion");
  const [searchParams, setSearchParams] = useSearchParams();
  const [modal, setModal] = useState(null);
  const [cambioActivo, setCambioActivo] = useState(null);
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const q = searchParams.get("q") ?? "";
  const tipo = searchParams.get("tipo") ?? "";
  const estado = searchParams.get("estado") ?? "";
  const activo = searchParams.get("activo") ?? "true";
  const filtros = { q: q || undefined, tipo: tipo || undefined, estado: estado || undefined, activo };

  const habitacionesQuery = useQuery({
    queryKey: ["habitaciones", filtros],
    queryFn: () => listarHabitaciones(filtros),
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

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor && !(clave === "activo" && valor === "true")) params.set(clave, valor);
    else params.delete(clave);
    setSearchParams(params);
  }

  function cerrarConExito(mensaje) {
    setModal(null);
    mostrarToast(mensaje);
  }

  if (!puedeVer) return <SinPermiso />;

  const habitaciones = habitacionesQuery.data ?? [];
  const resumen = resumenQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Habitaciones</h1>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
            HU 31 a 35 — inventario, disponibilidad, mantenimiento y housekeeping
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variante="secundario" icono={History} onClick={() => setModal({ tipo: "historial" })}>Historial</Button>
          {puedeAdministrar && <Button icono={Plus} onClick={() => setModal({ tipo: "form", habitacion: null })}>Nueva habitación</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {ESTADOS_HABITACION.map((valor) => {
          const cantidad = resumen.filter((habitacion) => habitacion.estado === valor).length;
          return (
            <button
              type="button"
              key={valor}
              onClick={() => actualizarFiltro("estado", estado === valor ? "" : valor)}
              className={`cursor-pointer rounded-lg border bg-white p-4 text-left transition-colors hover:bg-hueso ${
                estado === valor ? "border-pino ring-1 ring-pino/20" : "border-borde"
              }`}
            >
              <div className="mb-2"><Badge variante={ESTADO_HABITACION_BADGE[valor]}>{ESTADO_HABITACION_LABEL[valor]}</Badge></div>
              <Cifra tamano={30}>{cantidad}</Cifra>
            </button>
          );
        })}
      </div>

      <FilterBar onClear={() => setSearchParams({})}>
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={q}
            onChange={(e) => actualizarFiltro("q", e.target.value)}
            placeholder="Buscar por número, tipo o equipamiento…"
            className="w-full rounded-md border border-borde bg-white py-2 pl-8 pr-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
        <Select aria-label="Filtrar por tipo" value={tipo} onChange={(e) => actualizarFiltro("tipo", e.target.value)} className="min-w-[150px]">
          <option value="">Tipo: todos</option>
          {(tiposQuery.data ?? []).map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
        </Select>
        <Select aria-label="Filtrar por estado" value={estado} onChange={(e) => actualizarFiltro("estado", e.target.value)} className="min-w-[175px]">
          <option value="">Estado: todos</option>
          {ESTADOS_HABITACION.map((opcion) => <option key={opcion} value={opcion}>{ESTADO_HABITACION_LABEL[opcion]}</option>)}
        </Select>
        {puedeAdministrar && (
          <Select aria-label="Filtrar por vigencia" value={activo} onChange={(e) => actualizarFiltro("activo", e.target.value)} className="min-w-[155px]">
            <option value="true">Vigencia: activas</option>
            <option value="false">Dadas de baja</option>
            <option value="todos">Todas</option>
          </Select>
        )}
      </FilterBar>

      <div className="flex items-center justify-between text-xs text-piedra">
        <span>{habitaciones.length} habitación{habitaciones.length === 1 ? "" : "es"} en la vista</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-exito" /> Actualización automática cada 10 segundos</span>
      </div>

      {habitacionesQuery.isLoading && <p className="text-sm text-piedra">Cargando habitaciones…</p>}
      {habitacionesQuery.isError && <p className="text-sm text-error-texto">No se pudieron cargar las habitaciones.</p>}

      {!habitacionesQuery.isLoading && !habitacionesQuery.isError && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <Table
            columnas={["Habitación", "Tipo", "Capacidad", "Piso", "Tarifa", "Estado", "Vigencia", ""]}
            className="min-w-[980px] table-fixed"
            anchosColumnas={["13.5%", "13.5%", "13.5%", "13.5%", "13.5%", "13.5%", "13.5%", "5.5%"]}
            filas={habitaciones}
            vacio={q || tipo || estado || activo !== "true" ? "Ninguna habitación coincide con los filtros." : "Todavía no hay habitaciones cargadas."}
            columnasDerecha={["Capacidad", "Piso", "Tarifa", ""]}
            renderFila={(habitacion) => {
              const acciones = [];
              if (puedeAdministrar) {
                acciones.push({ label: "Editar inventario", onClick: () => setModal({ tipo: "form", habitacion }) });
              }
              if (habitacion.activo && puedeEstado) {
                acciones.push({ label: "Cambiar estado", onClick: () => setModal({ tipo: "estado", habitacion }) });
              }
              if (habitacion.activo && puedeMantenimiento) {
                acciones.push({ label: "Crear orden de mantenimiento", onClick: () => setModal({ tipo: "mantenimiento", habitacion }) });
              }
              if (puedeAdministrar) {
                acciones.push({
                  label: habitacion.activo ? "Dar de baja" : "Reactivar",
                  variante: habitacion.activo ? "destructivo" : undefined,
                  onClick: () => setCambioActivo(habitacion),
                });
              }

              return (
                <tr key={habitacion.id} className={`h-16 border-b border-borde last:border-0 hover:bg-hueso ${habitacion.activo ? "" : "text-piedra"}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 font-mono text-[13px] font-medium"><BedDouble size={16} className="text-pino" />{habitacion.numero}</div>
                    <div className="mt-0.5 truncate text-[11px] text-piedra">{habitacion.equipamiento || "Sin equipamiento informado"}</div>
                  </td>
                  <td className="truncate px-3 py-2.5 text-[13px] font-medium">{habitacion.tipo}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{habitacion.capacidad}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{habitacion.piso}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{FORMATO_MONEDA.format(Number(habitacion.tarifaPorNoche))}</td>
                  <td className="px-3 py-2.5"><Badge variante={ESTADO_HABITACION_BADGE[habitacion.estado]}>{ESTADO_HABITACION_LABEL[habitacion.estado] ?? habitacion.estado}</Badge></td>
                  <td className="px-3 py-2.5"><Badge variante={habitacion.activo ? "ok" : "neutro"}>{habitacion.activo ? "Activa" : "Dada de baja"}</Badge></td>
                  <td className="px-3 py-2.5 text-right"><div className="flex justify-end"><MenuAcciones acciones={acciones} /></div></td>
                </tr>
              );
            }}
          />
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
