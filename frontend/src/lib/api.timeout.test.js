import { describe, expect, it } from "vitest";
import { api } from "./api";
import { CODIGO_DEMORA, MENSAJE_DEMORA, TIMEOUT_DEFECTO_MS, TIMEOUT_OPERACION_MS } from "./tiempos";

// Un adaptador que se comporta como un pedido que vence la espera.
const adaptadorQueVence = (config) =>
  Promise.reject(Object.assign(new Error(`timeout of ${config.timeout}ms exceeded`), { code: "ECONNABORTED", config, isAxiosError: true }));

describe("cliente api: timeout", () => {
  it("por defecto espera 45 s y las operaciones largas pueden pedir 60 s", async () => {
    expect(TIMEOUT_DEFECTO_MS).toBe(45000);
    expect(TIMEOUT_OPERACION_MS).toBe(60000);
    expect(api.defaults.timeout).toBe(45000);
    let usado;
    await api.get("/x", { timeout: TIMEOUT_OPERACION_MS, adapter: (c) => ((usado = c.timeout), Promise.resolve({ data: {}, status: 200, statusText: "OK", headers: {}, config: c })) });
    expect(usado).toBe(60000);
  });

  it("al vencer, el error trae el aviso para revisar Llegadas o la reserva antes de reintentar", async () => {
    const error = await api.post("/check-in/walk-in", {}, { adapter: adaptadorQueVence, timeout: 5 }).catch((e) => e);
    expect(error.response).toEqual({ status: 0, data: { codigo: CODIGO_DEMORA, error: MENSAJE_DEMORA } });
    expect(MENSAJE_DEMORA).toMatch(/Revisá en Llegadas o en la reserva si la operación quedó registrada antes de reintentar/);
  });

  it("el sitio público (/web) conserva su manejo propio: el error no se transforma", async () => {
    const error = await api.post("/web/reservas", {}, { adapter: adaptadorQueVence, timeout: 5 }).catch((e) => e);
    expect(error.response).toBeUndefined();
  });
});
