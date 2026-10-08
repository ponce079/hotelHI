import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SlidersHorizontal, ArrowLeft, Save } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { SinPermiso } from "../../componentes/SinPermiso";
import { consultarStock, actualizarParametrosStock } from "./stock.api";
import { listarDepositos } from "../depositos/depositos.api";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";

export function MinMaxPage() {
  const navigate = useNavigate();
  const { puede } = useSesion();
  const [searchParams, setSearchParams] = useSearchParams();
  const depositoId = searchParams.get("depositoId") ?? "";
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: filas, isLoading, isError } = useQuery({
    queryKey: ["stock", { depositoId: depositoId || undefined }],
    queryFn: () => consultarStock(depositoId ? { depositoId } : {}),
  });

  // Valores editables por fila (articuloDepositoId -> {stockMinimo, stockMaximo}),
  // inicializados de lo que trae el servidor y resincronizados si cambia la data.
  const [ediciones, setEdiciones] = useState({});
  useEffect(() => {
    if (!filas) return;
    setEdiciones((prev) => {
      const siguiente = { ...prev };
      for (const f of filas) {
        if (!(f.articuloDepositoId in siguiente)) {
          siguiente[f.articuloDepositoId] = { stockMinimo: String(f.stockMinimo), stockMaximo: String(f.stockMaximo ?? "") };
        }
      }
      return siguiente;
    });
  }, [filas]);

  const mutacion = useMutation({
    mutationFn: ({ articuloDepositoId, payload }) => actualizarParametrosStock(articuloDepositoId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      const fila = filas?.find((f) => f.articuloDepositoId === variables.articuloDepositoId);
      mostrarToast(`Parámetros guardados${fila ? ` — ${fila.nombre}` : ""}.`);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudieron guardar los parámetros.");
    },
  });

  function setEdicion(articuloDepositoId, campo, valor) {
    setEdiciones((prev) => ({ ...prev, [articuloDepositoId]: { ...prev[articuloDepositoId], [campo]: valor } }));
  }

  function guardar(articuloDepositoId) {
    const edicion = ediciones[articuloDepositoId];
    mutacion.mutate({
      articuloDepositoId,
      payload: { stockMinimo: Number(edicion.stockMinimo), stockMaximo: Number(edicion.stockMaximo) },
    });
  }

  if (!puede("param")) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variante="fantasma"
          onClick={() => navigate(depositoId ? `/depositos/${depositoId}` : "/depositos")}
          className="mb-2 text-xs"
          icono={ArrowLeft}
        >
          Volver
        </Button>
        <h1 className="flex items-center gap-2 font-heading text-[34px] font-semibold">
          <SlidersHorizontal size={22} className="text-pino" /> Stock mín. / máx.
        </h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          Parámetros de reposición por artículo y depósito
        </p>
      </div>

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

      {isLoading && <p className="text-sm text-piedra">Cargando…</p>}
      {isError && <p className="text-sm text-error">No se pudo cargar el stock.</p>}

      {filas && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <Table
            columnas={["Artículo", "Depósito", "Actual", "Mínimo", "Máximo", ""]}
            filas={filas}
            vacio="No hay combinaciones artículo–depósito para mostrar."
            renderFila={(f) => {
              const edicion = ediciones[f.articuloDepositoId] ?? { stockMinimo: String(f.stockMinimo), stockMaximo: String(f.stockMaximo ?? "") };
              const invalido =
                edicion.stockMinimo !== "" && edicion.stockMaximo !== "" && Number(edicion.stockMinimo) >= Number(edicion.stockMaximo);
              // Auditoría de botones, P2.3: el primario de fila solo aparece
              // con la fila "dirty" (valor distinto al que trajo el
              // servidor) — en reposo ninguna fila muestra un primario. Se
              // reordena solo: al guardar, el refetch de "stock" trae de
              // vuelta el mismo valor que el usuario tipeó y la fila deja
              // de estar dirty sin tocar ningún estado extra acá.
              const dirty =
                edicion.stockMinimo !== String(f.stockMinimo) || edicion.stockMaximo !== String(f.stockMaximo ?? "");
              return (
                <tr key={f.articuloDepositoId} className="border-b border-borde last:border-0">
                  <td className="px-3 py-2 font-body text-[13.5px] font-semibold">{f.nombre}</td>
                  <td className="px-3 py-2 font-body text-xs text-tinta/55">{f.deposito}</td>
                  <td className="px-3 py-2">
                    <Cifra tamano={15}>{f.stockActual}</Cifra> <span className="font-body text-[11px] text-tinta/50">{f.unidadMedida}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={edicion.stockMinimo}
                      onChange={(e) => setEdicion(f.articuloDepositoId, "stockMinimo", e.target.value)}
                      className={`w-24 rounded-md border px-2 py-1 text-sm ${invalido ? "border-error" : "border-borde"}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      value={edicion.stockMaximo}
                      onChange={(e) => setEdicion(f.articuloDepositoId, "stockMaximo", e.target.value)}
                      className={`w-24 rounded-md border px-2 py-1 text-sm ${invalido ? "border-error" : "border-borde"}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {dirty && (
                      <Button
                        variante="ok"
                        tamano="fila"
                        disabled={invalido || edicion.stockMinimo === "" || edicion.stockMaximo === ""}
                        onClick={() => guardar(f.articuloDepositoId)}
                        icono={Save}
                      >
                        Guardar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            }}
          />
          <p className="mt-3 text-xs text-piedra">
            Regla: mínimo y máximo mayores o iguales a 0, y mínimo estrictamente menor al máximo — se valida antes de guardar.
          </p>
        </div>
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
