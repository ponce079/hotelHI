import { StockLista } from "./StockLista";

export function StockPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Stock</h1>
        <p className="text-sm text-piedra">Disponibilidad actual de insumos por artículo y depósito.</p>
      </div>
      <StockLista />
    </div>
  );
}
