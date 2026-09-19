import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BedDouble, Check, Sparkles, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Table } from "../../componentes/Table";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { useToast } from "../../lib/useToast";
import { Toast } from "../../componentes/Toast";
import { GarantiaFieldset } from "./GarantiaFieldset";
import { sugerirHabitacion, registrarCheckInWalkIn } from "./checkIn.api";
import { MEDIOS_GARANTIA } from "./checkIn.constantes";

// Mismo espíritu que ReservaWizard.jsx (array PASOS, un único estado `form`,
// botón final que cambia según el paso) — acá con un paso más (Garantía,
// HU-46) y sin paso de fechas de entrada, porque el walk-in siempre entra
// hoy (HU-44).
const PASOS = ["Estadía", "Habitación (HU-45)", "Huésped", "Garantía y confirmación"];

const TIPOS_DOCUMENTO = ["DNI", "Pasaporte", "Cédula de identidad", "Libreta cívica", "Libreta de enrolamiento"];

function manana() {
  const hoy = new Date(`${hoyEnHoraLocal()}T00:00:00.000Z`);
  return new Date(hoy.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const VACIO = {
  paso: 1,
  fechaHasta: manana(),
  tipo: "",
  capacidadMinima: "",
  preferencias: "",
  habitacionIds: [],
  huesped: { nombre: "", tipoDocumento: TIPOS_DOCUMENTO[0], numeroDocumento: "", contacto: "" },
  garantiaConfirmada: false,
  medioGarantia: MEDIOS_GARANTIA[0],
};

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export function CheckInWalkIn() {
  const [form, setForm] = useState(VACIO);
  const [errorGeneral, setErrorGeneral] = useState("");
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const rangoValido = Boolean(form.fechaHasta && form.fechaHasta > hoyEnHoraLocal());

  // HU-45 — sugerencia automática + lista completa para elección manual, ya
  // filtradas por "libre ahora mismo" (no solo "sin reserva encimada", ver
  // checkIn.servicio.js: listarHabitacionesLibresAhora).
  const sugerenciaQuery = useQuery({
    queryKey: ["check-in", "sugerir-habitacion", form.fechaHasta, form.tipo, form.capacidadMinima],
    queryFn: () =>
      sugerirHabitacion({
        fechaHasta: form.fechaHasta,
        tipo: form.tipo || undefined,
        capacidadMinima: form.capacidadMinima || undefined,
      }),
    enabled: rangoValido && form.paso >= 2,
  });

  const habitaciones = sugerenciaQuery.data?.habitaciones ?? [];
  const elegidas = useMemo(() => habitaciones.filter((h) => form.habitacionIds.includes(h.id)), [habitaciones, form.habitacionIds]);
  const capacidadTotal = elegidas.reduce((acc, h) => acc + h.capacidad, 0);

  const mutacion = useMutation({
    mutationFn: () =>
      registrarCheckInWalkIn({
        fechaHasta: form.fechaHasta,
        habitacionIds: form.habitacionIds,
        huesped: {
          nombre: form.huesped.nombre.trim(),
          tipoDocumento: form.huesped.tipoDocumento,
          numeroDocumento: form.huesped.numeroDocumento.trim(),
          contacto: form.huesped.contacto.trim() || undefined,
        },
        garantiaConfirmada: form.garantiaConfirmada,
        medioGarantia: form.medioGarantia,
      }),
    onSuccess: (reserva) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      mostrarToast(
        `Check-in walk-in confirmado — reserva ${reserva.codigoConfirmacion}, habitación${reserva.habitaciones.length > 1 ? "es" : ""} ${reserva.habitaciones.map((h) => h.numero).join(", ")}.`
      );
      setForm(VACIO);
    },
    onError: (error) => setErrorGeneral(error?.response?.data?.error ?? "No se pudo registrar el check-in."),
  });

  function actualizar(cambios) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, ...cambios }));
  }

  function actualizarHuesped(campo, valor) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, huesped: { ...f.huesped, [campo]: valor } }));
  }

  function irA(paso) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, paso }));
  }

  function alternarHabitacion(id) {
    setErrorGeneral("");
    setForm((f) => ({
      ...f,
      habitacionIds: f.habitacionIds.includes(id) ? f.habitacionIds.filter((x) => x !== id) : [...f.habitacionIds, id],
    }));
  }

  function usarSugerida() {
    if (sugerenciaQuery.data?.sugerida) actualizar({ habitacionIds: [sugerenciaQuery.data.sugerida.id] });
  }

  function confirmar() {
    const { nombre, numeroDocumento } = form.huesped;
    if (!nombre.trim() || !numeroDocumento.trim()) {
      setErrorGeneral("El nombre y el número de documento del huésped son obligatorios.");
      return;
    }
    if (!form.garantiaConfirmada) {
      setErrorGeneral("Confirmá la garantía antes de completar el check-in.");
      return;
    }
    mutacion.mutate();
  }

  const puedeAvanzarPaso1 = rangoValido;
  const puedeAvanzarPaso2 = form.habitacionIds.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 rounded-[18.4px] bg-hueso px-6 py-4">
        {PASOS.map((label, i) => {
          const paso = i + 1;
          const activo = form.paso === paso;
          const hecho = form.paso > paso;
          return (
            <span key={label} className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 font-body text-[12px] font-semibold ${
                  activo ? "bg-pino text-hueso" : hecho ? "bg-pino-100 text-pino-700" : "bg-neutro-100 text-piedra"
                }`}
              >
                {hecho ? "✓" : paso} {label}
              </span>
              {paso < PASOS.length && <span className="text-piedra/50">→</span>}
            </span>
          );
        })}
      </div>

      {/* Paso 1 — estadía (entrada siempre hoy, HU-44) */}
      {form.paso === 1 && (
        <div className="flex flex-col gap-4 rounded-lg border border-borde bg-white px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Entrada (check-in)" value="Hoy" disabled className="opacity-70" />
            <Input
              label="Salida (check-out) *"
              type="date"
              min={manana()}
              value={form.fechaHasta}
              onChange={(e) => actualizar({ fechaHasta: e.target.value, habitacionIds: [] })}
            />
            <Select label="Tipo deseado" value={form.tipo} onChange={(e) => actualizar({ tipo: e.target.value, habitacionIds: [] })}>
              <option value="">Cualquiera</option>
              {(sugerenciaQuery.data?.resumenPorTipo ?? []).map((r) => (
                <option key={r.tipo} value={r.tipo}>
                  {r.tipo}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex flex-col gap-1.5 font-body text-sm">
            <span className="text-[12px] text-tinta/70">Preferencias del huésped (opcional)</span>
            <textarea
              rows={2}
              value={form.preferencias}
              onChange={(e) => actualizar({ preferencias: e.target.value })}
              placeholder="Piso alto, cerca del ascensor, silenciosa…"
              className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
            />
          </label>
        </div>
      )}

      {/* Paso 2 — asignación de habitación, manual o automática (HU-45) */}
      {form.paso === 2 && (
        <div className="flex flex-col gap-4 rounded-lg border border-borde bg-white px-6 py-5">
          {sugerenciaQuery.isLoading && <p className="text-sm text-piedra">Buscando habitaciones libres…</p>}
          {sugerenciaQuery.isError && (
            <p className="text-[13px] text-error-texto">No se pudo consultar la disponibilidad.</p>
          )}

          {sugerenciaQuery.data?.sugerida && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pino-300 bg-pino-100 px-5 py-4">
              <div className="flex items-center gap-2 text-[13px] text-pino-700">
                <Sparkles size={16} />
                Sugerida automáticamente: <span className="font-mono font-semibold">{sugerenciaQuery.data.sugerida.numero}</span> (
                {sugerenciaQuery.data.sugerida.tipo})
              </div>
              <Button variante="alta" tamano="fila" onClick={usarSugerida}>
                Usar esta
              </Button>
            </div>
          )}

          <Table
            columnas={["", "Habitación", "Tipo", "Capacidad", "Piso", "Tarifa/noche"]}
            filas={habitaciones}
            columnasDerecha={["Capacidad", "Piso", "Tarifa/noche"]}
            vacio="No hay habitaciones libres ahora mismo con esos filtros."
            renderFila={(h) => {
              const elegida = form.habitacionIds.includes(h.id);
              return (
                <tr
                  key={h.id}
                  onClick={() => alternarHabitacion(h.id)}
                  className={`h-14 cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${elegida ? "bg-pino-100/60" : ""}`}
                >
                  <td className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={elegida}
                      onChange={() => alternarHabitacion(h.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Elegir habitación ${h.numero}`}
                      className="h-4 w-4 cursor-pointer accent-pino"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 font-mono text-[13px] font-medium">
                      <BedDouble size={16} className="text-pino" />
                      {h.numero}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">{h.tipo}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{h.capacidad}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{h.piso}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{FORMATO_MONEDA.format(h.tarifaPorNoche)}</td>
                </tr>
              );
            }}
          />

          {elegidas.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-borde bg-hueso px-5 py-3 text-[13px]">
              <Users size={15} className="text-piedra" />
              {elegidas.length} habitación{elegidas.length === 1 ? "" : "es"} elegida{elegidas.length === 1 ? "" : "s"} · capacidad
              total {capacidadTotal}
              {elegidas.length > 1 && <Badge variante="info">Grupal</Badge>}
            </div>
          )}
        </div>
      )}

      {/* Paso 3 — datos del huésped (HU-39, mismos campos que Reservas) */}
      {form.paso === 3 && (
        <div className="flex flex-col gap-4 rounded-lg border border-borde bg-white px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Nombre y apellido *"
              value={form.huesped.nombre}
              onChange={(e) => actualizarHuesped("nombre", e.target.value)}
              placeholder="Ana Pérez"
            />
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
              <Select label="Documento *" value={form.huesped.tipoDocumento} onChange={(e) => actualizarHuesped("tipoDocumento", e.target.value)}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Input
                label="Número *"
                value={form.huesped.numeroDocumento}
                onChange={(e) => actualizarHuesped("numeroDocumento", e.target.value)}
                placeholder="30111222"
              />
            </div>
            <Input
              label="Contacto (email o teléfono)"
              value={form.huesped.contacto}
              onChange={(e) => actualizarHuesped("contacto", e.target.value)}
              placeholder="ana@mail.com"
            />
          </div>
        </div>
      )}

      {/* Paso 4 — garantía (HU-46) y resumen final */}
      {form.paso === 4 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-borde bg-white px-6 py-5 text-[13px]">
            <p className="font-semibold">Resumen</p>
            <p className="mt-1 text-piedra">
              {elegidas.map((h) => `${h.numero} (${h.tipo})`).join(", ") || "—"} · hoy al {form.fechaHasta} ·{" "}
              <span className="font-semibold text-tinta">{form.huesped.nombre}</span> ({form.huesped.tipoDocumento}{" "}
              {form.huesped.numeroDocumento})
            </p>
          </div>
          <GarantiaFieldset
            garantiaConfirmada={form.garantiaConfirmada}
            medioGarantia={form.medioGarantia}
            onCambiar={actualizar}
          />
        </div>
      )}

      {errorGeneral && (
        <p className="rounded-md border border-error bg-error-suave px-4 py-2.5 text-[12.5px] text-error-texto">{errorGeneral}</p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>{form.paso > 1 && <Button variante="secundario" icono={ArrowLeft} onClick={() => irA(form.paso - 1)}>Atrás</Button>}</div>
        <div className="flex items-center gap-2.5">
          {form.paso === 1 && (
            <Button variante="ok" disabled={!puedeAvanzarPaso1} onClick={() => irA(2)}>
              Ver habitaciones libres <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === 2 && (
            <Button variante="ok" disabled={!puedeAvanzarPaso2} onClick={() => irA(3)}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === 3 && (
            <Button variante="ok" onClick={() => irA(4)}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === 4 && (
            <Button variante="ok" icono={Check} cargando={mutacion.isPending} onClick={confirmar}>
              Confirmar check-in
            </Button>
          )}
        </div>
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
