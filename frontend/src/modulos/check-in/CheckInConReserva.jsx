import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, DoorOpen, Search, User } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { Input } from "../../componentes/Input";
import { NombreClave } from "../../componentes/NombreClave";
import { formatearFechaSinHora } from "../../lib/fechas";
import { useToast } from "../../lib/useToast";
import { Toast } from "../../componentes/Toast";
import { GarantiaFieldset } from "./GarantiaFieldset";
import { buscarReservaParaCheckIn, confirmarCheckInConReserva } from "./checkIn.api";
import { MEDIOS_GARANTIA } from "./checkIn.constantes";

const FORM_VACIO = { documento: "", garantiaConfirmada: false, medioGarantia: MEDIOS_GARANTIA[0] };

// HU-43, HU-46, HU-47 — check-in de una reserva ya cargada (HU-36/40). La
// búsqueda por código es el mismo dato que HU-42 le dio al huésped al
// confirmar la reserva.
export function CheckInConReserva() {
  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const { toast, mostrarToast } = useToast();

  const buscar = useMutation({
    mutationFn: (codigoBuscado) => buscarReservaParaCheckIn({ codigo: codigoBuscado }),
    onSuccess: (data) => {
      setResultado(data);
      setForm(FORM_VACIO);
    },
    onError: () => setResultado(null),
  });

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarCheckInConReserva(resultado.reserva.id, {
        numeroDocumentoIngresado: form.documento.trim(),
        garantiaConfirmada: form.garantiaConfirmada,
        medioGarantia: form.medioGarantia,
      }),
    onSuccess: (reserva) => {
      mostrarToast(`Check-in confirmado — habitación${reserva.habitaciones.length > 1 ? "es" : ""} ${reserva.habitaciones.map((h) => h.numero).join(", ")} ocupada${reserva.habitaciones.length > 1 ? "s" : ""}.`);
      setResultado(null);
      setCodigo("");
      setForm(FORM_VACIO);
    },
  });

  function cambiar(cambios) {
    confirmar.reset();
    setForm((f) => ({ ...f, ...cambios }));
  }

  const reserva = resultado?.reserva;
  const puedeConfirmar =
    resultado?.puedeIniciarCheckIn && form.documento.trim() && form.garantiaConfirmada && !confirmar.isPending;

  return (
    <div className="flex flex-col gap-5">
      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-borde bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (codigo.trim()) buscar.mutate(codigo.trim().toUpperCase());
        }}
      >
        <Input
          label="Código de confirmación de la reserva"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="A1B2C3D4"
          className="min-w-[220px] font-mono uppercase"
        />
        <Button type="submit" icono={Search} cargando={buscar.isPending} disabled={!codigo.trim()}>
          Buscar reserva
        </Button>
      </form>

      {buscar.isError && (
        <p className="text-[13px] text-error-texto">
          {buscar.error?.response?.data?.error ?? "No se pudo buscar la reserva."}
        </p>
      )}

      {reserva && (
        <div className="flex flex-col gap-5 rounded-lg border border-borde bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <CodigoClave className="text-[20px]">{reserva.codigoConfirmacion}</CodigoClave>
              <Badge variante={resultado.puedeIniciarCheckIn ? "ok" : "alerta"}>{reserva.estado}</Badge>
            </div>
            {reserva.cantidadHabitaciones > 1 && <Badge variante="info">Reserva grupal</Badge>}
          </div>

          {!resultado.puedeIniciarCheckIn && (
            <p className="rounded-md border border-laton-300 bg-laton-100 px-4 py-2.5 text-[13px] text-laton-700">
              {resultado.motivoBloqueo}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-piedra">Huésped</p>
              <NombreClave className="text-[14px]">{reserva.huesped?.nombre}</NombreClave>
              <p className="text-[12.5px] text-piedra">
                {reserva.huesped?.tipoDocumento} {reserva.huesped?.numeroDocumento}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-piedra">Habitaciones</p>
              <p className="font-mono text-[13.5px]">{reserva.habitaciones.map((h) => `${h.numero} (${h.tipo})`).join(", ")}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-piedra">Entrada</p>
              <p className="text-[13.5px]">{formatearFechaSinHora(reserva.fechaDesde)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-piedra">Salida</p>
              <p className="text-[13.5px]">
                {formatearFechaSinHora(reserva.fechaHasta)} · {reserva.noches} noche{reserva.noches === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          {resultado.puedeIniciarCheckIn && (
            <>
              <div className="border-t border-borde pt-5">
                <Input
                  label="Documento presentado por el huésped *"
                  value={form.documento}
                  onChange={(e) => cambiar({ documento: e.target.value })}
                  placeholder={`${reserva.huesped?.tipoDocumento ?? "DNI"} …`}
                />
                <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-piedra">
                  <User size={13} /> Se compara contra el documento cargado en la reserva antes de confirmar.
                </p>
              </div>

              <GarantiaFieldset
                garantiaConfirmada={form.garantiaConfirmada}
                medioGarantia={form.medioGarantia}
                onCambiar={cambiar}
              />

              {confirmar.isError && (
                <p className="text-[13px] text-error-texto">
                  {confirmar.error?.response?.data?.error ?? "No se pudo confirmar el check-in."}
                </p>
              )}

              <div className="flex justify-end">
                <Button icono={DoorOpen} cargando={confirmar.isPending} disabled={!puedeConfirmar} onClick={() => confirmar.mutate()}>
                  Confirmar check-in
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {confirmar.isSuccess && !reserva && (
        <p className="flex items-center gap-2 rounded-md border border-pino-300 bg-pino-100 px-4 py-2.5 text-[13px] text-pino-700">
          <CheckCircle2 size={16} /> Check-in confirmado.
        </p>
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
