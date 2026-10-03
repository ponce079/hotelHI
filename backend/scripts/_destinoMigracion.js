// Destino de la migración de estadía y de su verificación previa.
//
// Por defecto, igual que siempre: solo una base local (misma guardia que db:push, _baseLocal.js).
// Para la base compartida hay un modo explícito, pensado para el despliegue
// (docs/despliegue-estadia.md):
//   - CONFIRMAR_BASE_COMPARTIDA=<nombre-de-la-base> tiene que coincidir con la base de DATABASE_URL;
//   - y, para lo que modifica la base, una confirmación por teclado: se muestra host y base (nunca
//     usuario ni contraseña) y hay que escribir el nombre de la base.
// Sin la variable, o con un nombre distinto, se niega. La variable no habilita nada por sí sola.
const { exigirBaseLocal } = require("./_baseLocal");

function preguntarPorTeclado(texto) {
  const readline = require("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(texto, (respuesta) => {
      rl.close();
      resolve(respuesta);
    });
  });
}

// Host y base, sin credenciales: lo único que se muestra del destino.
function describirDestino(url) {
  return { host: url.hostname, puerto: url.port || "3306", base: url.pathname.slice(1) };
}

async function exigirDestino(env = process.env, accion = "la migración", opciones = {}) {
  const { confirmarPorTeclado = true, preguntar = preguntarPorTeclado } = opciones;
  const confirmada = String(env.CONFIRMAR_BASE_COMPARTIDA ?? "").trim();
  if (!confirmada) return exigirBaseLocal(env, accion);
  if (!env.DATABASE_URL) throw new Error(`Definí explícitamente DATABASE_URL antes de ejecutar ${accion}.`);
  const url = new URL(env.DATABASE_URL);
  const { host, base } = describirDestino(url);
  if (confirmada !== base)
    throw new Error(
      `CONFIRMAR_BASE_COMPARTIDA ("${confirmada}") no coincide con la base de DATABASE_URL ("${base}"). No se ejecuta ${accion}.`,
    );
  if (confirmarPorTeclado) {
    const respuesta = await preguntar(
      `\nVas a ejecutar ${accion} sobre la base "${base}" en ${host}.\nEscribí el nombre de la base para confirmar: `,
    );
    if (String(respuesta ?? "").trim() !== base) throw new Error(`Confirmación cancelada: no se ejecuta ${accion}.`);
  }
  return url;
}

module.exports = { exigirDestino, describirDestino };
