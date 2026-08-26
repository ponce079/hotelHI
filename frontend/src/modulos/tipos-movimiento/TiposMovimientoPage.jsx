import { TipoMovimientoForm } from "./TipoMovimientoForm";
import { TiposMovimientoLista } from "./TiposMovimientoLista";

export function TiposMovimientoPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Tipos de Movimiento</h1>
        <p className="text-sm text-piedra">Catálogo de tipos de movimiento de stock (Entrada / Salida).</p>
      </div>
      <TipoMovimientoForm />
      <TiposMovimientoLista />
    </div>
  );
}
