import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../componentes/Modal";
import { Select } from "../../componentes/Select";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Paperclip, Trash2, X, Save } from "lucide-react";
import {
  obtenerPresupuesto,
  cargarPresupuesto,
  subirAdjuntoPresupuesto,
  eliminarAdjuntoPresupuesto,
  urlAdjuntoPresupuesto,
} from "./presupuestos.api";
import { ESTADOS_PRESUPUESTO, UNIDADES_PLAZO_ENTREGA } from "../../lib/constantes";
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
  // Punto 7: antes era un input de texto libre ("5 días hábiles" tipeado a
  // mano) — imposible de ordenar/comparar objetivamente entre proveedores.
  // Ahora es cantidad + unidad fija; se arma como texto recién al guardar
  // (Presupuesto.plazoEntrega sigue siendo String, no se tocó el modelo).
  const [plazoEntregaDias, setPlazoEntregaDias] = useState("");
  const [plazoEntregaUnidad, setPlazoEntregaUnidad] = useState("HABILES");
  const [costoFlete, setCostoFlete] = useState("");
  const [fechaLimiteVigencia, setFechaLimiteVigencia] = useState("");
  const [error, setError] = useState("");
  // Punto 5 del rediseño: la validación de "precio > 0" ya existía (ver
  // handleSubmit), pero solo se veía como un mensaje genérico arriba — no
  // marcaba CUÁL línea faltaba. Se activa recién al primer intento de
  // guardar, no desde que se abre el modal (nadie completó nada todavía).
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [errorArchivo, setErrorArchivo] = useState("");

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
        // "5 días hábiles" — arranca siempre con el número para que la
        // comparación lo pueda parsear (ver parsearDiasPlazo). Vacío queda
        // null, igual que antes: el plazo es opcional.
        plazoEntrega:
          Number(plazoEntregaDias) > 0
            ? `${Number(plazoEntregaDias)} ${UNIDADES_PLAZO_ENTREGA[plazoEntregaUnidad]}`
            : null,
        costoFlete: requiereFlete ? Number(costoFlete || 0) : null,
        fechaLimiteVigencia: fechaLimiteVigencia || null,
      }),
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["presupuesto", idKey] });
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(guardado.requerimientoId)] });
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      onExito(`Presupuesto de ${guardado.proveedor?.razonSocial ?? "el proveedor"} cargado.`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudo cargar el presupuesto."),
  });

  // Punto 9 — el adjunto es independiente de la carga de precios: sube
  // apenas se elige el archivo (no espera a "Guardar presupuesto"), y no
  // exige ningún estado puntual del presupuesto — es documentación de
  // referencia, se puede agregar o reemplazar en cualquier momento.
  const mutacionSubirArchivo = useMutation({
    mutationFn: (archivo) => subirAdjuntoPresupuesto(presupuestoId, archivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presupuesto", idKey] });
      setErrorArchivo("");
    },
    onError: (err) => setErrorArchivo(err?.response?.data?.error ?? "No se pudo subir el archivo."),
  });

  const mutacionQuitarArchivo = useMutation({
    mutationFn: () => eliminarAdjuntoPresupuesto(presupuestoId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["presupuesto", idKey] }),
  });

  function elegirArchivo(e) {
    const archivo = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo si hace falta reintentar
    if (!archivo) return;
    setErrorArchivo("");
    mutacionSubirArchivo.mutate(archivo);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIntentoGuardar(true);
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
            <Button variante="secundario" onClick={onClose} icono={X}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <p className="-mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-tinta/55">
              <NombreClave className="text-tinta">{presupuesto.proveedor?.razonSocial}</NombreClave> —{" "}
              <CodigoClave className="text-tinta">REQ-{String(presupuesto.requerimientoId).padStart(4, "0")}</CodigoClave>
            </p>

            {error && <p className="text-sm text-error">{error}</p>}

            <div>
              <h2 className="mb-3 font-heading text-[16px] font-semibold text-tinta">Precios cotizados</h2>
              {/* Punto 8: con 4-5+ artículos, la tabla sin tope de alto
                  empujaba "Cancelar"/"Guardar presupuesto" fuera de
                  pantalla en viewports bajos, sin ninguna pista de que
                  hacía falta scrollear la página entera para llegar a
                  ellos. Acá adentro scrollea sola; el modal (header,
                  plazo/flete/total, botones) queda siempre a la vista. */}
              <div className="max-h-[320px] overflow-y-auto">
                <Table
                  columnas={["Artículo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"]}
                  columnasDerecha={["Cantidad", "Precio unitario", "Subtotal"]}
                  filas={lineas}
                  renderFila={(d) => {
                    const precio = Number(precios[d.articuloId] || 0);
                    const subtotal = precio * Number(d.cantidadSolicitada);
                    // Punto 5: solo se marca en rojo después de un intento
                    // de guardar fallido — no antes, para no recibir a la
                    // persona con todo el formulario en rojo apenas abre
                    // el modal.
                    const sinPrecio = intentoGuardar && !(precio > 0);
                    return (
                      <tr key={d.id} className="border-b border-borde last:border-0">
                        <td className="px-3 py-2">
                          <NombreClave title={d.articulo?.nombre}>{d.articulo?.nombre}</NombreClave>
                        </td>
                        <td className="px-3 py-2 font-body text-[12.5px]">{d.articulo?.unidadMedida}</td>
                        <td className="px-3 py-2 text-right font-body text-[13px]">{Number(d.cantidadSolicitada)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <div className="w-36">
                              <MoneyInput
                                value={precios[d.articuloId] ?? ""}
                                onChange={(v) => setPrecios((prev) => ({ ...prev, [d.articuloId]: v }))}
                                error={sinPrecio ? "Requerido" : undefined}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-heading text-[14px]">
                          $ {formatearMonto(subtotal)}
                        </td>
                      </tr>
                    );
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5 font-body text-sm">
                <span className="text-[12px] text-tinta/70">Plazo de entrega</span>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={plazoEntregaDias}
                    onChange={(e) => setPlazoEntregaDias(e.target.value)}
                    placeholder="5"
                    className="w-16 rounded-md border border-borde bg-white px-2.5 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
                  />
                  <Select
                    value={plazoEntregaUnidad}
                    onChange={(e) => setPlazoEntregaUnidad(e.target.value)}
                    className="flex-1"
                  >
                    {Object.entries(UNIDADES_PLAZO_ENTREGA).map(([clave, label]) => (
                      <option key={clave} value={clave}>{label}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {requiereFlete ? (
                <MoneyInput label="Costo de flete" value={costoFlete} onChange={setCostoFlete} />
              ) : (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-tinta/55">Costo de flete</div>
                  <p className="mt-1.5 text-[12.5px] text-piedra">Este requerimiento no pidió flete.</p>
                </div>
              )}

              <Input
                type="date"
                label="Oferta válida hasta"
                min={new Date().toISOString().slice(0, 10)}
                value={fechaLimiteVigencia}
                onChange={(e) => setFechaLimiteVigencia(e.target.value)}
              />

              <div className="rounded-lg border border-pino bg-pino-100 p-3">
                <div className="text-[10px] uppercase tracking-wide text-pino-700">Total</div>
                <Cifra tamano={22} className="mt-0.5 block text-pino-700">$ {formatearMonto(totales.total)}</Cifra>
              </div>
            </div>

            {/* Punto 9: respaldo documental opcional, de cara a la
                aprobación del gerente — no ata el envío del formulario, se
                sube apenas se elige el archivo. */}
            <div className="rounded-lg bg-hueso px-4 py-3.5">
              <div className="font-body text-[13.5px] font-semibold text-tinta">
                Adjuntar presupuesto del proveedor <span className="font-normal text-piedra">(opcional)</span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-piedra">
                Respaldo documental para la aprobación del gerente — PDF, JPG o PNG, hasta 5MB.
              </p>

              {presupuesto.archivoNombre ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <a
                    href={urlAdjuntoPresupuesto(presupuestoId)}
                    target="_blank"
                    rel="noreferrer"
                    title={presupuesto.archivoNombre}
                    className="inline-flex min-w-0 max-w-[220px] items-center gap-1.5 text-[12.5px] font-semibold text-pino hover:underline"
                  >
                    <Paperclip size={14} className="flex-none" />
                    <span className="truncate">{presupuesto.archivoNombre}</span>
                  </a>
                  <label className="cursor-pointer text-[12px] text-piedra underline hover:text-tinta">
                    {mutacionSubirArchivo.isPending ? "Subiendo…" : "Reemplazar"}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="hidden"
                      disabled={mutacionSubirArchivo.isPending}
                      onChange={elegirArchivo}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={mutacionQuitarArchivo.isPending}
                    onClick={() => mutacionQuitarArchivo.mutate()}
                    className="inline-flex cursor-pointer items-center gap-1 text-[12px] text-piedra hover:text-error disabled:cursor-not-allowed"
                  >
                    <Trash2 size={13} /> Quitar
                  </button>
                </div>
              ) : (
                <label className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-borde bg-white px-3 py-1.5 text-[12.5px] font-medium text-tinta hover:bg-hueso">
                  <Paperclip size={14} />
                  {mutacionSubirArchivo.isPending ? "Subiendo…" : "Elegir archivo"}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="hidden"
                    disabled={mutacionSubirArchivo.isPending}
                    onChange={elegirArchivo}
                  />
                </label>
              )}
              {errorArchivo && <p className="mt-1.5 text-[11.5px] text-error">{errorArchivo}</p>}
            </div>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" onClick={onClose} icono={X}>Cancelar</Button>
            <Button type="submit" cargando={mutacion.isPending} icono={Save}>
              Guardar presupuesto
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
