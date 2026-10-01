const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const root = path.resolve(__dirname, "..");
const config = path.join(root, ".local/data/my.ini");
const executable = path.join(root, ".local/mariadb-11.4.12-winx64/bin/mariadbd.exe");

function listening() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: 3307 });
    const finish = (result) => { socket.destroy(); resolve(result); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

async function main() {
  if (!fs.existsSync(config) || !fs.existsSync(executable)) {
    throw new Error("MariaDB portatil no esta preparada. Consulta README.md para configurar una base existente.");
  }
  if (process.argv[2] === "stop") {
    if (!(await listening())) return;
    require("../backend/node_modules/dotenv").config({ path: path.join(root, "backend/.env"), quiet: true });
    const url = new URL(process.env.DATABASE_URL);
    if (url.hostname !== "127.0.0.1" || url.port !== "3307") throw new Error("La base configurada no es la base local del proyecto.");
    const backendRequire = require("node:module").createRequire(path.join(root, "backend/package.json"));
    const connection = await backendRequire("mariadb").createConnection({
      host: url.hostname, port: Number(url.port), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    });
    try { await connection.query("SHUTDOWN"); } finally { await connection.end(); }
    console.log("MariaDB local detenida.");
    return;
  }
  if (await listening()) { console.log("MariaDB local disponible en 127.0.0.1:3307."); return; }
  const log = fs.openSync(path.join(root, ".local/mariadb.log"), "a");
  const child = spawn(executable, [`--defaults-file=${config}`, "--console"], {
    cwd: root, detached: true, windowsHide: true, stdio: ["ignore", log, log],
  });
  let failure;
  child.once("error", (error) => { failure = error; });
  child.unref();
  fs.closeSync(log);
  for (let attempt = 0; attempt < 60; attempt++) {
    if (failure) throw failure;
    if (await listening()) { console.log("MariaDB local iniciada en 127.0.0.1:3307."); return; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("MariaDB no inicio. Revisa .local/mariadb.log.");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
