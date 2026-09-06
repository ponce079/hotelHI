import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Layout } from "./componentes/Layout";
import { LoginPage } from "./modulos/login/LoginPage";
import { useSesion } from "./lib/sesion";
import { DashboardPage } from "./modulos/dashboard/DashboardPage";
import { AlertasPage } from "./modulos/alertas/AlertasPage";
import { ArticulosPage } from "./modulos/articulos/ArticulosPage";
import { DepositosPage } from "./modulos/depositos/DepositosPage";
import { DepositoDetallePage } from "./modulos/depositos/DepositoDetallePage";
import { StockPage } from "./modulos/stock/StockPage";
import { MinMaxPage } from "./modulos/stock/MinMaxPage";
import { TiposMovimientoPage } from "./modulos/tipos-movimiento/TiposMovimientoPage";
import { MovimientosPage } from "./modulos/movimientos/MovimientosPage";
import { RecepcionesPage } from "./modulos/recepciones/RecepcionesPage";
import { KardexPage } from "./modulos/kardex/KardexPage";
import { ReportePage } from "./modulos/reporte/ReportePage";
import { PagosPage } from "./modulos/pagos/PagosPage";
import { CuentaCorrientePage } from "./modulos/cuenta-corriente/CuentaCorrientePage";
import { OrdenesCompraPage } from "./modulos/ordenes-compra/OrdenesCompraPage";
import { OrdenCompraDetallePage } from "./modulos/ordenes-compra/OrdenCompraDetallePage";
import { RecepcionOCPage } from "./modulos/ordenes-compra/RecepcionOCPage";
import { ProveedoresPage } from "./modulos/proveedores/ProveedoresPage";
import { ProveedorDetallePage } from "./modulos/proveedores/ProveedorDetallePage";
import { RequerimientosPage } from "./modulos/requerimientos/RequerimientosPage";
import { RequerimientoDetallePage } from "./modulos/requerimientos/RequerimientoDetallePage";
import { PresupuestosPage } from "./modulos/presupuestos/PresupuestosPage";
import { PresupuestoDetallePage } from "./modulos/presupuestos/PresupuestoDetallePage";
import { ComprobantesPage } from "./modulos/comprobantes/ComprobantesPage";
import { ComprobanteDetalle } from "./modulos/comprobantes/ComprobanteDetalle";

// Gatekeeper de rutas: sin sesion (sin rol elegido en el login), redirige
// a /login. No es autenticacion real contra el backend — ver lib/sesion.jsx.
function RequireSesion() {
  const { rol } = useSesion();
  if (!rol) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireSesion />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/articulos" element={<ArticulosPage />} />
          <Route path="/alertas" element={<AlertasPage />} />
          <Route path="/depositos" element={<DepositosPage />} />
          <Route path="/depositos/:id" element={<DepositoDetallePage />} />
          <Route path="/tipos-movimiento" element={<TiposMovimientoPage />} />
          <Route path="/movimientos" element={<MovimientosPage />} />
          <Route path="/recepciones" element={<RecepcionesPage />} />
          <Route path="/kardex" element={<KardexPage />} />
          <Route path="/reporte" element={<ReportePage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/stock/minmax" element={<MinMaxPage />} />
          {/* El detalle de una orden de pago es un modal sobre PagosPage
              (y, para "Pago", sobre Cuenta Corriente/ficha de proveedor),
              no una ruta propia — mismo criterio que Comprobantes. */}
          <Route path="/pagos" element={<PagosPage />} />
          <Route path="/cuenta-corriente" element={<CuentaCorrientePage />} />
          <Route path="/ordenes-compra" element={<OrdenesCompraPage />} />
          <Route path="/ordenes-compra/:id" element={<OrdenCompraDetallePage />} />
          <Route path="/ordenes-compra/:id/recepcion" element={<RecepcionOCPage />} />
          {/* Sprint 2 — Proveedores, Requerimientos y Presupuestos (HU-18 a 21, 81 a 84). */}
          <Route path="/proveedores" element={<ProveedoresPage />} />
          <Route path="/proveedores/:id" element={<ProveedorDetallePage />} />
          <Route path="/requerimientos" element={<RequerimientosPage />} />
          <Route path="/requerimientos/:id" element={<RequerimientoDetallePage />} />
          <Route path="/presupuestos" element={<PresupuestosPage />} />
          <Route path="/presupuestos/:id" element={<PresupuestoDetallePage />} />
          {/* Sprint 2 — Comprobantes (HU-72 a 75): el alta de factura y de
              nota son modales sobre ComprobantesPage, no rutas propias. */}
          <Route path="/comprobantes" element={<ComprobantesPage />} />
          <Route path="/comprobantes/:id" element={<ComprobanteDetalle />} />
        </Route>
      </Route>
    </Routes>
  );
}
