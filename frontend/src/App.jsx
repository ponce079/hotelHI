import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./componentes/Layout";
import { ArticulosPage } from "./modulos/articulos/ArticulosPage";
import { DepositosPage } from "./modulos/depositos/DepositosPage";
import { ArticuloDepositoPage } from "./modulos/articulo-deposito/ArticuloDepositoPage";
import { StockPage } from "./modulos/stock/StockPage";
import { TiposMovimientoPage } from "./modulos/tipos-movimiento/TiposMovimientoPage";
import { MovimientosPage } from "./modulos/movimientos/MovimientosPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/articulos" replace />} />
        <Route path="/articulos" element={<ArticulosPage />} />
        <Route path="/depositos" element={<DepositosPage />} />
        <Route path="/articulos-depositos" element={<ArticuloDepositoPage />} />
        <Route path="/tipos-movimiento" element={<TiposMovimientoPage />} />
        <Route path="/movimientos" element={<MovimientosPage />} />
        <Route path="/stock" element={<StockPage />} />
      </Route>
    </Routes>
  );
}
