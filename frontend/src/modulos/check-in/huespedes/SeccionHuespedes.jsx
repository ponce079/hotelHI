import { Input } from "../../../componentes/Input";
import { Tarjeta } from "../ui";
import { FilaHuesped } from "./FilaHuesped";
import { AccionHuesped } from "./AccionHuesped";
import { etiquetaOcupacion, necesitaMotivo, nombreHabitacion } from "../checkInReglas";

// Huéspedes agrupados por habitación: una fila por persona según la ocupación. Nada se guarda
// hasta confirmar el check-in.
export function SeccionHuespedes({ estado, contexto, dispatch }) {
  const quienReservo = contexto.huespedReserva?.nombre;
  return (
    <Tarjeta titulo="Huéspedes">
      <div className="flex flex-col gap-3">
        <p className="text-[12px] text-piedra">* obligatorio</p>
        {necesitaMotivo(estado, contexto) && (
          <div className="rounded-[12px] border border-laton-300 bg-laton-100 px-3.5 py-3">
            <b className="text-laton-700">El titular es distinto de quien reservó{quienReservo ? ` (${quienReservo})` : ""}</b>
            <div className="mt-2 max-w-[640px]">
              <Input
                id="ci-motivo"
                label="Motivo * (queda registrado con tu usuario y la hora)"
                value={estado.motivoTitularDistinto}
                onChange={(e) => dispatch({ tipo: "motivo", valor: e.target.value })}
                placeholder="Por ejemplo: reservó un familiar que no viaja"
              />
            </div>
          </div>
        )}
        {estado.habitaciones.map((h) => {
          const filas = estado.filas.filter((f) => f.habitacionClave === h.clave);
          const adultos = filas.filter((f) => f.tipo === "adulto").length;
          return (
            <section key={h.clave} aria-label={`Huéspedes de la ${nombreHabitacion(estado, h.clave)}`} className="flex flex-col gap-2.5 rounded-[12px] border border-borde bg-hueso/60 p-3">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="font-heading text-[20px] font-semibold text-pino-800">{h.numero ?? nombreHabitacion(estado, h.clave)}</span>
                <b>{h.tipo ?? "Sin elegir"}</b>
                <span className="text-[13px] text-piedra">
                  {etiquetaOcupacion(h.adultos, h.menores)}
                  {h.capacidad != null ? ` · capacidad ${h.capacidad}` : ""}
                </span>
              </div>
              {h.errorOcupacion && (
                <p role="alert" className="rounded-md bg-error-suave px-2.5 py-1.5 text-[13.5px] text-error-texto">
                  {h.errorOcupacion}
                </p>
              )}
              {filas.map((fila) => (
                <FilaHuesped
                  key={fila.id}
                  estado={estado}
                  contexto={contexto}
                  fila={fila}
                  dispatch={dispatch}
                  puedeQuitar={!fila.esTitular && !(fila.tipo === "adulto" && adultos <= 1)}
                />
              ))}
              <AccionHuesped estado={estado} habitacion={h} dispatch={dispatch} />
            </section>
          );
        })}
      </div>
    </Tarjeta>
  );
}
