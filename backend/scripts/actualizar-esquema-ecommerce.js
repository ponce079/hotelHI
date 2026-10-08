// Migración aditiva y reejecutable del despliegue del e-commerce y la garantía con tarjeta: crea las
// cuatro tablas nuevas. Sin --aplicar solo muestra el plan.
//
//   datos_reserva_web      backend/prisma/agregar-datos-reserva-web.sql   (e-commerce)
//   garantias_reserva      backend/prisma/garantia-tarjeta.sql            (garantía de la reserva)
//   garantias_estadia      backend/prisma/garantia-tarjeta.sql            (garantía del check-in)
//   pasarela_operaciones   backend/prisma/pasarela-operaciones.sql        (registro de la pasarela simulada)
//
//   node scripts/actualizar-esquema-ecommerce.js             plan (no modifica nada)
//   node scripts/actualizar-esquema-ecommerce.js --aplicar   crea las tablas que falten
//
// Destino: DATABASE_URL de la terminal (no de .env). Misma guardia que la migración de estadía
// (_destinoMigracion.js): por defecto solo una base local; para otra hace falta
// CONFIRMAR_BASE_COMPARTIDA=<nombre-de-la-base> y escribir ese nombre por teclado (también en modo
// plan: conectarse ya es parte del despliegue). Nunca muestra usuario ni contraseña.
//
// Acepta ÚNICAMENTE sentencias CREATE TABLE IF NOT EXISTS de esas cuatro tablas (cada archivo, solo las
// suyas). Si una tabla ya existe con otra forma, se niega: nunca la corrige ni la borra. No hace respaldo
// JSON porque no modifica ninguna tabla existente.
const fs = require("node:fs");
const path = require("node:path");

const TABLA = "datos_reserva_web";
const ARCHIVO_SQL = path.resolve(__dirname, "../prisma/agregar-datos-reserva-web.sql");
const ARCHIVO_GARANTIAS = path.resolve(__dirname, "../prisma/garantia-tarjeta.sql");
const ARCHIVO_PASARELA = path.resolve(__dirname, "../prisma/pasarela-operaciones.sql");

// Cuántas y cuáles tablas trae cada archivo (el orden es el de aplicación).
const ARCHIVOS = [
  { archivo: ARCHIVO_SQL, tablas: ["datos_reserva_web"] },
  { archivo: ARCHIVO_GARANTIAS, tablas: ["garantias_reserva", "garantias_estadia"] },
  { archivo: ARCHIVO_PASARELA, tablas: ["pasarela_operaciones"] },
];
const TABLAS = ARCHIVOS.flatMap((a) => a.tablas);

const COLLATION = "utf8mb4_unicode_ci";
const columna = (nombre, tipo, nulo = false, defecto = null, extra = {}) => ({ nombre, tipo, nulo, defecto, ...extra });
const id = columna("id", "int", false, null, { autoincremental: true });
const fkAReservas = (tabla) => ({
  nombre: `${tabla}_reservaId_fkey`,
  columna: "reservaId",
  tablaRef: "reservas",
  columnaRef: "id",
  alBorrar: "RESTRICT",
  alActualizar: "CASCADE",
});

