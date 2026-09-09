import { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { Cifra } from "../../componentes/Cifra";
import { Toast } from "../../componentes/Toast";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { obtenerDeposito } from "./depositos.api";
import { consultarStock } from "../stock/stock.api";
import { listarMovimientos } from "../movimientos/movimientos.api";
import { cambiarEstadoHabilitacion } from "../articulo-deposito/articuloDeposito.api";
import { HabilitarArticuloModal } from "../articulo-deposito/HabilitarArticuloModal";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";

function calcularEstado(stockActual, stockMinimo, stockMaximo) {
  const cant = Number(stockActual);
  const min = Number(stockMinimo);
  const max = stockMaximo == null ? null : Number(stockMaximo);
  if (cant <= min) return { label: "Crítico", variante: "error", barra: "bg-error" };
  if (cant <= Math.round(min * 1.25)) return { label: "Bajo", variante: "alerta", barra: "bg-alerta" };
  if (max != null && cant >= max) return { label: "Exceso", variante: "neutro", barra: "bg-piedra" };
  return { label: "Normal", variante: "ok", barra: "bg-exito" };
}

export function DepositoDetallePage() {
  const { id } = useParams();
  const depositoId = Number(id);
  const navigate = useNavigate();
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [habilitarAbierto, setHabilitarAbierto] = useState(false);
  const [paraCambiarEstado, setParaCambiarEstado] = useState(null); // fila de stock

  const cat = searchParams.get("cat") ?? "Todas";
  const q = searchParams.get("q") ?? "";
  const soloCriticos = searchParams.get("criticos") === "1";

  const queryClient = useQueryClient();

  const { data: deposito, isLoading: cargandoDeposito, isError: errorDeposito } = useQuery({
    queryKey: ["depositos", depositoId],
    queryFn: () => obtenerDeposito(depositoId),
    enabled: Number.isInteger(depositoId),
  });
  const { data: filas, isLoading: cargandoStock } = useQuery({
    queryKey: ["stock", { depositoId, incluirInactivos: true }],
    queryFn: () => consultarStock({ depositoId, incluirInactivos: true }),
    enabled: Number.isInteger(depositoId),
  });
  const { data: enTransito } = useQuery({
    queryKey: ["movimientos", { destinoId: depositoId, estado: "En tránsito" }],
    queryFn: () => listarMovimientos({ destinoId: depositoId, estado: "En tránsito" }),
    enabled: Number.isInteger(depositoId),
  });

  const mutacionEstado = useMutation({
    mutationFn: ({ articuloDepositoId, activo }) => cambiarEstadoHabilitacion(articuloDepositoId, activo),
    onSuccess: (habilitacion) => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      queryClient.invalidateQueries({ queryKey: ["articulo-depositos"] });
      mostrarToast(
        `${habilitacion.articulo?.nombre ?? "Artículo"} ahora está ${habilitacion.activo ? "habilitado" : "deshabilitado"} en este depósito.`
      );
      setParaCambiarEstado(null);
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo cambiar la habilitación.");
      setParaCambiarEstado(null);
    },
  });

  function actualizarFiltro(clave, valor) {
    const params = new URLSearchParams(searchParams);
    if (valor && valor !== "Todas" && valor !== "0") {
      params.set(clave, valor);
    } else {
      params.delete(clave);
    }
    setSearchParams(params);
  }

  if (cargandoDeposito) return <p className="text-sm text-piedra">Cargando depósito…</p>;
  if (errorDeposito || !deposito) return <p className="text-sm text-error">No se pudo cargar el depósito.</p>;

  const filasConEstado = (filas ?? []).map((f) => ({ ...f, estado: calcularEstado(f.stockActual, f.stockMinimo, f.stockMaximo) }));
  const categorias = ["Todas", ...new Set(filasConEstado.map((f) => f.categoria))];
  // Un articulo deshabilitado en este deposito desaparece de la lista — para
  // eso existe el boton "+ Habilitar articulo", que lo reactiva. No se
  // muestra grisado con un boton "Rehabilitar" al lado.
  const filasFiltradas = filasConEstado.filter(
    (f) =>
      f.activo &&
      (cat === "Todas" || f.categoria === cat) &&
      f.nombre.toLowerCase().includes(q.toLowerCase()) &&
      (!soloCriticos || f.estado.label === "Crítico")
  );

  const totalArticulos = filasConEstado.filter((f) => f.activo).length;
  const totalUnidades = filasConEstado.reduce((acc, f) => acc + Number(f.stockActual), 0);
  const totalCriticos = filasConEstado.filter((f) => f.activo && f.estado.label === "Crítico").length;
  const totalPorRecibir = enTransito?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variante="fantasma" onClick={() => navigate("/depositos")} className="mb-2 text-xs">
          ← Depósitos
        </Button>
        <h1 className="font-heading text-[34px] font-semibold">{deposito.nombre}</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          {deposito.ubicacion} · responsable: {deposito.responsable}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <div className="flex flex-col items-center gap-0.5 rounded-[18.4px] bg-white px-5 py-4 text-center">
          <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pino">Artículos habilitados</div>
          <Cifra tamano={28}>{totalArticulos}</Cifra>
        </div>
        <div className="flex flex-col items-center gap-0.5 rounded-[18.4px] bg-white px-5 py-4 text-center">
          <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pino">Unidades en depósito</div>
          <Cifra tamano={28}>{totalUnidades}</Cifra>
        </div>
        <div
          className={`flex flex-col items-center gap-0.5 rounded-[18.4px] px-5 py-4 text-center ${
            totalCriticos > 0 ? "bg-error-suave" : "bg-[#ece6d9]"
          }`}
        >
          <div className={`font-body text-[10px] uppercase tracking-[0.1em] ${totalCriticos > 0 ? "text-error-texto" : "text-tinta/60"}`}>
            En estado crítico
          </div>
          <Cifra tamano={28} className={totalCriticos > 0 ? "text-error-texto" : ""}>{totalCriticos}</Cifra>
          <div className="font-body text-[11px] text-tinta/55">stock ≤ mínimo</div>
        </div>
        <div className="flex flex-col items-center gap-0.5 rounded-[18.4px] bg-pino-100 px-5 py-4 text-center">
          <div className="font-body text-[10px] uppercase tracking-[0.1em] text-pino">Por recibir</div>
          <Cifra tamano={28}>{totalPorRecibir}</Cifra>
          <div className="font-body text-[11px] text-tinta/55">transferencias en tránsito</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-[12px] text-tinta/70">Categoría</span>
          <select
            value={cat}
            onChange={(e) => actualizarFiltro("cat", e.target.value)}
            className="cursor-pointer rounded-md border border-borde px-3 py-2 text-sm"
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="relative flex-1 min-w-[200px]">
          <span className="mb-1.5 block text-[12px] text-tinta/70">Artículo</span>
          <Search size={15} className="pointer-events-none absolute left-2.5 top-[38px] text-piedra" />
          <input
            value={q}
            onChange={(e) => actualizarFiltro("q", e.target.value)}
            placeholder="Nombre o código…"
            className="w-full rounded-md border border-borde py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>
        <button
          type="button"
          onClick={() => actualizarFiltro("criticos", soloCriticos ? "0" : "1")}
          className={`h-[38px] cursor-pointer rounded-full border px-4 text-xs font-semibold ${
            soloCriticos ? "border-pino bg-pino text-hueso" : "border-borde bg-white text-tinta hover:bg-hueso"
          }`}
        >
          Sólo críticos
        </button>
        <div className="ml-auto flex gap-2">
          {puede("operar") && <Button variante="alta" onClick={() => setHabilitarAbierto(true)}>+ Habilitar artículo</Button>}
          {puede("param") && (
            <Button variante="secundario" onClick={() => navigate(`/stock/minmax?depositoId=${depositoId}`)}>
              Parámetros mín. / máx.
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        {cargandoStock && <p className="mb-3 text-sm text-piedra">Cargando stock…</p>}
        <Table
          columnas={["Artículo", "Categoría", "Stock", "Nivel", "Mín.", "Máx.", "Estado", "Acciones"]}
          columnasDerecha={["Acciones"]}
          filas={filasFiltradas}
          vacio="Ningún artículo del depósito coincide con los filtros."
          renderFila={(f) => {
            const barW = f.stockMaximo ? Math.min(100, Math.round((Number(f.stockActual) / Number(f.stockMaximo)) * 100)) : 0;
            return (
              <tr key={f.articuloDepositoId} className="border-b border-borde last:border-0">
                <td className="px-3 py-2">
                  <div className="font-body text-[13.5px] font-semibold">{f.nombre}</div>
                </td>
                <td className="px-3 py-2 font-body text-[12.5px]">{f.categoria}</td>
                <td className="px-3 py-2">
                  <Cifra tamano={15}>{f.stockActual}</Cifra> <span className="font-body text-[11px] text-tinta/50">{f.unidadMedida}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-hueso">
                    <div className={`h-full rounded-full ${f.estado.barra}`} style={{ width: `${barW}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-piedra">{f.stockMinimo}</td>
                <td className="px-3 py-2 text-xs text-piedra">{f.stockMaximo ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variante={f.estado.variante}>{f.estado.label}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {/* Auditoría de botones, P3.3 */}
                  <MenuAcciones
                    acciones={[
                      {
                        label: "Kardex",
                        onClick: () => navigate(`/kardex?articuloId=${f.articuloId}&depositoId=${depositoId}`),
                      },
                      ...(puede("operar")
                        ? [{ label: "Deshabilitar", variante: "destructivo", onClick: () => setParaCambiarEstado(f) }]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            );
          }}
        />
      </div>

      {habilitarAbierto && (
        <HabilitarArticuloModal
          depositoId={depositoId}
          depositoNombre={deposito.nombre}
          onClose={() => setHabilitarAbierto(false)}
          onExito={(mensaje) => {
            setHabilitarAbierto(false);
            mostrarToast(mensaje);
          }}
        />
      )}

      <ConfirmDialog
        abierto={Boolean(paraCambiarEstado)}
        titulo="¿Deshabilitar artículo?"
        mensaje={
          paraCambiarEstado?.stockActual > 0
            ? `Quedan ${paraCambiarEstado?.stockActual} ${paraCambiarEstado?.unidadMedida} de "${paraCambiarEstado?.nombre}" en este depósito. Deshabilitarlo igual no borra ese stock, pero el artículo desaparece de esta lista y deja de poder elegirse en nuevos movimientos acá — podés volver a habilitarlo con "+ Habilitar artículo".`
            : `"${paraCambiarEstado?.nombre}" desaparecerá de esta lista y dejará de poder elegirse en nuevos movimientos de este depósito. Podés volver a habilitarlo con "+ Habilitar artículo" cuando quieras.`
        }
        textoConfirmar="Sí, deshabilitar"
        variante="destructivo"
        onCancelar={() => setParaCambiarEstado(null)}
        onConfirmar={() => mutacionEstado.mutate({ articuloDepositoId: paraCambiarEstado.articuloDepositoId, activo: false })}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
