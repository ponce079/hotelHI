import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { crearTipoHabitacion, actualizarTipoHabitacion } from "./tiposHabitacion.api";
import { LIMITES_TIPO_HABITACION } from "./tiposHabitacion.constantes";

const VACIO = { codigo: "", nombre: "", descripcion: "", ocupacionBase: "2" };

// El código se guarda en MAYÚSCULAS (regla de negocio) — se normaliza en
// vivo al tipear, mismo criterio que TipoMovimientoForm.jsx con descripcion.
function normalizarCodigoEnVivo(valor) {
  return valor.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function TipoHabitacionModal({ tipo, onClose, onExito }) {
  const editando = Boolean(tipo);
  const [form, setForm] = useState(
    tipo
      ? { codigo: tipo.codigo, nombre: tipo.nombre, descripcion: tipo.descripcion ?? "", ocupacionBase: String(tipo.ocupacionBase ?? 2) }
      : VACIO
  );
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = { ...form, ocupacionBase: Number(form.ocupacionBase) };
      return editando ? actualizarTipoHabitacion(tipo.id, payload) : crearTipoHabitacion(payload);
    },
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["tipos-habitacion"] });
      const base = `Tipo de habitación "${guardado.nombre}" ${editando ? "actualizado" : "creado"} correctamente.`;
      onExito(guardado.advertenciaCapacidad ? `${base} ${guardado.advertenciaCapacidad}` : base);
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? "No se pudo guardar el tipo de habitación.";
      if (error?.response?.status === 409) {
        // El backend no distingue en el mensaje si chocó el código o el
        // nombre — se muestra como error general en vez de adivinar en qué
        // campo pintarlo.
        setErrores({ general: mensaje });
      } else {
        setErrores({ general: mensaje });
      }
    },
  });

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => ({ ...actual, [campo]: undefined, general: undefined }));
  }

  function validar() {
    const nuevos = {};
    const codigo = form.codigo.trim();
    if (codigo.length < LIMITES_TIPO_HABITACION.codigoMin || codigo.length > LIMITES_TIPO_HABITACION.codigoMax) {
      nuevos.codigo = `El código debe tener entre ${LIMITES_TIPO_HABITACION.codigoMin} y ${LIMITES_TIPO_HABITACION.codigoMax} caracteres.`;
    }
    if (!form.nombre.trim()) nuevos.nombre = "El nombre es obligatorio.";
    const ocupacionBase = Number(form.ocupacionBase);
    if (!Number.isInteger(ocupacionBase) || ocupacionBase < 1) {
      nuevos.ocupacionBase = "Tiene que ser un número entero mayor o igual a 1.";
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
      titulo={editando ? `Editar tipo "${tipo.nombre}"` : "Nuevo tipo de habitación"}
      subtitulo="Catálogo de tipos de habitación"
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
            maxLength={LIMITES_TIPO_HABITACION.codigoMax}
            placeholder="ej. STD-DBL"
          />
          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
            error={errores.nombre}
            maxLength={LIMITES_TIPO_HABITACION.nombre}
            placeholder="ej. Doble"
          />
          <Input
            label="Ocupación base *"
            type="number"
            min="1"
            step="1"
            value={form.ocupacionBase}
            onChange={(e) => cambiar("ocupacionBase", e.target.value)}
            error={errores.ocupacionBase}
          />
          <div className="sm:col-span-2">
            <label className="flex flex-col gap-1.5 font-body text-sm">
              <span className="text-[12px] text-tinta/70">Descripción</span>
              <textarea
                rows={3}
                value={form.descripcion}
                onChange={(e) => cambiar("descripcion", e.target.value)}
                maxLength={LIMITES_TIPO_HABITACION.descripcion}
                placeholder="Detalle opcional del tipo de habitación…"
                className="resize-y rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icono={Save} cargando={mutacion.isPending}>
            {editando ? "Guardar cambios" : "Crear tipo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
