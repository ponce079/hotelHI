import { Fragment, useState } from "react";
import { EstadiaPanel } from '../estadia/EstadiaPanel';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, BedDouble, Bell, ChevronDown, ChevronRight, DollarSign, LogIn, Pencil, Plus, User, UtensilsCrossed } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { Modal } from "../../componentes/Modal";
import { NombreClave } from "../../componentes/NombreClave";
import { PasoAPaso } from "../../componentes/PasoAPaso";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearFechaSinHora, formatearTimestamp } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { useVolver } from "../../lib/useVolver";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarPagosEstadia } from "../pagos-estadia/pagoEstadia.api";
import { CONCEPTO_SENIA } from "../pagos-estadia/pagoEstadia.constantes";
import { ConsumoModal } from "../servicios-adicionales/ConsumoModal";
import { obtenerResumenPorReserva } from "../servicios-adicionales/serviciosAdicionales.api";
import { TIPO_SERVICIO_BADGE } from "../servicios-adicionales/serviciosAdicionales.constantes";
import { AjustePrecioModal } from "./AjustePrecioModal";
import { ReservaWizard } from "./ReservaWizard";
import { cancelarReserva, obtenerReserva } from "./reservas.api";
import {
  construirPasosReserva,
  ESTADO_RESERVA,
  ESTADO_RESERVA_BADGE,
  LIMITES_RESERVA,
} from "./reservas.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function Dato({ etiqueta, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-piedra">{etiqueta}</p>
      <p className="mt-0.5 text-[13.5px] text-tinta">{children ?? "—"}</p>
    </div>
  );
}

