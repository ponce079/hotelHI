// src/modulos/proveedores/proveedores.routes.js
//
// Se monta en /api/proveedores igual que routerProveedores de
// cuenta-corriente (que expone GET /:id/cuenta-corriente). Express deja
// montar varios routers en el mismo prefijo: el que no matchea pasa al
// siguiente, y ninguna de estas rutas choca con aquella porque
// "/:id/cuenta-corriente" tiene dos segmentos y "/:id" uno solo.

const express = require("express");
const proveedoresControlador = require("./proveedores.controlador");

const router = express.Router();

router.post("/", proveedoresControlador.postProveedor);
router.get("/", proveedoresControlador.getProveedores);
router.get("/:id", proveedoresControlador.getProveedorPorId);
router.get("/:id/ordenes-compra", proveedoresControlador.getOrdenesCompraDeProveedor);
router.put("/:id", proveedoresControlador.putProveedor);
router.patch("/:id/estado", proveedoresControlador.patchEstadoProveedor);

module.exports = router;
