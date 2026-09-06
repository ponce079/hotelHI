import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { useVolver } from "../../lib/useVolver";
import { formatearMonto } from "../../lib/moneda";
import { obtenerOrdenPago, anularOrdenPago, actualizarEstadoCheque } from "./pagos.api";
import { BADGE_ESTADO, BADGE_ESTADO_CHEQUE } from "./pagos.constantes";

// HU-79 (anular) + HU-86 (estado de cheque), ahora en pantalla completa
// en vez de modal — pensada para poder imprimirse/exportarse a PDF
// (window.print(), con los bloques "print:hidden" ocultos en esa vista).
// Misma logica que el backend: una orden vigente es !anulado && estado
// !== "Rechazada" — acá solo se decide qué botones mostrar en base a
// eso, el backend vuelve a validar todo antes de aplicar el cambio.
export function OrdenPagoDetallePage() {
  const { id } = useParams();
  const ordenId = Number(id);
  const volver = useVolver("/pagos");
  const { puede, usuario } = useSesion();
  const tienePermiso = puede("registrarPago");
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  // HU-79: confirmación extra obligatoria cuando la orden incluye un cheque.
  const [confirmarCheque, setConfirmarCheque] = useState(false);
  const [errorCheque, setErrorCheque] = useState("");
  // HU-86: id del medio Cheque para el que se está pidiendo la fecha de
  // cobro (null = ningún formulario de cobro abierto).
  const [cobrandoMedioId, setCobrandoMedioId] = useState(null);
  const [fechaCobro, setFechaCobro] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: orden, isLoading, isError } = useQuery({
    queryKey: ["pagos", "orden", ordenId],
    queryFn: () => obtenerOrdenPago(ordenId),
    enabled: tienePermiso && Number.isInteger(ordenId),
  });

  // Anular/rechazar liberan saldo de comprobantes y (si aplica) un N°
  // de cheque para reusarse — invalida tambien lo que usa el wizard de
  // HU-76/77 para armar el paso 1, no solo el listado de HU-78.
  function invalidarListados() {
    queryClient.invalidateQueries({ queryKey: ["pagos", "listado"] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "proveedores-filtro"] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "orden", ordenId] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "proveedores-con-saldo"] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "comprobantes-pendientes"] });
  }

  const mutacionAnular = useMutation({
    mutationFn: () => anularOrdenPago(ordenId, motivo, confirmarCheque),
    onSuccess: () => {
      invalidarListados();
      setAnulando(false);
      setConfirmarCheque(false);
      mostrarToast(`Orden ${orden.numero} anulada.`);
    },
    onError: (error) => setErrorMotivo(error?.response?.data?.error ?? "No se pudo anular la orden."),
  });

  const mutacionCheque = useMutation({
    mutationFn: ({ medioId, estado, fechaCobro: fecha }) => actualizarEstadoCheque(ordenId, medioId, estado, fecha),
    onSuccess: (_data, { estado }) => {
      invalidarListados();
      setErrorCheque("");
      setCobrandoMedioId(null);
      mostrarToast(`Cheque marcado como ${estado.toLowerCase()}.`);
    },
    // Un error acá NO es un toast de éxito: se muestra junto a los
    // botones de acción del cheque.
    onError: (error) => setErrorCheque(error?.response?.data?.error ?? "No se pudo actualizar el estado del cheque."),
  });

  function confirmarAnular() {
    if (!motivo.trim()) {
      setErrorMotivo("El motivo de anulación es obligatorio.");
      return;
    }
    if (tieneCheque && !confirmarCheque) {
      setErrorMotivo("Esta orden incluye un cheque — tildá la confirmación antes de anular.");
      return;
    }
    mutacionAnular.mutate();
  }

  if (!tienePermiso) return <SinPermiso />;

  const vigente = Boolean(orden) && !orden.anulado && orden.estado !== "Rechazada";
  const tieneCheque = Boolean(orden?.medios?.some((m) => m.medioPago === "Cheque"));
  const chequesEmitidos = orden ? orden.medios.filter((m) => m.medioPago === "Cheque" && m.estadoCheque === "Emitido") : [];
  const totalPagado = orden ? orden.medios.reduce((acc, m) => acc + Number(m.importe), 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variante="secundario" onClick={volver} className="text-xs">
          ← Volver
        </Button>
        {orden && (
          <Button variante="secundario" onClick={() => window.print()}>
            <Printer size={16} /> Imprimir / Exportar PDF
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-piedra print:hidden">Cargando…</p>
      ) : isError || !orden ? (
        <p className="py-16 text-center text-sm text-error print:hidden">No se pudo cargar la orden de pago.</p>
      ) : (
        <>
          {/* px-10 py-10 se mantiene en impresión a propósito — sin eso el
              texto queda pegado al borde de la hoja (el navegador no le
              suma margen propio al contenido, solo a la página entera, y
              ese margen de página el usuario lo puede sacar al imprimir). */}
          <div className="mx-auto w-full max-w-[780px] rounded-[18.4px] bg-white px-10 py-10 shadow-sm print:max-w-none print:rounded-none print:shadow-none">
            <div className="flex items-start justify-between border-b border-borde pb-6">
              <div>
                <span className="font-heading text-[22px] font-semibold text-tinta">Holiday Inn</span>
                <p className="mt-0.5 font-body text-[11px] text-tinta/55">Sistema de Gestión Hotelera · Compras y Gastos</p>
              </div>
              <div className="text-right">
                <span className="font-heading text-[19px] font-semibold text-tinta">Orden de Pago</span>
                <p className="mt-0.5 font-mono text-[13px] text-tinta/70">{orden.numero}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[11px] text-tinta/55 uppercase">Fecha de emisión</span>
                <p className="text-[13.5px] text-tinta">{new Date(orden.fecha).toLocaleDateString("es-AR")}</p>
              </div>
              <Badge variante={BADGE_ESTADO[orden.anulado ? "Anulada" : orden.estado] ?? "neutro"}>
                {orden.anulado ? "Anulada" : orden.estado}
              </Badge>
            </div>

            {orden.anulado && (
              <p className="mt-4 rounded-md bg-error-suave px-3.5 py-2.5 text-[12.5px] text-error-texto">
                <strong>Motivo de anulación:</strong> {orden.motivoAnulacion}
              </p>
            )}

            <div className="mt-8">
              <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Proveedor</span>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
                <div>
                  <span className="text-tinta/55">Razón social:</span> <span className="text-tinta">{orden.proveedor.razonSocial}</span>
                </div>
                <div>
                  <span className="text-tinta/55">CUIT:</span> <span className="text-tinta">{orden.proveedor.cuit}</span>
                </div>
                <div>
                  <span className="text-tinta/55">Condición comercial:</span>{" "}
                  <span className="text-tinta">{orden.proveedor.condicionComercial ?? "—"}</span>
                </div>
                <div>
                  <span className="text-tinta/55">Contacto:</span> <span className="text-tinta">{orden.proveedor.contacto ?? "—"}</span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Comprobantes cancelados</span>
              <div className="mt-2">
                <Table
                  columnas={["N° comprobante", "Importe aplicado"]}
                  columnasDerecha={["Importe aplicado"]}
                  filas={orden.detalle}
                  renderFila={(d) => (
                    <tr key={d.id} className="border-b border-borde last:border-0 print:break-inside-avoid">
                      <td className="px-2 py-2 font-mono text-[12.5px]">{d.comprobante.numero}</td>
                      <td className="px-2 py-2 text-right text-[12.5px]">$ {formatearMonto(d.importeAplicado)}</td>
                    </tr>
                  )}
                />
              </div>
            </div>

            <div className="mt-8">
              <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Medios de pago</span>
              <div className="mt-2">
                <Table
                  columnas={["Medio", "Detalle", "Estado", "Importe"]}
                  columnasDerecha={["Importe"]}
                  filas={orden.medios}
                  renderFila={(m) => (
                    <tr key={m.id} className="border-b border-borde last:border-0 print:break-inside-avoid">
                      <td className="px-2 py-2 text-[12.5px]">{m.medioPago}</td>
                      <td className="px-2 py-2 text-[12.5px] text-tinta/70">
                        {m.medioPago === "Cheque"
                          ? `${m.banco} · N° ${m.numeroCheque} · vto. ${new Date(m.fechaCheque).toLocaleDateString("es-AR")}` +
                            (m.estadoCheque === "Cobrado" && m.fechaCobro
                              ? ` · cobrado el ${new Date(m.fechaCobro).toLocaleDateString("es-AR")}`
                              : "")
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-[12.5px]">
                        {m.medioPago === "Cheque" && (
                          <Badge variante={BADGE_ESTADO_CHEQUE[m.estadoCheque] ?? "neutro"}>{m.estadoCheque}</Badge>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-[12.5px] font-semibold">$ {formatearMonto(m.importe)}</td>
                    </tr>
                  )}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end border-t border-borde pt-4">
              <div className="text-right">
                <span className="text-[11px] text-tinta/55 uppercase">Total pagado</span>
                <Cifra tamano={26} className="text-tinta">
                  $ {formatearMonto(totalPagado)}
                </Cifra>
              </div>
            </div>

            <p className="mt-10 border-t border-borde pt-4 text-[10.5px] text-tinta/45">
              Generado por {usuario ?? "—"} el {new Date().toLocaleString("es-AR")} · Documento interno, sin validez fiscal.
            </p>

            {/* Pie de acciones — mismo bloque visual que el comprobante (no
                una tarjeta suelta aparte), oculto al imprimir/exportar. */}
            {vigente && (
              <div className="mt-8 flex flex-col gap-4 border-t-2 border-dashed border-borde pt-6 print:hidden">
                <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Acciones</span>

                {chequesEmitidos.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-[14px] bg-hueso px-4 py-3.5">
                    {chequesEmitidos.map((m) => (
                      <div key={m.id} className="flex flex-col gap-2 text-[13px] text-tinta/80">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Cheque {m.banco} N° {m.numeroCheque}
                          </span>
                          {cobrandoMedioId !== m.id && (
                            <div className="flex gap-2">
                              <Button
                                tamano="fila"
                                variante="ok"
                                disabled={mutacionCheque.isPending}
                                onClick={() => {
                                  setErrorCheque("");
                                  setCobrandoMedioId(m.id);
                                }}
                              >
                                Marcar cobrado
                              </Button>
                              <Button
                                tamano="fila"
                                variante="baja"
                                disabled={mutacionCheque.isPending || orden.medios.length > 1}
                                onClick={() => mutacionCheque.mutate({ medioId: m.id, estado: "Rechazado" })}
                              >
                                Marcar rechazado
                              </Button>
                            </div>
                          )}
                        </div>

                        {cobrandoMedioId === m.id && (
                          <div className="flex flex-wrap items-center gap-2.5 rounded-md bg-white px-3 py-2.5">
                            <label className="flex items-center gap-2 text-[12.5px] text-tinta/70">
                              Fecha de cobro *
                              <input
                                type="date"
                                value={fechaCobro}
                                onChange={(e) => setFechaCobro(e.target.value)}
                                className="rounded-md border border-borde px-2 py-1 text-[13px] text-tinta focus:outline-none focus:ring-2 focus:ring-pino/40"
                              />
                            </label>
                            <div className="ml-auto flex gap-2">
                              <Button tamano="fila" variante="secundario" onClick={() => setCobrandoMedioId(null)}>
                                Cancelar
                              </Button>
                              <Button
                                tamano="fila"
                                variante="ok"
                                disabled={mutacionCheque.isPending || !fechaCobro}
                                onClick={() => mutacionCheque.mutate({ medioId: m.id, estado: "Cobrado", fechaCobro })}
                              >
                                {mutacionCheque.isPending ? "Guardando…" : "Confirmar cobro"}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {orden.medios.length > 1 && (
                      <p className="text-[11.5px] text-piedra">
                        Esta orden combina más de un medio de pago: para rechazar un cheque hay que anular la orden completa.
                      </p>
                    )}
                    {errorCheque && <p className="text-[11.5px] text-error-texto">{errorCheque}</p>}
                  </div>
                )}

                {anulando ? (
                  <div className="flex flex-col gap-2 rounded-[14px] bg-hueso px-4 py-3.5">
                    <span className="text-[12px] font-semibold text-tinta">Motivo de anulación *</span>
                    <textarea
                      className={`rounded-md border px-3 py-2 text-[13px] text-tinta bg-white placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40 ${
                        errorMotivo ? "border-error" : "border-borde"
                      }`}
                      rows={2}
                      value={motivo}
                      onChange={(e) => {
                        setMotivo(e.target.value);
                        setErrorMotivo("");
                      }}
                      placeholder="ej. Orden duplicada por error"
                    />
                    {tieneCheque && (
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-md bg-error-suave px-3 py-2.5 text-[12.5px] text-error-texto">
                        <input
                          type="checkbox"
                          checked={confirmarCheque}
                          onChange={(e) => {
                            setConfirmarCheque(e.target.checked);
                            setErrorMotivo("");
                          }}
                          className="mt-0.5 cursor-pointer accent-error"
                        />
                        <span>
                          Esta orden incluye un pago con cheque. Confirmo que quiero anularla igual (el cheque queda
                          libre para reusarse).
                        </span>
                      </label>
                    )}
                    {errorMotivo && <span className="text-[11.5px] text-error-texto">{errorMotivo}</span>}
                    <div className="mt-1 flex justify-end gap-2.5">
                      <Button
                        variante="secundario"
                        onClick={() => {
                          setAnulando(false);
                          setMotivo("");
                          setErrorMotivo("");
                          setConfirmarCheque(false);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variante="baja"
                        disabled={mutacionAnular.isPending || (tieneCheque && !confirmarCheque)}
                        onClick={confirmarAnular}
                      >
                        {mutacionAnular.isPending ? "Anulando…" : "Confirmar anulación"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <Button variante="baja" onClick={() => setAnulando(true)}>
                      Anular orden
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
