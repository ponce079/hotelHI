import { Navigate } from "react-router-dom";
import { useProcesoCompra } from "./ProcesoCompraContext";

// Guardas de las rutas del proceso de compra (App.jsx):
//   requiere="seleccion"  → /web/datos y /web/pago: sin tipo y plan elegidos,
//                           vuelve a /web. Si la reserva ya se creó, manda a la
//                           confirmación (evita una segunda reserva con "Atrás").
//   requiere="resultado"  → /web/confirmacion: sin resultado, vuelve a /web.
export function GuardaCompra({ requiere, children }) {
  const { tipo, plan, resultado } = useProcesoCompra();
  if (requiere === "seleccion") {
    if (resultado) return <Navigate to="/web/confirmacion" replace />;
    if (!tipo || !plan) return <Navigate to="/web" replace />;
  }
  if (requiere === "resultado" && !resultado) return <Navigate to="/web" replace />;
  return children;
}
