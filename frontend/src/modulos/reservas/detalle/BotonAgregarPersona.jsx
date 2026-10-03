import { UserPlus } from "lucide-react";
import { Button } from "../../../componentes/Button";

// "Agregar persona": solo con la estadía en curso y mientras se puede editar. Queda deshabilitado
// hasta que se recuperó al titular y el listado de ocupantes (no se puede dar de alta a otra persona
// antes de eso).
export function BotonAgregarPersona({ estadia, reserva }) {
  if (!estadia.puedeEditar || reserva.estado !== "En curso") return null;
  return (
    <Button
      tamano="fila"
      variante="secundario"
      icono={UserPlus}
      disabled={!estadia.personas.isSuccess || estadia.cargandoPersonas || estadia.preparandoTitular}
      onClick={() => estadia.abrirEditor({})}
    >
      Agregar persona
    </Button>
  );
}
