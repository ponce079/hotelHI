import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { MensajeModal } from "../../componentes/MensajeModal";
import { registrarEntrada, registrarSalida, registrarTransferencia } from "./movimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { listarTiposMovimiento } from "../tipos-movimiento/tiposMovimiento.api";
import { consultarStock } from "../stock/stock.api";

const ITEM_VACIO = { articuloId: "", cantidad: "" };
const VACIO = { depositoId: "", depositoDestinoId: "", tipoMovStockId: "", contraparte: "", detalle: "", items: [{ ...ITEM_VACIO }] };

const TITULOS = { E: "Registrar entrada", S: "Registrar salida", transfer: "Nueva transferencia" };
const VARIANTE_GUARDAR = { E: "ok", S: "salida", transfer: "salida" };
const LABEL_GUARDAR = { E: "Confirmar movimiento", S: "Confirmar movimiento", transfer: "Enviar transferencia" };

// Igual que en el prototipo: Entrada/Salida tienen un lado "externo"
// (proveedor, área, ajuste) que no es un depósito nuestro. Nuestro schema no
// tiene una columna para esa contraparte (MovimientoStock solo tiene
// depositoId + depositoDestinoId, este último solo para transferencias) —
// agregar una columna implicaría coordinar un db push contra la base
// compartida del equipo. Se guarda plegada dentro del campo "detalle" que
// ya existe, en vez de inventar una columna nueva sin permiso del equipo.
const ORIGENES_EXT = [
  "Proveedor — Textiles del Norte",
  "Proveedor — Distribuidora Andina",
  "Proveedor — Química Central",
  "Devolución — Pisos / Housekeeping",
  "Devolución — Restaurante y Cocina",
  "Ajuste de inventario",
];
const DESTINOS_EXT = [
  "Pisos / Housekeeping",
  "Restaurante y Cocina",
  "Mantenimiento",
  "Recepción",
  "Piscina y SPA",
  "Eventos y Salones",
  "Rotura / Pérdida",
  "Ajuste de inventario",
];

