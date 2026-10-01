// Actualización aditiva y reejecutable. Sin --aplicar solo muestra el plan.
const fs = require('node:fs');
const path = require('node:path');

function operaciones(sql) {
  const sentencias = sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);
  return sentencias.flatMap(sentencia => {
    let m = sentencia.match(/^CREATE TABLE `([^`]+)`/);
    if (m) return [{ tipo: 'tabla', tabla: m[1], nombre: m[1], sql: sentencia }];
    m = sentencia.match(/^ALTER TABLE `([^`]+)` (ADD COLUMN [\s\S]+)$/);
    if (m) return m[2].split(/,\s*(?=ADD COLUMN)/).map(def => {
      const columna = def.match(/^ADD COLUMN `([^`]+)`/);
      if (!columna) throw new Error('Definición de columna no reconocida.');
      return { tipo: 'columna', tabla: m[1], nombre: columna[1], sql: `ALTER TABLE \`${m[1]}\` ${def}` };
    });
    m = sentencia.match(/^CREATE UNIQUE INDEX `([^`]+)` ON `([^`]+)`/);
    if (m) return [{ tipo: 'indice', tabla: m[2], nombre: m[1], sql: sentencia }];
    m = sentencia.match(/^ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` FOREIGN KEY/);
    if (m) return [{ tipo: 'relacion', tabla: m[1], nombre: m[2], sql: sentencia }];
    throw new Error('La actualización contiene una operación no aditiva o no reconocida.');
  });
}

async function pendientes(conn, pasos) {
  const tablas = new Set((await conn.query('SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()')).map(r => r.nombre));
  const columnas = new Set((await conn.query('SELECT TABLE_NAME AS tabla,COLUMN_NAME AS nombre FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()')).map(r => `${r.tabla}.${r.nombre}`));
  const indices = new Set((await conn.query('SELECT TABLE_NAME AS tabla,INDEX_NAME AS nombre FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()')).map(r => `${r.tabla}.${r.nombre}`));
  const relaciones = new Set((await conn.query("SELECT TABLE_NAME AS tabla,CONSTRAINT_NAME AS nombre FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='FOREIGN KEY'")).map(r => `${r.tabla}.${r.nombre}`));
  return pasos.filter(p => {
    if (p.tipo === 'tabla') return !tablas.has(p.tabla);
    if (!tablas.has(p.tabla) && !pasos.some(t => t.tipo === 'tabla' && t.tabla === p.tabla)) throw new Error(`Falta la tabla base ${p.tabla}; revisar la configuración antes de continuar.`);
    const conjunto = { columna: columnas, indice: indices, relacion: relaciones }[p.tipo];
    return !conjunto.has(`${p.tabla}.${p.nombre}`);
  });
}

async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const u = new URL(process.env.DATABASE_URL);
  const conn = await require('mariadb').createConnection({
    host: u.hostname, port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1),
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    connectTimeout: 10000, socketTimeout: 30000,
  });
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, '../prisma/estadia-ocupantes-cargos.sql'), 'utf8');
    const plan = await pendientes(conn, operaciones(sql));
    console.log(`Operaciones faltantes: ${plan.length}`);
    for (const p of plan) console.log(`${p.tipo}: ${p.tabla}.${p.nombre}`);
    if (!process.argv.includes('--aplicar')) return;
    // MySQL confirma DDL por sentencia. Si se interrumpe, volver a ejecutar:
    // la inspección anterior omite los cambios que ya quedaron aplicados.
    for (const p of plan) await conn.query(p.sql);
    console.log(`Actualización terminada. Pendientes: ${(await pendientes(conn, operaciones(sql))).length}`);
  } finally { await conn.end(); }
}
if (require.main === module) main().catch(e => { console.error(`No se pudo actualizar el esquema: ${e.code || e.message}`); process.exitCode = 1; });
module.exports = { operaciones, pendientes };
