const express = require("express");
const habitacionesControlador = require("./habitaciones.controlador");

const router = express.Router();

router.get("/mantenimiento", habitacionesControlador.getOrdenesMantenimiento);
router.patch("/mantenimiento/:ordenId/resolver", habitacionesControlador.patchResolverOrdenMantenimiento);
router.get("/", habitacionesControlador.getHabitaciones);
router.post("/", habitacionesControlador.postHabitacion);
router.get("/:id", habitacionesControlador.getHabitacion);
router.put("/:id", habitacionesControlador.putHabitacion);
router.patch("/:id/estado", habitacionesControlador.patchEstado);
router.patch("/:id/activo", habitacionesControlador.patchActivo);
router.post("/:id/mantenimiento", habitacionesControlador.postOrdenMantenimiento);

module.exports = router;
