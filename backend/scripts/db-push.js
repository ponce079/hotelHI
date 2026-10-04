// Reemplaza a "prisma db push" directo: se niega a correr si DATABASE_URL no apunta a un host local,
// para no sincronizar el schema contra la base compartida por accidente.
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { exigirBaseLocal } = require("./_baseLocal");

const backend = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(backend, ".env"), quiet: true });

try {
  exigirBaseLocal(process.env, "db push");
} catch (error) {
  console.error(`db push cancelado: ${error.message}`);
  process.exit(1);
}

const prisma = require.resolve("prisma/build/index.js", { paths: [backend] });
const resultado = spawnSync(process.execPath, [prisma, "db", "push", ...process.argv.slice(2)], {
  cwd: backend,
  stdio: "inherit",
});
process.exit(resultado.status ?? 1);
