import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ArrowLeft, Ban, BedDouble, Bell, Pencil, User } from "lucide-react";
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
  const { puede } = useSesion();
  const puedeVer = puede("verReservas");
  const puedeGestionar = puede("gestionarReservas");
  const volver = useVolver("/reservas");
  const [editando, setEditando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const reservaQuery = useQuery({
    queryKey: ["reservas", "detalle", id],
    queryFn: () => obtenerReserva(id),
    enabled: puedeVer,
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

  return (
    <div className="flex flex-col gap-6">
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
        {editable && (
          <div className="flex flex-wrap gap-2">
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
            <div>
              <p className="text-[11px] uppercase tracking-wide text-piedra">
                Total estimado · {reserva.noches} noche{reserva.noches === 1 ? "" : "s"}
              </p>
              <Cifra tamano={28}>{FORMATO_MONEDA.format(reserva.totalEstimadoAlojamiento)}</Cifra>
              <p className="mt-1 text-[11px] text-piedra">
                Solo alojamiento, calculado a la tarifa vigente de cada habitación.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
          <BedDouble size={17} className="text-pino" /> Habitaciones reservadas
        </h2>
        <Table
          columnas={["Habitación", "Tipo", "Capacidad", "Piso", "Estado actual", "Por noche"]}
          filas={reserva.habitaciones}
          columnasDerecha={["Capacidad", "Piso", "Por noche"]}
          vacio="La reserva no tiene habitaciones asociadas."
          renderFila={(h) => (
            <tr key={h.id} className="h-12 border-b border-borde last:border-0">
              <td className="px-3 py-2.5 font-mono text-[13px] font-medium">{h.numero}</td>
              <td className="px-3 py-2.5 text-[13px]">{h.tipo}</td>
              <td className="px-3 py-2.5 text-right font-mono text-xs">{h.capacidad}</td>
              <td className="px-3 py-2.5 text-right font-mono text-xs">{h.piso}</td>
              <td className="px-3 py-2.5 text-[12.5px] text-piedra">{h.estado}</td>
              <td className="px-3 py-2.5 text-right font-mono text-xs">{FORMATO_MONEDA.format(h.tarifaPorNoche)}</td>
            </tr>
          )}
        />
      </div>

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
