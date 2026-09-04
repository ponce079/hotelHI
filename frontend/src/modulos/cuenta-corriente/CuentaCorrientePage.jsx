import { useEffect, useState } from "react";
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
import { TIPOS_MOVIMIENTO } from "./cuentaCorriente.constantes";
// Un movimiento "Pago" viene del mismo OrdenPago.estado que muestra
// Pagos — se reusa su mapeo de colores para no duplicarlo (ni
// arriesgarse a que un badge muestre un color distinto en cada pantalla).
import { BADGE_ESTADO, BADGE_ESTADO_CHEQUE } from "../pagos/pagos.constantes";

const FILTROS_VACIOS = { tipo: "", desde: "", hasta: "" };

export function CuentaCorrientePage() {
  const { puede } = useSesion();
  const tienePermiso = puede("verCuentaCorriente");
  const { toast, mostrarToast } = useToast();

  const [proveedorId, setProveedorId] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);

  const { data: resumen, isLoading: cargandoResumen } = useQuery({
    queryKey: ["cuenta-corriente", "resumen"],
    queryFn: obtenerResumenCuentaCorriente,
    enabled: tienePermiso,
  });

  // Por defecto, al entrar, se muestra el mayor deudor — así la
  // pantalla no arranca vacía esperando que el usuario elija un chip.
  useEffect(() => {
    if (proveedorId === null && resumen?.proveedores?.length > 0) {
      setProveedorId(resumen.proveedores[0].proveedorId);
    }
  }, [resumen, proveedorId]);

  const { data: detalle, isLoading: cargandoDetalle } = useQuery({
    queryKey: ["cuenta-corriente", "detalle", proveedorId, filtros],
    queryFn: () => obtenerCuentaCorrienteDeProveedor(proveedorId, filtros),
    enabled: tienePermiso && proveedorId !== null,
  });

  if (!tienePermiso) return <SinPermiso />;

  const hayFiltros = filtros.tipo || filtros.desde || filtros.hasta;

  return (
    <div className="flex flex-col gap-6">
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
              onClick={() => setProveedorId(p.proveedorId)}
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
                columnas={["Fecha", "Tipo", "N° comprobante/orden", "Estado", "Debe", "Haber", "Saldo acumulado"]}
                columnasDerecha={["Debe", "Haber", "Saldo acumulado"]}
                filas={detalle?.movimientos ?? []}
                vacio="Ningún movimiento coincide con los filtros."
                renderFila={(m) => (
                  <tr
                    key={`${m.tipo}-${m.numero}-${m.fecha}`}
                    className={`border-b border-borde last:border-0 ${m.estado && m.estado !== "Pagado" ? "opacity-55" : ""}`}
                  >
                    <td className="px-2 py-2.5 text-[12.5px]">{new Date(m.fecha).toLocaleDateString("es-AR")}</td>
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

      <Toast mensaje={toast} />
    </div>
  );
}
