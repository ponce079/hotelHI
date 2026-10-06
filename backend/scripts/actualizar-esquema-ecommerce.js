// Migración aditiva y reejecutable del e-commerce: crea la tabla datos_reserva_web
// (backend/prisma/agregar-datos-reserva-web.sql). Sin --aplicar solo muestra el plan.
//
//   node scripts/actualizar-esquema-ecommerce.js             plan (no modifica nada)
//   node scripts/actualizar-esquema-ecommerce.js --aplicar   crea la tabla si falta
//
// Destino: DATABASE_URL de la terminal (no de .env). Misma guardia que la migración de estadía
// (_destinoMigracion.js): por defecto solo una base local; para otra hace falta
// CONFIRMAR_BASE_COMPARTIDA=<nombre-de-la-base> y escribir ese nombre por teclado (también en modo
// plan: conectarse ya es parte del despliegue). Nunca muestra usuario ni contraseña.
//
// Acepta ÚNICAMENTE el CREATE TABLE IF NOT EXISTS de datos_reserva_web. Si la tabla ya existe con
// otra forma, se niega: nunca la corrige ni la borra. No hace respaldo JSON porque no modifica
// ninguna tabla existente.
const fs = require("node:fs");
const path = require("node:path");

const TABLA = "datos_reserva_web";
const ARCHIVO_SQL = path.resolve(__dirname, "../prisma/agregar-datos-reserva-web.sql");

// Forma esperada de la tabla: tiene que coincidir con el .sql (lo verifica
// actualizar-esquema-ecommerce.test.js). tipo: como lo informa information_schema
// (los enteros sin ancho de visualización: int(11) y int se tratan igual, ver `normalizarTipo`).
const FORMA_ESPERADA = {
  tabla: TABLA,
  engine: "InnoDB",
  collation: "utf8mb4_unicode_ci",
  columnas: [
    { nombre: "id", tipo: "int", nulo: false, defecto: null, autoincremental: true },
    { nombre: "reservaId", tipo: "int", nulo: false, defecto: null },
    { nombre: "claveIdempotencia", tipo: "varchar(64)", nulo: false, defecto: null },
    { nombre: "emailContacto", tipo: "varchar(190)", nulo: false, defecto: null },
    { nombre: "telefonoContacto", tipo: "varchar(40)", nulo: false, defecto: null },
    { nombre: "horaEstimadaLlegada", tipo: "varchar(30)", nulo: true, defecto: null },
    { nombre: "solicitudesEspeciales", tipo: "varchar(500)", nulo: true, defecto: null },
    { nombre: "aceptaPoliticasEn", tipo: "datetime(3)", nulo: false, defecto: null },
    { nombre: "versionPoliticas", tipo: "varchar(20)", nulo: false, defecto: null },
    { nombre: "aceptaComunicaciones", tipo: "tinyint(1)", nulo: false, defecto: "0" },
    { nombre: "tarjetaTitular", tipo: "varchar(120)", nulo: true, defecto: null },
    { nombre: "tarjetaMarca", tipo: "varchar(20)", nulo: true, defecto: null },
    { nombre: "tarjetaUltimos4", tipo: "char(4)", nulo: true, defecto: null },
    { nombre: "tarjetaVencimiento", tipo: "varchar(7)", nulo: true, defecto: null },
    { nombre: "garantiaToken", tipo: "varchar(64)", nulo: true, defecto: null },
    { nombre: "pasarelaReferencia", tipo: "varchar(64)", nulo: true, defecto: null },
    { nombre: "creadoEn", tipo: "datetime(3)", nulo: false, defecto: "current_timestamp(3)" },
  ],
  // Todos los índices de la tabla (la FK reutiliza el único de reservaId, no crea otro).
  indices: [
    { nombre: "PRIMARY", unico: true, columnas: ["id"] },
    { nombre: "datos_reserva_web_reservaId_key", unico: true, columnas: ["reservaId"] },
    { nombre: "datos_reserva_web_claveIdempotencia_key", unico: true, columnas: ["claveIdempotencia"] },
  ],
  relaciones: [
    {
      nombre: "datos_reserva_web_reservaId_fkey",
      columna: "reservaId",
      tablaRef: "reservas",
      columnaRef: "id",
      alBorrar: "RESTRICT",
      alActualizar: "CASCADE",
    },
  ],
};

