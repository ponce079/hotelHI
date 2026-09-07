import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Info, Send, ArrowRight } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Button } from "../../componentes/Button";
import { obtenerRequerimiento, solicitarPresupuestos } from "../requerimientos/requerimientos.api";
import { listarProveedoresActivos } from "../proveedores/proveedores.api";
import { consultarStock } from "../stock/stock.api";
import { ESTADOS_REQUERIMIENTO, RUBROS, rubroCubreCategoria } from "../../lib/constantes";

// HU-82 — elegir a qué proveedores invitar a cotizar. Se dispara desde una
// fila de la bandeja "Por solicitar" en Presupuestos, o desde el botón
// "Solicitar presupuesto" de la ficha del requerimiento.
export function SolicitarPresupuestosModal({ requerimientoId, onClose, onExito }) {
  const queryClient = useQueryClient();

  const [seleccionados, setSeleccionados] = useState([]);
  const [requiereFlete, setRequiereFlete] = useState(false);
  const [error, setError] = useState("");
  // Para no pisar `requiereFlete` con el valor default (false) del estado
  // de arriba la primera vez que `req` llega — solo importa cuando se está
  // sumando un proveedor a una cotización ya en curso (ver más abajo).
  const [fleteInicializado, setFleteInicializado] = useState(false);

  const { data: req, isLoading } = useQuery({
    queryKey: ["requerimiento", String(requerimientoId)],
    queryFn: () => obtenerRequerimiento(requerimientoId),
  });

  // Punto 4 (Comparación de presupuestos): este mismo modal ahora también
  // se abre para "sumar un proveedor más" a un requerimiento que ya está
  // en cotización, no solo para el alta inicial — el backend
  // (solicitarPresupuestos) ya lo permite. En ese caso, el pedido no
  // "pasa" a En cotización (ya está) y el flete es el que ya se fijó al
  // invitar por primera vez, no algo que se vuelva a elegir acá.
  const agregandoAExistente = req?.estado === ESTADOS_REQUERIMIENTO.EN_COTIZACION;
  if (agregandoAExistente && !fleteInicializado) {
    setRequiereFlete(Boolean(req.requiereFlete));
    setFleteInicializado(true);
  }
  const idsYaInvitados = useMemo(
    () => new Set((req?.presupuestos ?? []).map((p) => p.proveedor?.id)),
    [req]
  );

  const { data: proveedores } = useQuery({
    queryKey: ["proveedores-activos"],
    queryFn: () => listarProveedoresActivos(),
  });

  // Solo para el "stock N" del resumen de solo lectura — mismo dato que ya
  // se muestra en la ficha del requerimiento (RequerimientoDetallePage).
  const { data: filasStock } = useQuery({
    queryKey: ["stock", { depositoId: req?.depositoId }],
    queryFn: () => consultarStock({ depositoId: req.depositoId }),
    enabled: Boolean(req?.depositoId),
  });
  const stockPorArticulo = useMemo(
    () => new Map((filasStock ?? []).map((f) => [f.articuloId, f])),
    [filasStock]
  );

  // Las categorías que hay que cubrir (una por artículo pedido) y, a
  // partir de esas, los rubros del padrón que las cubren — es lo que se
  // muestra en el label de la sección ("Proveedores del rubro X / Y").
  // Sin esto, un proveedor "habilitado" no tiene forma de explicarse: el
  // rubro no está en el artículo, está en MAPA_RUBRO_CATEGORIA.
  const categoriasDelPedido = useMemo(() => {
    return new Set((req?.detalle ?? []).map((d) => d.articulo?.categoria).filter(Boolean));
  }, [req]);
  const rubrosDelPedido = useMemo(
    () => RUBROS.filter((r) => [...categoriasDelPedido].some((c) => rubroCubreCategoria(r, c))),
    [categoriasDelPedido]
  );

  function esHabilitado(proveedor) {
    if (categoriasDelPedido.size === 0) return true;
    return proveedor.rubros.some((r) => [...categoriasDelPedido].some((c) => rubroCubreCategoria(r.rubro, c)));
  }

  // Habilitados primero — es la parte accionable de la lista, no tiene
  // sentido que quede intercalada con las tarjetas informativas de abajo.
  // Ya invitados no se listan más acá (punto 4): duplicaría el
  // @@unique([requerimientoId, proveedorId]) y el backend ya lo rechaza —
  // mejor no ofrecerlo que rechazarlo después de tildado.
  const listaOrdenada = useMemo(() => {
    const lista = (proveedores ?? []).filter((p) => !idsYaInvitados.has(p.id));
    return [...lista].sort((a, b) => Number(esHabilitado(b)) - Number(esHabilitado(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedores, categoriasDelPedido, idsYaInvitados]);

  const mutacion = useMutation({
    mutationFn: () => solicitarPresupuestos(requerimientoId, { proveedorIds: seleccionados, requiereFlete }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(requerimientoId)] });
      queryClient.invalidateQueries({ queryKey: ["requerimientos"] });
      onExito(`Presupuestos solicitados a ${seleccionados.length} proveedor${seleccionados.length === 1 ? "" : "es"}.`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudieron solicitar los presupuestos."),
  });

  function toggle(proveedor) {
    if (!esHabilitado(proveedor)) return;
    setSeleccionados((prev) =>
      prev.includes(proveedor.id) ? prev.filter((x) => x !== proveedor.id) : [...prev, proveedor.id]
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (seleccionados.length === 0) return setError("Elegí al menos un proveedor.");
    mutacion.mutate();
  }

  // Punto 4: "no se puede" ahora es un estado distinto de "Pendiente" Y de
  // "En cotización" (Aprobado, Cerrada, Sugerida, Rechazada, o cualquier
  // estado de Transferencia) — el backend ya rechaza esos, esto solo
  // decide qué UI mostrar antes de intentarlo.
  const noSePuedeSolicitar = req && req.estado !== ESTADOS_REQUERIMIENTO.PENDIENTE && !agregandoAExistente;

  const transicion = (
    <span className="whitespace-nowrap rounded-full bg-laton-100 px-3 py-1 text-[11.5px] font-semibold text-laton-700">
      <span className="inline-flex items-center gap-1.5">
        Pendiente <ArrowRight size={12} /> En cotización
      </span>
    </span>
  );

  return (
    <Modal
      titulo={
        req
          ? agregandoAExistente
            ? `Solicitar a otro proveedor · REQ-${String(req.id).padStart(4, "0")}`
            : `Solicitar presupuestos · REQ-${String(req.id).padStart(4, "0")}`
          : "Solicitar presupuestos"
      }
      subtitulo={
        req
          ? agregandoAExistente
            ? `${req.deposito?.nombre ?? "—"} · se suma a la cotización en curso`
            : `${req.deposito?.nombre ?? "—"} · pasa a "En cotización" al enviar`
          : undefined
      }
      extra={!agregandoAExistente && !noSePuedeSolicitar && req ? transicion : null}
      onClose={onClose}
      ancho="max-w-2xl"
    >
      {isLoading ? (
        <p className="px-6 py-8 text-sm text-piedra">Cargando requerimiento…</p>
      ) : !req ? (
        <p className="px-6 py-8 text-sm text-error">No se pudo cargar el requerimiento.</p>
      ) : noSePuedeSolicitar ? (
        <div className="px-6 py-8">
          <p className="text-sm">
            Este requerimiento ya está en estado <strong>{req.estado}</strong>: los presupuestos se piden mientras
            está en "{ESTADOS_REQUERIMIENTO.PENDIENTE}" o "{ESTADOS_REQUERIMIENTO.EN_COTIZACION}".
          </p>
          <div className="mt-5 flex justify-end">
            <Button variante="secundario" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            {error && <p className="text-sm text-error">{error}</p>}

            {/* Resumen de solo lectura: lo que se pidió no se toca acá — se
                arma/edita desde la ficha del requerimiento, esto es
                referencia para elegir bien a quién invitar. */}
            <div className="rounded-lg bg-hueso px-4 py-3.5">
              <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/55">
                <Lock size={12} /> Resumen del requerimiento · solo lectura
              </div>
              <div className="flex flex-col gap-2">
                {req.detalle.map((d) => {
                  const stock = stockPorArticulo.get(d.articuloId);
                  return (
                    <div key={d.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate text-tinta">
                        {d.articulo?.nombre} × {Number(d.cantidadSolicitada)} {d.articulo?.unidadMedida}
                      </span>
                      <span className="flex-none text-piedra">stock {stock ? Number(stock.stockActual) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-tinta/55">
                Proveedores del rubro {rubrosDelPedido.length > 0 ? rubrosDelPedido.join(" / ") : "afín"}
              </div>

              <div className="flex flex-col gap-2">
                {listaOrdenada.length === 0 && (
                  <p className="text-[12.5px] text-piedra">No hay proveedores activos cargados.</p>
                )}
                {listaOrdenada.map((p) => {
                  const habilitado = esHabilitado(p);
                  const elegido = seleccionados.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => toggle(p)}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                        !habilitado
                          ? "cursor-not-allowed border-borde bg-hueso/60"
                          : elegido
                            ? "cursor-pointer border-pino bg-pino-100"
                            : "cursor-pointer border-borde bg-white hover:bg-hueso"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={elegido}
                        disabled={!habilitado}
                        readOnly
                        className="cursor-pointer accent-pino disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0">
                        <div className={`truncate font-body text-[13.5px] font-semibold ${habilitado ? "text-tinta" : "text-tinta/40"}`}>
                          {p.razonSocial}
                        </div>
                        <div className={`text-[11.5px] ${habilitado ? "text-piedra" : "text-tinta/35"}`}>
                          {habilitado ? `Habilitado · ${p.condicionComercial ?? "—"}` : "No habilitado en este rubro · solo informativo"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-2.5 flex items-start gap-1.5 text-[11px] text-piedra">
                <Info size={13} className="mt-px flex-none" /> Solo se listan habilitados en el rubro. No es una
                restricción oculta: si hace falta, se puede invitar a cualquier proveedor activo desde su ficha.
              </p>
              {idsYaInvitados.size > 0 && (
                <p className="mt-1.5 text-[11px] text-piedra">
                  Ya invitados a este requerimiento (no se listan de nuevo):{" "}
                  {(req.presupuestos ?? []).map((p) => p.proveedor?.razonSocial).filter(Boolean).join(", ")}.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-hueso px-4 py-3.5">
              <div>
                <div className="font-body text-[13.5px] font-semibold text-tinta">¿Requiere flete?</div>
                <div className="text-[11.5px] text-piedra">
                  {agregandoAExistente
                    ? "Ya definido al invitar por primera vez — igual para todos los proveedores de este pedido."
                    : "Cada proveedor va a poder cargar su costo aparte del precio."}
                </div>
              </div>
              {agregandoAExistente ? (
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-medium ${
                    requiereFlete ? "bg-tinta text-hueso" : "bg-white text-tinta/60"
                  }`}
                >
                  {requiereFlete ? "Sí" : "No"}
                </span>
              ) : (
                <div className="inline-flex overflow-hidden rounded-full border border-borde">
                  <button
                    type="button"
                    onClick={() => setRequiereFlete(true)}
                    className={`cursor-pointer px-4 py-1.5 text-[12.5px] font-medium ${
                      requiereFlete ? "bg-pino text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
                    }`}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequiereFlete(false)}
                    className={`cursor-pointer px-4 py-1.5 text-[12.5px] font-medium ${
                      !requiereFlete ? "bg-tinta text-hueso" : "bg-transparent text-tinta hover:bg-hueso"
                    }`}
                  >
                    No
                  </button>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full justify-center gap-2 py-3 text-[14px]" disabled={mutacion.isPending}>
              <Send size={16} />
              {mutacion.isPending
                ? "Enviando…"
                : `Enviar solicitud a ${seleccionados.length} proveedor${seleccionados.length === 1 ? "" : "es"}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
