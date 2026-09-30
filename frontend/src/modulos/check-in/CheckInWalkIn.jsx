import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, BedDouble, Check, CheckCircle2, User, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { useToast } from "../../lib/useToast";
import { Toast } from "../../componentes/Toast";
import { listarPlanesTarifarios } from "../tarifas/tarifas.api";
import { GarantiaFieldset } from "./GarantiaFieldset";
import { TituloSeccion } from "./TituloSeccion";
import { listarHabitacionesLibresAhora, registrarCheckInWalkIn } from "./checkIn.api";
import { cotizarReserva } from "../reservas/reservas.api";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";
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
// botón final que cambia según el paso) — acá con un paso de Garantía
// (HU-46) y sin paso de fechas de entrada, porque el walk-in siempre entra
// hoy (HU-44). Etapa 4A (ajuste A): el plan tarifario es UNO por reserva
// (no por habitación, misma regla que ReservaWizard) — paso propio, después
// de elegir habitación y ANTES de los datos del huésped.
const PASOS = ["Estadía", "Habitación (HU-45)", "Plan", "Huésped", "Garantía y confirmación"];
const PASO_PLAN = 3;
const PASO_HUESPED = 4;
const PASO_GARANTIA = 5;

const TIPOS_DOCUMENTO = ["DNI", "Pasaporte", "Cédula de identidad", "Libreta cívica", "Libreta de enrolamiento"];

// Ocupación por defecto de una habitación recién elegida.
const OCUPACION_DEFECTO = { adultos: 2, menores: 0 };

