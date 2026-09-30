import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, LogIn, Search, User } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { Input } from "../../componentes/Input";
import { NombreClave } from "../../componentes/NombreClave";
import { formatearFechaSinHora } from "../../lib/fechas";
import { useToast } from "../../lib/useToast";
import { Toast } from "../../componentes/Toast";
import { GarantiaFieldset } from "./GarantiaFieldset";
import { PanelResumenCheckIn } from "./PanelResumenCheckIn";
import { TituloSeccion } from "./TituloSeccion";
import { buscarReservaParaCheckIn, confirmarCheckInConReserva } from "./checkIn.api";
import { MEDIOS_GARANTIA } from "./checkIn.constantes";
import { listarLlegadasPendientes } from "../reservas/reservas.api";
import { ESTADO_RESERVA_BADGE } from "../reservas/reservas.constantes";

const FORM_VACIO = {
  documento: "",
  garantiaConfirmada: false,
  medioGarantia: MEDIOS_GARANTIA[0],
  referenciaGarantia: undefined,
};

function habitacionesDeReserva(reserva) {
  return reserva.habitaciones.map((h) => `${h.numero} · ${h.tipo}`).join(", ");
}

// Mismos datos que "Llegadas de hoy" del Inicio del Recepcionista
// (RecepcionistaInicio.jsx), acá clickeable: en vez de mandar a esa pantalla
// a buscar de nuevo, arranca el check-in de una — mismo destino que el
// atajo "→ Iniciar check-in" (buscar por ese código), sin el viaje de ida y
// vuelta por la URL.
function LlegadasPendientes({ reservas, cargando, onSeleccionar }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-white p-5">
      <TituloSeccion icono={LogIn} tono="pino">
        Llegadas pendientes de hoy
      </TituloSeccion>
      {cargando ? (
        <p className="text-[13px] text-piedra">Buscando llegadas pendientes…</p>
      ) : reservas.length === 0 ? (
        <p className="text-[13px] text-piedra">
          Sin llegadas pendientes para hoy — buscá por código o documento si hace falta.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-borde">
          {reservas.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onSeleccionar(r)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left hover:bg-hueso"
            >
              <div>
                <NombreClave className="block">{r.huesped?.nombre}</NombreClave>
                <p className="text-[12px] text-piedra">Hab. {habitacionesDeReserva(r)}</p>
              </div>
              <CodigoClave className="text-[13px]">{r.codigoConfirmacion}</CodigoClave>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// HU-43, HU-46, HU-47 — check-in de una reserva ya cargada (HU-36/40). La
// búsqueda por código es el mismo dato que HU-42 le dio al huésped al
// confirmar la reserva.
export function CheckInConReserva({ codigoPreseleccionado = "" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState(codigoPreseleccionado);
  const [resultado, setResultado] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const { toast, mostrarToast } = useToast();
  const preseleccionAplicada = useRef(false);

  // Sin nada tipeado en el buscador, esta es la pantalla: a quién hay que
  // hacerle check-in ahora, mismo criterio y misma consulta que "Llegadas
  // de hoy" (RecepcionistaInicio.jsx) — ver listarLlegadasPendientes.
  const mostrandoBusqueda = codigo.trim().length > 0;
  const llegadasQuery = useQuery({
    queryKey: ["reservas", "llegadas-pendientes"],
    queryFn: listarLlegadasPendientes,
    enabled: !mostrandoBusqueda,
  });

  const buscar = useMutation({
    mutationFn: (codigoBuscado) => buscarReservaParaCheckIn({ codigo: codigoBuscado }),
    onSuccess: (data) => {
      setResultado(data);
      setForm(FORM_VACIO);
    },
    onError: () => setResultado(null),
  });

  // Click en una fila de "Llegadas pendientes de hoy": arranca el check-in
  // de esa reserva directo, mismo destino que el atajo del Inicio del
  // Recepcionista, sin el viaje de ida y vuelta por la URL.
  function iniciarCheckInDe(r) {
    setCodigo(r.codigoConfirmacion);
    buscar.mutate(r.codigoConfirmacion);
  }

  // Viene del "→ Iniciar check-in" de una llegada de hoy en el Inicio del
  // Recepcionista (RecepcionistaInicio.jsx): dispara la misma búsqueda que
  // el botón manual de acá abajo, una sola vez (mismo patrón de ref que ya
  // usa CheckInWalkIn.jsx para su propia preselección).
  useEffect(() => {
    if (!codigoPreseleccionado || preseleccionAplicada.current) return;
    preseleccionAplicada.current = true;
    buscar.mutate(codigoPreseleccionado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoPreseleccionado]);

  const confirmar = useMutation({
    mutationFn: () =>
      confirmarCheckInConReserva(resultado.reserva.id, {
        numeroDocumentoIngresado: form.documento.trim(),
        garantiaConfirmada: form.garantiaConfirmada,
        medioGarantia: form.medioGarantia,
        referenciaGarantia: form.referenciaGarantia,
      }),
    onSuccess: (reserva) => {
      mostrarToast(`Check-in confirmado — habitación${reserva.habitaciones.length > 1 ? "es" : ""} ${reserva.habitaciones.map((h) => h.numero).join(", ")} ocupada${reserva.habitaciones.length > 1 ? "s" : ""}.`);
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
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
      <div className="flex gap-6">
        <div className="flex flex-[1_1_auto] flex-col gap-5">
          <form
            className="flex flex-col gap-3 rounded-lg border border-borde bg-white p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (codigo.trim()) buscar.mutate(codigo.trim());
            }}
          >
            <TituloSeccion icono={Search} tono="info">
              Buscar reserva
            </TituloSeccion>
            <div className="flex items-end gap-3">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-[12px] font-medium text-piedra">Código de confirmación o documento del huésped</span>
                <input
                  value={codigo}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setCodigo(valor);
                    // Al volver a vaciar el campo, vuelve también el resto de
                    // la pantalla al estado "sin buscar nada" (lista de
                    // llegadas + panel vacío), no solo la lista de la
                    // izquierda.
                    if (!valor.trim()) setResultado(null);
                  }}
                  placeholder="Ej: RS-8F2K91 o 32.145.998"
                  className="rounded-[10px] border border-borde bg-white px-[14px] py-[10px] text-[14px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
                />
              </label>
              <Button type="submit" tamano="campo" icono={Search} cargando={buscar.isPending} disabled={!codigo.trim()}>
                Buscar
              </Button>
            </div>
          </form>

          {!mostrandoBusqueda && (
            <LlegadasPendientes
              reservas={llegadasQuery.data ?? []}
              cargando={llegadasQuery.isLoading}
              onSeleccionar={iniciarCheckInDe}
            />
          )}

          {mostrandoBusqueda && buscar.isError && (
            <p className="text-[13px] text-error-texto">
              {buscar.error?.response?.data?.error ?? "No se pudo buscar la reserva."}
            </p>
          )}

          {mostrandoBusqueda && reserva && (
            <div className="flex flex-col gap-5 rounded-lg border border-borde bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CodigoClave className="text-[20px]">{reserva.codigoConfirmacion}</CodigoClave>
                  <Badge variante={ESTADO_RESERVA_BADGE[reserva.estado] ?? "neutro"}>{reserva.estado}</Badge>
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
                  <div className="flex flex-col gap-3 border-t border-borde pt-5">
                    <TituloSeccion icono={User} tono="laton">
                      Datos del huésped
                    </TituloSeccion>
                    <div>
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
                </>
              )}
            </div>
          )}

          {confirmar.isSuccess && !reserva && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-pino-300 bg-pino-100 px-4 py-2.5 text-[13px] text-pino-700">
              <span className="flex items-center gap-2">
                <CheckCircle2 size={16} /> Check-in confirmado.
              </span>
              {/* Ajuste de flujo (Sprint 3): si el huésped pide algo apenas
                  llega, el mismo botón "Agregar consumo" está a un clic, en la
                  ficha de la reserva — no es un paso más de este wizard. */}
              {confirmar.data && (
                <Button
                  variante="secundario"
                  tamano="fila"
                  icono={ArrowRight}
                  onClick={() => navigate(`/reservas/${confirmar.data.id}`)}
                >
                  Ir a la ficha de la reserva
                </Button>
              )}
            </div>
          )}
        </div>

        <PanelResumenCheckIn
          reserva={reserva}
          garantiaConfirmada={form.garantiaConfirmada}
          medioGarantia={form.medioGarantia}
          puedeConfirmar={Boolean(puedeConfirmar)}
          cargando={confirmar.isPending}
          onConfirmar={() => confirmar.mutate()}
        />
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
