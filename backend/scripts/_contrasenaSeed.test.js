const { exigirContrasena, MINIMO } = require("./_contrasenaSeed");

test("sin la variable: se niega con un mensaje claro que nombra la variable", () => {
  expect(() => exigirContrasena("SEED_USUARIOS_PASSWORD", {})).toThrow(/Falta la variable SEED_USUARIOS_PASSWORD/);
  expect(() => exigirContrasena("SEED_USUARIOS_PASSWORD", { SEED_USUARIOS_PASSWORD: "" })).toThrow(/sin contraseña por defecto|no tiene contraseña por defecto/);
});

test("demasiado corta: se niega, dice cuántos caracteres tiene y NO muestra el valor", () => {
  const env = { ADMIN_PASSWORD_INICIAL: "corta123" };
  expect(() => exigirContrasena("ADMIN_PASSWORD_INICIAL", env)).toThrow(/demasiado corta \(8 caracteres\)/);
  try {
    exigirContrasena("ADMIN_PASSWORD_INICIAL", env);
  } catch (error) {
    expect(error.message).not.toContain("corta123");
  }
});

test("con 10 o más caracteres la devuelve tal cual", () => {
  expect(MINIMO).toBe(10);
  expect(exigirContrasena("X", { X: "0123456789" })).toBe("0123456789");
});
