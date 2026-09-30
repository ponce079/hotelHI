import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BedDouble, Check, CheckCircle2, User, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { useToast } from "../../lib/useToast";
import { Toast } from "../../componentes/Toast";
import { GarantiaFieldset } from "./GarantiaFieldset";
import { TituloSeccion } from "./TituloSeccion";
import { listarHabitacionesLibresAhora, registrarCheckInWalkIn } from "./checkIn.api";
import { MEDIOS_GARANTIA } from "./checkIn.constantes";
import { validarHuesped } from "./validarHuesped";

// El "tipo" de habitación es texto libre (lo define cada hotel en el
// catálogo), no un enum fijo — así que el chip de color por tipo se asigna
// por hash del string en vez de una tabla hardcodeada de nombres. Mismos 3
// tonos semánticos que ya usa Badge en el resto de la app (ok/alerta/info),
// nada nuevo fuera de la paleta.
const VARIANTES_TIPO = ["ok", "alerta", "info"];
function variantePorTipo(tipo) {
  let hash = 0;
  for (let i = 0; i < tipo.length; i++) hash = (hash * 31 + tipo.charCodeAt(i)) >>> 0;
  return VARIANTES_TIPO[hash % VARIANTES_TIPO.length];
}

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
  habitacionIds: [],
  huesped: { nombre: "", tipoDocumento: TIPOS_DOCUMENTO[0], numeroDocumento: "", contacto: "" },
  garantiaConfirmada: false,
  medioGarantia: MEDIOS_GARANTIA[0],
  referenciaGarantia: undefined,
};

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const HUESPED_TOCADO_VACIO = { nombre: false, numeroDocumento: false, contacto: false };

