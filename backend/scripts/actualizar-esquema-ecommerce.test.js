const fs = require("node:fs");
const {
  operaciones,
  leerSql,
  compararForma,
  calcularPlan,
  operacionesFaltantes,
  FORMAS_ESPERADAS,
  ARCHIVOS,
  TABLAS,
} = require("./actualizar-esquema-ecommerce");

const SQL = Object.fromEntries(ARCHIVOS.map((a) => [a.tablas.join("+"), fs.readFileSync(a.archivo, "utf8")]));
const sqlDe = (tabla) => ARCHIVOS.find((a) => a.tablas.includes(tabla));

// Lee el .sql real y arma la forma de UNA tabla, para compararla con su FORMA_ESPERADA.
function formaDelSql(texto, tabla) {
  const sentencia = texto
    .replace(/^--.*$/gm, "")
    .split(";")
    .find((s) => s.includes(`CREATE TABLE IF NOT EXISTS \`${tabla}\``));
  const columnas = [];
  const indices = [];
  const relaciones = [];
  for (const linea of sentencia.split("\n").map((l) => l.trim().replace(/,$/, ""))) {
    let m = linea.match(/^`(\w+)` (\w+(?:\(\d+(?:, ?\d+)?\))?) (NOT NULL|NULL)(?: (AUTO_INCREMENT))?(?: DEFAULT (.+))?$/);
    if (m) {
      const tipo = { INTEGER: "int", BOOLEAN: "tinyint(1)" }[m[2]] ?? m[2].toLowerCase().replace(/\s/g, "");
      const defecto = m[5] === undefined ? null : m[5] === "false" ? "0" : m[5].replace(/^'(.*)'$/, "$1").toLowerCase();
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
  const collation = sentencia.match(/COLLATE (\w+)/)[1];
  return { collation, columnas, indices, relaciones };
}

const CANTIDAD_DE_COLUMNAS = { datos_reserva_web: 17, garantias_reserva: 11, garantias_estadia: 12, pasarela_operaciones: 15 };

describe.each(TABLAS)("FORMA_ESPERADA de %s coincide con su .sql (si cambia uno sin el otro, falla)", (tabla) => {
  test("columnas, índices, claves foráneas y collation", () => {
    const texto = fs.readFileSync(sqlDe(tabla).archivo, "utf8");
    const delSql = formaDelSql(texto, tabla);
    const esperada = FORMAS_ESPERADAS[tabla];
    expect(delSql.columnas).toHaveLength(CANTIDAD_DE_COLUMNAS[tabla]);
    const conBandera = (lista) => lista.map((c) => ({ ...c, autoincremental: Boolean(c.autoincremental) }));
    expect(conBandera(esperada.columnas)).toEqual(conBandera(delSql.columnas));
    const ordenar = (lista) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
    expect(ordenar(esperada.indices)).toEqual(ordenar(delSql.indices));
    expect(esperada.relaciones).toEqual(delSql.relaciones);
    expect(esperada.collation).toBe(delSql.collation);
    expect(texto).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS \`${tabla}\``));
  });
});

test("cada tabla esperada está en un solo archivo y las cuatro suman las que trae el despliegue", () => {
  expect(TABLAS).toEqual(["datos_reserva_web", "garantias_reserva", "garantias_estadia", "pasarela_operaciones"]);
  expect(new Set(TABLAS).size).toBe(4);
  expect(Object.keys(FORMAS_ESPERADAS).sort()).toEqual([...TABLAS].sort());
});

test("leerSql() devuelve exactamente los cuatro CREATE TABLE IF NOT EXISTS, en orden", () => {
  const pasos = leerSql();
  expect(pasos.map((p) => p.tabla)).toEqual(TABLAS);
  for (const p of pasos) {
    expect(p.tipo).toBe("tabla");
    expect(p.sql.startsWith(`CREATE TABLE IF NOT EXISTS \`${p.tabla}\``)).toBe(true);
  }
});

