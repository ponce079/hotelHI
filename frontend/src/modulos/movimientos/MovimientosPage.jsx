import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PackagePlus, PackageMinus, ArrowLeftRight } from "lucide-react";
import { MovimientosLista } from "./MovimientosLista";
import { MovimientoFormPage } from "./MovimientoFormPage";
import { TipoMovimientoForm } from "../tipos-movimiento/TipoMovimientoForm";
import { TiposMovimientoLista } from "../tipos-movimiento/TiposMovimientoLista";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";

const TABS = [
  { valor: "registro", label: "Movimientos registrados" },
  { valor: "tipos", label: "Tipos de movimiento" },
];

export function MovimientosPage() {
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("registro");
  // Llega precargado cuando se entra desde el acceso rápido de Inicio
  // (navigate("/movimientos", { state: { modoForm: "E" } })).
  const [modoForm, setModoForm] = useState(() => location.state?.modoForm ?? null); // "E" | "S" | "transfer" | null

  useEffect(() => {
    if (location.state?.modoForm) {
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (modoForm) {
    return (
      <>
        <MovimientoFormPage
          modo={modoForm}
          onVolver={() => setModoForm(null)}
          onExito={(mensaje) => {
            setModoForm(null);
            mostrarToast(mensaje);
          }}
        />
        <Toast mensaje={toast} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Movimientos</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 10 a 16 — tipos de movimiento, entradas, salidas y transferencias
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex overflow-hidden rounded-full border border-borde">
          {TABS.map((t) => (
            <button
              key={t.valor}
              type="button"
              onClick={() => setTab(t.valor)}
              className={`cursor-pointer whitespace-nowrap px-[18px] py-[9px] font-body text-[12.5px] ${
                tab === t.valor ? "bg-pino text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "registro" && puede("operar") && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variante="ok" onClick={() => setModoForm("E")}>
              <PackagePlus size={16} /> Registrar entrada
            </Button>
            <Button variante="salida" onClick={() => setModoForm("S")}>
              <PackageMinus size={16} /> Registrar salida
            </Button>
            <Button variante="transfer" onClick={() => setModoForm("transfer")}>
              <ArrowLeftRight size={16} /> Nueva transferencia
            </Button>
          </div>
        )}
      </div>

      {tab === "registro" && <MovimientosLista />}
      {tab === "tipos" && (
        <div className="flex flex-col gap-6">
          <TipoMovimientoForm />
          <TiposMovimientoLista />
        </div>
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