function manana() {
  const hoy = new Date(`${hoyEnHoraLocal()}T00:00:00.000Z`);
  return new Date(hoy.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Etapa 4A (HU-95, regla 6) — "Desde $X por noche" de una habitación en el
// paso 2, antes de elegir plan.
function precioDesde(habitacion) {
  const planes = habitacion?.planes ?? [];
  if (planes.length === 0) return null;
  return Math.min(...planes.map((p) => p.promedioPorNoche));
}

const VACIO = {
  paso: 1,
  fechaHasta: manana(),
  tipoHabitacionId: "",
  capacidadMinima: "",
  habitaciones: [],
  planTarifarioId: "",
  planCodigo: "",
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
  const hoy = hoyEnHoraLocal();

  // Errores en vivo, pero solo se muestran una vez que el usuario tocó el
  // campo (onBlur) o intentó avanzar con el paso de huésped incompleto —
  // así no arranca la pantalla en rojo apenas se abre, vacía.
  const erroresHuesped = validarHuesped(form.huesped);
  const huespedValido = Object.keys(erroresHuesped).length === 0;
  function errorHuesped(campo) {
    return huespedTocado[campo] || intentoAvanzarHuesped ? erroresHuesped[campo] : undefined;
  }
  function tocarHuesped(campo) {
    setHuespedTocado((t) => ({ ...t, [campo]: true }));
  }

  const rangoValido = Boolean(form.fechaHasta && form.fechaHasta > hoy);

  // HU-45 — selección manual: lista de habitaciones libres "ahora mismo"
  // (no solo "sin reserva encimada", ver checkIn.servicio.js:
  // listarHabitacionesLibresAhora), sin ninguna sugerencia automática.
  const habitacionesQuery = useQuery({
    queryKey: ["check-in", "habitaciones-libres", form.fechaHasta, form.tipoHabitacionId, form.capacidadMinima],
    queryFn: () =>
      listarHabitacionesLibresAhora({
        fechaHasta: form.fechaHasta,
        tipoHabitacionId: form.tipoHabitacionId || undefined,
        capacidadMinima: form.capacidadMinima || undefined,
      }),
    enabled: rangoValido && form.paso >= 2,
  });

  // HU-89 — pantalla interna (mostrador): todos los tipos activos del
  // catálogo, mismo criterio que HabitacionesPage/ReservaWizard de
  // mostrador (no `resumenPorTipo`, que solo trae tipos con habitaciones en
  // el universo consultado hoy).
  const tiposQuery = useQuery({
    queryKey: ["tipos-habitacion", "activos"],
    queryFn: () => listarTiposHabitacion({ activo: "true" }),
  });

  const habitacionesLibres = habitacionesQuery.data?.habitaciones ?? [];

  // Se aplica una sola vez (si el huésped la desmarca después, no se
  // vuelve a forzar) y solo si la habitación sigue realmente libre en la
  // lista — si ya se ocupó entre el click en el panel y la carga de esta
  // pantalla, el check-in sigue el camino manual normal, sin preselección.
  useEffect(() => {
    if (!habitacionPreseleccionada || preseleccionAplicada.current) return;
    if (habitacionesQuery.isLoading) return;
    const encontrada = habitacionesLibres.find((h) => h.numero === habitacionPreseleccionada);
    preseleccionAplicada.current = true;
    if (encontrada) {
      setForm((f) =>
        f.habitaciones.some((h) => h.habitacionId === encontrada.id)
          ? f
          : { ...f, habitaciones: [...f.habitaciones, { habitacionId: encontrada.id, ...OCUPACION_DEFECTO }] }
      );
    }
  }, [habitacionPreseleccionada, habitacionesLibres, habitacionesQuery.isLoading]);

  const habitacionPorId = useMemo(() => new Map(habitacionesLibres.map((h) => [h.id, h])), [habitacionesLibres]);
  const elegidas = useMemo(
    () => form.habitaciones.map((h) => ({ ...h, info: habitacionPorId.get(h.habitacionId) })),
    [form.habitaciones, habitacionPorId]
  );
  const capacidadTotal = elegidas.reduce((acc, h) => acc + (h.info?.capacidad ?? 0), 0);
  const ocupacionValida = form.habitaciones.every((h) => {
    const capacidad = habitacionPorId.get(h.habitacionId)?.capacidad;
    return h.adultos >= 1 && (capacidad === undefined || h.adultos + h.menores <= capacidad);
  });

  // Etapa 4A (HU-95) — cotización real contra el motor para el paso "Plan".
  const claveOcupacion = form.habitaciones.map((h) => `${h.habitacionId}:${h.adultos}:${h.menores}`).join("|");
  const cotizarQuery = useQuery({
    queryKey: ["check-in", "cotizar", hoy, form.fechaHasta, claveOcupacion],
    queryFn: () =>
      cotizarReserva({ fechaDesde: hoy, fechaHasta: form.fechaHasta, habitaciones: form.habitaciones, canal: "RECEPCION" }),
    enabled: form.paso >= PASO_PLAN && form.habitaciones.length > 0 && ocupacionValida,
  });
  const planesDisponibles = cotizarQuery.data?.planes ?? [];

  const planesActivosQuery = useQuery({
    queryKey: ["tarifas", "planes", "activos"],
    queryFn: () => listarPlanesTarifarios({ activo: "true" }),
  });
  const idPlanPorCodigo = useMemo(
    () => Object.fromEntries((planesActivosQuery.data ?? []).map((p) => [p.codigo, p.id])),
    [planesActivosQuery.data]
  );

  const planSeleccionado = planesDisponibles.find((p) => p.codigo === form.planCodigo) ?? null;
  const totalEstadia = planSeleccionado?.total ?? 0;

  function elegirPlan(plan) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, planCodigo: plan.codigo, planTarifarioId: idPlanPorCodigo[plan.codigo] ?? "" }));
  }

  const mutacion = useMutation({
    mutationFn: () =>
      registrarCheckInWalkIn({
        fechaHasta: form.fechaHasta,
        habitaciones: form.habitaciones,
        planTarifarioId: form.planTarifarioId,
        totalEsperado: totalEstadia,
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
    onError: (error) => {
      setErrorGeneral(error?.response?.data?.error ?? "No se pudo registrar el check-in.");
      // HU-96 (regla 4) — el precio cambió entre la cotización mostrada y la
      // que el backend volvió a calcular al confirmar (409): se recotiza.
      if (error?.response?.status === 409) {
        cotizarQuery.refetch();
        setForm((f) => ({ ...f, paso: PASO_PLAN, planCodigo: "", planTarifarioId: "" }));
      }
    },
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
      habitaciones: f.habitaciones.some((h) => h.habitacionId === id)
        ? f.habitaciones.filter((h) => h.habitacionId !== id)
        : [...f.habitaciones, { habitacionId: id, ...OCUPACION_DEFECTO }],
    }));
  }

  function cambiarOcupacion(habitacionId, campo, valor) {
    setErrorGeneral("");
    const numero = Math.max(0, Number(valor) || 0);
    setForm((f) => ({
      ...f,
      habitaciones: f.habitaciones.map((h) => (h.habitacionId === habitacionId ? { ...h, [campo]: numero } : h)),
    }));
  }

  function confirmar() {
    // La validación de nombre/documento/contacto ya la garantiza el botón
    // (disabled={!huespedValido}) y el paso de huésped al avanzar — acá
    // solo queda el chequeo que ese gate no cubre.
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
    irA(PASO_GARANTIA);
  }

  const puedeAvanzarPaso1 = rangoValido;
  const puedeAvanzarPaso2 = form.habitaciones.length > 0 && ocupacionValida;
  const puedeAvanzarPlan = Boolean(form.planTarifarioId) && !cotizarQuery.isError;

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
              onChange={(e) => actualizar({ fechaHasta: e.target.value, habitaciones: [], planCodigo: "", planTarifarioId: "" })}
            />
            <Select
              label="Tipo deseado"
              value={form.tipoHabitacionId}
              onChange={(e) => actualizar({ tipoHabitacionId: e.target.value, habitaciones: [], planCodigo: "", planTarifarioId: "" })}
            >
              <option value="">Cualquiera</option>
              {(tiposQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {/* Paso 2 — asignación manual de habitación (HU-45) y ocupación */}
      {form.paso === 2 && (
        <div className="flex flex-col gap-4 rounded-lg border border-borde bg-white px-6 py-5">
          <TituloSeccion icono={BedDouble} tono="pino">
            Asignación de habitación
          </TituloSeccion>

          {habitacionesQuery.isLoading && <p className="text-sm text-piedra">Buscando habitaciones libres…</p>}
          {habitacionesQuery.isError && (
            <p className="text-[13px] text-error-texto">No se pudo consultar la disponibilidad.</p>
          )}

          {!habitacionesQuery.isLoading && !habitacionesQuery.isError && habitacionesLibres.length === 0 && (
            <p className="text-sm text-piedra">No hay habitaciones libres ahora mismo con esos filtros.</p>
          )}

          {habitacionesLibres.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {habitacionesLibres.map((h) => {
                const elegida = form.habitaciones.some((x) => x.habitacionId === h.id);
                const desde = precioDesde(h);
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
                      <span>{desde != null ? `${FORMATO_MONEDA.format(desde)}/noche` : "—"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {elegidas.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-borde bg-hueso px-5 py-4">
              <div className="flex items-center gap-2 text-[13px]">
                <Users size={15} className="text-piedra" />
                {elegidas.length} habitación{elegidas.length === 1 ? "" : "es"} elegida{elegidas.length === 1 ? "" : "s"} · capacidad
                total {capacidadTotal}
                {elegidas.length > 1 && <Badge variante="info">Grupal</Badge>}
              </div>

              {/* Etapa 4A (HU-95, regla 1) — ocupación editable por
                  habitación: los menores nunca suman cargo. */}
              <p className="text-[11.5px] text-piedra">Menores de 0 a 12 años sin cargo.</p>
              <div className="flex flex-col gap-2">
                {elegidas.map((h) => (
                  <div
                    key={h.habitacionId}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-borde bg-white px-4 py-2.5"
                  >
                    <span className="min-w-[90px] font-mono text-[13px] font-medium">
                      {h.info?.numero ?? h.habitacionId} <span className="text-piedra">({h.info?.tipo})</span>
                    </span>
                    <label className="flex items-center gap-1.5 text-[12px] text-piedra">
                      Adultos
                      <input
                        type="number"
                        min={1}
                        max={h.info?.capacidad}
                        value={h.adultos}
                        onChange={(e) => cambiarOcupacion(h.habitacionId, "adultos", e.target.value)}
                        aria-label={`Adultos en habitación ${h.info?.numero ?? h.habitacionId}`}
                        className="w-16 rounded border border-borde px-2 py-1 text-[13px] text-tinta"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-[12px] text-piedra">
                      Menores
                      <input
                        type="number"
                        min={0}
                        max={h.info?.capacidad}
                        value={h.menores}
                        onChange={(e) => cambiarOcupacion(h.habitacionId, "menores", e.target.value)}
                        aria-label={`Menores en habitación ${h.info?.numero ?? h.habitacionId}`}
                        className="w-16 rounded border border-borde px-2 py-1 text-[13px] text-tinta"
                      />
                    </label>
                    {h.info?.capacidad != null && h.adultos + h.menores > h.info.capacidad && (
                      <span className="text-[11.5px] text-error-texto">Supera la capacidad ({h.info.capacidad}).</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paso 3 — plan tarifario (Etapa 4A, ajuste A: uno por reserva) */}
      {form.paso === PASO_PLAN && (
        <div className="flex flex-col gap-4 rounded-lg border border-borde bg-white px-6 py-5">
          <TituloSeccion icono={BedDouble} tono="pino">
            Plan tarifario
          </TituloSeccion>
          <p className="text-[12.5px] text-piedra">
            {elegidas.map((h) => `${h.info?.numero ?? h.habitacionId} (${h.info?.tipo ?? ""})`).join(", ")} · hoy al{" "}
            {form.fechaHasta}
          </p>

          {cotizarQuery.isLoading && <p className="text-[13px] text-piedra">Calculando precios…</p>}
          {cotizarQuery.isError && (
            <p className="text-[12.5px] text-error-texto">
              {cotizarQuery.error?.response?.data?.error ?? "No se pudo cotizar la reserva."}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {planesDisponibles.map((plan) => {
              const elegido = form.planCodigo === plan.codigo;
              return (
                <button
                  key={plan.codigo}
                  type="button"
                  onClick={() => elegirPlan(plan)}
                  aria-pressed={elegido}
                  className={`flex flex-col gap-2 rounded-lg border p-5 text-left transition-colors ${
                    elegido ? "border-pino bg-pino text-hueso" : "border-borde bg-white hover:bg-hueso"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-[16px] font-semibold">{plan.nombre}</span>
                    {elegido && <Check size={16} className="flex-none text-hueso" />}
                  </div>
                  <p className={`text-[11px] uppercase tracking-wide ${elegido ? "text-hueso/70" : "text-piedra"}`}>
                    Precios finales, IVA incluido
                  </p>
                  <Badge variante={plan.reembolsable ? "ok" : "error"}>
                    {plan.reembolsable
                      ? `Cancelación sin cargo hasta ${plan.horasCancelacionSinCargo}hs antes`
                      : "No reembolsable"}
                  </Badge>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                    <div>
                      <p className={`text-[11px] uppercase tracking-wide ${elegido ? "text-hueso/70" : "text-piedra"}`}>
                        Total estadía
                      </p>
                      <Cifra tamano={22}>{FORMATO_MONEDA.format(plan.total)}</Cifra>
                    </div>
                    <p className={`text-[12px] ${elegido ? "text-hueso/80" : "text-piedra"}`}>
                      {FORMATO_MONEDA.format(plan.promedioPorNoche)} / noche
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {!cotizarQuery.isLoading && !cotizarQuery.isError && planesDisponibles.length === 0 && (
            <p className="rounded-lg border border-borde bg-hueso px-5 py-4 text-center text-[13px] text-piedra">
              No hay ningún plan disponible para estas fechas.
            </p>
          )}
        </div>
      )}

      {/* Paso 4 — datos del huésped (HU-39, mismos campos que Reservas) */}
      {form.paso === PASO_HUESPED && (
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

      {/* Paso 5 — garantía (HU-46) y resumen final */}
      {form.paso === PASO_GARANTIA && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-borde bg-white px-6 py-5 text-[13px]">
            <p className="font-semibold">Resumen</p>
            <p className="mt-1 text-piedra">
              {elegidas.map((h) => `${h.info?.numero ?? h.habitacionId} (${h.info?.tipo ?? ""})`).join(", ") || "—"} · hoy al{" "}
              {form.fechaHasta} · {planSeleccionado?.nombre ?? "—"} ·{" "}
              <span className="font-semibold text-tinta">{FORMATO_MONEDA.format(totalEstadia)}</span>
            </p>
            <p className="mt-1 text-piedra">
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
            <Button variante="ok" disabled={!puedeAvanzarPaso2} onClick={() => irA(PASO_PLAN)}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === PASO_PLAN && (
            <Button variante="ok" disabled={!puedeAvanzarPlan} onClick={() => irA(PASO_HUESPED)}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === PASO_HUESPED && (
            <Button variante="ok" onClick={avanzarDesdeHuesped}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === PASO_GARANTIA && (
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
