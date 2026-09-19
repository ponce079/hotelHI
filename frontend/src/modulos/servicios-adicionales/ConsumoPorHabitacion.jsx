import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { BedDouble, Search } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Input } from "../../componentes/Input";
import { Toast } from "../../componentes/Toast";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";
import { ConsumoModal } from "./ConsumoModal";

// Ajuste de flujo (Sprint 3, punto 3): atajo para la tarea más frecuente
// del sprint — un pedido espontáneo de un huésped ya alojado — sin tener
// que ir primero a Reservas y buscarla ahí. Reusa GET /api/reservas (mismo
// endpoint y mismo filtro `q` que ya soporta buscar por número de
// habitación, ver reservas.servicio.js: listarReservas) — no agrega
// endpoint nuevo. El filtro por texto es "contains", así que se vuelve a
// filtrar acá por coincidencia EXACTA del número de habitación (buscar
// "10" no puede traer la habitación "101" por error).
//
// Solo trae reservas "En curso": la aclaración de negocio del sprint dice
// que cargar un consumo (con descuento de stock real) solo tiene sentido
// una vez que el huésped hizo check-in, mismo criterio que el botón
// "Agregar consumo" de la ficha de reserva (ReservaDetallePage.jsx) — si
// la habitación no tiene una reserva "En curso" asociada, este atajo no
// lleva a ningún lado.
export function ConsumoPorHabitacion() {
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const [numero, setNumero] = useState("");
  const [reservaElegida, setReservaElegida] = useState(null);
  const [coincidencias, setCoincidencias] = useState(null);
  const [error, setError] = useState("");

  const buscar = useMutation({
    mutationFn: async (numeroBuscado) => {
      const resultado = await listarReservas({ q: numeroBuscado, estado: ESTADO_RESERVA.EN_CURSO });
      return resultado.filter((r) => r.habitaciones.some((h) => h.numero === numeroBuscado));
    },
    onSuccess: (encontradas) => {
      setError("");
      if (encontradas.length === 0) {
        setCoincidencias(null);
        setError(`No hay una reserva "En curso" para la habitación ${numero.trim()}.`);
      } else if (encontradas.length === 1) {
        setCoincidencias(null);
        setReservaElegida(encontradas[0]);
      } else {
        // No debería pasar (una habitación física no puede estar en dos
        // estadías "En curso" a la vez) — red de seguridad para no
        // esconder el caso si los datos están inconsistentes.
        setCoincidencias(encontradas);
      }
    },
    onError: () => setError("No se pudo buscar la reserva de esa habitación."),
  });

  if (!puede("registrarConsumoServicio")) return null;

  return (
    <div className="rounded-lg border border-borde bg-white p-4">
      <form
        className="flex flex-wrap items-end gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setCoincidencias(null);
          if (numero.trim()) buscar.mutate(numero.trim());
        }}
      >
        <Input
          label="Consumo rápido por habitación"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Ej. 101"
          className="max-w-[160px] font-mono"
        />
        <Button type="submit" variante="secundario" icono={Search} cargando={buscar.isPending} disabled={!numero.trim()}>
          Cargar consumo
        </Button>
      </form>

      {error && <p className="mt-2.5 text-[12.5px] text-error-texto">{error}</p>}

      {coincidencias && (
        <div className="mt-3 flex flex-col gap-1.5">
          <p className="text-[12px] text-piedra">Hay más de una reserva "En curso" para esa habitación — elegí una:</p>
          {coincidencias.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setCoincidencias(null);
                setReservaElegida(r);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-borde px-3 py-2 text-left text-[12.5px] hover:bg-hueso"
            >
              <BedDouble size={14} className="text-pino" />
              {r.codigoConfirmacion} · {r.huesped?.nombre}
            </button>
          ))}
        </div>
      )}

      {reservaElegida && (
        <ConsumoModal
          reserva={reservaElegida}
          onClose={() => setReservaElegida(null)}
          onExito={(mensaje) => {
            setReservaElegida(null);
            setNumero("");
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
