import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { listarMovimientos } from "./movimientos.api";
import { listarDepositos } from "../depositos/depositos.api";

const VARIANTE_ESTADO = { Confirmado: "ok", "En tránsito": "alerta", "Con diferencia": "error" };

// El prototipo no modela una "contraparte externa" (proveedor/área) para
// Entrada/Salida simples — nuestro modelo tampoco la tiene (MovimientoStock
// solo tiene depositoId + depositoDestinoId opcional). Se adapta mostrando
// "—" del lado que no aplica, y el depósito real del lado que sí.
function origenDe(m) {
  if (m.tipoMovStock.tipo === "S") return m.deposito.nombre;
  if (m.depositoDestino) return m.deposito.nombre;
  return "—";
}
function destinoDe(m) {
  if (m.depositoDestino) return m.depositoDestino.nombre;
  if (m.tipoMovStock.tipo === "E") return m.deposito.nombre;
  return "—";
}
function vinculadoDe(m) {
  if (m.movimientoRelacionadoId) return `MOV-${String(m.movimientoRelacionadoId).padStart(4, "0")}`;
  if (m.estado === "En tránsito") return "pendiente";
  return "—";
}

export function MovimientosLista() {
  const [searchParams, setSearchParams] = useSearchParams();
  const depositoId = searchParams.get("depositoId") ?? "";

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: movimientos, isLoading, isError } = useQuery({
    queryKey: ["movimientos", { depositoId: depositoId || undefined }],
    queryFn: () => listarMovimientos(depositoId ? { depositoId } : {}),
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando movimientos…</p>;
  if (isError) return <p className="text-sm text-error">No se pudieron cargar los movimientos.</p>;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex max-w-xs flex-col gap-1.5 text-sm">
        <span className="text-[12px] text-tinta/70">Depósito</span>
        <select
          value={depositoId}
          onChange={(e) => setSearchParams(e.target.value ? { depositoId: e.target.value } : {})}
          className="cursor-pointer rounded-md border border-borde px-3 py-2 text-sm"
        >
          <option value="">Todos los depósitos</option>
          {depositos?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-lg border border-borde bg-white p-5">
        <Table
          columnas={["ID", "Fecha", "Tipo", "Origen → Destino", "Detalle", "Unid.", "Estado", "Vinculado", "Usuario"]}
          filas={movimientos}
          vacio="Todavía no hay movimientos registrados."
          renderFila={(m) => {
            const unidades = m.detalleMovimientos.reduce((acc, l) => acc + Number(l.cantidad), 0);
            const detalle = m.detalleMovimientos
              .map(
                (l) =>
                  `${l.articulo.nombre} ×${l.cantidad}` +
                  (l.cantidadRecibida != null && Number(l.cantidadRecibida) < Number(l.cantidad)
                    ? ` (llegaron ${l.cantidadRecibida})`
                    : "")
              )
              .join(" · ");
            return (
              <tr key={m.id} className="border-b border-borde last:border-0">
                <td className="px-3 py-2 font-mono text-xs">MOV-{String(m.id).padStart(4, "0")}</td>
                <td className="px-3 py-2 font-body text-[12.5px]">{new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                <td className="px-3 py-2">
                  <Badge variante={m.tipoMovStock.tipo === "E" ? "ok" : "alerta"}>{m.tipoMovStock.descripcion}</Badge>
                </td>
                <td className="px-3 py-2 font-body text-xs leading-snug">
                  <span className="block font-medium text-[12px] text-tinta">{origenDe(m)}</span>
                  <span className="block text-tinta/55">→ {destinoDe(m)}</span>
                </td>
                <td className="px-3 py-2 font-body text-xs text-tinta/70">{detalle}</td>
                <td className="px-3 py-2"><Cifra tamano={15}>{unidades}</Cifra></td>
                <td className="px-3 py-2">
                  <Badge variante={VARIANTE_ESTADO[m.estado] ?? "neutro"}>{m.estado}</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-tinta/60">{vinculadoDe(m)}</td>
                <td className="px-3 py-2 font-body text-xs text-tinta/60">{m.usuario ?? "—"}</td>
              </tr>
            );
          }}
        />
      </div>
    </div>
  );
}
