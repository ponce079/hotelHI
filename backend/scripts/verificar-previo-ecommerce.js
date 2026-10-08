// Verificación de SOLO LECTURA para el despliegue de la migración del e-commerce y las garantías (cuatro
// tablas: datos_reserva_web, garantias_reserva, garantias_estadia y pasarela_operaciones). Nunca escribe en la base: solo SELECT, information_schema y
// `prisma migrate diff`, que solo compara. Lo único que escribe es el JSON local de conteos.
//
//   node scripts/verificar-previo-ecommerce.js            antes de migrar
//   node scripts/verificar-previo-ecommerce.js --despues  después de migrar (compara con lo de antes)
//
// Destino: DATABASE_URL de la terminal. Igual que la migración, por defecto solo una base local; para
// otra hace falta CONFIRMAR_BASE_COMPARTIDA=<nombre-de-la-base> (sin pregunta por teclado: no
// modifica nada). Nunca muestra usuario ni contraseña ni datos personales.
//
// Guarda los conteos de antes en backend/.local/verificacion-ecommerce-<base>.json (Git lo ignora)
// para compararlos después. Código de salida 1 si encuentra algo que impide seguir.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { exigirDestino, describirDestino } = require("./_destinoMigracion");
const { leerSql, calcularPlan, conectar, TABLAS } = require("./actualizar-esquema-ecommerce");

const DESPUES = process.argv.includes("--despues");
const DIAS_VENTANA = 60;

// Tablas del esquema de master que el e-commerce usa o que hay que cuidar (nombres reales de @@map).
const TABLAS_BASE = [
  "reservas",
  "reservas_habitaciones",
  "reservas_noche",
  "huespedes",
  "habitaciones",
  "tipos_habitacion",
  "planes_tarifarios",
  "temporadas",
  "tarifas",
  "modificadores_dia_semana",
  "pagos_estadia",
  "pagos_estadia_medio",
  "notificaciones",
  "usuarios",
  "ocupantes_reserva",
  "asignaciones_ocupantes",
  "eventos_estadia",
];

const PRIORIDAD_NIVEL = { BASE: 0, BAJA: 1, MEDIA: 2, ALTA: 3, EVENTO: 4 };

const bloqueos = [];
const avisos = [];
const titulo = (t) => console.log(`\n== ${t}`);
const oculta = (s) => String(s ?? "").replace(/mysql:\/\/\S+/g, "<url oculta>");

// "hoy" y "hoy + n" como AAAA-MM-DD en hora argentina (la del hotel).
function fechaHotel(sumarDias = 0) {
  const ahora = new Date(Date.now() + sumarDias * 24 * 60 * 60 * 1000);
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

// Misma resolución del motor (resolverTemporadaEfectiva): entre las temporadas activas que cubren la
// fecha gana la de mayor prioridad (EVENTO > ALTA > MEDIA > BAJA); si ninguna, la BASE.
function temporadaEfectiva(temporadas, fecha) {
  const cubren = temporadas.filter((t) => t.nivel !== "BASE" && t.fechaDesde && t.fechaDesde <= fecha && fecha <= t.fechaHasta);
  cubren.sort((a, b) => PRIORIDAD_NIVEL[b.nivel] - PRIORIDAD_NIVEL[a.nivel]);
  return cubren[0] ?? temporadas.find((t) => t.nivel === "BASE") ?? null;
}

// Misma resolución de obtenerTarifaVigente: la versión con mayor vigenteDesde <= fecha de VENTA (hoy).
function tarifaVigente(tarifas, tipoId, temporadaId, fechaVenta) {
  return (
    tarifas
      .filter((t) => t.tipoId === tipoId && t.temporadaId === temporadaId && t.vigenteDesde <= fechaVenta)
      .sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1))[0] ?? null
  );
}

