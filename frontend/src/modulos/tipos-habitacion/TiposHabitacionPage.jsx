import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { TiposHabitacionLista } from "./TiposHabitacionLista";
import { TipoHabitacionModal } from "./TipoHabitacionModal";

// HU-89 — Catálogo de Tipos de Habitación (Etapa 1 de tarifas por
// temporada). verTiposHabitacion: admin, recepcionista, gerente, de solo
// lectura salvo admin. gestionarTiposHabitacion: admin únicamente — alta,
// edición y baja/reactivación.
export function TiposHabitacionPage() {
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const [modal, setModal] = useState(null); // null | { tipo: "crear" } | { tipo: "editar", registro }

  if (!puede("verTiposHabitacion")) return <SinPermiso />;
  const puedeGestionar = puede("gestionarTiposHabitacion");

  function cerrarConExito(mensaje) {
    setModal(null);
    mostrarToast(mensaje);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Tipos de Habitación</h1>
          <p className="text-sm text-piedra">
            Catálogo formal sobre el que se van a definir tarifas y disponibilidad por tipo.
          </p>
        </div>
        {puedeGestionar && (
          <Button icono={Plus} onClick={() => setModal({ tipo: "crear" })}>
            Nuevo tipo
          </Button>
        )}
      </div>

      <TiposHabitacionLista puedeGestionar={puedeGestionar} onEditar={(registro) => setModal({ tipo: "editar", registro })} />

      {modal?.tipo === "crear" && <TipoHabitacionModal tipo={null} onClose={() => setModal(null)} onExito={cerrarConExito} />}
      {modal?.tipo === "editar" && (
        <TipoHabitacionModal tipo={modal.registro} onClose={() => setModal(null)} onExito={cerrarConExito} />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