test("operaciones() acepta solo el CREATE TABLE IF NOT EXISTS de las tablas de ese archivo", () => {
  const web = fs.readFileSync(ARCHIVOS[0].archivo, "utf8");
  const garantias = fs.readFileSync(ARCHIVOS[1].archivo, "utf8");
  const pasarela = fs.readFileSync(ARCHIVOS[2].archivo, "utf8");
  expect(operaciones(web)).toHaveLength(1);
  expect(operaciones(garantias, ["garantias_reserva", "garantias_estadia"])).toHaveLength(2);
  expect(operaciones(pasarela, ["pasarela_operaciones"])).toHaveLength(1);
  for (const mala of [
    `${web}\nDROP TABLE reservas;`,
    `${web}\nALTER TABLE \`reservas\` ADD COLUMN \`x\` INTEGER NULL;`,
    "DROP TABLE `datos_reserva_web`;",
    "CREATE TABLE IF NOT EXISTS `otra` (`id` INTEGER NOT NULL);",
    "CREATE TABLE `datos_reserva_web` (`id` INTEGER NOT NULL);",
    "CREATE TABLE IF NOT EXISTS `datos_reserva_web` (`id` INTEGER NOT NULL) AS SELECT 1;",
    "",
  ]) {
    expect(() => operaciones(mala)).toThrow(/no aditiva o no reconocida/);
  }
  // Un archivo con una tabla de otro archivo, con una de más o con una repetida se niega.
  expect(() => operaciones(web, ["pasarela_operaciones"])).toThrow(/no aditiva o no reconocida/);
  expect(() => operaciones(garantias, ["garantias_reserva"])).toThrow(/no aditiva o no reconocida/);
  expect(() => operaciones(`${pasarela}\n${pasarela}`, ["pasarela_operaciones", "pasarela_operaciones"])).toThrow(/no aditiva o no reconocida/);
  expect(() => operaciones(`${pasarela}\nINSERT INTO pasarela_operaciones VALUES (1);`, ["pasarela_operaciones", "x"])).toThrow(
    /no aditiva o no reconocida/
  );
});

// Filas como las devuelve information_schema, armadas desde la forma esperada.
function filasDeLaBase(tabla) {
  const e = FORMAS_ESPERADAS[tabla];
  return {
    tabla: { nombre: e.tabla, engine: e.engine, collation: e.collation },
    columnas: e.columnas.map((c) => ({ ...c })),
    indices: e.indices.map((i) => ({ ...i })),
    relaciones: e.relaciones.map((r) => ({ ...r })),
  };
}

describe.each(TABLAS)("compararForma de %s", (tabla) => {
  const esperada = FORMAS_ESPERADAS[tabla];

  test("una tabla con la forma esperada no tiene diferencias, ni con las representaciones de MariaDB", () => {
    expect(compararForma(filasDeLaBase(tabla), esperada)).toEqual([]);
    const mariadb = filasDeLaBase(tabla);
    mariadb.columnas.find((c) => c.nombre === "id").tipo = "int(11)";
    mariadb.columnas.find((c) => c.nombre === "creadoEn").defecto = "CURRENT_TIMESTAMP(3)";
    for (const c of mariadb.columnas) {
      if (c.tipo === "tinyint(1)" && c.defecto === "0") c.defecto = "'0'";
      if (c.tipo === "decimal(12,2)" && c.defecto === "0") c.defecto = "0.00"; // lo que informa la base
      if (c.tipo === "decimal(12,2)") c.tipo = "decimal(12,2)";
      if (c.nulo && c.defecto === null) c.defecto = "NULL";
      if (typeof c.defecto === "string" && /^[a-z]+$/.test(c.defecto) && c.defecto !== "null") c.defecto = `'${c.defecto[0].toUpperCase()}${c.defecto.slice(1)}'`;
    }
    expect(compararForma(mariadb, esperada)).toEqual([]);
  });

  test("cualquier diferencia real se informa (nunca se normaliza)", () => {
    const primeraNoId = esperada.columnas.find((c) => c.nombre !== "id" && c.nombre !== "reservaId" && c.tipo.startsWith("varchar"));
    const ultima = esperada.columnas.at(-1);
    const unicoNoPrimary = esperada.indices.find((i) => i.nombre !== "PRIMARY");
    const casos = [
      [(f) => (f.columnas.find((c) => c.nombre === primeraNoId.nombre).tipo = "varchar(300)"), new RegExp(`${primeraNoId.nombre}: el tipo es varchar\\(300\\)`)],
      [(f) => (f.columnas.find((c) => c.nombre === primeraNoId.nombre).nulo = !primeraNoId.nulo), new RegExp(`${primeraNoId.nombre}: es `)],
      [(f) => (f.columnas.find((c) => c.nombre === primeraNoId.nombre).defecto = "x"), new RegExp(`${primeraNoId.nombre}: el default es x`)],
      [(f) => f.columnas.pop(), new RegExp(`Falta la columna ${ultima.nombre}`)],
      [(f) => f.columnas.push({ nombre: "extra", tipo: "int", nulo: true, defecto: null }), /Sobra la columna extra/],
      [(f) => f.indices.pop(), /Falta el índice/],
      [(f) => (f.indices.find((i) => i.nombre === unicoNoPrimary.nombre).unico = false), /no es único/],
      [(f) => f.indices.push({ nombre: "otro", unico: false, columnas: ["id"] }), /Sobra el índice otro/],
      [(f) => (f.tabla.engine = "MyISAM"), /ENGINE: es MyISAM/],
      [(f) => (f.tabla.collation = "utf8mb4_general_ci"), /COLLATION de la tabla/],
      ...(esperada.relaciones.length
        ? [
            [(f) => (f.relaciones[0].alBorrar = "CASCADE"), /ON DELETE CASCADE y debería ser RESTRICT/],
            [(f) => (f.relaciones[0].alActualizar = "RESTRICT"), /ON UPDATE RESTRICT y debería ser CASCADE/],
            [(f) => (f.relaciones[0].tablaRef = "huespedes"), /va de reservaId a huespedes/],
            [(f) => f.relaciones.pop(), /Falta la clave foránea/],
          ]
        : [[(f) => f.relaciones.push({ nombre: "x_fkey", columna: "id", tablaRef: "reservas", columnaRef: "id", alBorrar: "RESTRICT", alActualizar: "CASCADE" }), /Sobra la clave foránea x_fkey/]]),
    ];
    for (const [cambiar, esperado] of casos) {
      const filas = filasDeLaBase(tabla);
      cambiar(filas);
      expect(compararForma(filas, esperada).join("\n")).toMatch(esperado);
    }
  });
});

