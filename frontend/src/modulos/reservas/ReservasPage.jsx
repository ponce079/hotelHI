import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutacionUnica } from "../../lib/useMutacionUnica";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Ban, CalendarSearch, Plus, Search, UserX, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { FilterBar } from "../../componentes/FilterBar";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { PageHeader } from "../../componentes/PageHeader";
import { Modal } from "../../componentes/Modal";
import { Paginacion } from "../../componentes/Paginacion";
import { idPestana, Pestanas } from "../../componentes/Pestanas";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { TarjetaIndicador } from "../../componentes/TarjetaIndicador";
import { Toast } from "../../componentes/Toast";
import { documentoEnmascarado } from "../../lib/documento";
import { hoyEnHoraLocal } from "../../lib/fechas";
import {
  avisoEstadia,
  etiquetaNoches,
  etiquetaPax,
  formatearDiaConSemana,
  formatearTotal,
  iniciales,
  resumenHabitaciones,
} from "../../lib/formatosReserva";
import { codigoPais, nombrePais } from "../../lib/paises";
import { useContadoresRecepcion } from "../../lib/useContadoresRecepcion";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { CierrePrevio } from "../garantias/CierrePrevio";
import { ReservaWizard } from "./ReservaWizard";
import { cancelarReserva, listarReservas } from "./reservas.api";
import { ESTADO_RESERVA, ESTADOS_RESERVA, etiquetaEstadoReserva, LIMITES_RESERVA } from "./reservas.constantes";

const TAMANO_PAGINA = 50;

// "Todas" no incluye Cancelada ni No presentada (tienen su propia pestaña), salvo que haya texto de búsqueda.
const ESTADOS_TODAS = [ESTADO_RESERVA.CONFIRMADA, ESTADO_RESERVA.EN_CURSO, ESTADO_RESERVA.CERRADA];

const PESTANAS = [
  { valor: "", etiqueta: "Todas" },
  { valor: ESTADO_RESERVA.CONFIRMADA, etiqueta: "Confirmadas" },
  { valor: ESTADO_RESERVA.EN_CURSO, etiqueta: "En curso" },
  { valor: ESTADO_RESERVA.CERRADA, etiqueta: "Cerradas" },
  { valor: ESTADO_RESERVA.CANCELADA, etiqueta: "Canceladas" },
  { valor: ESTADO_RESERVA.NO_SHOW, etiqueta: "No presentadas" },
];

