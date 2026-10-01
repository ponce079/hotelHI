import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { useSesion } from "../../lib/sesion";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { obtenerHistorialTarifa, crearTarifa, actualizarTarifa, eliminarTarifa } from "./tarifas.api";

// Historial de versiones de una celda (tipo × temporada) — ver, cargar una
// versión nueva y editar/borrar las futuras (regla 6: una versión ya
// vigente es historial inmutable).
export function TarifaHistorialModal({ tipo, temporada, puedeGestionar, onClose, onExito }) {
  const { usuario } = useSesion();
  const queryClient = useQueryClient();
  const hoy = hoyEnHoraLocal();
  const [form, setForm] = useState(null); // null | { modo: "crear" } | { modo: "editar", id }
  const [valores, setValores] = useState({ precioBase: "", adicionalAdultoExtra: "", vigenteDesde: "" });
  const [errores, setErrores] = useState({});

  const { data: historial, isLoading } = useQuery({
    queryKey: ["tarifas", "precios", "historial", tipo.id, temporada.id],
    queryFn: () => obtenerHistorialTarifa(tipo.id, temporada.id),
  });

  function invalidarTodo() {
    queryClient.invalidateQueries({ queryKey: ["tarifas", "precios"] });
  }

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = {
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        precioBase: Number(valores.precioBase),
        adicionalAdultoExtra: Number(valores.adicionalAdultoExtra),
        vigenteDesde: valores.vigenteDesde,
        usuario,
      };
      return form.modo === "editar" ? actualizarTarifa(form.id, payload) : crearTarifa(payload);
    },
    onSuccess: () => {
      invalidarTodo();
      const modo = form.modo;
      setForm(null);
      onExito(`Tarifa ${modo === "editar" ? "actualizada" : "creada"} correctamente.`);
    },
    onError: (error) => setErrores({ general: error?.response?.data?.error ?? "No se pudo guardar la tarifa." }),
  });

  const mutacionBorrar = useMutation({
    mutationFn: (id) => eliminarTarifa(id),
    onSuccess: () => {
      invalidarTodo();
      onExito("Versión de tarifa borrada.");
    },
    onError: (error) => onExito(error?.response?.data?.error ?? "No se pudo borrar la versión."),
  });

  function abrirCrear() {
    setValores({ precioBase: "", adicionalAdultoExtra: "", vigenteDesde: "" });
    setErrores({});
    setForm({ modo: "crear" });
  }
  function abrirEditar(t) {
    setValores({
      precioBase: String(t.precioBase),
      adicionalAdultoExtra: String(t.adicionalAdultoExtra),
      vigenteDesde: String(t.vigenteDesde).slice(0, 10),
    });
    setErrores({});
    setForm({ modo: "editar", id: t.id });
  }

  function validar() {
    const nuevos = {};
    if (!(Number(valores.precioBase) > 0)) nuevos.precioBase = "Tiene que ser mayor a 0.";
    if (!(Number(valores.adicionalAdultoExtra) >= 0)) nuevos.adicionalAdultoExtra = "Tiene que ser mayor o igual a 0.";
    if (!valores.vigenteDesde) nuevos.vigenteDesde = "Obligatoria.";
    else if (valores.vigenteDesde < hoy) nuevos.vigenteDesde = "No puede ser anterior a hoy.";
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
    <Modal titulo={`${tipo.nombre} · ${temporada.nombre}`} subtitulo="Historial de versiones de la tarifa (plan BAR)" onClose={onClose} ancho="max-w-2xl">
      <div className="flex flex-col gap-4 px-6 py-5">
        {isLoading ? (
          <p className="text-sm text-piedra">Cargando…</p>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-borde text-[11.5px] text-piedra">
                <th className="py-1.5">Vigente desde</th>
                <th className="py-1.5">Precio base</th>
                <th className="py-1.5">Adicional adulto extra</th>
                {puedeGestionar && <th className="py-1.5 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {(historial ?? []).map((t) => {
                const vigenteDesde = String(t.vigenteDesde).slice(0, 10);
                const futura = vigenteDesde > hoy;
                return (
                  <tr key={t.id} className="border-b border-borde last:border-0">
                    <td className="py-1.5 font-mono">{vigenteDesde}</td>
                    <td className="py-1.5 font-mono">$ {formatearMonto(t.precioBase)}</td>
                    <td className="py-1.5 font-mono">$ {formatearMonto(t.adicionalAdultoExtra)}</td>
                    {puedeGestionar && (
                      <td className="py-1.5 text-right">
                        {futura ? (
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => abrirEditar(t)} className="cursor-pointer text-piedra hover:text-tinta" title="Editar">
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => mutacionBorrar.mutate(t.id)}
                              className="cursor-pointer text-piedra hover:text-error-texto"
                              title="Borrar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-piedra">histórico</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {(historial ?? []).length === 0 && (
                <tr>
                  <td colSpan={puedeGestionar ? 4 : 3} className="py-4 text-center text-piedra">
                    Sin versiones cargadas — esta celda está sin tarifa vigente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {puedeGestionar && !form && (
          <Button variante="secundario" icono={Plus} onClick={abrirCrear} className="self-start">
            Nueva versión
          </Button>
        )}

        {form && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-borde p-4">
            {errores.general && <p className="text-sm text-error-texto">{errores.general}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MoneyInput
                label="Precio base *"
                value={valores.precioBase}
                onChange={(v) => setValores((x) => ({ ...x, precioBase: v }))}
                error={errores.precioBase}
              />
              <MoneyInput
                label="Adicional adulto extra *"
                value={valores.adicionalAdultoExtra}
                onChange={(v) => setValores((x) => ({ ...x, adicionalAdultoExtra: v }))}
                error={errores.adicionalAdultoExtra}
              />
              <Input
                label="Vigente desde *"
                type="date"
                min={hoy}
                value={valores.vigenteDesde}
                onChange={(e) => setValores((x) => ({ ...x, vigenteDesde: e.target.value }))}
                error={errores.vigenteDesde}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variante="secundario" icono={X} onClick={() => setForm(null)}>
                Cancelar
              </Button>
              <Button type="submit" icono={Save} cargando={mutacion.isPending}>
                {form.modo === "editar" ? "Guardar cambios" : "Crear versión"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