// Límites de la base y tiempos que condicionan la robustez del mostrador contra una base remota (todo SELECT).
async function verificarOperacion(conn, avisos) {
  {
    titulo("Conexiones y timeouts del servidor (solo lectura)");
    const filas = await conn.query(
      "SHOW VARIABLES WHERE Variable_name IN ('max_user_connections','max_connections','wait_timeout','interactive_timeout','innodb_lock_wait_timeout')",
    );
    const v = Object.fromEntries(filas.map((f) => [f.Variable_name, Number(f.Value)]));
    for (const k of ["max_user_connections", "max_connections", "wait_timeout", "interactive_timeout", "innodb_lock_wait_timeout"]) {
      console.log(`  ${k.padEnd(26)} ${v[k] ?? "(no disponible)"}`);
    }
    const limite = v.max_user_connections > 0 ? v.max_user_connections : v.max_connections;
    const configurado = Number(process.env.DATABASE_CONNECTION_LIMIT ?? 2);
    if (limite > 0) {
      console.log(`  Límite efectivo por usuario: ${limite} conexiones (${v.max_user_connections > 0 ? "max_user_connections" : "max_connections"}).`);
      console.log("  Recomendación de DATABASE_CONNECTION_LIMIT según los integrantes con su backend conectado a la vez:");
      for (const n of [1, 2, 3, 4, 5, 6]) console.log(`    con ${n} integrante(s): como máximo ${Math.max(1, Math.min(10, Math.floor(limite / n)))}`);
      console.log(`  Configurado en esta terminal: ${configurado}.`);
      if (configurado * 2 > limite) {
        avisos.push(`DATABASE_CONNECTION_LIMIT=${configurado} es alto para un límite de ${limite}: con 2 integrantes ya llegarían a ${configurado * 2}.`);
      }
      if (limite < 8) avisos.push(`El límite de conexiones del usuario es bajo (${limite}): con la base remota las pantallas con varias lecturas en paralelo hacen cola.`);
    }
    const inactividad = Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30000);
    const tope = Math.min(v.wait_timeout || Infinity, v.interactive_timeout || Infinity);
    if (Number.isFinite(tope)) {
      const recomendado = Math.min(30000, Math.floor((tope * 1000) / 2));
      console.log(`  DATABASE_IDLE_TIMEOUT_MS recomendado: ${recomendado} (la mitad del menor entre wait_timeout e interactive_timeout, máximo 30000). Configurado: ${inactividad}.`);
      if (inactividad >= tope * 1000) {
        avisos.push(`DATABASE_IDLE_TIMEOUT_MS=${inactividad} es mayor o igual que el wait_timeout del servidor (${tope} s): el servidor cortará las conexiones inactivas primero (ECONNABORTED). Usá ${recomendado}.`);
      }
    }
    if (v.innodb_lock_wait_timeout) {
      console.log(`  innodb_lock_wait_timeout = ${v.innodb_lock_wait_timeout} s: lo máximo que espera una transacción por un bloqueo de otra (el check-in y el walk-in bloquean las habitaciones).`);
      if (v.innodb_lock_wait_timeout > 30) avisos.push(`innodb_lock_wait_timeout=${v.innodb_lock_wait_timeout} s supera los 30 s de las transacciones de la aplicación.`);
    }

    titulo("Consistencia entre habitaciones y reservas En curso (solo conteos y números de habitación)");
    const sinReserva = await conn.query(
      "SELECT h.numero FROM habitaciones h WHERE h.estado = 'ocupada' AND NOT EXISTS (SELECT 1 FROM reservas_habitaciones rh JOIN reservas r ON r.id = rh.reservaId WHERE rh.habitacionId = h.id AND r.estado = 'En curso') ORDER BY h.numero",
    );
    const sinHabitacion = await conn.query(
      "SELECT DISTINCT h.numero FROM reservas r JOIN reservas_habitaciones rh ON rh.reservaId = r.id JOIN habitaciones h ON h.id = rh.habitacionId WHERE r.estado = 'En curso' AND h.estado <> 'ocupada' ORDER BY h.numero",
    );
    console.log(`  Habitaciones 'ocupada' sin una reserva En curso que las ocupe: ${sinReserva.length}${sinReserva.length ? ` (hab. ${sinReserva.map((x) => x.numero).join(", ")})` : ""}`);
    console.log(`  Reservas En curso con una habitación que no figura 'ocupada': ${sinHabitacion.length}${sinHabitacion.length ? ` (hab. ${sinHabitacion.map((x) => x.numero).join(", ")})` : ""}`);
    if (sinReserva.length) avisos.push(`${sinReserva.length} habitación(es) 'ocupada' sin reserva En curso (hab. ${sinReserva.map((x) => x.numero).join(", ")}): puede haberlas dejado una prueba interrumpida.`);
    if (sinHabitacion.length) avisos.push(`${sinHabitacion.length} habitación(es) de reservas En curso que no figuran 'ocupada' (hab. ${sinHabitacion.map((x) => x.numero).join(", ")}).`);

    titulo("Variables de entorno de esta terminal (sin mostrar valores)");
    const largo = (k) => String(process.env[k] ?? "").length;
    console.log(`  AUTH_SECRET             ${largo("AUTH_SECRET") ? `definida (${largo("AUTH_SECRET")} caracteres)` : "NO definida"}  (obligatoria en producción, 32 o más)`);
    console.log(`  PASARELA_TOKEN_SECRETO  ${largo("PASARELA_TOKEN_SECRETO") ? `definida (${largo("PASARELA_TOKEN_SECRETO")} caracteres)` : "NO definida"}  (obligatoria en producción, 32 o más)`);
    console.log(`  TAREAS_AUTOMATICAS      ${process.env.TAREAS_AUTOMATICAS ? process.env.TAREAS_AUTOMATICAS : "(vacía: tareas activas)"}  (contra la compartida, solo un backend con tareas activas)`);
    if (largo("AUTH_SECRET") < 32) avisos.push("AUTH_SECRET no está definida o tiene menos de 32 caracteres: en producción el backend no arranca.");
  }
}

