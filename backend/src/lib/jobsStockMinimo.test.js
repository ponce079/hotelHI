// Tareas automáticas: variable TAREAS_AUTOMATICAS, nunca dos corridas superpuestas y ninguna promesa sin catch.
jest.mock("../modulos/requerimientos/requerimientos.servicio", () => ({
  barrerStockMinimoCentral: jest.fn(),
  barrerTransferenciasPendientes: jest.fn(),
}));

let jobs;
let servicio;
beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
  servicio = require("../modulos/requerimientos/requerimientos.servicio");
  servicio.barrerStockMinimoCentral.mockResolvedValue({ revisados: 3, conError: 0 });
  servicio.barrerTransferenciasPendientes.mockResolvedValue({ revisadas: 1 });
  jobs = require("./jobsStockMinimo");
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test("TAREAS_AUTOMATICAS=off las desactiva; vacío o cualquier otro valor las deja activas", () => {
  expect(jobs.tareasActivas({ TAREAS_AUTOMATICAS: "off" })).toBe(false);
  expect(jobs.tareasActivas({ TAREAS_AUTOMATICAS: " OFF " })).toBe(false);
  expect(jobs.tareasActivas({})).toBe(true);
  expect(jobs.tareasActivas({ TAREAS_AUTOMATICAS: "" })).toBe(true);
  expect(jobs.tareasActivas({ TAREAS_AUTOMATICAS: "on" })).toBe(true);
});

test("con TAREAS_AUTOMATICAS=off no se programa nada", () => {
  expect(jobs.iniciarBarridoStockMinimoCentral({ TAREAS_AUTOMATICAS: "off" })).toBe(false);
  jest.advanceTimersByTime(24 * 3600 * 1000);
  expect(servicio.barrerStockMinimoCentral).not.toHaveBeenCalled();
});

test("activas: un solo intervalo por proceso y el primer barrido espera al intervalo (no compite al arrancar)", async () => {
  expect(jobs.iniciarBarridoStockMinimoCentral({})).toBe(true);
  expect(jobs.iniciarBarridoStockMinimoCentral({})).toBe(false);
  expect(servicio.barrerStockMinimoCentral).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(6 * 3600 * 1000);
  expect(servicio.barrerStockMinimoCentral).toHaveBeenCalledTimes(1);
  expect(servicio.barrerTransferenciasPendientes).toHaveBeenCalledTimes(1);
});

test("nunca dos ejecuciones superpuestas del mismo job: si la anterior no terminó, se saltea", async () => {
  let terminar;
  servicio.barrerStockMinimoCentral.mockImplementation(() => new Promise((resolver) => (terminar = () => resolver({ revisados: 0, conError: 0 }))));
  const primera = jobs.correr();
  const segunda = await jobs.correr();
  expect(segunda).toBe(false);
  expect(servicio.barrerStockMinimoCentral).toHaveBeenCalledTimes(1);
  terminar();
  await expect(primera).resolves.toBe(true);
  // terminada la primera, otra corrida vuelve a poder correr
  servicio.barrerStockMinimoCentral.mockResolvedValue({ revisados: 0, conError: 0 });
  await expect(jobs.correr()).resolves.toBe(true);
});

test("un barrido que falla (por ejemplo ECONNABORTED) queda en el log y no deja promesas sin catch ni corta al otro barrido", async () => {
  servicio.barrerStockMinimoCentral.mockRejectedValue(Object.assign(new Error("read ECONNABORTED"), { code: "ECONNABORTED" }));
  await expect(jobs.correr()).resolves.toBe(true);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining("falló el barrido de stock mínimo central"), "read ECONNABORTED");
  expect(servicio.barrerTransferenciasPendientes).toHaveBeenCalledTimes(1);
  // y la próxima corrida no queda bloqueada
  servicio.barrerStockMinimoCentral.mockResolvedValue({ revisados: 0, conError: 0 });
  await expect(jobs.correr()).resolves.toBe(true);
});
