const usuariosServicio = require("./usuarios.servicio");

function responderError(res, err, contexto, mensaje) {
  if (err instanceof usuariosServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

// ── /api/auth ───────────────────────────────────────────────

async function postLogin(req, res) {
  try {
    return res.json(await usuariosServicio.iniciarSesion(req.body ?? {}));
  } catch (err) {
    return responderError(res, err, "Error al iniciar sesión:", "No se pudo iniciar sesión. Probá de nuevo en un momento.");
  }
}

async function getYo(req, res) {
  try {
    return res.json(await usuariosServicio.obtenerPerfil(req.usuarioActual.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener el perfil:", "No se pudo obtener tu perfil.");
  }
}

// ── /api/usuarios (autogestión) ─────────────────────────────

async function patchMiPerfil(req, res) {
  try {
    return res.json(await usuariosServicio.actualizarMiPerfil(req.usuarioActual.id, req.body ?? {}));
  } catch (err) {
    return responderError(res, err, "Error al actualizar el perfil:", "No se pudo actualizar tu perfil.");
  }
}

async function patchMiContrasena(req, res) {
  try {
    return res.json(await usuariosServicio.cambiarMiContrasena(req.usuarioActual.id, req.body ?? {}));
  } catch (err) {
    return responderError(res, err, "Error al cambiar la contraseña:", "No se pudo cambiar la contraseña.");
  }
}

// ── /api/usuarios (administración) ──────────────────────────

async function getUsuarios(req, res) {
  try {
    return res.json(await usuariosServicio.listarUsuarios(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar usuarios:", "No se pudieron listar los usuarios.");
  }
}

async function getUsuario(req, res) {
  try {
    return res.json(await usuariosServicio.obtenerPerfil(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener el usuario:", "No se pudo obtener el usuario.");
  }
}

async function postUsuario(req, res) {
  try {
    return res.status(201).json(await usuariosServicio.crearUsuario(req.body ?? {}));
  } catch (err) {
    return responderError(res, err, "Error al crear el usuario:", "No se pudo crear el usuario.");
  }
}

async function putUsuario(req, res) {
  try {
    return res.json(await usuariosServicio.actualizarUsuario(req.params.id, req.body ?? {}, req.usuarioActual.id));
  } catch (err) {
    return responderError(res, err, "Error al actualizar el usuario:", "No se pudo actualizar el usuario.");
  }
}

async function patchActivo(req, res) {
  try {
    return res.json(await usuariosServicio.cambiarActivo(req.params.id, req.body?.activo, req.usuarioActual.id));
  } catch (err) {
    return responderError(res, err, "Error al cambiar el estado del usuario:", "No se pudo cambiar el estado del usuario.");
  }
}

async function patchDesbloquear(req, res) {
  try {
    return res.json(await usuariosServicio.desbloquearUsuario(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al desbloquear el usuario:", "No se pudo desbloquear el usuario.");
  }
}

async function patchRestablecerContrasena(req, res) {
  try {
    return res.json(await usuariosServicio.restablecerContrasena(req.params.id, req.body?.contrasena));
  } catch (err) {
    return responderError(res, err, "Error al restablecer la contraseña:", "No se pudo restablecer la contraseña.");
  }
}

module.exports = {
  postLogin,
  getYo,
  patchMiPerfil,
  patchMiContrasena,
  getUsuarios,
  getUsuario,
  postUsuario,
  putUsuario,
  patchActivo,
  patchDesbloquear,
  patchRestablecerContrasena,
};