async function main() {
  const url = await exigirDestino(process.env, "la verificación del e-commerce", { confirmarPorTeclado: false });
  const destino = describirDestino(url);
  console.log(`Verificación ${DESPUES ? "POSTERIOR" : "PREVIA"} del e-commerce (solo lectura)`);
  console.log(`Destino: base "${destino.base}" en ${destino.host}:${destino.puerto}`);
  const inicio = Date.now();
  // El .sql se valida antes de conectarse (si no es exactamente lo esperado, no se sigue).
  const pasos = leerSql();
  const conn = await conectar(url);
  let estadoPlan = "falta";
  try {
    const tablas = new Set(
      (await conn.query("SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()")).map((r) => r.t),
    );

    // 1) Tablas base.
    titulo("Tablas base del sistema");
    const faltantesBase = TABLAS_BASE.filter((t) => !tablas.has(t));
    console.log(faltantesBase.length ? `  Faltan: ${faltantesBase.join(", ")}` : `  Están las ${TABLAS_BASE.length} tablas base.`);
    if (faltantesBase.length) bloqueos.push(`Faltan tablas base del sistema: ${faltantesBase.join(", ")}. La base no está en el esquema de master.`);

    // 2) Plan de la migración (mismo cálculo que el runner): las cuatro tablas.
    titulo("Migración del e-commerce y las garantías");
    const plan = await calcularPlan(conn);
    estadoPlan = plan.estado;
    for (const t of plan.tablas) {
      console.log(`  ${t.tabla.padEnd(24)} ${{ falta: "falta (la va a crear)", igual: "existe con la forma esperada", distinta: "EXISTE CON UNA FORMA DISTINTA" }[t.estado]}`);
    }
    for (const t of plan.tablas.filter((x) => x.estado === "distinta")) {
      console.log(`  La tabla ${t.tabla} ya existe con una forma distinta: NO seguir.`);
      for (const d of t.diferencias) console.log(`    - ${d}`);
      bloqueos.push(`La tabla ${t.tabla} ya existe con una forma distinta a la esperada (ver arriba): no se la corrige sola.`);
    }
    if (plan.estado !== "distinta") {
      const faltan = plan.tablas.filter((t) => t.estado === "falta").length;
      console.log(`  Operaciones faltantes: ${faltan} de ${pasos.length}`);
      if (DESPUES && faltan) bloqueos.push(`Quedan ${faltan} operaciones de la migración sin aplicar: correr actualizar-esquema-ecommerce.js --aplicar.`);
      if (DESPUES && !faltan) console.log(`  0 operaciones pendientes y las ${TABLAS.length} tablas tienen la forma esperada.`);
      if (!DESPUES && !faltan) console.log("  Las tablas ya existen con la forma esperada: no falta nada.");
    }

    // 3) Conteos (una sola consulta).
    titulo("Filas por tabla");
    const presentes = [...TABLAS_BASE, ...TABLAS].filter((t) => tablas.has(t));
    const conteos = {};
    if (presentes.length) {
      const fila = (await conn.query(`SELECT ${presentes.map((t) => `(SELECT COUNT(*) FROM \`${t}\`) AS \`${t}\``).join(", ")}`))[0];
      for (const t of presentes) conteos[t] = Number(fila[t]);
    }
    for (const t of presentes) console.log(`  ${t.padEnd(30)} ${conteos[t]}`);

    // 4) Datos de negocio que la web necesita (avisos: no frenan).
    if (!faltantesBase.length) await datosDeNegocio(conn);
    await verificarOperacion(conn, avisos);

    // 5) Conteos antes / después.
    const archivo = path.resolve(__dirname, "../.local", `verificacion-ecommerce-${destino.base}.json`);
    if (!DESPUES) {
      if (!ignoradoPorGit(archivo)) {
        throw new Error("backend/.local no está en .gitignore: no escribo el JSON de conteos. Frenar y avisar.");
      }
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, JSON.stringify({ fecha: new Date().toISOString(), conteos }, null, 2));
      console.log(`\n  Conteos guardados para comparar después: ${path.relative(process.cwd(), archivo)}`);
    } else if (fs.existsSync(archivo)) {
      titulo("Conteos antes / después");
      const antes = JSON.parse(fs.readFileSync(archivo, "utf8")).conteos;
      for (const t of Object.keys(antes)) {
        if (!(t in conteos)) {
          bloqueos.push(`La tabla ${t} existía antes y ya no está.`);
          continue;
        }
        const igual = antes[t] === conteos[t];
        console.log(`  ${t.padEnd(30)} ${String(antes[t]).padStart(6)} → ${String(conteos[t]).padStart(6)}${igual ? "" : "  ← CAMBIÓ"}`);
        if (!igual) bloqueos.push(`La tabla ${t} cambió de ${antes[t]} a ${conteos[t]} filas durante el despliegue (¿alguien escribió?).`);
      }
    } else avisos.push("No hay conteos de antes para comparar (no se corrió la verificación previa en esta máquina).");
  } finally {
    await conn.end();
  }

  // 6) Diferencia de esquema contra schema.prisma (prisma migrate diff: solo compara, no escribe).
  titulo("Diferencia de esquema contra schema.prisma (prisma migrate diff)");
  const diff = spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js", { paths: [path.resolve(__dirname, "..")] }), "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"],
    { cwd: path.resolve(__dirname, ".."), env: process.env, encoding: "utf8" },
  );
  const salida = oculta(diff.stdout ?? "");
  const sentencias = salida.split("\n").filter((l) => /^(CREATE|ALTER|DROP|RENAME)/.test(l.trim()));
  if (diff.status !== 0) {
    bloqueos.push(`prisma migrate diff terminó con código ${diff.status}: ${oculta(String(diff.stderr ?? "").split("\n").slice(-3).join(" "))}`);
  } else if (/empty migration/i.test(salida) || !sentencias.length) {
    console.log("  Sin diferencias: la base coincide con schema.prisma.");
  } else {
    console.log(`  ${sentencias.length} sentencias de diferencia:`);
    for (const l of sentencias) console.log(`    ${l.trim().slice(0, 160)}`);
    const ajenas = sentencias.filter((l) => !TABLAS.some((t) => l.includes(`\`${t}\``)));
    if (DESPUES) bloqueos.push("Después de migrar, schema.prisma y la base deberían coincidir y todavía hay diferencias (ver arriba).");
    else if (ajenas.length) {
      bloqueos.push(
        `Hay ${ajenas.length} diferencias de esquema que NO son de las tablas de este despliegue (${TABLAS.join(", ")}) (ver arriba): la base no está en el esquema de master. Frenar y revisar con el equipo antes de migrar.`,
      );
    } else if (estadoPlan === "igual") {
      bloqueos.push("Las tablas existen con la forma esperada pero schema.prisma todavía difiere en ellas (ver arriba).");
    } else console.log("  Todas son de las tablas de este despliegue (es lo que va a agregar).");
  }

  titulo("Resultado");
  for (const a of avisos) console.log(`  AVISO: ${a}`);
  for (const b of bloqueos) console.log(`  BLOQUEA: ${b}`);
  console.log(
    bloqueos.length
      ? `\n  NO seguir: ${bloqueos.join(" | ")}`
      : DESPUES
        ? "\n  OK: la migración quedó aplicada y verificada."
        : "\n  OK para migrar.",
  );
  console.log(`  (${((Date.now() - inicio) / 1000).toFixed(1)} s)`);
  process.exitCode = bloqueos.length ? 1 : 0;
}

