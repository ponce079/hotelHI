import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Plus, Wallet } from "lucide-react";
import { Button } from "../../../componentes/Button";
import { ConfirmDialog } from "../../../componentes/ConfirmDialog";
import { Modal } from "../../../componentes/Modal";
import { SinPermiso } from "../../../componentes/SinPermiso";
import { Toast } from "../../../componentes/Toast";
import { formatearPrecio } from "../../../lib/moneda";
import { useSesion } from "../../../lib/sesion";
import { useToast } from "../../../lib/useToast";
import { useVolver } from "../../../lib/useVolver";
import { obtenerCuenta } from "../../check-out/checkOut.api";
import { buscarReservaParaCheckIn } from "../../check-in/checkIn.api";
import { listarComprobantesReserva } from "../../comprobantes-estadia/comprobanteEstadia.api";
import { EstadiaModales } from "../../estadia/EstadiaModales";
import { useEstadia } from "../../estadia/useEstadia";
import { PagoEstadiaWizard } from "../../pagos-estadia/PagoEstadiaWizard";
import { listarPagosEstadia } from "../../pagos-estadia/pagoEstadia.api";
import { CONCEPTO_SENIA } from "../../pagos-estadia/pagoEstadia.constantes";
import { ConsumoModal } from "../../servicios-adicionales/ConsumoModal";
import { listarConsumosPorReserva } from "../../servicios-adicionales/serviciosAdicionales.api";
import { AjustePrecioModal } from "../AjustePrecioModal";
import { ReservaWizard } from "../ReservaWizard";
import {
  cancelarReserva,
  obtenerHistorialReserva,
  obtenerPenalidadReserva,
  obtenerReserva,
} from "../reservas.api";
import { ESTADO_RESERVA, LIMITES_RESERVA } from "../reservas.constantes";
import { BotonAgregarPersona } from "./BotonAgregarPersona";
import { ColumnaDerecha } from "./ColumnaDerecha";
import { EncabezadoReserva } from "./EncabezadoReserva";
import { PestanaCuenta } from "./PestanaCuenta";
import { PestanaHistorial } from "./PestanaHistorial";
import { PestanaHuespedes } from "./PestanaHuespedes";
import {
  accionesDeReserva,
  armarMovimientos,
  datosClave,
  lineaDeTiempo,
  puedeAjustarPrecioEn,
} from "./reservaDetalle";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const importe = (pago) => pago.medios.reduce((acc, m) => acc + Number(m.importe), 0);

// Cancelada: qué pasó con la seña (se conserva, o se devolvió y con qué motivo). No hay fecha de
// cancelación ni "penalidad aplicada": hoy cancelar solo retiene o anula la seña.
function ResumenCancelacion({ reserva, pagos }) {
  const senias = (pagos?.pagos ?? []).filter((p) => p.concepto === CONCEPTO_SENIA);
  return (
    <div className="rounded-lg border border-error bg-error-suave px-5 py-4 text-error-texto">
      {reserva.motivoCancelacion && (
        <>
          <p className="text-[11px] uppercase tracking-wide">Motivo de la cancelación</p>
          <p className="mt-1 text-[13.5px]">{reserva.motivoCancelacion}</p>
        </>
      )}
      {senias.map((s) => (
        <p key={s.id} className="mt-2 text-[13.5px]">
          {s.anulado
            ? `La seña de ${formatearPrecio(importe(s))} se devolvió${s.motivoAnulacion ? ` (${s.motivoAnulacion})` : ""}.`
            : `La seña de ${formatearPrecio(importe(s))} se conserva: no se devolvió.`}
        </p>
      ))}
    </div>
  );
}

