import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShoppingCart, Lock, TriangleAlert, PackageCheck, Clock, Send, Printer, CheckCheck } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { NombreClave } from "../../componentes/NombreClave";
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
  info: "bg-info-suave text-info-texto",
  cerrado: "bg-neutro-300 text-neutro-900",
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
  // Punto 5 del rediseño: la columna "Recibido" no aporta nada mientras no
  // hubo recepción — antes repetía un "—" en cada fila para Pendiente/
  // Enviada/Anulada (anular está bloqueado una vez Recibida, así que una OC
  // Anulada nunca tuvo recepción). Se muestra recién cuando hay datos reales.
  const mostrarRecibido = ["Recibida", "Recibida con diferencia", "Cerrada"].includes(oc?.estado);

  // "Recibida con diferencia" no es un paso propio — ocupa el mismo lugar
  // que "Recibida" (mismo círculo), solo cambia a tono ámbar + label +
  // ícono cuando corresponde (punto 3 del rediseño). "Cerrada" sí es un
  // paso más, después de "Recibida": marca que ya no queda nada de
  // facturación/pago pendiente — por eso "Recibida" sola (sin llegar a
  // Cerrada) se ve como el paso ACTUAL, no completado, aunque la
  // mercadería ya haya llegado bien.
  const conDiferencia = oc?.estado === "Recibida con diferencia";
  const pasosOC = [
    { clave: "Pendiente", label: "Pendiente", icono: Clock },
    { clave: "Enviada", label: "Enviada", icono: Send },
    {
      clave: "Recibida",
      label: conDiferencia ? "Recibida con diferencia" : "Recibida",
      icono: conDiferencia ? TriangleAlert : PackageCheck,
      advertencia: conDiferencia,
    },
    { clave: "Cerrada", label: "Cerrada", icono: CheckCheck, cerrado: true },
  ];
  const estadoParaPaso = conDiferencia ? "Recibida" : oc?.estado;
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
      <Button variante="secundario" onClick={volver} className="w-fit text-xs print:hidden">
        ← Volver
      </Button>

      {isLoading ? (
        <p className="py-16 text-center text-sm text-piedra">Cargando…</p>
      ) : isError || !oc ? (
        <p className="py-16 text-center text-sm text-error">No se pudo cargar la orden de compra.</p>
      ) : (
        <>
          {/* Punto 8 — encabezado formal solo para impresión/PDF: reemplaza
              el header de pantalla (pensado para navegar la app, no para
              archivar) por uno con los datos que tiene que llevar una Orden
              de Compra real. Invisible en pantalla, visible solo al
              imprimir — mismo mecanismo que print:hidden, invertido. */}
          <div className="hidden print:block">
            <div className="mb-6 flex items-start justify-between border-b-2 border-tinta pb-4">
              <div>
                <p className="font-heading text-xl font-semibold">Holiday Inn</p>
                <p className="text-xs text-piedra">SGH · Gestión Hotelera</p>
              </div>
              <div className="text-right">
                <p className="font-heading text-lg font-semibold">Orden de Compra</p>
                <p className="font-mono text-sm">{oc.numero}</p>
                <p className="text-xs text-piedra">{new Date(oc.fecha).toLocaleDateString("es-AR")}</p>
                <p className="mt-1 text-xs text-piedra">Estado: {oc.estado}</p>
              </div>
            </div>
            <div className="mb-6 grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-piedra">Proveedor</p>
                <p className="font-semibold">{oc.proveedor?.razonSocial}</p>
                <p className="text-piedra">CUIT {oc.proveedor?.cuit}</p>
                <p className="text-piedra">Condición de pago: {oc.proveedor?.condicionComercial ?? "—"}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-piedra">Entregar en</p>
                <p className="font-semibold">{oc.deposito?.nombre}</p>
              </div>
            </div>
          </div>

          <div className="print:hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="flex items-center gap-2 font-heading text-[28px] font-semibold">
                <ShoppingCart size={22} className="text-pino" /> {oc.numero} · {oc.proveedor?.razonSocial}
              </h1>
              <div className="flex flex-none flex-wrap items-center gap-2">
                <Pildora variante={BADGE_ESTADO_OC[oc.estado] ?? "neutro"}>
                  {oc.estado === "Recibida con diferencia" && <TriangleAlert size={12} />} {oc.estado}
                </Pildora>
                {/* Punto 4 del rediseño: mismo texto de base, pero el tono
                    depende de si es esperable o no. Pendiente/Enviada: neutro,
                    todavía no le toca (el movimiento recién se crea al
                    registrar la recepción, HU-85). Recibida/Recibida con
                    diferencia sin movimiento: eso NO debería pasar nunca
                    (registrarRecepcion siempre lo crea en la misma
                    transacción) — si pasa, es un problema real de datos, se
                    marca en rojo en vez de repetir la misma pastilla neutra. */}
                {["Pendiente", "Enviada"].includes(oc.estado) ? (
                  <Pildora variante="neutro">Sin stock de entrada aún</Pildora>
                ) : (
                  ["Recibida", "Recibida con diferencia"].includes(oc.estado) &&
                  (oc.movimientos?.length ?? 0) === 0 && (
                    <Pildora variante="error">
                      <TriangleAlert size={11} /> Sin movimiento de stock — revisar
                    </Pildora>
                  )
                )}
                <Button variante="secundario" onClick={() => window.print()}>
                  <Printer size={15} /> Imprimir OC
                </Button>
              </div>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-1 font-body text-[12.5px] text-tinta/60">
              <span>Desde</span>
              {oc.presupuesto ? (
                <Link
                  to={`/presupuestos?requerimientoId=${oc.presupuesto.requerimientoId}`}
                  className="font-semibold text-pino underline decoration-pino/40 underline-offset-2 hover:text-pino-oscuro hover:decoration-pino-oscuro"
                >
                  PR-{String(oc.presupuestoId).padStart(4, "0")}
                </Link>
              ) : (
                <span>—</span>
              )}
              <span>adjudicado</span>
              {oc.presupuesto?.requerimiento && (
                <>
                  <span>· Requerimiento</span>
                  <Link
                    to={`/requerimientos/${oc.presupuesto.requerimiento.id}`}
                    className="font-semibold text-pino underline decoration-pino/40 underline-offset-2 hover:text-pino-oscuro hover:decoration-pino-oscuro"
                  >
                    REQ-{String(oc.presupuesto.requerimiento.id).padStart(4, "0")}
                  </Link>
                </>
              )}
              <span>
                {" · $ "}
                {formatearMonto(Number(oc.montoTotal) + Number(oc.flete || 0))}
                {" · "}
                {new Date(oc.fecha).toLocaleDateString("es-AR")}
              </span>
            </p>
          </div>

          {oc.estado === "Anulada" && oc.motivoAnulacion && (
            <p className="rounded-md bg-error-suave px-3.5 py-2.5 text-[12.5px] text-error-texto">
              <strong>Motivo de anulación:</strong> {oc.motivoAnulacion}
            </p>
          )}

          <div className="print:hidden">
            <PasoAPaso pasos={pasosOC} pasoActual={pasoActualOC} pasoAlternativo={pasoAlternativo} />
          </div>

          <div className="rounded-[18.4px] bg-white px-7 py-6 print:px-0 print:py-0">
            <div className="mb-5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/55 print:hidden">
              <Lock size={12} /> Estos datos vienen del presupuesto adjudicado y no se pueden modificar acá
            </div>

            <div className="mb-5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2 print:hidden">
              <div>
                <span className="text-tinta/55">CUIT:</span> <span className="text-tinta">{oc.proveedor?.cuit}</span>
              </div>
              <div>
                <span className="text-tinta/55">Depósito de entrega:</span> <span className="text-tinta">{oc.deposito?.nombre}</span>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-borde print:border-0">
              <Table
                columnas={
                  mostrarRecibido
                    ? ["Artículo", "Cantidad", "Precio unitario", "Subtotal", "Recibido"]
                    : ["Artículo", "Cantidad", "Precio unitario", "Subtotal"]
                }
                columnasDerecha={
                  mostrarRecibido
                    ? ["Cantidad", "Precio unitario", "Subtotal", "Recibido"]
                    : ["Cantidad", "Precio unitario", "Subtotal"]
                }
                columnasOcultarImprimir={mostrarRecibido ? ["Recibido"] : []}
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
                      <td className="px-3 py-3">
                        <NombreClave title={d.articulo?.nombre}>{d.articulo?.nombre}</NombreClave>
                      </td>
                      <td className="px-3 py-3 text-right font-body text-[13px] text-tinta">
                        {Number(d.cantidad)} <span className="text-tinta/55">{d.articulo?.unidadMedida}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-[12.5px] text-piedra">
                        $ {formatearMonto(d.precioUnitario)}
                      </td>
                      <td className="px-3 py-3 text-right font-heading text-[14px] font-semibold text-tinta">
                        $ {formatearMonto(subtotal)}
                      </td>
                      {mostrarRecibido && (
                        <td
                          className={`px-3 py-3 text-right font-body text-[13px] print:hidden ${huboDiferencia ? "font-semibold text-laton-700" : "text-tinta/55"}`}
                        >
                          {d.cantidadRecibida === null || d.cantidadRecibida === undefined ? "—" : Number(d.cantidadRecibida)}
                        </td>
                      )}
                    </tr>
                  );
                }}
              />
            </div>

            {/* Puntos 6 y 7 del rediseño: un solo bloque con fondo — antes
                Flete flotaba como texto suelto sin fondo mientras Total OC sí
                lo tenía, dos tratamientos distintos para un mismo resumen. El
                ícono de camión también salió: ninguna otra fila de la tabla
                (ni Total) usa íconos, así que era la única inconsistencia. El
                destaque fuerte queda solo para el total (Cifra + semibold),
                Flete es una línea más chica arriba, separada por un borde. */}
            <div className="mt-4 overflow-hidden rounded-lg bg-hueso">
              {oc.flete != null && (
                <div className="flex items-center justify-between gap-3 border-b border-borde/70 px-3.5 py-2.5 text-[13px] text-tinta/70">
                  <span>Flete</span>
                  <span className="font-mono">$ {formatearMonto(oc.flete)}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 px-3.5 py-3">
                <span className="font-body text-[13px] font-semibold text-tinta">Total OC</span>
                <Cifra tamano={22} className="text-tinta">
                  $ {formatearMonto(Number(oc.montoTotal) + Number(oc.flete || 0))}
                </Cifra>
              </div>
            </div>
          </div>

          {(puedeEnviar || puedeRecibir || puedeAnular) && (
            <div className="flex flex-col gap-4 print:hidden">
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
                // Punto 9 del rediseño: primaria (siguiente paso lógico del
                // circuito) a la izquierda, Anular — destructiva — separada a
                // la derecha, nunca pegada a la que hace avanzar la OC.
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap gap-2.5">
                    {puedeRecibir && (
                      <Button variante="ok" onClick={() => navigate(`/ordenes-compra/${oc.id}/recepcion`)}>
                        <PackageCheck size={16} /> Registrar recepción de mercadería
                      </Button>
                    )}
                    {puedeEnviar && (
                      <Button variante="secundario" onClick={() => setConfirmarAccion("enviar")}>
                        Marcar como enviada
                      </Button>
                    )}
                  </div>
                  {puedeAnular && (
                    <Button variante="baja" onClick={() => setAnulando(true)}>
                      Anular Orden de Compra
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="print:hidden">
            <span className="text-[11px] font-semibold tracking-wide text-piedra uppercase">Auditoría</span>
            <div className="relative mt-4 flex flex-col gap-4 pl-5">
              {/* Punto 8 del rediseño: la línea ya existía acá, pero `bg-borde`
                  es negro al 13% de opacidad — a 1px de ancho, prácticamente
                  invisible contra el fondo blanco (no era un bug de posición,
                  era de contraste). `bg-piedra/25` a 1.5px la hace legible sin
                  que compita con los puntos. */}
              <div className="absolute bottom-1.5 left-[5px] top-1.5 w-[1.5px] bg-piedra/25" />
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