// ¿Git ignora este archivo? (git check-ignore: solo lee, no escribe)
function ignoradoPorGit(archivo) {
  const r = spawnSync("git", ["check-ignore", "-q", archivo], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  return r.status === 0;
}

// Avisos de negocio: lo que tiene que haber para que /web venda. Sin datos personales.
async function datosDeNegocio(conn) {
  titulo("Datos que necesita la web (avisos, no frenan)");
  const tipos = await conn.query(
    "SELECT t.id, t.nombre, COUNT(h.id) AS habitaciones, MAX(h.capacidad) AS capacidadMaxima " +
      "FROM tipos_habitacion t LEFT JOIN habitaciones h ON h.tipoHabitacionId=t.id AND h.activo=1 " +
      "WHERE t.activo=1 GROUP BY t.id, t.nombre ORDER BY t.nombre",
  );
  const vendibles = tipos.filter((t) => Number(t.habitaciones) > 0);
  console.log("  Tipos activos con al menos una habitación activa (vendibles en la web):");
  if (!vendibles.length) console.log("    (ninguno)");
  for (const t of vendibles) console.log(`    ${t.nombre}: ${Number(t.habitaciones)} habitaciones, capacidad máxima ${Number(t.capacidadMaxima)}`);
  if (!vendibles.length) avisos.push("No hay ningún tipo de habitación vendible (activo y con habitaciones activas): la web no tiene qué mostrar.");
  for (const t of tipos.filter((x) => Number(x.habitaciones) === 0)) avisos.push(`El tipo "${t.nombre}" está activo pero no tiene habitaciones activas: no aparece en la web.`);

  console.log("  Habitaciones activas por tipo y capacidad:");
  const porCapacidad = await conn.query(
    "SELECT t.nombre, h.capacidad, COUNT(*) AS n FROM habitaciones h JOIN tipos_habitacion t ON t.id=h.tipoHabitacionId " +
      "WHERE h.activo=1 AND t.activo=1 GROUP BY t.nombre, h.capacidad ORDER BY t.nombre, h.capacidad",
  );
  for (const f of porCapacidad) {
    const marca = f.nombre === "Doble" && Number(f.capacidad) === 4 ? "  ← Doble con capacidad 4, corregir a 3" : "";
    console.log(`    ${f.nombre} · capacidad ${Number(f.capacidad)}: ${Number(f.n)}${marca}`);
    if (marca) avisos.push(`Hay ${Number(f.n)} habitaciones Doble con capacidad 4: la web ofrecería 4 personas en una Doble (corregir a 3 antes de publicar).`);
  }

  console.log("  Planes tarifarios activos:");
  const planes = await conn.query("SELECT codigo, reembolsable, visibleWeb FROM planes_tarifarios WHERE activo=1 ORDER BY codigo");
  if (!planes.length) console.log("    (ninguno)");
  for (const p of planes) console.log(`    ${p.codigo}: ${p.reembolsable ? "reembolsable" : "no reembolsable"}, ${Number(p.visibleWeb) ? "visible en la web" : "NO visible en la web"}`);
  if (!planes.some((p) => Number(p.visibleWeb))) avisos.push("Ningún plan activo es visible en la web (visibleWeb): no se puede reservar online.");

  const temporadas = (
    await conn.query(
      "SELECT id, nivel, DATE_FORMAT(fechaDesde,'%Y-%m-%d') AS fechaDesde, DATE_FORMAT(fechaHasta,'%Y-%m-%d') AS fechaHasta FROM temporadas WHERE activa=1",
    )
  ).map((t) => ({ ...t, id: Number(t.id) }));
  const base = temporadas.find((t) => t.nivel === "BASE");
  console.log(`  Temporada BASE activa: ${base ? "sí" : "NO"}`);
  if (!base) avisos.push("No hay temporada BASE activa: las fechas fuera de otras temporadas no tienen precio.");

  // Método: consulta SQL equivalente al motor (misma conexión; no usa lib/prisma). Temporada efectiva =
  // activa que cubre la fecha, de mayor prioridad, o la BASE; tarifa = mayor vigenteDesde <= hoy (fecha de venta).
  const tarifas = (
    await conn.query("SELECT tipoHabitacionId AS tipoId, temporadaId, DATE_FORMAT(vigenteDesde,'%Y-%m-%d') AS vigenteDesde FROM tarifas")
  ).map((t) => ({ tipoId: Number(t.tipoId), temporadaId: Number(t.temporadaId), vigenteDesde: t.vigenteDesde }));
  const hoy = fechaHotel(0);
  const fechas = [hoy, fechaHotel(DIAS_VENTANA)];
  console.log(`  Tarifa vigente por tipo vendible (método: consulta SQL equivalente al motor de tarifas, misma conexión; venta de hoy ${hoy}):`);
  for (const t of vendibles) {
    const partes = fechas.map((f) => {
      const temp = temporadaEfectiva(temporadas, f);
      const tarifa = temp ? tarifaVigente(tarifas, Number(t.id), temp.id, hoy) : null;
      if (!tarifa) avisos.push(`El tipo "${t.nombre}" no tiene tarifa vigente para ${f} (temporada ${temp?.nivel ?? "ninguna"}): la web no podría cotizarlo.`);
      return `${f} ${tarifa ? `sí (${temp.nivel})` : `NO (${temp?.nivel ?? "sin temporada"})`}`;
    });
    console.log(`    ${t.nombre}: ${partes.join(" · ")}`);
  }

  const reservas = await conn.query("SELECT estado, COUNT(*) AS n FROM reservas WHERE estado IN ('Confirmada','En curso') GROUP BY estado");
  console.log("  Reservas vigentes:");
  if (!reservas.length) console.log("    Ninguna Confirmada ni En curso.");
  for (const r of reservas) console.log(`    ${r.estado}: ${Number(r.n)}`);
}

main().catch((e) => {
  console.error(`No se pudo verificar: ${oculta(e.message ?? e)}`);
  process.exitCode = 1;
});
