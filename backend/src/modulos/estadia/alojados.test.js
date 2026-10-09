// "Huéspedes en casa": búsqueda (OR de nombre, apellido, documento, código de reserva y habitación exacta), orden con
// desempate y permisos de la ruta GET /estadia/alojados (gerente en solo lectura). Dobles de la base y de la sesión.
jest.mock("../../lib/prisma", () => ({
  ocupanteReserva: { findMany: jest.fn() },
  habitacion: { findUnique: jest.fn() },
}));
jest.mock("../usuarios/usuarios.servicio", () => ({ obtenerUsuarioParaSesion: jest.fn() }));
const express = require("express");
const prisma = require("../../lib/prisma");
const usuariosServicio = require("../usuarios/usuarios.servicio");
const { firmarToken } = require("../usuarios/usuarios.seguridad");
const { alojados } = require("./estadia.servicio");
const router = require("./estadia.routes");

let servidor;
let base;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/estadia", router);
  await new Promise((resolver) => {
    servidor = app.listen(0, resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}/api/estadia`;
});
afterAll(() => new Promise((resolver) => servidor.close(resolver)));

const USUARIOS = {
  1: { id: 1, usuario: "recep", rol: "recepcionista" },
  2: { id: 2, usuario: "gerente", rol: "gerente" },
  3: { id: 3, usuario: "hk", rol: "housekeeping" },
  4: { id: 4, usuario: "dep", rol: "deposito" },
  5: { id: 5, usuario: "comp", rol: "compras" },
};
beforeEach(() => {
  jest.clearAllMocks();
  prisma.ocupanteReserva.findMany.mockResolvedValue([]);
  prisma.habitacion.findUnique.mockResolvedValue(null);
  usuariosServicio.obtenerUsuarioParaSesion.mockImplementation(async (id) => USUARIOS[id] ?? null);
});
const consulta = () => prisma.ocupanteReserva.findMany.mock.calls[0][0];

describe("alojados() sin búsqueda", () => {
  test("solo Alojados, take 500 y orden por apellido con desempate por id", async () => {
    await alojados("");
    const arg = consulta();
    expect(arg.where).toEqual({ estado: "Alojado" });
    expect(arg.take).toBe(500);
    expect(arg.orderBy).toEqual([{ apellido: "asc" }, { id: "asc" }]);
    expect(prisma.habitacion.findUnique).not.toHaveBeenCalled();
  });
  test("trae el tipo de habitación y las fechas de la reserva", async () => {
    await alojados("");
    const reserva = consulta().include.reserva.select;
    expect(reserva.fechaHasta).toBe(true);
    expect(reserva.reservaHabitaciones.include.habitacion.include.tipoHabitacion).toBeTruthy();
  });
});

describe("alojados() con búsqueda", () => {
  test("suma con OR nombre, apellido, documento y código de reserva (contiene)", async () => {
    await alojados("ab12");
    const { OR } = consulta().where;
    expect(consulta().where.estado).toBe("Alojado");
    expect(OR).toEqual(
      expect.arrayContaining([
        { nombre: { contains: "ab12" } },
        { apellido: { contains: "ab12" } },
        { numeroDocumento: { contains: "ab12" } },
        { reserva: { codigoConfirmacion: { contains: "ab12" } } },
      ]),
    );
    expect(OR).toHaveLength(4);
  });
  test("si q es el número exacto de una habitación, agrega su asignación activa al OR", async () => {
    prisma.habitacion.findUnique.mockResolvedValue({ id: 77 });
    await alojados("  412  ");
    expect(prisma.habitacion.findUnique).toHaveBeenCalledWith({ where: { numero: "412" }, select: { id: true } });
    const { OR } = consulta().where;
    expect(OR).toContainEqual({ asignaciones: { some: { habitacionId: 77, hasta: null } } });
    expect(OR).toContainEqual({ numeroDocumento: { contains: "412" } });
  });
  test("q se recorta antes de comparar; vacío tras recortar no filtra", async () => {
    await alojados("   ");
    expect(consulta().where).toEqual({ estado: "Alojado" });
  });
});

describe("GET /estadia/alojados: permisos", () => {
  const pedir = async (idUsuario, ruta = "/alojados") => {
    const headers = idUsuario ? { Authorization: `Bearer ${firmarToken({ id: idUsuario, rol: USUARIOS[idUsuario].rol })}` } : {};
    const r = await fetch(`${base}${ruta}`, { headers });
    return r.status;
  };
  test.each([1, 2])("el usuario %i (recepcionista / gerente) recibe 200", async (id) => {
    expect(await pedir(id)).toBe(200);
  });
  test.each([3, 4, 5])("el usuario %i (housekeeping / depósito / compras) recibe 403", async (id) => {
    expect(await pedir(id)).toBe(403);
    expect(prisma.ocupanteReserva.findMany).not.toHaveBeenCalled();
  });
  test("sin sesión: 401", async () => {
    expect(await pedir(null)).toBe(401);
  });
  test("las rutas de escritura siguen sin permitir al gerente", async () => {
    const token = firmarToken({ id: 2, rol: "gerente" });
    const r = await fetch(`${base}/1/titular`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
  });
});
