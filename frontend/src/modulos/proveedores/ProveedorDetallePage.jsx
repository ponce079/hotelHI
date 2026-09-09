import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Building2, Pencil } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { ProveedorModal } from "./ProveedorModal";
import { obtenerProveedor, listarOrdenesCompraDeProveedor } from "./proveedores.api";
import { obtenerCuentaCorrienteDeProveedor } from "../cuenta-corriente/cuentaCorriente.api";
import { diasDesde, variantePorAntiguedad, rutaDeMovimiento, esMovimientoDePago } from "../cuenta-corriente/cuentaCorriente.constantes";
// Mismo mapeo que Pagos/Cuenta Corriente para el estado de una orden de
// pago (ver comentario en CuentaCorrientePage.jsx) — un "Pago" en esta
// mini-tabla tiene que verse igual que en las otras dos pantallas.
import { BADGE_ESTADO } from "../pagos/pagos.constantes";
import { OrdenPagoDetalleModal } from "../pagos/OrdenPagoDetalleModal";
import { formatearMonto } from "../../lib/moneda";
import { formatearTimestamp, formatearFechaComprobante } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";

// Estados de OrdenCompra — los define el módulo de Órdenes de Compra
// (Gimena/Ricardo). Acá solo se pintan, no se transicionan.
const VARIANTE_ESTADO_OC = {
  Pendiente: "alerta",
  Aprobada: "alerta",
  Enviada: "alerta",
  Recibida: "ok",
  "Recibida con diferencia": "error",
  Cerrada: "ok",
  Anulada: "neutro",
};

// Mismo fondo sólido que ya usa el KPI de "Saldo total adeudado" en
// CuentaCorrientePage, pero coloreado según la antigüedad del comprobante
// impago más viejo — así el número más importante de la pestaña avisa por
// sí solo si esta deuda es reciente o ya se está poniendo vieja.
const FONDO_POR_VARIANTE_SALDO = { ok: "bg-pino", alerta: "bg-laton-600", error: "bg-error" };

const TABS = [
  { clave: "datos", label: "Datos generales" },
  { clave: "ordenes", label: "Historial de OC" },
  { clave: "ctacte", label: "Cuenta corriente" },
];

