const fs = require("node:fs");
const { operaciones, compararForma, calcularPlan, FORMA_ESPERADA, ARCHIVO_SQL } = require("./actualizar-esquema-ecommerce");

const sql = fs.readFileSync(ARCHIVO_SQL, "utf8");

// Lee el .sql real y arma la forma que describe, para compararla con FORMA_ESPERADA.
function formaDelSql(texto) {
  const cuerpo = texto.replace(/^--.*$/gm, "");
  const columnas = [];
  const indices = [];
  const relaciones = [];
  for (const linea of cuerpo.split("\n").map((l) => l.trim().replace(/,$/, ""))) {
    let m = linea.match(/^`(\w+)` (\w+(?:\(\d+\))?) (NOT NULL|NULL)(?: (AUTO_INCREMENT))?(?: DEFAULT (.+))?$/);
    if (m) {
      const tipo = { INTEGER: "int", BOOLEAN: "tinyint(1)" }[m[2]] ?? m[2].toLowerCase();
      const defecto = m[5] === undefined ? null : m[5] === "false" ? "0" : m[5].toLowerCase();
      columnas.push({ nombre: m[1], tipo, nulo: m[3] === "NULL", defecto, autoincremental: m[4] === "AUTO_INCREMENT" });
      continue;
    }
    m = linea.match(/^UNIQUE INDEX `(\w+)`\(`(\w+)`\)$/);
    if (m) indices.push({ nombre: m[1], unico: true, columnas: [m[2]] });
    m = linea.match(/^PRIMARY KEY \(`(\w+)`\)$/);
    if (m) indices.push({ nombre: "PRIMARY", unico: true, columnas: [m[1]] });
    m = linea.match(/^CONSTRAINT `(\w+)` FOREIGN KEY \(`(\w+)`\) REFERENCES `(\w+)`\(`(\w+)`\) ON DELETE (\w+) ON UPDATE (\w+)$/);
    if (m) relaciones.push({ nombre: m[1], columna: m[2], tablaRef: m[3], columnaRef: m[4], alBorrar: m[5], alActualizar: m[6] });
  }
  const collation = cuerpo.match(/COLLATE (\w+)/)[1];
  return { collation, columnas, indices, relaciones };
}

test("FORMA_ESPERADA coincide con el .sql (si cambia uno sin el otro, falla)", () => {
  const delSql = formaDelSql(sql);
  expect(delSql.columnas).toHaveLength(17);
  const conBandera = (lista) => lista.map((c) => ({ ...c, autoincremental: Boolean(c.autoincremental) }));
  expect(conBandera(FORMA_ESPERADA.columnas)).toEqual(conBandera(delSql.columnas));
  const ordenar = (lista) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
  expect(ordenar(FORMA_ESPERADA.indices)).toEqual(ordenar(delSql.indices));
  expect(FORMA_ESPERADA.relaciones).toEqual(delSql.relaciones);
  expect(FORMA_ESPERADA.collation).toBe(delSql.collation);
  expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS `datos_reserva_web`/);
});

test("operaciones() acepta solo el CREATE TABLE IF NOT EXISTS de datos_reserva_web", () => {
  const pasos = operaciones(sql);
  expect(pasos).toHaveLength(1);
  expect(pasos[0]).toMatchObject({ tipo: "tabla", tabla: "datos_reserva_web" });
  for (const mala of [
    `${sql}\nDROP TABLE reservas;`,
    `${sql}\nALTER TABLE \`reservas\` ADD COLUMN \`x\` INTEGER NULL;`,
    "DROP TABLE `datos_reserva_web`;",
    "CREATE TABLE IF NOT EXISTS `otra` (`id` INTEGER NOT NULL);",
    "CREATE TABLE `datos_reserva_web` (`id` INTEGER NOT NULL);",
    "CREATE TABLE IF NOT EXISTS `datos_reserva_web` (`id` INTEGER NOT NULL) AS SELECT 1;",
    "",
  ]) {
    expect(() => operaciones(mala)).toThrow(/no aditiva o no reconocida/);
  }
});

