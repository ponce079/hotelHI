import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { crearProveedor, actualizarProveedor } from "./proveedores.api";
import { RUBROS, CONDICIONES_COMERCIALES } from "../../lib/constantes";

// Mismo formato y regex que backend/src/modulos/proveedores/proveedores.constantes.js.
const CUIT_REGEX = /^\d{2}-\d{8}-\d$/;
const RAZON_SOCIAL_MAX_LENGTH = 150;

// Escribe el CUIT con los guiones puestos mientras se tipea: el usuario
// solo carga los 11 dígitos y el campo los ubica solo (00-00000000-0).
function formatearCuit(valor) {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

const VACIO = {
  razonSocial: "",
  cuit: "",
  contacto: "",
  email: "",
  telefono: "",
  direccion: "",
  condicionComercial: "",
};

export function ProveedorModal({ proveedor, onClose, onExito }) {
  const editando = Boolean(proveedor);
  const [form, setForm] = useState(
    proveedor
      ? {
          razonSocial: proveedor.razonSocial,
          cuit: proveedor.cuit,
          contacto: proveedor.contacto ?? "",
          email: proveedor.email ?? "",
          telefono: proveedor.telefono ?? "",
          direccion: proveedor.direccion ?? "",
          condicionComercial: proveedor.condicionComercial ?? "",
        }
      : VACIO
  );
  const [rubros, setRubros] = useState(proveedor ? proveedor.rubros.map((r) => r.rubro) : []);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  // HU-19: si ya tiene órdenes de compra el CUIT queda congelado. El
  // backend lo rechaza igual (es el que manda), pero deshabilitar el campo
  // acá evita que alguien lo edite y recién se entere al guardar.
  const cuitBloqueado = editando && (proveedor.ordenesCompra?.length > 0 || proveedor.tieneOrdenesCompra);

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = { ...form, rubros };
      return editando ? actualizarProveedor(proveedor.id, payload) : crearProveedor(payload);
    },
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      onExito(
        editando
          ? `Proveedor "${guardado.razonSocial}" actualizado.`
          : `Proveedor "${guardado.razonSocial}" creado.`
      );
    },
    onError: (error) => {
      const mensaje = error?.response?.data?.error ?? `No se pudo ${editando ? "editar" : "crear"} el proveedor.`;
      // Un 409 siempre habla del CUIT (es el único @unique de la tabla):
      // se muestra en el campo, no como error general.
      if (error?.response?.status === 409) setErrores({ cuit: mensaje });
      else setErrores({ general: mensaje });
    },
  });

  function toggleRubro(rubro) {
    setRubros((prev) => (prev.includes(rubro) ? prev.filter((r) => r !== rubro) : [...prev, rubro]));
  }

  function validar() {
    const e = {};
    if (!form.razonSocial.trim()) e.razonSocial = "La razón social es obligatoria.";
    if (!form.cuit.trim()) e.cuit = "El CUIT es obligatorio.";
    else if (!CUIT_REGEX.test(form.cuit)) e.cuit = "Formato esperado: 00-00000000-0 (11 dígitos).";
    if (!form.condicionComercial) e.condicionComercial = "Elegí una condición comercial.";
    if (rubros.length === 0) e.rubros = "Elegí al menos un rubro.";
    return e;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const nuevos = validar();
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      return;
    }
    mutacion.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-tinta/45 p-6 py-10"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-borde px-6 py-5">
          <div>
            <h3 className="font-heading text-[20px] font-semibold text-tinta">
              {editando ? "Editar proveedor" : "Nuevo proveedor"}
            </h3>
            <p className="mt-1 font-mono text-[11px] text-tinta/55">
              {editando ? `Proveedor #${proveedor.id}` : "HU-18 — alta con validación de CUIT"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-piedra hover:text-error">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-6 py-5">
            {errores.general && <p className="text-sm text-error">{errores.general}</p>}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Razón social *"
                  value={form.razonSocial}
                  onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
                  error={errores.razonSocial}
                  placeholder="ej. Distribuidora Norte S.A."
                  maxLength={RAZON_SOCIAL_MAX_LENGTH}
                />
              </div>

              <Input
                label="CUIT *"
                value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: formatearCuit(e.target.value) })}
                error={errores.cuit}
                placeholder="00-00000000-0"
                disabled={cuitBloqueado}
                className={cuitBloqueado ? "bg-hueso text-tinta/55" : ""}
              />

              <Select
                label="Condición comercial *"
                value={form.condicionComercial}
                onChange={(e) => setForm({ ...form, condicionComercial: e.target.value })}
                error={errores.condicionComercial}
              >
                <option value="">Seleccionar…</option>
                {CONDICIONES_COMERCIALES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>

              <Input
                label="Contacto"
                value={form.contacto}
                onChange={(e) => setForm({ ...form, contacto: e.target.value })}
                placeholder="ej. Marcela Ávila"
              />
              <Input
                label="Teléfono"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                placeholder="ej. 11 4732-8890"
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ej. ventas@proveedor.com.ar"
              />
              <Input
                label="Domicilio"
                value={form.direccion}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                placeholder="ej. Av. San Martín 2450, CABA"
              />
            </div>

            <div>
              <span className="text-sm font-semibold text-tinta">
                Rubros que provee <span className="font-normal text-piedra">(al menos uno)</span>
              </span>
              <div className="mt-1 flex flex-wrap gap-[7px]">
                {RUBROS.map((r) => {
                  const elegido = rubros.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRubro(r)}
                      className={`cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-[7px] text-xs ${
                        elegido ? "border-pino bg-pino text-hueso" : "border-tinta/20 bg-transparent text-tinta hover:bg-hueso"
                      }`}
                    >
                      {elegido ? "✓ " : ""}{r}
                    </button>
                  );
                })}
              </div>
              {errores.rubros && <p className="mt-1.5 text-[11.5px] text-error-texto">{errores.rubros}</p>}
              <p className="mt-1.5 text-[11.5px] text-piedra">
                Los rubros filtran a quién conviene invitar a cotizar cuando se pide un presupuesto.
              </p>
            </div>

            {cuitBloqueado && (
              <p className="rounded-md bg-hueso px-3 py-2 text-[11.5px] text-piedra">
                El CUIT no se puede cambiar porque este proveedor ya tiene órdenes de compra emitidas.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
            <Button type="button" variante="secundario" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutacion.isPending}>
              {mutacion.isPending ? "Guardando…" : editando ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