export function ReservaDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puede } = useSesion();
  const puedeVer = puede("verReservas");
  const puedeGestionar = puede("gestionarReservas");
  const puedeVerConsumos = puede("verConsumosServicio");
  const puedeVerPagos = puede("verPagosEstadia");
  const puedeRegistrarConsumo = puede("registrarConsumoServicio");
  const puedeGestionarCheckIn = puede("gestionarCheckIn");
  const puedeAjustarPrecio = puede("ajustarPrecioReserva");
  const volver = useVolver("/reservas");
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [consumoAbierto, setConsumoAbierto] = useState(false);
  // Etapa 4B (HU-97) — modal de ajuste manual de precio, exclusivo gerente.
  const [ajustandoPrecio, setAjustandoPrecio] = useState(false);
  // Etapa 4A (HU-95) — qué habitación tiene el detalle noche por noche
  // desplegado (una a la vez, para no abrumar la tabla con todo abierto).
  const [habitacionExpandida, setHabitacionExpandida] = useState(null);
  // Congelado al montar (no en cada render — mismo criterio que `ahora` en
  // HabitacionesPage.jsx): alcanza para decidir la política de 24hs de la
  // seña, no hace falta que tiquee en vivo mientras el diálogo está abierto.
  const [ahora] = useState(() => Date.now());
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const reservaQuery = useQuery({
    queryKey: ["reservas", "detalle", id],
    queryFn: () => obtenerReserva(id),
    enabled: puedeVer,
  });

  // Ajuste de flujo (Sprint 3): la carga de consumos vive en la ficha de la
  // reserva, no en un menú aparte (ver ServiciosAdicionalesPage.jsx, que
  // ahora es de solo lectura para todo el hotel). Solo tiene sentido
  // consultar/cargar mientras la reserva está "En curso" — antes del
  // check-in el huésped todavía no llegó, y el backend rechaza el alta en
  // cualquier otro estado (ver registrarConsumo en
  // serviciosAdicionales.servicio.js, sin cambios).
  const enCurso = reservaQuery.data?.estado === ESTADO_RESERVA.EN_CURSO;
  const consumosQuery = useQuery({
    queryKey: ["consumos-servicios", "resumen", id],
    queryFn: () => obtenerResumenPorReserva(id),
    enabled: puedeVerConsumos && enCurso,
    refetchInterval: 10000,
  });

  // El botón "Iniciar check-in" se muestra siempre para una reserva
  // Confirmada, pero si la fecha de ingreso todavía no llegó tiene que
  // quedar deshabilitado con el motivo — reusamos el mismo endpoint que ya
  // usa la pantalla de Check-in (buscarReservaParaCheckIn →
  // validarReservaVigente en checkIn.servicio.js) para traer
  // `puedeIniciarCheckIn`/`motivoBloqueo` calculados por el backend, así el
  // mensaje nunca puede desincronizarse del que realmente aplica ahí.
  const confirmada = reservaQuery.data?.estado === ESTADO_RESERVA.CONFIRMADA;
  const vigenciaCheckInQuery = useQuery({
    queryKey: ["check-in", "vigencia", id],
    queryFn: () => buscarReservaParaCheckIn({ id }),
    enabled: puedeGestionarCheckIn && confirmada,
  });

  // Trae los pagos reales de la reserva — se usa para dos cosas: (a) el
  // desglose de "Seña pagada"/"Saldo pendiente" en la tarjeta Estadía
  // (cualquier estado), y (b) antes de confirmar una cancelación (HU-37),
  // avisar qué va a pasar con la seña según la política de 24hs de
  // reservas.servicio.js/cancelarReserva. `saldo`/`totalAdeudado` vienen de
  // consolidarCargos (check-out) vía calcularSaldoReserva — no se
  // reimplementa el cálculo acá.
  const pagosQuery = useQuery({
    queryKey: ["pagos-estadia", "reserva", id],
    queryFn: () => listarPagosEstadia(id),
    enabled: puedeVerPagos,
  });

  const mutacionCancelar = useMutation({
    mutationFn: () => cancelarReserva(id, motivo.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      setCancelando(false);
      setMotivo("");
      mostrarToast("Reserva cancelada.");
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cancelar la reserva.");
    },
  });

  if (!puedeVer) return <SinPermiso />;
  if (reservaQuery.isLoading) return <p className="text-sm text-piedra">Cargando la reserva…</p>;
  if (reservaQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-error-texto">
          {reservaQuery.error?.response?.data?.error ?? "No se pudo cargar la reserva."}
        </p>
        <Button variante="fantasma" icono={ArrowLeft} onClick={volver}>
          Volver
        </Button>
      </div>
    );
  }

  const reserva = reservaQuery.data;
  const { pasos, pasoActual, pasoAlternativo } = construirPasosReserva(reserva);
  const editable = puedeGestionar && reserva.estado === ESTADO_RESERVA.CONFIRMADA;
  const mostrarAccionCheckIn = puedeGestionarCheckIn && reserva.estado === ESTADO_RESERVA.CONFIRMADA;
  // Etapa 4B (HU-97) — a diferencia de "editable" (solo Confirmada), el
  // ajuste manual de precio también se permite En curso.
  const mostrarAjustarPrecio =
    puedeAjustarPrecio && [ESTADO_RESERVA.CONFIRMADA, ESTADO_RESERVA.EN_CURSO].includes(reserva.estado);
  const puedeIniciarCheckInAhora = vigenciaCheckInQuery.data?.puedeIniciarCheckIn ?? false;
  const motivoAunNoHabilitado = vigenciaCheckInQuery.data?.motivoBloqueo;

  // Mismo umbral que cancelarReserva (backend, MILISEGUNDOS_POR_DIA): si
  // faltan 24hs o más para la fecha de ingreso, la seña se anula sola al
  // cancelar; si no, queda como está. Se muestra ANTES de confirmar, no
  // después, para que quien cancela sepa el resultado de antemano.
  const seniaVigente = pagosQuery.data?.pagos.find((p) => p.concepto === CONCEPTO_SENIA && !p.anulado);
  const montoSenia = seniaVigente?.medios.reduce((acc, m) => acc + Number(m.importe), 0) ?? 0;
  const anticipacionMs = new Date(reserva.fechaDesde).getTime() - ahora;
  const seniaSeDevuelve = anticipacionMs >= 24 * 60 * 60 * 1000;

  return (
    <div className="flex flex-col gap-6">
      <EstadiaPanel reserva={reserva} />
      <div>
        <Button variante="fantasma" icono={ArrowLeft} onClick={volver}>
          Volver
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[34px] font-semibold">Reserva</h1>
            <CodigoClave className="text-[20px]">{reserva.codigoConfirmacion}</CodigoClave>
            <Badge variante={ESTADO_RESERVA_BADGE[reserva.estado]}>{reserva.estado}</Badge>
            {reserva.cantidadHabitaciones > 1 && <Badge variante="info">Reserva grupal</Badge>}
          </div>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
            HU 36 a 42 — {reserva.huesped?.nombre} · {formatearFechaSinHora(reserva.fechaDesde)} al{" "}
            {formatearFechaSinHora(reserva.fechaHasta)}
          </p>
        </div>
        {(mostrarAccionCheckIn || editable || mostrarAjustarPrecio) && (
          <div className="flex flex-wrap items-start gap-2">
            {mostrarAjustarPrecio && (
              <Button variante="secundario" icono={DollarSign} onClick={() => setAjustandoPrecio(true)}>
                Ajustar precio
              </Button>
            )}
            {mostrarAccionCheckIn && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  icono={LogIn}
                  cargando={vigenciaCheckInQuery.isLoading}
                  disabled={!puedeIniciarCheckInAhora}
                  onClick={() => navigate(`/check-in?codigo=${encodeURIComponent(reserva.codigoConfirmacion)}`)}
                >
                  Iniciar check-in
                </Button>
                {motivoAunNoHabilitado && (
                  <p className="max-w-[240px] text-right text-[11px] text-piedra">{motivoAunNoHabilitado}</p>
                )}
              </div>
            )}
            {editable && (
              <>
                <Button variante="secundario" icono={Pencil} onClick={() => setEditando(true)}>
                  Modificar
                </Button>
                <Button
                  variante="destructivo"
                  icono={Ban}
                  onClick={() => {
                    setMotivo("");
                    setCancelando(true);
                  }}
                >
                  Cancelar reserva
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <PasoAPaso pasos={pasos} pasoActual={pasoActual} pasoAlternativo={pasoAlternativo} />

      {reserva.estado === ESTADO_RESERVA.CANCELADA && reserva.motivoCancelacion && (
        <div className="rounded-lg border border-error bg-error-suave px-5 py-4">
          <p className="text-[11px] uppercase tracking-wide text-error-texto">Motivo de la cancelación</p>
          <p className="mt-1 text-[13.5px] text-error-texto">{reserva.motivoCancelacion}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-borde bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
            <User size={17} className="text-pino" /> Huésped
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Dato etiqueta="Nombre">
              <NombreClave>{reserva.huesped?.nombre}</NombreClave>
            </Dato>
            <Dato etiqueta="Documento">
              {reserva.huesped ? `${reserva.huesped.tipoDocumento} ${reserva.huesped.numeroDocumento}` : null}
            </Dato>
            <Dato etiqueta="Contacto">{reserva.huesped?.contacto}</Dato>
            <Dato etiqueta="Preferencias">{reserva.huesped?.preferencias}</Dato>
          </div>
        </div>

        <div className="rounded-lg border border-borde bg-white p-5">
          <h2 className="mb-4 font-heading text-[19px] font-semibold">Estadía</h2>
          <div className="flex flex-col gap-4">
            <Dato etiqueta="Entrada">{formatearFechaSinHora(reserva.fechaDesde)}</Dato>
            <Dato etiqueta="Salida">{formatearFechaSinHora(reserva.fechaHasta)}</Dato>
            {reserva.planTarifario && (
              <Dato etiqueta="Plan tarifario">
                {reserva.planTarifario.nombre}{" "}
                <Badge variante={reserva.planTarifario.reembolsable ? "ok" : "error"}>
                  {reserva.planTarifario.reembolsable ? "Reembolsable" : "No reembolsable"}
                </Badge>
              </Dato>
            )}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-piedra">
                Total estimado · {reserva.noches} noche{reserva.noches === 1 ? "" : "s"}
              </p>
              <Cifra tamano={28}>{FORMATO_MONEDA.format(reserva.totalEstimadoAlojamiento)}</Cifra>
              <p className="mt-1 text-[11px] text-piedra">
                Alojamiento: precio congelado por noche al confirmar (HU-96), no la tarifa de hoy.
              </p>
            </div>

            {pagosQuery.data && (
              <>
                {seniaVigente && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-piedra">Seña pagada</p>
                    <Link to={`/movimientos-pago?q=${encodeURIComponent(reserva.codigoConfirmacion)}`}>
                      <Cifra tamano={28} className="text-pino transition-colors hover:text-pino-700 hover:underline">
                        {FORMATO_MONEDA.format(montoSenia)} · {seniaVigente.medios.map((m) => m.medioPago).join(" + ")}
                      </Cifra>
                    </Link>
                  </div>
                )}
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-piedra">Saldo pendiente</p>
                  <Cifra tamano={28}>{FORMATO_MONEDA.format(pagosQuery.data.saldo)}</Cifra>
                  <p className="mt-1 text-[11px] text-piedra">Lo que va a quedar por cobrar en el check-out.</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
          <BedDouble size={17} className="text-pino" /> Habitaciones reservadas
        </h2>
        <Table
          columnas={["", "Habitación", "Tipo", "Ocupación", "Estado actual", "Promedio/noche", "Subtotal"]}
          filas={reserva.habitaciones}
          columnasDerecha={["Promedio/noche", "Subtotal"]}
          vacio="La reserva no tiene habitaciones asociadas."
          renderFila={(h) => {
            const expandida = habitacionExpandida === h.id;
            return (
              <Fragment key={h.id}>
                <tr className="h-12 border-b border-borde last:border-0">
                  <td className="w-8 px-3 py-2.5">
                    {(h.reservaNoches?.length ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setHabitacionExpandida(expandida ? null : h.id)}
                        aria-label={`Ver detalle por noche de la habitación ${h.numero}`}
                        className="cursor-pointer text-piedra hover:text-tinta"
                      >
                        {expandida ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[13px] font-medium">{h.numero}</td>
                  <td className="px-3 py-2.5 text-[13px]">{h.tipo}</td>
                  <td className="px-3 py-2.5 text-[12.5px] text-piedra">
                    {h.adultos} adulto{h.adultos === 1 ? "" : "s"}
                    {h.menores > 0 ? `, ${h.menores} menor${h.menores === 1 ? "" : "es"}` : ""}
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-piedra">{h.estado}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{FORMATO_MONEDA.format(h.promedioPorNoche)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{FORMATO_MONEDA.format(h.subtotalAlojamiento)}</td>
                </tr>
                {expandida && (
                  <tr className="border-b border-borde bg-hueso last:border-0">
                    <td colSpan={7} className="px-6 py-3">
                      <p className="mb-2 text-[11px] uppercase tracking-wide text-piedra">Detalle por noche</p>
                      <div className="flex flex-col gap-1">
                        {(h.reservaNoches ?? []).map((n) => (
                          <div key={n.fecha} className="flex items-center justify-between gap-3 text-[12.5px]">
                            <span className="text-piedra">
                              {formatearFechaSinHora(n.fecha)}
                              {n.temporadaNombre ? ` · ${n.temporadaNombre}` : ""}
                              {n.origen === "MIGRACION" ? " · migrada" : ""}
                            </span>
                            {n.ajustada ? (
                              <span
                                className="flex items-center gap-2 font-mono"
                                title={`Ajuste manual — ${n.motivoAjuste ?? "sin motivo"} · ${n.ajustadoPor ?? "—"} · ${
                                  n.ajustadoEn ? formatearTimestamp(n.ajustadoEn) : "—"
                                }`}
                              >
                                <span className="text-piedra line-through">{FORMATO_MONEDA.format(n.precioOriginal)}</span>
                                <Badge variante="alerta">{FORMATO_MONEDA.format(n.precioNoche)}</Badge>
                              </span>
                            ) : (
                              <span className="font-mono">{FORMATO_MONEDA.format(n.precioNoche)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          }}
        />
      </div>

      {enCurso && puedeVerConsumos && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-heading text-[19px] font-semibold">
              <UtensilsCrossed size={17} className="text-pino" /> Servicios Adicionales
            </h2>
            {puedeRegistrarConsumo && (
              <Button icono={Plus} onClick={() => setConsumoAbierto(true)}>
                Agregar consumo
              </Button>
            )}
          </div>
          <p className="mb-4 text-[12px] text-piedra">
            HU 61 a 63 — restaurante, spa, lavandería y minibar cargados a la cuenta de esta estadía.
          </p>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-lg border border-pino-300 bg-pino-100 p-4">
              <p className="text-[11px] uppercase tracking-wide text-pino-700">Total acumulado</p>
              <Cifra tamano={22}>{FORMATO_MONEDA.format(consumosQuery.data?.totalGeneral ?? 0)}</Cifra>
            </div>
            {consumosQuery.data?.totalPorTipo.map((t) => (
              <div key={t.tipoServicio} className="rounded-lg border border-borde bg-hueso p-4">
                <p className="mb-1">
                  <Badge variante={TIPO_SERVICIO_BADGE[t.tipoServicio]}>{t.tipoServicio}</Badge>
                </p>
                <Cifra tamano={17}>{FORMATO_MONEDA.format(t.total)}</Cifra>
              </div>
            ))}
          </div>
          <Table
            columnas={["Fecha", "Tipo", "Detalle", "Registrado por", "Monto"]}
            columnasDerecha={["Monto"]}
            filas={consumosQuery.data?.items ?? []}
            vacio="Todavía no hay consumos registrados para esta estadía."
            renderFila={(c) => (
              <tr key={c.id} className="border-b border-borde last:border-0">
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{formatearTimestamp(c.fechaHora)}</td>
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
      )}

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 font-heading text-[19px] font-semibold">
          <Bell size={17} className="text-pino" /> Confirmaciones enviadas
        </h2>
        <p className="mb-4 text-[12px] text-piedra">
          HU 41 — el proyecto no tiene proveedor de email/SMS configurado: queda el registro del envío, sin integración
          real.
        </p>
        <Table
          columnas={["Fecha", "Canal", "Destinatario", "Mensaje"]}
          filas={reserva.notificaciones}
          vacio="Todavía no hay confirmaciones registradas."
          renderFila={(n) => (
            <tr key={n.id} className="border-b border-borde last:border-0">
              <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{formatearTimestamp(n.fechaEnvio)}</td>
              <td className="px-3 py-2.5">
                <Badge variante={n.canal === "Interno" ? "neutro" : "ok"}>{n.canal}</Badge>
              </td>
              <td className="px-3 py-2.5 text-[12.5px]">{n.destinatarioArea}</td>
              <td className="px-3 py-2.5 text-[12.5px] text-piedra">{n.mensaje}</td>
            </tr>
          )}
        />
      </div>

      {editando && (
        <Modal
          titulo={`Modificar reserva ${reserva.codigoConfirmacion}`}
          subtitulo="Se vuelve a validar la disponibilidad con las fechas y habitaciones nuevas"
          onClose={() => setEditando(false)}
          ancho="max-w-4xl"
        >
          <ReservaWizard
            reserva={reserva}
            onCancelar={() => setEditando(false)}
            onExito={() => {
              setEditando(false);
              mostrarToast("Reserva actualizada.");
            }}
          />
        </Modal>
      )}

      <ConfirmDialog
        abierto={cancelando}
        titulo="¿Cancelar la reserva?"
        mensaje={`La reserva ${reserva.codigoConfirmacion} quedará cancelada y su período volverá a estar disponible. El motivo queda registrado.`}
        textoConfirmar="Sí, cancelar"
        variante="destructivo"
        icono={Ban}
        cargando={mutacionCancelar.isPending}
        onCancelar={() => {
          setCancelando(false);
          setMotivo("");
        }}
        onConfirmar={() => {
          if (!motivo.trim()) return;
          mutacionCancelar.mutate();
        }}
      >
        {seniaVigente && (
          <p
            className={`mb-3 rounded-md border px-4 py-2.5 text-[12.5px] ${
              seniaSeDevuelve ? "border-pino-300 bg-pino-100 text-pino-700" : "border-laton-300 bg-laton-100 text-laton-700"
            }`}
          >
            {seniaSeDevuelve
              ? `Se cancela con más de 24hs de anticipación — la seña de ${FORMATO_MONEDA.format(montoSenia)} va a devolverse.`
              : `Se cancela con menos de 24hs de anticipación — la seña de ${FORMATO_MONEDA.format(montoSenia)} no se devuelve.`}
          </p>
        )}
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

      {consumoAbierto && (
        <ConsumoModal
          reserva={reserva}
          onClose={() => setConsumoAbierto(false)}
          onExito={(mensaje) => {
            setConsumoAbierto(false);
            mostrarToast(mensaje);
            queryClient.invalidateQueries({ queryKey: ["consumos-servicios"] });
          }}
        />
      )}

      {ajustandoPrecio && (
        <AjustePrecioModal
          reserva={reserva}
          onClose={() => setAjustandoPrecio(false)}
          onExito={(mensaje) => {
            setAjustandoPrecio(false);
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
