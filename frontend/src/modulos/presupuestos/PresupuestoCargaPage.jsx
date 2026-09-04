import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { MoneyInput } from "../../componentes/MoneyInput";
import { SinPermiso } from "../../componentes/SinPermiso";
import { obtenerPresupuesto, cargarPresupuesto } from "./presupuestos.api";
import { ESTADOS_PRESUPUESTO } from "../../lib/constantes";
import { formatearMonto } from "../../lib/moneda";
import { useSesion } from "../../lib/sesion";

export function PresupuestoCargaPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { puede } = useSesion();

  const [precios, setPrecios] = useState({});
  const [plazoEntrega, setPlazoEntrega] = useState("");
  const [costoFlete, setCostoFlete] = useState("");
  const [error, setError] = useState("");

  const { data: presupuesto, isLoading } = useQuery({
    queryKey: ["presupuesto", id],
    queryFn: () => obtenerPresupuesto(id),
  });

  // Memoizado para que no sea un array nuevo en cada render: si no, el
  // useMemo del total se recalcularía siempre y el lint lo marca.
  const lineas = useMemo(() => presupuesto?.requerimiento?.detalle ?? [], [presupuesto]);
  const requiereFlete = presupuesto?.requerimiento?.requiereFlete;

  // Total en vivo: Σ (precio × cantidad) + flete. El backend recalcula lo
  // mismo al guardar y su número es el que vale — este es solo la vista
  // previa mientras se tipea.
  const totales = useMemo(() => {
    const subtotal = lineas.reduce(
      (acc, d) => acc + Number(precios[d.articuloId] || 0) * Number(d.cantidadSolicitada),
      0
    );
    const flete = requiereFlete ? Number(costoFlete || 0) : 0;
    return { subtotal, flete, total: subtotal + flete };
  }, [lineas, precios, costoFlete, requiereFlete]);

  const mutacion = useMutation({
    mutationFn: () =>
      cargarPresupuesto(id, {
        precios: lineas.map((d) => ({
          articuloId: d.articuloId,
          precioUnitario: Number(precios[d.articuloId]),
        })),
        plazoEntrega,
        costoFlete: requiereFlete ? Number(costoFlete || 0) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presupuesto", id] });
      queryClient.invalidateQueries({ queryKey: ["requerimiento", String(presupuesto.requerimientoId)] });
      queryClient.invalidateQueries({ queryKey: ["presupuestos"] });
      navigate(`/presupuestos?requerimientoId=${presupuesto.requerimientoId}`);
    },
    onError: (err) => setError(err?.response?.data?.error ?? "No se pudo cargar el presupuesto."),
  });

  if (!puede("gestionarPresupuestos")) return <SinPermiso />;
  if (isLoading) return <p className="text-sm text-piedra">Cargando presupuesto…</p>;
  if (!presupuesto) return <p className="text-sm text-error">No se pudo cargar el presupuesto.</p>;

  if (presupuesto.estado !== ESTADOS_PRESUPUESTO.SOLICITADO) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => navigate(`/presupuestos/${id}`)}
          className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
        >
          <ArrowLeft size={15} /> Ver el presupuesto
        </button>
        <div className="rounded-lg border border-borde bg-white p-6">
          <p className="text-sm">
            Este presupuesto ya está en estado <strong>{presupuesto.estado}</strong>: la carga de precios se hace una
            sola vez, mientras está en "{ESTADOS_PRESUPUESTO.SOLICITADO}".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          onClick={() => navigate(`/requerimientos/${presupuesto.requerimientoId}`)}
          className="mb-2 inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-piedra hover:text-tinta"
        >
          <ArrowLeft size={15} /> Volver al requerimiento
        </button>
        <h1 className="font-heading text-[34px] font-semibold">Cargar presupuesto</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU-83 · {presupuesto.proveedor?.razonSocial} — REQ-{String(presupuesto.requerimientoId).padStart(4, "0")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Dato etiqueta="Proveedor" valor={presupuesto.proveedor?.razonSocial} />
        <Dato etiqueta="CUIT" valor={presupuesto.proveedor?.cuit} />
        <Dato etiqueta="Condición comercial" valor={presupuesto.proveedor?.condicionComercial} />
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <h2 className="mb-3 font-heading text-[18px] font-semibold text-tinta">Precios cotizados</h2>
        <Table
          columnas={["Artículo", "Unidad", "Cantidad", "Precio unitario", "Subtotal"]}
          columnasDerecha={["Cantidad", "Precio unitario", "Subtotal"]}
          filas={lineas}
          renderFila={(d) => {
            const precio = Number(precios[d.articuloId] || 0);
            const subtotal = precio * Number(d.cantidadSolicitada);
            return (
              <tr key={d.id} className="border-b border-borde last:border-0">
                <td className="px-3 py-2 font-body text-[13px] font-semibold">{d.articulo?.nombre}</td>
                <td className="px-3 py-2 font-body text-[12.5px]">{d.articulo?.unidadMedida}</td>
                <td className="px-3 py-2 text-right font-body text-[13px]">{Number(d.cantidadSolicitada)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <div className="w-40">
                      <MoneyInput
                        value={precios[d.articuloId] ?? ""}
                        onChange={(v) => setPrecios((prev) => ({ ...prev, [d.articuloId]: v }))}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-heading text-[14px]">
                  {subtotal > 0 ? `$ ${formatearMonto(subtotal)}` : <span className="text-piedra">—</span>}
                </td>
              </tr>
            );
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-borde bg-white p-5">
          <Input
            label="Plazo de entrega"
            value={plazoEntrega}
            onChange={(e) => setPlazoEntrega(e.target.value)}
            placeholder="ej. 5 días hábiles"
          />
        </div>

        <div className="rounded-lg border border-borde bg-white p-5">
          {requiereFlete ? (
            <MoneyInput label="Costo de flete" value={costoFlete} onChange={setCostoFlete} />
          ) : (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-tinta/55">Costo de flete</div>
              <p className="mt-1.5 text-[12.5px] text-piedra">
                Este requerimiento no pidió flete, así que no se carga.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-pino bg-pino-100 p-5">
          <div className="text-[10px] uppercase tracking-wide text-pino-700">Total del presupuesto</div>
          <Cifra tamano={28} className="mt-0.5 block text-pino-700">$ {formatearMonto(totales.total)}</Cifra>
          <div className="mt-1.5 text-[11.5px] text-pino-700">
            Artículos $ {formatearMonto(totales.subtotal)}
            {requiereFlete && ` + flete $ ${formatearMonto(totales.flete)}`}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="flex justify-end gap-2.5">
        <Button variante="secundario" onClick={() => navigate(`/requerimientos/${presupuesto.requerimientoId}`)}>
          Cancelar
        </Button>
        <Button
          onClick={() => {
            setError("");
            const faltantes = lineas.filter((d) => !(Number(precios[d.articuloId]) > 0));
            if (faltantes.length > 0) return setError("Cargá el precio unitario de todos los artículos.");
            mutacion.mutate();
          }}
          disabled={mutacion.isPending}
        >
          {mutacion.isPending ? "Guardando…" : "Guardar presupuesto"}
        </Button>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="rounded-lg border border-borde bg-white p-4">
      <div className="text-[10px] uppercase tracking-wide text-tinta/55">{etiqueta}</div>
      <div className="mt-0.5 font-body text-[13.5px] text-tinta">{valor || "—"}</div>
    </div>
  );
}
