const express = require("express");
const usuariosControlador = require("./usuarios.controlador");
const { requiereSesion, requiereRol } = require("./usuarios.middleware");
const { ROL_ADMIN } = require("./usuarios.constantes");

// Dos routers en un mismo archivo (mismo patrón que cuentaCorriente.routes.js):
// /api/auth para entrar, /api/usuarios para la gestión.

const routerAuth = express.Router();
routerAuth.post("/login", usuariosControlador.postLogin);
routerAuth.get("/yo", requiereSesion, usuariosControlador.getYo);

const routerUsuarios = express.Router();
// Todo /api/usuarios exige sesión iniciada.
routerUsuarios.use(requiereSesion);

// Autogestión: cualquier usuario logueado, siempre sobre sí mismo. Van
// antes de "/:id" para que "yo" no se tome como un id.
routerUsuarios.patch("/yo/perfil", usuariosControlador.patchMiPerfil);
routerUsuarios.patch("/yo/contrasena", usuariosControlador.patchMiContrasena);

// Administración: solo admin.
const soloAdmin = requiereRol(ROL_ADMIN);
routerUsuarios.get("/", soloAdmin, usuariosControlador.getUsuarios);
routerUsuarios.post("/", soloAdmin, usuariosControlador.postUsuario);
routerUsuarios.get("/:id", soloAdmin, usuariosControlador.getUsuario);
routerUsuarios.put("/:id", soloAdmin, usuariosControlador.putUsuario);
routerUsuarios.patch("/:id/activo", soloAdmin, usuariosControlador.patchActivo);
routerUsuarios.patch("/:id/desbloquear", soloAdmin, usuariosControlador.patchDesbloquear);
routerUsuarios.patch("/:id/restablecer-contrasena", soloAdmin, usuariosControlador.patchRestablecerContrasena);

module.exports = { routerAuth, routerUsuarios };
