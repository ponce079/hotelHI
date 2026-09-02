import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { formatearMonto } from "../../lib/moneda";
import { obtenerOrdenPago, anularOrdenPago, actualizarEstadoCheque } from "./pagos.api";
import { BADGE_ESTADO, BADGE_ESTADO_CHEQUE } from "./pagos.constantes";

// HU-79 (anular) + HU-86 (estado de cheque). Misma logica que el
// backend: una orden vigente es !anulado && estado !== "Rechazada" —
// acá solo se decide qué botones mostrar en base a eso, el backend
// vuelve a validar todo antes de aplicar el cambio.
export function OrdenPagoFicha({ ordenId, onClose, onExito }) {
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const [errorCheque, setErrorCheque] = useState("");
  const queryClient = useQueryClient();

  const { data: orden, isLoading } = useQuery({
    queryKey: ["pagos", "orden", ordenId],
    queryFn: () => obtenerOrdenPago(ordenId),
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
    mutationFn: () => anularOrdenPago(ordenId, motivo),
    onSuccess: () => {
      invalidarListados();
      setAnulando(false);
      onExito(`Orden ${orden.numero} anulada.`);
    },
    onError: (error) => setErrorMotivo(error?.response?.data?.error ?? "No se pudo anular la orden."),
  });

  const mutacionCheque = useMutation({
    mutationFn: ({ medioId, estado }) => actualizarEstadoCheque(ordenId, medioId, estado),
    onSuccess: (_data, { estado }) => {
      invalidarListados();
      setErrorCheque("");
      onExito(`Cheque marcado como ${estado.toLowerCase()}.`);
    },
    // Un error acá NO es un toast de éxito (onExito): se muestra en la
    // propia ficha, junto a los botones de acción del cheque.
    onError: (error) => setErrorCheque(error?.response?.data?.error ?? "No se pudo actualizar el estado del cheque."),
  });

  function confirmarAnular() {
    if (!motivo.trim()) {
      setErrorMotivo("El motivo de anulación es obligatorio.");
      return;
    }
    mutacionAnular.mutate();
  }

  const vigente = Boolean(orden) && !orden.anulado && orden.estado !== "Rechazada";
  const chequesEmitidos = orden ? orden.medios.filter((m) => m.medioPago === "Cheque" && m.estadoCheque === "Emitido") : [];

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-tinta/45 p-6 py-10"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-borde px-6 py-5">
          <div>
            <h3 className="font-heading text-[20px] font-semibold text-tinta">{orden ? orden.numero : "Orden de pago"}</h3>
            {orden && (
              <p className="mt-1.5">
                <Badge variante={BADGE_ESTADO[orden.anulado ? "Anulada" : orden.estado] ?? "neutro"}>
                  {orden.anulado ? "Anulada" : orden.estado}
                </Badge>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-piedra hover:text-error">
            <X size={18} />
          </button>
        </div>

        {isLoading || !orden ? (
          <p className="px-6 py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-5 px-6 py-5">
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <span className="text-[11px] text-tinta/55 uppercase">Proveedor</span>
                <p className="text-tinta">{orden.proveedor.razonSocial}</p>
              </div>
              <div>
                <span className="text-[11px] text-tinta/55 uppercase">Fecha</span>
                <p className="text-tinta">{new Date(orden.fecha).toLocaleDateString("es-AR")}</p>
              </div>
            </div>

            {orden.anulado && (
              <p className="rounded-md bg-error-suave px-3 py-2 text-[12.5px] text-error-texto">
                Motivo de anulación: {orden.motivoAnulacion}
              </p>
            )}

            <div>
              <span className="text-[11px] text-tinta/55 uppercase">Comprobantes cancelados</span>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {orden.detalle.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-md bg-hueso px-3 py-2 text-[12.5px]">
                    <span className="font-mono text-tinta/80">{d.comprobante.numero}</span>
                    <span className="font-semibold text-tinta">$ {formatearMonto(d.importeAplicado)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[11px] text-tinta/55 uppercase">Medios de pago</span>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {orden.medios.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md bg-hueso px-3 py-2 text-[12.5px]">
                    <span className="text-tinta">
                      {m.medioPago}
                      {m.medioPago === "Cheque" && (
                        <span className="text-tinta/60"> · {m.banco} N° {m.numeroCheque}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-tinta">$ {formatearMonto(m.importe)}</span>
                      {m.medioPago === "Cheque" && (
                        <Badge variante={BADGE_ESTADO_CHEQUE[m.estadoCheque] ?? "neutro"}>{m.estadoCheque}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {vigente && chequesEmitidos.length > 0 && (
                <div className="mt-2 flex flex-col gap-1.5">
                  {chequesEmitidos.map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-[12px] text-tinta/70">
                      <span>Cheque {m.banco} N° {m.numeroCheque}</span>
                      <div className="flex gap-2">
                        <Button
                          tamano="fila"
                          variante="ok"
                          disabled={mutacionCheque.isPending}
                          onClick={() => mutacionCheque.mutate({ medioId: m.id, estado: "Cobrado" })}
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
            </div>

            {vigente && anulando && (
              <div className="flex flex-col gap-1.5 rounded-md border border-borde bg-hueso px-3 py-3">
                <span className="text-[12px] font-semibold text-tinta">Motivo de anulación *</span>
                <textarea
                  className={`rounded-md border px-3 py-2 text-[13px] text-tinta bg-white placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40 ${
                    errorMotivo ? "border-error" : "border-borde"
                  }`}
                  rows={2}
                  value={motivo}
                  onChange={(e) => { setMotivo(e.target.value); setErrorMotivo(""); }}
                  placeholder="ej. Orden duplicada por error"
                />
                {errorMotivo && <span className="text-[11.5px] text-error-texto">{errorMotivo}</span>}
              </div>
            )}
          </div>
        )}

        {vigente && (
          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            {anulando ? (
              <>
                <Button variante="secundario" onClick={() => { setAnulando(false); setMotivo(""); setErrorMotivo(""); }}>
                  Cancelar
                </Button>
                <Button variante="baja" disabled={mutacionAnular.isPending} onClick={confirmarAnular}>
                  {mutacionAnular.isPending ? "Anulando…" : "Confirmar anulación"}
                </Button>
              </>
            ) : (
              <Button variante="baja" onClick={() => setAnulando(true)}>
                Anular orden
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
