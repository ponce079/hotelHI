import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackagePlus, PackageMinus, ArrowLeftRight, PackageCheck } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { useSesion } from "../../lib/sesion";
import { nombreCompleto } from "../usuarios/usuarios.constantes";
import { calcularAlertas } from "../../lib/alertas";
import { listarDepositos } from "../depositos/depositos.api";
import { listarHabilitaciones } from "../articulo-deposito/articuloDeposito.api";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { consultarStock } from "../stock/stock.api";
import { hoyEnHoraLocal, primerDiaDelMesISO } from "../../lib/fechas";
import { RecepcionistaInicio } from "./RecepcionistaInicio";
import { AdminInicio } from "./AdminInicio";
import { HousekeepingInicio } from "./HousekeepingInicio";

// Recepcionista, Admin y Housekeeping tienen su propia pantalla de inicio
// (operación del hotel: reservas, check-in/out, habitaciones, catálogos
// maestros, limpieza/mantenimiento) — nada que ver con los TARJETAS/
// ACCIONES de stock de acá abajo. Se despachan ANTES de declarar los hooks
// de stock (useQuery de artículos/depósitos/movimientos) para no
// dispararlos de arriba para abajo en una pantalla que no los usa.
// deposito/compras/gerente pasan de largo por acá.
export function DashboardPage() {
  const { rol } = useSesion();
  if (rol === "recepcionista") return <RecepcionistaInicio />;
  if (rol === "admin") return <AdminInicio />;
  if (rol === "housekeeping") return <HousekeepingInicio />;
  return <PanelStockYCompras />;
}

