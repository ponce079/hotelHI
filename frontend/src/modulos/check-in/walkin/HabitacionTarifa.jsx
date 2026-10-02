import { Button } from "../../../componentes/Button";
import { formatearPrecio } from "../../../lib/moneda";
import { etiquetaOcupacion } from "../checkInReglas";
import { condicionesDelPlan } from "../reserva/ResumenReserva";
import { Tarjeta } from "../ui";

const precioDe = (habitacion, codigo) => habitacion.planes?.find((p) => p.codigo === codigo)?.total;

// Una sola tarifa para toda la reserva y, por cada habitación del walk-in, las libres donde entra
// su ocupación (sin las ya elegidas para otra), agrupadas por tipo, con un solo precio: el total
// de esa ocupación en la tarifa elegida.
export function HabitacionTarifa({ estado, libres, planes, dispatch }) {
  return (
    <Tarjeta
      titulo="Habitación y tarifa"
      accion={<span className="text-[13px] text-piedra">Totales por {estado.noches} {estado.noches === 1 ? "noche" : "noches"}, IVA incluido</span>}
    >
      <div id="ci-tarifa" tabIndex={-1} role="group" aria-label="Tarifa" className="grid gap-2.5 focus:outline-none [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {planes.length === 0 && <span className="text-[13px] text-piedra">Las tarifas aparecen con las habitaciones disponibles.</span>}
        {planes.map((p) => (
          <button
            key={p.codigo}
            type="button"
            aria-pressed={estado.planCodigo === p.codigo}
            onClick={() => dispatch({ tipo: "plan", codigo: p.codigo })}
            className={`cursor-pointer rounded-[12px] border px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-pino ${
              estado.planCodigo === p.codigo ? "border-pino bg-pino-100" : "border-borde bg-white hover:bg-hueso"
            }`}
          >
            <b className="block">{p.nombre}</b>
            <span className="text-[13px] text-piedra">{condicionesDelPlan(p)}</span>
          </button>
        ))}
      </div>
      {estado.habitaciones.map((h, i) => {
        const consulta = libres[i];
        const opciones = consulta?.data?.habitaciones ?? [];
        const porTipo = [...new Set(opciones.map((o) => o.tipo))].map((tipo) => ({ tipo, habitaciones: opciones.filter((o) => o.tipo === tipo) }));
        return (
          <div key={h.clave} id={`ci-hab-${h.clave}`} tabIndex={-1} className="mt-4 rounded-[12px] border border-borde px-3.5 py-3 focus:outline-none">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-heading text-[16.5px] font-semibold">Habitación {i + 1}</h3>
              <span className="text-[13px] text-piedra">{etiquetaOcupacion(h.adultos, h.menores)}</span>
            </div>
            {h.errorServidor && (
              <p role="alert" className="mb-2 text-[13px] text-error-texto">
                {h.errorServidor}
              </p>
            )}
            {h.habitacionId ? (
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-pino-200 bg-pino-100/60 px-3.5 py-2.5">
                <b className="font-heading text-[22px] text-pino-800">{h.numero}</b>
                <span>
                  <b>{h.tipo}</b> · Piso {h.piso} · capacidad {h.capacidad}
                </span>
                <span className="flex-1" />
                {(() => {
                  // Precio de la ocupación actual (la consulta vigente incluye a la habitación elegida).
                  const actual = opciones.find((o) => o.id === h.habitacionId) ?? h;
                  const precio = estado.planCodigo ? precioDe(actual, estado.planCodigo) : null;
                  return precio != null ? <b>{formatearPrecio(precio)}</b> : null;
                })()}
                <Button variante="secundario" onClick={() => dispatch({ tipo: "elegirHabitacion", clave: h.clave, habitacion: null })}>
                  Cambiar
                </Button>
              </div>
            ) : consulta?.isLoading ? (
              <p className="text-[13px] text-piedra">Buscando habitaciones libres…</p>
            ) : opciones.length === 0 ? (
              <p className="text-[13px] text-piedra">No hay habitaciones libres donde entre esta ocupación.</p>
            ) : (
              porTipo.map((grupo) => (
                <div key={grupo.tipo} className="mt-2">
                  <b className="text-[14px]">{grupo.tipo}</b>
                  <div className="mt-1.5 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
                    {grupo.habitaciones.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-borde bg-white px-3 py-2">
                        <span>
                          <b>{o.numero}</b> <span className="text-[12.5px] text-piedra">Piso {o.piso} · cap. {o.capacidad}</span>
                          {estado.planCodigo && precioDe(o, estado.planCodigo) != null && (
                            <span className="block font-semibold">{formatearPrecio(precioDe(o, estado.planCodigo))}</span>
                          )}
                        </span>
                        <Button
                          variante="secundario"
                          tamano="fila"
                          aria-label={`Elegir la habitación ${o.numero} para la habitación ${i + 1}`}
                          onClick={() => dispatch({ tipo: "elegirHabitacion", clave: h.clave, habitacion: o })}
                        >
                          Elegir
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })}
    </Tarjeta>
  );
}
