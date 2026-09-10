import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Save } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { crearDeposito, actualizarDeposito } from "./depositos.api";
import { NOMBRE_MAX_LENGTH, RESPONSABLE_MAX_LENGTH, UBICACION_MAX_LENGTH } from "./depositos.constantes";

const CARACTERES_INVALIDOS_NOMBRE = /[^\p{L}\p{N}\s]/gu;
const CARACTERES_INVALIDOS_RESPONSABLE = /[^\p{L}\s]/gu;
const CARACTERES_INVALIDOS_UBICACION = /[^\p{L}\p{N}\s]/gu;

const VACIO = { nombre: "", ubicacion: "", responsable: "", esCentral: false };

export function DepositoModal({ deposito, onClose, onExito }) {
  const editando = Boolean(deposito);
  const [form, setForm] = useState(
    deposito
      ? {
          nombre: deposito.nombre,
          ubicacion: deposito.ubicacion,
          responsable: deposito.responsable,
          esCentral: Boolean(deposito.esCentral),
        }
      : VACIO
  );
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => (editando ? actualizarDeposito(deposito.id, form) : crearDeposito(form)),
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["depositos"] });
      const base = editando ? `Depósito "${guardado.nombre}" actualizado.` : `Depósito "${guardado.nombre}" guardado exitosamente.`;
      onExito(guardado.advertencia ? `${base} ${guardado.advertencia}` : base);
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? `No se pudo ${editando ? "editar" : "crear"} el depósito.`;
      if (error?.response?.status === 409) {
        setErrores({ nombre: mensaje });
      } else {
        setErrores({ general: mensaje });
      }
    },
  });

  function validar() {
    const nuevosErrores = {};
    if (!form.nombre.trim()) nuevosErrores.nombre = "El nombre es obligatorio.";
    if (!form.ubicacion.trim()) nuevosErrores.ubicacion = "La ubicación es obligatoria.";
    if (!form.responsable.trim()) nuevosErrores.responsable = "El responsable es obligatorio.";
    return nuevosErrores;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nuevosErrores = validar();
    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal titulo={editando ? "Editar depósito" : "Nuevo depósito"} onClose={onClose}>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            {errores.general && <p className="text-sm text-error">{errores.general}</p>}

            <Input
              label="Nombre del depósito *"
              value={form.nombre}
              onChange={(e) =>
                setForm({ ...form, nombre: e.target.value.toUpperCase().replace(CARACTERES_INVALIDOS_NOMBRE, "") })
              }
              error={errores.nombre}
              placeholder="ej. Depósito Piscina"
              maxLength={NOMBRE_MAX_LENGTH}
            />
            <Input
              label="Ubicación física *"
              value={form.ubicacion}
              onChange={(e) => setForm({ ...form, ubicacion: e.target.value.replace(CARACTERES_INVALIDOS_UBICACION, "") })}
              error={errores.ubicacion}
              placeholder="ej. Subsuelo, Piso 2, Rooftop"
              maxLength={UBICACION_MAX_LENGTH}
            />
            <Input
              label="Responsable *"
              value={form.responsable}
              onChange={(e) =>
                setForm({ ...form, responsable: e.target.value.replace(CARACTERES_INVALIDOS_RESPONSABLE, "") })
              }
              error={errores.responsable}
              placeholder="Nombre y apellido"
              maxLength={RESPONSABLE_MAX_LENGTH}
            />
            <label className="flex items-start gap-2.5 text-sm text-tinta">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-borde"
                checked={form.esCentral}
                onChange={(e) => setForm({ ...form, esCentral: e.target.checked })}
              />
              <span>
                Depósito central
                <span className="mt-0.5 block font-mono text-[11px] text-piedra">
                  Origen de las transferencias internas. Se esperan 1 o 2 en todo el sistema.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" icono={X} onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" icono={Save} disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : editando ? "Guardar cambios" : "Guardar"}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
