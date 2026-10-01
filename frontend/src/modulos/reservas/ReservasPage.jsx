import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Ban, Eye } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { FilterBar } from "../../componentes/FilterBar";
import { Input } from "../../componentes/Input";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { MiniPasos } from "../../componentes/MiniPasos";
import { Modal } from "../../componentes/Modal";
import { NombreClave } from "../../componentes/NombreClave";
import { Select } from "../../componentes/Select";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearFechaSinHora } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { ReservaWizard } from "./ReservaWizard";
import { cancelarReserva, listarReservas } from "./reservas.api";
import {
  construirPasosReserva,
  ESTADO_RESERVA,
  ESTADOS_RESERVA,
  ESTADO_RESERVA_BADGE,
  ESTADO_RESERVA_COLOR,
  LIMITES_RESERVA,
} from "./reservas.constantes";

export function ReservasPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verReservas");
  const puedeGestionar = puede("gestionarReservas");
  const [searchParams, setSearchParams] = useSearchParams();
  const [modal, setModal] = useState(null);
  const [aCancelar, setACancelar] = useState(null);
  const [motivo, setMotivo] = useState("");
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const q = searchParams.get("q") ?? "";
  const estado = searchParams.get("estado") ?? "";
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";

  const filtros = {
    q: q || undefined,
    estado: estado || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  };
  // Las habitaciones ya elegidas (tarjetas seleccionables de Disponibilidad
  // interna) viajan por `location.state`, no por la URL — son un dato de
  // uso único para precargar el wizard, no algo que tenga sentido que
  // sobreviva a un refresh de la página como sí lo hacen desde/hasta.
  const modalDesdeDisponibilidad = searchParams.get("nueva") === "1"
    ? { tipo: "alta", valoresIniciales: { fechaDesde: desde, fechaHasta: hasta, habitaciones: location.state?.habitaciones ?? [] } }
    : null;
  const modalVisible = modal ?? modalDesdeDisponibilidad;

  function cerrarModal() {
    setModal(null);
    if (searchParams.get("nueva") === "1") {
      const params = new URLSearchParams(searchParams);
      params.delete("nueva");
      setSearchParams(params, { replace: true });
    }
  }

  const reservasQuery = useQuery({
    queryKey: ["reservas", "lista", filtros],
    queryFn: () => listarReservas(filtros),
    enabled: puedeVer,
  });
  // Resumen sobre el total, no sobre lo filtrado: si contara solo lo que se
  // ve, tocar una tarjeta de estado dejaría todas las demás en cero.
  const resumenQuery = useQuery({
    queryKey: ["reservas", "resumen"],
    queryFn: () => listarReservas({}),
    enabled: puedeVer,
  });

  const mutacionCancelar = useMutation({
    mutationFn: ({ id, motivoCancelacion }) => cancelarReserva(id, motivoCancelacion),
    onSuccess: (reserva) => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      mostrarToast(`Reserva ${reserva.codigoConfirmacion} cancelada.`);
      setACancelar(null);
      setMotivo("");
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cancelar la reserva.");
    },
  });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) params.set(clave, valor);
    else params.delete(clave);
    setSearchParams(params);
  }

  if (!puedeVer) return <SinPermiso />;

  // El backend ordena por fecha de entrada (fechaDesde desc) — acá se
  // reordena por orden de creación (id desc, la última cargada primero):
  // `id` es autoincremental y nunca se reutiliza, así que sirve como
  // proxy exacto sin necesitar una columna de timestamp propia. Solo se
  // reordena esta pantalla, no el resto de las que comparten
  // listarReservas (Check-out, dashboard, etc.), que siguen con el orden
  // de siempre.
  const reservas = [...(reservasQuery.data ?? [])].sort((a, b) => b.id - a.id);
  const resumen = resumenQuery.data ?? [];
  const hayFiltros = Boolean(q || estado || desde || hasta);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Reservas</h1>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          HU 36 a 42 — alta individual y grupal, disponibilidad, huéspedes y confirmación
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {ESTADOS_RESERVA.map((valor) => {
          const cantidad = resumen.filter((r) => r.estado === valor).length;
          const color = ESTADO_RESERVA_COLOR[valor];
          const activo = estado === valor;
          return (
            <button
              type="button"
              key={valor}
              onClick={() => actualizarFiltro("estado", activo ? "" : valor)}
              style={{ backgroundColor: color.fondo, color: color.texto, borderColor: activo ? color.texto : color.borde }}
              className={`stat-chip cursor-pointer rounded-lg border p-4 text-center ${activo ? "ring-2 ring-offset-1" : ""}`}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.03em]">{valor}</div>
              <Cifra tamano={30} className="mt-1">
                {cantidad}
              </Cifra>
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
            placeholder="Buscar por código, huésped, documento o habitación…"
            className="w-full rounded-md border border-borde bg-white py-2 pl-8 pr-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
        <Select
          aria-label="Filtrar por estado"
          value={estado}
          onChange={(e) => actualizarFiltro("estado", e.target.value)}
          className="min-w-[165px]"
        >
          <option value="">Estado: todos</option>
          {ESTADOS_RESERVA.map((opcion) => (
            <option key={opcion} value={opcion}>
              {opcion}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Desde"
          type="date"
          value={desde}
          onChange={(e) => actualizarFiltro("desde", e.target.value)}
          className="min-w-[150px]"
        />
        <Input
          aria-label="Hasta"
          type="date"
          value={hasta}
          onChange={(e) => actualizarFiltro("hasta", e.target.value)}
          className="min-w-[150px]"
        />
        <div className="ml-auto flex items-center gap-2.5">
          <Button variante="secundario" onClick={()=>navigate('/personas-alojadas')}>Personas alojadas</Button>
          <Button variante="secundario" icono={Eye} onClick={() => navigate("/reservas/disponibilidad")}>
            Ver disponibilidad
          </Button>
          {puedeGestionar && (
            <Button icono={Plus} onClick={() => setModal({ tipo: "alta" })}>
              Nueva reserva
            </Button>
          )}
        </div>
      </FilterBar>

      {reservasQuery.isLoading && <p className="text-sm text-piedra">Cargando reservas…</p>}
      {reservasQuery.isError && <p className="text-sm text-error-texto">No se pudieron cargar las reservas.</p>}

      {!reservasQuery.isLoading && !reservasQuery.isError && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <Table
            columnas={["Código", "Huésped", "Habitaciones", "Estadía", "Noches", "Estado", ""]}
            filas={reservas}
            columnasDerecha={["Noches", ""]}
            vacio={hayFiltros ? "Ninguna reserva coincide con los filtros." : "Todavía no hay reservas cargadas."}
            renderFila={(reserva) => {
              const { pasos, pasoActual } = construirPasosReserva(reserva);
              const cancelada = reserva.estado === ESTADO_RESERVA.CANCELADA;
              const acciones = [{ label: "Ver detalle", onClick: () => navigate(`/reservas/${reserva.id}`) }];
              if (puedeGestionar && reserva.estado === ESTADO_RESERVA.CONFIRMADA) {
                acciones.push({ label: "Modificar", onClick: () => setModal({ tipo: "edicion", reserva }) });
                acciones.push({
                  label: "Cancelar reserva",
                  variante: "destructivo",
                  onClick: () => {
                    setMotivo("");
                    setACancelar(reserva);
                  },
                });
              }

              return (
                <tr
                  key={reserva.id}
                  onClick={() => navigate(`/reservas/${reserva.id}`)}
                  className={`h-16 cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${
                    cancelada ? "text-piedra" : ""
                  }`}
                >
                  <td className="px-3 py-2.5">
                    <CodigoClave>{reserva.codigoConfirmacion}</CodigoClave>
                    <div className="mt-1">
                      <MiniPasos pasos={pasos} pasoActual={pasoActual} ultimoPasoRequiereLlegada={false} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <NombreClave className="block max-w-[220px] truncate" title={reserva.huesped?.nombre}>
                      {reserva.huesped?.nombre ?? "—"}
                    </NombreClave>
                    <div className="text-[11px] text-piedra">
                      {reserva.huesped?.tipoDocumento} {reserva.huesped?.numeroDocumento}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-mono text-[12.5px]">
                        {reserva.habitaciones.map((h) => h.numero).join(", ") || "—"}
                      </span>
                      {reserva.cantidadHabitaciones > 1 && <Badge variante="info">Grupal</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">
                    {formatearFechaSinHora(reserva.fechaDesde)} → {formatearFechaSinHora(reserva.fechaHasta)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{reserva.noches}</td>
                  <td className="px-3 py-2.5">
                    <Badge variante={ESTADO_RESERVA_BADGE[reserva.estado]}>{reserva.estado}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex justify-end">
                      <MenuAcciones acciones={acciones} />
                    </div>
                  </td>
                </tr>
              );
            }}
          />
        </div>
      )}

      {modalVisible?.tipo === "alta" && (
        <Modal titulo="Nueva reserva" onClose={cerrarModal} ancho="max-w-4xl">
          <ReservaWizard
            valoresIniciales={modalVisible.valoresIniciales}
            onCancelar={cerrarModal}
            onExito={(reserva) => {
              setModal(null);
              mostrarToast(
                reserva.confirmacionEmail?.enviado
                  ? `Reserva ${reserva.codigoConfirmacion} confirmada y enviada por correo.`
                  : `Reserva ${reserva.codigoConfirmacion} confirmada. El correo no pudo enviarse; revisá la configuración SMTP.`
              );
              navigate(`/reservas/${reserva.id}`);
            }}
          />
        </Modal>
      )}

      {modalVisible?.tipo === "edicion" && (
        <Modal
          titulo={`Modificar reserva ${modalVisible.reserva.codigoConfirmacion}`}
          subtitulo="Se vuelve a validar la disponibilidad con las fechas y habitaciones nuevas"
          onClose={cerrarModal}
          ancho="max-w-4xl"
        >
          <ReservaWizard
            reserva={modalVisible.reserva}
            onCancelar={cerrarModal}
            onExito={(reserva) => {
              setModal(null);
              mostrarToast(`Reserva ${reserva.codigoConfirmacion} actualizada.`);
            }}
          />
        </Modal>
      )}

      <ConfirmDialog
        abierto={Boolean(aCancelar)}
        titulo="¿Cancelar la reserva?"
        mensaje={`La reserva ${aCancelar?.codigoConfirmacion ?? ""} quedará cancelada y su período volverá a estar disponible. El motivo queda registrado.`}
        textoConfirmar="Sí, cancelar"
        variante="destructivo"
        icono={Ban}
        cargando={mutacionCancelar.isPending}
        onCancelar={() => {
          setACancelar(null);
          setMotivo("");
        }}
        onConfirmar={() => {
          if (!motivo.trim()) return;
          mutacionCancelar.mutate({ id: aCancelar.id, motivoCancelacion: motivo.trim() });
        }}
      >
        <label className="flex flex-col gap-1.5 font-body text-sm">
          <span className="text-[12px] text-tinta/70">Motivo de la cancelación *</span>
          <textarea
            rows={3}
            value={motivo}
            maxLength={LIMITES_RESERVA.motivoCancelacion}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="El huésped canceló el viaje, sobreventa, etc."
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
          {!motivo.trim() && <span className="text-[11.5px] text-piedra">Sin motivo no se puede confirmar.</span>}
        </label>
      </ConfirmDialog>

      <Toast mensaje={toast} />
    </div>
  );
}
