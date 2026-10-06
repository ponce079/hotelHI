// Límite de intentos del canal público (HU-106). Se prueba con un servidor
// Express real en un puerto libre y un reloj falso.
const express = require("express");
const { crearLimitador, esFallo, LIMITES, CODIGO } = require("./limiteIntentos");

function armarServidor({ limites, ahora, desactivado = () => false, respuesta }) {
  const { limitar } = crearLimitador({ limites, ahora, desactivado });
  const app = express();
  app.set("trust proxy", true); // para simular IPs distintas con X-Forwarded-For
  app.use(express.json());
  app.post("/reservas", limitar("reserva"), (req, res) => respuesta(req, res));
  app.post("/mi-reserva", limitar("miReserva"), (req, res) => respuesta(req, res));
  app.get("/tipos", limitar("consulta"), (req, res) => res.json([]));
  return new Promise((resolver) => {
    const servidor = app.listen(0, () => resolver(servidor));
  });
}

function llamador(servidor) {
  const { port } = servidor.address();
  return async (ruta, { ip = "10.0.0.1", metodo = "POST", cuerpo = {} } = {}) => {
    const r = await fetch(`http://127.0.0.1:${port}${ruta}`, {
      method: metodo,
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: metodo === "GET" ? undefined : JSON.stringify(cuerpo),
    });
    return { status: r.status, body: await r.json(), retryAfter: r.headers.get("retry-after") };
  };
}

let servidor;
let espiaWarn;
beforeEach(() => {
  espiaWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  espiaWarn.mockRestore();
  if (servidor) await new Promise((r) => servidor.close(r));
  servidor = null;
});

const LIMITES_CHICOS = {
  consulta: { pedidos: 3, ventanaMs: 60000 },
  reserva: { pedidos: 4, ventanaMs: 600000, fallos: 2, ventanaFallosMs: 1800000 },
  miReserva: { pedidos: 10, ventanaMs: 900000, fallos: 3, ventanaFallosMs: 900000 },
};

test("deja pasar hasta el máximo de pedidos y después responde 429 con Retry-After", async () => {
  let t = 1_000_000;
  servidor = await armarServidor({ limites: LIMITES_CHICOS, ahora: () => t, respuesta: (req, res) => res.status(201).json({ ok: true }) });
  const llamar = llamador(servidor);
  for (let i = 0; i < 3; i++) expect((await llamar("/tipos", { metodo: "GET" })).status).toBe(200);
  const bloqueado = await llamar("/tipos", { metodo: "GET" });
  expect(bloqueado.status).toBe(429);
  expect(bloqueado.body).toEqual({ error: expect.stringMatching(/demasiados intentos/i), codigo: CODIGO, reintentarEn: 60 });
  expect(bloqueado.retryAfter).toBe("60");
  // Otra IP no está afectada.
  expect((await llamar("/tipos", { metodo: "GET", ip: "10.0.0.2" })).status).toBe(200);
  // Ventana deslizante: pasado el minuto vuelve a aceptar.
  t += 60001;
  expect((await llamar("/tipos", { metodo: "GET" })).status).toBe(200);
});

test("alta: las tarjetas rechazadas cuentan como fallos y bloquean antes del máximo de pedidos (card testing)", async () => {
  const t = 5_000_000;
  servidor = await armarServidor({
    limites: LIMITES_CHICOS,
    ahora: () => t,
    respuesta: (req, res) => res.status(402).json({ error: "Rechazada", codigo: "PAGO_RECHAZADO", motivo: "Fondos insuficientes" }),
  });
  const llamar = llamador(servidor);
  expect((await llamar("/reservas")).status).toBe(402);
  expect((await llamar("/reservas")).status).toBe(402);
  const bloqueado = await llamar("/reservas");
  expect(bloqueado.status).toBe(429);
  expect(bloqueado.body.reintentarEn).toBe(1800);
  expect(espiaWarn).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(espiaWarn.mock.calls)).not.toMatch(/Fondos|PAGO_RECHAZADO/);
});

test("alta: un 400 de otro campo no es fallo; uno de tarjeta.* sí", () => {
  expect(esFallo("reserva", 400, { codigo: "DATOS_INVALIDOS", campo: "huesped.email" })).toBe(false);
  expect(esFallo("reserva", 400, { codigo: "DATOS_INVALIDOS", campo: "tarjeta.numero" })).toBe(true);
  expect(esFallo("reserva", 422, { codigo: "TARJETA_VENCE_ANTES" })).toBe(true);
  expect(esFallo("reserva", 409, { codigo: "PRECIO_CAMBIADO" })).toBe(false);
  expect(esFallo("reserva", 201, {})).toBe(false);
  expect(esFallo("miReserva", 404, { codigo: "NO_ENCONTRADA" })).toBe(true);
  expect(esFallo("miReserva", 200, {})).toBe(false);
});

test("alta: reservas exitosas solo cuentan para el máximo de pedidos", async () => {
  servidor = await armarServidor({ limites: LIMITES_CHICOS, ahora: () => 1, respuesta: (req, res) => res.status(201).json({ codigoConfirmacion: "X" }) });
  const llamar = llamador(servidor);
  for (let i = 0; i < 4; i++) expect((await llamar("/reservas")).status).toBe(201);
  expect((await llamar("/reservas")).status).toBe(429);
});

test("Mi reserva: los 404 seguidos (probar códigos al azar) bloquean", async () => {
  servidor = await armarServidor({
    limites: LIMITES_CHICOS,
    ahora: () => 1,
    respuesta: (req, res) => res.status(404).json({ error: "No encontramos…", codigo: "NO_ENCONTRADA" }),
  });
  const llamar = llamador(servidor);
  for (let i = 0; i < 3; i++) expect((await llamar("/mi-reserva")).status).toBe(404);
  expect((await llamar("/mi-reserva")).status).toBe(429);
  // El límite es por grupo: el alta de esa IP sigue funcionando.
});

test("desactivado (WEB_LIMITE_INTENTOS=off) deja pasar todo", async () => {
  servidor = await armarServidor({ limites: LIMITES_CHICOS, ahora: () => 1, desactivado: () => true, respuesta: (req, res) => res.json({}) });
  const llamar = llamador(servidor);
  for (let i = 0; i < 6; i++) expect((await llamar("/tipos", { metodo: "GET" })).status).toBe(200);
});

test("los límites reales son razonables para un huésped y un grupo desconocido falla al armar las rutas", () => {
  expect(LIMITES.reserva.pedidos).toBeGreaterThanOrEqual(5);
  expect(LIMITES.reserva.fallos).toBeGreaterThanOrEqual(3);
  expect(LIMITES.miReserva.fallos).toBeGreaterThanOrEqual(3);
  expect(() => crearLimitador().limitar("inexistente")).toThrow(/desconocido/);
});
