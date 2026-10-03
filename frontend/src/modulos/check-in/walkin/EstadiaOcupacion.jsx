import { Button } from "../../../componentes/Button";
import { formatearDiaLargo, sumarDiasISO } from "../../../lib/fechas";
import { NOCHES_MAXIMAS_WALKIN, NOCHES_MINIMAS_WALKIN } from "../checkInPantalla.constantes";
import { Paso, Tarjeta } from "../ui";

const MAXIMO_PERSONAS_HABITACION = 6;

// Estadía (entrada hoy, salida con − / +) y ocupación por habitación.
export function EstadiaOcupacion({ estado, hoy, dispatch }) {
  const salida = sumarDiasISO(hoy, estado.noches);
  const etiqueta = "block text-[12px] font-semibold uppercase tracking-[0.06em] text-piedra";
  return (
    <Tarjeta titulo="Estadía y ocupación">
      <div className="flex flex-wrap items-end gap-[22px]">
        <div>
          <small className={etiqueta}>Entrada</small>
          <div className="py-2 font-semibold">Hoy · {formatearDiaLargo(hoy)}</div>
        </div>
        <div>
          <small className={etiqueta}>Salida</small>
          <Paso
            ancho
            valor={formatearDiaLargo(salida)}
            onMenos={() => dispatch({ tipo: "noches", valor: estado.noches - 1 })}
            onMas={() => dispatch({ tipo: "noches", valor: estado.noches + 1 })}
            menosDeshabilitado={estado.noches <= NOCHES_MINIMAS_WALKIN}
            masDeshabilitado={estado.noches >= NOCHES_MAXIMAS_WALKIN}
            etiquetaMenos="Una noche menos"
            etiquetaMas="Una noche más"
          />
        </div>
        <div>
          <small className={etiqueta}>Noches</small>
          <div className="py-2 font-semibold">{estado.noches}</div>
        </div>
        <span className="text-[13px] text-piedra">Menores de 0 a 12 años sin cargo</span>
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
        {estado.habitaciones.map((h, i) => {
          const personas = h.adultos + h.menores;
          const ocupacion = (adultos, menores) => dispatch({ tipo: "ocupacion", clave: h.clave, adultos, menores });
          return (
            <div key={h.clave} className="flex flex-wrap items-end gap-4 rounded-md border border-borde bg-hueso/60 px-3.5 py-2.5">
              <span className="min-w-[110px] pb-2 font-semibold">Habitación {i + 1}</span>
              <div>
                <small className={etiqueta}>Adultos</small>
                <Paso
                  valor={h.adultos}
                  onMenos={() => ocupacion(h.adultos - 1, h.menores)}
                  onMas={() => ocupacion(h.adultos + 1, h.menores)}
                  menosDeshabilitado={h.adultos <= 1}
                  masDeshabilitado={personas >= MAXIMO_PERSONAS_HABITACION}
                  etiquetaMenos={`Un adulto menos en la habitación ${i + 1}`}
                  etiquetaMas={`Un adulto más en la habitación ${i + 1}`}
                />
              </div>
              <div>
                <small className={etiqueta}>Menores</small>
                <Paso
                  valor={h.menores}
                  onMenos={() => ocupacion(h.adultos, h.menores - 1)}
                  onMas={() => ocupacion(h.adultos, h.menores + 1)}
                  menosDeshabilitado={h.menores <= 0}
                  masDeshabilitado={personas >= MAXIMO_PERSONAS_HABITACION}
                  etiquetaMenos={`Un menor menos en la habitación ${i + 1}`}
                  etiquetaMas={`Un menor más en la habitación ${i + 1}`}
                />
              </div>
              {estado.habitaciones.length > 1 && (
                <Button variante="fantasma" onClick={() => dispatch({ tipo: "quitarHabitacion", clave: h.clave })}>
                  Quitar habitación
                </Button>
              )}
            </div>
          );
        })}
        <div>
          <Button variante="secundario" onClick={() => dispatch({ tipo: "agregarHabitacion" })}>
            ＋ Agregar habitación
          </Button>
        </div>
      </div>
      {estado.aviso && (
        <p role="alert" className="mt-3 rounded-md border border-laton-300 bg-laton-100 px-4 py-2.5 text-[13.5px] text-laton-700">
          {estado.aviso}
        </p>
      )}
    </Tarjeta>
  );
}
