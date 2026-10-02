// Guardia compartida por los scripts que modifican la estructura de la base
// (actualizar-esquema-estadia.js, db-push.js): solo corren contra una base local.
const HOSTS_LOCALES = ["127.0.0.1", "localhost", "[::1]"];

function exigirBaseLocal(env = process.env, accion = "la migración") {
  if (!env.DATABASE_URL) {
    throw new Error(`Definí explícitamente DATABASE_URL para la base local antes de ejecutar ${accion}.`);
  }
  const url = new URL(env.DATABASE_URL);
  if (!HOSTS_LOCALES.includes(url.hostname)) {
    throw new Error(
      "Esta ejecución solo admite una base local. El despliegue compartido debe coordinarse por separado.",
    );
  }
  return url;
}

module.exports = { exigirBaseLocal, HOSTS_LOCALES };
