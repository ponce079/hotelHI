import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./componentes/Layout";
import { ArticulosPage } from "./modulos/articulos/ArticulosPage";
import { DepositosPage } from "./modulos/depositos/DepositosPage";
import { ArticuloDepositoPage } from "./modulos/articulo-deposito/ArticuloDepositoPage";
import { StockPage } from "./modulos/stock/StockPage";
import { MovimientoEntradaPage } from "./modulos/movimiento-entrada/MovimientoEntradaPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/articulos" replace />} />
        <Route path="/articulos" element={<ArticulosPage />} />
        <Route path="/depositos" element={<DepositosPage />} />
        <Route path="/articulos-depositos" element={<ArticuloDepositoPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/movimiento-entrada" element={<MovimientoEntradaPage />} />
      </Route>
    </Routes>
  );
}
