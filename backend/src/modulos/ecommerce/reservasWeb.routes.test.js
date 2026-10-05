// Endpoint interno del mostrador (etapa 2): GET /api/reservas-web/:reservaId.
// Se levanta el router real en un puerto efímero, con sesión real (token
// firmado) y dobles de la base y del usuario de la sesión.
jest.mock("../../lib/prisma", () => ({ datosReservaWeb: { findUnique: jest.fn() } }));
jest.mock("../usuarios/usuarios.servicio", () => ({ obtenerUsuarioParaSesion: jest.fn() }));
const express = require("express");
const prisma = require("../../lib/prisma");
const usuariosServicio = require("../usuarios/usuarios.servicio");
const { firmarToken } = require("../usuarios/usuarios.seguridad");
const router = require("./reservasWeb.routes");

let servidor;
let base;

beforeAll(async () => {
  const app = express();
  app.use("/api/reservas-web", router);
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/reservas-web`;
});
afterAll(() => new Promise((resolver) => servidor.close(resolver)));

const USUARIOS = {
  1: { id: 1, usuario: "recep", rol: "recepcionista" },
  2: { id: 2, usuario: "gerente", rol: "gerente" },
  3: { id: 3, usuario: "mucama", rol: "mucama" },
};

beforeEach(() => {
  jest.clearAllMocks();
  usuariosServicio.obtenerUsuarioParaSesion.mockImplementation(async (id) => USUARIOS[id] ?? null);
});

async function pedir(ruta, idUsuario) {
  const headers = idUsuario ? { Authorization: `Bearer ${firmarToken({ id: idUsuario, rol: USUARIOS[idUsuario].rol })}` } : {};
  const r = await fetch(`${base}${ruta}`, { headers });
  return { status: r.status, body: await r.json() };
}

const FILA = {
  emailContacto: "maria@correo.com",
  telefonoContacto: "+54 9 387 555-1234",
  horaEstimadaLlegada: "20-22",
  solicitudesEspeciales: "Cuna",
  tarjetaTitular: "MARIA GONZALEZ",
  tarjetaMarca: "VISA",
  tarjetaUltimos4: "4242",
  tarjetaVencimiento: "08/2028",
  aceptaPoliticasEn: new Date("2026-10-04T17:32:00.000Z"),
  versionPoliticas: "2026-10-01",
  aceptaComunicaciones: true,
  reserva: { planTarifario: { reembolsable: true } },
};

test("sin sesión → 401 y no se consulta la base", async () => {
  const { status } = await pedir("/169");
  expect(status).toBe(401);
  expect(prisma.datosReservaWeb.findUnique).not.toHaveBeenCalled();
});

test("con un rol que no ve reservas → 403", async () => {
  expect((await pedir("/169", 3)).status).toBe(403);
});

test("recepcionista: 200 con los datos web, sin token ni referencia de la pasarela", async () => {
  prisma.datosReservaWeb.findUnique.mockResolvedValue(FILA);
  const { status, body } = await pedir("/169", 1);
  expect(status).toBe(200);
  expect(body).toEqual({
    emailContacto: "maria@correo.com",
    telefonoContacto: "+54 9 387 555-1234",
    horaEstimadaLlegada: "20-22",
    solicitudesEspeciales: "Cuna",
    tarjeta: { titular: "MARIA GONZALEZ", marca: "VISA", ultimos4: "4242", vencimiento: "08/2028" },
    tipoGarantia: "GARANTIA",
    aceptaPoliticasEn: "2026-10-04T17:32:00.000Z",
    versionPoliticas: "2026-10-01",
    aceptaComunicaciones: true,
  });
  // La consulta ni siquiera pide el token ni la referencia.
  const { select } = prisma.datosReservaWeb.findUnique.mock.calls[0][0];
  expect(select).not.toHaveProperty("garantiaToken");
  expect(select).not.toHaveProperty("pasarelaReferencia");
  expect(JSON.stringify(body)).not.toMatch(/garantiaToken|pasarelaReferencia/);
});

test("gerente también la ve; no reembolsable → PREPAGO", async () => {
  prisma.datosReservaWeb.findUnique.mockResolvedValue({ ...FILA, reserva: { planTarifario: { reembolsable: false } } });
  const { status, body } = await pedir("/170", 2);
  expect(status).toBe(200);
  expect(body.tipoGarantia).toBe("PREPAGO");
});

test("reserva del mostrador (sin datos web) → 200 con null", async () => {
  prisma.datosReservaWeb.findUnique.mockResolvedValue(null);
  const res = await pedir("/150", 1);
  expect(res.status).toBe(200);
  expect(res.body).toBeNull();
});

test("id inválido → 400", async () => {
  expect((await pedir("/abc", 1)).status).toBe(400);
});
