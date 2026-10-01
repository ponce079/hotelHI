const { spawn, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

for (const file of [
  "backend/.env",
  "backend/node_modules/.prisma/client/default.js",
  "frontend/node_modules/vite/bin/vite.js",
]) {
  if (!existsSync(path.join(root, file))) {
    console.error(`Falta ${file}. Segui los pasos de README.md antes de iniciar.`);
    process.exit(1);
  }
}

require("../backend/node_modules/dotenv").config({ path: path.join(root, "backend/.env"), quiet: true });
const databaseUrl = new URL(process.env.DATABASE_URL);
if (
  databaseUrl.hostname === "127.0.0.1" &&
  databaseUrl.port === "3307" &&
  existsSync(path.join(root, ".local/data/my.ini"))
) {
  const result = spawnSync(process.execPath, [path.join(__dirname, "db-local.cjs")], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

const children = [
  spawn(process.execPath, ["--watch", "--watch-path=index.js", "--watch-path=src", "--watch-path=.env", "index.js"], {
    cwd: path.join(root, "backend"),
    stdio: "inherit",
  }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"], {
    cwd: path.join(root, "frontend"),
    stdio: "inherit",
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
