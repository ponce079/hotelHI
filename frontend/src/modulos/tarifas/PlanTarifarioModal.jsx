import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearPlanTarifario, actualizarPlanTarifario, listarPlanesTarifarios } from "./tarifas.api";
import { TIPOS_PLAN, PENALIDADES_NO_SHOW, PENALIDAD_NO_SHOW_LABEL, LIMITES_TARIFAS } from "./tarifas.constantes";

function normalizarCodigoEnVivo(valor) {
  return valor.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

const VACIO = {
  codigo: "",
  nombre: "",
  tipo: "BASE",
  planBaseId: "",
  descuentoPorcentaje: "",
  reembolsable: true,
  horasCancelacionSinCargo: "",
  penalidadNoShow: PENALIDADES_NO_SHOW[0],
  visibleWeb: true,
};

export function PlanTarifarioModal({ plan, onClose, onExito }) {
  const editando = Boolean(plan);
  const [form, setForm] = useState(
    plan
      ? {
          codigo: plan.codigo,
          nombre: plan.nombre,
          tipo: plan.tipo,
          planBaseId: plan.planBaseId ? String(plan.planBaseId) : "",
          descuentoPorcentaje: plan.descuentoPorcentaje ? String(plan.descuentoPorcentaje) : "",
          reembolsable: plan.reembolsable,
          horasCancelacionSinCargo: plan.horasCancelacionSinCargo ? String(plan.horasCancelacionSinCargo) : "",
          penalidadNoShow: plan.penalidadNoShow,
          visibleWeb: plan.visibleWeb,
        }
      : VACIO
  );
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const { data: planesBase } = useQuery({
    queryKey: ["tarifas", "planes", "base-activos"],
    queryFn: () => listarPlanesTarifarios({ activo: "true" }),
    select: (planes) => planes.filter((p) => p.tipo === "BASE"),
  });

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = {
        codigo: form.codigo,
        nombre: form.nombre,
        tipo: form.tipo,
        reembolsable: form.reembolsable,
        horasCancelacionSinCargo: form.reembolsable ? form.horasCancelacionSinCargo : undefined,
        penalidadNoShow: form.penalidadNoShow,
        visibleWeb: form.visibleWeb,
        ...(form.tipo === "DERIVADO"
          ? { planBaseId: Number(form.planBaseId), descuentoPorcentaje: Number(form.descuentoPorcentaje) }
          : {}),
      };
      return editando ? actualizarPlanTarifario(plan.id, payload) : crearPlanTarifario(payload);
    },
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["tarifas", "planes"] });
      onExito(`Plan "${guardado.nombre}" ${editando ? "actualizado" : "creado"} correctamente.`);
    },
    onError: (error) => {
      setErrores({ general: error?.response?.data?.error ?? "No se pudo guardar el plan tarifario." });
    },
  });

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, general: undefined }));
  }

  function validar() {
    const nuevos = {};
    if (!editando && !form.codigo.trim()) nuevos.codigo = "El código es obligatorio.";
    if (!form.nombre.trim()) nuevos.nombre = "El nombre es obligatorio.";
    if (form.tipo === "DERIVADO") {
      if (!form.planBaseId) nuevos.planBaseId = "Elegí el plan base.";
      const descuento = Number(form.descuentoPorcentaje);
      if (!Number.isFinite(descuento) || descuento <= 0 || descuento >= 100) {
        nuevos.descuentoPorcentaje = "Tiene que ser mayor a 0 y menor a 100.";
      }
    }
    if (form.reembolsable && !form.horasCancelacionSinCargo) {
      nuevos.horasCancelacionSinCargo = "Obligatorio si el plan es reembolsable.";
    }
    return nuevos;
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    const nuevos = validar();
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal
      titulo={editando ? `Editar plan "${plan.nombre}"` : "Nuevo plan tarifario"}
      subtitulo="Condiciones de venta"
      onClose={onClose}
      ancho="max-w-xl"
    >
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {errores.general && <p className="sm:col-span-2 text-sm text-error-texto">{errores.general}</p>}
          <Input
            label="Código *"
            value={form.codigo}
            onChange={(e) => cambiar("codigo", normalizarCodigoEnVivo(e.target.value))}
            error={errores.codigo}
            maxLength={LIMITES_TARIFAS.codigoPlanMax}
            placeholder="ej. BAR"
            disabled={editando}
          />
          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
            error={errores.nombre}
            maxLength={LIMITES_TARIFAS.nombrePlan}
          />
          <Select label="Tipo *" value={form.tipo} onChange={(e) => cambiar("tipo", e.target.value)} disabled={editando}>
            {TIPOS_PLAN.map((t) => (
              <option key={t} value={t}>
                {t === "BASE" ? "Base (BAR)" : "Derivado"}
              </option>
            ))}
          </Select>
          {form.tipo === "DERIVADO" && (
            <>
              <Select
                label="Plan base *"
                value={form.planBaseId}
                onChange={(e) => cambiar("planBaseId", e.target.value)}
                error={errores.planBaseId}
                disabled={editando}
              >
                <option value="">Elegí…</option>
                {(planesBase ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
              <Input
                label="Descuento sobre el base (%) *"
                type="number"
                min="1"
                max="99"
                step="1"
                value={form.descuentoPorcentaje}
                onChange={(e) => cambiar("descuentoPorcentaje", e.target.value)}
                error={errores.descuentoPorcentaje}
              />
            </>
          )}
          <label className="flex items-center gap-2 pt-6 text-sm text-tinta">
            <input type="checkbox" checked={form.reembolsable} onChange={(e) => cambiar("reembolsable", e.target.checked)} />
            Reembolsable
          </label>
          {form.reembolsable && (
            <Input
              label="Horas de cancelación sin cargo *"
              type="number"
              min="1"
              step="1"
              value={form.horasCancelacionSinCargo}
              onChange={(e) => cambiar("horasCancelacionSinCargo", e.target.value)}
              error={errores.horasCancelacionSinCargo}
            />
          )}
          <Select label="Penalidad por no-show *" value={form.penalidadNoShow} onChange={(e) => cambiar("penalidadNoShow", e.target.value)}>
            {PENALIDADES_NO_SHOW.map((p) => (
              <option key={p} value={p}>
                {PENALIDAD_NO_SHOW_LABEL[p]}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 pt-6 text-sm text-tinta">
            <input type="checkbox" checked={form.visibleWeb} onChange={(e) => cambiar("visibleWeb", e.target.checked)} />
            Visible en la web
          </label>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icono={Save} cargando={mutacion.isPending}>
            {editando ? "Guardar cambios" : "Crear plan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
