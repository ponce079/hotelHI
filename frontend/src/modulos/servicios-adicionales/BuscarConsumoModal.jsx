import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Search } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarHabitaciones } from "../habitaciones/habitaciones.api";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA, ESTADO_RESERVA_BADGE } from "../reservas/reservas.constantes";

// Tercera puerta de entrada para cargar un consumo (HU 61 a 64), sumada a
// la ficha de la reserva y al atajo de Habitaciones: el nombre de esta
// pantalla la vuelve el primer lugar donde una recepcionista va a buscar.
// Primero prueba el término como código de confirmación o documento del
// huésped reusando el mismo endpoint que ya usa Check-in
// (reservasServicio.obtenerPorCodigoODocumento, ver buscarReservaParaCheckIn
// en checkIn.api.js — sin reimplementar esa búsqueda), y si no matchea cae
// a número de habitación exacto + reserva "En curso" de esa habitación
// (mismo criterio de 0/1/>1 coincidencias que manejarAgregarConsumo en
// HabitacionesPage.jsx).
//
// A diferencia de la versión anterior, encontrar la reserva NO abre
// ConsumoModal directo: primero muestra un resumen (huésped, documento,
// habitación, estado) — mismo bloque visual que ya usa el buscador de
// Check-in (CheckInConReserva.jsx: CodigoClave + Badge de estado + grid de
// datos) — para que quien carga el consumo confirme que es la persona/
// habitación correcta antes de seguir. Recién con "Continuar" se dispara
// onEncontrada, que en ServiciosAdicionalesPage.jsx abre el ConsumoModal
// real.
export function BuscarConsumoModal({ onClose, onEncontrada }) {
  const [termino, setTermino] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  const busquedaMutation = useMutation({
    mutationFn: async (valor) => {
      let reserva;
      try {
        const resultado = await buscarReservaParaCheckIn({ codigo: valor });
        reserva = resultado.reserva;
      } catch (err) {
        if (err?.response?.status !== 404) throw err;
      }
      if (!reserva) {
        const habitaciones = await listarHabitaciones({ q: valor, activo: "true" });
        const habitacion = habitaciones.find((h) => h.numero === valor);
        if (!habitacion) throw new Error(`No se encontró ninguna reserva ni habitación para "${valor}".`);
        const reservasEnCurso = await listarReservas({ estado: ESTADO_RESERVA.EN_CURSO });
        const coincidencias = reservasEnCurso.filter((r) => r.habitaciones.some((h) => h.numero === habitacion.numero));
        if (coincidencias.length === 0) throw new Error(`No hay una reserva "En curso" para la habitación ${habitacion.numero}.`);
        if (coincidencias.length > 1) {
          throw new Error(`Hay más de una reserva "En curso" para la habitación ${habitacion.numero} — revisá los datos.`);
        }
        reserva = coincidencias[0];
      }
      return reserva;
    },
    onSuccess: (reserva) => setResultado(reserva),
    onError: (err) => {
      setResultado(null);
      setError(err?.response?.data?.error ?? err.message ?? "No se pudo completar la búsqueda.");
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    const valor = termino.trim();
    if (!valor) return;
    setError("");
    setResultado(null);
    busquedaMutation.mutate(valor);
  }

  const puedeCargar = resultado?.estado === ESTADO_RESERVA.EN_CURSO;
  const motivoBloqueo = resultado && !puedeCargar
    ? `La reserva ${resultado.codigoConfirmacion} está "${resultado.estado}" — solo se puede cargar un consumo a una reserva en curso.`
    : null;

  return (
    <Modal
      titulo="Cargar consumo"
      subtitulo="Buscá la reserva por código de confirmación, documento del huésped o N° de habitación"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <Input
              autoFocus
              value={termino}
              onChange={(e) => setTermino(e.target.value)}
              placeholder="Código, documento o N° de habitación"
              error={error}
              className="w-full"
            />
          </div>
          <Button type="submit" icono={Search} cargando={busquedaMutation.isPending} disabled={!termino.trim()}>
            Buscar
          </Button>
        </form>

        {/* Mismo bloque de resumen que usa el buscador de Check-in al
            encontrar una reserva (CheckInConReserva.jsx): código + Badge de
            estado, huésped y habitación(es) en grid, y un aviso laton si la
            reserva no está en condiciones (acá: no está "En curso"). */}
        {resultado && (
          <div className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-5">
            <div className="flex items-center gap-3">
              <CodigoClave className="text-[16px]">{resultado.codigoConfirmacion}</CodigoClave>
              <Badge variante={ESTADO_RESERVA_BADGE[resultado.estado] ?? "neutro"}>{resultado.estado}</Badge>
            </div>

            {motivoBloqueo && (
              <p className="rounded-md border border-laton-300 bg-laton-100 px-4 py-2.5 text-[13px] text-laton-700">
                {motivoBloqueo}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-piedra">Huésped</p>
                <NombreClave className="text-[14px]">{resultado.huesped?.nombre}</NombreClave>
                <p className="text-[12.5px] text-piedra">
                  {resultado.huesped?.tipoDocumento} {resultado.huesped?.numeroDocumento}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-piedra">
                  Habitación{resultado.habitaciones.length > 1 ? "es" : ""}
                </p>
                <p className="font-mono text-[13.5px]">{resultado.habitaciones.map((h) => h.numero).join(", ")}</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
        <Button type="button" variante="secundario" disabled={busquedaMutation.isPending} onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" icono={ArrowRight} disabled={!puedeCargar} onClick={() => onEncontrada(resultado)}>
          Continuar
        </Button>
      </div>
    </Modal>
  );
}
