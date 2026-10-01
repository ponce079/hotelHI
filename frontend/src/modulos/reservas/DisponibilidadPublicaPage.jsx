import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BedDouble, CalendarRange, Check, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { LayoutPublico } from "./LayoutPublico";
import { consultarDisponibilidad } from "./reservas.api";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";

// HU-38 — consulta pública de disponibilidad en tiempo real por fecha y
// tipo. Sin sesión: el rol habilitado es "Huésped" (autoservicio), así que
// la ruta vive fuera de <RequireSesion> en App.jsx.
//
// "En tiempo real" se resuelve sin websockets ni polling: la consulta se
// recalcula contra la base en cada búsqueda y react-query no sirve una
// respuesta vieja (staleTime 0), así que un alta o una cancelación hecha
// por recepción ya se ve en la siguiente consulta del huésped.

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function manana() {
  const hoy = new Date(`${hoyEnHoraLocal()}T00:00:00.000Z`);
  return new Date(hoy.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Etapa 4A (HU-95, regla 6) — "Desde $X por noche" de una habitación: el
// menor promedio por noche entre los planes que el motor ya devolvió.
function precioDesde(habitacion) {
  const planes = habitacion?.planes ?? [];
  if (planes.length === 0) return null;
  return Math.min(...planes.map((p) => p.promedioPorNoche));
}

export function DisponibilidadPublicaPage({ modoInterno = false }) {
  const navigate = useNavigate();
  const [criterio, setCriterio] = useState({
    fechaDesde: hoyEnHoraLocal(),
    fechaHasta: manana(),
    tipoHabitacionId: "",
    capacidadMinima: "",
    // Etapa 4A (HU-95, regla 6) — ocupación buscada, para que el motor
    // cotice con la misma composición que después va a reservar el
    // huésped. Default 2 adultos / 0 menores.
    adultos: 2,
    menores: 0,
  });
  const [buscado, setBuscado] = useState(null);

  // HU-89 — catálogo para el select de tipo. En la web pública (modoInterno
  // false) solo tipos activos con al menos una habitación activa: no tiene
  // sentido ofrecerle al huésped un tipo sin ninguna unidad real. En uso
  // interno (modoInterno true, /reservas/disponibilidad) todos los tipos
  // activos del catálogo, mismo criterio que el resto de las pantallas de
  // mostrador.
  const tiposQuery = useQuery({
    queryKey: ["tipos-habitacion", "activos", modoInterno],
    queryFn: () => listarTiposHabitacion(modoInterno ? { activo: "true" } : { activo: "true", conHabitacionActiva: "true" }),
  });
  // Selección de tarjetas (solo tiene efecto en modoInterno — ver el botón
  // "Crear reserva" más abajo): mismo patrón visual y de estado que
  // CheckInWalkIn.jsx (relleno sólido cuando está elegida).
  const [habitacionIds, setHabitacionIds] = useState([]);

  function alternarHabitacion(id) {
    setHabitacionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const rangoValido = Boolean(
    criterio.fechaDesde && criterio.fechaHasta && criterio.fechaHasta > criterio.fechaDesde
  );

  const disponibilidadQuery = useQuery({
    queryKey: ["disponibilidad-publica", buscado],
    queryFn: () =>
      consultarDisponibilidad({
        fechaDesde: buscado.fechaDesde,
        fechaHasta: buscado.fechaHasta,
        tipoHabitacionId: buscado.tipoHabitacionId || undefined,
        capacidadMinima: buscado.capacidadMinima || undefined,
        adultos: buscado.adultos,
        menores: buscado.menores,
      }),
    enabled: Boolean(buscado),
    staleTime: 0,
  });

  const resultado = disponibilidadQuery.data;

  function actualizar(campo, valor) {
    setCriterio((c) => ({ ...c, [campo]: valor }));
  }

  const contenido = (
      <div className="flex flex-col gap-6">
        <div className={modoInterno ? "rounded-lg bg-pino px-6 py-5 text-hueso" : ""}>
          <h1 className="font-heading text-[34px] font-semibold">Disponibilidad</h1>
          <p className={`mt-1.5 text-[13.5px] ${modoInterno ? "text-hueso/70" : "text-piedra"}`}>
            Elegí las fechas de tu estadía y mirá qué habitaciones quedan libres.
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3 rounded-lg border border-borde bg-white p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (rangoValido) {
              setBuscado({ ...criterio });
              // Una búsqueda nueva invalida la selección anterior: puede
              // traer otras habitaciones, o ninguna de las ya elegidas.
              setHabitacionIds([]);
            }
          }}
        >
          <Input
            label="Entrada"
            type="date"
            min={hoyEnHoraLocal()}
            value={criterio.fechaDesde}
            onChange={(e) => actualizar("fechaDesde", e.target.value)}
          />
          <Input
            label="Salida"
            type="date"
            min={criterio.fechaDesde || hoyEnHoraLocal()}
            value={criterio.fechaHasta}
            onChange={(e) => actualizar("fechaHasta", e.target.value)}
          />
          <Select
            label="Tipo"
            value={criterio.tipoHabitacionId}
            onChange={(e) => actualizar("tipoHabitacionId", e.target.value)}
            className="min-w-[160px]"
          >
            <option value="">Todos</option>
            {(tiposQuery.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Personas"
            value={criterio.capacidadMinima}
            onChange={(e) => actualizar("capacidadMinima", e.target.value)}
            className="min-w-[130px]"
          >
            <option value="">Sin mínimo</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            label="Adultos"
            value={criterio.adultos}
            onChange={(e) => actualizar("adultos", Number(e.target.value))}
            className="min-w-[110px]"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            label="Menores"
            value={criterio.menores}
            onChange={(e) => actualizar("menores", Number(e.target.value))}
            className="min-w-[110px]"
          >
            {[0, 1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Button type="submit" variante="ok" icono={CalendarRange} disabled={!rangoValido} cargando={disponibilidadQuery.isFetching}>
            Buscar
          </Button>
        </form>

        <p className="-mt-3 text-[11.5px] text-piedra">Menores de 0 a 12 años sin cargo.</p>

        {criterio.fechaDesde && criterio.fechaHasta && !rangoValido && (
          <p className="text-[13px] text-error-texto">La fecha de salida tiene que ser posterior a la de entrada.</p>
        )}

        {disponibilidadQuery.isError && (
          <p className="text-[13px] text-error-texto">
            {disponibilidadQuery.error?.response?.data?.error ?? "No se pudo consultar la disponibilidad."}
          </p>
        )}

        {resultado && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {resultado.resumenPorTipo.map((r) => (
                <div key={r.tipoHabitacionId} className="rounded-lg border border-borde bg-white p-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-heading text-[17px] font-semibold">{r.tipo}</span>
                    <Badge variante={r.disponibles > 0 ? "ok" : "neutro"}>
                      {r.disponibles > 0 ? "Disponible" : "Sin lugar"}
                    </Badge>
                  </div>
                  <Cifra tamano={28}>
                    {r.disponibles}
                    <span className="text-[15px] text-piedra"> / {r.total}</span>
                  </Cifra>
                  <p className="mt-1 text-[12px] text-piedra">
                    {r.tarifaDesde ? `Desde ${FORMATO_MONEDA.format(r.tarifaDesde)} por noche` : "Sin habitaciones libres"}
                    {r.capacidadMaxima ? ` · hasta ${r.capacidadMaxima} personas` : ""}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13.5px] text-piedra">
                {resultado.habitaciones.length} habitaci{resultado.habitaciones.length === 1 ? "ón" : "ones"} libre
                {resultado.habitaciones.length === 1 ? "" : "s"} · {resultado.noches} noche
                {resultado.noches === 1 ? "" : "s"}
              </p>
              {resultado.habitaciones.length > 0 && (
                <Button
                  variante="ok"
                  disabled={modoInterno && habitacionIds.length === 0}
                  onClick={() =>
                    modoInterno
                      ? navigate(`/reservas?nueva=1&desde=${buscado.fechaDesde}&hasta=${buscado.fechaHasta}`, {
                          state: {
                            habitaciones: habitacionIds.map((id) => ({
                              habitacionId: id,
                              adultos: buscado.adultos,
                              menores: buscado.menores,
                            })),
                          },
                        })
                      : navigate(`/reservar?desde=${buscado.fechaDesde}&hasta=${buscado.fechaHasta}`)
                  }
                >
                  {modoInterno
                    ? `Crear reserva${habitacionIds.length > 0 ? ` (${habitacionIds.length} ${habitacionIds.length === 1 ? "habitación" : "habitaciones"})` : ""}`
                    : "Reservar estas fechas"}
                </Button>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {resultado.habitaciones.map((h) => {
                // La selección (para alimentar directo al wizard de "Nueva
                // reserva") solo tiene sentido en modoInterno: el
                // autoservicio público sigue yendo a /reservar tal cual,
                // sin preselección de habitación.
                const elegida = modoInterno && habitacionIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={modoInterno ? () => alternarHabitacion(h.id) : undefined}
                    aria-pressed={modoInterno ? elegida : undefined}
                    className={`flex flex-col gap-2 rounded-lg border p-5 text-left transition-colors ${
                      modoInterno
                        ? `cursor-pointer ${elegida ? "border-pino bg-pino text-hueso" : "border-borde bg-white hover:bg-hueso"}`
                        : "border-borde bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-mono text-[15px] font-semibold">
                        <BedDouble size={17} className={elegida ? "text-hueso" : "text-pino"} />
                        {h.numero}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variante="ok">{h.tipo}</Badge>
                        {elegida && <Check size={16} className="flex-none text-hueso" />}
                      </div>
                    </div>
                    <p className={`flex items-center gap-1.5 text-[12.5px] ${elegida ? "text-hueso/80" : "text-piedra"}`}>
                      <Users size={14} /> Hasta {h.capacidad} persona{h.capacidad === 1 ? "" : "s"} · piso {h.piso}
                    </p>
                    {h.equipamiento && (
                      <p className={`text-[12.5px] ${elegida ? "text-hueso/80" : "text-piedra"}`}>{h.equipamiento}</p>
                    )}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                      {precioDesde(h) != null ? (
                        <>
                          <div>
                            <p className={`text-[11px] uppercase tracking-wide ${elegida ? "text-hueso/70" : "text-piedra"}`}>
                              Desde
                            </p>
                            <Cifra tamano={21}>{FORMATO_MONEDA.format(precioDesde(h))}</Cifra>
                          </div>
                          <p className={`text-[12px] ${elegida ? "text-hueso/80" : "text-piedra"}`}>por noche</p>
                        </>
                      ) : (
                        <p className={`text-[12px] ${elegida ? "text-hueso/80" : "text-piedra"}`}>
                          {h.motivoNoDisponible ?? "Sin precio disponible"}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {resultado.habitaciones.length === 0 && (
              <p className="rounded-lg border border-borde bg-white px-6 py-12 text-center text-[13.5px] text-piedra">
                No quedan habitaciones libres con esos criterios. Probá con otras fechas o sin filtro de tipo.
              </p>
            )}
          </>
        )}

        {!resultado && !disponibilidadQuery.isFetching && (
          <p className="rounded-lg border border-borde bg-white px-6 py-12 text-center text-[13.5px] text-piedra">
            Elegí un período y tocá «Buscar» para ver la disponibilidad.
          </p>
        )}
      </div>
  );

  return modoInterno ? contenido : <LayoutPublico>{contenido}</LayoutPublico>;
}

