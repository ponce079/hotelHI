const { responderEsperaConexion } = require("../../lib/erroresConexion");
const { requiereSesion, requiereRol } = require("../usuarios/usuarios.middleware");
const router = require("express").Router();
const s = require("./estadia.servicio");
const handler = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    if (responderEsperaConexion(res, e)) return;
    if (e.code === "P2002")
      return res.status(409).json({
        error: "Esta persona ya tiene un ingreso activo en otra estadía.",
      });
    if (!e.statusCode) console.error("[estadia]", e);
    if (["P2021", "P2022"].includes(e.code))
      return res.status(503).json({
        codigo: "ESQUEMA_ESTADIA_INCOMPLETO",
        error:
          "La base de datos no tiene todas las tablas o columnas de estadía. " +
          "Se debe completar la actualización de la base antes de continuar.",
      });
    res.status(e.statusCode || 500).json({
      ...(e.statusCode && e.campos ? { campos: e.campos } : {}),
      ...(e.statusCode && e.codigo ? { codigo: e.codigo, detalle: e.detalle } : {}),
      error: e.statusCode ? e.message : "No se pudo completar la operación de estadía.",
    });
  }
};
// Todas las rutas de estadía exigen sesión. Roles mínimos según las pantallas que las usan:
//   - Lectura de fichas e historial: "Personas de la estadía" en el detalle de la reserva, que
//     también ve el gerente (verReservas), y la pantalla de check-in.
//   - "Personas alojadas" y todo lo que escribe: admin y recepcionista
//     (gestionarReservas / gestionarCheckIn del frontend).
const ROLES_LECTURA = ["admin", "recepcionista", "gerente"];
const ROLES_OPERACION = ["admin", "recepcionista"];
const lectura = [requiereSesion, requiereRol(...ROLES_LECTURA)];
const operacion = [requiereSesion, requiereRol(...ROLES_OPERACION)];
// El operador que queda en los eventos es el usuario de la sesión, no lo que mande el cliente.
const conOperador = (r) => ({ ...r.body, operador: r.usuarioActual.usuario });

router.get(
  "/alojados",
  ...operacion,
  handler((r) => s.alojados(String(r.query.q || "").slice(0, 100))),
);
router.get(
  "/:reservaId/ocupantes",
  ...lectura,
  handler((r) => s.listar(r.params.reservaId)),
);
router.post(
  "/:reservaId/titular",
  ...operacion,
  handler((r) => require("./titular.servicio").asegurarTitular(r.params.reservaId, r.usuarioActual.usuario)),
);
router.post(
  "/:reservaId/ocupantes",
  ...operacion,
  handler((r) => s.guardar(r.params.reservaId, null, conOperador(r))),
);
router.put(
  "/:reservaId/ocupantes/:id",
  ...operacion,
  handler((r) => s.guardar(r.params.reservaId, r.params.id, conOperador(r))),
);
router.post(
  "/:reservaId/ocupantes/:id/accion",
  ...operacion,
  handler((r) => s.accion(r.params.reservaId, r.params.id, conOperador(r))),
);
router.post(
  "/:reservaId/ocupantes/:id/mover",
  ...operacion,
  handler((r) => require("./moverOcupante").mover(r.params.reservaId, r.params.id, conOperador(r))),
);
router.get(
  "/:reservaId/historial",
  ...lectura,
  handler((r) => s.historial(r.params.reservaId)),
);
module.exports = router;
module.exports.ROLES_LECTURA = ROLES_LECTURA;
module.exports.ROLES_OPERACION = ROLES_OPERACION;
