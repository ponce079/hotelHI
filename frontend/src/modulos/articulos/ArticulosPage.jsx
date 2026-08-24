import { ArticulosLista } from "./ArticulosLista";

export function ArticulosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Artículos</h1>
        <p className="text-sm text-piedra">Catálogo maestro de insumos del hotel.</p>
      </div>
      <ArticulosLista />
    </div>
  );
}
