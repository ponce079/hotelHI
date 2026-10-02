// Prueba del seed de demo del check-in contra una base LOCAL de pruebas (ESTADIA_TEST_DATABASE_URL,
// misma guardia que test:checkin-rediseno). Secuencia de la mañana de la presentación después de
// un ensayo:
//   seed → check-in de los casos a, b y d por la API (i ya está en curso) → --limpiar → seed
// y entonces: todos los casos aparecen y se pueden confirmar, las estadías de demo que estaban
// En curso quedaron cerradas y ninguna persona de un caso está alojada en otra estadía.
//
//   npm run test:seed-demo
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const entorno = require("./_entornoPruebas");
entorno.cargarEntornoDePruebas();
entorno.prepararEsquema();
const p = require("../src/lib/prisma");
const rutaCorreo = require.resolve("../src/lib/correo");
require.cache[rutaCorreo] = { id: rutaCorreo, filename: rutaCorreo, loaded: true, exports: { enviarCorreo: async () => ({ enviado: false }) } };
const { hoyComoFechaUTC } = require("../src/lib/fechas");

const MANIFIESTO = path.join(__dirname, ".demo-checkin.json");
const BASE = (() => {
  const u = new URL(process.env.DATABASE_URL);
  return `${u.hostname}:${u.port || 3306}${u.pathname}`;
})();
const hoy = hoyComoFechaUTC().toISOString().slice(0, 10);
const CASOS_HOY = ["a", "b", "c", "d", "e", "h"];
let resultados = 0;
const ok = (m) => {
  resultados += 1;
  console.log(`OK: ${m}`);
};

function correrSeed(...args) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "seed-checkin-demo.js"), ...args], { env: process.env, encoding: "utf8" });
  return { status: r.status, salida: `${r.stdout}${r.stderr}` };
}
const manifiesto = () => JSON.parse(fs.readFileSync(MANIFIESTO, "utf8"))[BASE];

