import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowDown } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { listarDepositos } from "../depositos/depositos.api";
import { registrarEntrada, listarTiposMovimientoEntrada, listarArticulosParaSelect } from "./movimientoEntrada.api";

const ITEM_VACIO = { articuloId: "", cantidad: "" };
const FORM_VACIO = { depositoId: "", tipoMovStockId: "", detalle: "" };

export function MovimientoEntradaForm() {
  const [form, setForm] = useState(FORM_VACIO);
  const [items, setItems] = useState([{ ...ITEM_VACIO }]);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: tiposMovimiento } = useQuery({
    queryKey: ["tipos-movimiento", "entrada"],
    queryFn: listarTiposMovimientoEntrada,
  });
  const { data: articulos } = useQuery({ queryKey: ["articulos", "select"], queryFn: listarArticulosParaSelect });

  const mutacion = useMutation({
    mutationFn: registrarEntrada,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      setForm(FORM_VACIO);
      setItems([{ ...ITEM_VACIO }]);
      setErrores({});
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo registrar la entrada.";
      setErrores({ general: mensaje });
    },
  });

  function actualizarItem(index, campo, valor) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [campo]: valor } : it)));
  }

  function agregarItem() {
    setItems((prev) => [...prev, { ...ITEM_VACIO }]);
  }

  function quitarItem(index) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function validar() {
    const nuevosErrores = {};
    if (!form.depositoId) nuevosErrores.depositoId = "Elegí un depósito.";
    if (!form.tipoMovStockId) nuevosErrores.tipoMovStockId = "Elegí un tipo de movimiento.";

    const articuloIds = items.map((it) => it.articuloId).filter(Boolean);
    if (articuloIds.length === 0) nuevosErrores.items = "Agregá al menos un artículo.";
    if (new Set(articuloIds).size !== articuloIds.length) {
      nuevosErrores.items = "No podés repetir el mismo artículo en dos renglones.";
    }
    if (items.some((it) => it.articuloId && !(Number(it.cantidad) > 0))) {
      nuevosErrores.items = "Cada artículo necesita una cantidad mayor a 0.";
    }
    return nuevosErrores;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    mutacion.mutate({
      depositoId: Number(form.depositoId),
      tipoMovStockId: Number(form.tipoMovStockId),
      detalle: form.detalle || undefined,
      items: items
        .filter((it) => it.articuloId)
        .map((it) => ({ articuloId: Number(it.articuloId), cantidad: Number(it.cantidad) })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-5">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <ArrowDown size={20} className="text-pino" /> Nueva entrada de stock
      </h2>

      {errores.general && <p className="text-sm text-error">{errores.general}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Select
          label="Depósito"
          value={form.depositoId}
          onChange={(e) => setForm({ ...form, depositoId: e.target.value })}
          error={errores.depositoId}
        >
          <option value="">Seleccionar...</option>
          {(depositos ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </Select>

        <Select
          label="Tipo de movimiento"
          value={form.tipoMovStockId}
          onChange={(e) => setForm({ ...form, tipoMovStockId: e.target.value })}
          error={errores.tipoMovStockId}
        >
          <option value="">Seleccionar...</option>
          {(tiposMovimiento ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.descripcion}
            </option>
          ))}
        </Select>

        <Input
          label="Detalle (opcional)"
          value={form.detalle}
          onChange={(e) => setForm({ ...form, detalle: e.target.value })}
          placeholder="Compra recibida - Remito 0001-00012345"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-tinta">Artículos</span>
        {errores.items && <p className="text-sm text-error">{errores.items}</p>}

        {items.map((item, index) => (
          <div key={index} className="flex items-end gap-2">
            <Select
              className="flex-1"
              value={item.articuloId}
              onChange={(e) => actualizarItem(index, "articuloId", e.target.value)}
            >
              <option value="">Seleccionar artículo...</option>
              {(articulos ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Cantidad"
              className="w-32"
              value={item.cantidad}
              onChange={(e) => actualizarItem(index, "cantidad", e.target.value)}
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => quitarItem(index)}
                className="cursor-pointer rounded-md p-2 text-piedra hover:text-error"
                aria-label="Quitar artículo"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        ))}

        <Button type="button" variante="secundario" onClick={agregarItem} className="self-start">
          <Plus size={16} /> Agregar artículo
        </Button>
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        {mutacion.isPending ? "Guardando..." : "Registrar entrada"}
      </Button>
    </form>
  );
}
