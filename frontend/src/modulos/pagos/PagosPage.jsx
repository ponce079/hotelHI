import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Select } from "../../componentes/Select";
import { Input } from "../../componentes/Input";
import { FilterBar } from "../../componentes/FilterBar";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { Pagination } from "../../componentes/Pagination";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Toast } from "../../componentes/Toast";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";
import { formatearMonto } from "../../lib/moneda";
import { listarOrdenesPago } from "./pagos.api";
import { MEDIOS_PAGO, BADGE_ESTADO, BADGE_ESTADO_CHEQUE } from "./pagos.constantes";
import { OrdenPagoWizard } from "./OrdenPagoWizard";
import { OrdenPagoDetalleModal } from "./OrdenPagoDetalleModal";

const FILTROS_VACIOS = { proveedorId: "", medio: "", desde: "", hasta: "" };
const PAGE_SIZE = 10;

export function PagosPage() {
  const { puede } = useSesion();
  const tienePermiso = puede("verPagos");
  const puedeRegistrar = puede("registrarPago");
  const navigate = useNavigate();
  const { toast, mostrarToast } = useToast();
  const [mostrarWizard, setMostrarWizard] = useState(false);
  const [verOrdenId, setVerOrdenId] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);

  useEffect(() => setPagina(1), [filtros]);

  // enabled: tienePermiso — evita disparar el fetch (con montos y
  // proveedores) para un usuario sin permiso antes de que el chequeo de
  // más abajo llegue a bloquear la vista con <SinPermiso />.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["pagos", "listado", filtros, pagina],
    queryFn: () => listarOrdenesPago({ ...filtros, page: pagina, pageSize: PAGE_SIZE }),
    enabled: tienePermiso,
  });

  // El selector de proveedor se arma con un listado propio, filtrado
  // solo por fecha (no por proveedor/medio) — así no se autoestrecha ni
  // atrapa la selección cuando el usuario elige un proveedor o un medio.
  // No es un GET /api/proveedores propio porque ese endpoint todavía no
  // existe (lo construyen Tomás/Agustín en HU-18 a 21); cuando exista,
  // conviene reemplazar esto por la lista completa de proveedores.
  const { data: dataProveedores } = useQuery({
    queryKey: ["pagos", "proveedores-filtro", filtros.desde, filtros.hasta],
    queryFn: () => listarOrdenesPago({ desde: filtros.desde, hasta: filtros.hasta, pageSize: 500 }),
    enabled: tienePermiso,
  });
  const proveedoresDisponibles = useMemo(() => {
    const vistos = new Map();
    (dataProveedores?.items ?? []).forEach((o) => vistos.set(o.proveedorId, o.proveedor));
    return [...vistos.entries()].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [dataProveedores]);

  // Backend no valida rol todavia (Sprint 3) — este chequeo + <SinPermiso />
  // + el enabled:tienePermiso de arriba es lo único que impide entrar
  // por URL directa sin ser "compras" o "gerente" (HU-78, solo lectura
  // para gerente). El botón de generar orden y las acciones del modal de
  // detalle siguen exclusivas de compras (puedeRegistrar).
  if (!tienePermiso) return <SinPermiso />;

  const hayFiltros = filtros.proveedorId || filtros.medio || filtros.desde || filtros.hasta;

  return (
    <div className="flex flex-col gap-6">
      {/* Pagos y Cuenta Corriente comparten un mismo rol ("compras") y el
          mismo dato de base (saldos de comprobantes) — se presentan como
          una sola sección con 2 pestañas en vez de 2 entradas sueltas en
          el menú. Cada pestaña sigue siendo su propia ruta/página, solo
          cambia cómo se llega. */}
      <div className="flex gap-1 border-b border-borde">
        <button
          type="button"
          className="-mb-px border-b-2 border-pino px-4 py-2.5 font-body text-sm font-semibold text-pino"
        >
          Pagos a Proveedores
        </button>
        <button
          type="button"
          onClick={() => navigate("/cuenta-corriente")}
          className="-mb-px cursor-pointer border-b-2 border-transparent px-4 py-2.5 font-body text-sm font-semibold text-tinta/55 hover:text-tinta"
        >
          Cuenta Corriente
        </button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Pagos a Proveedores</h1>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">Órdenes de pago y su desglose por medio</p>
        </div>
        {puedeRegistrar && (
          <Button variante="ok" onClick={() => setMostrarWizard(true)} icono={Plus}>
            Generar orden de pago
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-[18.4px] bg-pino px-5 py-4 text-hueso">
          <span className="text-[11px] tracking-wide text-hueso/60 uppercase">Total pagado del período</span>
          <Cifra tamano={28} className="text-hueso">
            $ {formatearMonto(data?.totalPeriodo)}
          </Cifra>
          <span className="text-[11.5px] text-hueso/65">
            {data ? `${data.cantidadVigentes} orden(es) vigente(s)` : "…"}
            {data && data.cantidadTotal !== data.cantidadVigentes
              ? ` · ${data.cantidadTotal - data.cantidadVigentes} anulada(s) o rechazada(s)`
              : ""}
          </span>
        </div>
        {(data?.desglose ?? MEDIOS_PAGO.map((medio) => ({ medio, importe: 0, cantidadOrdenes: 0 }))).map((d) => (
          <div key={d.medio} className="flex flex-col gap-1 rounded-[18.4px] bg-white px-5 py-4">
            <span className="text-[11px] tracking-wide text-piedra uppercase">{d.medio}</span>
            <Cifra tamano={24} className={d.importe ? "text-tinta" : "text-tinta/35"}>
              $ {formatearMonto(d.importe)}
            </Cifra>
            <span className="text-[11.5px] text-piedra">{d.cantidadOrdenes ? `${d.cantidadOrdenes} orden(es)` : "sin movimientos"}</span>
          </div>
        ))}
      </div>

      <FilterBar onClear={hayFiltros ? () => setFiltros(FILTROS_VACIOS) : undefined}>
        <div className="min-w-[200px]">
          <Select
            label="Proveedor"
            value={filtros.proveedorId}
            onChange={(e) => setFiltros((f) => ({ ...f, proveedorId: e.target.value }))}
          >
            <option value="">Todos los proveedores</option>
            {proveedoresDisponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[170px]">
          <Select label="Medio de pago" value={filtros.medio} onChange={(e) => setFiltros((f) => ({ ...f, medio: e.target.value }))}>
            <option value="">Todos los medios</option>
            {MEDIOS_PAGO.map((m) => (
              <option key={m} value={m}>
                {m}
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

      <div className="flex flex-col gap-3 rounded-[18.4px] bg-white px-6 py-4">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-piedra">Cargando…</p>
        ) : isError ? (
          <p className="py-8 text-center text-sm text-error">No se pudieron cargar las órdenes de pago.</p>
        ) : (
          <>
            <Table
              columnas={["N° orden", "Fecha", "Proveedor", "Comprobantes cancelados", "Medios", "Importe", "Estado"]}
              columnasDerecha={["Importe"]}
              filas={data?.items ?? []}
              vacio="Ninguna orden de pago coincide con los filtros."
              renderFila={(o) => (
                <tr
                  key={o.id}
                  onClick={() => setVerOrdenId(o.id)}
                  className={`cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${o.vigente ? "" : "opacity-55"}`}
                >
                  <td className="px-2 py-2.5 font-mono text-[12.5px]">{o.numero}</td>
                  <td className="px-2 py-2.5 text-[12.5px]">{new Date(o.fecha).toLocaleDateString("es-AR")}</td>
                  <td className="px-2 py-2.5 text-[13px]">{o.proveedor}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {o.comprobantes.map((c) => (
                        <span key={c} className="rounded-sm bg-neutro-100 px-2 py-0.5 font-mono text-[11px] text-tinta/70">
                          {c}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {o.medios.map((m, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-[12.5px] text-tinta/70">
                          {m.tipo}
                          {m.tipo === "Cheque" && m.estadoCheque && (
                            <Badge variante={BADGE_ESTADO_CHEQUE[m.estadoCheque] ?? "neutro"}>{m.estadoCheque}</Badge>
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right text-[13.5px] font-semibold">$ {formatearMonto(o.importe)}</td>
                  <td className="px-2 py-2.5">
                    <Badge variante={BADGE_ESTADO[o.estado] ?? "neutro"}>{o.estado}</Badge>
                  </td>
                </tr>
              )}
            />
            {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPagina} />}
          </>
        )}
      </div>

      {mostrarWizard && (
        <OrdenPagoWizard
          onClose={() => setMostrarWizard(false)}
          onExito={(mensaje) => {
            setMostrarWizard(false);
            mostrarToast(mensaje);
          }}
        />
      )}

      {verOrdenId && (
        <OrdenPagoDetalleModal
          ordenId={verOrdenId}
          onClose={() => setVerOrdenId(null)}
          onExito={mostrarToast}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
