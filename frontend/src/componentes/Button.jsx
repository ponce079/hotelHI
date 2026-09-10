// Jerarquía de 5 tipos (auditoría de botones, 2026-09): primario relleno
// solido pino (una sola por pantalla/modal), secundario con borde sin
// relleno, fantasma sin borde con texto gris (navegacion/bajo compromiso),
// destructivo con borde/texto en color error (exclusivo de Anular/Rechazar/
// Eliminar, nunca reusado para otra cosa), e icono (fuera de este
// componente, ver MenuAcciones). "ok"/"salida"/"transfer"/"kardex"/"alta"
// siguen existiendo como matices de color dentro de "primario"/"secundario"
// para acciones con semantica propia (entrada/salida de stock, habilitar) —
// no son variantes nuevas de la jerarquia, son el mismo rol con otro hue.
// Un ConfirmDialog hereda la variante del boton que lo abrio.
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
  // Destructivo — Anular/Rechazar/Eliminar, nunca para otra cosa. Contorno,
  // no relleno (antes "baja" era un tinte bg-error-suave): baja el peso
  // visual para que en una fila con Editar + Anular, Anular no compita en
  // peso con el primario de la pantalla.
  destructivo: "border-error bg-transparent text-error-texto hover:bg-error-suave",
  // Fantasma — navegacion y acciones de bajo compromiso (Ver detalle, Ver
  // historial, Volver, Limpiar filtros). Sin borde, texto gris; se acerca
  // al tinta solo en hover, igual que el resto de los "solo texto" ad-hoc
  // que reemplaza.
  fantasma: "border-transparent bg-transparent text-piedra hover:bg-hueso hover:text-tinta",
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

// `icono` es opcional (default undefined, no cambia ningun uso existente):
// un componente de icono de lucide-react (ej. `Save`, no `<Save />`), se
// renderiza a 16px a la izquierda del texto. Sin color propio — hereda
// currentColor de la variante, como ya hacen los iconos que algunos
// botones traian sueltos como children. Las flechas de navegacion
// (Siguiente →, Volver ←) NO usan esta prop: "→" sigue siendo un child
// final a mano (convencion ya establecida, ver auditoria de botones) y
// "←" (Volver) va como `icono` porque ahi si cae al principio.
export function Button({ variante = "ok", tamano = "normal", icono: Icono, className = "", children, ...props }) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border font-heading font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TAMANOS[tamano]} ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {Icono && <Icono size={16} className="flex-none" />}
      {children}
    </button>
  );
}
