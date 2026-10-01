// Migración única — HU-89, Etapa 1 de tarifas por temporada: crea el
// catálogo TipoHabitacion a partir de los valores actuales (texto libre)
// de Habitacion.tipo, y asigna tipoHabitacionId a cada habitación.
//
// Dos modos explícitos — sin flag, no corre nada:
//   node scripts/migracion-tipo-habitacion.js --dry-run
//   node scripts/migracion-tipo-habitacion.js --apply
//
// Idempotente: --apply solo toca habitaciones con tipoHabitacionId IS NULL
// y reutiliza un TipoHabitacion existente por nombre normalizado antes de
// crear uno nuevo — correrlo dos veces no duplica tipos ni reprocesa lo ya
// migrado. Corre dentro de una única transacción (tabla chica, sin el
// problema de pool de conexiones que tiene migracion-consolidar-centrales.js
// con sus decenas de pasos contra tablas grandes).
//
// ════════════════════════════════════════════════════════════
// HISTÓRICO — Etapa 4C (cierre del módulo de tarifas) eliminó
// Habitacion.tipo, la columna de texto libre que este script lee. Ya no
// puede correr contra el schema final: solo funciona sobre el schema
// intermedio (tag de git `etapa4c-schema-intermedio`), en el paso 3 del
// runbook de despliegue (docs/despliegue-tarifas.md) — antes de sembrar
// planes/tarifas y de migrar las reservas viejas. Se conserva en el repo
// como registro de cómo se creó el catálogo TipoHabitacion, no para volver
// a correr.
// ════════════════════════════════════════════════════════════
require("dotenv").config();
const prisma = require("../src/lib/prisma");

