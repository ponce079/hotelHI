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
import { OrdenPagoDetallePage } from "./modulos/pagos/OrdenPagoDetallePage";
import { CuentaCorrientePage } from "./modulos/cuenta-corriente/CuentaCorrientePage";
import { OrdenesCompraPage } from "./modulos/ordenes-compra/OrdenesCompraPage";
import { OrdenCompraDetallePage } from "./modulos/ordenes-compra/OrdenCompraDetallePage";
import { RecepcionOCPage } from "./modulos/ordenes-compra/RecepcionOCPage";

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
          <Route path="/pagos" element={<PagosPage />} />
          <Route path="/pagos/:id" element={<OrdenPagoDetallePage />} />
          <Route path="/cuenta-corriente" element={<CuentaCorrientePage />} />
          <Route path="/ordenes-compra" element={<OrdenesCompraPage />} />
          <Route path="/ordenes-compra/:id" element={<OrdenCompraDetallePage />} />
          <Route path="/ordenes-compra/:id/recepcion" element={<RecepcionOCPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
