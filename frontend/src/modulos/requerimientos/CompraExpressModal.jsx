import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap, X, Check } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { Input } from "../../componentes/Input";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { MoneyInput } from "../../componentes/MoneyInput";
import { obtenerRequerimiento, compraExpress } from "./requerimientos.api";
import { listarProveedoresActivos } from "../proveedores/proveedores.api";
import { rubroCubreCategoria } from "../../lib/constantes";
import { formatearMonto } from "../../lib/moneda";

// Sprint 3 — punto 9: compra express. Solo para un requerimiento COMPRA
// marcado urgente: un proveedor + sus precios en un solo paso, sin pasar
// por SolicitarPresupuestosModal / ComparacionPresupuestosPage. Mismo
// patrón de formulario que PresupuestoCargaModal (tabla de precios), con
// el selector de proveedor de SolicitarPresupuestosModal fusionado
// adelante en vez de en una pantalla aparte.
export function CompraExpressModal({ requerimientoId, onClose, onExito }) {
  const queryClient = useQueryClient();
  const [proveedorId, setProveedorId] = useState("");
  const [precios, setPrecios] = useState({});
  const [plazoEntrega, setPlazoEntrega] = useState("");
  const [costoFlete, setCostoFlete] = useState("");
  const [error, setError] = useState("");

  const { data: req, isLoading } = useQuery({
    queryKey: ["requerimiento", String(requerimientoId)],
    queryFn: () => obtenerRequerimiento(requerimientoId),
  });
  const { data: proveedores } = useQuery({
    queryKey: ["proveedores-activos"],
    queryFn: () => listarProveedoresActivos(),
  });

  const lineas = req?.detalle ?? [];

  // Mismo filtro de rubro que SolicitarPresupuestosModal — acá no se
  // ofrece "ver igual, no habilitado": es un solo proveedor real, mejor
  // no dejar elegir uno que no cubre el rubro.
  const categoriasDelPedido = useMemo(
    () => new Set(lineas.map((d) => d.articulo?.categoria).filter(Boolean)),
    [lineas]
  );
  const proveedoresHabilitados = useMemo(
    () =>
      (proveedores ?? []).filter(
        (p) =>
          categoriasDelPedido.size === 0 ||
          p.rubros.some((r) => [...categoriasDelPedido].some((c) => rubroCubreCategoria(r.rubro, c)))
      ),
    [proveedores, categoriasDelPedido]
  );

  const totales = useMemo(() => {
    const subtotal = lineas.reduce(
      (acc, d) => acc + Number(precios[d.articuloId] || 0) * Number(d.cantidadSolicitada),
      0
    );
    const flete = Number(costoFlete || 0);
    return { subtotal, flete, total: subtotal + flete };
  }, [lineas, precios, costoFlete]);

  const mutacion = useMutation({
    mutationFn: () =>
      compraExpress(requerimientoId, {
        proveedorId: Number(proveedorId),
        precios: lineas.map((d) => ({ articuloId: d.articuloId, precioUnitario: Number(precios[d.articuloId]) })),
        plazoEntrega: plazoEntrega.trim() || null,
        costoFlete: costoFlete ? Number(costoFlete) : null,
      }),
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(requerimientoId)] });
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      onExito(`Compra express adjudicada a ${guardado.proveedor?.razonSocial ?? "el proveedor"}.`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudo generar la compra express."),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!proveedorId) return setError("Elegí un proveedor.");
    const faltantes = lineas.filter((d) => !(Number(precios[d.articuloId]) > 0));
    if (faltantes.length > 0) return setError("Cargá el precio unitario de todos los artículos.");
    mutacion.mutate();
  }

  return (
    <Modal
      titulo={req ? `Compra express · REQ-${String(req.id).padStart(4, "0")}` : "Compra express"}
      subtitulo="Un proveedor, precio cargado ahora — salta pedir presupuesto a varios y comparar"
      onClose={onClose}
      ancho="max-w-3xl"
    >
      {isLoading ? (
        <p className="px-6 py-8 text-sm text-piedra">Cargando requerimiento…</p>
      ) : !req ? (
        <p className="px-6 py-8 text-sm text-error">No se pudo cargar el requerimiento.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex items-center gap-2 rounded-lg border border-laton-400 bg-laton-100 px-4 py-3 text-[13px] text-laton-700">
              <Zap size={16} /> Urgente: se adjudica directo al proveedor elegido, sin invitar a cotizar a varios.
            </div>

            {error && <p className="text-sm text-error">{error}</p>}

            <Select label="Proveedor *" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Seleccionar…</option>
              {proveedoresHabilitados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                </option>
              ))}
            </Select>
            {proveedoresHabilitados.length === 0 && (
              <p className="text-[11.5px] text-piedra">Ningún proveedor activo cubre el rubro de estos artículos.</p>
            )}

            <div>
              <h2 className="mb-3 font-heading text-[16px] font-semibold text-tinta">Precios</h2>
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
                placeholder="ej. 24 horas"
              />
              <MoneyInput label="Costo de flete (opcional)" value={costoFlete} onChange={setCostoFlete} />
              <div className="rounded-lg border border-pino bg-pino-100 p-3">
                <div className="text-[10px] uppercase tracking-wide text-pino-700">Total</div>
                <Cifra tamano={22} className="mt-0.5 block text-pino-700">
                  $ {formatearMonto(totales.total)}
                </Cifra>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" onClick={onClose} icono={X}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutacion.isPending} icono={Check}>
              {mutacion.isPending ? "Adjudicando…" : "Adjudicar y aprobar"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
