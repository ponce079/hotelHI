// Entorno de las pruebas de integración (pruebas-estadia-integracion.js).
//
// Corren contra CUALQUIER base local que se indique con ESTADIA_TEST_DATABASE_URL (en el entorno
// o en .env.estadia.local, que Git ignora). Nunca leen backend/.env ni envían correos: así no
// pueden apuntar por accidente a la base compartida. La guardia de host local es la misma que
// usan la migración y db:push.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { exigirBaseLocal } = require("./_baseLocal");

function cargarEntornoDePruebas() {
  require("dotenv").config({ path: path.resolve(__dirname, "../../.env.estadia.local"), quiet: true });
  const url = process.env.ESTADIA_TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Definí ESTADIA_TEST_DATABASE_URL con la URL de una base LOCAL de pruebas " +
        "(por ejemplo mysql://usuario:clave@127.0.0.1:3306/hotelhi_pruebas), en el entorno o en .env.estadia.local.",
    );
  }
  exigirBaseLocal({ DATABASE_URL: url }, "las pruebas de integración");
  Object.assign(process.env, {
    DATABASE_URL: url,
    DATABASE_SSL: "false",
    DATABASE_CONNECTION_LIMIT: process.env.DATABASE_CONNECTION_LIMIT || "5",
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "",
  });
}

// Completa en esa base las tablas y columnas de estadía que falten (aditivo y reejecutable).
// La base tiene que tener ya las tablas del resto del sistema (npm run db:push contra esa base).
function prepararEsquema() {
  const resultado = spawnSync(process.execPath, [path.join(__dirname, "actualizar-esquema-estadia.js"), "--aplicar"], {
    env: process.env,
    encoding: "utf8",
  });
  if (resultado.status !== 0) {
    throw new Error(`No se pudo preparar el esquema de la base de pruebas.\n${resultado.stdout}${resultado.stderr}`);
  }
}

module.exports = { cargarEntornoDePruebas, prepararEsquema };