// (DELETE y UPDATE no van: aparecen legítimamente en `ON DELETE RESTRICT ON UPDATE CASCADE`.)
const PALABRAS_PROHIBIDAS = /\b(DROP|ALTER|INSERT|TRUNCATE|GRANT|REVOKE|RENAME|SELECT|REPLACE)\b/i;

// Lee y valida el .sql: una sola sentencia, CREATE TABLE IF NOT EXISTS `datos_reserva_web`.
// Se evalúa ANTES de conectarse a nada.
function operaciones(sql) {
  const sentencias = String(sql)
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const noReconocida = () => new Error("La actualización contiene una operación no aditiva o no reconocida.");
  if (sentencias.length !== 1) throw noReconocida();
  const [sentencia] = sentencias;
  if (!sentencia.startsWith(`CREATE TABLE IF NOT EXISTS \`${TABLA}\` (`) || PALABRAS_PROHIBIDAS.test(sentencia)) {
    throw noReconocida();
  }
  return [{ tipo: "tabla", tabla: TABLA, nombre: TABLA, sql: sentencia }];
}

// --- Forma de la tabla ----------------------------------------------------------------------
// Solo se normaliza la REPRESENTACIÓN (cada una con su motivo); nunca nombres, tipos, longitudes,
// NULL, índices, relaciones, engine ni collation.

// MySQL 8 informa `int`, MariaDB `int(11)`: mismo tipo con distinto ancho de visualización.
// (tinyint(1) y char/varchar/datetime conservan su longitud: ahí el número sí es parte del tipo.)
function normalizarTipo(tipo) {
  return String(tipo ?? "")
    .toLowerCase()
    .replace(/^(int|integer)\(\d+\)/, "int")
    .replace(/^integer$/, "int");
}

// Mayúsculas/minúsculas (MariaDB `current_timestamp(3)`, MySQL `CURRENT_TIMESTAMP(3)`), comillas
// del literal (MariaDB `'0'`) y `NULL` literal que MariaDB informa para una columna nula sin default.
// `false`/`0` del BOOLEAN: el .sql dice `false` y la base guarda `0`.
function normalizarDefecto(defecto, nulo) {
  if (defecto === null || defecto === undefined) return null;
  let d = String(defecto).trim().replace(/^'(.*)'$/, "$1").toLowerCase();
  if (nulo && d === "null") return null;
  if (d === "false") d = "0";
  if (d === "true") d = "1";
  return d;
}

const mayus = (v) => String(v ?? "").toUpperCase();
const lista = (v) => (v.length ? v.join(", ") : "(ninguno)");

