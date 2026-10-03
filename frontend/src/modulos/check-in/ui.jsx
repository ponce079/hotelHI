// Piezas visuales chicas de la pantalla de check-in (tarjetas, chips y controles − / +), con los
// tokens del sistema (hueso, pino, latón, piedra).
export function Tarjeta({ titulo, accion, id, children, className = "" }) {
  return (
    <section id={id} tabIndex={id ? -1 : undefined} className={`rounded-lg border border-borde bg-white px-[22px] py-5 focus:outline-none ${className}`}>
      {(titulo || accion) && (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          {titulo && <h2 className="font-heading text-[19px] font-semibold text-tinta">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

const CHIPS = {
  ok: "bg-pino-100 text-pino-700",
  aviso: "bg-laton-100 text-laton-700",
  neutro: "bg-neutro-100 text-neutro-700",
  error: "bg-error-suave text-error-texto",
};

// `envolver`: el texto puede partirse en dos líneas (chips largos dentro de una tabla).
export function Chip({ variante = "neutro", envolver = false, children, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[12.5px] font-semibold ${envolver ? "whitespace-normal rounded-md" : "whitespace-nowrap rounded-full"} ${CHIPS[variante]} ${className}`}
    >
      {children}
    </span>
  );
}

// Control − valor +, con etiquetas accesibles para cada botón.
export function Paso({ valor, onMenos, onMas, menosDeshabilitado, masDeshabilitado, etiquetaMenos, etiquetaMas, ancho = false }) {
  return (
    <div className="flex items-center overflow-hidden rounded-md border border-borde bg-white">
      <button
        type="button"
        onClick={onMenos}
        disabled={menosDeshabilitado}
        aria-label={etiquetaMenos}
        className="h-[38px] w-9 cursor-pointer text-lg text-pino-700 hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino disabled:cursor-not-allowed disabled:bg-transparent disabled:text-piedra/50"
      >
        −
      </button>
      <output className={`${ancho ? "min-w-[150px]" : "min-w-11"} px-1.5 text-center font-semibold`}>{valor}</output>
      <button
        type="button"
        onClick={onMas}
        disabled={masDeshabilitado}
        aria-label={etiquetaMas}
        className="h-[38px] w-9 cursor-pointer text-lg text-pino-700 hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino disabled:cursor-not-allowed disabled:bg-transparent disabled:text-piedra/50"
      >
        +
      </button>
    </div>
  );
}

export function Dato({ titulo, valor, detalle, grande = false }) {
  return (
    <div>
      <small className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-piedra">{titulo}</small>
      <span className={grande ? "font-heading text-[22px] font-semibold" : "font-semibold"}>{valor}</span>
      {detalle && <span className="block text-[13px] text-piedra">{detalle}</span>}
    </div>
  );
}

export const textoAyuda = "text-[13px] text-piedra";
