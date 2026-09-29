const express = require("express");
const reservasControlador = require("./reservas.controlador");

const router = express.Router();

// Las rutas literales van antes de "/:id" — si no, Express matchea
// "/disponibilidad" contra "/:id" (mismo orden que habitaciones.routes.js
// con "/tipos").
router.get("/disponibilidad", reservasControlador.getDisponibilidad);
router.get("/codigo/:codigo", reservasControlador.getReservaPorCodigo);
router.get("/", reservasControlador.getReservas);
router.post("/cotizar", reservasControlador.postCotizar);
router.post("/", reservasControlador.postReserva);
router.post("/con-sena", reservasControlador.postReservaConSenia);
router.get("/:id", reservasControlador.getReservaPorId);
router.patch("/:id", reservasControlador.patchReserva);
router.post("/:id/cancelar", reservasControlador.postCancelar);

// Check-in (HU-47) y check-out (HU-48 a 52) NO exponen ruta acá a
// propósito: mueven `Reserva.estado` llamando a
// reservasServicio.marcarEnCurso / marcarCerrada dentro de su propia
// transacción, desde sus propios módulos. Duplicar el endpoint acá
// dejaría dos puertas distintas para la misma transición.

module.exports = router;
