// index.js
// Punto de entrada del backend (Sistema de Gestión Hotelera - Holiday Inn)

require("dotenv").config();

// Red de seguridad de proceso: sin esto, un error que no pase por ningún
// try/catch (ej. un evento "error" de socket de una conexión del pool de
// MariaDB que no está dentro de una transacción — ver el comentario en
// src/lib/prisma.js sobre por qué onConnectionError del adapter no cubre
// ese caso, solo cubre conexiones de $transaction) tira abajo TODO el
// proceso para todo el equipo, no solo la operación que falló — así se
// perdió el server completo con un ECONNABORTED sin capturar.
//
// Loguear y seguir corriendo es una desviación deliberada de lo que Node
// recomienda por default (matar el proceso tras un uncaughtException, por
// riesgo de estado interno inconsistente): acá cada request es stateless
// de punta a punta — no hay estado compartido en memoria entre requests
// más allá del pool de conexiones de Prisma — así que se prioriza que el
// resto del equipo no se quede sin servidor por un corte de red puntual
// contra la base remota. Si en el futuro aparece estado compartido real
// (cache en memoria, jobs con estado, etc.) hay que revisar este criterio.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException] Error no capturado — el servidor sigue corriendo:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection] Promesa rechazada sin catch — el servidor sigue corriendo:", reason);
});

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Detrás de un proxy inverso (TRUST_PROXY, opcional): sin esto el límite de intentos de /api/web ve una sola IP.
try {
  require("./src/lib/trustProxy").configurarTrustProxy(app);
} catch (error) {
  console.error(`[configuración] ${error.message}`);
  process.exit(1);
}

// Secreto de la pasarela de pagos simulada: en producción es obligatorio (PASARELA_TOKEN_SECRETO, 32+ caracteres).
try {
  require("./src/modulos/garantias/pasarelaSecreto").leerSecreto();
} catch (error) {
  console.error(`[configuración] ${error.message}`);
  process.exit(1);
}

// API cerrada (HU-106): todo /api exige sesión salvo la lista blanca de lib/apiCerrada.js (/api/web/* y el login).
// Va ANTES de leer el cuerpo y de las rutas: ninguna ruta nueva puede quedar abierta por olvido, y un pedido
// sin sesión se rechaza sin procesar nada.
const { apiCerrada } = require("./src/lib/apiCerrada");
app.use("/api", apiCerrada);

app.use(express.json());

// --- Rutas (patrón controller/service/routes, dentro de src/modulos): ver src/rutas.js ---
require("./src/rutas").montarRutas(app);

app.get("/", (req, res) => {
  res.json({ status: "ok", proyecto: "Sistema de Gestión Hotelera - Holiday Inn" });
});

// Middleware de errores de Express — va al final, después de todas las
// rutas (Express lo reconoce por tener 4 parámetros). Cada controlador ya
// atrapa sus propios errores con try/catch, así que en el uso normal esto
// no debería dispararse casi nunca; es la red de seguridad para lo que se
// cuele igual (JSON malformado de express.json(), un controlador nuevo que
// se olvide el catch) — sin esto esa request se quedaba colgada sin
// respuesta, o el error terminaba como una promesa rechazada suelta a
// nivel de proceso en vez de una respuesta 500 controlada al cliente.
app.use((err, req, res, next) => {
  console.error(`[error-handler] ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: "Ocurrió un error inesperado en el servidor." });
});

// Express 5 le pasa al callback el error de bind (puerto ocupado, sin permisos...). Si no se mira,
// se imprime "Servidor corriendo" aunque no se esté escuchando y el proceso sigue vivo sin atender nada.
app.listen(PORT, (error) => {
  if (error) {
    const motivo =
      error.code === "EADDRINUSE"
        ? "el puerto está ocupado. Cerrá la otra instancia o cambiá PORT en backend/.env."
        : error.message;
    console.error(`No se pudo iniciar el servidor en el puerto ${PORT}: ${motivo}`);
    process.exit(1);
  }
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// Red de seguridad de la reposición automática de centrales — ver
// src/lib/jobsStockMinimo.js. Se arranca después de levantar el server,
// no antes: no tiene que bloquear ni condicionar que el servidor escuche.
require("./src/lib/jobsStockMinimo").iniciarBarridoStockMinimoCentral();


// Red de seguridad de la reposición automática de centrales — ver
// src/lib/jobsStockMinimo.js. Se arranca después de levantar el server,
// no antes: no tiene que bloquear ni condicionar que el servidor escuche.
