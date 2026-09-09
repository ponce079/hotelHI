import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, ChevronRight, CreditCard, Landmark } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { formatearMonto } from "../../lib/moneda";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { obtenerOrdenPago, anularOrdenPago, actualizarEstadoCheque } from "./pagos.api";
import { BADGE_ESTADO, BADGE_ESTADO_CHEQUE } from "./pagos.constantes";

const ICONO_MEDIO = { Efectivo: Banknote, Transferencia: Landmark, Cheque: CreditCard };

// Vista rápida de una orden de pago, en modal en vez de pantalla completa
// (mismo criterio que ya se aplicó en Órdenes de Compra): se llega acá con
// un click en la lista de HU-78 y se resuelven ahí mismo las acciones del
// día a día (marcar cheque cobrado/rechazado, anular) sin navegar. La
// versión anterior (OrdenPagoDetallePage) era una página imprimible con
// membrete — eso se dejó afuera a propósito, no hay pedido de imprimir/
// exportar todavía.
export function OrdenPagoDetalleModal({ ordenId, onClose, onExito }) {
  const queryClient = useQueryClient();

  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const [pidiendoConfirmacionCheque, setPidiendoConfirmacionCheque] = useState(false);
  // { id, modo } — modo: "menu" (elegir cobrado/rechazado) | "cobrar" | "rechazar".
  // Un solo medio a la vez puede tener sus acciones abiertas.
  const [medioAccion, setMedioAccion] = useState(null);
  const [fechaCobro, setFechaCobro] = useState(hoyEnHoraLocal);
  const [errorCheque, setErrorCheque] = useState("");

  const { data: orden, isLoading, isError } = useQuery({
    queryKey: ["pagos", "orden", ordenId],
    queryFn: () => obtenerOrdenPago(ordenId),
    enabled: Number.isInteger(ordenId),
  });

  // Mismas queries que invalidaba OrdenPagoDetallePage: liberan saldo de
  // comprobantes y (si aplica) un N° de cheque para reusarse.
  function invalidarListados() {
    queryClient.invalidateQueries({ queryKey: ["pagos", "listado"] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "proveedores-filtro"] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "orden", ordenId] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "proveedores-con-saldo"] });
    queryClient.invalidateQueries({ queryKey: ["pagos", "comprobantes-pendientes"] });
  }

  const mutacionAnular = useMutation({
    mutationFn: (confirmarCheque) => anularOrdenPago(ordenId, motivo, confirmarCheque),
    onSuccess: () => {
      invalidarListados();
      onExito?.(`Orden ${orden.numero} anulada.`);
      onClose();
    },
    onError: (error) => {
      setPidiendoConfirmacionCheque(false);
      setErrorMotivo(error?.response?.data?.error ?? "No se pudo anular la orden.");
    },
  });

  const mutacionCheque = useMutation({
    mutationFn: ({ medioId, estado, fechaCobro: fecha }) => actualizarEstadoCheque(ordenId, medioId, estado, fecha),
    onSuccess: (_data, { estado }) => {
      invalidarListados();
      setErrorCheque("");
      setMedioAccion(null);
      onExito?.(`Cheque marcado como ${estado.toLowerCase()}.`);
    },
    onError: (error) => setErrorCheque(error?.response?.data?.error ?? "No se pudo actualizar el estado del cheque."),
  });

  const vigente = Boolean(orden) && !orden.anulado && orden.estado !== "Rechazada";
  const tieneCheque = Boolean(orden?.medios?.some((m) => m.medioPago === "Cheque"));
  const totalPagado = orden ? orden.medios.reduce((acc, m) => acc + Number(m.importe), 0) : 0;

  function intentarAnular() {
    if (!motivo.trim()) {
      setErrorMotivo("El motivo de anulación es obligatorio.");
      return;
    }
    if (tieneCheque) {
      setPidiendoConfirmacionCheque(true);
      return;
    }
    mutacionAnular.mutate(false);
  }

  return (
    <Modal
      titulo={orden ? `${orden.numero} · ${orden.proveedor.razonSocial}` : "Orden de pago"}
      subtitulo={orden ? `Emitida ${new Date(orden.fecha).toLocaleDateString("es-AR")} · $ ${formatearMonto(totalPagado)}` : undefined}
      extra={
        orden && (
          <Badge variante={BADGE_ESTADO[orden.anulado ? "Anulada" : orden.estado] ?? "neutro"}>
            {orden.anulado ? "Anulada" : orden.estado}
          </Badge>
        )
      }
      onClose={onClose}
    >
      {isLoading ? (
        <p className="px-6 py-10 text-center text-sm text-piedra">Cargando…</p>
      ) : isError || !orden ? (
        <p className="px-6 py-10 text-center text-sm text-error">No se pudo cargar la orden de pago.</p>
      ) : (
        <div className="flex flex-col gap-6 px-6 py-5">
          {orden.anulado && (
            <p className="rounded-md bg-error-suave px-3.5 py-2.5 text-[12.5px] text-error-texto">
              <strong>Motivo de anulación:</strong> {orden.motivoAnulacion}
            </p>
          )}

          <div>
            <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Comprobantes cancelados</span>
            <div className="mt-2 flex flex-col gap-1.5">
              {orden.detalle.map((d) => (
                <Link
                  key={d.id}
                  to={`/comprobantes/${d.comprobante.id}`}
                  onClick={onClose}
                  className="flex items-center justify-between gap-3 rounded-md border border-borde px-3.5 py-2.5 text-[13px] hover:bg-hueso"
                >
                  <span className="font-mono font-semibold text-tinta underline decoration-tinta/30 underline-offset-2">
                    {d.comprobante.numero}
                  </span>
                  <span className="flex items-center gap-1.5 text-tinta/60">
                    aplicado <span className="font-semibold text-tinta">$ {formatearMonto(d.importeAplicado)}</span>
                    <ChevronRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Medios utilizados</span>
            <div className="mt-2 flex flex-col gap-2">
              {orden.medios.map((m) => {
                const Icono = ICONO_MEDIO[m.medioPago] ?? Banknote;
                const puedeAccionar = vigente && m.medioPago === "Cheque" && m.estadoCheque === "Emitido";
                const accionAbierta = medioAccion?.id === m.id ? medioAccion.modo : null;
                return (
                  <div
                    key={m.id}
                    className={`rounded-[14px] border px-4 py-3 ${m.medioPago === "Cheque" ? "border-laton-300 bg-laton-100" : "border-borde"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13.5px] text-tinta">
                        <Icono size={16} className="text-tinta/50" />
                        {m.medioPago}
                        {m.medioPago === "Cheque" && ` ${m.numeroCheque} · ${m.banco}`}
                        {" · $ "}
                        {formatearMonto(m.importe)}
                      </span>
                      <div className="flex items-center gap-2">
                        {m.medioPago === "Cheque" && (
                          <Badge variante={BADGE_ESTADO_CHEQUE[m.estadoCheque] ?? "neutro"}>{m.estadoCheque}</Badge>
                        )}
                        {puedeAccionar && (
                          <Button
                            variante="secundario"
                            tamano="fila"
                            onClick={() => setMedioAccion(accionAbierta ? null : { id: m.id, modo: "menu" })}
                          >
                            Cambiar estado
                          </Button>
                        )}
                      </div>
                    </div>

                    {accionAbierta === "menu" && (
                      <div className="mt-3 flex gap-2 border-t border-laton-300 pt-3">
                        <Button
                          tamano="fila"
                          variante="ok"
                          className="flex-1 justify-center"
                          onClick={() => setMedioAccion({ id: m.id, modo: "cobrar" })}
                        >
                          Marcar Cobrado
                        </Button>
                        <Button
                          tamano="fila"
                          variante="destructivo"
                          className="flex-1 justify-center"
                          onClick={() => setMedioAccion({ id: m.id, modo: "rechazar" })}
                        >
                          Marcar Rechazado
                        </Button>
                      </div>
                    )}

                    {accionAbierta === "cobrar" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-laton-300 pt-3">
                        <label className="flex items-center gap-2 text-[12.5px] text-tinta/70">
                          Fecha de cobro *
                          <input
                            type="date"
                            value={fechaCobro}
                            onChange={(e) => setFechaCobro(e.target.value)}
                            className="rounded-md border border-borde bg-white px-2 py-1 text-[13px] text-tinta focus:outline-none focus:ring-2 focus:ring-pino/40"
                          />
                        </label>
                        <div className="ml-auto flex gap-2">
                          <Button tamano="fila" variante="secundario" onClick={() => setMedioAccion(null)}>
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

                    {accionAbierta === "rechazar" && (
                      <div className="mt-3 rounded-md border-t border-laton-300 bg-error-suave px-3.5 py-2.5 pt-3 text-[12.5px] text-error-texto">
                        <p>Al marcar Rechazado se restituirá el saldo de los comprobantes afectados.</p>
                        {orden.medios.length > 1 ? (
                          <p className="mt-1.5">
                            Esta orden combina más de un medio de pago: para rechazar un cheque hay que anular la
                            orden completa.
                          </p>
                        ) : (
                          <div className="mt-1.5 flex items-center gap-2">
                            <Button
                              tamano="fila"
                              variante="destructivo"
                              disabled={mutacionCheque.isPending}
                              onClick={() => mutacionCheque.mutate({ medioId: m.id, estado: "Rechazado" })}
                            >
                              {mutacionCheque.isPending ? "Guardando…" : "Confirmar rechazo"}
                            </Button>
                            <Button tamano="fila" variante="secundario" onClick={() => setMedioAccion(null)}>
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {errorCheque && <p className="mt-2 text-[11.5px] text-error-texto">{errorCheque}</p>}
          </div>

          {vigente && (
            <div className="flex flex-col gap-2 border-t border-borde pt-5">
              <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">
                Anulación · motivo obligatorio
              </span>
              <textarea
                rows={2}
                value={motivo}
                onChange={(e) => {
                  setMotivo(e.target.value);
                  setErrorMotivo("");
                }}
                placeholder="Motivo: ej. duplicación de pago…"
                className={`rounded-md border bg-white px-3 py-2 text-[13px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40 ${
                  errorMotivo ? "border-error" : "border-borde"
                }`}
              />
              {errorMotivo && <span className="text-[11.5px] text-error-texto">{errorMotivo}</span>}
              <Button
                variante="destructivo"
                disabled={mutacionAnular.isPending}
                onClick={intentarAnular}
                className="w-full justify-center"
              >
                {mutacionAnular.isPending ? "Anulando…" : "Anular orden de pago"}
              </Button>
              {tieneCheque && (
                <p className="text-center text-[11px] text-piedra">
                  Incluye cheque: se pide confirmación adicional explícita.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        abierto={pidiendoConfirmacionCheque}
        titulo="¿Anular de todas formas?"
        mensaje="Esta orden incluye un pago con cheque. Al anularla, el cheque queda libre para reusarse."
        textoConfirmar="Sí, anular"
        variante="destructivo"
        onCancelar={() => setPidiendoConfirmacionCheque(false)}
        onConfirmar={() => mutacionAnular.mutate(true)}
      />
    </Modal>
  );
}
