import { ProveedoresLista } from "./ProveedoresLista";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";

export function ProveedoresPage() {
  const { puede } = useSesion();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Proveedores</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          Padrón de proveedores, rubros y condiciones comerciales
        </p>
      </div>
      {puede("abmProveedor") ? <ProveedoresLista /> : <SinPermiso />}
    </div>
  );
}
