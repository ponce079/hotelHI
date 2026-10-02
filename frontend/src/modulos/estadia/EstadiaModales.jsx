import { Modal } from "../../componentes/Modal";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { Button } from "../../componentes/Button";
import { Input } from "../../componentes/Input";
import { PersonaFormulario } from "./PersonaFormulario";
import { MoverHabitacion } from "./MoverHabitacion";
import { PersonaAdicionalPrevia } from "./PersonaAdicionalPrevia";
import { FichaSoloLectura } from "./FichaSoloLectura";
import { mensajeSalida, moneda } from "./estadiaUtils";

// Ventanas de los flujos de la estadía (ficha, mover, persona adicional, salida y anular cargo).
// Reciben el objeto que devuelve useEstadia; el comportamiento es el del EstadiaPanel anterior.
export function EstadiaModales({ estadia }) {
  const {
    reserva,
    listado,
    titularExistente,
    editor,
    setEditor,
    moviendo,
    setMoviendo,
    adicional,
    setAdicional,
    saliendo,
    setSaliendo,
    verFicha,
    setVerFicha,
    anular,
    setAnular,
    motivo,
    setMotivo,
    mutation,
    error,
    erroresServidor,
    refrescar,
  } = estadia;
  return (
    <>
      {editor && (
        <Modal
          titulo={editor.id ? "Editar ocupante" : "Agregar ocupante"}
          onClose={() => setEditor(null)}
          ancho="max-w-3xl"
        >
          <PersonaFormulario
            esTitular={editor.id != null && editor.id === titularExistente?.id}
            persona={editor}
            reserva={reserva}
            personas={listado}
            erroresServidor={erroresServidor}
            error={error}
            pendiente={mutation.isPending}
            onClose={() => setEditor(null)}
            onGuardar={(data) => mutation.mutate({ tipo: "guardar", data })}
          />
        </Modal>
      )}
      {moviendo && (
        <Modal titulo="Mover a otra habitación" onClose={() => setMoviendo(null)}>
          <MoverHabitacion
            persona={moviendo}
            reserva={reserva}
            personas={listado}
            onClose={() => setMoviendo(null)}
            onMovida={() => {
              setMoviendo(null);
              refrescar();
            }}
          />
        </Modal>
      )}
      {verFicha && (
        <Modal titulo="Ficha del huésped" onClose={() => setVerFicha(null)}>
          <FichaSoloLectura persona={verFicha} reserva={reserva} personas={listado} onClose={() => setVerFicha(null)} />
        </Modal>
      )}
      {adicional && (
        <Modal titulo="Persona adicional" onClose={() => setAdicional(null)}>
          <PersonaAdicionalPrevia
            vista={adicional.vista}
            nombre={`${adicional.variables.data.nombre ?? ""} ${adicional.variables.data.apellido ?? ""}`.trim()}
            pendiente={mutation.isPending}
            onCancelar={() => setAdicional(null)}
            onConfirmar={() =>
              mutation.mutate({
                ...adicional.variables,
                data: { ...adicional.variables.data, confirmacionPersonaAdicional: adicional.vista.token },
              })
            }
          />
        </Modal>
      )}
      <ConfirmDialog
        abierto={Boolean(saliendo)}
        titulo={`Registrar salida de ${saliendo ? `${saliendo.nombre} ${saliendo.apellido}`.trim() : ""}`}
        mensaje={mensajeSalida(saliendo, reserva)}
        textoConfirmar="Registrar salida"
        variante="ok"
        cargando={mutation.isPending}
        onCancelar={() => setSaliendo(null)}
        onConfirmar={() => mutation.mutate({ tipo: "retirar", data: saliendo })}
      />
      {anular && (
        <Modal titulo="Anular cargo" onClose={() => setAnular(null)}>
          <div className="space-y-3 p-5">
            <p>
              Se anula el cargo de {moneda(anular.monto)}. El producto consumido no vuelve automáticamente al
              stock.
            </p>
            <Input label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
            {error && <p role="alert">{error}</p>}
            <Button
              disabled={!motivo.trim()}
              cargando={mutation.isPending}
              onClick={() => mutation.mutate({ tipo: "anular" })}
            >
              Confirmar anulación
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
