import { AlojadosPage } from "./modulos/estadia/AlojadosPage";
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
import { HistorialRecepcionesPage } from "./modulos/recepciones/HistorialRecepcionesPage";
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
import { HabitacionesPage } from "./modulos/habitaciones/HabitacionesPage";
import { HabitacionDetallePage } from "./modulos/habitaciones/HabitacionDetallePage";
import { HistorialMantenimientoPage } from "./modulos/habitaciones/HistorialMantenimientoPage";
import { TiposHabitacionPage } from "./modulos/tipos-habitacion/TiposHabitacionPage";
import { PreciosPage } from "./modulos/tarifas/PreciosPage";
import { TemporadasPage } from "./modulos/tarifas/TemporadasPage";
import { CalendarioPage } from "./modulos/tarifas/CalendarioPage";
import { PlanesPage } from "./modulos/tarifas/PlanesPage";
import { ActualizacionesPage } from "./modulos/tarifas/ActualizacionesPage";
import { CotizadorPage } from "./modulos/tarifas/CotizadorPage";
import { ReservasPage } from "./modulos/reservas/ReservasPage";
import { ReservaDetallePage } from "./modulos/reservas/detalle/ReservaDetallePage";
import { DisponibilidadPublicaPage } from "./modulos/reservas/DisponibilidadPublicaPage";
import { ReservaWebPage } from "./modulos/reservas/ReservaWebPage";
import { CheckInPage } from "./modulos/check-in/CheckInPage";
import { ServiciosAdicionalesPage } from "./modulos/servicios-adicionales/ServiciosAdicionalesPage";
import { CheckOutPage } from "./modulos/check-out/CheckOutPage";
import { CheckOutReservaPage } from "./modulos/check-out/CheckOutReservaPage";
import { ComprobantesEstadiaPage } from "./modulos/comprobantes-estadia/ComprobantesEstadiaPage";
import { ComprobanteEstadiaDetallePage } from "./modulos/comprobantes-estadia/ComprobanteEstadiaDetallePage";
import { ReporteCajaDiariaPage } from "./modulos/comprobantes-estadia/ReporteCajaDiariaPage";
import { MovimientosPagoPage } from "./modulos/pagos-estadia/MovimientosPagoPage";
import { UsuariosPage } from "./modulos/usuarios/UsuariosPage";
// Gatekeeper de rutas: sin sesion iniciada (login real con usuario y
// contraseña, ver lib/sesion.jsx), redirige a /login.
function RequireSesion() {
  const { rol } = useSesion();
  if (!rol) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Sprint 3 académico — pantallas del rol "Huésped" (HU-38 y HU-40):
          autoservicio sin sesión de staff, así que van fuera de
          <RequireSesion> igual que /login. Traen su propio envoltorio
          (LayoutPublico), no el menú lateral de <Layout>. */}
      <Route path="/disponibilidad" element={<DisponibilidadPublicaPage />} />
      <Route path="/reservar" element={<ReservaWebPage />} />
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
          <Route path="/recepciones/historial" element={<HistorialRecepcionesPage />} />
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
          {/* Sprint 3 académico — Administración de Habitaciones (HU-31 a HU-35). */}
          <Route path="/habitaciones" element={<HabitacionesPage />} />
          <Route path="/habitaciones/:id" element={<HabitacionDetallePage />} />
          <Route path="/historial-mantenimiento" element={<HistorialMantenimientoPage />} />
          {/* HU-89 — Catálogo de Tipos de Habitación (Etapa 1 de tarifas por temporada). */}
          <Route path="/tipos-habitacion" element={<TiposHabitacionPage />} />
          {/* HU-90 a HU-93 — Tarifas por temporada (Etapa 2): precios es la
              pestaña de aterrizaje ("/tarifas"), las otras 4 son sus rutas
              hermanas, mismo patrón de TarifasTabs.jsx. */}
          <Route path="/tarifas" element={<PreciosPage />} />
          <Route path="/tarifas/temporadas" element={<TemporadasPage />} />
          <Route path="/tarifas/calendario" element={<CalendarioPage />} />
          <Route path="/tarifas/planes" element={<PlanesPage />} />
          <Route path="/tarifas/actualizaciones" element={<ActualizacionesPage />} />
          <Route path="/tarifas/cotizador" element={<CotizadorPage />} />
          {/* Sprint 3 académico — Reservas (HU-36 a HU-42). */}
          <Route path="/reservas" element={<ReservasPage />} />
          <Route path="/reservas/disponibilidad" element={<DisponibilidadPublicaPage modoInterno />} />
          <Route path="/reservas/:id" element={<ReservaDetallePage />} />
          {/* Sprint 3 académico — Check-in (HU-43 a HU-47). */}
          <Route path="/personas-alojadas" element={<AlojadosPage />} />
          <Route path="/check-in" element={<CheckInPage />} />
          {/* Sprint 3 académico — Servicios Adicionales (HU-61 a HU-64). */}
          <Route path="/servicios-adicionales" element={<ServiciosAdicionalesPage />} />
          {/* Sprint 3 académico — Check-out y facturación (HU-48 a HU-56, 87). */}
          <Route path="/check-out" element={<CheckOutPage />} />
          <Route path="/check-out/:reservaId" element={<CheckOutReservaPage />} />
          <Route path="/comprobantes-estadia" element={<ComprobantesEstadiaPage />} />
          <Route path="/comprobantes-estadia/:id" element={<ComprobanteEstadiaDetallePage />} />
          <Route path="/movimientos-pago" element={<MovimientosPagoPage />} />
          <Route path="/reporte-caja-diaria" element={<ReporteCajaDiariaPage />} />
          {/* Usuarios y Seguridad — gestión de usuarios (solo admin). */}
          <Route path="/usuarios" element={<UsuariosPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
