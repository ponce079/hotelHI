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

app.get("/", (req, res) => {
  res.json({ status: "ok", proyecto: "Sistema de Gestión Hotelera - Holiday Inn" });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});