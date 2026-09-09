import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearArticulo, actualizarArticulo } from "./articulos.api";
import { habilitarArticuloEnDeposito, listarHabilitaciones } from "../articulo-deposito/articuloDeposito.api";
import { listarDepositos } from "../depositos/depositos.api";
import {
  UNIDADES_MEDIDA,
  UNIDADES_MEDIDA_NOMBRES,
  CATEGORIAS,
  NOMBRE_MAX_LENGTH,
  MODOS_REPOSICION,
  MODOS_REPOSICION_NOMBRES,
} from "./articulos.constantes";

const CARACTERES_INVALIDOS_NOMBRE = /[^\p{L}\p{N}\s]/gu;
const VACIO = { nombre: "", unidadMedida: "", categoria: "", depositoCentralId: "", modoReposicion: "SUGERIDA" };

export function ArticuloModal({ articulo, onClose, onExito }) {
  const editando = Boolean(articulo);
  const [form, setForm] = useState(
    articulo
      ? {
          nombre: articulo.nombre,
          unidadMedida: articulo.unidadMedida,
          categoria: articulo.categoria,
          depositoCentralId: articulo.depositoCentralId ?? "",
          modoReposicion: articulo.modoReposicion ?? "SUGERIDA",
        }
      : VACIO
  );
  const [errores, setErrores] = useState({});
  const [depositosSeleccionados, setDepositosSeleccionados] = useState([]);
  const queryClient = useQueryClient();

  const { data: depositos } = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const { data: habilitacionesTodas } = useQuery({
    queryKey: ["articulo-depositos"],
    queryFn: listarHabilitaciones,
    enabled: editando,
  });

  const depositosYaHabilitados = editando
    ? (habilitacionesTodas ?? []).filter((h) => h.articuloId === articulo.id && h.activo).map((h) => h.depositoId)
    : [];

  const mutacion = useMutation({
    mutationFn: async () => {
      const articuloGuardado = editando
        ? await actualizarArticulo(articulo.id, form)
        : await crearArticulo(form);

      const nuevosDepositos = depositosSeleccionados.filter((id) => !depositosYaHabilitados.includes(id));
      let resultadosHabilitacion = null;
      if (nuevosDepositos.length > 0) {
        const resp = await habilitarArticuloEnDeposito({ articuloId: articuloGuardado.id, depositoIds: nuevosDepositos });
        resultadosHabilitacion = resp.resultados;
      }
      return { articuloGuardado, resultadosHabilitacion };
    },
    onSuccess: ({ articuloGuardado, resultadosHabilitacion }) => {
      queryClient.invalidateQueries({ queryKey: ["articulos"] });
      queryClient.invalidateQueries({ queryKey: ["articulo-depositos"] });
      // Sin esto, un componente que ya tiene montada esta consulta en el
      // momento del guardado (ej. un modal de "Nuevo requerimiento" abierto
      // de fondo en la misma pestaña) se queda con el depositoCentralId
      // viejo en su combo "Agregar artículo" — esa consulta
      // (RequerimientoModal.jsx) lee justamente el campo que se pudo haber
      // cambiado acá. Clave parcial ["stock"] a propósito: invalida
      // cualquier depositoId, no solo el que esté abierto ahora mismo.
      queryClient.invalidateQueries({ queryKey: ["stock"] });

      let mensaje = editando
        ? `Artículo "${articuloGuardado.nombre}" actualizado.`
        : `Artículo "${articuloGuardado.nombre}" creado con código ${articuloGuardado.codigo}.`;
      if (resultadosHabilitacion) {
        const creadas = resultadosHabilitacion.filter((r) => r.estado === "creada").length;
        if (creadas > 0) mensaje += ` Habilitado en ${creadas} depósito${creadas > 1 ? "s" : ""}.`;
      }
      onExito(mensaje);
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? `No se pudo ${editando ? "editar" : "crear"} el artículo.`;
      if (error?.response?.status === 409) {
        setErrores({ nombre: mensaje });
      } else {
        setErrores({ general: mensaje });
      }
    },
  });

  function toggleDeposito(id) {
    if (depositosYaHabilitados.includes(id)) return;
    setDepositosSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const idsSeleccionables = (depositos ?? []).map((d) => d.id).filter((id) => !depositosYaHabilitados.includes(id));
  const todosSeleccionados = idsSeleccionables.length > 0 && idsSeleccionables.every((id) => depositosSeleccionados.includes(id));

  function toggleSeleccionarTodos() {
    setDepositosSeleccionados((prev) =>
      todosSeleccionados ? prev.filter((id) => !idsSeleccionables.includes(id)) : [...new Set([...prev, ...idsSeleccionables])]
    );
  }

  const depsHint = editando
    ? "Para cambiar habilitaciones de un artículo existente, entrá al depósito."
    : depositosSeleccionados.length === 0
      ? "Ningún depósito seleccionado: el artículo queda sólo en el catálogo."
      : `Se crearán ${depositosSeleccionados.length} habilitación${depositosSeleccionados.length > 1 ? "es" : ""} con stock inicial en 0.`;

  function validar() {
    const nuevosErrores = {};
    if (!form.nombre.trim()) nuevosErrores.nombre = "El nombre es obligatorio.";
    if (!form.unidadMedida) nuevosErrores.unidadMedida = "Elegí una unidad de medida.";
    if (!form.categoria) nuevosErrores.categoria = "Elegí una categoría.";
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
    <Modal
      titulo={editando ? "Editar artículo" : "Nuevo artículo"}
      subtitulo={`Código: ${editando ? articulo.codigo : "(se genera al guardar)"}`}
      onClose={onClose}
      ancho="max-w-xl"
    >
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            {errores.general && <p className="text-sm text-error">{errores.general}</p>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Nombre del artículo *"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase().replace(CARACTERES_INVALIDOS_NOMBRE, "") })}
                  error={errores.nombre}
                  placeholder="ej. Toallón blanco 70×140"
                  maxLength={NOMBRE_MAX_LENGTH}
                />
              </div>
              <Select
                label="Unidad de medida *"
                value={form.unidadMedida}
                onChange={(e) => setForm({ ...form, unidadMedida: e.target.value })}
                error={errores.unidadMedida}
              >
                <option value="">Seleccionar…</option>
                {UNIDADES_MEDIDA.map((u) => (
                  <option key={u} value={u}>{UNIDADES_MEDIDA_NOMBRES[u]}</option>
                ))}
              </Select>
              <Select
                label="Categoría *"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                error={errores.categoria}
              >
                <option value="">Seleccionar…</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <Select
                label="Depósito central de origen"
                value={form.depositoCentralId}
                onChange={(e) => setForm({ ...form, depositoCentralId: e.target.value })}
              >
                <option value="">Sin asignar</option>
                {(depositos ?? []).filter((d) => d.esCentral).map((d) => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </Select>
              <Select
                label="Modo de reposición del central"
                value={form.modoReposicion}
                onChange={(e) => setForm({ ...form, modoReposicion: e.target.value })}
              >
                {MODOS_REPOSICION.map((m) => (
                  <option key={m} value={m}>{MODOS_REPOSICION_NOMBRES[m]}</option>
                ))}
              </Select>
            </div>
            <p className="text-[11.5px] text-piedra">
              Sin depósito central asignado, este artículo no puede pedirse por transferencia interna — solo por
              compra a un proveedor.
            </p>

            <div>
              <span className="text-sm font-semibold text-tinta">
                Habilitar en depósitos <span className="font-normal text-piedra">(opcional)</span>
              </span>
              <div className="mt-0.5 flex flex-wrap gap-[7px]">
                {idsSeleccionables.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleSeleccionarTodos}
                    className={`cursor-pointer whitespace-nowrap rounded-full border border-dashed px-3.5 py-[7px] text-xs ${
                      todosSeleccionados ? "border-pino bg-pino text-hueso" : "border-tinta/30 bg-transparent text-tinta"
                    }`}
                  >
                    {todosSeleccionados ? "✓ Todos los depósitos" : "Todos los depósitos"}
                  </button>
                )}
                {(depositos ?? []).map((d) => {
                  const bloqueado = depositosYaHabilitados.includes(d.id);
                  const seleccionado = bloqueado || depositosSeleccionados.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      disabled={bloqueado}
                      onClick={() => toggleDeposito(d.id)}
                      className={`cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-[7px] text-xs disabled:cursor-not-allowed ${
                        seleccionado ? "border-pino bg-pino text-hueso" : "border-tinta/20 bg-transparent text-tinta hover:bg-hueso"
                      }`}
                    >
                      {d.nombre}
                      {bloqueado && " · ya habilitado"}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11.5px] text-piedra">{depsHint}</p>
            </div>

            <p className="text-[11.5px] text-piedra">
              El código lo genera el sistema al guardar y queda en solo lectura. Podés dejar los depósitos vacíos y
              habilitarlo después desde el depósito.
            </p>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : editando ? "Guardar cambios" : "Guardar"}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