// Una "conexión" que responde como information_schema para un conjunto de tablas.
function conexionCon(formasPorTabla) {
  return {
    query: jest.fn(async (q, [tabla]) => {
      const forma = formasPorTabla[tabla];
      if (q.includes("information_schema.TABLES")) return forma ? [forma.tabla] : [];
      if (q.includes("information_schema.COLUMNS")) {
        return forma.columnas.map((c) => ({ nombre: c.nombre, tipo: c.tipo, nulo: c.nulo ? "YES" : "NO", defecto: c.defecto, extra: c.autoincremental ? "auto_increment" : "" }));
      }
      if (q.includes("information_schema.STATISTICS")) {
        return forma.indices.flatMap((i) => i.columnas.map((columna) => ({ nombre: i.nombre, noUnico: i.unico ? 0 : 1, columna })));
      }
      return forma.relaciones;
    }),
  };
}
const todasIguales = () => Object.fromEntries(TABLAS.map((t) => [t, filasDeLaBase(t)]));

test("calcularPlan: 4 tablas faltantes → plan 4 de 4; todas iguales → 0; una distinta → NO seguir", async () => {
  const pasos = leerSql();

  const ninguna = await calcularPlan(conexionCon({}));
  expect(ninguna.estado).toBe("falta");
  expect(ninguna.tablas.map((t) => t.estado)).toEqual(["falta", "falta", "falta", "falta"]);
  expect(operacionesFaltantes(pasos, ninguna)).toHaveLength(4);

  const conn = conexionCon(todasIguales());
  const iguales = await calcularPlan(conn);
  expect(iguales.estado).toBe("igual");
  expect(operacionesFaltantes(pasos, iguales)).toHaveLength(0);
  expect(conn.query).toHaveBeenCalledTimes(16); // 4 consultas por tabla

  const parcial = todasIguales();
  delete parcial.pasarela_operaciones;
  delete parcial.garantias_estadia;
  const faltan2 = await calcularPlan(conexionCon(parcial));
  expect(faltan2.estado).toBe("falta");
  expect(operacionesFaltantes(pasos, faltan2).map((p) => p.tabla)).toEqual(["garantias_estadia", "pasarela_operaciones"]);

  const distinta = todasIguales();
  distinta.garantias_reserva.columnas.find((x) => x.nombre === "token").tipo = "text";
  const plan = await calcularPlan(conexionCon(distinta));
  expect(plan.estado).toBe("distinta");
  expect(plan.tablas.find((t) => t.tabla === "garantias_reserva").estado).toBe("distinta");
  expect(plan.diferencias.join(" ")).toMatch(/garantias_reserva: Columna token/);
});

test("una tabla distinta gana sobre una faltante: nunca se sigue si alguna tiene otra forma", async () => {
  const f = todasIguales();
  delete f.datos_reserva_web;
  f.pasarela_operaciones.columnas.find((x) => x.nombre === "aprobada").tipo = "int";
  const plan = await calcularPlan(conexionCon(f));
  expect(plan.estado).toBe("distinta");
});

test("los .sql coinciden con el modelo de schema.prisma (nombres de tablas y columnas)", () => {
  const schema = fs.readFileSync(require("node:path").resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  const mapas = {
    datos_reserva_web: "DatosReservaWeb",
    garantias_reserva: "GarantiaReserva",
    garantias_estadia: "GarantiaEstadia",
    pasarela_operaciones: "PasarelaOperacion",
  };
  for (const [tabla, modelo] of Object.entries(mapas)) {
    expect(schema).toMatch(new RegExp(`@@map\\("${tabla}"\\)`));
    const bloque = schema.slice(schema.indexOf(`model ${modelo} {`));
    const cuerpo = bloque.slice(0, bloque.indexOf("}"));
    const camposDelModelo = cuerpo
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"))
      .map((l) => l.split(/\s+/)[0])
      // las relaciones (campo de tipo modelo) no son columnas
      .filter((c) => !["reserva", "model"].includes(c));
    const columnasDelSql = FORMAS_ESPERADAS[tabla].columnas.map((c) => c.nombre);
    expect([...columnasDelSql].sort()).toEqual([...camposDelModelo].sort());
  }
});