// filas = { tabla: {nombre, engine, collation}, columnas: [...], indices: [...], relaciones: [...] }
// con la forma que arma `leerForma`. Devuelve la lista de diferencias (vacía = la forma esperada).
function compararForma(filas, esperada = FORMA_ESPERADA) {
  const dif = [];
  if (filas.tabla.engine !== esperada.engine) dif.push(`ENGINE: es ${filas.tabla.engine} y debería ser ${esperada.engine}.`);
  if (filas.tabla.collation !== esperada.collation) {
    dif.push(`COLLATION de la tabla: es ${filas.tabla.collation} y debería ser ${esperada.collation}.`);
  }

  const porNombre = new Map(filas.columnas.map((c) => [c.nombre, c]));
  for (const e of esperada.columnas) {
    const c = porNombre.get(e.nombre);
    if (!c) {
      dif.push(`Falta la columna ${e.nombre}.`);
      continue;
    }
    if (normalizarTipo(c.tipo) !== e.tipo) dif.push(`Columna ${e.nombre}: el tipo es ${c.tipo} y debería ser ${e.tipo}.`);
    if (c.nulo !== e.nulo) {
      dif.push(`Columna ${e.nombre}: es ${c.nulo ? "NULL" : "NOT NULL"} y debería ser ${e.nulo ? "NULL" : "NOT NULL"}.`);
    }
    const defecto = normalizarDefecto(c.defecto, c.nulo);
    if (defecto !== e.defecto) {
      dif.push(`Columna ${e.nombre}: el default es ${defecto ?? "ninguno"} y debería ser ${e.defecto ?? "ninguno"}.`);
    }
    if (Boolean(c.autoincremental) !== Boolean(e.autoincremental)) {
      dif.push(`Columna ${e.nombre}: ${e.autoincremental ? "debería ser AUTO_INCREMENT" : "no debería ser AUTO_INCREMENT"}.`);
    }
  }
  // Collation de las columnas de texto: una sola línea (heredan el de la tabla).
  const otroCollation = filas.columnas.filter((c) => c.collation && c.collation !== esperada.collation).map((c) => c.nombre);
  if (otroCollation.length) dif.push(`Collation de las columnas ${otroCollation.join(", ")}: no es ${esperada.collation}.`);
  const esperadas = new Set(esperada.columnas.map((c) => c.nombre));
  for (const c of filas.columnas) if (!esperadas.has(c.nombre)) dif.push(`Sobra la columna ${c.nombre}.`);

  const indices = new Map(filas.indices.map((i) => [i.nombre, i]));
  for (const e of esperada.indices) {
    const i = indices.get(e.nombre);
    if (!i) dif.push(`Falta el índice ${e.nombre}.`);
    else {
      if (i.unico !== e.unico) dif.push(`Índice ${e.nombre}: ${i.unico ? "es único y no debería" : "no es único y debería serlo"}.`);
      if (i.columnas.join(",") !== e.columnas.join(",")) {
        dif.push(`Índice ${e.nombre}: cubre (${lista(i.columnas)}) y debería cubrir (${lista(e.columnas)}).`);
      }
    }
  }
  const indicesEsperados = new Set(esperada.indices.map((i) => i.nombre));
  for (const i of filas.indices) if (!indicesEsperados.has(i.nombre)) dif.push(`Sobra el índice ${i.nombre} (${lista(i.columnas)}).`);

  const relaciones = new Map(filas.relaciones.map((r) => [r.nombre, r]));
  for (const e of esperada.relaciones) {
    const r = relaciones.get(e.nombre);
    if (!r) {
      dif.push(`Falta la clave foránea ${e.nombre}.`);
      continue;
    }
    if (r.columna !== e.columna || r.tablaRef !== e.tablaRef || r.columnaRef !== e.columnaRef) {
      dif.push(`Clave foránea ${e.nombre}: va de ${r.columna} a ${r.tablaRef}(${r.columnaRef}) y debería ir de ${e.columna} a ${e.tablaRef}(${e.columnaRef}).`);
    }
    if (mayus(r.alBorrar) !== e.alBorrar) dif.push(`Clave foránea ${e.nombre}: ON DELETE ${mayus(r.alBorrar)} y debería ser ${e.alBorrar}.`);
    if (mayus(r.alActualizar) !== e.alActualizar) {
      dif.push(`Clave foránea ${e.nombre}: ON UPDATE ${mayus(r.alActualizar)} y debería ser ${e.alActualizar}.`);
    }
  }
  const relacionesEsperadas = new Set(esperada.relaciones.map((r) => r.nombre));
  for (const r of filas.relaciones) if (!relacionesEsperadas.has(r.nombre)) dif.push(`Sobra la clave foránea ${r.nombre}.`);
  return dif;
}

