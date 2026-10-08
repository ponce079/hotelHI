// API cerrada (HU-106). Se arma una app con el MISMO middleware y las MISMAS rutas que index.js (src/rutas.js),
// con la base y el usuario de la sesión reemplazados por dobles, y se recorre cada ruta registrada.
jest.mock("./prisma", () => ({}));
jest.mock("../modulos/usuarios/usuarios.servicio", () => ({
  obtenerUsuarioParaSesion: jest.fn(),
  iniciarSesion: jest.fn(),
}));
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const usuariosServicio = require("../modulos/usuarios/usuarios.servicio");
const { firmarToken } = require("../modulos/usuarios/usuarios.seguridad");
const { apiCerrada, esPublica, RUTAS_PUBLICAS } = require("./apiCerrada");
const { MONTAJES, montarRutas } = require("../rutas");

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
  // Igual que index.js: primero la API cerrada, después el cuerpo y las rutas.
  app.use("/api", apiCerrada);
  app.use(express.json());
  montarRutas(app);
  await new Promise((resolver) => {
    servidor = app.listen(0, "127.0.0.1", resolver);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});
afterAll(() => new Promise((resolver) => servidor.close(resolver)));

beforeEach(() => {
  usuariosServicio.obtenerUsuarioParaSesion.mockImplementation(async (id) => USUARIOS[id] ?? null);
});

const token = (id) => firmarToken({ id, rol: USUARIOS[id].rol });

async function pedir(metodo, ruta, { sesion, cuerpo, crudo } = {}) {
  const headers = { "Content-Type": "application/json", ...(sesion ? { Authorization: `Bearer ${token(sesion)}` } : {}) };
  const r = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: crudo ?? (metodo === "GET" || metodo === "HEAD" ? undefined : JSON.stringify(cuerpo ?? {})),
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    // sin cuerpo JSON
  }
  return { status: r.status, json };
}

// Todas las rutas registradas: { metodo, ruta } con los parámetros reemplazados por 1.
function rutasRegistradas() {
  const salida = [];
  for (const [prefijo, cargar] of MONTAJES) {
    const router = cargar();
    for (const capa of router.stack) {
      if (!capa.route) continue;
      const ruta = `${prefijo}${capa.route.path === "/" ? "" : capa.route.path}`.replace(/:[A-Za-z]+/g, "1");
      for (const metodo of Object.keys(capa.route.methods)) salida.push({ metodo: metodo.toUpperCase(), ruta });
    }
  }
  return salida;
}

describe("la lista blanca", () => {
  test("es explícita y corta: /api/web/* y el login, nada más", () => {
    expect(RUTAS_PUBLICAS.map((r) => r.prefijo ?? r.exacta)).toEqual(["/api/web", "/api/auth/login"]);
    for (const r of RUTAS_PUBLICAS) expect(r.motivo).toEqual(expect.any(String));
  });

  test("esPublica: prefijo /api/web (y lo que cuelga), login solo por POST; sin trampas de mayúsculas ni barras", () => {
    expect(esPublica("GET", "/api/web/tipos")).toBe(true);
    expect(esPublica("POST", "/api/web/reservas")).toBe(true);
    expect(esPublica("GET", "/api/web")).toBe(true);
    expect(esPublica("GET", "/API/WEB/tipos/")).toBe(true);
    expect(esPublica("POST", "/api/auth/login")).toBe(true);
    expect(esPublica("POST", "/api/auth/login/")).toBe(true);

    expect(esPublica("GET", "/api/auth/login")).toBe(false);
    expect(esPublica("GET", "/api/auth/yo")).toBe(false);
    expect(esPublica("POST", "/api/auth/loginx")).toBe(false);
    expect(esPublica("GET", "/api/webx/tipos")).toBe(false);
    expect(esPublica("GET", "/api/reservas-web/1")).toBe(false);
    expect(esPublica("GET", "/api/reservas/disponibilidad")).toBe(false);
    expect(esPublica("GET", "/api/usuarios")).toBe(false);
    expect(esPublica("GET", "/api")).toBe(false);
    expect(esPublica("GET", "")).toBe(false);
  });
});

