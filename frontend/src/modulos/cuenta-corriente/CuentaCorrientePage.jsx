import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { Input } from "../../componentes/Input";
import { FilterBar } from "../../componentes/FilterBar";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { Badge } from "../../componentes/Badge";
import { Toast } from "../../componentes/Toast";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { formatearMonto } from "../../lib/moneda";
import { obtenerResumenCuentaCorriente, obtenerCuentaCorrienteDeProveedor } from "./cuentaCorriente.api";
import { obtenerProveedor } from "../proveedores/proveedores.api";
import { TIPOS_MOVIMIENTO, diasDesde, variantePorAntiguedad, rutaDeMovimiento, esMovimientoDePago } from "./cuentaCorriente.constantes";
// Un movimiento "Pago" viene del mismo OrdenPago.estado que muestra
// Pagos — se reusa su mapeo de colores para no duplicarlo (ni
// arriesgarse a que un badge muestre un color distinto en cada pantalla).
import { BADGE_ESTADO, BADGE_ESTADO_CHEQUE } from "../pagos/pagos.constantes";
import { OrdenPagoDetalleModal } from "../pagos/OrdenPagoDetalleModal";

const FILTROS_VACIOS = { tipo: "", desde: "", hasta: "" };

export function CuentaCorrientePage() {
  const { puede } = useSesion();
  const tienePermiso = puede("verCuentaCorriente");
  const navigate = useNavigate();
  const { toast, mostrarToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [verOrdenPagoId, setVerOrdenPagoId] = useState(null);

  // El proveedor elegido vive en la URL, no en un useState: así, cuando se
  // entra desde la ficha de un proveedor (?proveedorId=X, ver
  // ProveedorDetallePage), esta pantalla respeta ese proveedor en vez de
  // pisarlo con el mayor deudor por defecto.
  const proveedorIdParam = searchParams.get("proveedorId");
  const proveedorId = proveedorIdParam ? Number(proveedorIdParam) : null;
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);

  function elegirProveedor(id) {
    const params = new URLSearchParams(searchParams);
    params.set("proveedorId", String(id));
    setSearchParams(params, { replace: true });
  }

  const { data: resumen, isLoading: cargandoResumen } = useQuery({
    queryKey: ["cuenta-corriente", "resumen"],
    queryFn: obtenerResumenCuentaCorriente,
    enabled: tienePermiso,
  });

  // Solo si no vino un proveedor puntual por URL: por defecto se muestra
  // el mayor deudor, así la pantalla no arranca vacía esperando que el
  // usuario elija un chip.
  useEffect(() => {
    if (proveedorId === null && resumen?.proveedores?.length > 0) {
      elegirProveedor(resumen.proveedores[0].proveedorId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumen, proveedorId]);

  const { data: detalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ["cuenta-corriente", "detalle", proveedorId, filtros],
    queryFn: () => obtenerCuentaCorrienteDeProveedor(proveedorId, filtros),
    enabled: tienePermiso && proveedorId !== null,
  });

  // Ficha básica del proveedor elegido (condición comercial, contacto):
  // le da contexto a la tabla de movimientos, que de otra forma es solo
  // números sueltos sin recordar de quién son.
  const { data: proveedor } = useQuery({
    queryKey: ["proveedor", proveedorId],
    queryFn: () => obtenerProveedor(proveedorId),
    enabled: tienePermiso && proveedorId !== null,
  });

  if (!tienePermiso) return <SinPermiso />;

  const hayFiltros = filtros.tipo || filtros.desde || filtros.hasta;

  return (
    <div className="flex flex-col gap-6">
      {/* Misma sección que Pagos a Proveedores, ver comentario en PagosPage.jsx. */}
      <div className="flex gap-1 border-b border-borde">
        <button
          type="button"
          onClick={() => navigate("/pagos")}
          className="-mb-px cursor-pointer border-b-2 border-transparent px-4 py-2.5 font-body text-sm font-semibold text-tinta/55 hover:text-tinta"
        >
          Pagos a Proveedores
        </button>
        <button
          type="button"
          className="-mb-px border-b-2 border-pino px-4 py-2.5 font-body text-sm font-semibold text-pino"
        >
          Cuenta Corriente
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Cuenta Corriente de Proveedores</h1>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">HU 80 — saldo y movimientos por proveedor</p>
        </div>
        <Button
          variante="secundario"
          onClick={() => mostrarToast("Cuenta corriente exportada (simulado).")}
        >
          <Download size={16} /> Exportar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-[18.4px] bg-pino px-5 py-4 text-hueso">
          <span className="text-[11px] tracking-wide text-hueso/60 uppercase">Saldo total adeudado</span>
          <Cifra tamano={28} className="text-hueso">
            $ {formatearMonto(resumen?.saldoTotal)}
          </Cifra>
          <span className="text-[11.5px] text-hueso/65">
            {resumen ? `${resumen.proveedores.length} proveedor(es) con saldo` : "…"}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-[18.4px] bg-white px-5 py-4">
          <span className="text-[11px] tracking-wide text-piedra uppercase">Mayor acreedor</span>
          <Cifra tamano={21} className="text-tinta">
            {resumen?.mayorAcreedor ? resumen.mayorAcreedor.razonSocial : "—"}
          </Cifra>
          <span className="text-[11.5px] text-piedra">
            {resumen?.mayorAcreedor ? `$ ${formatearMonto(resumen.mayorAcreedor.saldo)}` : "sin deuda pendiente"}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-[18.4px] bg-white px-5 py-4">
          <span className="text-[11px] tracking-wide text-piedra uppercase">Comprobantes impagos</span>
          <Cifra tamano={28} className="text-tinta">
            {resumen ? resumen.comprobantesImpagos : "…"}
          </Cifra>
          <span className="text-[11.5px] text-piedra">factura(s) con saldo pendiente</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {cargandoResumen ? (
          <p className="text-sm text-piedra">Cargando proveedores…</p>
        ) : resumen?.proveedores?.length ? (
          resumen.proveedores.map((p) => (
            <button
              key={p.proveedorId}
              type="button"
              onClick={() => elegirProveedor(p.proveedorId)}
              className={`cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-[7px] text-xs font-semibold transition-colors ${
                proveedorId === p.proveedorId
                  ? "border-pino bg-pino text-hueso"
                  : "border-tinta/20 bg-white text-tinta hover:bg-hueso"
              }`}
            >
              {p.razonSocial} · $ {formatearMonto(p.saldo)}
            </button>
          ))
        ) : (
          <p className="text-sm text-piedra">Ningún proveedor tiene saldo pendiente.</p>
        )}
      </div>

      {proveedorId !== null && (
        <>
          {proveedor && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18.4px] bg-white px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="font-heading text-[16px] font-semibold text-tinta">{proveedor.razonSocial}</span>
                <span className="text-[12.5px] text-tinta/55">{proveedor.condicionComercial ?? "Sin condición cargada"}</span>
                {proveedor.contacto && (
                  <span className="text-[12.5px] text-tinta/55">
                    {proveedor.contacto}
                    {proveedor.telefono ? ` · ${proveedor.telefono}` : ""}
                  </span>
                )}
              </div>
              <Link
                to={`/proveedores/${proveedorId}`}
                className="whitespace-nowrap text-[12.5px] font-semibold text-pino hover:underline"
              >
                Ver ficha completa →
              </Link>
            </div>
          )}

          <FilterBar onClear={hayFiltros ? () => setFiltros(FILTROS_VACIOS) : undefined}>
            <div className="min-w-[170px]">
              <Select label="Tipo" value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="">Todos los tipos</option>
                {TIPOS_MOVIMIENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-[150px]">
              <Input type="date" label="Desde" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} />
            </div>
            <div className="w-[150px]">
              <Input type="date" label="Hasta" value={filtros.hasta} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} />
            </div>
          </FilterBar>

          <div className="rounded-[18.4px] bg-white px-6 py-4">
            {cargandoDetalle ? (
              <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
            ) : (
              <Table
                columnas={["Fecha", "Antigüedad", "Tipo", "N° comprobante/orden", "Estado", "Debe", "Haber", "Saldo acumulado"]}
                columnasDerecha={["Debe", "Haber", "Saldo acumulado"]}
                filas={detalle?.movimientos ?? []}
                vacio={hayFiltros ? "Ningún movimiento coincide con los filtros." : "Este proveedor todavía no tiene movimientos registrados."}
                renderFila={(m, i) => (
                  <tr
                    key={`${m.tipo}-${m.numero}-${m.fecha}`}
                    onClick={() => (esMovimientoDePago(m) ? setVerOrdenPagoId(m.id) : navigate(rutaDeMovimiento(m)))}
                    className={`cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${
                      i % 2 === 1 ? "bg-hueso/50" : ""
                    } ${m.estado && m.estado !== "Pagado" ? "opacity-55" : ""}`}
                  >
                    <td className="px-2 py-2.5 text-[12.5px]">{new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                    <td className="px-2 py-2.5">
                      {m.debe > 0 ? (
                        <Badge variante={variantePorAntiguedad(diasDesde(m.fecha))}>
                          {diasDesde(m.fecha)} día{diasDesde(m.fecha) === 1 ? "" : "s"}
                        </Badge>
                      ) : (
                        <span className="text-[12.5px] text-piedra">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-[12.5px] text-tinta/70">{m.tipo}</td>
                    <td className="px-2 py-2.5 font-mono text-[12.5px]">{m.numero}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.estado && <Badge variante={BADGE_ESTADO[m.estado] ?? "neutro"}>{m.estado}</Badge>}
                        {m.cheques?.map((c) => (
                          <Badge key={c.numeroCheque} variante={BADGE_ESTADO_CHEQUE[c.estadoCheque] ?? "neutro"}>
                            Cheque {c.numeroCheque} · {c.estadoCheque}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right text-[12.5px]">{m.debe ? `$ ${formatearMonto(m.debe)}` : ""}</td>
                    <td className="px-2 py-2.5 text-right text-[12.5px]">{m.haber ? `$ ${formatearMonto(m.haber)}` : ""}</td>
                    <td className="px-2 py-2.5 text-right text-[13.5px] font-semibold">$ {formatearMonto(m.saldoAcumulado)}</td>
                  </tr>
                )}
              />
            )}
          </div>
        </>
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
