const express = require("express");
const { responderEsperaConexion } = require("../../lib/erroresConexion");
const { requiereSesion, requiereRol } = require("../usuarios/usuarios.middleware");
const { ROLES_CHECK_IN } = require("../check-in/checkIn.constantes");
const huespedesServicio = require("./huespedes.servicio");

const router = express.Router();

// GET /api/huespedes/por-documento?tipo=&pais=&numero= — persona que vuelve (rediseño del
// check-in). Datos personales: exige sesión y el rol de check-in; ROLES_CHECK_IN equivale a
// puede("gestionarCheckIn") del frontend (frontend/src/lib/sesion.jsx).
router.get("/por-documento", requiereSesion, requiereRol(...ROLES_CHECK_IN), async (req, res) => {
  try {
    return res.json(await huespedesServicio.buscarPorDocumento(req.query));
  } catch (err) {
    if (responderEsperaConexion(res, err)) return;
    if (err instanceof huespedesServicio.ErrorDeNegocio) return res.status(err.statusCode).json({ error: err.message });
    console.error("Error al buscar el huésped por documento:", err);
    return res.status(500).json({ error: "No se pudo buscar el huésped." });
  }
});

module.exports = router;