function PanelStockYCompras() {
  const navigate = useNavigate();
  const { rol, rolInfo, usuario, perfil } = useSesion();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: habilitaciones } = useQuery({ queryKey: ["articulo-depositos"], queryFn: listarHabilitaciones });
  const { data: stock } = useQuery({ queryKey: ["stock", {}], queryFn: () => consultarStock({}) });
  const { data: movimientosHoy } = useQuery({
    queryKey: ["movimientos", { desde: hoyEnHoraLocal(), hasta: hoyEnHoraLocal() }],
    queryFn: () => listarMovimientos({ desde: hoyEnHoraLocal(), hasta: hoyEnHoraLocal() }),
  });
  const { data: movimientosDelMes } = useQuery({
    queryKey: ["movimientos", { desde: primerDiaDelMesISO(), hasta: hoyEnHoraLocal() }],
    queryFn: () => listarMovimientos({ desde: primerDiaDelMesISO(), hasta: hoyEnHoraLocal() }),
  });
  const { data: enTransito } = useQuery({
    queryKey: ["movimientos", { estado: "En tránsito" }],
    queryFn: () => listarMovimientos({ estado: "En tránsito" }),
  });
  const { data: movimientosRecientes } = useQuery({
    queryKey: ["movimientos", { recientes: true }],
    queryFn: () => listarMovimientos({}),
  });

  const habilitacionesActivas = (habilitaciones ?? []).filter((h) => h.activo);
  const alertas = calcularAlertas(stock);
  const conDiferencia = (movimientosRecientes ?? []).filter((m) => m.estado === "Con diferencia" && m.depositoDestinoId);
  const consumoDelMes = (movimientosDelMes ?? [])
    .filter((m) => m.tipoMovStock?.tipo === "S")
    .reduce((acc, m) => acc + m.detalleMovimientos.reduce((a, l) => a + Number(l.cantidad), 0), 0);
  const sinParametros = (stock ?? []).filter((f) => f.activo && !f.stockMaximo).length;

  const TARJETAS = {
    deposito: [
      { label: "Movimientos hoy", value: movimientosHoy?.length ?? "—", hint: hoyEnHoraLocal() },
      { label: "Alertas de stock", value: alertas.length, hint: "artículos en el mínimo" },
      { label: "Por recibir", value: enTransito?.length ?? "—", hint: "transferencias en tránsito" },
      { label: "Con diferencia", value: conDiferencia.length, hint: "llegó menos de lo enviado" },
    ],
    compras: [
      { label: "Alertas activas", value: alertas.length, hint: "stock ≤ mínimo" },
      { label: "Sin parámetros", value: sinParametros, hint: "mín/máx sin definir" },
      { label: "Habilitaciones", value: habilitacionesActivas.length, hint: "a parametrizar" },
      { label: "Depósitos", value: depositos?.length ?? "—", hint: "puntos de reposición" },
    ],
    gerente: [
      { label: "Consumo del mes", value: consumoDelMes, hint: "unidades salidas" },
      { label: "Alertas activas", value: alertas.length, hint: "quiebres potenciales" },
      { label: "Movimientos", value: movimientosRecientes?.length ?? "—", hint: "registrados en el sistema" },
      { label: "Con diferencia", value: conDiferencia.length, hint: "transferencias a revisar" },
    ],
  };

  const ACCIONES = {
    // Un solo primario sólido por pantalla (auditoría de botones, P1.2):
    // mismo criterio que MovimientosPage, "Registrar entrada" es la acción
    // más frecuente del depósito, el resto baja a secundario.
    deposito: [
      { label: "Registrar entrada", variante: "ok", icon: PackagePlus, onClick: () => navigate("/movimientos", { state: { modoForm: "E" } }) },
      { label: "Registrar salida", variante: "secundario", icon: PackageMinus, onClick: () => navigate("/movimientos", { state: { modoForm: "S" } }) },
      { label: "Nueva transferencia", variante: "secundario", icon: ArrowLeftRight, onClick: () => navigate("/movimientos", { state: { modoForm: "transfer" } }) },
      { label: "Recepciones", variante: "secundario", icon: PackageCheck, onClick: () => navigate("/recepciones") },
    ],
    compras: [
      { label: "Ver alertas", variante: "ok", onClick: () => navigate("/alertas") },
      { label: "Definir mín/máx", variante: "secundario", onClick: () => navigate("/stock/minmax") },
      { label: "Depósitos y stock", variante: "secundario", onClick: () => navigate("/depositos") },
    ],
    gerente: [
      { label: "Reporte de consumo", variante: "ok", onClick: () => navigate("/reporte") },
      { label: "Ver alertas", variante: "secundario", onClick: () => navigate("/alertas") },
      { label: "Depósitos y stock", variante: "secundario", onClick: () => navigate("/depositos") },
    ],
  };

  const tarjetas = TARJETAS[rol] ?? [];
  const acciones = ACCIONES[rol] ?? [];
  const ultimosMovimientos = (movimientosRecientes ?? []).slice(0, 5);
  const alertasTop = alertas.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Inicio</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">Panel del rol</p>
      </div>

      <div>
        <h3 className="font-heading text-[23px] font-semibold">Hola, {nombreCompleto(perfil) || usuario || rolInfo?.label}</h3>
        <p className="text-[13.5px] text-piedra">{rolInfo?.descripcion}</p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {tarjetas.map((c) => (
          <div
            key={c.label}
            className="flex flex-col items-center gap-0.5 rounded-[18.4px] bg-white p-[13.2px] text-center shadow-[0_1px_2px_rgba(46,43,37,0.14)]"
          >
            <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pino">{c.label}</div>
            <Cifra tamano={34}>{c.value}</Cifra>
            <div className="font-body text-[11.5px] text-tinta/55">{c.hint}</div>
          </div>
        ))}
      </div>

      {acciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acciones.map((a) => (
            <Button key={a.label} variante={a.variante} onClick={a.onClick}>
              {a.icon && <a.icon size={16} />} {a.label}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="rounded-[18.4px] bg-white px-[22px] py-5">
          <h4 className="mb-3 font-heading text-base font-semibold">Últimos movimientos</h4>
          {ultimosMovimientos.length === 0 && <p className="text-sm text-piedra">Todavía no hay movimientos registrados.</p>}
          {ultimosMovimientos.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                  <th className="pb-2">ID</th>
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2">Origen → Destino</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ultimosMovimientos.map((m) => (
                  <tr key={m.id} className="border-t border-borde">
                    <td className="py-2 font-mono text-xs">MOV-{String(m.id).padStart(4, "0")}</td>
                    <td className="py-2 font-body text-[12.5px]">{new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                    <td className="py-2">
                      <Badge variante={m.tipoMovStock?.tipo === "E" ? "ok" : "alerta"}>{m.tipoMovStock?.descripcion}</Badge>
                    </td>
                    <td className="py-2 font-body text-[12.5px]">
                      {m.deposito?.nombre}
                      {m.depositoDestino ? ` → ${m.depositoDestino.nombre}` : ""}
                    </td>
                    <td className="py-2">
                      <Badge variante={m.estado === "Confirmado" ? "ok" : m.estado === "En tránsito" ? "alerta" : "error"}>{m.estado}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-[18.4px] bg-neutro-100 px-[22px] py-5">
          <h4 className="mb-3 font-heading text-base font-semibold">Alertas de stock mínimo</h4>
          {alertasTop.length === 0 && (
            <p className="text-sm text-piedra">Sin alertas activas: todos los artículos habilitados están por encima de su mínimo.</p>
          )}
          <div className="flex flex-col gap-2">
            {alertasTop.map((a) => (
              <button
                key={a.articuloDepositoId}
                type="button"
                onClick={() => navigate(`/depositos/${a.depositoId}?criticos=1`)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-[18px] bg-error-suave px-3.5 py-2.5 text-left hover:opacity-90"
              >
                <div>
                  <div className="font-body text-[13px] font-semibold">{a.nombre}</div>
                  <div className="font-body text-[11px] text-tinta/60">{a.deposito}</div>
                </div>
                <div className="text-right">
                  <Cifra tamano={15} className="text-error-texto">{a.stockActual}</Cifra>
                  <div className="font-body text-[10.5px] text-tinta/55">mín. {a.stockMinimo}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