// Forma esperada de cada tabla: tiene que coincidir con su .sql (lo verifica
// actualizar-esquema-ecommerce.test.js, una por tabla). tipo: como lo informa information_schema
// (los enteros sin ancho de visualización: int(11) y int se tratan igual, ver `normalizarTipo`; los
// decimales sin espacios; los defectos de texto en minúsculas, sin comillas; los numéricos como número).
const FORMAS_ESPERADAS = {
  datos_reserva_web: {
    tabla: "datos_reserva_web",
    engine: "InnoDB",
    collation: COLLATION,
    columnas: [
      id,
      columna("reservaId", "int"),
      columna("claveIdempotencia", "varchar(64)"),
      columna("emailContacto", "varchar(190)"),
      columna("telefonoContacto", "varchar(40)"),
      columna("horaEstimadaLlegada", "varchar(30)", true),
      columna("solicitudesEspeciales", "varchar(500)", true),
      columna("aceptaPoliticasEn", "datetime(3)"),
      columna("versionPoliticas", "varchar(20)"),
      columna("aceptaComunicaciones", "tinyint(1)", false, "0"),
      columna("tarjetaTitular", "varchar(120)", true),
      columna("tarjetaMarca", "varchar(20)", true),
      columna("tarjetaUltimos4", "char(4)", true),
      columna("tarjetaVencimiento", "varchar(7)", true),
      columna("garantiaToken", "varchar(64)", true),
      columna("pasarelaReferencia", "varchar(64)", true),
      columna("creadoEn", "datetime(3)", false, "current_timestamp(3)"),
    ],
    // Todos los índices de la tabla (la FK reutiliza el único de reservaId, no crea otro).
    indices: [
      { nombre: "PRIMARY", unico: true, columnas: ["id"] },
      { nombre: "datos_reserva_web_reservaId_key", unico: true, columnas: ["reservaId"] },
      { nombre: "datos_reserva_web_claveIdempotencia_key", unico: true, columnas: ["claveIdempotencia"] },
    ],
    relaciones: [fkAReservas("datos_reserva_web")],
  },
  garantias_reserva: {
    tabla: "garantias_reserva",
    engine: "InnoDB",
    collation: COLLATION,
    columnas: [
      id,
      columna("reservaId", "int"),
      columna("tipo", "varchar(191)"),
      columna("token", "varchar(255)", true),
      columna("marca", "varchar(40)", true),
      columna("ultimos4", "varchar(4)", true),
      columna("vencimiento", "varchar(5)", true),
      columna("referencia", "varchar(191)", true),
      columna("monto", "decimal(12,2)", false, "0"),
      columna("estado", "varchar(191)", false, "vigente"),
      columna("creadoEn", "datetime(3)", false, "current_timestamp(3)"),
    ],
    indices: [
      { nombre: "PRIMARY", unico: true, columnas: ["id"] },
      { nombre: "garantias_reserva_reservaId_key", unico: true, columnas: ["reservaId"] },
    ],
    relaciones: [fkAReservas("garantias_reserva")],
  },
  garantias_estadia: {
    tabla: "garantias_estadia",
    engine: "InnoDB",
    collation: COLLATION,
    columnas: [
      id,
      columna("reservaId", "int"),
      columna("tipo", "varchar(191)"),
      columna("monto", "decimal(12,2)", false, "0"),
      columna("montoUsado", "decimal(12,2)", false, "0"),
      columna("token", "varchar(255)", true),
      columna("referencia", "varchar(191)", true),
      columna("marca", "varchar(40)", true),
      columna("ultimos4", "varchar(4)", true),
      columna("estado", "varchar(191)", false, "pendiente"),
      columna("creadoEn", "datetime(3)", false, "current_timestamp(3)"),
      columna("actualizadoEn", "datetime(3)"),
    ],
    indices: [
      { nombre: "PRIMARY", unico: true, columnas: ["id"] },
      { nombre: "garantias_estadia_reservaId_key", unico: true, columnas: ["reservaId"] },
    ],
    relaciones: [fkAReservas("garantias_estadia")],
  },
  pasarela_operaciones: {
    tabla: "pasarela_operaciones",
    engine: "InnoDB",
    collation: COLLATION,
    columnas: [
      id,
      columna("operacion", "varchar(20)"),
      columna("claveIdempotencia", "varchar(191)", true),
      columna("referencia", "varchar(40)", true),
      columna("referenciaPrevia", "varchar(255)", true),
      columna("monto", "decimal(12,2)", false, "0"),
      columna("aprobada", "tinyint(1)"),
      columna("motivo", "varchar(191)", true),
      columna("marca", "varchar(40)", true),
      columna("ultimos4", "char(4)", true),
      columna("token", "varchar(255)", true),
      columna("estadoPreautorizacion", "varchar(40)", true),
      columna("montoCapturado", "decimal(12,2)", true),
      columna("creadoEn", "datetime(3)", false, "current_timestamp(3)"),
      columna("actualizadoEn", "datetime(3)"),
    ],
    indices: [
      { nombre: "PRIMARY", unico: true, columnas: ["id"] },
      { nombre: "pasarela_operaciones_claveIdempotencia_key", unico: true, columnas: ["claveIdempotencia"] },
      { nombre: "pasarela_operaciones_referencia_key", unico: true, columnas: ["referencia"] },
    ],
    relaciones: [],
  },
};
// La tabla del e-commerce original (compatibilidad con quien importa FORMA_ESPERADA).
const FORMA_ESPERADA = FORMAS_ESPERADAS.datos_reserva_web;

