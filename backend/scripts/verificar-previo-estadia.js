// Verificación de SOLO LECTURA para el despliegue de la migración de estadía
// (docs/despliegue-estadia.md). Nunca escribe en la base: solo SELECT, SHOW e information_schema,
// y `prisma migrate diff`, que solo compara.
//
//   node scripts/verificar-previo-estadia.js            antes de migrar
//   node scripts/verificar-previo-estadia.js --despues  después de migrar (compara con lo de antes)
//
// Destino: DATABASE_URL. Igual que la migración, por defecto solo una base local; para la
// compartida hace falta CONFIRMAR_BASE_COMPARTIDA=<nombre-de-la-base> (sin pregunta por teclado:
// no modifica nada). Nunca muestra usuario ni contraseña.
//
// Guarda los conteos de antes en backend/.local/verificacion-estadia-<base>.json (Git lo ignora)
// para compararlos después. Código de salida 1 si encuentra algo que impide seguir.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { exigirDestino, describirDestino } = require("./_destinoMigracion");
const { operaciones, pendientes } = require("./actualizar-esquema-estadia");
const { TIPOS_DOCUMENTO } = require("../src/lib/tiposDocumento");
// "Sin documento" lo usa la propia app para las personas registradas sin documento.
const TIPOS_VALIDOS = [...TIPOS_DOCUMENTO, "Sin documento"];

const DESPUES = process.argv.includes("--despues");
const TABLAS_CONTEO = [
  "reservas",
  "huespedes",
  "reservas_habitaciones",
  "reservas_noche",
  "consumos_servicio_adicional",
  "cargos_verificacion_checkout",
  "pagos_estadia",
  "pagos_estadia_medio",
  "comprobantes_estadia",
  "notificaciones",
  "usuarios",
];
const TABLAS_ESTADIA = ["ocupantes_reserva", "asignaciones_ocupantes", "eventos_estadia"];
const COLUMNAS_NUEVAS = [
  ["huespedes", "nombres"],
  ["huespedes", "apellido"],
  ["huespedes", "identidadDocumento"],
  ["ocupantes_reserva", "vinculoResponsable"],
  ["ocupantes_reserva", "autorizacionPresentada"],
  ["consumos_servicio_adicional", "claveOperacion"],
  ["cargos_verificacion_checkout", "habitacionId"],
];

const bloqueos = [];
const avisos = [];
const titulo = (t) => console.log(`\n== ${t}`);

