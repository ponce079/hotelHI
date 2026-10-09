// Roles en el backend del check-out y de las consultas de check-in (datos personales, Ley 25.326), y operador
// tomado siempre de la sesión. Rutas reales con sesión y servicios reemplazados por dobles.
jest.mock("../lib/prisma", () => ({}));
jest.mock("./usuarios/usuarios.servicio", () => ({ obtenerUsuarioParaSesion: jest.fn(), iniciarSesion: jest.fn() }));
jest.mock("./check-out/checkOut.servicio", () => ({
  ErrorDeNegocio: class extends Error {},
  consolidarCargos: jest.fn().mockResolvedValue({}),
  listarVerificaciones: jest.fn().mockResolvedValue([]),
  registrarVerificacion: jest.fn().mockResolvedValue({}),
  confirmarCheckOut: jest.fn().mockResolvedValue({}),
}));
jest.mock("./check-in/checkIn.servicio", () => ({
  ErrorDeNegocio: class extends Error {},
  buscarReservaParaCheckIn: jest.fn().mockResolvedValue({}),
  listarHabitacionesLibresAhora: jest.fn().mockResolvedValue([]),
  confirmarCheckInConReserva: jest.fn().mockResolvedValue({}),
  registrarCheckInWalkIn: jest.fn().mockResolvedValue({}),
}));
const express = require("express");
const usuariosServicio = require("./usuarios/usuarios.servicio");
const { firmarToken } = require("./usuarios/usuarios.seguridad");
const checkOutServicio = require("./check-out/checkOut.servicio");
const checkInServicio = require("./check-in/checkIn.servicio");

const USUARIOS = {
  1: { id: 1, usuario: "recepcion.prueba", rol: "recepcionista" },
  2: { id: 2, usuario: "gerente.prueba", rol: "gerente" },
  3: { id: 3, usuario: "housekeeping.prueba", rol: "housekeeping" },
  4: { id: 4, usuario: "admin.prueba", rol: "admin" },
};

let servidor;
let base;

beforeAll(async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  const app = express();
  app.use(express.json());
  app.use("/api/check-out", require("./check-out/checkOut.routes"));
  app.use("/api/check-in", require("./check-in/checkIn.routes"));
  await new Promise((resolver) => {
    servidor = app.listen(0, "127.0.0.1", resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});
afterAll(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  jest.clearAllMocks();
  usuariosServicio.obtenerUsuarioParaSesion.mockImplementation(async (id) => USUARIOS[id] ?? null);
});

async function pedir(metodo, ruta, sesion, cuerpo) {
  const headers = { "Content-Type": "application/json", ...(sesion ? { Authorization: `Bearer ${firmarToken({ id: sesion, rol: USUARIOS[sesion].rol })}` } : {}) };
  const r = await fetch(`${base}${ruta}`, { method: metodo, headers, body: metodo === "GET" ? undefined : JSON.stringify(cuerpo ?? {}) });
  return r.status;
}

// sesión → [admin 4, recepcionista 1, gerente 2, housekeeping 3]; ver = admin+recepcionista, gestionar = solo recepcionista.
const VER = [
  ["GET", "/api/check-out/5/cuenta"],
  ["GET", "/api/check-out/5/verificaciones"],
  ["GET", "/api/check-in/buscar-reserva?codigo=X"],
  ["GET", "/api/check-in/habitaciones-libres?fechaHasta=2030-01-01"],
];
const GESTIONAR = [
  ["POST", "/api/check-out/5/verificaciones"],
  ["POST", "/api/check-out/5/confirmar"],
];

describe.each(VER)("%s %s (admin + recepcionista)", (metodo, ruta) => {
  test("sin sesión 401; gerente y housekeeping 403; admin y recepcionista 200", async () => {
    expect(await pedir(metodo, ruta, null)).toBe(401);
    expect(await pedir(metodo, ruta, 2)).toBe(403);
    expect(await pedir(metodo, ruta, 3)).toBe(403);
    expect(await pedir(metodo, ruta, 4)).toBe(200);
    expect(await pedir(metodo, ruta, 1)).toBe(200);
  });
});

describe.each(GESTIONAR)("%s %s (solo recepcionista)", (metodo, ruta) => {
  test("sin sesión 401; admin, gerente y housekeeping 403; recepcionista 200/201", async () => {
    expect(await pedir(metodo, ruta, null)).toBe(401);
    expect(await pedir(metodo, ruta, 4)).toBe(403);
    expect(await pedir(metodo, ruta, 2)).toBe(403);
    expect(await pedir(metodo, ruta, 3)).toBe(403);
    expect([200, 201]).toContain(await pedir(metodo, ruta, 1));
  });
});

describe("el operador sale de la sesión", () => {
  test("verificación del check-out: registradoPor del cuerpo se ignora", async () => {
    expect(await pedir("POST", "/api/check-out/5/verificaciones", 1, { tipo: "Daño", registradoPor: "otra.persona" })).toBe(201);
    expect(checkOutServicio.registrarVerificacion).toHaveBeenCalledWith("5", expect.objectContaining({ tipo: "Daño", registradoPor: "recepcion.prueba" }));
  });

  test("confirmar check-in con reserva: operador del cuerpo se ignora", async () => {
    expect(await pedir("POST", "/api/check-in/5/confirmar", 1, { operador: "otra.persona" })).toBe(200);
    expect(checkInServicio.confirmarCheckInConReserva).toHaveBeenCalledWith(expect.objectContaining({ operador: "recepcion.prueba" }));
  });

  test("walk-in: operador del cuerpo se ignora (también con admin)", async () => {
    expect(await pedir("POST", "/api/check-in/walk-in", 4, { operador: "otra.persona" })).toBe(201);
    expect(checkInServicio.registrarCheckInWalkIn).toHaveBeenCalledWith(expect.objectContaining({ operador: "admin.prueba" }));
  });
});
