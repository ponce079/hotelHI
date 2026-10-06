// Usuarios y Seguridad — middlewares de Express.
//
// requiereSesion: exige un token válido en "Authorization: Bearer <token>"
// y deja en req.usuarioActual el usuario vivo de la base.
// requiereRol(...roles): además exige que ese usuario tenga uno de esos roles.
//
// Por ahora protegen las rutas de /api/usuarios (y /api/auth/yo). Las rutas
// de los demás módulos siguen sin chequear sesión en el backend, igual que
// antes de este cambio: el frontend ya manda el token en todos los pedidos
// (ver frontend/src/lib/api.js), así que protegerlas más adelante es solo
// agregar requiereSesion en su router, sin tocar el frontend.

const { verificarToken } = require("./usuarios.seguridad");
const usuariosServicio = require("./usuarios.servicio");

const SESION_INVALIDA = "SESION_INVALIDA";

function leerToken(req) {
  const encabezado = req.headers?.authorization ?? "";
  const [tipo, token] = encabezado.split(" ");
  return tipo === "Bearer" && token ? token : null;
}

async function requiereSesion(req, res, next) {
  const datos = verificarToken(leerToken(req));
  if (!datos) {
    return res.status(401).json({
      error: "Tu sesión venció o no es válida. Volvé a iniciar sesión.",
      codigo: SESION_INVALIDA,
    });
  }

  try {
    const usuario = await usuariosServicio.obtenerUsuarioParaSesion(datos.id);
    if (!usuario) {
      return res.status(401).json({
        error: "Tu usuario ya no está activo. Volvé a iniciar sesión o consultá con el administrador.",
        codigo: SESION_INVALIDA,
      });
    }
    req.usuarioActual = { id: usuario.id, usuario: usuario.usuario, rol: usuario.rol };
    return next();
  } catch (err) {
    console.error("Error al validar la sesión:", err);
    return res.status(500).json({ error: "No se pudo validar la sesión." });
  }
}

// Como requiereSesion pero sin rechazar: con un token válido deja req.usuarioActual; sin token (la
// reserva web) o con uno vencido sigue como anónimo. Sirve para rutas públicas que dan más
// permisos a quien tiene sesión (por ejemplo, que un administrador corrija un nombre).
async function sesionOpcional(req, res, next) {
  const datos = verificarToken(leerToken(req));
  if (datos) {
    try {
      const usuario = await usuariosServicio.obtenerUsuarioParaSesion(datos.id);
      if (usuario) req.usuarioActual = { id: usuario.id, usuario: usuario.usuario, rol: usuario.rol };
    } catch (err) {
      console.error("Error al validar la sesión opcional:", err);
    }
  }
  return next();
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuarioActual || !roles.includes(req.usuarioActual.rol)) {
      return res.status(403).json({ error: "No tenés permiso para realizar esta acción." });
    }
    return next();
  };
}

module.exports = { requiereSesion, sesionOpcional, requiereRol, SESION_INVALIDA };