async function main() {
  const url = await exigirDestino(process.env, "la verificación de estadía", { confirmarPorTeclado: false });
  const destino = describirDestino(url);
  console.log(`Verificación ${DESPUES ? "POSTERIOR" : "PREVIA"} de estadía (solo lectura)`);
  console.log(`Destino: base "${destino.base}" en ${destino.host}:${destino.puerto}`);
  const inicio = Date.now();
  const conn = await require("mariadb").createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: destino.base,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    connectTimeout: 15000,
    socketTimeout: 60000,
  });
  try {
    const tablas = new Set(
      (await conn.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()")).map((r) => r.t),
    );
    const columnas = new Set(
      (
        await conn.query("SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()")
      ).map((r) => `${r.t}.${r.c}`),
    );

    // 1) Conteos (una sola consulta).
    titulo("Filas por tabla");
    const presentes = [...TABLAS_CONTEO, ...TABLAS_ESTADIA].filter((t) => tablas.has(t));
    const faltantesBase = TABLAS_CONTEO.filter((t) => !tablas.has(t));
    if (faltantesBase.length) bloqueos.push(`Faltan tablas base del sistema: ${faltantesBase.join(", ")}. La base no está en el esquema de master.`);
    const conteos = {};
    if (presentes.length) {
      const fila = (await conn.query(`SELECT ${presentes.map((t) => `(SELECT COUNT(*) FROM \`${t}\`) AS \`${t}\``).join(", ")}`))[0];
      for (const t of presentes) conteos[t] = Number(fila[t]);
    }
    for (const t of presentes) console.log(`  ${t.padEnd(30)} ${conteos[t]}`);

    // 2) Qué falta de la migración (misma lógica que actualizar-esquema-estadia.js, solo lectura).
    titulo("Migración de estadía");
    const sql = fs.readFileSync(path.resolve(__dirname, "../prisma/estadia-ocupantes-cargos.sql"), "utf8");
    const pasos = operaciones(sql);
    let plan = [];
    try {
      plan = await pendientes(conn, pasos);
      console.log(`  Operaciones faltantes: ${plan.length} de ${pasos.length}`);
    } catch (e) {
      bloqueos.push(`No se puede calcular el plan de la migración: ${e.message}`);
    }
    const yaEstaban = TABLAS_ESTADIA.filter((t) => tablas.has(t));
    if (DESPUES) {
      if (plan.length) bloqueos.push(`Quedan ${plan.length} operaciones de la migración sin aplicar: correrla de nuevo.`);
      for (const [t, c] of COLUMNAS_NUEVAS)
        if (!columnas.has(`${t}.${c}`)) bloqueos.push(`Falta la columna ${t}.${c} después de migrar.`);
      if (!bloqueos.length) console.log("  0 operaciones pendientes y las columnas nuevas están.");
    } else if (yaEstaban.length && plan.length) {
      // Incidente del 30/9: otro entorno de desarrollo volvió a crear estas tablas en la compartida.
      avisos.push(
        `Ya existen tablas de estadía en la compartida (${yaEstaban.map((t) => `${t}: ${conteos[t]} filas`).join(", ")}). ` +
          "Probablemente las creó otro entorno de desarrollo (como el 30/9). La migración solo agrega lo que falta; revisar las huérfanas de abajo.",
      );
    }

    // 3) Filas huérfanas que harían fallar las claves foráneas nuevas (solo si las tablas ya existen).
    const huerfanas = [
      ["ocupantes_reserva", "reservaId", "reservas"],
      ["ocupantes_reserva", "huespedId", "huespedes"],
      ["asignaciones_ocupantes", "ocupanteId", "ocupantes_reserva"],
      ["eventos_estadia", "reservaId", "reservas"],
    ].filter(([t, c, ref]) => columnas.has(`${t}.${c}`) && tablas.has(ref));
    if (huerfanas.length) {
      titulo("Filas huérfanas en tablas de estadía existentes");
      for (const [t, c, ref] of huerfanas) {
        const n = Number(
          (await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\` x WHERE x.\`${c}\` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \`${ref}\` r WHERE r.id = x.\`${c}\`)`))[0].n,
        );
        console.log(`  ${t}.${c} → ${ref}: ${n}`);
        if (n) bloqueos.push(`${n} filas de ${t} apuntan a un ${ref} inexistente (${c}): la clave foránea nueva va a fallar.`);
      }
    }

    // 4) Índices de huespedes: un índice único sobre el documento (cambios manuales anteriores).
    titulo("Índices de huespedes");
    const indices = await conn.query("SHOW INDEX FROM `huespedes`");
    const porNombre = new Map();
    for (const i of indices) {
      if (!porNombre.has(i.Key_name)) porNombre.set(i.Key_name, { unico: Number(i.Non_unique) === 0, columnas: [] });
      porNombre.get(i.Key_name).columnas.push(i.Column_name);
    }
    for (const [nombre, { unico, columnas: cols }] of porNombre) {
      console.log(`  ${nombre.padEnd(40)} ${unico ? "ÚNICO " : "normal"} (${cols.join(", ")})`);
      const sobreDocumento = cols.some((c) => ["tipoDocumento", "numeroDocumento", "paisDocumento"].includes(c));
      if (unico && sobreDocumento)
        avisos.push(
          `Índice único "${nombre}" sobre (${cols.join(", ")}) en huespedes: no lo crea esta migración. ` +
            "No impide migrar, pero contradice la regla de identidad (el mismo número en otro país es otra persona): coordinar con Ricardo.",
        );
      if (nombre === "huespedes_identidadDocumento_key" && cols.join(",") !== "identidadDocumento")
        bloqueos.push(`Ya existe un índice "${nombre}" sobre (${cols.join(", ")}): choca con el que crea la migración.`);
    }

    // 5) Tipos de documento fuera del catálogo (informativo: la migración no los toca).
    titulo("Tipos de documento en huespedes");
    const tipos = await conn.query("SELECT tipoDocumento AS tipo, COUNT(*) AS n FROM huespedes GROUP BY tipoDocumento ORDER BY n DESC");
    for (const t of tipos) {
      const enCatalogo = TIPOS_VALIDOS.includes(t.tipo);
      console.log(`  ${String(t.tipo).padEnd(28)} ${Number(t.n)}${enCatalogo ? "" : "  ← fuera del catálogo"}`);
    }
    const fuera = tipos.filter((t) => !TIPOS_VALIDOS.includes(t.tipo));
    if (fuera.length)
      avisos.push(
        `Huéspedes con tipo de documento fuera del catálogo (${fuera.map((t) => `"${t.tipo}": ${Number(t.n)}`).join(", ")}). ` +
          "La migración no los modifica; la app los muestra como están y pide elegir un tipo válido al editarlos.",
      );

    // 6) Reservas vigentes (informativo).
    titulo("Reservas vigentes");
    const vigentes = await conn.query(
      "SELECT estado, COUNT(*) AS n, MIN(fechaDesde) AS desde, MAX(fechaHasta) AS hasta FROM reservas WHERE estado IN ('Confirmada','En curso') GROUP BY estado",
    );
    if (!vigentes.length) console.log("  Ninguna Confirmada ni En curso.");
    for (const v of vigentes)
      console.log(`  ${v.estado.padEnd(12)} ${Number(v.n)} (del ${String(v.desde?.toISOString?.() ?? v.desde).slice(0, 10)} al ${String(v.hasta?.toISOString?.() ?? v.hasta).slice(0, 10)})`);
    // Reservas En curso sin ninguna ficha de ocupante (todas, si la tabla todavía no existe).
    const sinFichas = Number(
      (
        await conn.query(
          tablas.has("ocupantes_reserva")
            ? "SELECT COUNT(*) AS n FROM reservas r WHERE r.estado='En curso' AND NOT EXISTS (SELECT 1 FROM ocupantes_reserva o WHERE o.reservaId = r.id)"
            : "SELECT COUNT(*) AS n FROM reservas WHERE estado='En curso'",
        )
      )[0].n,
    );
    if (sinFichas && !DESPUES)
      avisos.push(
        `${sinFichas} reservas En curso sin fichas de ocupantes: al abrir su detalle, la app incorpora al titular como ocupante (titular automático). No hace falta nada antes de migrar.`,
      );

    // 7) Conteos antes / después.
    const archivo = path.resolve(__dirname, "../.local", `verificacion-estadia-${destino.base}.json`);
    if (!DESPUES) {
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, JSON.stringify({ fecha: new Date().toISOString(), conteos }, null, 2));
      console.log(`\n  Conteos guardados para comparar después: ${path.relative(process.cwd(), archivo)}`);
    } else if (fs.existsSync(archivo)) {
      titulo("Conteos antes / después");
      const antes = JSON.parse(fs.readFileSync(archivo, "utf8")).conteos;
      for (const t of TABLAS_CONTEO.filter((x) => x in antes)) {
        const igual = antes[t] === conteos[t];
        console.log(`  ${t.padEnd(30)} ${String(antes[t]).padStart(6)} → ${String(conteos[t]).padStart(6)}${igual ? "" : "  ← CAMBIÓ"}`);
        if (!igual) bloqueos.push(`La tabla ${t} cambió de ${antes[t]} a ${conteos[t]} filas durante el despliegue (¿alguien escribió?).`);
      }
    } else avisos.push("No hay conteos de antes para comparar (no se corrió la verificación previa en esta máquina).");
  } finally {
    await conn.end();
  }

  // 8) Diferencia de esquema contra schema.prisma (prisma migrate diff: solo compara, no escribe).
  titulo("Diferencia de esquema contra schema.prisma (prisma migrate diff)");
  const diff = spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js", { paths: [path.resolve(__dirname, "..")] }), "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"],
    { cwd: path.resolve(__dirname, ".."), env: process.env, encoding: "utf8" },
  );
  const salida = `${diff.stdout ?? ""}`.replace(/postgres(ql)?:\/\/\S+|mysql:\/\/\S+/g, "<url oculta>");
  const sentencias = salida
    .split("\n")
    .filter((l) => /^(CREATE|ALTER|DROP|RENAME)/.test(l.trim()));
  if (diff.status !== 0) avisos.push(`prisma migrate diff terminó con código ${diff.status}: ${String(diff.stderr ?? "").split("\n").slice(-3).join(" ").replace(/mysql:\/\/\S+/g, "<url oculta>")}`);
  else if (/empty migration/i.test(salida) || !sentencias.length) console.log("  Sin diferencias: la base coincide con schema.prisma.");
  else {
    console.log(`  ${sentencias.length} sentencias de diferencia:`);
    for (const l of sentencias) console.log(`    ${l.trim().slice(0, 160)}`);
    const ajenas = sentencias.filter((l) => !/ocupantes_reserva|asignaciones_ocupantes|eventos_estadia|huespedes|consumos_servicio_adicional|cargos_verificacion_checkout/.test(l));
    if (DESPUES) bloqueos.push("Después de migrar, schema.prisma y la base deberían coincidir y todavía hay diferencias (ver arriba).");
    else if (ajenas.length)
      bloqueos.push(
        `Hay ${ajenas.length} diferencias de esquema que NO son de la migración de estadía (ver arriba). ` +
          "La base no coincide con master: frenar y revisar con el equipo antes de migrar.",
      );
    else console.log("  Todas son de la migración de estadía (es lo que va a agregar).");
  }

  titulo("Resultado");
  for (const a of avisos) console.log(`  AVISO: ${a}`);
  for (const b of bloqueos) console.log(`  BLOQUEA: ${b}`);
  console.log(
    bloqueos.length
      ? `\n  NO seguir: ${bloqueos.length} problema(s) para resolver antes (ver docs/despliegue-estadia.md).`
      : DESPUES
        ? "\n  OK: la migración quedó aplicada y verificada."
        : "\n  OK para migrar.",
  );
  console.log(`  (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
  process.exitCode = bloqueos.length ? 1 : 0;
}

main().catch((e) => {
  console.error(`No se pudo verificar: ${String(e.message ?? e).replace(/mysql:\/\/\S+/g, "<url oculta>")}`);
  process.exitCode = 1;
});
