const { esEsperaConexion, responderEsperaConexion } = require("./erroresConexion");
test("reconoce espera del pool y de inicio de transacción", () => {
  expect(
    esEsperaConexion({
      code: "P2039",
      meta: { driverAdapterError: new Error("pool timeout: failed to retrieve a connection from pool after 30001ms") },
    }),
  ).toBe(true);
  const error = { code: "P2028", message: "Transaction API error: Unable to start a transaction in the given time." };
  const res = { set: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
  expect(responderEsperaConexion(res, error)).toBe(true);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.set).toHaveBeenCalledWith("Retry-After", "3");
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codigo: "BASE_OCUPADA" }));
});
test("no ofrece reintento de conexión para transacciones expiradas u otros errores del driver", () => {
  for (const error of [
    { code: "P2028", message: "A query cannot be executed on an expired transaction." },
    { code: "P2039", message: "Other driver error" },
    { code: "P2002" },
    null,
  ])
    expect(esEsperaConexion(error)).toBe(false);
});
