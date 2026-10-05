// Endpoint INTERNO del mostrador (etapa 2): GET /api/reservas-web/:reservaId
// → datos propios de una reserva web para el bloque "Reserva web" del
// detalle de reserva. Exige sesión y el permiso de ver reservas (mismo
// criterio que verReservas del frontend: admin, recepcionista y gerente).
// GET /api/reservas/:id sigue sin sesión y sin estos datos. Una reserva sin
// datos web (del mostrador o inexistente) responde 200 con null: no es un
// error y así no ensucia la consola del navegador.
const express = require("express");
const { responderEsperaConexion } = require("../../lib/erroresConexion");
const { requiereSesion, requiereRol } = require("../usuarios/usuarios.middleware");
const { datosWebDeReserva } = require("./mostrador.servicio");

const ROLES_VER_RESERVAS = ["admin", "recepcionista", "gerente"];

const router = express.Router();

router.get("/:reservaId", requiereSesion, requiereRol(...ROLES_VER_RESERVAS), async (req, res) => {
  const reservaId = Number(req.params.reservaId);
  if (!Number.isSafeInteger(reservaId) || reservaId < 1) {
    return res.status(400).json({ error: "Reserva inválida." });
  }
  try {
    const datos = await datosWebDeReserva(reservaId);
    return res.json(datos ?? null);
  } catch (err) {
    if (responderEsperaConexion(res, err)) return;
    console.error("[reservas-web] No se pudieron leer los datos web:", err?.message);
    return res.status(500).json({ error: "No se pudieron leer los datos de la reserva web." });
  }
});

module.exports = router;
module.exports.ROLES_VER_RESERVAS = ROLES_VER_RESERVAS;
