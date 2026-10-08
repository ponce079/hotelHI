// Montaje de TODAS las rutas del backend (patrón controller/service/routes, dentro de src/modulos).
// Vive acá (y no en index.js) para poder recorrerlas en los tests: la prueba de la API cerrada (HU-106)
// verifica que cada ruta registrada responde 401 sin sesión, salvo la lista blanca (lib/apiCerrada.js).
const MONTAJES = [
  ["/api/movimientos-stock", () => require("./modulos/movimientos-stock/movimientosStock.routes")],
  ["/api/stock", () => require("./modulos/stock/stock.routes")],
  ["/api/articulos", () => require("./modulos/articulos/articulos.routes")],
  ["/api/articulo-depositos", () => require("./modulos/articulo-deposito/articulo-deposito.routes")],
  ["/api/movimientos-salida", () => require("./modulos/movimientos-salida/movimientoSalida.routes")],
  ["/api/tipos-movimiento", () => require("./modulos/tipos-movimiento/tiposMovimiento.routes")],
  ["/api/depositos", () => require("./modulos/depositos/depositos.routes")],

  // --- Sprint 2 — Compras y Gastos ---
  ["/api/ordenes-pago", () => require("./modulos/pagos/pagos.routes")],
  ["/api/proveedores", () => require("./modulos/cuenta-corriente/cuentaCorriente.routes").routerProveedores],
  ["/api/cuenta-corriente", () => require("./modulos/cuenta-corriente/cuentaCorriente.routes").routerCuentaCorriente],
  ["/api/proveedores", () => require("./modulos/proveedores/proveedores.routes")],
  ["/api/requerimientos", () => require("./modulos/requerimientos/requerimientos.routes")],
  ["/api/presupuestos", () => require("./modulos/presupuestos/presupuestos.routes")],
  ["/api/comprobantes", () => require("./modulos/comprobantes/comprobantes.routes")],
  ["/api/ordenes-compra", () => require("./modulos/ordenes-compra/ordenesCompra.routes")],
  ["/api/habitaciones", () => require("./modulos/habitaciones/habitaciones.routes")],
  ["/api/tipos-habitacion", () => require("./modulos/tipos-habitacion/tiposHabitacion.routes")],
  ["/api/tarifas", () => require("./modulos/tarifas/tarifas.routes")],
  ["/api/reservas", () => require("./modulos/reservas/reservas.routes")],
  ["/api/check-in", () => require("./modulos/check-in/checkIn.routes")],
  ["/api/estadia", () => require("./modulos/estadia/estadia.routes")],
  ["/api/huespedes", () => require("./modulos/huespedes/huespedes.routes")],
  ["/api/consumos-servicios", () => require("./modulos/servicios-adicionales/serviciosAdicionales.routes")],
  ["/api/comprobantes-estadia", () => require("./modulos/comprobantes-estadia/comprobanteEstadia.routes")],
  ["/api/pagos-estadia", () => require("./modulos/pagos-estadia/pagoEstadia.routes")],
  ["/api/check-out", () => require("./modulos/check-out/checkOut.routes")],
  ["/api/web", () => require("./modulos/ecommerce/ecommerce.routes")],
  ["/api/reservas-web", () => require("./modulos/ecommerce/reservasWeb.routes")],

  // --- Usuarios y Seguridad (login real + gestión de usuarios) ---
  ["/api/auth", () => require("./modulos/usuarios/usuarios.routes").routerAuth],
  ["/api/usuarios", () => require("./modulos/usuarios/usuarios.routes").routerUsuarios],
];

function montarRutas(app) {
  for (const [prefijo, cargarRouter] of MONTAJES) app.use(prefijo, cargarRouter());
}

module.exports = { MONTAJES, montarRutas };