export function CheckInWalkIn({ habitacionPreseleccionada = "" } = {}) {
  const navigate = useNavigate();
  // Viene del "→ Iniciar check-in" de una tarjeta libre en el Panel de
  // Habitaciones: arranca directo en el paso de asignación (HU-45) en vez
  // del paso de estadía, ya que la fecha de salida por defecto (mañana) ya
  // alcanza para listar habitaciones libres.
  const [form, setForm] = useState(() => (habitacionPreseleccionada ? { ...VACIO, paso: 2 } : VACIO));
  const [errorGeneral, setErrorGeneral] = useState("");
  const [huespedTocado, setHuespedTocado] = useState(HUESPED_TOCADO_VACIO);
  const [intentoAvanzarHuesped, setIntentoAvanzarHuesped] = useState(false);
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();
  const preseleccionAplicada = useRef(false);

  // Errores en vivo, pero solo se muestran una vez que el usuario tocó el
  // campo (onBlur) o intentó avanzar con el paso 3 incompleto — así no
  // arranca la pantalla en rojo apenas se abre, vacía.
  const erroresHuesped = validarHuesped(form.huesped);
  const huespedValido = Object.keys(erroresHuesped).length === 0;
  function errorHuesped(campo) {
    return huespedTocado[campo] || intentoAvanzarHuesped ? erroresHuesped[campo] : undefined;
  }
  function tocarHuesped(campo) {
    setHuespedTocado((t) => ({ ...t, [campo]: true }));
  }

  const rangoValido = Boolean(form.fechaHasta && form.fechaHasta > hoyEnHoraLocal());

  // HU-45 — selección manual: lista de habitaciones libres "ahora mismo"
  // (no solo "sin reserva encimada", ver checkIn.servicio.js:
  // listarHabitacionesLibresAhora), sin ninguna sugerencia automática.
  const habitacionesQuery = useQuery({
    queryKey: ["check-in", "habitaciones-libres", form.fechaHasta, form.tipo, form.capacidadMinima],
    queryFn: () =>
      listarHabitacionesLibresAhora({
        fechaHasta: form.fechaHasta,
        tipo: form.tipo || undefined,
        capacidadMinima: form.capacidadMinima || undefined,
      }),
    enabled: rangoValido && form.paso >= 2,
  });

  const habitaciones = habitacionesQuery.data?.habitaciones ?? [];

  // Se aplica una sola vez (si el huésped la desmarca después, no se
  // vuelve a forzar) y solo si la habitación sigue realmente libre en la
  // lista — si ya se ocupó entre el click en el panel y la carga de esta
  // pantalla, el check-in sigue el camino manual normal, sin preselección.
  useEffect(() => {
    if (!habitacionPreseleccionada || preseleccionAplicada.current) return;
    if (habitacionesQuery.isLoading) return;
    const encontrada = habitaciones.find((h) => h.numero === habitacionPreseleccionada);
    preseleccionAplicada.current = true;
    if (encontrada) {
      setForm((f) => (f.habitacionIds.includes(encontrada.id) ? f : { ...f, habitacionIds: [...f.habitacionIds, encontrada.id] }));
    }
  }, [habitacionPreseleccionada, habitaciones, habitacionesQuery.isLoading]);

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
        referenciaGarantia: form.referenciaGarantia,
      }),
    onSuccess: (reserva) => {
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
      mostrarToast(
        `Check-in walk-in confirmado — reserva ${reserva.codigoConfirmacion}, habitación${reserva.habitaciones.length > 1 ? "es" : ""} ${reserva.habitaciones.map((h) => h.numero).join(", ")}.`
      );
      setForm(VACIO);
      setHuespedTocado(HUESPED_TOCADO_VACIO);
      setIntentoAvanzarHuesped(false);
    },
    onError: (error) => setErrorGeneral(error?.response?.data?.error ?? "No se pudo registrar el check-in."),
  });

  function actualizar(cambios) {
    setErrorGeneral("");
    mutacion.reset();
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

  function confirmar() {
    // La validación de nombre/documento/contacto ya la garantiza el botón
    // (disabled={!huespedValido}) y el paso 3 al avanzar — acá solo queda
    // el chequeo que ese gate no cubre.
    if (!form.garantiaConfirmada) {
      setErrorGeneral("Confirmá la garantía antes de completar el check-in.");
      return;
    }
    mutacion.mutate();
  }

  function avanzarDesdeHuesped() {
    if (!huespedValido) {
      setIntentoAvanzarHuesped(true);
      return;
    }
    irA(4);
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
              {(habitacionesQuery.data?.resumenPorTipo ?? []).map((r) => (
                <option key={r.tipo} value={r.tipo}>
                  {r.tipo}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* Paso 2 — asignación manual de habitación (HU-45) */}
      {form.paso === 2 && (
        <div className="flex flex-col gap-4 rounded-lg border border-borde bg-white px-6 py-5">
          <TituloSeccion icono={BedDouble} tono="pino">
            Asignación de habitación
          </TituloSeccion>

          {habitacionesQuery.isLoading && <p className="text-sm text-piedra">Buscando habitaciones libres…</p>}
          {habitacionesQuery.isError && (
            <p className="text-[13px] text-error-texto">No se pudo consultar la disponibilidad.</p>
          )}

          {!habitacionesQuery.isLoading && !habitacionesQuery.isError && habitaciones.length === 0 && (
            <p className="text-sm text-piedra">No hay habitaciones libres ahora mismo con esos filtros.</p>
          )}

          {habitaciones.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {habitaciones.map((h) => {
                const elegida = form.habitacionIds.includes(h.id);
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => alternarHabitacion(h.id)}
                    aria-pressed={elegida}
                    className={`flex cursor-pointer flex-col gap-2.5 rounded-[12px] border p-[14px] text-left transition-colors ${
                      elegida ? "border-pino bg-pino text-hueso" : "border-borde bg-white hover:bg-hueso"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono text-[14px] font-semibold">
                        <BedDouble size={16} className={elegida ? "text-hueso" : "text-pino"} />
                        {h.numero}
                      </div>
                      {elegida && <Check size={16} className="flex-none text-hueso" />}
                    </div>
                    <div>
                      <Badge variante={variantePorTipo(h.tipo)}>{h.tipo}</Badge>
                    </div>
                    <div className={`flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[12px] ${elegida ? "text-hueso/80" : "text-piedra"}`}>
                      <span>{h.capacidad} pers.</span>
                      <span>Piso {h.piso}</span>
                      <span>{FORMATO_MONEDA.format(h.tarifaPorNoche)}/noche</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

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
          <TituloSeccion icono={User} tono="laton">
            Datos del huésped
          </TituloSeccion>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Nombre y apellido *"
              value={form.huesped.nombre}
              onChange={(e) => actualizarHuesped("nombre", e.target.value)}
              onBlur={() => tocarHuesped("nombre")}
              error={errorHuesped("nombre")}
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
                onBlur={() => tocarHuesped("numeroDocumento")}
                error={errorHuesped("numeroDocumento")}
                placeholder="30111222"
              />
            </div>
            <Input
              label="Contacto (email o teléfono) *"
              value={form.huesped.contacto}
              onChange={(e) => actualizarHuesped("contacto", e.target.value)}
              onBlur={() => tocarHuesped("contacto")}
              error={errorHuesped("contacto")}
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

      {mutacion.isSuccess && form.paso === 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-pino-300 bg-pino-100 px-4 py-2.5 text-[13px] text-pino-700">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> Check-in walk-in confirmado — reserva {mutacion.data.codigoConfirmacion}.
          </span>
          {/* Ajuste de flujo (Sprint 3): si el huésped pide algo apenas
              llega, el mismo botón "Agregar consumo" está a un clic, en la
              ficha de la reserva — no es un paso más de este wizard. */}
          <Button
            variante="secundario"
            tamano="fila"
            icono={ArrowRight}
            onClick={() => navigate(`/reservas/${mutacion.data.id}`)}
          >
            Ir a la ficha de la reserva
          </Button>
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
            <Button variante="ok" onClick={avanzarDesdeHuesped}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === 4 && (
            <Button variante="ok" icono={Check} cargando={mutacion.isPending} disabled={!huespedValido} onClick={confirmar}>
              Confirmar check-in
            </Button>
          )}
        </div>
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
