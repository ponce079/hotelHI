import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { formatearMonto } from "../../lib/moneda";
import { obtenerOrdenCompra, aprobarOrdenCompra, enviarOrdenCompra, anularOrdenCompra } from "./ordenesCompra.api";
import { BADGE_ESTADO_OC } from "./ordenesCompra.constantes";

// Los 3 datos heredados del presupuesto (proveedor, artículos/precios,
// flete) son de solo lectura acá — no hay ningún input que los edite, así
// se refleja la regla de negocio de HU-22 ("se copian, no se editan").
export function OrdenCompraDetallePage() {
  const { id } = useParams();
  const ocId = Number(id);
  const navigate = useNavigate();
  const { puede, usuario } = useSesion();
  const tienePermiso = puede("verOrdenesCompra");
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const [confirmarAccion, setConfirmarAccion] = useState(null); // "aprobar" | "enviar" | null

  const { data: oc, isLoading, isError } = useQuery({
    queryKey: ["ordenes-compra", "orden", ocId],
    queryFn: () => obtenerOrdenCompra(ocId),
    enabled: tienePermiso && Number.isInteger(ocId),
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
  }

  const mutacionAprobar = useMutation({
    mutationFn: () => aprobarOrdenCompra(ocId, usuario),
    onSuccess: () => {
      invalidar();
      setConfirmarAccion(null);
      mostrarToast(`Orden ${oc.numero} aprobada.`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo aprobar la orden."),
  });

  const mutacionEnviar = useMutation({
    mutationFn: () => enviarOrdenCompra(ocId, usuario),
    onSuccess: () => {
      invalidar();
      setConfirmarAccion(null);
      mostrarToast(`Orden ${oc.numero} enviada al proveedor.`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? "No se pudo enviar la orden."),
  });

  const mutacionAnular = useMutation({
    mutationFn: () => anularOrdenCompra(ocId, motivo, usuario),
    onSuccess: () => {
      invalidar();
      setAnulando(false);
      mostrarToast(`Orden ${oc.numero} anulada.`);
    },
    onError: (error) => setErrorMotivo(error?.response?.data?.error ?? "No se pudo anular la orden."),
  });

  function confirmarAnular() {
    if (!motivo.trim()) {
      setErrorMotivo("El motivo de anulación es obligatorio.");
      return;
    }
    mutacionAnular.mutate();
  }

  if (!tienePermiso) return <SinPermiso />;

  // Backend no valida rol todavía (Sprint 3) — cada botón depende
  // únicamente de este chequeo de puede() + el estado de la orden.
  const puedeAprobar = puede("aprobarOC") && oc?.estado === "Pendiente" && oc?.requiereAprobacion;
  const puedeEnviar =
    puede("gestionarOC") &&
    (oc?.estado === "Aprobada" || (oc?.estado === "Pendiente" && !oc?.requiereAprobacion));
  const puedeAnular = puede("gestionarOC") && oc && !["Recibida", "Recibida con diferencia", "Anulada", "Cerrada"].includes(oc.estado);
  const puedeRecibir = puede("recibirOC") && oc?.estado === "Enviada";

  return (
    <div className="flex flex-col gap-6">
      <Button variante="secundario" onClick={() => navigate("/ordenes-compra")} className="w-fit text-xs">
        ← Órdenes de Compra
      </Button>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-piedra">Cargando…</p>
      ) : isError || !oc ? (
        <p className="py-16 text-center text-sm text-error">No se pudo cargar la orden de compra.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 font-heading text-[30px] font-semibold">
                <ShoppingCart size={24} className="text-pino" /> {oc.numero}
              </h1>
              <p className="mt-1 font-body text-[12.5px] text-tinta/60">
                Generada desde el presupuesto adjudicado {oc.presupuestoId ? `PR-${String(oc.presupuestoId).padStart(4, "0")}` : "—"}
              </p>
            </div>
            <Badge variante={BADGE_ESTADO_OC[oc.estado] ?? "neutro"}>{oc.estado}</Badge>
          </div>

          {oc.estado === "Pendiente" && oc.requiereAprobacion && (
            <div className="rounded-[14px] bg-laton-100 px-4 py-3 text-[13px] text-laton-700">
              Requiere aprobación del gerente antes de poder enviarse — supera el límite de aprobación automática.
            </div>
          )}

          {oc.estado === "Anulada" && oc.motivoAnulacion && (
            <p className="rounded-md bg-error-suave px-3.5 py-2.5 text-[12.5px] text-error-texto">
              <strong>Motivo de anulación:</strong> {oc.motivoAnulacion}
            </p>
          )}

          <div className="rounded-[18.4px] bg-white px-6 py-5">
            <p className="mb-4 rounded-md bg-hueso px-3.5 py-2.5 text-[12px] text-tinta/60">
              Proveedor, artículos, precios y flete se heredan del presupuesto aprobado — no editables acá.
            </p>

            <div className="mb-5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
              <div>
                <span className="text-tinta/55">Proveedor:</span> <span className="text-tinta">{oc.proveedor?.razonSocial}</span>
              </div>
              <div>
                <span className="text-tinta/55">CUIT:</span> <span className="text-tinta">{oc.proveedor?.cuit}</span>
              </div>
              <div>
                <span className="text-tinta/55">Depósito de entrega:</span> <span className="text-tinta">{oc.deposito?.nombre}</span>
              </div>
              <div>
                <span className="text-tinta/55">Fecha:</span> <span className="text-tinta">{new Date(oc.fecha).toLocaleDateString("es-AR")}</span>
              </div>
            </div>

            <Table
              columnas={["Artículo", "Cantidad", "Precio unitario", "Subtotal", "Recibido"]}
              columnasDerecha={["Precio unitario", "Subtotal", "Recibido"]}
              filas={oc.detalle}
              renderFila={(d) => (
                <tr key={d.id} className="border-b border-borde last:border-0">
                  <td className="px-2 py-2 text-[13px]">{d.articulo?.nombre}</td>
                  <td className="px-2 py-2 text-[13px]">{Number(d.cantidad)}</td>
                  <td className="px-2 py-2 text-right text-[13px]">$ {formatearMonto(d.precioUnitario)}</td>
                  <td className="px-2 py-2 text-right text-[13px] font-semibold">
                    $ {formatearMonto(Number(d.cantidad) * Number(d.precioUnitario))}
                  </td>
                  <td className="px-2 py-2 text-right text-[13px] text-tinta/70">
                    {d.cantidadRecibida === null || d.cantidadRecibida === undefined ? "—" : Number(d.cantidadRecibida)}
                  </td>
                </tr>
              )}
            />

            <div className="mt-4 flex flex-col items-end gap-1 border-t border-borde pt-4">
              <div className="flex gap-6 text-[13px] text-tinta/65">
                <span>
                  Subtotal artículos: <strong className="text-tinta">$ {formatearMonto(oc.montoTotal)}</strong>
                </span>
                {oc.flete != null && (
                  <span>
                    Flete: <strong className="text-tinta">$ {formatearMonto(oc.flete)}</strong>
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[11px] text-tinta/55 uppercase">Total de la orden</span>
                <Cifra tamano={26} className="text-tinta">
                  $ {formatearMonto(Number(oc.montoTotal) + Number(oc.flete || 0))}
                </Cifra>
              </div>
            </div>
          </div>

          {(puedeAprobar || puedeEnviar || puedeRecibir || puedeAnular) && (
            <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-5">
              <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Acciones</span>

              {anulando ? (
                <div className="flex flex-col gap-2 rounded-[14px] bg-hueso px-4 py-3.5">
                  <span className="text-[12px] font-semibold text-tinta">Motivo de anulación *</span>
                  <textarea
                    className={`rounded-md border bg-white px-3 py-2 text-[13px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40 ${
                      errorMotivo ? "border-error" : "border-borde"
                    }`}
                    rows={2}
                    value={motivo}
                    onChange={(e) => {
                      setMotivo(e.target.value);
                      setErrorMotivo("");
                    }}
                    placeholder="ej. Se canceló la necesidad de reposición"
                  />
                  {errorMotivo && <span className="text-[11.5px] text-error-texto">{errorMotivo}</span>}
                  <div className="mt-1 flex justify-end gap-2.5">
                    <Button
                      variante="secundario"
                      onClick={() => {
                        setAnulando(false);
                        setMotivo("");
                        setErrorMotivo("");
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button variante="baja" disabled={mutacionAnular.isPending} onClick={confirmarAnular}>
                      {mutacionAnular.isPending ? "Anulando…" : "Confirmar anulación"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2.5">
                  {puedeAnular && (
                    <Button variante="baja" onClick={() => setAnulando(true)}>
                      Anular OC
                    </Button>
                  )}
                  {puedeRecibir && (
                    <Button variante="alta" onClick={() => navigate(`/ordenes-compra/${oc.id}/recepcion`)}>
                      Registrar recepción →
                    </Button>
                  )}
                  {puedeAprobar && (
                    <Button variante="ok" onClick={() => setConfirmarAccion("aprobar")}>
                      Aprobar orden
                    </Button>
                  )}
                  {puedeEnviar && (
                    <Button variante="ok" onClick={() => setConfirmarAccion("enviar")}>
                      Marcar como enviada
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-[18.4px] bg-white px-6 py-5">
            <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Log de auditoría</span>
            <div className="mt-3 flex flex-col gap-2">
              {oc.log.map((l) => (
                <div key={l.id} className="flex flex-wrap items-baseline gap-2 border-b border-borde pb-2 text-[12.5px] last:border-0">
                  <span className="font-mono text-tinta/50">{new Date(l.fecha).toLocaleString("es-AR")}</span>
                  <span className="font-semibold text-tinta">{l.usuario}</span>
                  <span className="text-tinta/75">{l.accion}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        abierto={confirmarAccion === "aprobar"}
        titulo="Aprobar orden de compra"
        mensaje={`Se marcará ${oc?.numero} como Aprobada. El área de compras va a poder enviarla al proveedor.`}
        textoConfirmar="Aprobar"
        variante="ok"
        onCancelar={() => setConfirmarAccion(null)}
        onConfirmar={() => mutacionAprobar.mutate()}
      />
      <ConfirmDialog
        abierto={confirmarAccion === "enviar"}
        titulo="Marcar como enviada"
        mensaje={`Se marcará ${oc?.numero} como Enviada al proveedor. Después de esto solo se puede registrar la recepción o anular.`}
        textoConfirmar="Marcar enviada"
        variante="ok"
        onCancelar={() => setConfirmarAccion(null)}
        onConfirmar={() => mutacionEnviar.mutate()}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
