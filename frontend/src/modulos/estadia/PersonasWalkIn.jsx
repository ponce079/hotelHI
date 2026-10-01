import { useState } from "react";
import { PersonaFormulario } from "./EstadiaPanel";
import { Modal } from "../../componentes/Modal";
import { Button } from "../../componentes/Button";
export function PersonasWalkIn({ reserva, personas, onChange }) {
  const [editor, setEditor] = useState(null);
  return (
    <div className="space-y-3 rounded border border-borde p-4">
      <h3 className="font-semibold">Personas que ingresan</h3>
      <p className="text-sm text-piedra">
        Cargá a todos los ocupantes, incluido el titular si se aloja. Confirmar
        el check-in verifica estos datos y registra sus ingresos.
      </p>
      {personas.map((p) => (
        <div className="flex justify-between gap-2" key={p.id}>
          <span>
            {p.nombre} {p.apellido} · Hab.{" "}
            {reserva.habitaciones.find((h) => h.id === Number(p.habitacionId))
              ?.numero || "Seleccionar nuevamente"}
          </span>
          <div className="flex gap-2">
            <Button variante="secundario" onClick={() => setEditor(p)}>
              Editar
            </Button>
            <Button
              variante="secundario"
              onClick={() => onChange(personas.filter((x) => x.id !== p.id))}
            >
              Quitar
            </Button>
          </div>
        </div>
      ))}
      <Button variante="secundario" onClick={() => setEditor({})}>
        Agregar persona
      </Button>
      {editor && (
        <Modal
          titulo="Persona alojada"
          onClose={() => setEditor(null)}
          ancho="max-w-3xl"
        >
          <PersonaFormulario
            persona={editor}
            personas={personas}
            reserva={reserva}
            onClose={() => setEditor(null)}
            onGuardar={(p) => {
              onChange(
                editor.id
                  ? personas.map((x) => (x.id === editor.id ? p : x))
                  : [...personas, { ...p, id: Date.now() }],
              );
              setEditor(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
