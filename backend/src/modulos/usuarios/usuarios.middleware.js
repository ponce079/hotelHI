// Usuarios y Seguridad — middlewares de Express.
//
// requiereSesion: exige un token válido en "Authorization: Bearer <token>"
// y deja en req.usuarioActual el usuario vivo de la base.
// requiereRol(...roles): además exige que ese usuario tenga uno de esos roles.
//
// Desde HU-106 la sesión se exige en TODO /api (lib/apiCerrada.js) salvo la lista blanca (/api/web/* y el
// login); estos middlewares siguen siendo los que verifican el token, y requiereRol suma el permiso de cada ruta.

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

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuarioActual || !roles.includes(req.usuarioActual.rol)) {
      return res.status(403).json({ error: "No tenés permiso para realizar esta acción." });
    }
    return next();
  };
}

module.exports = { requiereSesion, requiereRol, SESION_INVALIDA };
