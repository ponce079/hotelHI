import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Zap } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { crearRequerimiento, actualizarRequerimiento, obtenerRequerimiento } from "./requerimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { consultarStock } from "../stock/stock.api";
import { ORIGENES_REQUERIMIENTO } from "../../lib/constantes";
import { useSesion } from "../../lib/sesion";

// El listado (RequerimientosPage) no trae el detalle completo de cada
// fila — solo un conteo, por rendimiento (ver comentario en
// requerimientos.servicio.js) — así que en modo edición este wrapper
// busca la ficha completa por id antes de montar el formulario. En modo
// alta no hace falta ningún fetch: arranca vacío o con `prefill`.
export function RequerimientoModal({ requerimientoId, prefill, onClose, onExito }) {
  const { data: requerimiento, isLoading } = useQuery({
    queryKey: ["requerimiento", String(requerimientoId)],
    queryFn: () => obtenerRequerimiento(requerimientoId),
    enabled: Boolean(requerimientoId),
  });

  if (requerimientoId && isLoading) {
    return (
      <Modal titulo="Editar requerimiento" onClose={onClose} ancho="max-w-3xl">
        <p className="px-6 py-8 text-sm text-piedra">Cargando requerimiento…</p>
      </Modal>
    );
  }
  if (requerimientoId && !requerimiento) {
    return (
      <Modal titulo="Editar requerimiento" onClose={onClose} ancho="max-w-3xl">
        <p className="px-6 py-8 text-sm text-error">No se pudo cargar el requerimiento.</p>
      </Modal>
    );
  }

  return <RequerimientoFormulario requerimiento={requerimiento ?? null} prefill={prefill} onClose={onClose} onExito={onExito} />;
}

