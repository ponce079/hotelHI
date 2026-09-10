import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PackageCheck, Truck, History, ArrowLeft } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { SinPermiso } from "../../componentes/SinPermiso";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { listarOrdenesCompra } from "../ordenes-compra/ordenesCompra.api";
import { useSesion } from "../../lib/sesion";
import { useVolver } from "../../lib/useVolver";

// Vista aparte a propósito (ver el comentario del link en RecepcionesPage):
// esto es solo un archivo de lo ya resuelto, sin acciones ni filtros por
// depósito — nada de lo que se ve acá requiere que alguien haga algo. No
// hay endpoint nuevo: listarOrdenesCompra/listarMovimientos ya devuelven
// todo lo necesario, esto solo filtra en el cliente los estados "cerrados".
const ESTADOS_OC_HISTORIAL = ["Recibida", "Recibida con diferencia", "Cerrada"];

export function HistorialRecepcionesPage() {
  const { puede } = useSesion();
  const navigate = useNavigate();
  const volver = useVolver("/recepciones");

  const { data: ocs, isLoading: cargandoOCs } = useQuery({
    queryKey: ["ordenes-compra", "historial-recepciones"],
    queryFn: () => listarOrdenesCompra({ pageSize: 200 }),
    enabled: puede("verRecepciones"),
  });
  const ocsHistorial = (ocs?.items ?? [])
    .filter((oc) => ESTADOS_OC_HISTORIAL.includes(oc.estado))
    .sort((a, b) => new Date(b.fechaRecibida ?? b.fecha) - new Date(a.fechaRecibida ?? a.fecha));

  const { data: confirmadas, isLoading: cargandoMovs } = useQuery({
    queryKey: ["movimientos", "historial-recepciones", "Confirmado"],
    queryFn: () => listarMovimientos({ estado: "Confirmado" }),
    enabled: puede("verRecepciones"),
  });
  const { data: conDiferencia } = useQuery({
    queryKey: ["movimientos", "historial-recepciones", "Con diferencia"],
    queryFn: () => listarMovimientos({ estado: "Con diferencia" }),
    enabled: puede("verRecepciones"),
  });
  const transferenciasHistorial = [...(confirmadas ?? []), ...(conDiferencia ?? [])]
    .filter((m) => m.depositoDestinoId)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  if (!puede("verRecepciones")) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-[22px]">
      <Button variante="fantasma" onClick={volver} className="w-fit text-xs" icono={ArrowLeft}>
        Volver a Recepciones
      </Button>

      <div>
        <h1 className="flex items-center gap-2 font-heading text-[30px] font-semibold">
          <History size={22} className="text-piedra" /> Historial de recepciones
        </h1>
        <p className="mt-1.5 text-[13px] text-tinta/60">
          Compras y transferencias ya recibidas — no requieren ninguna acción.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col rounded-[18px] border-t-[3px] border-pino bg-white shadow-[0_1px_2px_rgba(46,43,37,0.14)]">
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
            <PackageCheck size={18} className="text-pino" />
            <h2 className="font-heading text-[20px] font-semibold">Compras</h2>
            <Badge variante="neutro">{ocsHistorial.length}</Badge>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto px-5 pb-5 lg:max-h-[620px]">
            {cargandoOCs && <p className="text-sm text-piedra">Cargando…</p>}
            {!cargandoOCs && ocsHistorial.length === 0 && (
              <p className="text-sm text-piedra">Todavía no hay compras recibidas.</p>
            )}
            {ocsHistorial.map((oc) => (
              <button
                key={oc.id}
                type="button"
                onClick={() => navigate(`/ordenes-compra/${oc.id}`)}
                className="flex w-full flex-wrap items-center gap-3 rounded-[14px] bg-hueso px-4 py-3 text-left hover:bg-neutro-100"
              >
                <span className="font-mono text-[12px]">{oc.numero}</span>
                <span className="font-body text-[13px] font-semibold">{oc.proveedor?.razonSocial}</span>
                <span className="font-body text-[12px] text-tinta/55">{oc.deposito?.nombre}</span>
                <Badge variante={oc.estado === "Recibida con diferencia" ? "alerta" : oc.estado === "Cerrada" ? "cerrado" : "ok"}>
                  {oc.estado}
                </Badge>
                <span className="ml-auto font-body text-[12px] text-tinta/55">
                  {oc.fechaRecibida ? new Date(oc.fechaRecibida).toLocaleDateString("es-AR") : "—"}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col rounded-[18px] border-t-[3px] border-laton bg-white shadow-[0_1px_2px_rgba(46,43,37,0.14)]">
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
            <Truck size={18} className="text-laton" />
            <h2 className="font-heading text-[20px] font-semibold">Transferencias</h2>
            <Badge variante="neutro">{transferenciasHistorial.length}</Badge>
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto px-5 pb-5 lg:max-h-[620px]">
            {cargandoMovs && <p className="text-sm text-piedra">Cargando…</p>}
            {!cargandoMovs && transferenciasHistorial.length === 0 && (
              <p className="text-sm text-piedra">Todavía no hay transferencias confirmadas.</p>
            )}
            {transferenciasHistorial.map((mov) => (
              <div key={mov.id} className="flex flex-wrap items-center gap-3 rounded-[14px] bg-hueso px-4 py-3">
                <span className="font-mono text-[12px]">MOV-{String(mov.id).padStart(4, "0")}</span>
                <span className="font-body text-[12.5px] text-tinta/65">
                  {mov.deposito?.nombre} → {mov.depositoDestino?.nombre}
                </span>
                <Badge variante={mov.estado === "Con diferencia" ? "alerta" : "ok"}>{mov.estado}</Badge>
                <span className="ml-auto font-body text-[12px] text-tinta/55">
                  {new Date(mov.fecha).toLocaleDateString("es-AR")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
