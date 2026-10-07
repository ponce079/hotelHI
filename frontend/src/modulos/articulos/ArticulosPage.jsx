import { ArticulosLista } from "./ArticulosLista";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";

export function ArticulosPage() {
  const { puede } = useSesion();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Artículos</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          ABM del catálogo maestro, con habilitación opcional en depósitos
        </p>
      </div>
      {puede("abmArticulo") ? <ArticulosLista /> : <SinPermiso />}
    </div>
  );
}