// Cuatro consultas a information_schema (una por categoría), todas de solo lectura.
async function leerForma(conn) {
  const tabla = (
    await conn.query(
      "SELECT TABLE_NAME AS nombre, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES " +
        "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
      [TABLA],
    )
  )[0];
  if (!tabla) return null;
  const columnas = (
    await conn.query(
      "SELECT COLUMN_NAME AS nombre, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_DEFAULT AS defecto, EXTRA AS extra, " +
        "COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? " +
        "ORDER BY ORDINAL_POSITION",
      [TABLA],
    )
  ).map((c) => ({
    nombre: c.nombre,
    tipo: c.tipo,
    nulo: c.nulo === "YES",
    defecto: c.defecto,
    autoincremental: /auto_increment/i.test(c.extra ?? ""),
    collation: c.collation,
  }));
  const filasIndices = await conn.query(
    "SELECT INDEX_NAME AS nombre, NON_UNIQUE AS noUnico, COLUMN_NAME AS columna FROM information_schema.STATISTICS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME, SEQ_IN_INDEX",
    [TABLA],
  );
  const indices = [];
  for (const f of filasIndices) {
    let i = indices.find((x) => x.nombre === f.nombre);
    if (!i) indices.push((i = { nombre: f.nombre, unico: Number(f.noUnico) === 0, columnas: [] }));
    i.columnas.push(f.columna);
  }
  const relaciones = (
    await conn.query(
      "SELECT k.CONSTRAINT_NAME AS nombre, k.COLUMN_NAME AS columna, k.REFERENCED_TABLE_NAME AS tablaRef, " +
        "k.REFERENCED_COLUMN_NAME AS columnaRef, r.DELETE_RULE AS alBorrar, r.UPDATE_RULE AS alActualizar " +
        "FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r " +
        "ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME " +
        "WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=? AND k.REFERENCED_TABLE_NAME IS NOT NULL",
      [TABLA],
    )
  ).map((r) => ({ ...r }));
  return { tabla, columnas, indices, relaciones };
}

// "falta" | "igual" | "distinta" (con sus diferencias).
async function calcularPlan(conn) {
  const forma = await leerForma(conn);
  if (!forma) return { estado: "falta", diferencias: [] };
  const diferencias = compararForma(forma);
  return { estado: diferencias.length ? "distinta" : "igual", diferencias };
}

function leerSql() {
  return operaciones(fs.readFileSync(ARCHIVO_SQL, "utf8"));
}

async function conectar(u) {
  return require("mariadb").createConnection({
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    connectTimeout: 10000,
    socketTimeout: 30000,
  });
}

function mostrarDistinta(plan) {
  console.log(`La tabla ${TABLA} ya existe con una forma distinta: NO seguir.`);
  for (const d of plan.diferencias) console.log(`  - ${d}`);
  console.log("Este script nunca corrige ni borra una tabla existente: revisar con el equipo antes de continuar.");
}

async function main() {
  const inicio = Date.now();
  const aplicar = process.argv.includes("--aplicar");
  // Primero el archivo (sin conectarse a nada): si no es exactamente lo esperado, se niega.
  const pasos = leerSql();
  // Solo una base local, salvo el modo explícito de despliegue (CONFIRMAR_BASE_COMPARTIDA + teclado).
  // Sin --aplicar solo muestra el plan, pero igual pide la confirmación.
  const u = await require("./_destinoMigracion").exigirDestino(process.env, "la migración del e-commerce");
  const conn = await conectar(u);
  try {
    const plan = await calcularPlan(conn);
    if (plan.estado === "distinta") {
      mostrarDistinta(plan);
      process.exitCode = 1;
      return;
    }
    const faltan = plan.estado === "falta" ? pasos : [];
    console.log(`Operaciones faltantes: ${faltan.length} de ${pasos.length}`);
    for (const p of faltan) console.log(`${p.tipo}: ${p.tabla}\n${p.sql}`);
    if (!aplicar) return;
    if (!faltan.length) {
      console.log("Nada que aplicar.");
      return;
    }
    console.log("Sin respaldo JSON: esta migración solo crea una tabla nueva y no modifica ninguna tabla existente.");
    // DDL: MySQL lo confirma por sentencia. Si se corta, volver a ejecutar: el plan lo recalcula.
    for (const p of faltan) await conn.query(p.sql);
    const despues = await calcularPlan(conn);
    if (despues.estado === "distinta") {
      mostrarDistinta(despues);
      process.exitCode = 1;
      return;
    }
    const pendientes = despues.estado === "falta" ? pasos.length : 0;
    console.log(`Actualización terminada. Pendientes: ${pendientes} (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
    if (pendientes) process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

if (require.main === module)
  main().catch((e) => {
    console.error(`No se pudo actualizar el esquema: ${String(e.code || e.message).replace(/mysql:\/\/\S+/g, "<url oculta>")}`);
    process.exitCode = 1;
  });

module.exports = { operaciones, leerSql, leerForma, compararForma, calcularPlan, conectar, FORMA_ESPERADA, TABLA, ARCHIVO_SQL };
