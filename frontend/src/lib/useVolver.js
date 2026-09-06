import { useNavigate } from "react-router-dom";

// Se llega a una ficha de detalle (OC, Orden de Pago, Comprobante) desde
// más de un lugar — su propio listado, o el historial/cuenta corriente
// de un proveedor — así que "volver" no puede ser una ruta fija: tiene
// que devolver a la pantalla de origen tal como estaba (filtros, pestaña,
// etc.). navigate(-1) hace exactamente eso. Si no hay historia propia de
// la app (entrada directa por URL, sin nada para volver atrás), cae a
// `rutaFallback`.
export function useVolver(rutaFallback) {
  const navigate = useNavigate();
  return function volver() {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(rutaFallback);
  };
}
