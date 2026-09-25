import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Search, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { TituloSeccion } from "../check-in/TituloSeccion";
import { listarHabitaciones } from "../habitaciones/habitaciones.api";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA, ESTADO_RESERVA_BADGE } from "../reservas/reservas.constantes";

// Sin nada tipeado en el buscador, esta es la pantalla: mismo patrón que
// "Llegadas pendientes de hoy" del buscador por defecto de Check-in
// (CheckInConReserva.jsx) — a quién se le puede cargar un consumo ahora
// mismo, mismo criterio que el gate de registrarConsumo (solo reservas "En
// curso"). Reusa la misma consulta que ya usa el Panel de Habitaciones para
// resolver el huésped de las tarjetas ocupadas (listarReservas con estado
// EN_CURSO, ver HabitacionesPage.jsx), sin duplicarla. Clickear una fila
// llama a onEncontrada directo (mismo destino que "Continuar" tras una
// búsqueda) — sin el paso de confirmación, porque acá no hace falta: por
// construcción, todas las reservas de esta lista ya están "En curso".
function ReservasEnCurso({ reservas, cargando, onSeleccionar }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-white p-5">
      <TituloSeccion icono={Users} tono="pino">
        Huéspedes alojados ahora
      </TituloSeccion>
      {cargando ? (
        <p className="text-[13px] text-piedra">Buscando huéspedes alojados…</p>
      ) : reservas.length === 0 ? (
        <p className="text-[13px] text-piedra">No hay huéspedes alojados ahora mismo.</p>
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
                <p className="text-[12px] text-piedra">Hab. {r.habitaciones.map((h) => h.numero).join(", ")}</p>
              </div>
              <CodigoClave className="text-[13px]">{r.codigoConfirmacion}</CodigoClave>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
// A diferencia de la versión anterior, encontrar la reserva por búsqueda NO
// abre ConsumoModal directo: primero muestra un resumen (huésped, documento,
// habitación, estado) — mismo bloque visual que ya usa el buscador de
// Check-in (CheckInConReserva.jsx: CodigoClave + Badge de estado + grid de
// datos) — para que quien carga el consumo confirme que es la persona/
// habitación correcta antes de seguir. Recién con "Continuar" se dispara
// onEncontrada, que en ServiciosAdicionalesPage.jsx abre el ConsumoModal
// real. La lista por defecto (ReservasEnCurso, ver más abajo) sí llama a
// onEncontrada directo al clickear una fila, sin este paso intermedio.
export function BuscarConsumoModal({ onClose, onEncontrada }) {
  const [termino, setTermino] = useState("");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  // Sin nada tipeado, se muestra la lista por defecto (ReservasEnCurso) en
  // vez del resultado de una búsqueda — mismo criterio que
  // CheckInConReserva.jsx.
  const mostrandoBusqueda = termino.trim().length > 0;
  const enCursoQuery = useQuery({
    queryKey: ["reservas", "en-curso"],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO }),
    enabled: !mostrandoBusqueda,
  });

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
              onChange={(e) => {
                const valor = e.target.value;
                setTermino(valor);
                // Al volver a vaciar el campo, vuelve también el resto de la
                // pantalla al estado "sin buscar nada" (lista por defecto),
                // mismo criterio que CheckInConReserva.jsx.
                if (!valor.trim()) {
                  setResultado(null);
                  setError("");
                }
              }}
              placeholder="Código, documento o N° de habitación"
              error={error}
              className="w-full"
            />
          </div>
          <Button type="submit" icono={Search} cargando={busquedaMutation.isPending} disabled={!termino.trim()}>
            Buscar
          </Button>
        </form>

        {!mostrandoBusqueda && (
          <ReservasEnCurso
            reservas={enCursoQuery.data ?? []}
            cargando={enCursoQuery.isLoading}
            onSeleccionar={onEncontrada}
          />
        )}

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