// Trim + colapso de espacios internos — NO toca mayúsculas/minúsculas acá
// (eso es solo para la CLAVE de agrupación, ver claveAgrupacion). Esta es
// la forma "canónica de display" de una variante.
function normalizar(t) {
  return String(t ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function claveAgrupacion(t) {
  return normalizar(t).toLowerCase();
}

// Nombre → MAYÚSCULAS sin acentos, todo lo que no sea [A-Z0-9] pasa a "-",
// guiones repetidos/de borde colapsados. Nunca vacío (fallback "TIPO").
function generarCodigoBase(nombre) {
  const base = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "TIPO";
}

// 2-10 caracteres, único contra lo que ya se generó en esta misma corrida
// y contra lo que ya existía en la base. Colisión -> sufijo "-2", "-3"...
// recortando la base para que el total siga entrando en 10 caracteres.
function generarCodigoUnico(nombre, codigosUsados) {
  const base = generarCodigoBase(nombre).slice(0, 10);
  const candidatoInicial = base.length >= 2 ? base : `${base}XX`.slice(0, Math.max(2, base.length + 2));
  let candidato = candidatoInicial;
  let sufijo = 2;
  while (codigosUsados.has(candidato)) {
    const sufijoStr = `-${sufijo}`;
    candidato = base.slice(0, Math.max(1, 10 - sufijoStr.length)) + sufijoStr;
    sufijo += 1;
  }
  codigosUsados.add(candidato);
  return candidato;
}

// La variante normalizada más frecuente del grupo; empate: la más corta,
// después alfabética — para no depender de qué fila se insertó primero.
function nombreCanonico(variantes) {
  const normalizadas = new Map(); // normalizado -> cantidad
  for (const [original, count] of variantes) {
    const norm = normalizar(original);
    normalizadas.set(norm, (normalizadas.get(norm) ?? 0) + count);
  }
  return [...normalizadas.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    if (a[0].length !== b[0].length) return a[0].length - b[0].length;
    return a[0].localeCompare(b[0]);
  })[0][0];
}

// Solo habitaciones sin migrar (tipoHabitacionId IS NULL) — es lo que hace
// que --apply sea idempotente: una habitación ya migrada no se vuelve a
// tocar en una segunda corrida.
async function agruparHabitacionesPorTipo() {
  const habitaciones = await prisma.habitacion.findMany({
    where: { tipoHabitacionId: null },
    select: { id: true, numero: true, tipo: true },
  });

  const grupos = new Map(); // claveAgrupacion -> { variantes: Map(original->cantidad), habitacionIds: [] }
  for (const h of habitaciones) {
    const original = h.tipo ?? "";
    const clave = claveAgrupacion(original);
    if (!grupos.has(clave)) grupos.set(clave, { variantes: new Map(), habitacionIds: [] });
    const grupo = grupos.get(clave);
    grupo.variantes.set(original, (grupo.variantes.get(original) ?? 0) + 1);
    grupo.habitacionIds.push(h.id);
  }
  return grupos;
}

async function dryRun() {
  const grupos = await agruparHabitacionesPorTipo();
  if (grupos.size === 0) {
    console.log("No hay habitaciones con tipoHabitacionId pendiente de migrar — nada para reportar.");
    return;
  }

  const totalHabitaciones = [...grupos.values()].reduce((acc, g) => acc + g.habitacionIds.length, 0);
  console.log(`\n========== DRY-RUN — ${grupos.size} grupo(s), ${totalHabitaciones} habitación(es) ==========\n`);

  let advertenciasVacio = 0;
  let fusiones = 0;
  for (const [, grupo] of grupos) {
    const nombre = nombreCanonico(grupo.variantes);
    const variantesTexto = [...grupo.variantes.entries()].map(([v, c]) => `"${v}" (${c})`).join(", ");
    const esFusion = grupo.variantes.size > 1;
    if (esFusion) fusiones += 1;

    console.log(`[GRUPO] "${nombre}" — ${grupo.habitacionIds.length} habitación(es)`);
    console.log(`   variantes originales: ${variantesTexto}`);
    if (esFusion) {
      console.log(`   -> FUSIÓN: ${grupo.variantes.size} variante(s) se van a unificar en "${nombre}"`);
    }

    const variantesVacias = [...grupo.variantes.keys()].filter((v) => !normalizar(v));
    if (variantesVacias.length > 0) {
      const cantidadVacia = variantesVacias.reduce((acc, v) => acc + grupo.variantes.get(v), 0);
      advertenciasVacio += cantidadVacia;
      console.log(`   [ADVERTENCIA] ${cantidadVacia} de esas habitaciones tienen tipo vacío/solo-espacios.`);
    }
    console.log("");
  }

  if (advertenciasVacio > 0) {
    console.log(`[ADVERTENCIA GENERAL] ${advertenciasVacio} habitación(es) con tipo vacío/solo-espacios en total — requieren corrección manual antes de aplicar.\n`);
  }

  console.log("========== RESUMEN ==========");
  console.log(`${grupos.size} tipo(s) de habitación se crearían.`);
  console.log(`${fusiones} de ellos son fusión de más de una variante de texto.`);
  console.log("Ningún dato fue escrito — modo dry-run.");
}

async function apply() {
  const grupos = await agruparHabitacionesPorTipo();
  if (grupos.size === 0) {
    console.log("No hay habitaciones con tipoHabitacionId pendiente — nada para migrar (correr de nuevo acá es un no-op esperado, confirma idempotencia).");
    return;
  }

  const tiposExistentes = await prisma.tipoHabitacion.findMany({ select: { id: true, codigo: true, nombre: true } });
  const codigosUsados = new Set(tiposExistentes.map((t) => t.codigo));
  const porNombreNormalizado = new Map(tiposExistentes.map((t) => [normalizar(t.nombre).toLowerCase(), t]));
  const creadosEnEstaCorrida = [];

  await prisma.$transaction(
    async (tx) => {
      for (const [, grupo] of grupos) {
        const nombre = nombreCanonico(grupo.variantes);
        const claveNombre = nombre.toLowerCase();
        let tipo = porNombreNormalizado.get(claveNombre);

        if (!tipo) {
          const codigo = generarCodigoUnico(nombre, codigosUsados);
          tipo = await tx.tipoHabitacion.create({ data: { codigo, nombre, activo: true } });
          porNombreNormalizado.set(claveNombre, tipo);
          creadosEnEstaCorrida.push({ nombre: tipo.nombre, codigo: tipo.codigo, cantidad: grupo.habitacionIds.length });
          console.log(`OK: creado tipo "${tipo.nombre}" (codigo=${tipo.codigo}, id=${tipo.id}) <- ${grupo.habitacionIds.length} habitación(es)`);
        } else {
          console.log(`OK: reusado tipo existente "${tipo.nombre}" (codigo=${tipo.codigo}, id=${tipo.id}) <- ${grupo.habitacionIds.length} habitación(es)`);
        }

        await tx.habitacion.updateMany({
          where: { id: { in: grupo.habitacionIds } },
          data: { tipoHabitacionId: tipo.id },
        });
      }
    },
    { timeout: 15000, maxWait: 10000 }
  );

  console.log("\n========== TIPOS NUEVOS CREADOS EN ESTA CORRIDA (códigos provisorios) ==========");
  if (creadosEnEstaCorrida.length === 0) {
    console.log("Ninguno — no se crearon tipos nuevos en esta corrida.");
  } else {
    creadosEnEstaCorrida.forEach((c) => console.log(`  "${c.nombre}" -> código "${c.codigo}" (${c.cantidad} habitación(es))`));
    console.log("\nEstos códigos son PROVISORIOS — reemplazarlos por códigos definitivos desde el ABM de Tipos de Habitación.");
  }
}

async function main() {
  const modo = process.argv[2];
  if (modo === "--dry-run") return dryRun();
  if (modo === "--apply") return apply();
  console.log("Uso: node scripts/migracion-tipo-habitacion.js --dry-run | --apply");
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
