import { StockLista } from "./StockLista";

export function StockPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Control de Stock</h1>
        <p className="text-sm text-piedra">Stock actual de cada artículo por depósito.</p>
      </div>
      <StockLista />
    </div>
  );
}
