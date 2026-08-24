import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, PackagePlus, PackageMinus } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { Toast } from "../../componentes/Toast";
import { registrarEntrada, registrarSalida } from "./movimientos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { listarTiposMovimiento } from "../tipos-movimiento/tiposMovimiento.api";
import { listarHabilitaciones } from "../articulo-deposito/articuloDeposito.api";
import { UNIDADES_MEDIDA_NOMBRES } from "../articulos/articulos.constantes";

const ITEM_VACIO = { articuloId: "", cantidad: "" };
const VACIO = { depositoId: "", tipoMovStockId: "", detalle: "", usuario: "", items: [{ ...ITEM_VACIO }] };

const TABS = [
  { valor: "E", label: "Entrada", icon: PackagePlus, accion: registrarEntrada },
  { valor: "S", label: "Salida", icon: PackageMinus, accion: registrarSalida },
];

export function MovimientoForm() {
  const [tab, setTab] = useState("E");
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [toast, setToast] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const { data: depositos } = useQuery({
    queryKey: ["depositos"],
    queryFn: listarDepositos,
  });
  const { data: tiposMovimiento } = useQuery({
    queryKey: ["tipos-movimiento"],
    queryFn: listarTiposMovimiento,
  });
  const { data: habilitaciones } = useQuery({
    queryKey: ["articulo-depositos"],
    queryFn: listarHabilitaciones,
  });

  const tipoActivo = TABS.find((t) => t.valor === tab);
  const tiposFiltrados = tiposMovimiento?.filter((t) => t.tipo === tab) ?? [];
  const articulosDelDeposito =
    habilitaciones?.filter((h) => h.activo && h.articulo.activo && String(h.depositoId) === String(form.depositoId)) ?? [];

  const mutacion = useMutation({
    mutationFn: tipoActivo.accion,
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      setForm(VACIO);
      setErrores({});
      setToast(`Movimiento de ${tipoActivo.label} registrado (Nº ${resultado.id}).`);
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? `No se pudo registrar el movimiento de ${tipoActivo.label}.`;
      setErrores({ general: mensaje });
    },
  });

  function cambiarTab(valor) {
    setTab(valor);
    setForm(VACIO);
    setErrores({});
  }

  function actualizarItem(index, campo, valor) {
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, [campo]: valor } : item)),
    }));
  }

  function agregarItem() {
    setForm((f) => ({ ...f, items: [...f.items, { ...ITEM_VACIO }] }));
  }

  function quitarItem(index) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }));
  }

  function validar() {
    const nuevosErrores = {};
    if (!form.depositoId) nuevosErrores.depositoId = "Elegí un depósito.";
    if (!form.tipoMovStockId) nuevosErrores.tipoMovStockId = "Elegí un tipo de movimiento.";

    const idsVistos = new Set();
    const erroresItems = form.items.map((item) => {
      const errorItem = {};
      if (!item.articuloId) errorItem.articuloId = "Elegí un artículo.";
      else if (idsVistos.has(item.articuloId)) errorItem.articuloId = "Artículo repetido.";
      idsVistos.add(item.articuloId);
      if (!item.cantidad || Number(item.cantidad) <= 0) errorItem.cantidad = "Cantidad inválida.";
      return errorItem;
    });
    if (erroresItems.some((e) => Object.keys(e).length > 0)) nuevosErrores.items = erroresItems;

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
      detalle: form.detalle.trim() || undefined,
      usuario: form.usuario.trim() || undefined,
      items: form.items.map((item) => ({ articuloId: Number(item.articuloId), cantidad: Number(item.cantidad) })),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-5">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.valor}
            type="button"
            onClick={() => cambiarTab(t.valor)}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.valor ? "bg-pino text-white" : "bg-hueso text-piedra hover:text-tinta"
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {errores.general && <p className="text-sm text-error">{errores.general}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Depósito"
          value={form.depositoId}
          onChange={(e) => setForm({ ...form, depositoId: e.target.value, items: [{ ...ITEM_VACIO }] })}
          error={errores.depositoId}
        >
          <option value="">Seleccionar…</option>
          {depositos?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-1.5">
          <Select
            label="Tipo de movimiento"
            value={form.tipoMovStockId}
            onChange={(e) => setForm({ ...form, tipoMovStockId: e.target.value })}
            error={errores.tipoMovStockId}
          >
            <option value="">Seleccionar…</option>
            {tiposFiltrados.map((t) => (
              <option key={t.id} value={t.id}>
                {t.descripcion}
              </option>
            ))}
          </Select>
          {tiposFiltrados.length === 0 && (
            <p className="text-xs text-piedra">
              No hay tipos de movimiento de {tipoActivo.label} cargados. Cargalos primero en Tipos de Movimiento.
            </p>
          )}
        </div>
        <Input
          label="Detalle (opcional)"
          value={form.detalle}
          onChange={(e) => setForm({ ...form, detalle: e.target.value })}
          placeholder="Motivo del movimiento"
        />
        <Input
          label="Usuario (opcional)"
          value={form.usuario}
          onChange={(e) => setForm({ ...form, usuario: e.target.value })}
          placeholder="Quién lo registra"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-tinta">Artículos</span>
        {!form.depositoId && <p className="text-xs text-piedra">Elegí un depósito para ver sus artículos habilitados.</p>}
        {form.depositoId && articulosDelDeposito.length === 0 && (
          <p className="text-xs text-piedra">Este depósito no tiene artículos habilitados.</p>
        )}
        {form.items.map((item, index) => {
          const elegidosEnOtrasFilas = form.items
            .filter((_, i) => i !== index)
            .map((i) => i.articuloId)
            .filter(Boolean);
          const opcionesDisponibles = articulosDelDeposito.filter(
            (h) => !elegidosEnOtrasFilas.includes(String(h.articulo.id))
          );
          const unidadMedida = articulosDelDeposito.find((h) => String(h.articulo.id) === String(item.articuloId))
            ?.articulo.unidadMedida;

          return (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <Select
                  value={item.articuloId}
                  onChange={(e) => actualizarItem(index, "articuloId", e.target.value)}
                  error={errores.items?.[index]?.articuloId}
                  disabled={!form.depositoId}
                >
                  <option value="">Seleccionar artículo…</option>
                  {opcionesDisponibles.map((h) => (
                    <option key={h.articulo.id} value={h.articulo.id}>
                      {h.articulo.nombre}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-28">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.cantidad}
                  onChange={(e) => actualizarItem(index, "cantidad", e.target.value)}
                  error={errores.items?.[index]?.cantidad}
                  placeholder="Cantidad"
                />
              </div>
              <span className="mt-2.5 w-20 text-xs text-piedra">
                {unidadMedida ? UNIDADES_MEDIDA_NOMBRES[unidadMedida] ?? unidadMedida : ""}
              </span>
              <button
                type="button"
                onClick={() => quitarItem(index)}
                disabled={form.items.length === 1}
                className="mt-2 cursor-pointer text-piedra hover:text-error disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 size={18} />
              </button>
            </div>
          );
        })}
        <Button type="button" variante="secundario" onClick={agregarItem} className="self-start">
          <Plus size={16} /> Agregar artículo
        </Button>
      </div>

      <Button type="submit" disabled={mutacion.isPending} className="self-start">
        <tipoActivo.icon size={16} /> {mutacion.isPending ? "Guardando…" : `Registrar ${tipoActivo.label}`}
      </Button>

      <Toast mensaje={toast} />
    </form>
  );
}
