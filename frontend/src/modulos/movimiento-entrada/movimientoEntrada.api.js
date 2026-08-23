import { api } from "../../lib/api";

export async function registrarEntrada(payload) {
  const { data } = await api.post("/movimientos-stock/entrada", payload);
  return data;
}

// No hay un api.js propio de "tipos-movimiento" confirmado del lado de Tomi
// todavía, así que este módulo pega directo al endpoint y filtra los de
// tipo "E" (Entrada) en el cliente. Si Tomi ya tiene su propio
// tiposMovimiento.api.js con el mismo shape, se puede reemplazar esto por
// esa función en vez de duplicar la llamada.
export async function listarTiposMovimientoEntrada() {
  const { data } = await api.get("/tipos-movimiento");
  const lista = Array.isArray(data) ? data : (data.items ?? []);
  return lista.filter((t) => t.tipo === "E" && t.activo);
}

export async function listarArticulosParaSelect() {
  const { data } = await api.get("/articulos", { params: { page: 1, pageSize: 200 } });
  // El endpoint de Gimena devuelve { items, total } (paginado). Si en algún
  // momento cambia a un array plano, esto lo sigue soportando igual.
  return Array.isArray(data) ? data : (data.items ?? []);
}