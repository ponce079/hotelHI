const { cargarEntornoDePruebas } = require("./_entornoPruebas");

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

test("las pruebas de integración se niegan a correr contra una base remota", () => {
  process.env.ESTADIA_TEST_DATABASE_URL = "mysql://u:p@bpgf.mysql.example.com:3306/hotel";
  expect(() => cargarEntornoDePruebas()).toThrow(/solo admite una base local/);
});

test("aceptan cualquier base local, sin leer backend/.env", () => {
  process.env.ESTADIA_TEST_DATABASE_URL = "mysql://u:p@localhost:3306/otra_base";
  process.env.DATABASE_URL = "mysql://u:p@remoto.example.com:3306/compartida";
  cargarEntornoDePruebas();
  expect(process.env.DATABASE_URL).toBe("mysql://u:p@localhost:3306/otra_base");
  expect(process.env.SMTP_HOST).toBe("");
});
