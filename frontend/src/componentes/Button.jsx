// Regla de color por accion (guia visual SGH, seccion 4): cada variante es
// un color fijo, no una clase suelta. Entrada = pino solido, salida /
// transferencia = laton, destructivo = rojo suave, secundario = tinte 100
// del rol. Un ConfirmDialog hereda la variante del boton que lo abrio.
const VARIANTES = {
  // Entrada / confirmar / accion primaria — pino solido.
  ok: "border-pino bg-pino text-hueso hover:bg-pino-oscuro",
  // Salida — laton solido.
  salida: "border-laton bg-laton text-hueso hover:bg-laton-oscuro",
  // Abrir una transferencia — laton tinte 100.
  transfer: "border-laton-400 bg-laton-100 text-laton-700 hover:bg-laton-200",
  // Kardex — laton tinte 100, borde mas claro.
  kardex: "border-laton-300 bg-laton-100 text-laton-700 hover:bg-laton-200",
  // Habilitar / reactivar — pino tinte 100.
  alta: "border-pino-300 bg-pino-100 text-pino-700 hover:bg-pino-200",
  // Deshabilitar / dar de baja — rojo suave.
  baja: "border-[#e5c0b7] bg-error-suave text-error-texto hover:bg-[#f0d2c9]",
  // Secundario / cancelar — tinte neutro con borde.
  secundario: "border-borde bg-transparent text-tinta hover:bg-hueso",
};

// El .btn base del prototipo (heredado del sistema "organic" que usa como
// libreria de componentes) define font-family: var(--font-heading) — o sea
// Fraunces, no Sora. No es un capricho nuestro: es el .btn real que
// heredan .btn-entrada/.btn-salida/etc en el dc.html. "normal" 13-14px;
// "fila" 12.5px con padding 5px 13px, para acciones dentro de una fila de
// tabla.
const TAMANOS = {
  normal: "px-4 py-2 text-sm",
  fila: "px-[13px] py-[5px] text-[12.5px]",
};

export function Button({ variante = "ok", tamano = "normal", className = "", ...props }) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border font-heading font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TAMANOS[tamano]} ${VARIANTES[variante]} ${className}`}
      {...props}
    />
  );
}
