import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../componentes/Button";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { OrdenPagoWizard } from "./OrdenPagoWizard";

export function PagosPage() {
  const { puede } = useSesion();
  const [mostrarWizard, setMostrarWizard] = useState(false);

  // Backend no valida rol todavía (Sprint 3) — este chequeo + <SinPermiso />
  // es lo único que impide entrar por URL directa sin ser "compras".
  if (!puede("registrarPago")) return <SinPermiso />;

  if (mostrarWizard) {
    return <OrdenPagoWizard onVolver={() => setMostrarWizard(false)} onExito={() => setMostrarWizard(false)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Pagos a Proveedores</h1>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">HU 76 a 79, 86 — órdenes de pago y su desglose por medio</p>
        </div>
        <Button variante="ok" onClick={() => setMostrarWizard(true)}>
          <Plus size={16} /> Generar orden de pago
        </Button>
      </div>

      {/* El listado (HU-78) llega en la próxima rama — por ahora solo el alta. */}
      <p className="rounded-[18.4px] border border-dashed border-borde bg-white px-6 py-10 text-center text-sm text-piedra">
        El listado de órdenes de pago todavía no está construido.
      </p>
    </div>
  );
}