// Filas como las devuelve information_schema, armadas desde la forma esperada.
function filasDeLaBase() {
  const e = FORMA_ESPERADA;
  return {
    tabla: { nombre: e.tabla, engine: e.engine, collation: e.collation },
    columnas: e.columnas.map((c) => ({ ...c })),
    indices: e.indices.map((i) => ({ ...i })),
    relaciones: e.relaciones.map((r) => ({ ...r })),
  };
}

test("una tabla con la forma esperada no tiene diferencias, ni con las representaciones de MariaDB", () => {
  expect(compararForma(filasDeLaBase())).toEqual([]);
  const mariadb = filasDeLaBase();
  mariadb.columnas.find((c) => c.nombre === "id").tipo = "int(11)";
  mariadb.columnas.find((c) => c.nombre === "creadoEn").defecto = "CURRENT_TIMESTAMP(3)";
  mariadb.columnas.find((c) => c.nombre === "aceptaComunicaciones").defecto = "'0'";
  mariadb.columnas.find((c) => c.nombre === "garantiaToken").defecto = "NULL";
  expect(compararForma(mariadb)).toEqual([]);
});

test("cualquier diferencia real se informa (nunca se normaliza)", () => {
  const casos = [
    [(f) => (f.columnas.find((c) => c.nombre === "emailContacto").tipo = "varchar(255)"), /emailContacto: el tipo es varchar\(255\)/],
    [(f) => (f.columnas.find((c) => c.nombre === "telefonoContacto").nulo = true), /telefonoContacto: es NULL/],
    [(f) => (f.columnas.find((c) => c.nombre === "aceptaComunicaciones").defecto = "1"), /aceptaComunicaciones: el default es 1/],
    [(f) => f.columnas.pop(), /Falta la columna creadoEn/],
    [(f) => f.columnas.push({ nombre: "extra", tipo: "int", nulo: true, defecto: null }), /Sobra la columna extra/],
    [(f) => f.indices.pop(), /Falta el índice datos_reserva_web_claveIdempotencia_key/],
    [(f) => (f.indices[1].unico = false), /no es único/],
    [(f) => f.indices.push({ nombre: "otro", unico: false, columnas: ["emailContacto"] }), /Sobra el índice otro/],
    [(f) => (f.relaciones[0].alBorrar = "CASCADE"), /ON DELETE CASCADE y debería ser RESTRICT/],
    [(f) => (f.relaciones[0].alActualizar = "RESTRICT"), /ON UPDATE RESTRICT y debería ser CASCADE/],
    [(f) => (f.relaciones[0].tablaRef = "huespedes"), /va de reservaId a huespedes/],
    [(f) => f.relaciones.pop(), /Falta la clave foránea/],
    [(f) => (f.tabla.engine = "MyISAM"), /ENGINE: es MyISAM/],
    [(f) => (f.tabla.collation = "utf8mb4_general_ci"), /COLLATION de la tabla/],
  ];
  for (const [cambiar, esperado] of casos) {
    const filas = filasDeLaBase();
    cambiar(filas);
    expect(compararForma(filas).join("\n")).toMatch(esperado);
  }
});

test("calcularPlan distingue tabla faltante, igual y distinta con 4 consultas a information_schema", async () => {
  const f = filasDeLaBase();
  const conn = (forma) => ({
    query: jest.fn(async (q) =>
      q.includes("information_schema.TABLES")
        ? forma ? [forma.tabla] : []
        : q.includes("information_schema.COLUMNS")
          ? forma.columnas.map((c) => ({ nombre: c.nombre, tipo: c.tipo, nulo: c.nulo ? "YES" : "NO", defecto: c.defecto, extra: c.autoincremental ? "auto_increment" : "" }))
          : q.includes("information_schema.STATISTICS")
            ? forma.indices.flatMap((i) => i.columnas.map((columna) => ({ nombre: i.nombre, noUnico: i.unico ? 0 : 1, columna })))
            : forma.relaciones,
    ),
  });
  expect((await calcularPlan(conn(null))).estado).toBe("falta");
  const c = conn(f);
  expect((await calcularPlan(c)).estado).toBe("igual");
  expect(c.query).toHaveBeenCalledTimes(4);
  f.columnas.find((x) => x.nombre === "emailContacto").tipo = "text";
  const distinta = await calcularPlan(conn(f));
  expect(distinta.estado).toBe("distinta");
  expect(distinta.diferencias.join(" ")).toMatch(/emailContacto/);
});
