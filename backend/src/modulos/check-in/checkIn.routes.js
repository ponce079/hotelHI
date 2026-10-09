const express = require("express");
const checkInControlador = require("./checkIn.controlador");
const { requiereSesion, requiereRol } = require("../usuarios/usuarios.middleware");
const { ROLES_CHECK_IN } = require("./checkIn.constantes");

const router = express.Router();

// Consultas del rediseño con datos personales: sesión + rol de check-in. ROLES_CHECK_IN
// equivale a puede("gestionarCheckIn") del frontend (frontend/src/lib/sesion.jsx).
const soloCheckIn = [requiereSesion, requiereRol(...ROLES_CHECK_IN)];

// Rutas literales antes de "/:reservaId" (mismo criterio que
// reservas.routes.js con "/disponibilidad").
router.get("/buscar-reserva", ...soloCheckIn, checkInControlador.getBuscarReserva);
router.get("/habitaciones-libres", ...soloCheckIn, checkInControlador.getHabitacionesLibres);
router.get("/llegadas", ...soloCheckIn, checkInControlador.getLlegadas);
// El walk-in y la confirmación del check-in reciben los datos de la tarjeta de la garantía: sesión + rol de check-in.
router.post("/walk-in", ...soloCheckIn, checkInControlador.postCheckInWalkIn);
router.post("/:reservaId/previa-ocupacion", ...soloCheckIn, checkInControlador.postPreviaOcupacion);
router.post("/:reservaId/confirmar", ...soloCheckIn, checkInControlador.postConfirmarConReserva);

module.exports = router;
