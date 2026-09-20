const express = require("express");
const checkInControlador = require("./checkIn.controlador");

const router = express.Router();

// Rutas literales antes de "/:reservaId" (mismo criterio que
// reservas.routes.js con "/disponibilidad").
router.get("/buscar-reserva", checkInControlador.getBuscarReserva);
router.get("/habitaciones-libres", checkInControlador.getHabitacionesLibres);
router.post("/walk-in", checkInControlador.postCheckInWalkIn);
router.post("/:reservaId/confirmar", checkInControlador.postConfirmarConReserva);

module.exports = router;
