// AUTH_SECRET: obligatorio (32+ caracteres) en producción; en desarrollo se deriva de DATABASE_URL con UNA advertencia.
jest.mock("../../lib/prisma", () => ({}));
const { leerAuthSecret, LARGO_MINIMO_AUTH_SECRET } = require("./usuarios.seguridad");

test("en producción sin AUTH_SECRET el backend no arranca", () => {
  expect(() => leerAuthSecret({ NODE_ENV: "production" })).toThrow(/Falta AUTH_SECRET/);
});

test("en producción con menos de 32 caracteres tampoco", () => {
  expect(LARGO_MINIMO_AUTH_SECRET).toBe(32);
  expect(() => leerAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "corta" })).toThrow(/demasiado corta/);
  expect(() => leerAuthSecret({ NODE_ENV: "production", AUTH_SECRET: "x".repeat(31) })).toThrow(/demasiado corta/);
});

test("en producción con 32 o más caracteres se usa tal cual", () => {
  const secreto = "s".repeat(32);
  expect(leerAuthSecret({ NODE_ENV: "production", AUTH_SECRET: secreto })).toBe(secreto);
});

test("en desarrollo, si falta: se deriva de DATABASE_URL y avisa una sola vez, sin imprimir el valor", () => {
  const avisos = [];
  const env = { DATABASE_URL: "mysql://u:clave-secreta@host/base" };
  const a = leerAuthSecret(env, { advertir: (m) => avisos.push(m) });
  const b = leerAuthSecret(env, { advertir: (m) => avisos.push(m) });
  expect(a).toBe(b);
  expect(avisos.length).toBeLessThanOrEqual(1);
  for (const m of avisos) expect(m).not.toContain("clave-secreta");
});

test("en desarrollo, si está definida, se usa esa", () => {
  expect(leerAuthSecret({ AUTH_SECRET: "mi-secreto-de-desarrollo" })).toBe("mi-secreto-de-desarrollo");
});
