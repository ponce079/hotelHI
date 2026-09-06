import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { MoneyInput } from "../../componentes/MoneyInput";
import { obtenerPresupuesto, cargarPresupuesto } from "./presupuestos.api";
import { ESTADOS_PRESUPUESTO } from "../../lib/constantes";
import { formatearMonto } from "../../lib/moneda";

// HU-83 — cargar lo que cotizó un proveedor. Mismo formato de modal que
// ArticuloModal/ProveedorModal/RequerimientoModal (Modal compartido, ancho
// mayor porque lleva una tabla, igual que el wizard de orden de pago).
export function PresupuestoCargaModal({ presupuestoId, onClose, onExito }) {
  const queryClient = useQueryClient();
  // Las pantallas de detalle (PresupuestoDetallePage, RequerimientoDetallePage)
  // cachean con el id como string (viene de useParams). Este modal recibe
  // presupuestoId a veces como number (p.ej. p.id de una fila) — sin
  // normalizar acá, invalidateQueries no encuentra esa entrada (la
  // comparación de queryKey es por igualdad estructural, "26" !== 26) y la
  // pantalla de atrás queda con los datos viejos aunque el guardado sí funcionó.
  const idKey = String(presupuestoId);

  const [precios, setPrecios] = useState({});
  const [plazoEntrega, setPlazoEntrega] = useState("");
  const [costoFlete, setCostoFlete] = useState("");
  const [error, setError] = useState("");

  const { data: presupuesto, isLoading } = useQuery({
    queryKey: ["presupuesto", idKey],
    queryFn: () => obtenerPresupuesto(presupuestoId),
  });

  // Memoizado para que no sea un array nuevo en cada render: si no, el
  // useMemo del total se recalcularía siempre y el lint lo marca.
  const lineas = useMemo(() => presupuesto?.requerimiento?.detalle ?? [], [presupuesto]);
  const requiereFlete = presupuesto?.requerimiento?.requiereFlete;

  // Total en vivo: Σ (precio × cantidad) + flete. El backend recalcula lo
  // mismo al guardar y su número es el que vale — este es solo la vista
  // previa mientras se tipea.
  const totales = useMemo(() => {
    const subtotal = lineas.reduce(
      (acc, d) => acc + Number(precios[d.articuloId] || 0) * Number(d.cantidadSolicitada),
      0
    );
    const flete = requiereFlete ? Number(costoFlete || 0) : 0;
    return { subtotal, flete, total: subtotal + flete };
  }, [lineas, precios, costoFlete, requiereFlete]);

  const mutacion = useMutation({
    mutationFn: () =>
      cargarPresupuesto(presupuestoId, {
        precios: lineas.map((d) => ({
          articuloId: d.articuloId,
          precioUnitario: Number(precios[d.articuloId]),
        })),
        plazoEntrega,
        costoFlete: requiereFlete ? Number(costoFlete || 0) : null,
      }),
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["presupuesto", idKey] });
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(guardado.requerimientoId)] });
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      onExito(`Presupuesto de ${guardado.proveedor?.razonSocial ?? "el proveedor"} cargado.`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudo cargar el presupuesto."),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const faltantes = lineas.filter((d) => !(Number(precios[d.articuloId]) > 0));
    if (faltantes.length > 0) return setError("Cargá el precio unitario de todos los artículos.");
    mutacion.mutate();
  }

  const yaCargado = presupuesto && presupuesto.estado !== ESTADOS_PRESUPUESTO.SOLICITADO;

  return (
    <Modal titulo="Cargar presupuesto" onClose={onClose} ancho="max-w-3xl">
      {isLoading ? (
        <p className="px-6 py-8 text-sm text-piedra">Cargando presupuesto…</p>
      ) : !presupuesto ? (
        <p className="px-6 py-8 text-sm text-error">No se pudo cargar el presupuesto.</p>
      ) : yaCargado ? (
        <div className="px-6 py-8">
          <p className="text-sm">
            Este presupuesto ya está en estado <strong>{presupuesto.estado}</strong>: la carga de precios se hace una
            sola vez, mientras está en "{ESTADOS_PRESUPUESTO.SOLICITADO}".
          </p>
          <div className="mt-5 flex justify-end">
            <Button variante="secundario" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <p className="-mt-1 font-mono text-[11px] text-tinta/55">
              HU-83 · {presupuesto.proveedor?.razonSocial} — REQ-{String(presupuesto.requerimientoId).padStart(4, "0")}
            </p>

            {error && <p className="text-sm text-error">{error}</p>}

            <div>
              <h2 className="mb-3 font-heading text-[16px] font-semibold text-tinta">Precios cotizados</h2>
              <Table
                columnas={["Artículo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"]}
                columnasDerecha={["Cantidad", "Precio unitario", "Subtotal"]}
                filas={lineas}
                renderFila={(d) => {
                  const precio = Number(precios[d.articuloId] || 0);
                  const subtotal = precio * Number(d.cantidadSolicitada);
                  return (
                    <tr key={d.id} className="border-b border-borde last:border-0">
                      <td className="px-3 py-2 font-body text-[13px] font-semibold">{d.articulo?.nombre}</td>
                      <td className="px-3 py-2 font-body text-[12.5px]">{d.articulo?.unidadMedida}</td>
                      <td className="px-3 py-2 text-right font-body text-[13px]">{Number(d.cantidadSolicitada)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end">
                          <div className="w-36">
                            <MoneyInput
                              value={precios[d.articuloId] ?? ""}
                              onChange={(v) => setPrecios((prev) => ({ ...prev, [d.articuloId]: v }))}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-heading text-[14px]">
                        {subtotal > 0 ? `$ ${formatearMonto(subtotal)}` : <span className="text-piedra">—</span>}
                      </td>
                    </tr>
                  );
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Plazo de entrega"
                value={plazoEntrega}
                onChange={(e) => setPlazoEntrega(e.target.value)}
                placeholder="ej. 5 días hábiles"
              />

              {requiereFlete ? (
                <MoneyInput label="Costo de flete" value={costoFlete} onChange={setCostoFlete} />
              ) : (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-tinta/55">Costo de flete</div>
                  <p className="mt-1.5 text-[12.5px] text-piedra">Este requerimiento no pidió flete.</p>
                </div>
              )}

              <div className="rounded-lg border border-pino bg-pino-100 p-3">
                <div className="text-[10px] uppercase tracking-wide text-pino-700">Total</div>
                <Cifra tamano={22} className="mt-0.5 block text-pino-700">$ {formatearMonto(totales.total)}</Cifra>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : "Guardar presupuesto"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
