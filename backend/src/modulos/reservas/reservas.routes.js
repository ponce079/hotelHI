const express = require("express");
const reservasControlador = require("./reservas.controlador");
// Etapa 4B (HU-97) — primer uso de este middleware fuera de /api/usuarios:
// el ajuste manual de precio modifica importes a cobrar, así que acá SÍ se
// exige sesión + rol gerente en el backend (no solo el gate del botón en el
// frontend, como el resto de reservas/tarifas hoy). No se toca
// usuarios.middleware.js ni ninguna otra ruta de este router.
const { requiereSesion, requiereRol } = require("../usuarios/usuarios.middleware");

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
router.post("/:id/ajuste-precio", requiereSesion, requiereRol("gerente"), reservasControlador.postAjustePrecio);
router.get("/:id/penalidad", reservasControlador.getPenalidad);

// Check-in (HU-47) y check-out (HU-48 a 52) NO exponen ruta acá a
// propósito: mueven `Reserva.estado` llamando a
// reservasServicio.marcarEnCurso / marcarCerrada dentro de su propia
// transacción, desde sus propios módulos. Duplicar el endpoint acá
// dejaría dos puertas distintas para la misma transición.

module.exports = router;
