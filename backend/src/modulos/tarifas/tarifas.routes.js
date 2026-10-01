const express = require("express");
const tarifasControlador = require("./tarifas.controlador");

const router = express.Router();

// Temporadas (HU-90). "/temporadas/calendario" antes de "/temporadas/:id"
// — mismo motivo que "/disponibilidad" en reservas.routes.js.
router.get("/temporadas/calendario", tarifasControlador.getCalendario);
router.get("/temporadas", tarifasControlador.getTemporadas);
router.get("/temporadas/:id", tarifasControlador.getTemporada);
router.post("/temporadas", tarifasControlador.postTemporada);
router.put("/temporadas/:id", tarifasControlador.putTemporada);
router.patch("/temporadas/:id/activa", tarifasControlador.patchTemporadaActiva);

// Planes tarifarios (HU-91).
router.get("/planes", tarifasControlador.getPlanes);
router.get("/planes/:id", tarifasControlador.getPlan);
router.post("/planes", tarifasControlador.postPlan);
router.put("/planes/:id", tarifasControlador.putPlan);
router.patch("/planes/:id/activo", tarifasControlador.patchPlanActivo);

// Tarifas por tipo × temporada (HU-92). "/precios/grilla" antes de
// cualquier ruta con :id.
router.get("/precios/grilla", tarifasControlador.getGrilla);
router.get("/precios", tarifasControlador.getHistorialTarifa);
router.post("/precios", tarifasControlador.postTarifa);
router.put("/precios/:id", tarifasControlador.putTarifa);
router.delete("/precios/:id", tarifasControlador.deleteTarifa);

// Modificador por día de semana (HU-92, regla 8).
router.get("/modificadores", tarifasControlador.getModificadores);
router.put("/modificadores/:diaSemana", tarifasControlador.putModificador);

// Actualización masiva por lote (HU-93).
router.get("/lotes", tarifasControlador.getLotes);
router.post("/lotes/vista-previa", tarifasControlador.postVistaPrevia);
router.post("/lotes", tarifasControlador.postLote);
router.post("/lotes/:id/anular", tarifasControlador.postAnularLote);

// Motor de cotización (HU-94).
router.post("/cotizar", tarifasControlador.postCotizar);

module.exports = router;
