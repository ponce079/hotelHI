import { StockLista } from "./StockLista";

export function StockPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Control de Stock</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          Consulta de stock por artículo y depósito
        </p>
      </div>
      <StockLista />
    </div>
  );
}
