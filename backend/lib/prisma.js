// lib/prisma.js
// Prisma 7 requiere pasar explícitamente un "driver adapter" al constructor
// de PrismaClient (ya no conecta solo con la DATABASE_URL del schema).
// Para MySQL/MariaDB (como Clever Cloud) se usa @prisma/adapter-mariadb.
// Clever Cloud exige conexión SSL, por eso el bloque "ssl" es necesario
// (sin esto, la conexión se queda colgada hasta hacer timeout).

const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

if (!process.env.DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el .env");
}

const dbUrl = new URL(process.env.DATABASE_URL);

const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: Number(dbUrl.port) || 3306,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ""),
  ssl: {
    rejectUnauthorized: false,
  },
  connectionLimit: 3,
  connectTimeout: 20000,
  acquireTimeout: 20000,
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;