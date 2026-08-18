import { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// El plan de MySQL compartido por el equipo solo permite 5 conexiones simultaneas en total.
// El driver "mariadb" abre hasta 10 por proceso por defecto: lo bajamos a 2 para que
// levantar el server (+ Prisma Studio en paralelo) no agote el limite del equipo.
// (mariadb.defaultOptions() no sirve aca: exige el prefijo "mariadb://" y nuestra
// DATABASE_URL usa "mysql://", como pide Prisma. Parseamos la URL nosotros mismos.)
const dbUrl = new URL(process.env.DATABASE_URL);

const adapter = new PrismaMariaDb({
  host: dbUrl.hostname,
  port: Number(dbUrl.port) || 3306,
  user: decodeURIComponent(dbUrl.username),
  password: decodeURIComponent(dbUrl.password),
  database: dbUrl.pathname.replace(/^\//, ""),
  connectionLimit: 2,
});

export const prisma = new PrismaClient({ adapter });
