import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Lock, Truck, TriangleAlert, PackageCheck, Clock, Send } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { PasoAPaso } from "../../componentes/PasoAPaso";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { useVolver } from "../../lib/useVolver";
import { formatearMonto } from "../../lib/moneda";
import { obtenerOrdenCompra, enviarOrdenCompra, anularOrdenCompra } from "./ordenesCompra.api";
import { BADGE_ESTADO_OC } from "./ordenesCompra.constantes";

// Píldora de estado con borde completamente redondeado — más "chip" que el
// <Badge> genérico (rounded-sm) que usan las tablas densas del resto de la
// app. Acá el header tiene lugar de sobra y el mockup de referencia pide
// justamente ese look, así que es un componente local, no un cambio al
// <Badge> compartido (eso afectaría toda pantalla que lo usa).
const PILDORA_VARIANTES = {
  ok: "bg-pino-100 text-pino-700",
  alerta: "bg-laton-100 text-laton-700",
  error: "bg-error-suave text-error-texto",
  neutro: "bg-neutro-100 text-neutro-700",
};
function Pildora({ variante = "neutro", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-[11.5px] font-medium ${PILDORA_VARIANTES[variante]}`}
    >
      {children}
    </span>
  );
}

// El log de auditoría guarda la acción entera en un solo string ("Orden
// anulada: se canceló el pedido") — separar en "principal" + "detalle" acá
// (no en el backend) evita agregar una columna nueva solo para esto.
function separarDetalleLog(accion) {
  const idx = accion.indexOf(":");
  if (idx === -1) return { principal: accion, detalle: null };
  return { principal: accion.slice(0, idx).trim(), detalle: accion.slice(idx + 1).trim() };
}

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
  const volver = useVolver("/ordenes-compra");

  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState("");
  const [confirmarAccion, setConfirmarAccion] = useState(null); // "enviar" | null

  const { data: oc, isLoading, isError } = useQuery({
    queryKey: ["ordenes-compra", "orden", ocId],
    queryFn: () => obtenerOrdenCompra(ocId),
    enabled: tienePermiso && Number.isInteger(ocId),
  });

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
  }

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
  const puedeEnviar = puede("gestionarOC") && oc?.estado === "Pendiente";
  const puedeAnular = puede("gestionarOC") && oc && !["Recibida", "Recibida con diferencia", "Anulada", "Cerrada"].includes(oc.estado);
  const puedeRecibir = puede("recibirOC") && oc?.estado === "Enviada";

  const pasosOC = [
    { clave: "Pendiente", label: "Pendiente", icono: Clock },
    { clave: "Enviada", label: "Enviada", icono: Send },
    { clave: "Recibida", label: "Recibida", icono: PackageCheck },
  ];
  // "Recibida con diferencia" ocupa el mismo lugar que "Recibida" — ya se
  // llegó al final del camino, la diferencia se ve en el badge de estado.
  const estadoParaPaso = oc?.estado === "Recibida con diferencia" ? "Recibida" : oc?.estado;
  // Una OC anulada ya no tiene un "estado" dentro de pasosOC (es una
  // bifurcación, no un paso más) — para no perder en qué punto del camino
  // se cortó, se infiere del propio log: si llegó a mandarse al proveedor
  // antes de anularse, queda congelada en "Enviada"; si no, en "Pendiente".
  const fueEnviadaAntesDeAnular = (oc?.log ?? []).some((l) => l.accion === "Orden enviada al proveedor");
  const pasoActualOC =
    oc?.estado === "Anulada" ? (fueEnviadaAntesDeAnular ? 1 : 0) : pasosOC.findIndex((paso) => paso.clave === estadoParaPaso);
  const pasoAlternativo = oc ? { label: "Anulada", activo: oc.estado === "Anulada" } : null;

  return (
    <div className="flex flex-col gap-8">
      <Button variante="secundario" onClick={volver} className="w-fit text-xs">
        ← Volver
      </Button>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-piedra">Cargando…</p>
      ) : isError || !oc ? (
        <p className="py-16 text-center text-sm text-error">No se pudo cargar la orden de compra.</p>
      ) : (
        <>
          <div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="flex items-center gap-2 font-heading text-[28px] font-semibold">
                <ShoppingCart size={22} className="text-pino" /> {oc.numero} · {oc.proveedor?.razonSocial}
              </h1>
              <div className="flex flex-none flex-wrap items-center gap-2">
                <Pildora variante={BADGE_ESTADO_OC[oc.estado] ?? "neutro"}>
                  {oc.estado === "Recibida con diferencia" && <TriangleAlert size={12} />} {oc.estado}
                </Pildora>
                {/* Sin movimiento de stock de entrada todavía — se crea recién al
                    registrar la recepción (HU-85), así que es cierto para toda OC
                    que no llegó a "Recibida" (o "Recibida con diferencia") aún. */}
                {["Pendiente", "Enviada"].includes(oc.estado) && (
                  <Pildora variante="neutro">Sin stock de entrada aún</Pildora>
                )}
              </div>
            </div>
            <p className="mt-1 font-body text-[12.5px] text-tinta/60">
              Desde {oc.presupuestoId ? `PR-${String(oc.presupuestoId).padStart(4, "0")}` : "—"} adjudicado
              {" · $ "}
              {formatearMonto(Number(oc.montoTotal) + Number(oc.flete || 0))}
              {" · "}
              {new Date(oc.fecha).toLocaleDateString("es-AR")}
            </p>
          </div>

          {oc.estado === "Anulada" && oc.motivoAnulacion && (
            <p className="rounded-md bg-error-suave px-3.5 py-2.5 text-[12.5px] text-error-texto">
              <strong>Motivo de anulación:</strong> {oc.motivoAnulacion}
            </p>
          )}

          <PasoAPaso pasos={pasosOC} pasoActual={pasoActualOC} pasoAlternativo={pasoAlternativo} />

          <div className="rounded-[18.4px] bg-white px-7 py-6">
            <div className="mb-5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/55">
              <Lock size={12} /> Estos datos vienen del presupuesto adjudicado y no se pueden modificar acá
            </div>

            <div className="mb-5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
              <div>
                <span className="text-tinta/55">CUIT:</span> <span className="text-tinta">{oc.proveedor?.cuit}</span>
              </div>
              <div>
                <span className="text-tinta/55">Depósito de entrega:</span> <span className="text-tinta">{oc.deposito?.nombre}</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-borde">
              <Table
                columnas={["Artículo", "Cantidad", "Precio unitario", "Subtotal", "Recibido"]}
                columnasDerecha={["Cantidad", "Precio unitario", "Subtotal", "Recibido"]}
                encabezadoDestacado
                filas={oc.detalle}
                renderFila={(d) => {
                  const subtotal = Number(d.cantidad) * Number(d.precioUnitario);
                  // Solo se resalta el recibido cuando difiere de lo pedido —
                  // es exactamente la línea que explica un "Recibida con
                  // diferencia"; si coincide, no hace falta repetir el
                  // mismo número dos veces en la fila.
                  const huboDiferencia =
                    d.cantidadRecibida !== null &&
                    d.cantidadRecibida !== undefined &&
                    Number(d.cantidadRecibida) !== Number(d.cantidad);
                  return (
                    <tr key={d.id} className="border-b border-borde last:border-0">
                      <td className="px-3 py-3 font-body text-[13.5px] text-tinta">{d.articulo?.nombre}</td>
                      <td className="px-3 py-3 text-right font-body text-[13px] text-tinta">
                        {Number(d.cantidad)} <span className="text-tinta/55">{d.articulo?.unidadMedida}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[12.5px] text-piedra">
                        $ {formatearMonto(d.precioUnitario)}
                      </td>
                      <td className="px-3 py-3 text-right font-heading text-[14px] font-semibold text-tinta">
                        $ {formatearMonto(subtotal)}
                      </td>
                      <td className={`px-3 py-3 text-right font-body text-[13px] ${huboDiferencia ? "font-semibold text-laton-700" : "text-tinta/55"}`}>
                        {d.cantidadRecibida === null || d.cantidadRecibida === undefined ? "—" : Number(d.cantidadRecibida)}
                      </td>
                    </tr>
                  );
                }}
              />
            </div>

            <div className="mt-4 flex flex-col gap-1.5">
              {oc.flete != null && (
                <div className="flex items-center justify-between gap-3 text-[13px] text-tinta/70">
                  <span className="inline-flex items-center gap-1.5">
                    <Truck size={14} /> Flete
                  </span>
                  <span className="font-mono">$ {formatearMonto(oc.flete)}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 rounded-lg bg-hueso px-3.5 py-3">
                <span className="font-body text-[13px] font-semibold text-tinta">Total OC</span>
                <Cifra tamano={22} className="text-tinta">
                  $ {formatearMonto(Number(oc.montoTotal) + Number(oc.flete || 0))}
                </Cifra>
              </div>
            </div>
          </div>

          {(puedeEnviar || puedeRecibir || puedeAnular) && (
            <div className="flex flex-col gap-4">
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
                  {puedeRecibir && (
                    <Button variante="ok" onClick={() => navigate(`/ordenes-compra/${oc.id}/recepcion`)}>
                      <PackageCheck size={16} /> Registrar recepción
                    </Button>
                  )}
                  {puedeEnviar && (
                    <Button variante="secundario" onClick={() => setConfirmarAccion("enviar")}>
                      Marcar como enviada
                    </Button>
                  )}
                  {puedeAnular && (
                    <Button variante="baja" onClick={() => setAnulando(true)}>
                      Anular Orden de Compra
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Auditoría</span>
            <div className="relative mt-4 flex flex-col gap-4 pl-5">
              <div className="absolute bottom-1.5 left-[5px] top-1.5 w-px bg-borde" />
              {oc.log
                .slice()
                .reverse()
                .map((l, i) => {
                  const { principal, detalle } = separarDetalleLog(l.accion);
                  return (
                    <div key={l.id} className="relative">
                      <span
                        className={`absolute -left-5 top-1 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-tinta" : "bg-piedra/40"}`}
                      />
                      <div className="text-[12.5px]">
                        <span className="font-semibold text-tinta">{l.usuario}</span>{" "}
                        <span className="text-tinta/75">{principal}</span>
                        {" · "}
                        <span className="font-mono text-tinta/50">{new Date(l.fecha).toLocaleString("es-AR")}</span>
                      </div>
                      {detalle && <div className="mt-0.5 text-[11.5px] text-piedra">{detalle}</div>}
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}

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