function Pestanas({ activa, onCambiar, cuentaPersonas }) {
  const lista = [
    ["huespedes", "Huéspedes", cuentaPersonas],
    ["cuenta", "Cuenta", null],
    ["historial", "Historial", null],
  ];
  return (
    <div role="tablist" className="flex w-max max-w-full gap-1.5 rounded-xl bg-hueso p-1.5">
      {lista.map(([id, texto, cuenta]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={activa === id}
          onClick={() => onCambiar(id)}
          className={`cursor-pointer rounded-lg px-4 py-2 font-body text-sm font-semibold transition-colors ${
            activa === id ? "bg-white text-pino shadow-sm" : "text-piedra hover:text-tinta"
          }`}
        >
          {texto}
          {cuenta != null && <span className="ml-1.5 rounded-full bg-pino-100 px-2 text-[12.5px] text-pino-700">{cuenta}</span>}
        </button>
      ))}
    </div>
  );
}

function DetalleReserva({ reserva }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { puede } = useSesion();
  const volver = useVolver("/reservas");
  const { toast, mostrarToast } = useToast();
  const id = String(reserva.id);
  const puedeVerPagos = puede("verPagosEstadia");
  const puedeVerConsumos = puede("verConsumosServicio");
  const puedeVerCuenta = puedeVerPagos || puede("verCheckOut");
  const puedeAjustarPrecio = puede("ajustarPrecioReserva") && puedeAjustarPrecioEn(reserva.estado);
  const confirmada = reserva.estado === ESTADO_RESERVA.CONFIRMADA;
  const cancelada = reserva.estado === ESTADO_RESERVA.CANCELADA;
  const cerrada = reserva.estado === ESTADO_RESERVA.CERRADA;

  const [tab, setTab] = useState("huespedes");
  const [filtro, setFiltro] = useState("todo");
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [consumoAbierto, setConsumoAbierto] = useState(false);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  // Ajuste manual de precio (gerente): { nocheId } con la noche de la fila elegida.
  const [ajustando, setAjustando] = useState(null);
  // Congelado al montar (como en HabitacionesPage): alcanza para decidir la política de 24hs de la seña.
  const [ahora] = useState(() => Date.now());

  const estadia = useEstadia(reserva);

  // El botón "Iniciar check-in" se calcula con el mismo endpoint que usa la pantalla de Check-in, así
  // el motivo por el que todavía no se puede nunca se desincroniza del que realmente aplica ahí.
  const vigenciaCheckInQuery = useQuery({
    queryKey: ["check-in", "vigencia", id],
    queryFn: () => buscarReservaParaCheckIn({ id }),
    enabled: puede("gestionarCheckIn") && confirmada,
  });
  const pagosQuery = useQuery({
    queryKey: ["pagos-estadia", "reserva", id],
    queryFn: () => listarPagosEstadia(id),
    enabled: puedeVerPagos,
  });
  // Mismo cálculo que el check-out (consolidarCargos): el saldo coincide exactamente con esa pantalla.
  const cuentaQuery = useQuery({
    queryKey: ["check-out", "cuenta", id],
    queryFn: () => obtenerCuenta(id),
    enabled: puedeVerCuenta && !cancelada,
  });
  const consumosQuery = useQuery({
    queryKey: ["consumos-servicios", "detalle", id],
    queryFn: () => listarConsumosPorReserva(id),
    enabled: puedeVerConsumos && tab === "cuenta",
  });
  const historialQuery = useQuery({
    queryKey: ["reserva-historial", id],
    queryFn: () => obtenerHistorialReserva(id),
    enabled: tab === "historial",
  });
  // Solo informativa: no se cobra nada al cancelar (la regla de cobro la define otro equipo).
  const penalidadQuery = useQuery({
    queryKey: ["reservas", "penalidad", id],
    queryFn: () => obtenerPenalidadReserva(id, "CANCELACION"),
    enabled: confirmada && puede("gestionarReservas"),
    retry: false,
  });
  const comprobantesQuery = useQuery({
    queryKey: ["check-out", "comprobantes", id],
    queryFn: () => listarComprobantesReserva(id),
    enabled: cerrada && puede("verComprobantesEstadia"),
  });

  const mutacionCancelar = useMutation({
    mutationFn: () => cancelarReserva(id, motivo.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      queryClient.invalidateQueries({ queryKey: ["pagos-estadia"] });
      queryClient.invalidateQueries({ queryKey: ["reserva-historial"] });
      setCancelando(false);
      setMotivo("");
      mostrarToast("Reserva cancelada.");
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cancelar la reserva.");
    },
  });

  const personas = estadia.listado;
  const acciones = accionesDeReserva(reserva.estado, {
    gestionarReservas: puede("gestionarReservas"),
    gestionarCheckIn: puede("gestionarCheckIn"),
    registrarConsumoServicio: puede("registrarConsumoServicio"),
    verCheckOut: puede("verCheckOut"),
    verComprobantesEstadia: puede("verComprobantesEstadia"),
  });

  // Mismo umbral que cancelarReserva (backend): con 24hs o más de anticipación la seña se anula sola.
  const seniaVigente = pagosQuery.data?.pagos.find((p) => p.concepto === CONCEPTO_SENIA && !p.anulado);
  const montoSenia = seniaVigente ? importe(seniaVigente) : 0;
  const seniaSeDevuelve = new Date(reserva.fechaDesde).getTime() - ahora >= MS_POR_DIA;

  const movimientos = armarMovimientos({
    reserva,
    consumos: consumosQuery.data ?? [],
    pagos: pagosQuery.data?.pagos ?? [],
    verificaciones: cuentaQuery.data?.verificaciones ?? [],
  });

  function alElegirAccion(accion) {
    if (accion === "modificar") setEditando(true);
    else if (accion === "cancelar") {
      setMotivo("");
      setCancelando(true);
    } else if (accion === "check-in") navigate(`/check-in?codigo=${encodeURIComponent(reserva.codigoConfirmacion)}`);
    else if (accion === "check-out") navigate(`/check-out/${reserva.id}`);
    else if (accion === "consumo") setConsumoAbierto(true);
    else if (accion === "comprobante") {
      const emitido = (comprobantesQuery.data ?? []).find((c) => !c.anulado && c.tipo === "Comprobante") ?? comprobantesQuery.data?.[0];
      if (emitido) navigate(`/comprobantes-estadia/${emitido.id}`);
      else navigate(`/check-out/${reserva.id}`);
    }
  }

  const puedePagar =
    puede("gestionarCheckOut") &&
    [ESTADO_RESERVA.CONFIRMADA, ESTADO_RESERVA.EN_CURSO].includes(reserva.estado) &&
    (cuentaQuery.data?.saldo ?? 0) > 0;
  const puedeAgregarConsumo = puede("registrarConsumoServicio") && reserva.estado === ESTADO_RESERVA.EN_CURSO;
  const errorCuenta =
    (consumosQuery.isError && "No se pudieron cargar los consumos.") ||
    (pagosQuery.isError && "No se pudieron cargar los pagos.") ||
    null;
  const refrescarCuenta = () => {
    for (const k of ["consumos-servicios", "pagos-estadia", "check-out", "reserva-historial", "reservas"])
      queryClient.invalidateQueries({ queryKey: [k] });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-piedra">
        <Button variante="fantasma" icono={ArrowLeft} onClick={volver}>
          Volver
        </Button>
      </div>

      <EncabezadoReserva
        reserva={reserva}
        pasos={lineaDeTiempo(reserva, estadia.todas)}
        acciones={acciones}
        onAccion={alElegirAccion}
        checkIn={{
          cargando: vigenciaCheckInQuery.isLoading,
          habilitado: vigenciaCheckInQuery.data?.puedeIniciarCheckIn ?? false,
          motivo: vigenciaCheckInQuery.data?.motivoBloqueo,
        }}
        datos={datosClave(reserva, estadia.todas)}
      />

      {cancelada && <ResumenCancelacion reserva={reserva} pagos={pagosQuery.data} />}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className="rounded-lg border border-borde bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Pestanas
              activa={tab}
              onCambiar={setTab}
              cuentaPersonas={
                confirmada
                  ? `${personas.length} de ${reserva.habitaciones.reduce((a, h) => a + h.adultos + h.menores, 0)}`
                  : personas.length
              }
            />
            <div className="flex flex-wrap items-center gap-2">
              {tab === "huespedes" && <BotonAgregarPersona estadia={estadia} reserva={reserva} />}
              {tab === "cuenta" && puedeAgregarConsumo && (
                <Button tamano="fila" variante="secundario" icono={Plus} onClick={() => setConsumoAbierto(true)}>
                  Agregar consumo
                </Button>
              )}
              {tab === "cuenta" && puedePagar && (
                <Button tamano="fila" variante="secundario" icono={Wallet} onClick={() => setPagoAbierto(true)}>
                  Registrar pago
                </Button>
              )}
            </div>
          </div>

          {tab === "huespedes" && <PestanaHuespedes reserva={reserva} estadia={estadia} />}
          {tab === "cuenta" && (
            <PestanaCuenta
              movimientos={movimientos}
              filtro={filtro}
              onFiltro={setFiltro}
              cargando={consumosQuery.isLoading || pagosQuery.isLoading}
              error={errorCuenta}
              onReintentar={() => {
                consumosQuery.refetch();
                pagosQuery.refetch();
              }}
              onAjustar={puedeAjustarPrecio ? (nocheId) => setAjustando({ nocheId }) : null}
              onAnular={
                estadia.puedeCargos
                  ? (m) => {
                      estadia.setError("");
                      estadia.setAnular({ id: m.consumoId, monto: m.cargo });
                    }
                  : null
              }
            />
          )}
          {tab === "historial" && <PestanaHistorial consulta={historialQuery} />}
        </section>

        <ColumnaDerecha reserva={reserva} cuenta={cuentaQuery.data} pagos={pagosQuery.data} penalidad={penalidadQuery.data} />
      </div>

      <EstadiaModales estadia={estadia} />

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
              refrescarCuenta();
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
              ? `Se cancela con más de 24hs de anticipación — la seña de ${formatearPrecio(montoSenia)} va a devolverse.`
              : `Se cancela con menos de 24hs de anticipación — la seña de ${formatearPrecio(montoSenia)} no se devuelve.`}
          </p>
        )}
        {penalidadQuery.data && (
          <p className="mb-3 rounded-md border border-borde bg-hueso px-4 py-2.5 text-[12.5px] text-piedra">
            Según el plan tarifario: {penalidadQuery.data.mensaje}
            {penalidadQuery.data.aplica ? ` (${formatearPrecio(penalidadQuery.data.monto)})` : ""} Es solo informativo: al
            cancelar no se cobra nada.
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
            refrescarCuenta();
          }}
        />
      )}

      {pagoAbierto && cuentaQuery.data && (
        <PagoEstadiaWizard
          reservaId={reserva.id}
          saldo={cuentaQuery.data.saldo}
          onClose={() => setPagoAbierto(false)}
          onExito={(mensaje) => {
            setPagoAbierto(false);
            mostrarToast(mensaje);
            refrescarCuenta();
          }}
        />
      )}

      {ajustando && (
        <AjustePrecioModal
          reserva={reserva}
          nocheInicial={ajustando.nocheId}
          onClose={() => setAjustando(null)}
          onExito={(mensaje) => {
            setAjustando(null);
            mostrarToast(mensaje);
            refrescarCuenta();
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}

export function ReservaDetallePage() {
  const { id } = useParams();
  const { puede } = useSesion();
  const volver = useVolver("/reservas");
  const puedeVer = puede("verReservas");
  const reservaQuery = useQuery({
    queryKey: ["reservas", "detalle", id],
    queryFn: () => obtenerReserva(id),
    enabled: puedeVer,
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
  return <DetalleReserva reserva={reservaQuery.data} />;
}
