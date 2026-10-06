import { Button } from "./Button";
import { useCerrarConEsc } from "./useCerrarConEsc";

// `children` es opcional (default nada, no cambia ningún uso existente) —
// contenido libre entre el mensaje y los botones, ej. un campo extra que
// hace falta completar antes de confirmar (ver "Adjudicar" en
// ComparacionPresupuestosPage, que agrega un textarea de comentario opcional).
//
// `cargando` (default false, no rompe ningún uso existente): mientras es
// true, el botón de confirmar muestra el spinner de <Button> y se
// deshabilita solo, y además se bloquea Cancelar y el click en el fondo
// para cerrar — así no queda una ventana donde alguien cancela justo
// mientras la mutación ya está en curso.
//
// Esc cancela. El clic en el fondo cancela solo en una confirmación simple:
// con `children` suele haber un campo cargándose (motivo, comentario) que
// un clic accidental haría perder.
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  variante = "destructivo",
  // Icono opcional (componente de lucide-react) para el botón de
  // confirmar — mismo mecanismo que Button, ver mapeo de íconos.
  icono,
  cargando = false,
  onConfirmar,
  onCancelar,
  children,
}) {
  const overlayRef = useCerrarConEsc(abierto && !cargando, onCancelar);

  if (!abierto) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/45 p-5"
      onClick={(e) => { if (e.target === e.currentTarget && !cargando && !children) onCancelar(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="font-heading text-[20px] font-semibold text-tinta">{titulo}</h3>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-tinta">{mensaje}</p>
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variante="secundario" disabled={cargando} onClick={onCancelar}>Cancelar</Button>
          <Button variante={variante} icono={icono} cargando={cargando} onClick={onConfirmar}>{textoConfirmar}</Button>
        </div>
      </div>
    </div>
  );
}
