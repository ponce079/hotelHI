import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Truck, History, Check } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import {
  listarMovimientos,
  confirmarRecepcion,
  marcarDiferenciaRevisada,
  pedirFaltantesPorDiferencia,
} from "../movimientos/movimientos.api";
import { listarOrdenesCompra, marcarDiferenciaRevisadaOC } from "../ordenes-compra/ordenesCompra.api";
import { listarDepositos } from "../depositos/depositos.api";
import { AjusteModal } from "../comprobantes/AjusteModal";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";
import { MOTIVOS_RESOLUCION_DIFERENCIA, MOTIVOS_RESOLUCION_DIFERENCIA_OC } from "../../lib/constantes";

// Recuerda el último depósito elegido en este navegador para filtrar esta
// pantalla — mismo criterio que RequerimientoModal (CLAVE_ULTIMO_DEPOSITO):
// nunca se matchea automático contra Deposito.responsable (frágil, describe
// a la persona a cargo, no es una credencial de sesión). El sistema todavía
// no tiene usuarios reales, así que esto es una comodidad de UX por
// navegador, no una relación de datos — no hay nada que desarmar el día que
// haya login de verdad. Clave propia (no la de requerimientos): acá filtra
// una pantalla completa mientras dure la sesión del navegador, no default de
// un formulario puntual. "" (cadena vacía) es un valor válido acá — significa
// "Todos los depósitos", no "todavía no elegido": el filtro nunca bloquea la
// pantalla, así que no hace falta distinguir esos dos casos.
const CLAVE_DEPOSITO_RECEPCIONES = "sgh_deposito_recepciones";

