import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { SinPermiso } from "../../componentes/SinPermiso";
import { ProveedorModal } from "./ProveedorModal";
import { obtenerProveedor, listarOrdenesCompraDeProveedor } from "./proveedores.api";
import { obtenerCuentaCorrienteDeProveedor } from "../cuenta-corriente/cuentaCorriente.api";
import { formatearMonto } from "../../lib/moneda";
import { formatearFechaSolo } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";

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

const TABS = [
  { clave: "datos", label: "Datos generales" },
  { clave: "ordenes", label: "Historial de OC" },
  { clave: "ctacte", label: "Cuenta corriente" },
];

export function ProveedorDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { puede } = useSesion();
  const [tab, setTab] = useState("datos");
  const [sort, setSort] = useState("fecha");
  const [editando, setEditando] = useState(false);

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          onClick={() => navigate("/proveedores")}
          className="mb-2 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
        >
          <ArrowLeft size={15} /> Volver a proveedores
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
              <Building2 size={24} className="text-pino" /> {proveedor.razonSocial}
            </h1>
            <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
              {proveedor.cuit} · HU-21 — ficha e historial de compras
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variante={proveedor.activo ? "ok" : "neutro"}>{proveedor.activo ? "Activo" : "Inactivo"}</Badge>
            <Button variante="secundario" onClick={() => setEditando(true)}>Editar</Button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-borde">
        {TABS.map((t) => (
          <button
            key={t.clave}
            type="button"
            onClick={() => setTab(t.clave)}
            className={`cursor-pointer border-b-2 px-4 py-2 font-body text-[13px] font-semibold transition-colors ${
              tab === t.clave ? "border-pino text-tinta" : "border-transparent text-tinta/55 hover:text-tinta"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "datos" && (
        <div className="rounded-lg border border-borde bg-white p-6">
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
                <tr key={oc.id} className="border-b border-borde last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{oc.numero}</td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{formatearFechaSolo(oc.fecha)}</td>
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
        <div className="rounded-lg border border-borde bg-white p-6">
          {errorCtaCte && (
            <p className="text-sm text-piedra">
              No se pudo cargar la cuenta corriente. Puede que este proveedor todavía no tenga comprobantes cargados.
            </p>
          )}
          {ctaCte && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-tinta/55">Saldo adeudado</div>
                <Cifra tamano={34}>$ {formatearMonto(ctaCte.saldoTotal ?? 0)}</Cifra>
              </div>
              <Link
                to="/cuenta-corriente"
                className="w-fit rounded-md border border-borde px-3 py-2 font-heading text-sm font-semibold text-tinta hover:bg-hueso"
              >
                Ver cuenta corriente completa →
              </Link>
            </div>
          )}
        </div>
      )}

      {editando && (
        <ProveedorModal
          proveedor={{ ...proveedor, tieneOrdenesCompra: (ordenes?.total ?? 0) > 0 }}
          onClose={() => setEditando(false)}
          onExito={() => setEditando(false)}
        />
      )}
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
