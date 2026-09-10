import { FilterX } from "lucide-react";
import { Button } from "./Button";

// Mismo botón en todas las pantallas con filtros (Proveedores,
// Requerimientos, Presupuestos, Órdenes de Compra, y el propio FilterBar
// vía su prop `onClear`) — auditoría de botones P3.1: antes había tres
// implementaciones visualmente casi idénticas de este mismo botón
// fantasma; esta es la única ahora.
export function LimpiarFiltros({ onClick }) {
  return (
    <Button type="button" variante="fantasma" tamano="fila" onClick={onClick} className="hover:text-error" icono={FilterX}>
      Limpiar filtros
    </Button>
  );
}
