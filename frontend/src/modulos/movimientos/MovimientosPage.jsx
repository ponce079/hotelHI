import { MovimientoForm } from "./MovimientoForm";

export function MovimientosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Movimientos de Stock</h1>
        <p className="text-sm text-piedra">Registrar entradas y salidas de artículos en un depósito.</p>
      </div>
      <MovimientoForm />
    </div>
  );
}
