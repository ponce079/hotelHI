const express = require("express");
const reservasControlador = require("./reservas.controlador");
const { getHistorial } = require("./reservas.historial");
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
// Cancelar, marcar no-show, crear y modificar reservas: solo personal con permiso de gestionar reservas
// (mismo criterio que el frontend, puede("gestionarReservas"): admin y recepcionista).
const gestionaReservas = [requiereSesion, requiereRol("admin", "recepcionista")];
router.get("/no-show-pendientes", ...gestionaReservas, reservasControlador.getNoShowPendientes);
router.get("/", reservasControlador.getReservas);
router.post("/cotizar", reservasControlador.postCotizar);
// Crear y modificar reservas desde el mostrador (la de /con-garantia recibe los datos de la tarjeta): sesión y rol
// de gestionar reservas. Todo /api ya exige sesión (lib/apiCerrada.js); acá además el rol.
router.post("/", ...gestionaReservas, reservasControlador.postReserva);
router.post("/con-garantia", ...gestionaReservas, reservasControlador.postReservaConGarantia);
router.get("/:id", reservasControlador.getReservaPorId);
router.patch("/:id", ...gestionaReservas, reservasControlador.patchReserva);
router.post("/:id/cancelar", ...gestionaReservas, reservasControlador.postCancelar);
router.post("/:id/no-show", ...gestionaReservas, reservasControlador.postNoShow);
router.get("/:id/cierre-previo", ...gestionaReservas, reservasControlador.getCierrePrevio);
router.get("/:id/garantia", ...gestionaReservas, reservasControlador.getGarantias);
router.post("/:id/garantia/aplicar", ...gestionaReservas, reservasControlador.postAplicarGarantia);
router.post("/:id/ajuste-precio", requiereSesion, requiereRol("gerente"), reservasControlador.postAjustePrecio);
router.get("/:id/penalidad", reservasControlador.getPenalidad);
// Historial de la reserva (solo lectura): mismos roles que la lectura de estadía, porque incluye
// quién hizo cada cambio de la ficha.
router.get("/:id/historial", requiereSesion, requiereRol("admin", "recepcionista", "gerente"), getHistorial);

// Check-in (HU-47) y check-out (HU-48 a 52) NO exponen ruta acá a
// propósito: mueven `Reserva.estado` llamando a
// reservasServicio.marcarEnCurso / marcarCerrada dentro de su propia
// transacción, desde sus propios módulos. Duplicar el endpoint acá
// dejaría dos puertas distintas para la misma transición.

module.exports = router;
