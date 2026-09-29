// src/lib/prisma.js
// Prisma 7 requiere pasar explícitamente un "driver adapter" al constructor
// de PrismaClient. Para MySQL/MariaDB (como Clever Cloud) se usa
// @prisma/adapter-mariadb. Clever Cloud exige conexión SSL, y el plan
// gratuito tiene más latencia que una base local, por eso los timeouts
// están ajustados más arriba de lo normal.

const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el .env");
}

const dbUrl = new URL(process.env.DATABASE_URL);

const adapter = new PrismaMariaDb(
  {
    host: dbUrl.hostname,
    port: Number(dbUrl.port) || 3306,
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: dbUrl.pathname.replace(/^\//, ""),
    ssl: process.env.DATABASE_SSL === "false" ? false : {
      rejectUnauthorized: false,
    },
    // La base remota es compartida por varios integrantes; una conexión
    // por proceso evita agotar el cupo global del plan de Clever Cloud.
    connectionLimit: 1,
    connectTimeout: 30000,
    acquireTimeout: 30000,
  },
  {
    // Único hook de error que expone el adapter (ver
    // node_modules/@prisma/adapter-mariadb/dist/index.d.ts) — y su propio
    // comentario aclara que solo cubre la conexión de una transacción
    // (prisma.$transaction), no las conexiones sueltas del pool fuera de
    // una transacción ni un evento de error de background del pool en sí
    // (el adapter no expone ese pool crudo hacia afuera). Server no crashea
    // sin esto igual — la conexión de una transacción ya tiene su propio
    // listener interno (conn.on("error", ...) en el adapter) aunque no le
    // pasemos nada acá; esto solo agrega logging específico en vez de que
    // el error de esa conexión se pierda en silencio. La red real contra un
    // error de socket fuera de una transacción es process.on(...) en index.js.
    onConnectionError: (err) => {
      console.error("[mariadb] Error en la conexión de una transacción:", err.message);
    },
  }
);

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
