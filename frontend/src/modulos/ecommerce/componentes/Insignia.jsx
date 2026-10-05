// Badge de estado. Mismo significado de color en todo el sitio (guía de
// estilo): verde = OK, dorado = pendiente, rojo = problema, gris = neutro.
const COLOR_POR_ESTADO = {
  Disponible: "verde",
  Confirmada: "verde",
  Pagada: "verde",
  Pendiente: "dorado",
  "Pendiente de pago": "dorado",
  Cancelada: "rojo",
};

export function colorDeEstado(estado) {
  return COLOR_POR_ESTADO[estado] ?? "neutro";
}

// Uso: <Insignia estado="Confirmada" /> o <Insignia color="dorado">Últimas disponibles</Insignia>.
export function Insignia({ estado, color, children, className = "" }) {
  const tono = color ?? colorDeEstado(estado);
  return <span className={`ec-insignia ec-insignia--${tono} ${className}`.trim()}>{children ?? estado}</span>;
}
