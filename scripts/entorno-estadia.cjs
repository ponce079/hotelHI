const path = require("node:path");

function cargarEntorno(modo = "demo") {
  const dotenv = require("../backend/node_modules/dotenv");
  dotenv.config({
    path: path.resolve(__dirname, "../.env.estadia.local"),
    quiet: true,
  });
  const variable =
    modo === "test" ? "ESTADIA_TEST_DATABASE_URL" : "ESTADIA_DEMO_DATABASE_URL";
  if (!process.env[variable])
    throw new Error(`Definí ${variable} en .env.estadia.local.`);
  const destino = new URL(process.env[variable]);
  const base =
    modo === "test" ? "/hotelhi_adaptacion_test" : "/hotelhi_estadia_demo";
  if (
    destino.hostname !== "127.0.0.1" ||
    destino.port !== "3308" ||
    destino.pathname !== base
  ) {
    throw new Error(`Solo se admite la base local ${base} en 127.0.0.1:3308.`);
  }
  Object.assign(process.env, {
    DATABASE_URL: destino.href,
    DATABASE_SSL: "false",
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: "",
  });
  return destino;
}

module.exports = { cargarEntorno };