// Tono del chip de estado (Badge `tono`).
const TONO_ESTADO = {
  [ESTADO_RESERVA.CONFIRMADA]: "confirmada",
  [ESTADO_RESERVA.EN_CURSO]: "en-curso",
  [ESTADO_RESERVA.CERRADA]: "cerrada",
  [ESTADO_RESERVA.CANCELADA]: "cancelada",
  [ESTADO_RESERVA.NO_SHOW]: "no-presentada",
};

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const CLASE_CAMPO =
  "h-10 rounded-md border border-borde bg-white px-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40";

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
  // Mismos pedidos (y misma caché) que los badges del menú lateral: las tarjetas de operación no hacen otra llamada.
  const contadores = useContadoresRecepcion({
    puedeVerCheckIn: puede("gestionarCheckIn"),
    puedeVerCheckOut: puede("verCheckOut"),
    puedeVerReservas: puedeVer,
  });

  const q = searchParams.get("q") ?? "";
  // La pestaña activa vive en la URL (?estado=); "Todas" no lleva parámetro. Un valor desconocido cuenta como "Todas".
  const estadoUrl = searchParams.get("estado") ?? "";
  const estado = ESTADOS_RESERVA.includes(estadoUrl) ? estadoUrl : "";
  const desde = searchParams.get("desde") ?? "";
  const hasta = searchParams.get("hasta") ?? "";

  const pagina = Math.max(1, Number.parseInt(searchParams.get("pagina") ?? "1", 10) || 1);

  // Pagina de a 50 en el servidor (con los mismos filtros): ya no se trae la lista entera.
  const filtros = {
    q: q || undefined,
    // Sin pestaña ni búsqueda: solo los estados "vivos". Con búsqueda se busca en todos (para hallar una cancelada).
    estado: estado || (q ? undefined : ESTADOS_TODAS.join(",")),
    desde: desde || undefined,
    hasta: hasta || undefined,
    pagina,
    limite: TAMANO_PAGINA,
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
    placeholderData: keepPreviousData,
  });

  // Tras crear, modificar o cancelar una reserva se refrescan la lista, las tarjetas de operación (llegadas y salidas
  // salen de ["check-in"] y ["reservas"]) y los contadores del menú.
  function refrescarContadores() {
    queryClient.invalidateQueries({ queryKey: ["reservas"] });
    queryClient.invalidateQueries({ queryKey: ["check-in"] });
  }

  const mutacionCancelar = useMutacionUnica({
    mutationFn: ({ id, motivoCancelacion }) => cancelarReserva(id, motivoCancelacion),
    onSuccess: (reserva) => {
      // La reserva ya no está Confirmada: la penalidad y la vista previa del cierre dejan de tener sentido (el servidor las
      // rechaza con 400). Se descartan antes de refrescar para que la pantalla no las vuelva a pedir.
      queryClient.removeQueries({ queryKey: ["reservas", "penalidad"] });
      queryClient.removeQueries({ queryKey: ["reservas", "cierre-previo"] });
      refrescarContadores();
      mostrarToast(`Reserva ${reserva.codigoConfirmacion} cancelada. ${reserva.penalidad?.mensaje ?? ""}`.trim());
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
    // Cambiar un filtro vuelve a la primera página.
    if (clave !== "pagina") params.delete("pagina");
    setSearchParams(params);
  }

  if (!puedeVer) return <SinPermiso />;

  // La página ya viene del servidor en orden de creación (id desc, la última cargada primero). Los contadores de las
  // pestañas cuentan TODAS las reservas (no solo las filtradas): si no, tocar una pestaña dejaría las demás en cero.
  const reservas = reservasQuery.data?.reservas ?? [];
  const conteoPorEstado = reservasQuery.data?.conteoPorEstado;
  const totalFiltradas = reservasQuery.data?.total ?? 0;
  const paginas = reservasQuery.data?.paginas ?? 1;
  const hayFiltros = Boolean(q || desde || hasta);
  const hoy = hoyEnHoraLocal();

  const cantidadPestana = (valor) => {
    if (!conteoPorEstado) return undefined;
    if (valor === "") return ESTADOS_TODAS.reduce((suma, e) => suma + (conteoPorEstado[e] ?? 0), 0);
    return conteoPorEstado[valor] ?? 0;
  };
  const pestanas = PESTANAS.map((p) => ({ ...p, cantidad: cantidadPestana(p.valor) }));

  const textoCantidad = q
    ? plural(totalFiltradas, "resultado", "resultados")
    : estado === ""
    ? `${plural(totalFiltradas, "reserva", "reservas")} (sin canceladas ni no presentadas)`
    : plural(totalFiltradas, "reserva", "reservas");

  // Tarjetas de operación. Si una llamada falla, la tarjeta muestra "—".
  const enCurso = conteoPorEstado ? (conteoPorEstado[ESTADO_RESERVA.EN_CURSO] ?? 0) : null;
  const confirmadas = conteoPorEstado ? (conteoPorEstado[ESTADO_RESERVA.CONFIRMADA] ?? 0) : null;
  const terracotaOscuro = "font-semibold text-[var(--aviso-texto)]";
  const enlacePestana = (valor) => `/reservas?estado=${encodeURIComponent(valor)}`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        titulo="Reservas"
        acciones={
          <>
            <Link to="/reservas/disponibilidad" className="enlace-discreto">
              <CalendarSearch size={16} strokeWidth={1.6} aria-hidden="true" />
              Disponibilidad
            </Link>
            <Link to="/personas-alojadas" className="enlace-discreto">
              <Users size={16} strokeWidth={1.6} aria-hidden="true" />
              Huéspedes en casa
            </Link>
            {puedeGestionar && (
              <Link to="/reservas/no-show" className="enlace-discreto">
                <UserX size={16} strokeWidth={1.6} aria-hidden="true" />
                Gestionar no-show
              </Link>
            )}
            {puedeGestionar && (
              <Button icono={Plus} className="!h-11 !px-5" onClick={() => setModal({ tipo: "alta" })}>
                Nueva reserva
              </Button>
            )}
          </>
        }
      />

      <section aria-labelledby="operacion-hoy" className="flex flex-col gap-3">
        {/* <p> y no <h2>: la regla global de h1-h6 (index.css, sin capa) pisaría el peso y el espaciado del sobretítulo. */}
        <p id="operacion-hoy" className="sobretitulo">
          Operación de hoy
        </p>
        <div className="grilla-indicadores">
          <TarjetaIndicador
            color="var(--terracota)"
            etiqueta="Llegadas hoy"
            valor={contadores.llegadasHoy}
            enlace={puede("gestionarCheckIn") ? { texto: "Check-in →", to: "/check-in" } : undefined}
            secundaria={
              <>
                pendientes de ingreso
                {contadores.llegadasAnteriores > 0 && (
                  <span className={terracotaOscuro}> · {contadores.llegadasAnteriores} de días anteriores</span>
                )}
              </>
            }
          />
          <TarjetaIndicador
            color="var(--chip-confirmada-texto)"
            etiqueta="Salidas hoy"
            valor={contadores.salidasHoy}
            enlace={puede("verCheckOut") ? { texto: "Check-out →", to: "/check-out" } : undefined}
            secundaria={
              <>
                a liberar hoy
                {contadores.salidasVencidas > 0 && (
                  <span className={terracotaOscuro}> · {contadores.salidasVencidas} vencidas sin cerrar</span>
                )}
              </>
            }
          />
          <TarjetaIndicador
            color="var(--primary)"
            etiqueta="En casa"
            valor={enCurso}
            enlace={{ texto: "Ver →", to: enlacePestana(ESTADO_RESERVA.EN_CURSO) }}
            secundaria={
              contadores.enCasa
                ? `estadías en curso · ${plural(contadores.enCasa.habitaciones, "habitación", "habitaciones")} · ${plural(
                    contadores.enCasa.huespedes,
                    "huésped",
                    "huéspedes"
                  )}`
                : "estadías en curso"
            }
          />
          <TarjetaIndicador
            color="var(--accent)"
            etiqueta="Próximas confirmadas"
            valor={confirmadas}
            enlace={{ texto: "Ver →", to: enlacePestana(ESTADO_RESERVA.CONFIRMADA) }}
            secundaria="reservas confirmadas a futuro"
          />
        </div>
      </section>

      <div className="min-w-0 overflow-hidden rounded-lg border border-borde bg-white">
        <Pestanas
          etiqueta="Estado de las reservas"
          idBase="reservas"
          pestanas={pestanas}
          activa={estado}
          onCambiar={(valor) => actualizarFiltro("estado", valor)}
        />

        <FilterBar incrustada>
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} strokeWidth={1.6} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
            <input
              type="search"
              aria-label="Buscar reservas"
              value={q}
              onChange={(e) => actualizarFiltro("q", e.target.value)}
              placeholder="Código, huésped, documento o habitación…"
              className={`${CLASE_CAMPO} w-full pl-8`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="rotulo-estadia">
            <span id="rotulo-estadia" className="text-[12.5px] font-semibold text-piedra">
              Estadía entre
            </span>
            <input
              aria-label="Estadía desde"
              type="date"
              value={desde}
              onChange={(e) => actualizarFiltro("desde", e.target.value)}
              className={`${CLASE_CAMPO} min-w-[140px]`}
            />
            <span aria-hidden="true" className="text-piedra">
              →
            </span>
            <input
              aria-label="Estadía hasta"
              type="date"
              value={hasta}
              onChange={(e) => actualizarFiltro("hasta", e.target.value)}
              className={`${CLASE_CAMPO} min-w-[140px]`}
            />
          </div>
          {hayFiltros && (
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent px-1 text-[13px] font-semibold text-piedra underline-offset-2 hover:text-tinta hover:underline"
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                ["q", "desde", "hasta", "pagina"].forEach((clave) => params.delete(clave));
                setSearchParams(params);
              }}
            >
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-[13px] font-semibold text-piedra" aria-live="polite">
            {reservasQuery.data ? textoCantidad : ""}
          </span>
        </FilterBar>

        <div role="tabpanel" id="reservas-panel" aria-labelledby={idPestana("reservas", estado)}>
          {reservasQuery.isError ? (
            <p className="px-5 py-10 text-center text-sm text-error-texto">No se pudieron cargar las reservas.</p>
          ) : (
            <div className={`transition-opacity ${reservasQuery.isPlaceholderData ? "opacity-60" : ""}`}>
              <Table
                cargando={reservasQuery.isLoading}
                columnas={["Huésped", "Estadía", "Habitación", "Pax", "Plan tarifario", "Total estimado", "Estado", ""]}
                columnasDerecha={["Total estimado", ""]}
                filas={reservas}
                vacioTitulo="Sin reservas en esta vista"
                vacioDescripcion="Probá cambiando de estado o ampliando el rango de fechas."
                onRowClick={(reserva) => navigate(`/reservas/${reserva.id}`)}
                claseFila={(reserva) =>
                  reserva.estado === ESTADO_RESERVA.CANCELADA || reserva.estado === ESTADO_RESERVA.NO_SHOW
                    ? "tabla-sgh-fila-atenuada"
                    : ""
                }
                renderFila={(reserva) => {
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

                  const huesped = reserva.huesped;
                  const pais = huesped?.paisDocumento ? (nombrePais(codigoPais(huesped.paisDocumento)) ?? huesped.paisDocumento) : "";
                  const documento = [documentoEnmascarado(huesped?.tipoDocumento, huesped?.numeroDocumento), pais]
                    .filter(Boolean)
                    .join(" · ");
                  const aviso = avisoEstadia(reserva, hoy);
                  const { numeros, detalle } = resumenHabitaciones(reserva);

                  return (
                    <tr key={reserva.id} className="h-[84px]">
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-3">
                          <span className="avatar-iniciales" aria-hidden="true">
                            {iniciales(huesped?.nombre)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              to={`/reservas/${reserva.id}`}
                              className="block max-w-[240px] truncate text-[15px] font-semibold text-tinta hover:underline"
                              title={huesped?.nombre}
                            >
                              {huesped?.nombre ?? "—"}
                            </Link>
                            <div className="text-[12px] text-piedra">{documento}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="whitespace-nowrap text-[13.5px] font-medium text-tinta">
                          {formatearDiaConSemana(reserva.fechaDesde)} → {formatearDiaConSemana(reserva.fechaHasta)}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-piedra">
                          <span>{etiquetaNoches(reserva)}</span>
                          {aviso && <span className="aviso-pildora">{aviso}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="font-mono text-[13px] font-medium text-tinta">{numeros}</div>
                        {detalle && <div className="mt-1 text-[12px] text-piedra">{detalle}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-[13px] text-tinta">{etiquetaPax(reserva)}</td>
                      <td className="px-3 py-4">
                        <div className="text-[13px] text-tinta">{reserva.planTarifario?.nombre ?? "—"}</div>
                        {reserva.planTarifario?.reembolsable === false && (
                          <span className="etiqueta-plan mt-1">No reembolsable</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right font-mono text-[13px] font-medium text-tinta">
                        {formatearTotal(reserva.totalEstimadoAlojamiento)}
                      </td>
                      <td className="px-3 py-4">
                        <Badge tono={TONO_ESTADO[reserva.estado]} variante="neutro">
                          {etiquetaEstadoReserva(reserva.estado)}
                        </Badge>
                        <div className="mt-1.5 font-mono text-[11px] text-[var(--text-3)]">{reserva.codigoConfirmacion}</div>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <div className="flex justify-end">
                          <MenuAcciones acciones={acciones} etiqueta={`Acciones de la reserva ${reserva.codigoConfirmacion}`} />
                        </div>
                      </td>
                    </tr>
                  );
                }}
              />
            </div>
          )}
        </div>

        {!reservasQuery.isError && (
          <Paginacion
            pagina={pagina}
            paginas={paginas}
            total={totalFiltradas}
            tamano={TAMANO_PAGINA}
            nombre="reservas"
            onCambiar={(n) => actualizarFiltro("pagina", String(n))}
          />
        )}
      </div>

      {modalVisible?.tipo === "alta" && (
        <Modal titulo="Nueva reserva" onClose={cerrarModal} ancho="max-w-4xl">
          <ReservaWizard
            valoresIniciales={modalVisible.valoresIniciales}
            onCancelar={cerrarModal}
            onExito={(reserva) => {
              setModal(null);
              refrescarContadores();
              mostrarToast(
                reserva.confirmacionEmail?.enviado
                  ? `Reserva ${reserva.codigoConfirmacion} confirmada y enviada por correo.`
                  : reserva.confirmacionEmail?.enCamino
                  ? `Reserva ${reserva.codigoConfirmacion} confirmada. Te estamos enviando la confirmación.`
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
              refrescarContadores();
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
        {aCancelar && <CierrePrevio reservaId={aCancelar.id} tipo="CANCELACION" />}
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
