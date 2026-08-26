import { useState } from "react";
import { DepositoModal } from "./DepositoModal";
import { DepositosLista } from "./DepositosLista";
import { Toast } from "../../componentes/Toast";
import { useToast } from "../../lib/useToast";

export function DepositosPage() {
  const { toast, mostrarToast } = useToast();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [depositoEditando, setDepositoEditando] = useState(null);

  function abrirNuevo() {
    setDepositoEditando(null);
    setModalAbierto(true);
  }

  function abrirEditar(deposito) {
    setDepositoEditando(deposito);
    setModalAbierto(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Depósitos y Stock</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 3, 4, 5 y 6 — depósitos con sus artículos habilitados y su stock
        </p>
      </div>

      <DepositosLista onEditar={abrirEditar} onNuevo={abrirNuevo} />

      {modalAbierto && (
        <DepositoModal
          deposito={depositoEditando}
          onClose={() => setModalAbierto(false)}
          onExito={(mensaje) => {
            setModalAbierto(false);
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
