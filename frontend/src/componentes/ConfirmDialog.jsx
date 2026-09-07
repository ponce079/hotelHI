import { Button } from "./Button";

// `children` es opcional (default nada, no cambia ningún uso existente) —
// contenido libre entre el mensaje y los botones, ej. un campo extra que
// hace falta completar antes de confirmar (ver "Adjudicar" en
// ComparacionPresupuestosPage, que agrega un textarea de comentario opcional).
export function ConfirmDialog({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  variante = "baja",
  onConfirmar,
  onCancelar,
  children,
}) {
  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/45 p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="font-heading text-[20px] font-semibold text-tinta">{titulo}</h3>
        <p className="mt-2 font-body text-[13px] leading-relaxed text-tinta">{mensaje}</p>
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variante="secundario" onClick={onCancelar}>Cancelar</Button>
          <Button variante={variante} onClick={onConfirmar}>{textoConfirmar}</Button>
        </div>
      </div>
    </div>
  );
}