describe("toda ruta de /api fuera de la lista blanca responde 401 sin sesión", () => {
  const rutas = rutasRegistradas();

  test("se recorren las rutas reales (hay muchas y están las del mostrador y las públicas)", () => {
    expect(rutas.length).toBeGreaterThan(150);
    const texto = rutas.map((r) => `${r.metodo} ${r.ruta}`);
    expect(texto).toEqual(expect.arrayContaining(["POST /api/reservas", "POST /api/reservas/con-garantia", "GET /api/web/tipos", "POST /api/auth/login", "GET /api/auth/yo"]));
  });

  test("ninguna ruta no pública queda abierta", async () => {
    const abiertas = [];
    for (const { metodo, ruta } of rutas) {
      if (esPublica(metodo, ruta)) continue;
      const { status, json } = await pedir(metodo, ruta);
      if (status !== 401) abiertas.push(`${metodo} ${ruta} → ${status}`);
      else expect(json.codigo).toBe("SESION_INVALIDA");
    }
    expect(abiertas).toEqual([]);
  }, 60000);

  test("tampoco con un token vencido, mal firmado o de un usuario que ya no existe", async () => {
    const malFirmado = `${token(1).slice(0, -4)}AAAA`;
    for (const encabezado of ["Bearer nada", `Bearer ${malFirmado}`, "Basic abc", "Bearer "]) {
      const r = await fetch(`${base}/api/reservas`, { headers: { Authorization: encabezado } });
      expect(r.status).toBe(401);
    }
    usuariosServicio.obtenerUsuarioParaSesion.mockResolvedValue(null);
    const r = await fetch(`${base}/api/reservas`, { headers: { Authorization: `Bearer ${token(1)}` } });
    expect(r.status).toBe(401);
  });

  test("sin sesión se rechaza ANTES de leer el cuerpo (un JSON roto no llega al parser)", async () => {
    const { status, json } = await pedir("POST", "/api/reservas/con-garantia", { crudo: "{esto no es json" });
    expect(status).toBe(401);
    expect(json.codigo).toBe("SESION_INVALIDA");
  });

  test("las variantes de mayúsculas, barras y puntos no abren nada", async () => {
    for (const ruta of ["/API/reservas", "/api/RESERVAS/", "/api/webx/tipos", "/api/reservas-web/1", "/api/auth/yo", "/api/inexistente"]) {
      expect((await pedir("GET", ruta)).status).toBe(401);
    }
    // El login es solo POST: un GET sin sesión es 401, no un 404 que revele nada.
    expect((await pedir("GET", "/api/auth/login")).status).toBe(401);
  });
});

