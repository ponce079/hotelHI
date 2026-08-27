import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { listarMovimientos, confirmarRecepcion } from "../movimientos/movimientos.api";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";

export function RecepcionesPage() {
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [recibidos, setRecibidos] = useState({}); // movId -> { articuloId: valorString }
  const [paraConfirmar, setParaConfirmar] = useState(null); // movimiento en tránsito

  const { data: enTransito, isLoading } = useQuery({
    queryKey: ["movimientos", { estado: "En tránsito" }],
    queryFn: () => listarMovimientos({ estado: "En tránsito" }),
  });
  const { data: conDiferenciaRaw } = useQuery({
    queryKey: ["movimientos", { estado: "Con diferencia" }],
    queryFn: () => listarMovimientos({ estado: "Con diferencia" }),
  });
  const conDiferencia = (conDiferenciaRaw ?? []).filter((m) => m.depositoDestinoId);

  const mutacion = useMutation({
    mutationFn: ({ id, lineas }) => confirmarRecepcion(id, { lineas }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      mostrarToast(`Recepción de MOV-${String(variables.id).padStart(4, "0")} confirmada.`);
      setParaConfirmar(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo confirmar la recepción.");
      setParaConfirmar(null);
    },
  });

  function valorDe(mov, articuloId, cantidadEnviada) {
    const v = recibidos[mov.id]?.[articuloId];
    return v === undefined ? String(cantidadEnviada) : v;
  }

  function setValor(mov, articuloId, valor) {
    setRecibidos((prev) => ({ ...prev, [mov.id]: { ...prev[mov.id], [articuloId]: valor } }));
  }

  function recibirTodo(mov) {
    const lineas = {};
    mov.detalleMovimientos.forEach((l) => {
      lineas[l.articuloId] = String(l.cantidad);
    });
    setRecibidos((prev) => ({ ...prev, [mov.id]: lineas }));
  }

  function confirmar() {
    const mov = paraConfirmar;
    const lineas = mov.detalleMovimientos.map((l) => ({
      articuloId: l.articuloId,
      cantidadRecibida: Number(valorDe(mov, l.articuloId, l.cantidad)),
    }));
    mutacion.mutate({ id: mov.id, lineas });
  }

  function diferenciaDe(mov, l) {
    const recibido = valorDe(mov, l.articuloId, l.cantidad);
    const dif = Number(l.cantidad) - (recibido === "" ? 0 : Number(recibido));
    return dif > 0 ? dif : 0;
  }

  function difTotalDe(mov) {
    return mov.detalleMovimientos.reduce((acc, l) => acc + diferenciaDe(mov, l), 0);
  }

  const hayDiferenciaEn = (mov) => difTotalDe(mov) > 0;

  if (!puede("operar")) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-[22px]">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <PackageCheck size={22} className="text-pino" /> Recepciones
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 14 y 17 — confirmación del destino y diferencias entre enviado y recibido
        </p>
        <p className="mt-2 max-w-[820px] text-[13px] text-tinta/70">
          Toda transferencia queda <strong>en tránsito</strong> hasta que el depósito destino la confirma. Quien recibe declara
          la cantidad que realmente llegó: si difiere de la enviada, el sistema registra la diferencia y la deja visible para
          los dos depósitos.
        </p>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <h3 className="font-heading text-[20px] font-semibold">Pendientes de confirmar</h3>
          <Badge variante="alerta">{enTransito?.length ?? 0}</Badge>
        </div>
        {isLoading && <p className="text-sm text-piedra">Cargando…</p>}
        {!isLoading && (enTransito?.length ?? 0) === 0 && (
          <div className="rounded-[18.4px] bg-white p-6">
            <p className="m-0 text-sm">No hay transferencias en tránsito: todas tienen su recepción confirmada.</p>
          </div>
        )}
        <div className="flex flex-col gap-3.5">
          {enTransito?.map((mov) => {
            const difTotal = difTotalDe(mov);
            return (
              <div key={mov.id} className="flex flex-col gap-3.5 rounded-[18.4px] bg-white px-6 py-5 shadow-[0_1px_2px_rgba(46,43,37,0.14)]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[12.5px]">MOV-{String(mov.id).padStart(4, "0")}</span>
                  <Badge variante="alerta">En tránsito</Badge>
                  <span className="font-body text-[12.5px] text-tinta/60">
                    Enviado {new Date(mov.fecha).toLocaleDateString("es-AR")}
                    {mov.usuario ? ` por ${mov.usuario}` : ""}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 border-t border-borde pt-3">
                  <div>
                    <div className="font-body text-[10.5px] text-tinta/55">Origen</div>
                    <div className="font-body text-[13.5px] font-semibold">{mov.deposito.nombre}</div>
                  </div>
                  <span className="text-lg text-laton">⇄</span>
                  <div>
                    <div className="font-body text-[10.5px] text-tinta/55">Destino — confirma {mov.depositoDestino?.responsable}</div>
                    <div className="font-body text-[13.5px] font-semibold">{mov.depositoDestino?.nombre}</div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-borde text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                        <th className="pb-1.5">Artículo</th>
                        <th className="w-24 pb-1.5">Enviado</th>
                        <th className="w-36 pb-1.5">Recibido</th>
                        <th className="w-36 pb-1.5">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mov.detalleMovimientos.map((l) => {
                        const dif = diferenciaDe(mov, l);
                        return (
                          <tr key={l.articuloId} className="border-t border-borde">
                            <td className="py-1.5 font-body text-[13.5px] font-semibold">{l.articulo.nombre}</td>
                            <td className="py-1.5">
                              <Cifra tamano={14}>{l.cantidad}</Cifra>{" "}
                              <span className="font-body text-[11px] text-tinta/50">{l.articulo.unidadMedida}</span>
                            </td>
                            <td className="py-1.5">
                              <input
                                type="number"
                                min="0"
                                max={l.cantidad}
                                value={valorDe(mov, l.articuloId, l.cantidad)}
                                onChange={(e) => setValor(mov, l.articuloId, e.target.value)}
                                className={`w-24 rounded-md border px-2 py-1 text-sm ${dif > 0 ? "border-error" : "border-borde"}`}
                              />
                            </td>
                            <td className={`py-1.5 text-[13px] ${dif > 0 ? "text-error-texto" : "text-tinta/55"}`}>
                              {dif > 0 ? `faltan ${dif}` : "sin diferencia"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {difTotal > 0 && (
                  <div className="rounded-[20px] bg-error-suave px-4 py-3 text-[12.5px] text-error-texto">
                    Al confirmar con diferencia, la entrada en {mov.depositoDestino?.nombre} se registra por la cantidad
                    recibida y la transferencia queda marcada <strong>Con diferencia</strong> ({difTotal} unidades sin
                    llegar). El faltante se informa al responsable del origen para su ajuste.
                  </div>
                )}
                <div className="flex justify-end gap-2.5">
                  <Button variante="secundario" onClick={() => recibirTodo(mov)}>
                    Recibí todo
                  </Button>
                  <Button variante="ok" onClick={() => setParaConfirmar(mov)}>
                    Confirmar recepción
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2.5">
          <h3 className="font-heading text-[20px] font-semibold">Transferencias con diferencia</h3>
          <Badge variante="neutro">{conDiferencia.length}</Badge>
        </div>
        {conDiferencia.length === 0 && (
          <div className="rounded-[18.4px] bg-white p-6">
            <p className="m-0 text-sm">Ninguna transferencia cerró con diferencia entre lo enviado y lo recibido.</p>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {conDiferencia.map((mov) => (
            <div key={mov.id} className="flex flex-col gap-2.5 rounded-[18.4px] bg-error-suave px-6 py-[18px]">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12.5px]">
                  MOV-{String(mov.id).padStart(4, "0")}
                  {mov.movimientoRelacionadoId ? ` ⇄ MOV-${String(mov.movimientoRelacionadoId).padStart(4, "0")}` : ""}
                </span>
                <Badge variante="error">Con diferencia</Badge>
                <span className="font-body text-[12.5px] text-tinta/65">
                  {mov.deposito.nombre} → {mov.depositoDestino?.nombre} · {new Date(mov.fecha).toLocaleDateString("es-AR")}
                </span>
                <span className="ml-auto font-body text-[12.5px] text-error-texto">Confirmó {mov.depositoDestino?.responsable}</span>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-error/20 pt-2.5">
                {mov.detalleMovimientos
                  .filter((l) => l.cantidadRecibida != null && Number(l.cantidadRecibida) < Number(l.cantidad))
                  .map((l) => (
                    <div key={l.articuloId} className="flex items-baseline gap-3.5 font-body text-[13px]">
                      <span className="min-w-[230px] font-semibold">{l.articulo.nombre}</span>
                      <span className="text-tinta/65">enviado {l.cantidad}</span>
                      <span className="text-tinta/65">recibido {l.cantidadRecibida}</span>
                      <span className="font-semibold text-error-texto">faltan {Number(l.cantidad) - Number(l.cantidadRecibida)}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        abierto={Boolean(paraConfirmar)}
        titulo={
          paraConfirmar && hayDiferenciaEn(paraConfirmar)
            ? "Confirmar con diferencia"
            : `Confirmar recepción de MOV-${paraConfirmar ? String(paraConfirmar.id).padStart(4, "0") : ""}`
        }
        mensaje={
          paraConfirmar && hayDiferenciaEn(paraConfirmar)
            ? `Se registrará la entrada en ${paraConfirmar?.depositoDestino?.nombre} por la cantidad recibida y la transferencia quedará marcada Con diferencia.`
            : `Se registrará la entrada en ${paraConfirmar?.depositoDestino?.nombre} por la cantidad completa y ambas filas quedarán vinculadas.`
        }
        textoConfirmar="Confirmar recepción"
        variante="ok"
        onCancelar={() => setParaConfirmar(null)}
        onConfirmar={confirmar}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
