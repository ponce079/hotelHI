const express = require("express");
const tiposHabitacionControlador = require("./tiposHabitacion.controlador");

const router = express.Router();

router.get("/", tiposHabitacionControlador.getTiposHabitacion);
router.get("/:id", tiposHabitacionControlador.getTipoHabitacion);
router.post("/", tiposHabitacionControlador.postTipoHabitacion);
router.put("/:id", tiposHabitacionControlador.putTipoHabitacion);
router.patch("/:id/activo", tiposHabitacionControlador.patchActivo);

module.exports = router;
