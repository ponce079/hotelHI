// src/modulos/presupuestos/presupuestos.routes.js
//
// El alta de presupuestos (invitar proveedores) NO está acá: cuelga de
// /api/requerimientos/:id/solicitar-presupuestos, porque la acción es
// sobre el requerimiento. Ver requerimientos.routes.js.

const express = require("express");
const multer = require("multer");
const presupuestosControlador = require("./presupuestos.controlador");
const presupuestosServicio = require("./presupuestos.servicio");
const ordenesCompraControlador = require("../ordenes-compra/ordenesCompra.controlador");

const router = express.Router();

// Punto 9 — archivo adjunto del presupuesto. `memoryStorage` (no disco):
// va directo a `req.file.buffer` para guardarse como BLOB en la base (ver
// presupuestos.servicio.js sobre por qué no se usó disco local). El límite
// de tamaño se aplica ACÁ (rechaza el request antes de terminar de subirlo)
// y de nuevo en el servicio (defensa en profundidad, mismo criterio que el
// resto del proyecto).
const uploadAdjunto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: presupuestosServicio.TAMANO_MAXIMO_ARCHIVO },
  fileFilter: (req, file, cb) => {
    if (!presupuestosServicio.TIPOS_ARCHIVO_PERMITIDOS.includes(file.mimetype)) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "archivo"));
    }
    cb(null, true);
  },
});

// multer reporta sus propios errores (tamaño/tipo) llamando a next(err) —
// sin este wrapper, Express los deja pasar a su handler default (una
// página HTML de error 500), no al JSON consistente que espera el
// frontend. Mismo criterio que manejarError en el controlador, pero para
// errores que pasan ANTES de llegar a él.
function conManejoDeMulter(middleware) {
  return (req, res, next) => {
    middleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "El archivo no puede superar los 5MB" });
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({ error: "Solo se aceptan archivos PDF, JPG o PNG" });
      }
      return res.status(400).json({ error: "No se pudo procesar el archivo." });
    });
  };
}

router.get("/", presupuestosControlador.getPresupuestos);
router.get("/:id", presupuestosControlador.getPresupuestoPorId);
router.put("/:id/cargar", presupuestosControlador.putCargarPresupuesto);
router.post("/:id/aprobar", presupuestosControlador.postAprobarPresupuesto);
router.get("/:id/adjunto", presupuestosControlador.getAdjuntoPresupuesto);
router.post("/:id/adjunto", conManejoDeMulter(uploadAdjunto.single("archivo")), presupuestosControlador.postAdjuntoPresupuesto);
router.delete("/:id/adjunto", presupuestosControlador.deleteAdjuntoPresupuesto);
// HU-22: generar la OC a partir de este presupuesto ya adjudicado. La
// lógica vive en el módulo de Órdenes de Compra (Gimena/Ricardo) — ver
// ordenesCompra.servicio.js. Coordinado en el PR de Órdenes de Compra.
router.post("/:id/generar-oc", ordenesCompraControlador.postGenerarOC);

module.exports = router;
