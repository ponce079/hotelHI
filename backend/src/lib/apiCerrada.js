// API cerrada (HU-106): TODO /api exige una sesión válida salvo la lista blanca de abajo.
//
// Se monta en index.js ANTES de las rutas: ningún router nuevo puede quedar abierto por olvido. Usa el mismo
// mecanismo que el resto del sistema (requiereSesion de usuarios.middleware.js: token firmado, usuario activo,
// 401 con codigo SESION_INVALIDA, que el frontend traduce en "Tu sesión venció. Ingresá de nuevo."). Las
// comprobaciones de rol de cada ruta siguen en sus routers.
const { requiereSesion } = require("../modulos/usuarios/usuarios.middleware");

// LISTA BLANCA: lo único de /api que se puede usar sin sesión. Agregar algo acá es una decisión de seguridad:
// tiene que ser público por diseño y con su propia protección contra abusos.
//   metodo "*"      cualquier método; "POST", etc.: solo ese.
//   prefijo         la ruta y todo lo que cuelga de ella ("/api/web" y "/api/web/...", no "/api/webx").
//   exacta          solo esa ruta.
const RUTAS_PUBLICAS = [
  {
    metodo: "*",
    prefijo: "/api/web",
    motivo: "Canal público del e-commerce (búsqueda, reserva y Mi reserva), con su límite de intentos por origen (limiteIntentos.js).",
  },
  {
    metodo: "POST",
    exacta: "/api/auth/login",
    motivo: "Iniciar sesión: por definición se usa sin tener sesión.",
  },
];

// "/API/Web/" y "/api/web" son la misma ruta para Express (no distingue mayúsculas ni la barra final): se compara igual.
function normalizar(ruta) {
  const sinBarras = String(ruta ?? "").toLowerCase().replace(/\/+$/, "");
  return sinBarras || "/";
}

function esPublica(metodo, ruta, lista = RUTAS_PUBLICAS) {
  const r = normalizar(ruta);
  return lista.some((p) => {
    if (p.metodo !== "*" && p.metodo !== String(metodo).toUpperCase()) return false;
    if (p.exacta) return r === p.exacta;
    return r === p.prefijo || r.startsWith(`${p.prefijo}/`);
  });
}

// app.use("/api", apiCerrada): req.baseUrl vale "/api" y req.path es el resto.
function apiCerrada(req, res, next) {
  if (esPublica(req.method, `${req.baseUrl}${req.path}`)) return next();
  return requiereSesion(req, res, next);
}

module.exports = { apiCerrada, esPublica, RUTAS_PUBLICAS };
