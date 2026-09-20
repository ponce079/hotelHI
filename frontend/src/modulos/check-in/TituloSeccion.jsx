// Chip pastel, no solido: fondo = tinte suave del tono, icono = extremo
// oscuro de esa misma rampa (mismo criterio que Badge). Un chip solido con
// icono claro se ve pesado para un simple encabezado de seccion — el peso
// fuerte de color va en el boton/tarjeta de la accion, no en cada titulo.
const TONOS = {
  info: "bg-info-suave text-info-texto",
  laton: "bg-laton-100 text-laton-700",
  pino: "bg-pino-100 text-pino-700",
};

export function TituloSeccion({ icono: Icono, tono = "pino", children }) {
  return (
    <div className="flex items-center gap-2.5 text-[13px] font-semibold text-tinta">
      <span className={`flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] ${TONOS[tono]}`}>
        <Icono size={15} />
      </span>
      {children}
    </div>
  );
}