// `prefill` llega desde Alertas (HU-8 -> HU-81): trae depósito, artículo y
// cantidad sugerida, y el alta usa el mismo endpoint de siempre con
// origen "ALERTA". `requerimiento` (ya cargado por el wrapper de arriba)
// es el modo edición — solo se puede llegar acá con uno en estado
// "Pendiente" (el backend es el que manda esa regla; ver RequerimientosPage).
function RequerimientoFormulario({ requerimiento, prefill, onClose, onExito }) {
  const { usuario } = useSesion();
  const editando = Boolean(requerimiento);
  const origen = editando
    ? requerimiento.origen
    : prefill?.origen === ORIGENES_REQUERIMIENTO.ALERTA
      ? ORIGENES_REQUERIMIENTO.ALERTA
      : ORIGENES_REQUERIMIENTO.MANUAL;

  const [depositoId, setDepositoId] = useState(() => String(editando ? requerimiento.depositoId : prefill?.depositoId ?? ""));
  const [lineas, setLineas] = useState(() => {
    if (editando) {
      return requerimiento.detalle.map((d) => ({
        articuloId: d.articuloId,
        cantidadSolicitada: String(d.cantidadSolicitada),
      }));
    }
    const articuloId = Number(prefill?.articuloId);
    const cantidad = Number(prefill?.cantidad);
    if (!Number.isInteger(articuloId) || articuloId <= 0) return [];
    return [{ articuloId, cantidadSolicitada: cantidad > 0 ? String(cantidad) : "" }];
  });
  const [articuloAAgregar, setArticuloAAgregar] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });

  // Solo se pueden pedir artículos habilitados en ese depósito (HU-4), que
  // es exactamente lo que devuelve /api/stock filtrado por depósito. De
  // paso trae el stock actual, útil como referencia al pedir cantidad.
  const { data: filasStock } = useQuery({
    queryKey: ["stock", { depositoId }],
    queryFn: () => consultarStock({ depositoId }),
    enabled: Boolean(depositoId),
  });

  const disponibles = useMemo(() => filasStock ?? [], [filasStock]);
  const yaAgregados = lineas.map((l) => l.articuloId);

  function datosDe(articuloId) {
    return disponibles.find((f) => f.articuloId === articuloId);
  }

  function agregarArticulo() {
    const id = Number(articuloAAgregar);
    if (!Number.isInteger(id) || id <= 0) return;
    if (yaAgregados.includes(id)) return;
    setLineas((prev) => [...prev, { articuloId: id, cantidadSolicitada: "" }]);
    setArticuloAAgregar("");
  }

  function cambiarCantidad(articuloId, valor) {
    setLineas((prev) =>
      prev.map((l) => (l.articuloId === articuloId ? { ...l, cantidadSolicitada: valor } : l))
    );
  }

  function quitarLinea(articuloId) {
    setLineas((prev) => prev.filter((l) => l.articuloId !== articuloId));
  }

  const mutacion = useMutation({
    mutationFn: () => {
      const detalle = lineas.map((l) => ({
        articuloId: l.articuloId,
        cantidadSolicitada: Number(l.cantidadSolicitada),
      }));
      return editando
        ? actualizarRequerimiento(requerimiento.id, { depositoId: Number(depositoId), detalle })
        : crearRequerimiento({ depositoId: Number(depositoId), origen, solicitante: usuario, detalle });
    },
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(guardado.id)] });
      onExito(
        editando
          ? `Requerimiento REQ-${String(guardado.id).padStart(4, "0")} actualizado.`
          : `Requerimiento REQ-${String(guardado.id).padStart(4, "0")} creado.`
      );
    },
    onError: (err) =>
      setError(err?.response?.data?.error ?? `No se pudo ${editando ? "actualizar" : "crear"} el requerimiento.`),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!depositoId) return setError("Elegí el depósito que necesita la reposición.");
    if (lineas.length === 0) return setError("Agregá al menos un artículo al requerimiento.");
    const sinCantidad = lineas.find((l) => !(Number(l.cantidadSolicitada) > 0));
    if (sinCantidad) {
      return setError("Todas las líneas necesitan una cantidad mayor a 0.");
    }
    mutacion.mutate();
  }

  return (
    <Modal titulo={editando ? "Editar requerimiento" : "Nuevo requerimiento"} onClose={onClose} ancho="max-w-3xl">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="-mt-1 font-mono text-[11px] text-tinta/55">
            {editando ? `REQ-${String(requerimiento.id).padStart(4, "0")}` : "HU-81 — pedido de reposición por depósito"}
          </p>

          {origen === ORIGENES_REQUERIMIENTO.ALERTA && (
            <div className="flex items-center gap-2 rounded-lg border border-laton-400 bg-laton-100 px-4 py-3 text-[13px] text-laton-700">
              <Zap size={16} /> Este requerimiento se está generando desde una alerta de stock mínimo. Podés ajustar la
              cantidad y sumar más artículos antes de guardarlo.
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Depósito que pide *"
              value={depositoId}
              onChange={(e) => {
                setDepositoId(e.target.value);
                setLineas([]);
              }}
            >
              <option value="">Seleccionar…</option>
              {(depositos ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </Select>
            <Input
              label="Solicitante"
              value={(editando ? requerimiento.solicitante : usuario) ?? ""}
              disabled
              className="bg-hueso text-tinta/55"
            />
          </div>
          {depositoId && (
            <p className="text-[11.5px] text-piedra">Solo se pueden pedir artículos habilitados en este depósito.</p>
          )}

          <div>
            <h2 className="font-heading text-[16px] font-semibold text-tinta">Artículos a reponer</h2>

            <div className="mt-3 flex flex-wrap items-end gap-2.5">
              <div className="min-w-[280px] flex-1">
                <Select
                  label="Agregar artículo"
                  value={articuloAAgregar}
                  onChange={(e) => setArticuloAAgregar(e.target.value)}
                  disabled={!depositoId}
                >
                  <option value="">{depositoId ? "Buscar artículo…" : "Elegí primero un depósito"}</option>
                  {disponibles
                    .filter((f) => !yaAgregados.includes(f.articuloId))
                    .map((f) => (
                      <option key={f.articuloDepositoId} value={f.articuloId}>
                        {f.nombre} — stock {f.stockActual} {f.unidadMedida}
                      </option>
                    ))}
                </Select>
              </div>
              <Button type="button" variante="secundario" onClick={agregarArticulo} disabled={!articuloAAgregar}>
                Agregar
              </Button>
            </div>

            <div className="mt-4">
              <Table
                columnas={["Artículo", "Stock actual", "Mínimo", "Cantidad a pedir", ""]}
                columnasDerecha={["Stock actual", "Mínimo", "Cantidad a pedir"]}
                filas={lineas}
                vacio="Todavía no agregaste artículos."
                renderFila={(l) => {
                  const info = datosDe(l.articuloId);
                  return (
                    <tr key={l.articuloId} className="border-b border-borde last:border-0">
                      <td className="px-3 py-2 font-body text-[13px] font-semibold">
                        {info?.nombre ?? `Artículo #${l.articuloId}`}
                        {info && <span className="ml-1 text-[11px] font-normal text-piedra">({info.unidadMedida})</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-body text-[12.5px]">{info?.stockActual ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-body text-[12.5px] text-piedra">
                        {info?.stockMinimo ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={l.cantidadSolicitada}
                          onChange={(e) => cambiarCantidad(l.articuloId, e.target.value)}
                          className="w-28 rounded-md border border-borde bg-white px-2 py-1 text-right text-[13px] focus:outline-none focus:ring-2 focus:ring-pino/40"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => quitarLinea(l.articuloId)}
                          className="cursor-pointer rounded-md p-1 text-piedra hover:text-error"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? "Guardando…" : editando ? "Guardar cambios" : "Crear requerimiento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