describe("con sesión de recepcionista las rutas del mostrador responden (pasan la guarda de sesión y de rol)", () => {
  const RECEPCION = 1;
  const rutasMostrador = [
    ["GET", "/api/reservas"],
    ["GET", "/api/reservas/disponibilidad"],
    ["POST", "/api/reservas/cotizar"],
    ["POST", "/api/reservas"],
    ["POST", "/api/reservas/con-garantia"],
    ["PATCH", "/api/reservas/1"],
    ["POST", "/api/reservas/1/cancelar"],
    ["POST", "/api/reservas/1/no-show"],
    ["GET", "/api/reservas/no-show-pendientes"],
    ["GET", "/api/reservas/1/garantia"],
    ["GET", "/api/reservas-web/1"],
    ["GET", "/api/check-in/llegadas"],
    ["GET", "/api/check-in/buscar-reserva"],
    ["POST", "/api/check-in/walk-in"],
    ["POST", "/api/check-in/1/confirmar"],
    ["GET", "/api/huespedes/por-documento"],
    ["GET", "/api/habitaciones"],
    ["GET", "/api/pagos-estadia"],
    ["GET", "/api/auth/yo"],
  ];

  test.each(rutasMostrador)("%s %s no responde 401 ni 403", async (metodo, ruta) => {
    const { status } = await pedir(metodo, ruta, { sesion: RECEPCION });
    expect([401, 403]).not.toContain(status);
  });

  test("el rol sigue importando: gerente y housekeeping no crean reservas ni confirman check-ins (403)", async () => {
    for (const sesion of [2, 3]) {
      for (const [metodo, ruta] of [
        ["POST", "/api/reservas"],
        ["POST", "/api/reservas/con-garantia"],
        ["PATCH", "/api/reservas/1"],
        ["POST", "/api/reservas/1/cancelar"],
        ["POST", "/api/check-in/walk-in"],
        ["POST", "/api/check-in/1/confirmar"],
      ]) {
        const { status } = await pedir(metodo, ruta, { sesion, cuerpo: {} });
        expect([metodo, ruta, sesion, status]).toEqual([metodo, ruta, sesion, 403]);
      }
    }
  });

  test("el administrador también puede (admin y recepcionista gestionan reservas)", async () => {
    const { status } = await pedir("POST", "/api/reservas/con-garantia", { sesion: 4 });
    expect([401, 403]).not.toContain(status);
  });

  test("lecturas sin rol específico: cualquier usuario con sesión (el gerente consulta reservas)", async () => {
    const { status } = await pedir("GET", "/api/reservas", { sesion: 2 });
    expect([401, 403]).not.toContain(status);
  });
});

describe("/api/web/* sigue siendo público", () => {
  test.each([
    ["GET", "/api/web/tipos"],
    ["GET", "/api/web/planes"],
    ["GET", "/api/web/disponibilidad"],
    ["POST", "/api/web/cotizar"],
    ["POST", "/api/web/reservas"],
    ["POST", "/api/web/mi-reserva"],
    ["POST", "/api/web/mi-reserva/cancelar"],
  ])("%s %s sin sesión no responde 401", async (metodo, ruta) => {
    const { status } = await pedir(metodo, ruta);
    expect(status).not.toBe(401);
  });

  test("el login es público (POST sin sesión no da 401 por falta de sesión)", async () => {
    usuariosServicio.iniciarSesion.mockResolvedValue({ token: "t", usuario: { id: 1 } });
    const { status, json } = await pedir("POST", "/api/auth/login", { cuerpo: { usuario: "x", contrasena: "y" } });
    expect(status).not.toBe(401);
    expect(json?.codigo).not.toBe("SESION_INVALIDA");
  });
});

describe("el montaje no se puede saltear", () => {
  test("todos los *.routes.js de src/modulos están montados en src/rutas.js", () => {
    const raiz = path.resolve(__dirname, "../modulos");
    const archivos = [];
    (function recorrer(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) recorrer(path.join(dir, e.name));
        else if (/\.routes\.js$/.test(e.name)) archivos.push(e.name);
      }
    })(raiz);
    const montajes = fs.readFileSync(path.resolve(__dirname, "../rutas.js"), "utf8");
    const sinMontar = archivos.filter((a) => !montajes.includes(a.replace(/\.js$/, "")));
    expect(sinMontar).toEqual([]);
  });

  test("index.js monta la API cerrada ANTES del cuerpo y de las rutas", () => {
    const index = fs.readFileSync(path.resolve(__dirname, "../../index.js"), "utf8");
    const iCerrada = index.indexOf('app.use("/api", apiCerrada)');
    const iJson = index.indexOf("app.use(express.json())");
    const iRutas = index.indexOf("montarRutas(app)");
    expect(iCerrada).toBeGreaterThan(-1);
    expect(iCerrada).toBeLessThan(iJson);
    expect(iJson).toBeLessThan(iRutas);
  });
});