export function ProveedorDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  // La pestaña vive en la URL (no en un useState) para que "volver" desde
  // la ficha de una OC (Historial de OC -> click en una fila) restaure la
  // misma pestaña en vez de reiniciar en "Datos generales".
  const tabParam = searchParams.get("tab");
  const tab = TABS.some((t) => t.clave === tabParam) ? tabParam : "datos";
  const [sort, setSort] = useState("fecha");
  const [editando, setEditando] = useState(false);
  const [verOrdenPagoId, setVerOrdenPagoId] = useState(null);

  function cambiarTab(clave) {
    const params = new URLSearchParams(searchParams);
    if (clave === "datos") params.delete("tab");
    else params.set("tab", clave);
    setSearchParams(params, { replace: true });
  }

  const { data: proveedor, isLoading, isError } = useQuery({
    queryKey: ["proveedor", id],
    queryFn: () => obtenerProveedor(id),
  });

  const { data: ordenes } = useQuery({
    queryKey: ["proveedor-ordenes", id, sort],
    queryFn: () => listarOrdenesCompraDeProveedor(id, { sort }),
    enabled: tab === "ordenes",
  });

  // La cuenta corriente es del módulo de Gimena/Ricardo (HU-80): se
  // consume su endpoint tal cual, no se recalcula nada acá.
  const { data: ctaCte, isError: errorCtaCte } = useQuery({
    queryKey: ["cuenta-corriente", id],
    queryFn: () => obtenerCuentaCorrienteDeProveedor(id),
    enabled: tab === "ctacte",
  });

  if (!puede("abmProveedor")) return <SinPermiso />;
  if (isLoading) return <p className="text-sm text-piedra">Cargando proveedor…</p>;
  if (isError || !proveedor) return <p className="text-sm text-error">No se pudo cargar el proveedor.</p>;

  // La antigüedad se aproxima con la fecha del primer comprobante con
  // "debe" > 0 en el historial (mismo criterio y misma limitación que
  // CuentaCorrientePage: no hay forma de saber a qué factura puntual
  // afectó cada pago/nota, así que es una referencia, no una fecha exacta
  // de vencimiento).
  const primerComprobantePendiente = ctaCte?.movimientos?.find((m) => m.debe > 0) ?? null;
  const antiguedadDias = primerComprobantePendiente ? diasDesde(primerComprobantePendiente.fecha) : null;
  const hayDeuda = (ctaCte?.saldoTotal ?? 0) > 0;
  const varianteSaldo = hayDeuda && antiguedadDias !== null ? variantePorAntiguedad(antiguedadDias) : "ok";
  const ultimosMovimientos = [...(ctaCte?.movimientos ?? [])].slice(-5).reverse();

  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* Auditoría de botones, P2.2: "Volver" es navegación de bajo
            compromiso — mismo componente que el resto de las pantallas de
            detalle, ya no un <button> aparte con su propio estilo. */}
        <Button variante="fantasma" onClick={() => navigate("/proveedores")} className="mb-2 w-fit text-xs">
          <ArrowLeft size={15} /> Volver a proveedores
        </Button>
        <h1 className="flex flex-wrap items-center gap-2.5 font-heading text-[34px] font-semibold">
          <Building2 size={24} className="text-pino" /> {proveedor.razonSocial}
          <Badge variante={proveedor.activo ? "ok" : "neutro"}>{proveedor.activo ? "Activo" : "Inactivo"}</Badge>
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          {proveedor.cuit} · HU-21 — ficha e historial de compras
        </p>
      </div>

      <div className="flex gap-1 border-b border-borde">
        {TABS.map((t) => (
          <button
            key={t.clave}
            type="button"
            onClick={() => cambiarTab(t.clave)}
            className={`cursor-pointer border-b-2 px-4 py-2 font-body text-[13px] font-semibold transition-colors ${
              tab === t.clave ? "border-pino text-tinta" : "border-transparent text-tinta/55 hover:text-tinta"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "datos" && (
        <div className="relative rounded-lg border border-borde bg-white p-6">
          <button
            type="button"
            onClick={() => setEditando(true)}
            title="Editar datos del proveedor"
            className="absolute right-5 top-5 cursor-pointer rounded-md p-1.5 text-piedra hover:bg-hueso hover:text-tinta"
          >
            <Pencil size={16} />
          </button>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Dato etiqueta="Razón social" valor={proveedor.razonSocial} />
            <Dato etiqueta="CUIT" valor={proveedor.cuit} mono />
            <Dato etiqueta="Condición comercial" valor={proveedor.condicionComercial} />
            <Dato etiqueta="Contacto" valor={proveedor.contacto} />
            <Dato etiqueta="Email" valor={proveedor.email} />
            <Dato etiqueta="Teléfono" valor={proveedor.telefono} />
            <div className="sm:col-span-2">
              <Dato etiqueta="Domicilio" valor={proveedor.direccion} />
            </div>
          </div>

          <div className="mt-6 border-t border-borde pt-4">
            <div className="text-[11px] uppercase tracking-wide text-tinta/55">Rubros</div>
            <div className="mt-1.5 flex flex-wrap gap-[7px]">
              {proveedor.rubros.map((r) => (
                <span key={r.id} className="rounded-full border border-tinta/20 px-3 py-[5px] text-xs text-tinta">
                  {r.rubro}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "ordenes" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11.5px] text-piedra">Ordenar por:</span>
            <div className="inline-flex overflow-hidden rounded-full border border-borde">
              {[
                { valor: "fecha", label: "Fecha" },
                { valor: "monto", label: "Monto" },
              ].map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => setSort(o.valor)}
                  className={`cursor-pointer px-4 py-1.5 text-[12.5px] font-medium ${
                    sort === o.valor ? "bg-pino text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {ordenes && (
              <div className="ml-auto text-right">
                <div className="text-[10px] uppercase tracking-wide text-tinta/55">Total comprado</div>
                <Cifra tamano={21}>$ {formatearMonto(ordenes.totalComprado)}</Cifra>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-borde bg-white p-5">
            <Table
              columnas={["Número", "Fecha", "Depósito", "Estado", "Monto"]}
              columnasDerecha={["Monto"]}
              filas={ordenes?.items ?? []}
              vacio="Este proveedor todavía no tiene órdenes de compra."
              renderFila={(oc) => (
                <tr
                  key={oc.id}
                  onClick={() => navigate(`/ordenes-compra/${oc.id}`)}
                  className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
                >
                  <td className="px-3 py-2 font-mono text-xs">{oc.numero}</td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{formatearTimestamp(oc.fecha)}</td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{oc.deposito?.nombre ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variante={VARIANTE_ESTADO_OC[oc.estado] ?? "neutro"}>{oc.estado}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-heading text-[14px]">
                    $ {formatearMonto(Number(oc.montoTotal) + Number(oc.flete ?? 0))}
                  </td>
                </tr>
              )}
            />
          </div>
          <p className="text-xs text-piedra">
            El total comprado excluye las órdenes anuladas e incluye el flete cuando corresponde.
          </p>
        </div>
      )}

      {tab === "ctacte" && (
        <div className="flex flex-col gap-4">
          {errorCtaCte && (
            <div className="rounded-lg border border-borde bg-white p-6">
              <p className="text-sm text-piedra">
                No se pudo cargar la cuenta corriente. Puede que este proveedor todavía no tenga comprobantes cargados.
              </p>
            </div>
          )}
          {ctaCte && (
            <>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className={`flex flex-col gap-1 rounded-[18.4px] px-5 py-4 text-hueso ${FONDO_POR_VARIANTE_SALDO[varianteSaldo]}`}>
                  <span className="text-[11px] tracking-wide text-hueso/60 uppercase">Saldo adeudado</span>
                  <Cifra tamano={30} className="text-hueso">$ {formatearMonto(ctaCte.saldoTotal ?? 0)}</Cifra>
                  <span className="text-[11.5px] text-hueso/70">
                    {hayDeuda
                      ? `Comprobante más antiguo: hace ${antiguedadDias} día${antiguedadDias === 1 ? "" : "s"}`
                      : "Sin saldo pendiente"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 rounded-[18.4px] bg-white px-5 py-4">
                  <span className="text-[11px] tracking-wide text-piedra uppercase">Movimientos</span>
                  <Cifra tamano={30} className="text-tinta">{ctaCte.movimientos?.length ?? 0}</Cifra>
                  <span className="text-[11.5px] text-piedra">registrados en todo el historial</span>
                </div>
              </div>

              <div className="rounded-lg border border-borde bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-piedra">Últimos movimientos</span>
                  <Link
                    to={`/cuenta-corriente?proveedorId=${proveedor.id}`}
                    className="text-[12.5px] font-semibold text-pino hover:underline"
                  >
                    Ver todo con filtros →
                  </Link>
                </div>
                <Table
                  columnas={["Fecha", "Tipo", "N°", "Estado", "Importe"]}
                  columnasDerecha={["Importe"]}
                  filas={ultimosMovimientos}
                  vacio="Todavía no hay movimientos registrados."
                  renderFila={(m) => (
                    <tr
                      key={`${m.tipo}-${m.numero}-${m.fecha}`}
                      onClick={() => (esMovimientoDePago(m) ? setVerOrdenPagoId(m.id) : navigate(rutaDeMovimiento(m)))}
                      className="cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
                    >
                      <td className="px-3 py-2 font-body text-[12.5px]">{formatearFechaComprobante(m.tipo, m.fecha)}</td>
                      <td className="px-3 py-2 font-body text-[12.5px] text-tinta/70">{m.tipo}</td>
                      <td className="px-3 py-2 font-mono text-xs">{m.numero}</td>
                      <td className="px-3 py-2">
                        {m.estado ? (
                          <Badge variante={BADGE_ESTADO[m.estado] ?? "neutro"}>{m.estado}</Badge>
                        ) : (
                          <span className="text-piedra">—</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-heading text-[13.5px] ${
                          m.debe > 0 ? "text-error-texto" : m.haber > 0 ? "text-pino" : "text-piedra"
                        }`}
                      >
                        {m.debe > 0 ? `+ $ ${formatearMonto(m.debe)}` : m.haber > 0 ? `− $ ${formatearMonto(m.haber)}` : "—"}
                      </td>
                    </tr>
                  )}
                />
              </div>
            </>
          )}
        </div>
      )}

      {editando && (
        <ProveedorModal proveedor={proveedor} onClose={() => setEditando(false)} onExito={() => setEditando(false)} />
      )}

      {verOrdenPagoId && (
        <OrdenPagoDetalleModal
          ordenId={verOrdenPagoId}
          onClose={() => setVerOrdenPagoId(null)}
          onExito={mostrarToast}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}

function Dato({ etiqueta, valor, mono = false }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-tinta/55">{etiqueta}</div>
      <div className={`mt-0.5 text-[13.5px] text-tinta ${mono ? "font-mono text-xs" : "font-body"}`}>
        {valor || <span className="text-piedra">—</span>}
      </div>
    </div>
  );
}
