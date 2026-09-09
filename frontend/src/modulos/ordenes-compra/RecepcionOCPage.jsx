import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { obtenerOrdenCompra, registrarRecepcionOC } from "./ordenesCompra.api";

// Mismo patrón que RecepcionesPage.jsx (HU-14/17, Sprint 1): un input de
// cantidad recibida por línea, precargado con la cantidad solicitada,
// estado en vivo por línea, y un resumen antes de confirmar. La diferencia
// principal es que acá la unidad de trabajo es una OC completa (una sola
// confirmación para todas las líneas), no una transferencia entre depósitos.
export function RecepcionOCPage() {
  const { id } = useParams();
  const ocId = Number(id);
  const navigate = useNavigate();
  const { puede, usuario } = useSesion();
  const tienePermiso = puede("recibirOC");
  const queryClient = useQueryClient();

  const [recibidos, setRecibidos] = useState({}); // articuloId -> valor string
  const [confirmando, setConfirmando] = useState(false);

  const { data: oc, isLoading, isError } = useQuery({
    queryKey: ["ordenes-compra", "orden", ocId],
    queryFn: () => obtenerOrdenCompra(ocId),
    enabled: tienePermiso && Number.isInteger(ocId),
  });

  const mutacion = useMutation({
    mutationFn: (detalle) => registrarRecepcionOC(ocId, detalle, usuario),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
      queryClient.invalidateQueries({ queryKey: ["stock"] }); // la recepción suma stock real
      navigate(`/ordenes-compra/${ocId}`);
    },
    onError: () => setConfirmando(false),
  });

  function valorDe(d) {
    const v = recibidos[d.articuloId];
    return v === undefined ? String(d.cantidad) : v;
  }

  function setValor(articuloId, valor) {
    setRecibidos((prev) => ({ ...prev, [articuloId]: valor }));
  }

  function recibirTodo() {
    const lineas = {};
    oc.detalle.forEach((d) => {
      lineas[d.articuloId] = String(d.cantidad);
    });
    setRecibidos(lineas);
  }

  function estadoDeLinea(d) {
    const valor = valorDe(d);
    const n = Number(valor);
    if (valor === "" || !Number.isFinite(n) || n < 0) return "invalida";
    if (n > Number(d.cantidad)) return "invalida";
    if (n < Number(d.cantidad)) return "diferencia";
    return "completa";
  }

  const estados = oc ? oc.detalle.map(estadoDeLinea) : [];
  const hayInvalida = estados.includes("invalida");
  const hayDiferencia = estados.includes("diferencia");

  function confirmar() {
    const detalle = oc.detalle.map((d) => ({ articuloId: d.articuloId, cantidadRecibida: Number(valorDe(d)) }));
    mutacion.mutate(detalle);
  }

  if (!tienePermiso) return <SinPermiso />;
  if (isLoading) return <p className="py-16 text-center text-sm text-piedra">Cargando…</p>;
  if (isError || !oc) return <p className="py-16 text-center text-sm text-error">No se pudo cargar la orden de compra.</p>;

  if (oc.estado !== "Enviada") {
    return (
      <div className="flex flex-col gap-4">
        <Button variante="fantasma" onClick={() => navigate(`/ordenes-compra/${ocId}`)} className="w-fit text-xs">
          ← Volver a la orden
        </Button>
        <div className="rounded-[18.4px] bg-white px-6 py-8 text-center text-sm text-piedra">
          Esta orden está en estado <strong>{oc.estado}</strong> — solo se puede registrar recepción de una orden{" "}
          <strong>Enviada</strong>.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variante="fantasma" onClick={() => navigate(`/ordenes-compra/${ocId}`)} className="w-fit text-xs">
        ← Volver a la orden
      </Button>

      <div>
        <h1 className="flex items-center gap-2 font-heading text-[30px] font-semibold">
          <PackageCheck size={24} className="text-pino" /> Recepción de compra — {oc.numero}
        </h1>
        <p className="mt-1.5 font-body text-[12.5px] text-tinta/60">
          {oc.proveedor?.razonSocial} · Depósito {oc.deposito?.nombre}
        </p>
      </div>

      <div className="rounded-[18.4px] bg-white px-6 py-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borde text-left font-body text-xs font-semibold uppercase tracking-wide text-tinta/55">
                <th className="pb-2">Artículo</th>
                <th className="w-24 pb-2">Solicitado</th>
                <th className="w-36 pb-2">Recibido</th>
                <th className="w-40 pb-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {oc.detalle.map((d) => {
                const estado = estadoDeLinea(d);
                return (
                  <tr key={d.articuloId} className="border-t border-borde">
                    <td className="py-2.5 font-body text-[13.5px] font-semibold">{d.articulo?.nombre}</td>
                    <td className="py-2.5">
                      <Cifra tamano={14}>{Number(d.cantidad)}</Cifra>
                    </td>
                    <td className="py-2.5">
                      <input
                        type="number"
                        min="0"
                        max={Number(d.cantidad)}
                        value={valorDe(d)}
                        onChange={(e) => setValor(d.articuloId, e.target.value)}
                        className={`w-24 rounded-md border px-2 py-1 text-sm ${estado === "invalida" ? "border-error" : "border-borde"}`}
                      />
                    </td>
                    <td className="py-2.5">
                      {estado === "invalida" && <Badge variante="error">Cantidad inválida</Badge>}
                      {estado === "diferencia" && <Badge variante="alerta">Con diferencia</Badge>}
                      {estado === "completa" && <Badge variante="ok">Completa</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variante="secundario" onClick={recibirTodo}>
            Recibí todo
          </Button>
        </div>
      </div>

      {hayDiferencia && !hayInvalida && (
        <div className="rounded-[18.4px] bg-laton-100 px-4 py-3.5 text-[13px] text-laton-700">
          Al confirmar con diferencia, el stock de {oc.deposito?.nombre} se actualiza solo por lo efectivamente recibido y la
          orden queda marcada <strong>Recibida con diferencia</strong>.
        </div>
      )}
      {hayInvalida && (
        <div className="rounded-[18.4px] bg-error-suave px-4 py-3.5 text-[13px] text-error-texto">
          Hay líneas con una cantidad inválida (negativa o mayor a lo solicitado) — corregilas antes de confirmar.
        </div>
      )}

      <div className="flex justify-end">
        <Button variante="ok" disabled={hayInvalida} onClick={() => setConfirmando(true)}>
          Confirmar recepción
        </Button>
      </div>

      <ConfirmDialog
        abierto={confirmando}
        titulo={hayDiferencia ? "Confirmar con diferencia" : "Confirmar recepción completa"}
        mensaje={
          hayDiferencia
            ? `Se registrará la entrada en ${oc.deposito?.nombre} por la cantidad recibida y la orden quedará marcada Recibida con diferencia.`
            : `Se registrará la entrada completa en ${oc.deposito?.nombre} y la orden quedará marcada Recibida.`
        }
        textoConfirmar={mutacion.isPending ? "Confirmando…" : "Confirmar recepción"}
        variante="ok"
        onCancelar={() => setConfirmando(false)}
        onConfirmar={confirmar}
      />
    </div>
  );
}
