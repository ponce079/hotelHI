const express = require("express");
const serviciosAdicionalesControlador = require("./serviciosAdicionales.controlador");

const router = express.Router();

// Ruta literal antes que cualquier futura "/:id" (mismo criterio que el
// resto de las rutas del proyecto).
router.get("/resumen", serviciosAdicionalesControlador.getResumen);
router.get("/hotel/resumen", serviciosAdicionalesControlador.getResumenHotel);
router.get("/", serviciosAdicionalesControlador.getConsumos);
router.post("/", serviciosAdicionalesControlador.postConsumo);

module.exports = router;
