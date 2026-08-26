import { useEffect, useState } from "react";

// Extraido del patron duplicado en ArticulosLista/DepositoForm/MovimientoForm/
// TipoMovimientoForm: un mensaje que se autolimpia a los 3s. `mostrarToast`
// es un alias de `setToast` para que el codigo existente que ya llama
// `mostrarToast(texto)` se pueda migrar sin cambiar su forma de uso.
export function useToast() {
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, mostrarToast: setToast };
}
