import { MovimientoEntradaForm } from "./MovimientoEntradaForm";

export function MovimientoEntradaPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Movimiento de Entrada</h1>
        <p className="text-sm text-piedra">Registrar ingreso de insumos a un depósito.</p>
      </div>
      <MovimientoEntradaForm />
    </div>
  );
}
