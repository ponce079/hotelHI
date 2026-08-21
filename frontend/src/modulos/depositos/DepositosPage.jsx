import { DepositoForm } from "./DepositoForm";
import { DepositosLista } from "./DepositosLista";

export function DepositosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Depósitos</h1>
        <p className="text-sm text-piedra">Ubicaciones físicas del hotel donde se almacenan los insumos.</p>
      </div>
      <DepositoForm />
      <DepositosLista />
    </div>
  );
}
