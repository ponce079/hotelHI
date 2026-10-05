// Protección del canal público (HU-106 — Tomás, etapa 4): límite de intentos
// por IP en /api/web. Responde 429 DEMASIADOS_INTENTOS (CONTRATO.md →
// Errores) con `reintentarEn` (segundos) y el header Retry-After.
//
// Dos límites por grupo de rutas, en ventanas deslizantes:
//   - pedidos: cuántos pedidos acepta en la ventana (frena el abuso y los bots);
//   - fallos:  cuántas respuestas "sospechosas" tolera. En el alta, las
//     tarjetas rechazadas (402), las que vencen antes de la salida (422) y los
//     números inválidos (400 con campo tarjeta.*): así se frena el "card
//     testing" (probar tarjetas robadas). En Mi reserva, los 404: así se frena
//     el probar códigos de reserva al azar.
//
// El estado vive en memoria del proceso (como la pasarela simulada): se
// pierde al reiniciar y no se comparte entre instancias. Alcanza para un
// solo servidor; con varios habría que pasarlo a un almacén compartido.
// Nunca guarda ni loguea el body: solo IP, grupo y horarios.

const MINUTO = 60 * 1000;

const CODIGO = "DEMASIADOS_INTENTOS";
const MENSAJE = "Hiciste demasiados intentos seguidos. Esperá unos minutos y volvé a intentar.";

// Límites por grupo. Los del alta y Mi reserva son estrictos a propósito: un
// huésped real confirma una reserva en 1 o 2 intentos y consulta la suya
// pocas veces.
const LIMITES = {
  consulta: { pedidos: 120, ventanaMs: 1 * MINUTO }, // tipos, planes, disponibilidad
  cotizar: { pedidos: 30, ventanaMs: 1 * MINUTO },
  reserva: { pedidos: 10, ventanaMs: 10 * MINUTO, fallos: 5, ventanaFallosMs: 30 * MINUTO },
  miReserva: { pedidos: 20, ventanaMs: 15 * MINUTO, fallos: 8, ventanaFallosMs: 15 * MINUTO },
};

// ¿La respuesta cuenta como fallo sospechoso para el grupo?
function esFallo(grupo, status, cuerpo) {
  if (grupo === "reserva") {
    if (status === 402 || status === 422) return true;
    return status === 400 && typeof cuerpo?.campo === "string" && cuerpo.campo.startsWith("tarjeta.");
  }
  if (grupo === "miReserva") return status === 404;
  return false;
}

const MAX_CLAVES = 50000; // tope de memoria: más allá, se descartan las más viejas
const BARRIDO_CADA = 500; // cada cuántos pedidos se limpian las claves vencidas

function ipDe(req) {
  return String(req.ip || req.socket?.remoteAddress || "desconocida");
}

// `ahora` es inyectable para los tests. `desactivado` deja pasar todo (para
// pruebas de carga locales: WEB_LIMITE_INTENTOS=off en backend/.env).
function crearLimitador({ limites = LIMITES, ahora = () => Date.now(), desactivado = () => process.env.WEB_LIMITE_INTENTOS === "off" } = {}) {
  // clave → array de instantes (ms), ordenado de más viejo a más nuevo.
  const pedidos = new Map();
  const fallos = new Map();
  const avisados = new Map(); // clave → hasta cuándo ya se logueó el bloqueo
  let contador = 0;

  function vigentes(mapa, clave, ventanaMs, t) {
    const lista = mapa.get(clave);
    if (!lista) return [];
    const desde = t - ventanaMs;
    let i = 0;
    while (i < lista.length && lista[i] <= desde) i += 1;
    if (i > 0) lista.splice(0, i);
    if (lista.length === 0) mapa.delete(clave);
    return lista;
  }

  function anotar(mapa, clave, t) {
    const lista = mapa.get(clave);
    if (lista) lista.push(t);
    else {
      if (mapa.size >= MAX_CLAVES) mapa.delete(mapa.keys().next().value);
      mapa.set(clave, [t]);
    }
  }

  function barrer(t) {
    for (const [grupo, limite] of Object.entries(limites)) {
      for (const clave of [...pedidos.keys()].filter((c) => c.startsWith(`${grupo}:`))) vigentes(pedidos, clave, limite.ventanaMs, t);
      if (limite.fallos) {
        for (const clave of [...fallos.keys()].filter((c) => c.startsWith(`${grupo}:`))) vigentes(fallos, clave, limite.ventanaFallosMs, t);
      }
    }
    for (const [clave, hasta] of avisados) if (hasta <= t) avisados.delete(clave);
  }

  // Segundos hasta que se libera un lugar (el más viejo sale de la ventana).
  const esperaDe = (lista, ventanaMs, t) => Math.max(1, Math.ceil((lista[0] + ventanaMs - t) / 1000));

  function bloquear(res, clave, grupo, segundos, t) {
    if (!avisados.has(clave)) {
      avisados.set(clave, t + segundos * 1000);
      console.warn(`[ecommerce] Límite de intentos alcanzado (${grupo}) para ${clave.slice(grupo.length + 1)}: bloqueo de ${segundos} s.`);
    }
    res.set("Retry-After", String(segundos));
    return res.status(429).json({ error: MENSAJE, codigo: CODIGO, reintentarEn: segundos });
  }

  function limitar(grupo) {
    const limite = limites[grupo];
    if (!limite) throw new Error(`Grupo de límite desconocido: ${grupo}`);

    return function limiteIntentos(req, res, next) {
      if (desactivado()) return next();
      const t = ahora();
      contador += 1;
      if (contador % BARRIDO_CADA === 0) barrer(t);

      const clave = `${grupo}:${ipDe(req)}`;

      if (limite.fallos) {
        const listaFallos = vigentes(fallos, clave, limite.ventanaFallosMs, t);
        if (listaFallos.length >= limite.fallos) {
          return bloquear(res, clave, grupo, esperaDe(listaFallos, limite.ventanaFallosMs, t), t);
        }
      }
      const listaPedidos = vigentes(pedidos, clave, limite.ventanaMs, t);
      if (listaPedidos.length >= limite.pedidos) {
        return bloquear(res, clave, grupo, esperaDe(listaPedidos, limite.ventanaMs, t), t);
      }
      anotar(pedidos, clave, t);

      // Para contar los fallos se mira la respuesta (status y, en el alta, el
      // `campo` del error). Solo se lee: el cuerpo se manda tal cual.
      if (limite.fallos) {
        const jsonOriginal = res.json.bind(res);
        res.json = (cuerpo) => {
          if (esFallo(grupo, res.statusCode, cuerpo)) anotar(fallos, clave, ahora());
          return jsonOriginal(cuerpo);
        };
      }
      return next();
    };
  }

  return { limitar, _soloTest: { pedidos, fallos } };
}

// Limitador único del proceso (lo usan las rutas de /api/web).
const limitadorWeb = crearLimitador();

module.exports = { crearLimitador, limitar: limitadorWeb.limitar, LIMITES, CODIGO, MENSAJE, esFallo };
