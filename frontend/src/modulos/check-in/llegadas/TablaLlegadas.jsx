import { Search } from "lucide-react";
import { formatearDiaCorto } from "../../../lib/fechas";
import { formatearPrecio } from "../../../lib/moneda";
import { etiquetaOcupacion } from "../checkInReglas";
import { Chip, Tarjeta } from "../ui";

export function textoSenia(senia) {
  const medios = senia?.medios ?? [];
  if (!senia?.registrada || medios.length === 0) return null;
  return medios.map((m) => m.referencia || `${m.medioPago} · ${formatearPrecio(m.importe)}`).join(" · ");
}

const estadia = (r) => `${formatearDiaCorto(r.fechaDesde)} → ${formatearDiaCorto(r.fechaHasta)} · ${r.noches} ${r.noches === 1 ? "noche" : "noches"}`;

// Llegadas de hoy: un clic (o Enter) abre el check-in debajo. Flechas arriba/abajo recorren la lista.
export function TablaLlegadas({ busqueda, onBuscar, consulta, seleccionadaId, onSeleccionar }) {
  const reservas = consulta.data?.reservas ?? [];
  const anteriores = consulta.data?.anterioresPendientes ?? 0;
  const moverFoco = (e, paso) => {
    const filas = [...e.currentTarget.parentElement.querySelectorAll("tr[data-reserva]")];
    const indice = filas.indexOf(e.currentTarget);
    filas[indice + paso]?.focus();
  };
  return (
    <Tarjeta
      titulo="Llegadas de hoy"
      accion={
        <label className="flex min-w-[320px] items-center gap-2 rounded-md border border-borde bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-pino/40">
          <Search size={16} className="text-piedra" aria-hidden="true" />
          <span className="sr-only">Buscar por código, nombre o documento</span>
          <input
            value={busqueda}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Código, nombre o documento"
            className="w-full bg-transparent text-[14px] focus:outline-none"
          />
        </label>
      }
    >
      {anteriores > 0 && (
        <p role="note" className="mb-3 rounded-md border border-laton-300 bg-laton-100 px-4 py-2 text-[13.5px] text-laton-700">
          Hay {anteriores} {anteriores === 1 ? "reserva" : "reservas"} de días anteriores sin ingreso (posible no-show). Se gestiona desde Reservas.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14.5px]">
          <thead>
            <tr>
              {["Código", "Titular", "Habitación", "Estadía", "Ocupación", "Garantía", "Estado"].map((t) => (
                <th key={t} scope="col" className="border-b border-borde px-2.5 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-piedra">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consulta.isLoading && (
              <tr>
                <td colSpan={7} className="px-2.5 py-3 text-[13px] text-piedra">
                  Buscando llegadas…
                </td>
              </tr>
            )}
            {!consulta.isLoading && reservas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2.5 py-3 text-[13px] text-piedra">
                  {busqueda ? `No hay llegadas de hoy que coincidan con “${busqueda}”.` : "No hay llegadas pendientes para hoy."}
                </td>
              </tr>
            )}
            {reservas.map((r) => {
              const adultos = r.habitaciones.reduce((a, h) => a + h.adultos, 0);
              const menores = r.habitaciones.reduce((a, h) => a + h.menores, 0);
              const senia = textoSenia(r.senia);
              const seleccionada = r.id === seleccionadaId;
              return (
                <tr
                  key={r.id}
                  data-reserva={r.id}
                  tabIndex={0}
                  aria-selected={seleccionada}
                  onClick={() => onSeleccionar(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSeleccionar(r);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      moverFoco(e, 1);
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      moverFoco(e, -1);
                    }
                  }}
                  className={`cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pino ${seleccionada ? "bg-pino-100" : "hover:bg-hueso"}`}
                >
                  <td className="border-b border-borde px-2.5 py-[11px] font-mono font-semibold">{r.codigoConfirmacion}</td>
                  <td className="border-b border-borde px-2.5 py-[11px]">{r.titular?.nombre}</td>
                  <td className="border-b border-borde px-2.5 py-[11px]">{r.habitaciones.map((h) => `${h.numero} ${h.tipo}`).join(" + ")}</td>
                  <td className="border-b border-borde px-2.5 py-[11px]">{estadia(r)}</td>
                  <td className="border-b border-borde px-2.5 py-[11px]">{etiquetaOcupacion(adultos, menores)}</td>
                  <td className="border-b border-borde px-2.5 py-[11px]">
                    {senia ? <Chip variante="ok">{senia}</Chip> : <Chip variante="aviso">Sin garantía · tomar al ingreso</Chip>}
                  </td>
                  <td className="border-b border-borde px-2.5 py-[11px]">
                    <Chip variante="ok">Por llegar</Chip>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}
