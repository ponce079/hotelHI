const express = require("express");
const serviciosAdicionalesControlador = require("./serviciosAdicionales.controlador");

const router = express.Router();

// Ruta literal antes que cualquier futura "/:id" (mismo criterio que el
// resto de las rutas del proyecto).
router.get("/resumen", serviciosAdicionalesControlador.getResumen);
router.get("/hotel/resumen", serviciosAdicionalesControlador.getResumenHotel);
router.get("/", serviciosAdicionalesControlador.getConsumos);
router.post("/", serviciosAdicionalesControlador.postConsumo);
router.post('/:id/anular', async (req,res)=>{
  try { res.json(await require('./serviciosAdicionales.servicio').anularConsumo(req.params.id,req.body)); }
  catch(e){if(!e.statusCode)console.error('[anular consumo]',e);res.status(e.statusCode||500).json({error:e.statusCode?e.message:'No se pudo anular el consumo.'});}
});

module.exports = router;
