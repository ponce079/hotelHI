import { MenuAcciones } from "../../../componentes/MenuAcciones";
import { pendientesParaIngreso } from "../../estadia/validarOcupante";

/**
 * Acciones de una persona según el estado de la reserva y el de su ficha. Son las del panel anterior
 * (editar o completar, verificar, ingresar, cancelar ingreso, mover, cambiar titular, salida), ahora
 * dentro de un menú ⋯. Devuelve la lista para <MenuAcciones>; vacía si no hay nada que hacer.
 */
function accionesDePersona({ persona: p, reserva, estadia, esTitularDeLaReserva }) {
  if (reserva.estado === "Cerrada") return [{ label: "Ver ficha", onClick: () => estadia.setVerFicha?.(p) }];
  if (!estadia.puedeEditar) return [];
  const enCurso = reserva.estado === "En curso";
  const ocupada = estadia.mutation.isPending;
  const faltantes = pendientesParaIngreso(p).length;
  const acciones = [];
  if (["Previsto", "Alojado"].includes(p.estado)) {
    acciones.push({ label: faltantes ? "Completar datos" : "Editar ficha", onClick: () => estadia.abrirEditor(p) });
    if (!p.verificadoEn)
      acciones.push({
        label: "Marcar documento verificado",
        disabled: ocupada || faltantes > 0,
        onClick: () => estadia.mutation.mutate({ tipo: "verificar", data: p }),
      });
  }
  // Cambiar titular de la habitación: abre la ficha con la casilla "Titular de esta habitación"
  // marcada (el formulario pide el motivo y reemplaza al titular actual).
  if (["Previsto", "Alojado"].includes(p.estado) && !p.esTitular && !esTitularDeLaReserva)
    acciones.push({ label: "Cambiar titular", onClick: () => estadia.abrirEditor({ ...p, esTitular: true }) });
  if (p.estado === "Previsto" && enCurso)
    acciones.push({
      label: "Registrar ingreso",
      disabled: !p.verificadoEn || ocupada,
      onClick: () => estadia.mutation.mutate({ tipo: "ingresar", data: p }),
    });
  if (p.estado === "Previsto")
    acciones.push({
      label: "Cancelar ingreso",
      disabled: ocupada,
      onClick: () => estadia.mutation.mutate({ tipo: "cancelar", data: p }),
    });
  if (p.estado === "Alojado" && enCurso && reserva.habitaciones.length > 1)
    acciones.push({
      label: "Mover a otra habitación",
      disabled: ocupada,
      onClick: () => {
        estadia.setError("");
        estadia.setMoviendo(p);
      },
    });
  if (p.estado === "Alojado")
    acciones.push({ label: "Registrar salida", separador: true, disabled: ocupada, onClick: () => estadia.setSaliendo(p) });
  return acciones;
}

export function MenuPersona(props) {
  const { persona } = props;
  const acciones = accionesDePersona(props);
  if (!acciones.length) return null;
  return <MenuAcciones etiqueta={`Acciones de ${persona.nombre} ${persona.apellido}`.trim()} acciones={acciones} />;
}
