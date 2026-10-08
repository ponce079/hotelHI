jest.mock("@prisma/client", () => ({ PrismaClient: jest.fn() }));
jest.mock("@prisma/adapter-mariadb", () => ({ PrismaMariaDb: jest.fn() }));
const originalUrl = process.env.DATABASE_URL;
const originalLimit = process.env.DATABASE_CONNECTION_LIMIT;
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env.DATABASE_URL = "mysql://prueba:prueba@127.0.0.1:3308/prueba";
  delete process.env.DATABASE_CONNECTION_LIMIT;
  delete process.env.DATABASE_IDLE_TIMEOUT_MS;
});
afterAll(() => {
  for (const [key, value] of Object.entries({ DATABASE_URL: originalUrl, DATABASE_CONNECTION_LIMIT: originalLimit })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
test.each([undefined, "1", "3"])("pool configurable (%s) con mínimo compatible con el driver incluido", (valor) => {
  if (valor) process.env.DATABASE_CONNECTION_LIMIT = valor;
  require("./prisma");
  expect(require("@prisma/adapter-mariadb").PrismaMariaDb).toHaveBeenCalledWith(
    expect.objectContaining({ connectionLimit: valor ? Number(valor) : 2, minimumIdle: 1, idleTimeout: 30 }),
    expect.any(Object),
  );
  expect(require("@prisma/client").PrismaClient).toHaveBeenCalledWith(
    expect.objectContaining({ transactionOptions: require("./constantes").OPCIONES_TRANSACCION }),
  );
});
test.each(["0", "-1", "1.5", "sin-limite", "11"])("rechaza límite de pool inválido: %s", (valor) => {
  process.env.DATABASE_CONNECTION_LIMIT = valor;
  expect(() => require("./prisma")).toThrow(/DATABASE_CONNECTION_LIMIT/);
});
test("el tiempo de inactividad del pool es configurable (DATABASE_IDLE_TIMEOUT_MS) y por defecto queda en 30 s", () => {
  process.env.DATABASE_IDLE_TIMEOUT_MS = "12000";
  require("./prisma");
  expect(require("@prisma/adapter-mariadb").PrismaMariaDb).toHaveBeenCalledWith(expect.objectContaining({ idleTimeout: 12 }), expect.any(Object));
});
test.each(["0", "500", "abc", "9999999"])("rechaza un tiempo de inactividad inválido: %s", (valor) => {
  process.env.DATABASE_IDLE_TIMEOUT_MS = valor;
  expect(() => require("./prisma")).toThrow(/DATABASE_IDLE_TIMEOUT_MS/);
});