export function MovimientoFormPage({ modo, onVolver, onExito }) {
  const esTransfer = modo === "transfer";
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [mensajeExito, setMensajeExito] = useState("");
  const queryClient = useQueryClient();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: tiposMovimiento } = useQuery({ queryKey: ["tipos-movimiento"], queryFn: listarTiposMovimiento });
  const { data: stockPrincipal } = useQuery({
    queryKey: ["stock", { depositoId: form.depositoId }],
    queryFn: () => consultarStock({ depositoId: form.depositoId }),
    enabled: Boolean(form.depositoId),
  });
  const { data: stockDestino } = useQuery({
    queryKey: ["stock", { depositoId: form.depositoDestinoId }],
    queryFn: () => consultarStock({ depositoId: form.depositoDestinoId }),
    enabled: esTransfer && Boolean(form.depositoDestinoId),
  });

  const tiposFiltrados = tiposMovimiento?.filter((t) => t.activo && t.contexto === "NORMAL" && t.tipo === modo) ?? [];

  const idsHabilitadosDestino = new Set((stockDestino ?? []).map((f) => f.articuloId));
  const articulosDisponibles = esTransfer
    ? (stockPrincipal ?? []).filter((f) => idsHabilitadosDestino.has(f.articuloId))
    : stockPrincipal ?? [];

  const salida = esTransfer || modo === "S";

  const depositoOrigen = depositos?.find((d) => String(d.id) === String(form.depositoId));
  const depositoDestino = depositos?.find((d) => String(d.id) === String(form.depositoDestinoId));
  const mfOrigName = esTransfer ? depositoOrigen?.nombre ?? "—" : modo === "E" ? form.contraparte || "—" : depositoOrigen?.nombre ?? "—";
  const mfDestName = esTransfer ? depositoDestino?.nombre ?? "—" : modo === "E" ? depositoOrigen?.nombre ?? "—" : form.contraparte || "—";

  const mutacion = useMutation({
    mutationFn: () => {
      const obs = form.detalle.trim();
      const detalle = !esTransfer && form.contraparte ? form.contraparte + (obs ? ` — ${obs}` : "") : obs || undefined;
      const payload = {
        depositoId: Number(form.depositoId),
        detalle,
        items: form.items.map((item) => ({ articuloId: Number(item.articuloId), cantidad: Number(item.cantidad) })),
      };
      if (esTransfer) return registrarTransferencia({ ...payload, depositoDestinoId: Number(form.depositoDestinoId) });
      const payloadConTipo = { ...payload, tipoMovStockId: Number(form.tipoMovStockId) };
      return modo === "E" ? registrarEntrada(payloadConTipo) : registrarSalida(payloadConTipo);
    },
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      const idMov = String(resultado.id).padStart(4, "0");
      const mensaje = esTransfer
        ? `Transferencia MOV-${idMov} exitosa al depósito destino — queda pendiente hasta que el depósito destino confirme su llegada.`
        : `${modo === "E" ? "Entrada" : "Salida"} MOV-${idMov} registrada.`;
      setMensajeExito(mensaje);
    },
    onError: (error) => {
      setErrores({ general: error?.response?.data?.error ?? "No se pudo registrar el movimiento." });
    },
  });

  function actualizarItem(index, campo, valor) {
    setForm((f) => ({ ...f, items: f.items.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)) }));
  }

  function agregarItem() {
    setForm((f) => ({ ...f, items: [...f.items, { ...ITEM_VACIO }] }));
  }

  function quitarItem(index) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  function validar() {
    const nuevosErrores = {};
    if (!form.depositoId) nuevosErrores.depositoId = esTransfer ? "Elegí el depósito de origen." : "Elegí un depósito.";
    if (esTransfer) {
      if (!form.depositoDestinoId) nuevosErrores.depositoDestinoId = "Elegí el depósito destino.";
      else if (String(form.depositoDestinoId) === String(form.depositoId))
        nuevosErrores.depositoDestinoId = "El destino no puede ser igual al origen.";
    } else if (!form.contraparte) {
      nuevosErrores.contraparte = modo === "E" ? "Elegí de dónde viene." : "Elegí a dónde va.";
    }
    if (!esTransfer && !form.tipoMovStockId) nuevosErrores.tipoMovStockId = "Elegí un tipo de movimiento.";

    const idsVistos = new Set();
    const erroresItems = form.items.map((item) => {
      const errorItem = {};
      if (!item.articuloId) errorItem.articuloId = "Elegí un artículo.";
      else if (idsVistos.has(item.articuloId)) errorItem.articuloId = "Artículo repetido.";
      idsVistos.add(item.articuloId);
      if (!item.cantidad || Number(item.cantidad) <= 0) errorItem.cantidad = "Cantidad inválida.";
      return errorItem;
    });
    if (erroresItems.some((e) => Object.keys(e).length > 0)) nuevosErrores.items = erroresItems;

    return nuevosErrores;
  }

  function handleGuardar() {
    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    setErrores({});
    mutacion.mutate();
  }

  const totalUnidades = form.items.reduce((acc, i) => acc + (Number(i.cantidad) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variante="secundario" onClick={onVolver} className="mb-2 text-xs">
          ← Volver
        </Button>
        <h1 className="font-heading text-[34px] font-semibold">{TITULOS[modo]}</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">HU 10 a 16 — tipos de movimiento, entradas, salidas y transferencias</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3.5 rounded-[18.4px] bg-white px-6 py-[22px]">
            <div className="flex flex-wrap gap-3.5">
              {!esTransfer && (
                <div className="min-w-[240px] flex-1">
                  <Select
                    label="Tipo de movimiento"
                    value={form.tipoMovStockId}
                    onChange={(e) => setForm({ ...form, tipoMovStockId: e.target.value })}
                    error={errores.tipoMovStockId}
                  >
                    <option value="">Seleccionar…</option>
                    {tiposFiltrados.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.descripcion}
                      </option>
                    ))}
                  </Select>
                  {tiposFiltrados.length === 0 && (
                    <p className="mt-1.5 text-xs text-piedra">
                      No hay tipos de {modo === "S" ? "Salida" : "Entrada"} cargados. Cargalos primero en Movimientos → Tipos de movimiento.
                    </p>
                  )}
                </div>
              )}
              <div className="w-[150px]">
                <Input label="Fecha" value={new Date().toLocaleDateString("es-AR")} disabled />
              </div>
            </div>

            {esTransfer ? (
              <div className="flex flex-wrap items-start gap-3.5">
                <div className="min-w-[230px] flex-1">
                  <Select
                    label="Origen — depósito que envía"
                    value={form.depositoId}
                    onChange={(e) => setForm({ ...form, depositoId: e.target.value, items: [{ ...ITEM_VACIO }] })}
                    error={errores.depositoId}
                  >
                    <option value="">Seleccionar…</option>
                    {depositos?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1.5 text-[11px] text-tinta/50">Resta stock ahora, al enviar</div>
                </div>
                <div className="pt-[30px] text-[17px] text-laton">→</div>
                <div className="min-w-[230px] flex-1">
                  <Select
                    label="Destino — depósito que recibe"
                    value={form.depositoDestinoId}
                    onChange={(e) => setForm({ ...form, depositoDestinoId: e.target.value, items: [{ ...ITEM_VACIO }] })}
                    error={errores.depositoDestinoId}
                  >
                    <option value="">Seleccionar…</option>
                    {depositos
                      ?.filter((d) => String(d.id) !== String(form.depositoId))
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nombre}
                        </option>
                      ))}
                  </Select>
                  <div className="mt-1.5 text-[11px] text-tinta/50">Suma cuando confirme la recepción</div>
                </div>
              </div>
            ) : modo === "E" ? (
              <div className="flex flex-wrap items-start gap-3.5">
                <div className="min-w-[230px] flex-1">
                  <Select
                    label="Origen — de dónde viene"
                    value={form.contraparte}
                    onChange={(e) => setForm({ ...form, contraparte: e.target.value })}
                    error={errores.contraparte}
                  >
                    <option value="">Elegí de dónde viene…</option>
                    {ORIGENES_EXT.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1.5 text-[11px] text-tinta/50">Proveedor, área que devuelve o ajuste</div>
                </div>
                <div className="pt-[30px] text-[17px] text-laton">→</div>
                <div className="min-w-[230px] flex-1">
                  <Select
                    label="Destino — depósito que recibe"
                    value={form.depositoId}
                    onChange={(e) => setForm({ ...form, depositoId: e.target.value, items: [{ ...ITEM_VACIO }] })}
                    error={errores.depositoId}
                  >
                    <option value="">Seleccionar…</option>
                    {depositos?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1.5 text-[11px] text-tinta/50">Suma stock en este depósito</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-3.5">
                <div className="min-w-[230px] flex-1">
                  <Select
                    label="Origen — depósito que entrega"
                    value={form.depositoId}
                    onChange={(e) => setForm({ ...form, depositoId: e.target.value, items: [{ ...ITEM_VACIO }] })}
                    error={errores.depositoId}
                  >
                    <option value="">Seleccionar…</option>
                    {depositos?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1.5 text-[11px] text-tinta/50">Resta stock de este depósito</div>
                </div>
                <div className="pt-[30px] text-[17px] text-laton">→</div>
                <div className="min-w-[230px] flex-1">
                  <Select
                    label="Destino — a dónde va"
                    value={form.contraparte}
                    onChange={(e) => setForm({ ...form, contraparte: e.target.value })}
                    error={errores.contraparte}
                  >
                    <option value="">Elegí a dónde va…</option>
                    {DESTINOS_EXT.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                  <div className="mt-1.5 text-[11px] text-tinta/50">Área o sector que consume, o el motivo</div>
                </div>
              </div>
            )}

            <Input
              label="Observación (opcional)"
              value={form.detalle}
              onChange={(e) => setForm({ ...form, detalle: e.target.value })}
              placeholder="Remito, área solicitante, motivo del ajuste…"
            />

            <div>
              <span
                className={`inline-flex items-center rounded-sm px-2.5 py-0.5 font-body text-xs font-medium tracking-[0.01em] ${
                  esTransfer
                    ? "border border-pino text-pino"
                    : modo === "E"
                      ? "bg-pino-100 text-pino-700"
                      : "bg-laton-100 text-laton-700"
                }`}
              >
                {esTransfer
                  ? "Resta en origen ahora · Suma en destino al confirmar la recepción"
                  : modo === "E"
                    ? "Suma stock (tipo = E)"
                    : "Resta stock (tipo = S)"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-[18.4px] bg-white px-6 pb-1.5 pt-[18px]">
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="m-0 font-heading text-base font-semibold">Detalle del movimiento</h4>
              <Button variante="secundario" tamano="fila" onClick={agregarItem}>
                + Agregar artículo
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-borde px-2 pb-2 text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                      Artículo habilitado
                    </th>
                    <th className="w-28 border-b border-borde px-2 pb-2 text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                      Cantidad
                    </th>
                    <th className="w-20 border-b border-borde px-2 pb-2 text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                      Unidad
                    </th>
                    <th className="w-20 border-b border-borde px-2 pb-2 text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                      Actual
                    </th>
                    <th className="w-24 border-b border-borde px-2 pb-2 text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                      Resultante
                    </th>
                    <th className="w-10 border-b border-borde px-2 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => {
                    const elegidosEnOtrasFilas = form.items.filter((_, i) => i !== index).map((i) => i.articuloId).filter(Boolean);
                    const opciones = articulosDisponibles.filter((f) => !elegidosEnOtrasFilas.includes(String(f.articuloId)));
                    const filaActual = articulosDisponibles.find((f) => String(f.articuloId) === String(item.articuloId));
                    const actual = filaActual ? Number(filaActual.stockActual) : null;
                    const cantidad = Number(item.cantidad) || 0;
                    const resultante = actual != null && cantidad ? (salida ? actual - cantidad : actual + cantidad) : null;
                    const insuficiente = salida && actual != null && cantidad > actual;

                    return (
                      <tr key={index} className="border-b border-borde last:border-0">
                        <td className="px-2 py-2">
                          <Select
                            value={item.articuloId}
                            onChange={(e) => actualizarItem(index, "articuloId", e.target.value)}
                            error={errores.items?.[index]?.articuloId}
                            disabled={!form.depositoId || (esTransfer && !form.depositoDestinoId)}
                          >
                            <option value="">Elegí un artículo habilitado…</option>
                            {opciones.map((f) => (
                              <option key={f.articuloId} value={f.articuloId}>
                                {f.nombre}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.cantidad}
                            onChange={(e) => actualizarItem(index, "cantidad", e.target.value)}
                            error={errores.items?.[index]?.cantidad}
                            placeholder="0"
                          />
                        </td>
                        <td className="px-2 py-2 text-[12.5px] text-tinta/60">{filaActual?.unidadMedida ?? "—"}</td>
                        <td className="px-2 py-2 text-[13px]">{actual ?? "—"}</td>
                        <td className={`px-2 py-2 text-[13px] font-semibold ${insuficiente ? "text-error-texto" : "text-tinta/70"}`}>
                          {resultante ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {form.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => quitarItem(index)}
                              className="cursor-pointer text-piedra hover:text-error"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!form.depositoId && <p className="pb-3 text-xs text-piedra">Elegí un depósito para ver sus artículos habilitados.</p>}
            {esTransfer && form.depositoId && !form.depositoDestinoId && (
              <p className="pb-3 text-xs text-piedra">Elegí también el depósito destino.</p>
            )}
            {form.depositoId && (!esTransfer || form.depositoDestinoId) && articulosDisponibles.length === 0 && (
              <p className="pb-3 text-xs text-piedra">
                {esTransfer ? "Ningún artículo está habilitado en ambos depósitos a la vez." : "Este depósito no tiene artículos habilitados."}
              </p>
            )}
          </div>

          {errores.general && (
            <div className="rounded-[26px] bg-error-suave px-[22px] py-4">
              <div className="mb-1.5 text-[13px] font-semibold text-error-texto">No se puede confirmar el movimiento:</div>
              <p className="m-0 text-[12.5px] text-error-texto">{errores.general}</p>
            </div>
          )}

          <div className="flex justify-end gap-2.5">
            <Button variante="secundario" onClick={onVolver}>
              Cancelar
            </Button>
            <Button variante={VARIANTE_GUARDAR[modo]} disabled={mutacion.isPending} onClick={handleGuardar}>
              {mutacion.isPending ? "Guardando…" : LABEL_GUARDAR[modo]}
            </Button>
          </div>
        </div>

        <aside className="sticky top-6 flex flex-col gap-3 rounded-[18.4px] bg-white px-[22px] py-5 shadow-[0_1px_2px_rgba(46,43,37,0.14)]">
          <h4 className="m-0 font-heading text-base font-semibold">Resumen</h4>
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between gap-2.5">
              <span className="text-tinta/60">Origen</span>
              <span className="text-right font-medium">{mfOrigName}</span>
            </div>
            <div className="flex justify-between gap-2.5">
              <span className="text-tinta/60">Destino</span>
              <span className="text-right font-medium">{mfDestName}</span>
            </div>
            <div className="flex justify-between gap-2.5">
              <span className="text-tinta/60">Fecha</span>
              <span>{new Date().toLocaleDateString("es-AR")}</span>
            </div>
            <div className="flex justify-between gap-2.5">
              <span className="text-tinta/60">Unidades</span>
              <span className="font-heading text-[17px]">{totalUnidades}</span>
            </div>
          </div>
          {esTransfer ? (
            <div className="rounded-[20px] bg-pino-100 px-[15px] py-3 text-xs text-pino-oscuro">
              Al confirmar sólo se registra la <strong>salida</strong> en el origen y la transferencia queda{" "}
              <strong>en tránsito</strong>. El responsable del depósito destino la confirma en <strong>Recepciones</strong>, declarando
              cuánto llegó realmente: ahí se crea la entrada vinculada por{" "}
              <span className="font-mono">movimientoRelacionadoId</span>.
            </div>
          ) : (
            <div className="rounded-[20px] bg-neutro-100 px-[15px] py-3 text-xs text-tinta/70">
              El movimiento pertenece a <strong>un solo depósito</strong>. El alta del movimiento y la actualización del stock ocurren en
              la misma transacción atómica.
            </div>
          )}
        </aside>
      </div>
      <MensajeModal mensaje={mensajeExito} onCerrar={() => { setMensajeExito(""); onExito(); }} />
    </div>
  );
}
