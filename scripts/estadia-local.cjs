// Entorno exclusivo para probar feature/estadia-ocupantes en esta computadora.
// No lee credenciales de .env ni permite apuntar a otro servidor.
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const destino = require('./entorno-estadia.cjs').cargarEntorno();
process.env.DATABASE_CONNECTION_LIMIT = '2';
process.env.PORT = '3000';
function disponible() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: 3308 });
    const terminar = ok => { socket.destroy(); resolve(ok); };
    socket.once('connect', () => terminar(true));
    socket.once('error', () => terminar(false));
    socket.setTimeout(500, () => terminar(false));
  });
}
async function iniciarBase() {
  if (await disponible()) return;
  const config = path.join(root, '.local/test-estadia-data/my.ini');
  const executable = path.join(root, '.local/mariadb-11.4.12-winx64/bin/mariadbd.exe');
  if (!fs.existsSync(config) || !fs.existsSync(executable)) throw new Error('Falta la instalación MariaDB local de pruebas (puerto 3308). Consultá PRUEBAS_ESTADIA_LOCAL.md.');
  const log = fs.openSync(path.join(root, '.local/estadia-mariadb.log'), 'a');
  const child = spawn(executable, [`--defaults-file=${config}`, '--bind-address=127.0.0.1', '--console'], { cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log] });
  let error;
  child.once('error', e => { error = e; }); child.unref(); fs.closeSync(log);
  for (let i = 0; i < 40; i++) {
    if (error) throw error;
    if (await disponible()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('MariaDB de pruebas no inició. Revisá .local/estadia-mariadb.log.');
}
function comando(args) {
  const resultado = spawnSync(process.execPath, args, { cwd: path.join(root, 'backend'), env: process.env, stdio: 'inherit', windowsHide: true });
  if (resultado.error || resultado.status !== 0) throw resultado.error || new Error('No se pudo preparar la base local.');
}
async function main() {
  if (!['setup', 'dev'].includes(process.argv[2])) throw new Error('Usá npm run setup:estadia o npm run dev:estadia.');
  await iniciarBase();
  if (process.argv[2] === 'setup') {
    const mariadb = require(require.resolve('mariadb', { paths: [path.join(root, 'backend')] }));
    const c = await mariadb.createConnection({ host: '127.0.0.1', port: 3308, user: decodeURIComponent(destino.username), password: decodeURIComponent(destino.password) });
    try { await c.query('CREATE DATABASE IF NOT EXISTS hotelhi_estadia_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); }
    finally { await c.end(); }
    comando(['node_modules/prisma/build/index.js', 'generate']);
    // Solo agrega el esquema de estadia sobre la base de tarifas ya preparada.
    comando(['scripts/actualizar-esquema-estadia.js', '--aplicar']);
    comando(['scripts/seed-estadia-local.js']);
  } else {
    console.log('PRUEBAS LOCALES: hotelhi_estadia_demo en 127.0.0.1:3308. Correos desactivados.');
    require('./dev.cjs');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
