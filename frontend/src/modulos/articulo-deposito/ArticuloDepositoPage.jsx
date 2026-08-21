import { ArticuloDepositoForm } from "./ArticuloDepositoForm";
import { ArticuloDepositoLista } from "./ArticuloDepositoLista";

export function ArticuloDepositoPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Artículos por Depósito</h1>
        <p className="text-sm text-piedra">Habilitación de artículos del catálogo en cada depósito del hotel.</p>
      </div>
      <ArticuloDepositoForm />
      <ArticuloDepositoLista />
    </div>
  );
}
