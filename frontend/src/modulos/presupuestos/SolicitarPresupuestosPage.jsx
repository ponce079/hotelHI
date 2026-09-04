import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Badge } from "../../componentes/Badge";
import { SinPermiso } from "../../componentes/SinPermiso";
import { obtenerRequerimiento, solicitarPresupuestos } from "../requerimientos/requerimientos.api";
import { listarProveedoresActivos } from "../proveedores/proveedores.api";
import { ESTADOS_REQUERIMIENTO } from "../../lib/constantes";
import { useSesion } from "../../lib/sesion";

export function SolicitarPresupuestosPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { puede } = useSesion();

  const [seleccionados, setSeleccionados] = useState([]);
  const [requiereFlete, setRequiereFlete] = useState(false);
  const [soloRubroAfin, setSoloRubroAfin] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const { data: req, isLoading } = useQuery({
    queryKey: ["requerimiento", id],
    queryFn: () => obtenerRequerimiento(id),
  });

  const { data: proveedores } = useQuery({
    queryKey: ["proveedores-activos"],
    queryFn: () => listarProveedoresActivos(),
  });

  // "Rubro afín": los rubros no están en el artículo, así que se infiere
  // por categoría del artículo pedido. Es una ayuda para no scrollear todo
  // el padrón — el toggle "todo el padrón" siempre está a un click.
  const rubrosDelPedido = useMemo(() => {
    const categorias = new Set((req?.detalle ?? []).map((d) => d.articulo?.categoria).filter(Boolean));
    return categorias;
  }, [req]);

  const listaFiltrada = useMemo(() => {
    let lista = proveedores ?? [];
    if (soloRubroAfin && rubrosDelPedido.size > 0) {
      const afines = lista.filter((p) =>
        p.rubros.some((r) => [...rubrosDelPedido].some((c) => sonAfines(r.rubro, c)))
      );
      // Si el filtro deja la grilla vacía no sirve de nada: mejor mostrar
      // el padrón completo que una pantalla en blanco.
      if (afines.length > 0) lista = afines;
    }
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      lista = lista.filter((p) => p.razonSocial.toLowerCase().includes(t) || p.cuit.includes(t));
    }
    return lista;
  }, [proveedores, soloRubroAfin, rubrosDelPedido, q]);

  const mutacion = useMutation({
    mutationFn: () => solicitarPresupuestos(id, { proveedorIds: seleccionados, requiereFlete }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requerimiento", id] });
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      navigate(`/requerimientos/${id}`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudieron solicitar los presupuestos."),
  });

  function toggle(proveedorId) {
    setSeleccionados((prev) =>
      prev.includes(proveedorId) ? prev.filter((x) => x !== proveedorId) : [...prev, proveedorId]
    );
  }

  if (!puede("gestionarPresupuestos")) return <SinPermiso />;
  if (isLoading) return <p className="text-sm text-piedra">Cargando requerimiento…</p>;
  if (!req) return <p className="text-sm text-error">No se pudo cargar el requerimiento.</p>;

  // El backend valida lo mismo (es el que manda), pero avisar acá evita
  // que alguien arme la selección entera para recibir un 409 al final.
  if (req.estado !== ESTADOS_REQUERIMIENTO.PENDIENTE) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => navigate(`/requerimientos/${id}`)}
          className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
        >
          <ArrowLeft size={15} /> Volver al requerimiento
        </button>
        <div className="rounded-lg border border-borde bg-white p-6">
          <p className="text-sm">
            Este requerimiento ya está en estado <strong>{req.estado}</strong>: los presupuestos se piden una sola vez,
            cuando todavía está en "{ESTADOS_REQUERIMIENTO.PENDIENTE}".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          onClick={() => navigate(`/requerimientos/${id}`)}
          className="mb-2 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
        >
          <ArrowLeft size={15} /> Volver al requerimiento
        </button>
        <h1 className="font-heading text-[34px] font-semibold">Solicitar presupuestos</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU-82 · REQ-{String(req.id).padStart(4, "0")} — {req.deposito?.nombre}
        </p>
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-3 font-heading text-[18px] font-semibold text-tinta">Lo que se va a cotizar</h2>
        <Table
          columnas={["Artículo", "Unidad", "Cantidad"]}
          columnasDerecha={["Cantidad"]}
          filas={req.detalle}
          renderFila={(d) => (
            <tr key={d.id} className="border-b border-borde last:border-0">
              <td className="px-3 py-2 font-body text-[13px] font-semibold">{d.articulo?.nombre}</td>
              <td className="px-3 py-2 font-body text-[12.5px]">{d.articulo?.unidadMedida}</td>
              <td className="px-3 py-2 text-right font-heading text-[14px]">{Number(d.cantidadSolicitada)}</td>
            </tr>
          )}
        />
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-[18px] font-semibold text-tinta">¿A quiénes les pedimos?</h2>
          <div className="inline-flex overflow-hidden rounded-full border border-borde">
            <button
              type="button"
              onClick={() => setSoloRubroAfin(true)}
              className={`cursor-pointer px-4 py-1.5 text-[12.5px] font-medium ${
                soloRubroAfin ? "bg-pino text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
              }`}
            >
              Rubro afín
            </button>
            <button
              type="button"
              onClick={() => setSoloRubroAfin(false)}
              className={`cursor-pointer px-4 py-1.5 text-[12.5px] font-medium ${
                !soloRubroAfin ? "bg-tinta text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
              }`}
            >
              Todo el padrón
            </button>
          </div>
        </div>

        <div className="relative mt-3">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar proveedor…"
            className="w-full rounded-md border border-borde bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </div>

        <div className="mt-3">
          <Table
            columnas={["", "Proveedor", "CUIT", "Rubros", "Condición"]}
            filas={listaFiltrada}
            vacio="No hay proveedores activos que coincidan."
            renderFila={(p) => {
              const elegido = seleccionados.includes(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() => toggle(p.id)}
                  className={`cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${elegido ? "bg-pino-100" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={elegido} readOnly className="cursor-pointer accent-pino" />
                  </td>
                  <td className="px-3 py-2 font-body text-[13px] font-semibold">{p.razonSocial}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.cuit}</td>
                  <td className="px-3 py-2 font-body text-[12px] text-tinta/70">
                    {p.rubros.map((r) => r.rubro).join(" · ")}
                  </td>
                  <td className="px-3 py-2 font-body text-[12.5px]">{p.condicionComercial ?? "—"}</td>
                </tr>
              );
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-borde bg-white p-5">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={requiereFlete}
            onChange={(e) => setRequiereFlete(e.target.checked)}
            className="cursor-pointer accent-pino"
          />
          <span className="font-body text-[13.5px] text-tinta">
            ¿Requiere flete?
            <span className="ml-1 text-[11.5px] text-piedra">
              Si lo tildás, cada proveedor va a poder cargar su costo de flete aparte del precio de los artículos.
            </span>
          </span>
        </label>
        <Badge variante={seleccionados.length > 0 ? "ok" : "neutro"}>
          {seleccionados.length} proveedor{seleccionados.length === 1 ? "" : "es"} seleccionado
          {seleccionados.length === 1 ? "" : "s"}
        </Badge>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex justify-end gap-2.5">
        <Button variante="secundario" onClick={() => navigate(`/requerimientos/${id}`)}>Cancelar</Button>
        <Button
          onClick={() => {
            setError("");
            if (seleccionados.length === 0) return setError("Elegí al menos un proveedor.");
            mutacion.mutate();
          }}
          disabled={mutacion.isPending}
        >
          {mutacion.isPending ? "Enviando…" : "Enviar solicitud"}
        </Button>
      </div>

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
        Al enviar la solicitud el requerimiento pasa a "En cotización" y queda un presupuesto en estado "Solicitado"
        por cada proveedor invitado, listo para cargarle los precios cuando conteste.
      </p>
    </div>
  );
}

// Heurística simple entre la categoría del artículo (catálogo de Sprint 1)
// y el rubro del proveedor (Sprint 2). No son la misma lista, así que se
// emparejan las que claramente se solapan y el resto cae en "todo el padrón".
function sonAfines(rubro, categoria) {
  const mapa = {
    Limpieza: ["Limpieza"],
    Amenities: ["Amenities"],
    Alimentos: ["Alimentos y Bebidas"],
    Bebidas: ["Alimentos y Bebidas"],
    "Blancos y textiles": ["Blanquería"],
    Mantenimiento: ["Mantenimiento", "Equipamiento y Electrodomésticos"],
    "Bazar y menaje": ["Equipamiento y Electrodomésticos", "Papelería y Oficina"],
  };
  return (mapa[rubro] ?? []).includes(categoria);
}
