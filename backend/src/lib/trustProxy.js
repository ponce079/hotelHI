// Configuración segura de "trust proxy" de Express (variable TRUST_PROXY, opcional).
//
// Detrás de un proxy inverso (Clever Cloud, nginx…) `req.ip` es la IP del proxy: el límite de
// intentos de /api/web (limiteIntentos.js) vería a todos los visitantes como una sola IP. Con
// TRUST_PROXY, Express toma la IP real de X-Forwarded-For, pero solo de los saltos de confianza.
//
//   (ausente, vacía o "false")  no se configura nada (uso local: cada cliente es su IP)
//   N entero >= 1               se confía en los N últimos saltos (por ejemplo, 1 = un proxy delante)
//   IPs o subredes con comas    se confía solo en esos proxies (ej. "10.0.0.0/8, 172.16.0.1")
//
// "true" se RECHAZA: confiaría en cualquier X-Forwarded-For y permitiría falsificar la IP para
// saltear el límite de intentos.
const net = require("node:net");

function esDireccion(valor) {
  const [ip, largo, ...resto] = valor.split("/");
  if (resto.length || !net.isIP(ip)) return false;
  if (largo === undefined) return true;
  const maximo = net.isIPv4(ip) ? 32 : 128;
  return /^\d{1,3}$/.test(largo) && Number(largo) <= maximo;
}

// Devuelve { valor } con lo que hay que pasar a app.set("trust proxy", valor), o { valor: null }
// si no hay que configurar nada. Lanza un Error con un mensaje claro si el valor no es válido.
function leerTrustProxy(env = process.env) {
  const crudo = String(env.TRUST_PROXY ?? "").trim();
  if (!crudo || crudo.toLowerCase() === "false") return { valor: null };
  if (crudo.toLowerCase() === "true") {
    throw new Error(
      'TRUST_PROXY="true" no está permitido: confiaría en cualquier X-Forwarded-For y permitiría falsificar la IP ' +
        "para saltear el límite de intentos. Usá la cantidad de proxies delante del backend (por ejemplo TRUST_PROXY=1) " +
        "o la lista de sus IPs o subredes.",
    );
  }
  if (/^\d+$/.test(crudo)) {
    const n = Number(crudo);
    if (n >= 1) return { valor: n };
    throw new Error('TRUST_PROXY=0 no es válido: dejá la variable vacía o "false" para no confiar en ningún proxy.');
  }
  const lista = crudo.split(",").map((s) => s.trim());
  if (lista.every(esDireccion)) return { valor: lista };
  throw new Error(
    `TRUST_PROXY tiene un valor inválido ("${crudo.slice(0, 60)}"). Valores admitidos: vacío o "false" (sin proxy), ` +
      "un entero mayor o igual a 1 (cantidad de proxies) o una lista de IPs o subredes separadas por comas.",
  );
}

// Se llama al arrancar, antes de montar las rutas. Si el valor es inválido, el backend no arranca.
function configurarTrustProxy(app, env = process.env) {
  const { valor } = leerTrustProxy(env);
  if (valor !== null) app.set("trust proxy", valor);
  return valor;
}

module.exports = { leerTrustProxy, configurarTrustProxy };