// (DELETE y UPDATE no van: aparecen legítimamente en `ON DELETE RESTRICT ON UPDATE CASCADE`.)
const PALABRAS_PROHIBIDAS = /\b(DROP|ALTER|INSERT|TRUNCATE|GRANT|REVOKE|RENAME|SELECT|REPLACE)\b/i;

// Lee y valida el texto de UN .sql: solo sentencias CREATE TABLE IF NOT EXISTS de las tablas que ese archivo
// trae (ni más, ni menos, ni repetidas). Se evalúa ANTES de conectarse a nada.
function operaciones(sql, tablas = [TABLA]) {
  const sentencias = String(sql)
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const noReconocida = () => new Error("La actualización contiene una operación no aditiva o no reconocida.");
  if (sentencias.length !== tablas.length) throw noReconocida();
  const vistas = new Set();
  const pasos = [];
  for (const sentencia of sentencias) {
    const m = sentencia.match(/^CREATE TABLE IF NOT EXISTS `(\w+)` \(/);
    if (!m || !tablas.includes(m[1]) || vistas.has(m[1]) || PALABRAS_PROHIBIDAS.test(sentencia)) throw noReconocida();
    vistas.add(m[1]);
    pasos.push({ tipo: "tabla", tabla: m[1], nombre: m[1], sql: sentencia });
  }
  return pasos;
}

// Lee los tres archivos del despliegue y devuelve las cuatro operaciones, en orden.
function leerSql() {
  return ARCHIVOS.flatMap(({ archivo, tablas }) => operaciones(fs.readFileSync(archivo, "utf8"), tablas));
}

// --- Forma de las tablas ----------------------------------------------------------------------
// Solo se normaliza la REPRESENTACIÓN (cada una con su motivo); nunca nombres, tipos, longitudes,
// NULL, índices, relaciones, engine ni collation.

// MySQL 8 informa `int`, MariaDB `int(11)`: mismo tipo con distinto ancho de visualización.
// (tinyint(1) y char/varchar/datetime conservan su longitud: ahí el número sí es parte del tipo.)
function normalizarTipo(tipo) {
  return String(tipo ?? "")
    .toLowerCase()
    .replace(/\s/g, "")
    .replace(/^(int|integer)\(\d+\)/, "int")
    .replace(/^integer$/, "int");
}

// Mayúsculas/minúsculas (MariaDB `current_timestamp(3)`, MySQL `CURRENT_TIMESTAMP(3)`), comillas
// del literal (MariaDB `'0'`), `NULL` literal que MariaDB informa para una columna nula sin default,
// `false`/`0` del BOOLEAN y `0.00` de un DECIMAL(12,2) con DEFAULT 0 (el .sql dice 0 y la base guarda 0.00).
function normalizarDefecto(defecto, nulo) {
  if (defecto === null || defecto === undefined) return null;
  let d = String(defecto).trim().replace(/^'(.*)'$/, "$1").toLowerCase();
  if (nulo && d === "null") return null;
  if (d === "false") d = "0";
  if (d === "true") d = "1";
  if (/^-?\d+(\.\d+)?$/.test(d)) d = String(Number(d));
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
async function leerForma(conn, nombreTabla = TABLA) {
  const tabla = (
    await conn.query(
      "SELECT TABLE_NAME AS nombre, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES " +
        "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?",
      [nombreTabla],
    )
  )[0];
  if (!tabla) return null;
  const columnas = (
    await conn.query(
      "SELECT COLUMN_NAME AS nombre, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_DEFAULT AS defecto, EXTRA AS extra, " +
        "COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? " +
        "ORDER BY ORDINAL_POSITION",
      [nombreTabla],
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
    [nombreTabla],
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
      [nombreTabla],
    )
  ).map((r) => ({ ...r }));
  return { tabla, columnas, indices, relaciones };
}

// Estado de UNA tabla: "falta" | "igual" | "distinta" (con sus diferencias).
async function planDeTabla(conn, nombreTabla) {
  const forma = await leerForma(conn, nombreTabla);
  if (!forma) return { tabla: nombreTabla, estado: "falta", diferencias: [] };
  const diferencias = compararForma(forma, FORMAS_ESPERADAS[nombreTabla]);
  return { tabla: nombreTabla, estado: diferencias.length ? "distinta" : "igual", diferencias };
}

// Estado de las cuatro tablas: { estado, tablas: [{tabla, estado, diferencias}] }.
// estado = "distinta" si alguna lo es (no se sigue), si no "falta" si falta alguna, si no "igual".
async function calcularPlan(conn) {
  const tablas = [];
  for (const nombre of TABLAS) tablas.push(await planDeTabla(conn, nombre));
  const estado = tablas.some((t) => t.estado === "distinta") ? "distinta" : tablas.some((t) => t.estado === "falta") ? "falta" : "igual";
  return { estado, tablas, diferencias: tablas.flatMap((t) => t.diferencias.map((d) => `${t.tabla}: ${d}`)) };
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
  for (const t of plan.tablas.filter((x) => x.estado === "distinta")) {
    console.log(`La tabla ${t.tabla} ya existe con una forma distinta: NO seguir.`);
    for (const d of t.diferencias) console.log(`  - ${d}`);
  }
  console.log("Este script nunca corrige ni borra una tabla existente: revisar con el equipo antes de continuar.");
}

// Las operaciones que faltan (las de las tablas que no existen), en el orden de aplicación.
function operacionesFaltantes(pasos, plan) {
  const faltan = new Set(plan.tablas.filter((t) => t.estado === "falta").map((t) => t.tabla));
  return pasos.filter((p) => faltan.has(p.tabla));
}

async function main() {
  const inicio = Date.now();
  const aplicar = process.argv.includes("--aplicar");
  // Primero los archivos (sin conectarse a nada): si no son exactamente lo esperado, se niega.
  const pasos = leerSql();
  // Solo una base local, salvo el modo explícito de despliegue (CONFIRMAR_BASE_COMPARTIDA + teclado).
  // Sin --aplicar solo muestra el plan, pero igual pide la confirmación.
  const u = await require("./_destinoMigracion").exigirDestino(process.env, "la migración del e-commerce y las garantías");
  const conn = await conectar(u);
  try {
    const plan = await calcularPlan(conn);
    if (plan.estado === "distinta") {
      mostrarDistinta(plan);
      process.exitCode = 1;
      return;
    }
    const faltan = operacionesFaltantes(pasos, plan);
    console.log(`Operaciones faltantes: ${faltan.length} de ${pasos.length}`);
    for (const p of faltan) console.log(`${p.tipo}: ${p.tabla}\n${p.sql}`);
    if (!aplicar) return;
    if (!faltan.length) {
      console.log("Nada que aplicar.");
      return;
    }
    console.log("Sin respaldo JSON: esta migración solo crea tablas nuevas y no modifica ninguna tabla existente.");
    // DDL: MySQL lo confirma por sentencia. Si se corta, volver a ejecutar: el plan lo recalcula.
    for (const p of faltan) await conn.query(p.sql);
    const despues = await calcularPlan(conn);
    if (despues.estado === "distinta") {
      mostrarDistinta(despues);
      process.exitCode = 1;
      return;
    }
    const pendientes = despues.tablas.filter((t) => t.estado === "falta").length;
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

module.exports = {
  operaciones,
  leerSql,
  leerForma,
  compararForma,
  calcularPlan,
  planDeTabla,
  operacionesFaltantes,
  conectar,
  normalizarDefecto,
  FORMA_ESPERADA,
  FORMAS_ESPERADAS,
  TABLA,
  TABLAS,
  ARCHIVOS,
  ARCHIVO_SQL,
};
