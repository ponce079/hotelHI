import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./componentes/Layout";
import { ArticulosPage } from "./modulos/articulos/ArticulosPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/articulos" replace />} />
        <Route path="/articulos" element={<ArticulosPage />} />
      </Route>
    </Routes>
  );
}
