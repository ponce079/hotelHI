import { Loader2 } from "lucide-react";

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
  // Salida — laton solido. bg/border en laton-700 (no laton-600/--color-laton):
  // laton-600 con texto claro da 4.5:1, apenas arriba del minimo AA — laton-700
  // da 6.6:1 con margen real. Hover un escalon mas oscuro (laton-800), mismo
  // patron que "ok" (pino-700 -> pino-800).
  salida: "border-laton-700 bg-laton-700 text-hueso hover:bg-laton-800",
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

// HU-117: los botones usan la sans de la interfaz (Manrope), no la serif de marca. "normal" 13-14px;
// "fila" 12.5px con padding 5px 13px, para acciones dentro de una fila de
// tabla; "campo" 14px con padding 11px 20px, para un botón al lado de un
// input de altura fija (11px + el 1px de borde del input = misma altura
// exterior que el input, que no tiene borde propio en el botón).
const TAMANOS = {
  normal: "px-4 py-2 text-sm",
  fila: "px-[13px] py-[5px] text-[12.5px]",
  campo: "px-5 py-[11px] text-sm",
};

// `icono` es opcional (default undefined, no cambia ningun uso existente):
// un componente de icono de lucide-react (ej. `Save`, no `<Save />`), se
// renderiza a 16px a la izquierda del texto. Sin color propio — hereda
// currentColor de la variante, como ya hacen los iconos que algunos
// botones traian sueltos como children. Las flechas de navegacion
// (Siguiente →, Volver ←) NO usan esta prop: "→" sigue siendo un child
// final a mano (convencion ya establecida, ver auditoria de botones) y
// "←" (Volver) va como `icono` porque ahi si cae al principio.
//
// `cargando` (default false, no rompe ningun uso existente): mientras es
// true, deshabilita el boton solo (no hace falta pasar disabled a mano)
// y reemplaza el icono por un spinner girando — pensado para el momento
// entre el click y que la mutacion resuelva, asi no se puede volver a
// clickear ni queda ambiguo si el click "prendio". El texto (children) lo
// sigue eligiendo cada pantalla (ej. "Guardando…"), este prop no lo toca.
export function Button({ variante = "ok", tamano = "normal", icono: Icono, cargando = false, className = "", children, disabled, ...props }) {
  return (
    <button
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border font-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${TAMANOS[tamano]} ${VARIANTES[variante]} ${className}`}
      {...props}
    >
      {cargando ? (
        <Loader2 size={16} className="flex-none animate-spin" />
      ) : (
        Icono && <Icono size={16} className="flex-none" />
      )}
      {cargando && typeof children === "string" ? "Procesando…" : children}
    </button>
  );
}
