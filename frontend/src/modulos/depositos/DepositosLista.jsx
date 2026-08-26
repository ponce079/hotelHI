import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Warehouse } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { listarDepositos } from "./depositos.api";
import { consultarStock } from "../stock/stock.api";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { useSesion } from "../../lib/sesion";

export function DepositosLista({ onEditar, onNuevo }) {
  const navigate = useNavigate();
  const { puede } = useSesion();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const { data: depositos, isLoading, isError } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: stock } = useQuery({ queryKey: ["stock", {}], queryFn: () => consultarStock({}) });
  const { data: enTransito } = useQuery({
    queryKey: ["movimientos", { estado: "En tránsito" }],
    queryFn: () => listarMovimientos({ estado: "En tránsito" }),
  });

  function actualizarQ(valor) {
    const params = new URLSearchParams(searchParams);
    if (valor) {
      params.set("q", valor);
    } else {
      params.delete("q");
    }
    setSearchParams(params);
  }

  if (isLoading) return <p className="text-sm text-piedra">Cargando depósitos…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los depósitos.</p>;

  function metricasDe(depositoId) {
    const filas = (stock ?? []).filter((r) => r.depositoId === depositoId);
    const unidades = filas.reduce((acc, r) => acc + Number(r.stockActual), 0);
    const criticos = filas.filter((r) => Number(r.stockActual) <= Number(r.stockMinimo)).length;
    const porRecibir = (enTransito ?? []).filter((m) => m.depositoDestinoId === depositoId).length;
    return { articulos: filas.length, unidades, criticos, porRecibir };
  }

  const todos = depositos ?? [];
  const filtrados = todos.filter((d) => {
    const texto = q.toLowerCase();
    return (
      d.nombre.toLowerCase().includes(texto) ||
      d.ubicacion.toLowerCase().includes(texto) ||
      d.responsable.toLowerCase().includes(texto)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={q}
            onChange={(e) => actualizarQ(e.target.value)}
            placeholder="Buscar por nombre, ubicación o responsable…"
            className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
        <span className="mr-auto text-xs text-piedra">
          {filtrados.length} de {todos.length} depósitos
        </span>
        {puede("abmDeposito") && <Button onClick={onNuevo}>+ Nuevo depósito</Button>}
      </div>

      {todos.length === 0 && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <p className="text-sm text-piedra">Todavía no hay depósitos cargados.</p>
        </div>
      )}

      {todos.length > 0 && filtrados.length === 0 && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <p className="text-sm text-piedra">Ningún depósito coincide con la búsqueda.</p>
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtrados.map((d) => {
        const m = metricasDe(d.id);
        return (
          <div
            key={d.id}
            className={`flex flex-col gap-3 rounded-lg border bg-white p-5 ${m.criticos > 0 ? "border-error/40" : "border-borde"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Warehouse size={18} className="text-pino" /> <Cifra tamano={21}>{d.nombre}</Cifra>
                </div>
                <div className="font-body text-xs text-tinta/55">
                  {d.ubicacion} · {d.responsable}
                </div>
              </div>
              {m.criticos > 0 ? (
                <Badge variante="error">
                  {m.criticos} artículo{m.criticos > 1 ? "s" : ""} crítico{m.criticos > 1 ? "s" : ""}
                </Badge>
              ) : (
                <Badge variante="ok">Sin faltantes</Badge>
              )}
            </div>

            <div className="flex gap-5 border-t border-borde pt-3">
              <div>
                <div className="font-body text-[10.5px] text-tinta/55">Artículos</div>
                <Cifra tamano={28}>{m.articulos}</Cifra>
              </div>
              <div>
                <div className="font-body text-[10.5px] text-tinta/55">Unidades</div>
                <Cifra tamano={28}>{m.unidades}</Cifra>
              </div>
              <div>
                <div className="font-body text-[10.5px] text-tinta/55">En crítico</div>
                <Cifra tamano={28} className={m.criticos > 0 ? "text-error-texto" : ""}>{m.criticos}</Cifra>
              </div>
              <div>
                <div className="font-body text-[10.5px] text-tinta/55">Por recibir</div>
                <Cifra tamano={28}>{m.porRecibir}</Cifra>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => navigate(`/depositos/${d.id}`)}>Ver stock del depósito</Button>
              {puede("abmDeposito") && (
                <Button variante="secundario" onClick={() => onEditar(d)}>
                  Editar datos
                </Button>
              )}
            </div>
          </div>
        );
          })}
        </div>
      )}
    </div>
  );
}
