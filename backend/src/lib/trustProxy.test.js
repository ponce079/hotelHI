const express = require("express");
const { leerTrustProxy, configurarTrustProxy } = require("./trustProxy");
const { crearLimitador } = require("../modulos/ecommerce/limiteIntentos");

describe("leerTrustProxy", () => {
  test("ausente, vacía o false: no se configura", () => {
    for (const v of [undefined, "", "  ", "false", "FALSE"]) expect(leerTrustProxy({ TRUST_PROXY: v })).toEqual({ valor: null });
  });
  test("un entero >= 1 pasa como número", () => {
    expect(leerTrustProxy({ TRUST_PROXY: "1" })).toEqual({ valor: 1 });
    expect(leerTrustProxy({ TRUST_PROXY: " 2 " })).toEqual({ valor: 2 });
  });
  test("una lista de IPs o subredes pasa como lista", () => {
    expect(leerTrustProxy({ TRUST_PROXY: "10.0.0.0/8, 172.16.0.1,::1,fd00::/8" }).valor).toEqual(["10.0.0.0/8", "172.16.0.1", "::1", "fd00::/8"]);
  });
  test('"true" se rechaza con un mensaje claro', () => {
    for (const v of ["true", "TRUE", " true "]) expect(() => leerTrustProxy({ TRUST_PROXY: v })).toThrow(/no está permitido.*X-Forwarded-For/);
  });
  test("cualquier otro valor inválido se rechaza", () => {
    for (const v of ["0", "-1", "1.5", "loopback", "10.0.0.0/33", "300.1.1.1", "10.0.0.1,", "abc", "10.0.0.1 10.0.0.2"]) {
      expect(() => leerTrustProxy({ TRUST_PROXY: v })).toThrow(/TRUST_PROXY/);
    }
  });
});

// Servidor Express real con el limitador real de /api/web (límite chico para probar rápido).
async function servidor(env) {
  const { limitar } = crearLimitador({ limites: { reserva: { pedidos: 2, ventanaMs: 60000 } } });
  const app = express();
  configurarTrustProxy(app, env);
  app.post("/reservas", limitar("reserva"), (req, res) => res.json({ ip: req.ip }));
  return new Promise((resolver) => {
    const s = app.listen(0, () => resolver(s));
  });
}
const pedir = (s, ip) => fetch(`http://127.0.0.1:${s.address().port}/reservas`, { method: "POST", headers: { "x-forwarded-for": ip } }).then((r) => r.status);

describe("límite de intentos y X-Forwarded-For", () => {
  test("sin TRUST_PROXY, un X-Forwarded-For falso no cambia la clave: todos comparten el contador", async () => {
    const s = await servidor({});
    try {
      expect(await pedir(s, "1.1.1.1")).toBe(200);
      expect(await pedir(s, "2.2.2.2")).toBe(200);
      expect(await pedir(s, "3.3.3.3")).toBe(429); // otra IP "falsa", mismo contador
    } finally {
      s.close();
    }
  });
  test("con TRUST_PROXY=1, clientes con distinto X-Forwarded-For tienen contadores separados", async () => {
    const s = await servidor({ TRUST_PROXY: "1" });
    try {
      expect(await pedir(s, "1.1.1.1")).toBe(200);
      expect(await pedir(s, "1.1.1.1")).toBe(200);
      expect(await pedir(s, "1.1.1.1")).toBe(429);
      expect(await pedir(s, "2.2.2.2")).toBe(200); // otro cliente: contador propio
    } finally {
      s.close();
    }
  });
  test('TRUST_PROXY="true" hace fallar la configuración (el backend no arranca)', () => {
    expect(() => configurarTrustProxy(express(), { TRUST_PROXY: "true" })).toThrow(/no está permitido/);
  });
});
