import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cotizar } from "./ecommerce.api";
import { CODIGO_ERROR } from "./ecommerce.constantes";
import { useProcesoCompra } from "./ProcesoCompraContext";

// "Elegir" (resultados) y "Reservar" (detalle del tipo): cotiza la selección
// contra /api/web/cotizar (el mismo cálculo que hará el alta) y, si sale
// bien, guarda tipo, plan y cotización en el contexto y sigue a /web/datos.
//   - Sin doble envío: mientras cotiza, `cotizando` tiene la clave
//     "tipo:plan" y cualquier otro clic se ignora.
//   - SIN_DISPONIBILIDAD: refresca la disponibilidad y deja `agotado` con el
//     nombre del tipo ("Ese tipo se agotó para tus fechas").
//   - DATOS_INVALIDOS (mensaje seguro del motor: estadía mínima, cierre a
//     llegadas…): queda en `errorPorTipo` para mostrarlo en esa tarjeta.
//   - Cualquier otro error: `errorGeneral`.
export function useElegirPlan(busqueda) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { elegirPlan, actualizarCotizacion } = useProcesoCompra();
  const enCurso = useRef(false);
  const [cotizando, setCotizando] = useState(null);
  const [errorPorTipo, setErrorPorTipo] = useState({});
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [agotado, setAgotado] = useState(null);

  async function elegir(tipo, plan) {
    if (enCurso.current || !busqueda) return;
    enCurso.current = true;
    setCotizando(`${tipo.tipoHabitacionId}:${plan.planTarifarioId}`);
    setErrorPorTipo({});
    setErrorGeneral(null);
    setAgotado(null);
    try {
      const cotizacion = await cotizar({
        fechaDesde: busqueda.fechaDesde,
        fechaHasta: busqueda.fechaHasta,
        planTarifarioId: plan.planTarifarioId,
        habitaciones: [{ tipoHabitacionId: tipo.tipoHabitacionId, adultos: busqueda.adultos, menores: busqueda.menores }],
      });
      elegirPlan(tipo, plan);
      actualizarCotizacion(cotizacion);
      navigate("/web/datos");
    } catch (err) {
      if (err?.codigo === CODIGO_ERROR.SIN_DISPONIBILIDAD) {
        setAgotado(tipo.nombre);
        await queryClient.invalidateQueries({ queryKey: ["ecommerce", "disponibilidad"] });
      } else if (err?.codigo === CODIGO_ERROR.DATOS_INVALIDOS) {
        setErrorPorTipo({ [tipo.tipoHabitacionId]: err.mensaje });
      } else {
        setErrorGeneral(err);
      }
    } finally {
      enCurso.current = false;
      setCotizando(null);
    }
  }

  return { elegir, cotizando, errorPorTipo, errorGeneral, agotado };
}
