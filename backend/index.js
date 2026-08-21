// index.js
// Punto de entrada del backend (Sistema de Gestión Hotelera - Holiday Inn)

require("dotenv").config();

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
app.use("/api/depositos", require("./src/modulos/depositos/depositos.routes"));

app.get("/", (req, res) => {
  res.json({ status: "ok", proyecto: "Sistema de Gestión Hotelera - Holiday Inn" });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});