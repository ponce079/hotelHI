import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { formatearFechaSinHora } from "../../lib/fechas";
import { LayoutPublico } from "./LayoutPublico";
import { BuscadorPorCodigo, ReservaWizard } from "./ReservaWizard";
import { obtenerReservaPorCodigo } from "./reservas.api";
import { ESTADO_RESERVA_BADGE } from "./reservas.constantes";

// HU-40 — alta de reserva desde el sitio web, sin recepcionista. Reutiliza
// el MISMO <ReservaWizard> y, por lo tanto, el mismo endpoint y la misma
// validación de disponibilidad que la carga asistida de HU-36: acá solo
// cambia el envoltorio (sin sesión, sin menú lateral) y el `origen`, que
// únicamente matiza el texto de la confirmación.

function FichaReserva({ reserva, titulo }) {
  return (
    <div className="rounded-lg border border-borde bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-[21px] font-semibold">{titulo}</h2>
        <Badge variante={ESTADO_RESERVA_BADGE[reserva.estado]}>{reserva.estado}</Badge>
      </div>
      <div className="mt-4 rounded-lg border border-pino-300 bg-pino-100 px-5 py-4">
        <p className="text-[11px] uppercase tracking-wide text-pino-700">Código de confirmación</p>
        <CodigoClave className="text-[26px] text-pino-700">{reserva.codigoConfirmacion}</CodigoClave>
        <p className="mt-1 text-[12px] text-pino-700">
          Guardá este código: es el que te van a pedir al llegar para hacer el check-in.
        </p>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-piedra">Huésped</dt>
          <dd className="text-[13.5px]">{reserva.huesped?.nombre}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-piedra">Habitaciones</dt>
          <dd className="font-mono text-[13.5px]">
            {reserva.habitaciones.map((h) => `${h.numero} (${h.tipo})`).join(", ")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-piedra">Entrada</dt>
          <dd className="text-[13.5px]">{formatearFechaSinHora(reserva.fechaDesde)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-piedra">Salida</dt>
          <dd className="text-[13.5px]">
            {formatearFechaSinHora(reserva.fechaHasta)} · {reserva.noches} noche{reserva.noches === 1 ? "" : "s"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ReservaWebPage() {
  const [searchParams] = useSearchParams();
  const [confirmada, setConfirmada] = useState(null);
  const [consultada, setConsultada] = useState(null);
  const [errorConsulta, setErrorConsulta] = useState("");

  const valoresIniciales = {
    fechaDesde: searchParams.get("desde") ?? "",
    fechaHasta: searchParams.get("hasta") ?? "",
  };

  const consulta = useMutation({
    mutationFn: (codigo) => obtenerReservaPorCodigo(codigo),
    onSuccess: (reserva) => {
      setErrorConsulta("");
      setConsultada(reserva);
    },
    onError: (error) => {
      setConsultada(null);
      setErrorConsulta(error?.response?.data?.error ?? "No se pudo buscar la reserva.");
    },
  });

  if (confirmada) {
    return (
      <LayoutPublico>
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          <div className="flex items-center gap-2 text-exito">
            <CheckCircle2 size={22} />
            <span className="font-heading text-[21px] font-semibold">¡Reserva confirmada!</span>
          </div>
          <p className={confirmada.confirmacionEmail?.enviado ? "text-[13px] text-exito" : "text-[13px] text-advertencia-texto"}>
            {confirmada.confirmacionEmail?.enviado
              ? `Enviamos la confirmación a ${confirmada.huesped?.contacto}.`
              : "La reserva quedó registrada, pero no fue posible enviar el correo de confirmación."}
          </p>
          <FichaReserva reserva={confirmada} titulo="Tu reserva" />
          <div>
            <Button variante="secundario" onClick={() => setConfirmada(null)}>
              Hacer otra reserva
            </Button>
          </div>
        </div>
      </LayoutPublico>
    );
  }

  return (
    <LayoutPublico>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Reservá tu estadía</h1>
          <p className="mt-1.5 text-[13.5px] text-piedra">
            Elegí las fechas, la habitación y completá tus datos. No hace falta llamar ni pasar por recepción.
          </p>
        </div>

        <div className="rounded-lg border border-borde bg-white">
          <ReservaWizard
            origen="WEB"
            valoresIniciales={valoresIniciales}
            onExito={(reserva) => setConfirmada(reserva)}
            onCancelar={() => window.history.back()}
          />
        </div>

        <div className="rounded-lg border border-borde bg-white p-6">
          <h2 className="font-heading text-[19px] font-semibold">¿Ya tenés una reserva?</h2>
          <p className="mb-3 mt-1 text-[13px] text-piedra">
            Consultá su estado con el código de confirmación que recibiste.
          </p>
          <BuscadorPorCodigo onBuscar={(codigo) => consulta.mutate(codigo)} cargando={consulta.isPending} />
          {errorConsulta && <p className="mt-3 text-[12.5px] text-error-texto">{errorConsulta}</p>}
          {consultada && (
            <div className="mt-4">
              <FichaReserva reserva={consultada} titulo="Reserva encontrada" />
            </div>
          )}
        </div>
      </div>
    </LayoutPublico>
  );
}

