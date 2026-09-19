// index.js
// Punto de entrada del backend (Sistema de Gestión Hotelera - Holiday Inn)

require("dotenv").config();

// Red de seguridad de proceso: sin esto, un error que no pase por ningún
// try/catch (ej. un evento "error" de socket de una conexión del pool de
// MariaDB que no está dentro de una transacción — ver el comentario en
// src/lib/prisma.js sobre por qué onConnectionError del adapter no cubre
// ese caso, solo cubre conexiones de $transaction) tira abajo TODO el
// proceso para todo el equipo, no solo la operación que falló — así se
// perdió el server completo con un ECONNABORTED sin capturar.
//
// Loguear y seguir corriendo es una desviación deliberada de lo que Node
// recomienda por default (matar el proceso tras un uncaughtException, por
// riesgo de estado interno inconsistente): acá cada request es stateless
// de punta a punta — no hay estado compartido en memoria entre requests
// más allá del pool de conexiones de Prisma — así que se prioriza que el
// resto del equipo no se quede sin servidor por un corte de red puntual
// contra la base remota. Si en el futuro aparece estado compartido real
// (cache en memoria, jobs con estado, etc.) hay que revisar este criterio.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Error no capturado — el servidor sigue corriendo:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Promesa rechazada sin catch — el servidor sigue corriendo:", reason);
});

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- Rutas (patrón controller/service/routes, dentro de src/modulos) ---
app.use("/api/movimientos-stock", require("./src/modulos/movimientos-stock/movimientosStock.routes"));
app.use("/api/stock", require("./src/modulos/stock/stock.routes"));
app.use("/api/articulos", require("./src/modulos/articulos/articulos.routes"));
app.use("/api/articulo-depositos", require("./src/modulos/articulo-deposito/articulo-deposito.routes"));
app.use("/api/movimientos-salida", require("./src/modulos/movimientos-salida/movimientoSalida.routes"));
app.use("/api/tipos-movimiento", require("./src/modulos/tipos-movimiento/tiposMovimiento.routes"));
app.use("/api/depositos", require("./src/modulos/depositos/depositos.routes"));

// --- Sprint 2 — Compras y Gastos ---
app.use("/api/ordenes-pago", require("./src/modulos/pagos/pagos.routes"));
const cuentaCorrienteRoutes = require("./src/modulos/cuenta-corriente/cuentaCorriente.routes");
app.use("/api/proveedores", cuentaCorrienteRoutes.routerProveedores);
app.use("/api/cuenta-corriente", cuentaCorrienteRoutes.routerCuentaCorriente);
app.use("/api/proveedores", require("./src/modulos/proveedores/proveedores.routes"));
app.use("/api/requerimientos", require("./src/modulos/requerimientos/requerimientos.routes"));
app.use("/api/presupuestos", require("./src/modulos/presupuestos/presupuestos.routes"));
app.use("/api/comprobantes", require("./src/modulos/comprobantes/comprobantes.routes"));
app.use("/api/ordenes-compra", require("./src/modulos/ordenes-compra/ordenesCompra.routes"));
app.use("/api/habitaciones", require("./src/modulos/habitaciones/habitaciones.routes"));
app.use("/api/reservas", require("./src/modulos/reservas/reservas.routes"));
app.use("/api/check-in", require("./src/modulos/check-in/checkIn.routes"));
app.use("/api/consumos-servicios", require("./src/modulos/servicios-adicionales/serviciosAdicionales.routes"));

app.get("/", (req, res) => {
  res.json({ status: "ok", proyecto: "Sistema de Gestión Hotelera - Holiday Inn" });
});

// Middleware de errores de Express — va al final, después de todas las
// rutas (Express lo reconoce por tener 4 parámetros). Cada controlador ya
// atrapa sus propios errores con try/catch, así que en el uso normal esto
// no debería dispararse casi nunca; es la red de seguridad para lo que se
// cuele igual (JSON malformado de express.json(), un controlador nuevo que
// se olvide el catch) — sin esto esa request se quedaba colgada sin
// respuesta, o el error terminaba como una promesa rechazada suelta a
// nivel de proceso en vez de una respuesta 500 controlada al cliente.
app.use((err, req, res, next) => {
  console.error(`[error-handler] ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Ocurrió un error inesperado en el servidor." });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Red de seguridad de la reposición automática de centrales — ver
// src/lib/jobsStockMinimo.js. Se arranca después de levantar el server,
// no antes: no tiene que bloquear ni condicionar que el servidor escuche.
require("./src/lib/jobsStockMinimo").iniciarBarridoStockMinimoCentral();


// Red de seguridad de la reposición automática de centrales — ver
// src/lib/jobsStockMinimo.js. Se arranca después de levantar el server,
// no antes: no tiene que bloquear ni condicionar que el servidor escuche.
require("./src/lib/jobsStockMinimo").iniciarBarridoStockMinimoCentral();