// Servidor efímero con las rutas reales del check-in (como las usa la pantalla).
async function conServidor(fn) {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/check-in", require("../src/modulos/check-in/checkIn.routes"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Personas del check-in de una reserva de demo: el titular de la reserva en la primera habitación,
// un adulto titular en cada habitación siguiente y el resto con documentos 99… de un solo uso.
let secuencia = 0;
const documento = () => `99${String((Date.now() + secuencia++) % 1e6).padStart(6, "0")}`;
async function confirmarPorApi(url, reservaId) {
  const r = await p.reserva.findUnique({
    where: { id: reservaId },
    include: { huesped: true, reservaHabitaciones: { orderBy: { id: "asc" } } },
  });
  const personas = [];
  let id = 0;
  const comun = { nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", telefono: "+54 387 555-0100" };
  r.reservaHabitaciones.forEach((rh, indice) => {
    let titularHabitacion = null;
    for (let i = 0; i < rh.adultos; i += 1) {
      id += 1;
      const esTitular = i === 0;
      const delHuesped = indice === 0 && i === 0;
      const [nombre, ...resto] = delHuesped ? r.huesped.nombre.split(" ") : ["Prueba", `Adulto${id}`];
      personas.push({
        id,
        habitacionId: rh.habitacionId,
        esTitular,
        nombre,
        apellido: delHuesped ? resto.join(" ") || "Demo" : resto.join(" "),
        tipoDocumento: delHuesped ? r.huesped.tipoDocumento : "DNI",
        paisDocumento: delHuesped ? r.huesped.paisDocumento || "AR" : "AR",
        numeroDocumento: delHuesped ? r.huesped.numeroDocumento : documento(),
        fechaNacimiento: "1985-05-05",
        ...comun,
      });
      if (esTitular) titularHabitacion = id;
    }
    for (let i = 0; i < rh.menores; i += 1) {
      id += 1;
      personas.push({
        id,
        habitacionId: rh.habitacionId,
        esTitular: false,
        nombre: "Prueba",
        apellido: `Menor${id}`,
        tipoDocumento: "DNI",
        paisDocumento: "AR",
        numeroDocumento: documento(),
        fechaNacimiento: "2018-05-05",
        responsableId: titularHabitacion,
        vinculoResponsable: "Padre o madre",
        ...comun,
        telefono: "",
      });
    }
  });
  const res = await fetch(`${url}/api/check-in/${reservaId}/confirmar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operador: "Prueba seed demo",
      habitaciones: r.reservaHabitaciones.map((rh) => ({ habitacionIdAnterior: rh.habitacionId, adultos: rh.adultos, menores: rh.menores })),
      personas,
      totalEsperado: (await require("../src/modulos/reservas/reservas.servicio").obtenerReserva(reservaId)).totalEstimadoAlojamiento,
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
    }),
  });
  const cuerpo = await res.json();
  assert.equal(res.status, 200, `check-in de ${r.codigoConfirmacion}: ${cuerpo.error}`);
  return r.codigoConfirmacion;
}

// Ninguna persona de un caso puede estar alojada en una estadía que no sea la del propio caso.
async function personasLibres(m) {
  for (const [clave, reservaId] of Object.entries(m.reservas)) {
    const r = await p.reserva.findUnique({ where: { id: reservaId }, include: { huesped: true } });
    const documentos = [r.huesped.numeroDocumento, ...Object.values(m.personas?.[clave] ?? {}).map((x) => x.numeroDocumento)];
    const ajenas = await p.ocupanteReserva.count({
      where: { identidadActiva: { not: null }, numeroDocumento: { in: documentos }, reservaId: { not: reservaId } },
    });
    assert.equal(ajenas, 0, `caso ${clave}: tiene personas alojadas en otra estadía`);
  }
}

async function estadoDeCasos(m) {
  const filas = {};
  for (const [clave, id] of Object.entries(m.reservas)) filas[clave] = await p.reserva.findUnique({ where: { id } });
  return filas;
}

async function main() {
  // 1) Seed inicial (deja todo listo).
  let corrida = correrSeed();
  assert.equal(corrida.status, 0, corrida.salida);
  let m = manifiesto();
  for (const clave of [...CASOS_HOY, "f", "g", "i"]) assert.ok(m.reservas[clave], `falta el caso ${clave}`);
  ok("seed inicial: todos los casos creados");

  // 2) Ensayo: check-in por la API de a, b y d (i ya está en curso).
  const ensayadas = await conServidor(async (url) => {
    const codigos = [];
    for (const clave of ["a", "b", "d"]) codigos.push(await confirmarPorApi(url, m.reservas[clave]));
    return codigos;
  });
  const enCursoAntes = Object.values(await estadoDeCasos(m)).filter((r) => r.estado === "En curso").map((r) => r.id);
  assert.ok(enCursoAntes.length >= 4, "a, b, d e i quedaron en curso");
  ok(`ensayo: check-in por la API de ${ensayadas.join(", ")} (más el caso i, en curso)`);

  // 3) --limpiar: anula las Confirmadas y cierra con check-out real las En curso de demo.
  corrida = correrSeed("--limpiar");
  assert.equal(corrida.status, 0, corrida.salida);
  for (const id of enCursoAntes) {
    const r = await p.reserva.findUnique({ where: { id } });
    assert.equal(r.estado, "Cerrada", `${r.codigoConfirmacion} quedó ${r.estado}`);
    assert.equal(await p.ocupanteReserva.count({ where: { reservaId: id, identidadActiva: { not: null } } }), 0);
  }
  const todasDeDemo = [...Object.values(m.reservas), ...(m.anteriores ?? [])];
  assert.equal(await p.reserva.count({ where: { id: { in: todasDeDemo }, estado: "En curso" } }), 0, "no queda ninguna de demo en curso");
  m = manifiesto();
  assert.ok(m.pagosDemo.every((x) => x.medio === "Efectivo"), "los pagos de demo quedan en el manifiesto");
  ok(`--limpiar: ${enCursoAntes.length} estadías de demo cerradas con check-out (pagos de demo en el manifiesto: ${m.pagosDemo.length})`);

  // 4) Seed de la mañana: todo listo y usable.
  corrida = correrSeed();
  assert.equal(corrida.status, 0, corrida.salida);
  assert.doesNotMatch(corrida.salida, /✖|Error/);
  m = manifiesto();
  const casos = await estadoDeCasos(m);
  for (const clave of CASOS_HOY) {
    assert.equal(casos[clave].estado, "Confirmada", `caso ${clave}`);
    assert.equal(casos[clave].fechaDesde.toISOString().slice(0, 10), hoy, `caso ${clave} ingresa hoy`);
  }
  assert.equal(casos.f.estado, "Cerrada");
  assert.equal(casos.g.estado, "Confirmada");
  assert.equal(casos.i.estado, "En curso");
  await personasLibres(m);
  assert.match(corrida.salida, /Persona que vuelve: DNI 99\d{6}/);
  assert.match(corrida.salida, /Habitaciones libres para el walk-in:\n {2}Doble: .+\n {2}Simple: .+/);
  ok("seed después de --limpiar: todos los casos listos, personas sin estadía en otra reserva y walk-in preparado");

  // 5) Todos los casos de hoy se pueden confirmar.
  await conServidor(async (url) => {
    for (const clave of CASOS_HOY) await confirmarPorApi(url, m.reservas[clave]);
  });
  ok("los casos a, b, c, d, e y h se confirman por la API");

  // 6) Ensayo sin limpiar: el seed recrea con personas nuevas lo que quedó alojado, sin cortarse.
  corrida = correrSeed();
  assert.equal(corrida.status, 0, corrida.salida);
  assert.match(corrida.salida, /recreado con personas nuevas: las anteriores siguen alojadas en/);
  m = manifiesto();
  await personasLibres(m);
  for (const clave of CASOS_HOY) assert.equal((await p.reserva.findUnique({ where: { id: m.reservas[clave] } })).estado, "Confirmada");
  ok("seed sin limpiar después de confirmar: casos recreados con personas nuevas, sin cortarse");

  // Deja la base de pruebas sin estadías de demo en curso.
  corrida = correrSeed("--limpiar");
  assert.equal(corrida.status, 0, corrida.salida);
  console.log(`\n${resultados} bloques OK.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
