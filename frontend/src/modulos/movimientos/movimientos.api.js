import { api } from "../../lib/api";

export async function registrarEntrada(payload) {
  const { data } = await api.post("/movimientos-stock/entrada", payload);
  return data;
}

export async function registrarSalida(payload) {
  const { data } = await api.post("/movimientos-salida/salida", payload);
  return data;
}
