// index.js
// Punto de entrada del backend (Sistema de Gestión Hotelera - Holiday Inn)
require("dotenv").config();
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Permite leer JSON en el body de los requests (POST, PUT, etc.)
app.use(express.json());

// --- Rutas ---
app.use("/api/movimientos-stock", require("./routes/movimientosStock.routes"));
app.use("/api/stock", require("./routes/stock.routes"));

// Ruta de salud simple, para confirmar que el servidor está vivo
app.get("/", (req, res) => {
  res.json({ status: "ok", proyecto: "Sistema de Gestión Hotelera - Holiday Inn" });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});