export function RecepcionesPage() {
  const { puede, usuario } = useSesion();
  const navigate = useNavigate();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const [recibidos, setRecibidos] = useState({}); // movId -> { articuloId: valorString }
  const [paraConfirmar, setParaConfirmar] = useState(null); // movimiento en tránsito
  const [motivoPorMov, setMotivoPorMov] = useState({}); // movId -> motivoResolucion elegido
  const [motivoPorOC, setMotivoPorOC] = useState({}); // ocId -> motivoResolucion elegido
  const [ajusteParaFactura, setAjusteParaFactura] = useState(null); // comprobanteId de la factura para la NC tardía

  // Quién puede accionar es un permiso, no depende de qué depósito estás
  // mirando: recibirOC/operar deciden si aparecen los botones, el selector
  // de depósito de abajo decide solo QUÉ ves, nunca si podés actuar.
  const puedeAccionarTransferencias = puede("operar");
  const puedeAccionarOC = puede("recibirOC");
  // Resolver la diferencia de una OC (Nota de Crédito / reposición al
  // proveedor / aceptarla) es una decisión de facturación — mismo rol que
  // registrarComprobante, no recibirOC (eso es "confirmar que llegó la
  // mercadería", una cosa de depósito, no de plata).
  const puedeResolverDiferenciaOC = puede("resolverDiferenciaOC");
  // Cargar la Nota de Crédito tardía (botón de la subsección "Con
  // diferencia") es un alta de comprobante — mismo permiso que
  // ComprobantesPage, no resolverDiferenciaOC.
  const puedeRegistrarComprobante = puede("registrarComprobante");
  const esSoloLectura = !puedeAccionarTransferencias && !puedeAccionarOC && !puedeResolverDiferenciaOC;

  // Default "Todos" (cadena vacía) para cualquier rol — ya no es un
  // comportamiento exclusivo de compras/gerente, es la opción de arranque
  // del selector para todos. Un depósito puntual solo se aplica si el
  // usuario lo elige (y entonces se recuerda para la próxima visita).
  const [depositoId, setDepositoId] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_DEPOSITO_RECEPCIONES) ?? "";
    } catch {
      return "";
    }
  });

  function elegirDeposito(valor) {
    setDepositoId(valor);
    try {
      // "Todos" (valor "") también se guarda explícitamente — si no, la
      // próxima visita no podría distinguir "eligió Todos" de "todavía no
      // eligió nada", y ambos casos ya se comportan distinto solo por el
      // valor por default del useState de arriba, no por presencia en storage.
      localStorage.setItem(CLAVE_DEPOSITO_RECEPCIONES, valor);
    } catch {
      // localStorage puede fallar (privado/bloqueado) — se pierde solo la
      // comodidad de recordarlo, no bloquea el filtro de esta sesión.
    }
  }

  const { data: depositos } = useQuery({
    queryKey: ["depositos"],
    queryFn: listarDepositos,
  });

  const { data: ocsPendientes, isLoading: cargandoOCs } = useQuery({
    queryKey: ["ordenes-compra", "pendientes-recepcion", { depositoId }],
    queryFn: () => listarOrdenesCompra({ estado: "Enviada", pageSize: 100, ...(depositoId ? { depositoId } : {}) }),
  });

  // "Recibida con diferencia" ya es un estado real de OrdenCompra (lo pone
  // registrarRecepcion cuando algo llegó de menos) — no hace falta ningún
  // endpoint nuevo, solo pedirle a listarOCs el detalle por artículo
  // (incluirDetalle, opt-in) para poder mostrar enviado/recibido acá.
  const { data: ocsConDiferencia } = useQuery({
    queryKey: ["ordenes-compra", "con-diferencia", { depositoId }],
    queryFn: () =>
      listarOrdenesCompra({
        estado: "Recibida con diferencia",
        pageSize: 50,
        incluirDetalle: true,
        ...(depositoId ? { depositoId } : {}),
      }),
  });
  // Mismo criterio que conDiferencia (transferencias, más abajo): una vez
  // revisada sale de la subsección activa por este filtro, no porque el
  // estado de la OC cambie — sigue "Recibida con diferencia" para siempre.
  const ocsConDiferenciaActivas = (ocsConDiferencia?.items ?? []).filter((oc) => !oc.diferenciaRevisada);

  const { data: enTransito, isLoading } = useQuery({
    queryKey: ["movimientos", { estado: "En tránsito", destinoId: depositoId }],
    queryFn: () => listarMovimientos({ estado: "En tránsito", ...(depositoId ? { destinoId: depositoId } : {}) }),
  });
  const { data: conDiferenciaRaw } = useQuery({
    queryKey: ["movimientos", { estado: "Con diferencia", destinoId: depositoId }],
    queryFn: () => listarMovimientos({ estado: "Con diferencia", ...(depositoId ? { destinoId: depositoId } : {}) }),
  });
  // Una vez marcada como revisada (a mano o por el atajo "Pedir los N
  // faltantes"), sale de acá — el estado del movimiento no cambia
  // (sigue siendo "Con diferencia" para siempre, es historial real), así
  // que lo que la saca de la subsección activa es este filtro, no una
  // consulta distinta. HistorialRecepcionesPage la sigue listando igual.
  const conDiferencia = (conDiferenciaRaw ?? []).filter((m) => m.depositoDestinoId && !m.diferenciaRevisada);

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

  const mutacionRevisar = useMutation({
    mutationFn: ({ id, motivoResolucion }) => marcarDiferenciaRevisada(id, { motivoResolucion, usuario }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      mostrarToast(`Diferencia de MOV-${String(variables.id).padStart(4, "0")} marcada como revisada.`);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo marcar la diferencia como revisada.");
    },
  });

  const mutacionPedirFaltantes = useMutation({
    mutationFn: (id) => pedirFaltantesPorDiferencia(id, { usuario }),
    onSuccess: (requerimiento, id) => {
      queryClient.invalidateQueries({ queryKey: ["movimientos"] });
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      mostrarToast(`Se generó REQ-${String(requerimiento.id).padStart(4, "0")} por la diferencia de MOV-${String(id).padStart(4, "0")}.`);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo generar el pedido de los faltantes.");
    },
  });

  const mutacionRevisarOC = useMutation({
    mutationFn: ({ id, motivoResolucion }) => marcarDiferenciaRevisadaOC(id, { motivoResolucion, usuario }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
      mostrarToast(`Diferencia de ${variables.numero ?? "la OC"} marcada como revisada.`);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo marcar la diferencia como revisada.");
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

  // Mismo cálculo que diferenciaDe (arriba) pero sobre OrdenCompraDetalle
  // (cantidad/cantidadRecibida) en vez de MovimientoStockDetalle
  // (cantidad/cantidadRecibida también, pero otro modelo) — no comparten
  // shape as-is, así que es una función aparte en vez de generalizar una
  // sola con condicionales.
  function diferenciaDeOC(linea) {
    const recibida = linea.cantidadRecibida != null ? Number(linea.cantidadRecibida) : 0;
    const dif = Number(linea.cantidad) - recibida;
    return dif > 0 ? dif : 0;
  }

  // Total de unidades faltantes de un movimiento YA confirmado "Con
  // diferencia" (para el label de "Pedir los N faltantes") — no
  // reusa difTotalDe/valorDe porque esas leen del estado `recibidos` del
  // formulario de confirmación (arriba, para "Pendientes de confirmar"),
  // que estos movimientos ya no tienen: acá cantidadRecibida es un dato ya
  // guardado, no algo que el usuario esté tipeando ahora.
  function faltanteTotalConfirmado(mov) {
    return mov.detalleMovimientos.reduce((acc, l) => {
      const recibido = l.cantidadRecibida != null ? Number(l.cantidadRecibida) : Number(l.cantidad);
      const dif = Number(l.cantidad) - recibido;
      return acc + (dif > 0 ? dif : 0);
    }, 0);
  }

  // La única Factura activa de la OC, si ya se cargó una — para el caso de
  // Nota de Crédito tardía: el proveedor la manda días después, sin
  // diferencia resuelta en ese momento. Se resuelve con el mismo mini-
  // formulario de ajuste que "+ Agregar otro ajuste" en el alta de factura,
  // pre-vinculado a este comprobanteId (ver AjusteModal).
  function facturaVinculada(oc) {
    return (oc.comprobantes ?? []).find((c) => c.tipo === "Factura" && !c.anulado) ?? null;
  }

  if (!puede("verRecepciones")) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
            <PackageCheck size={22} className="text-pino" /> Recepciones
          </h1>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
            HU 14, 17 y 85 — recepción de compra al proveedor y de transferencias entre depósitos
          </p>
        </div>
        {/* Historial (Recibida/Cerrada, Confirmado) vive aparte a propósito
            (punto 3 del rediseño): esta pantalla es para lo que necesita
            acción o revisión, no un archivo de todo lo que ya se resolvió. */}
        <Link
          to="/recepciones/historial"
          className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-pino hover:text-pino-oscuro"
        >
          <History size={15} /> Ver historial de recepciones
        </Link>
      </div>

      <div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="w-64">
            <Select label="Depósito" value={depositoId} onChange={(e) => elegirDeposito(e.target.value)}>
              <option value="">Todos los depósitos</option>
              {(depositos ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.nombre}</option>
              ))}
            </Select>
          </div>
          <p className="max-w-[420px] text-[11.5px] text-piedra">
            {depositoId
              ? "Mostrando solo lo pendiente de este depósito."
              : "Mostrando lo pendiente de todos los depósitos."}{" "}
            Se recuerda en este navegador — cambialo acá cuando quieras.
          </p>
        </div>
        {esSoloLectura && (
          <p className="mt-2 text-[12px] text-tinta/60">
            Vista de solo lectura para tu rol — podés ver el estado, pero no confirmar recepciones.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col rounded-[18px] border-t-[3px] border-pino bg-pino/6 shadow-[0_1px_2px_rgba(46,43,37,0.14)]">
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
          <PackageCheck size={18} className="text-pino" />
          <h2 className="font-heading text-[20px] font-semibold">Recepción de proveedor</h2>
          <Badge variante="alerta">{ocsPendientes?.total ?? 0}</Badge>
        </div>
        <div className="flex flex-col gap-2.5 px-5 pb-5">
        {cargandoOCs && <p className="text-sm text-piedra">Cargando…</p>}
        {!cargandoOCs && (ocsPendientes?.items?.length ?? 0) === 0 && (
          <div className="rounded-[18.4px] bg-white p-6">
            <p className="m-0 text-sm">No hay órdenes de compra esperando recepción.</p>
          </div>
        )}
          {ocsPendientes?.items?.map((oc) => (
            <button
              key={oc.id}
              type="button"
              disabled={!puedeAccionarOC}
              onClick={() => puedeAccionarOC && navigate(`/ordenes-compra/${oc.id}/recepcion`)}
              className={`flex w-full flex-wrap items-center gap-4 rounded-[18.4px] bg-white px-6 py-4 text-left shadow-[0_1px_2px_rgba(46,43,37,0.14)] ${
                puedeAccionarOC ? "cursor-pointer hover:shadow-md" : "cursor-default"
              }`}
            >
              <span className="font-mono text-[12.5px]">{oc.numero}</span>
              <span className="font-body text-[13.5px] font-semibold">{oc.proveedor?.razonSocial}</span>
              {!depositoId && <Badge variante="neutro">{oc.deposito?.nombre}</Badge>}
              <span className="ml-auto font-body text-[12.5px] text-tinta/60">
                Enviada {new Date(oc.fecha).toLocaleDateString("es-AR")}
              </span>
            </button>
          ))}

          {/* Con diferencia (OC ya recibida, pero llegó de menos): solo se
              muestra si hay alguna — a diferencia de las listas de arriba,
              esto es una alerta puntual dentro del alcance de la columna,
              no parte de su estructura fija. */}
          {ocsConDiferenciaActivas.length > 0 && (
            <div className="mt-1 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-[14px] font-semibold text-laton-700">Con diferencia</h3>
                <Badge variante="alerta">{ocsConDiferenciaActivas.length}</Badge>
              </div>
              {ocsConDiferenciaActivas.map((oc) => {
                const factura = facturaVinculada(oc);
                return (
                  <div key={oc.id} className="flex flex-col gap-2 rounded-[16px] bg-laton-100 px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-[12.5px] text-laton-700">{oc.numero}</span>
                      <span className="font-body text-[13px] font-semibold text-laton-700">{oc.proveedor?.razonSocial}</span>
                      {!depositoId && (
                        <span className="font-body text-[12px] text-laton-700/70">{oc.deposito?.nombre}</span>
                      )}
                      <span className="ml-auto font-body text-[12px] text-laton-700/70">
                        Recibida {oc.fechaRecibida ? new Date(oc.fechaRecibida).toLocaleDateString("es-AR") : "—"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 border-t border-laton-300 pt-2">
                      {(oc.detalle ?? [])
                        .filter((linea) => diferenciaDeOC(linea) > 0)
                        .map((linea) => (
                          <div key={linea.articuloId} className="flex flex-wrap items-baseline gap-3 font-body text-[12.5px] text-laton-700">
                            <span className="min-w-[180px] font-semibold">{linea.articulo?.nombre}</span>
                            <span>enviado {Number(linea.cantidad)}</span>
                            <span>recibido {linea.cantidadRecibida != null ? Number(linea.cantidadRecibida) : 0}</span>
                            <span className="font-semibold">faltan {diferenciaDeOC(linea)}</span>
                          </div>
                        ))}
                    </div>
                    <p className="border-t border-laton-300 pt-2 font-body text-[12px] text-laton-700/80">
                      {factura ? (
                        <>
                          Nota de crédito pendiente de cargar — Comprobante <strong>{factura.numero}</strong>.{" "}
                          {puedeRegistrarComprobante ? (
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setAjusteParaFactura(factura.id)}
                            >
                              Cargar nota de crédito
                            </button>
                          ) : (
                            <>Andá a <Link to="/comprobantes" className="underline">Comprobantes</Link>.</>
                          )}
                        </>
                      ) : (
                        "Todavía no hay ningún comprobante cargado para esta orden de compra."
                      )}
                    </p>
                    {puedeResolverDiferenciaOC && (
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="w-60">
                          <Select
                            value={motivoPorOC[oc.id] ?? ""}
                            onChange={(e) => setMotivoPorOC((prev) => ({ ...prev, [oc.id]: e.target.value }))}
                            className="!py-1.5 !text-[12.5px]"
                          >
                            <option value="">Motivo…</option>
                            {MOTIVOS_RESOLUCION_DIFERENCIA_OC.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </Select>
                        </div>
                        <Button
                          variante="secundario"
                          disabled={!motivoPorOC[oc.id] || mutacionRevisarOC.isPending}
                          onClick={() => mutacionRevisarOC.mutate({ id: oc.id, motivoResolucion: motivoPorOC[oc.id], numero: oc.numero })}
                          icono={Check}
                        >
                          Marcar como revisado
                        </Button>
                        {/* Auditoría de botones, P3.2: era laton-700, el
                            único de los cinco links "ir a X" con un color
                            distinto de los otros cuatro sin motivo. */}
                        <Link
                          to="/requerimientos"
                          className="ml-auto font-body text-[12.5px] text-piedra hover:text-tinta underline"
                        >
                          Pedir reposición al proveedor →
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col rounded-[18px] border-t-[3px] border-laton bg-laton/6 shadow-[0_1px_2px_rgba(46,43,37,0.14)]">
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
          <Truck size={18} className="text-laton" />
          <h2 className="font-heading text-[20px] font-semibold">Recepción de transferencia</h2>
        </div>
        <div className="px-5 pb-5">
        <p className="mb-4 text-[13px] text-tinta/70">
          Toda transferencia queda <strong>en tránsito</strong> hasta que el depósito destino la confirma. Quien recibe declara
          la cantidad que realmente llegó: si difiere de la enviada, el sistema registra la diferencia y la deja visible para
          los dos depósitos.
        </p>

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
                    {mov.usuario === "sistema"
                      ? " — repuesto automáticamente"
                      : mov.usuario
                        ? ` por ${mov.usuario}`
                        : ""}
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
                {puedeAccionarTransferencias && (
                  <div className="flex justify-end gap-2.5">
                    <Button variante="secundario" onClick={() => recibirTodo(mov)}>
                      Recibí todo
                    </Button>
                    <Button variante="ok" onClick={() => setParaConfirmar(mov)} icono={Check}>
                      Confirmar recepción
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Con diferencia (transferencia ya confirmada, pero llegó de menos):
          mismo criterio que el de la columna de proveedor — alerta puntual
          dentro del alcance de la columna, no una sección fija; oculta si
          no hay ninguna. Tinte dorado (mismo "necesita revisión" que ya usa
          PasoAPaso para "Recibida con diferencia"), no rojo de error: la
          transferencia ya se resolvió, no está bloqueada ni rota. */}
      {conDiferencia.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-[14px] font-semibold text-laton-700">Con diferencia</h3>
            <Badge variante="alerta">{conDiferencia.length}</Badge>
          </div>
          {conDiferencia.map((mov) => (
            <div key={mov.id} className="flex flex-col gap-2 rounded-[16px] bg-laton-100 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[12.5px] text-laton-700">
                  MOV-{String(mov.id).padStart(4, "0")}
                  {mov.movimientoRelacionadoId ? ` ⇄ MOV-${String(mov.movimientoRelacionadoId).padStart(4, "0")}` : ""}
                </span>
                <span className="font-body text-[12.5px] font-semibold text-laton-700">
                  {mov.deposito.nombre} → {mov.depositoDestino?.nombre}
                </span>
                <span className="ml-auto font-body text-[12px] text-laton-700/70">
                  Confirmó {mov.depositoDestino?.responsable} · {new Date(mov.fecha).toLocaleDateString("es-AR")}
                </span>
              </div>
              <div className="flex flex-col gap-1 border-t border-laton-300 pt-2">
                {mov.detalleMovimientos
                  .filter((l) => l.cantidadRecibida != null && Number(l.cantidadRecibida) < Number(l.cantidad))
                  .map((l) => (
                    <div key={l.articuloId} className="flex flex-wrap items-baseline gap-3 font-body text-[12.5px] text-laton-700">
                      <span className="min-w-[180px] font-semibold">{l.articulo.nombre}</span>
                      <span>enviado {l.cantidad}</span>
                      <span>recibido {l.cantidadRecibida}</span>
                      <span className="font-semibold">faltan {Number(l.cantidad) - Number(l.cantidadRecibida)}</span>
                    </div>
                  ))}
              </div>
              {puedeAccionarTransferencias && (
                <div className="flex flex-wrap items-center gap-2.5 border-t border-laton-300 pt-2.5">
                  <div className="w-56">
                    <Select
                      value={motivoPorMov[mov.id] ?? ""}
                      onChange={(e) => setMotivoPorMov((prev) => ({ ...prev, [mov.id]: e.target.value }))}
                      className="!py-1.5 !text-[12.5px]"
                    >
                      <option value="">Motivo…</option>
                      {MOTIVOS_RESOLUCION_DIFERENCIA.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    variante="secundario"
                    disabled={!motivoPorMov[mov.id] || mutacionRevisar.isPending}
                    onClick={() => mutacionRevisar.mutate({ id: mov.id, motivoResolucion: motivoPorMov[mov.id] })}
                    icono={Check}
                  >
                    Marcar como revisado
                  </Button>
                  <Button
                    variante="secundario"
                    disabled={mutacionPedirFaltantes.isPending}
                    onClick={() => mutacionPedirFaltantes.mutate(mov.id)}
                    className="ml-auto"
                  >
                    Pedir los {faltanteTotalConfirmado(mov)} faltantes
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
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
        icono={Check}
        onCancelar={() => setParaConfirmar(null)}
        onConfirmar={confirmar}
      />

      {ajusteParaFactura && (
        <AjusteModal
          comprobanteId={ajusteParaFactura}
          onClose={() => setAjusteParaFactura(null)}
          onExito={(mensaje) => {
            setAjusteParaFactura(null);
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
