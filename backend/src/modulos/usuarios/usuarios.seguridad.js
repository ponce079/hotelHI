// Usuarios y Seguridad — hash de contraseñas y token de sesión.
//
// Todo con el módulo `crypto` que ya trae Node, sin dependencias nuevas
// (nada que instalar con npm, nada que compilar en Windows):
//
// - Contraseñas: scrypt con una sal aleatoria por usuario. Es un algoritmo
//   pensado para contraseñas (lento a propósito, igual que bcrypt), así que
//   aunque alguien se llevara la tabla `usuarios` no puede recuperar las
//   contraseñas. En la base se guarda "scrypt$<sal>$<hash>", nunca el texto.
//
// - Token de sesión: un JSON con { id, rol, exp } firmado con HMAC-SHA256
//   (mismo principio que un JWT). El frontend lo manda en cada pedido en el
//   header Authorization; si alguien lo modifica (ej. se cambia el rol a
//   mano), la firma deja de coincidir y el backend lo rechaza.

const crypto = require("crypto");
const { promisify } = require("util");
const { DURACION_SESION_MS } = require("./usuarios.constantes");

const scrypt = promisify(crypto.scrypt);
const LONGITUD_HASH = 64;

async function hashearContrasena(contrasena) {
  const sal = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(String(contrasena), sal, LONGITUD_HASH);
  return `scrypt$${sal}$${hash.toString("hex")}`;
}

async function verificarContrasena(contrasena, guardado) {
  const [algoritmo, sal, hashHex] = String(guardado ?? "").split("$");
  if (algoritmo !== "scrypt" || !sal || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const calculado = await scrypt(String(contrasena ?? ""), sal, esperado.length);
  // timingSafeEqual: compara en tiempo constante, para no dar pistas por
  // cuánto tarda la respuesta.
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

// Clave para firmar los tokens de sesión: variable AUTH_SECRET.
//  - En producción (NODE_ENV=production) es obligatoria y tiene que medir al menos 32 caracteres: si falta o
//    es corta, el backend NO arranca (index.js llama a leerAuthSecret).
//  - En desarrollo y test, si falta, se deriva de DATABASE_URL (así funciona sin configurar nada y los tokens
//    siguen valiendo al reiniciar) y se avisa UNA sola vez por consola, sin imprimir ningún valor.
const LARGO_MINIMO_AUTH_SECRET = 32;
let advertidoAuthSecret = false;

function leerAuthSecret(env = process.env, { advertir = (m) => console.warn(m) } = {}) {
  const valor = String(env.AUTH_SECRET ?? "");
  if (env.NODE_ENV === "production") {
    if (!valor)
      throw new Error(
        "Falta AUTH_SECRET: en producción es obligatoria (con al menos 32 caracteres aleatorios). El backend no arranca sin ella."
      );
    if (valor.length < LARGO_MINIMO_AUTH_SECRET)
      throw new Error(`AUTH_SECRET es demasiado corta (${valor.length} caracteres): en producción tiene que tener al menos ${LARGO_MINIMO_AUTH_SECRET}.`);
    return valor;
  }
  if (valor) return valor;
  if (!advertidoAuthSecret) {
    advertidoAuthSecret = true;
    advertir(
      "[auth] AUTH_SECRET no está definida: la clave de las sesiones se deriva de DATABASE_URL (solo para entornos locales). " +
        "Definila en backend/.env; en producción es obligatoria."
    );
  }
  return `sgh-auth|${env.DATABASE_URL ?? ""}`;
}

let claveCacheada = null;
function claveFirma() {
  if (!claveCacheada) claveCacheada = crypto.createHash("sha256").update(leerAuthSecret()).digest();
  return claveCacheada;
}

function firmar(texto) {
  return crypto.createHmac("sha256", claveFirma()).update(texto).digest("base64url");
}

function firmarToken({ id, rol }) {
  const cuerpo = Buffer.from(JSON.stringify({ id, rol, exp: Date.now() + DURACION_SESION_MS })).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

// Devuelve { id, rol, exp } si el token es auténtico y no venció; si no, null.
function verificarToken(token) {
  if (typeof token !== "string") return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [cuerpo, firma] = partes;

  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;

  let datos;
  try {
    datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!datos || !Number.isInteger(datos.id) || typeof datos.exp !== "number") return null;
  if (datos.exp <= Date.now()) return null;
  return datos;
}

module.exports = {
  hashearContrasena,
  verificarContrasena,
  firmarToken,
  verificarToken,
  leerAuthSecret,
  LARGO_MINIMO_AUTH_SECRET,
};
