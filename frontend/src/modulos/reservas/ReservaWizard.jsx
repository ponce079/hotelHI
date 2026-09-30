import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BedDouble, Check, CreditCard, Search, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Table } from "../../componentes/Table";
import { formatearFechaSinHora, hoyEnHoraLocal } from "../../lib/fechas";
import { ESTADO_HABITACION_BADGE, ESTADO_HABITACION_LABEL } from "../habitaciones/habitaciones.constantes";
import { MEDIOS_CON_TARJETA } from "../pagos-estadia/pagoEstadia.constantes";
import { TarjetaSimuladaPanel } from "../pagos-estadia/TarjetaSimuladaPanel";
import { listarPlanesTarifarios } from "../tarifas/tarifas.api";
import { listarTiposHabitacion } from "../tipos-habitacion/tiposHabitacion.api";
import { consultarDisponibilidad, cotizarReserva, crearReserva, crearReservaConSena, modificarReserva } from "./reservas.api";
import {
  CANALES_CONFIRMACION,
  LIMITES_RESERVA,
  MENSAJE_ESTADIA_LARGA,
  PORCENTAJE_SENIA_RESERVA,
  TIPOS_DOCUMENTO,
} from "./reservas.constantes";
import { validarHuesped } from "./validarHuesped";

// Alta de reserva (HU-36) y edición de una existente (HU-37) en el mismo
// wizard: los primeros pasos son idénticos, solo cambia con qué datos
// arranca y a qué endpoint confirma. Es además el mismo componente que usa
// el autoservicio web (HU-40) — ahí cambia el `origen` y el envoltorio,
// nunca la lógica, que es justo lo que pide el criterio de aceptación.
//
// Etapa 4A (HU-95/96) — el precio nunca lo calcula el frontend: cada paso
// que necesita un importe lo pide al motor (cotizarReserva) y lo muestra
// tal cual. El paso nuevo "Plan" obliga a elegir un plan tarifario ANTES de
// llegar a los datos del huésped — sin plan no hay precio que congelar.
//
// El paso "Seña" (HU-88) es exclusivo del alta asistida por mostrador (ver
// `requiereSenia` más abajo): edición y autoservicio web siguen terminando
// sin ese paso, sin tocar nada de su comportamiento.
const PASOS_BASE = ["Fechas de la estadía", "Habitaciones", "Plan", "Datos del huésped"];
const PASOS_CON_SENIA = [...PASOS_BASE, "Seña"];

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const HUESPED_VACIO = {
  nombre: "",
  tipoDocumento: TIPOS_DOCUMENTO[0],
  numeroDocumento: "",
  contacto: "",
  preferencias: "",
};

// Ocupación por defecto de una habitación recién elegida — mismo default
// que ya usaba el motor de forma implícita antes de esta etapa (2 adultos,
// 0 menores).
const OCUPACION_DEFECTO = { adultos: 2, menores: 0 };

// Medios que ofrece el paso de seña: los mismos 4 que Check-in/Check-out
// salvo "Online" (mismos strings que MEDIOS_PAGO_ESTADIA, pagoEstadia.
// constantes.js — viajan tal cual en el `tipo` del medio de pago, sin
// traducción de por medio). Cuáles de esos 4 necesitan pasar por la
// terminal simulada lo sigue decidiendo MEDIOS_CON_TARJETA (mismo criterio
// que PagoEstadiaWizard, no se reimplementa esa lista acá.
const MEDIOS_SENIA = ["Efectivo", "Transferencia", "Tarjeta crédito", "Tarjeta débito"];
const MEDIO_SENIA_LABEL = {
  Efectivo: "Efectivo",
  Transferencia: "Transferencia",
  "Tarjeta crédito": "Tarjeta de crédito",
  "Tarjeta débito": "Tarjeta de débito",
};

function soloFecha(valorISO) {
  return valorISO ? String(valorISO).slice(0, 10) : "";
}

function calcularNoches(fechaDesde, fechaHasta) {
  if (!fechaDesde || !fechaHasta) return 0;
  return Math.round((new Date(`${fechaHasta}T00:00:00Z`) - new Date(`${fechaDesde}T00:00:00Z`)) / 86400000);
}

// Texto del motivo de bloqueo de una tarjeta "tomada" en el paso 2 (ver
// `motivo` en consultarDisponibilidad, reservas.servicio.js): "reserva" es
// otra reserva superpuesta (con huésped solo si el backend lo mandó — acá
// nunca pasa con origen "WEB", ver mostrarOcupadas), "estado" es una
// habitación bloqueada por su propio estado físico hoy (mantenimiento,
// bloqueada, en limpieza) sin ninguna reserva de por medio.
function textoMotivoBloqueo(motivo) {
  if (!motivo) return null;
  if (motivo.tipo === "reserva") {
    const desde = formatearFechaSinHora(motivo.fechaDesde);
    const hasta = formatearFechaSinHora(motivo.fechaHasta);
    return `Reservada — ${motivo.huespedNombre ?? "otro huésped"}, ${desde} al ${hasta} (${motivo.codigoConfirmacion})`;
  }
  return `No disponible — ${ESTADO_HABITACION_LABEL[motivo.estado]?.toLowerCase() ?? motivo.estado}`;
}

// Etapa 4A (HU-95, regla 6) — "Desde $X por noche" de una habitación en el
// paso 2, antes de elegir plan: el menor promedio por noche entre los
// planes que el motor ya devolvió para esa habitación. Si el motor no pudo
// cotizar nada para su tipo (sin tarifa, estadía mínima, etc.), no hay
// precio que mostrar — solo el motivo.
function precioDesde(habitacion) {
  const planes = habitacion?.planes ?? [];
  if (planes.length === 0) return null;
  return Math.min(...planes.map((p) => p.promedioPorNoche));
}

function estadoInicial(reserva, valoresIniciales) {
  if (!reserva) {
    // La pantalla interna de disponibilidad (Disponibilidad, modoInterno)
    // manda el período y las habitaciones ya elegidas por navigate(state);
    // la pública de autoservicio (HU-38/40) solo manda el período. Con
    // habitaciones ya elegidas, los pasos 1 y 2 se saltan — pero la
    // ocupación de cada una sigue siendo editable en el paso 2 (Etapa 4A):
    // arranca ahí, no más adelante, para no esconder esa decisión.
    const habitaciones = valoresIniciales?.habitaciones ?? [];
    return {
      paso: habitaciones.length > 0 ? 2 : 1,
      fechaDesde: valoresIniciales?.fechaDesde ?? "",
      fechaHasta: valoresIniciales?.fechaHasta ?? "",
      tipoHabitacionId: "",
      capacidadMinima: "",
      habitaciones,
      planTarifarioId: "",
      planCodigo: "",
      huesped: { ...HUESPED_VACIO },
      canalConfirmacion: CANALES_CONFIRMACION[0],
    };
  }
  return {
    paso: 1,
    fechaDesde: soloFecha(reserva.fechaDesde),
    fechaHasta: soloFecha(reserva.fechaHasta),
    tipoHabitacionId: "",
    capacidadMinima: "",
    habitaciones: reserva.habitaciones.map((h) => ({
      habitacionId: h.id,
      adultos: h.adultos ?? OCUPACION_DEFECTO.adultos,
      menores: h.menores ?? OCUPACION_DEFECTO.menores,
    })),
    planTarifarioId: reserva.planTarifarioId ?? "",
    planCodigo: reserva.planTarifario?.codigo ?? "",
    huesped: {
      nombre: reserva.huesped?.nombre ?? "",
      tipoDocumento: reserva.huesped?.tipoDocumento ?? TIPOS_DOCUMENTO[0],
      numeroDocumento: reserva.huesped?.numeroDocumento ?? "",
      contacto: reserva.huesped?.contacto ?? "",
      preferencias: reserva.huesped?.preferencias ?? "",
    },
    canalConfirmacion: CANALES_CONFIRMACION[0],
  };
}

export function ReservaWizard({ reserva = null, valoresIniciales = null, origen = "RECEPCION", onExito, onCancelar }) {
  const esEdicion = Boolean(reserva);
  // HU-36/88 — seña obligatoria del 20% al confirmar una reserva NUEVA desde
  // el mostrador. No aplica a una edición (esEdicion: la reserva ya está
  // confirmada, no hay nada nuevo que señar) ni al autoservicio web (HU-40,
  // origen "WEB": un huésped anónimo no puede quedar frente a un cobro
  // obligatorio ni a la terminal de tarjeta pensada para el mostrador — la
  // seña queda acotada a HU-36, tal como se pidió).
  const requiereSenia = !esEdicion && origen === "RECEPCION";
  const PASOS = requiereSenia ? PASOS_CON_SENIA : PASOS_BASE;
  const PASO_PLAN = 3;
  const PASO_HUESPED = 4;
  // Grilla completa (disponibles + tomadas, con motivo) solo para el
  // mostrador: este mismo wizard es también la autorreserva web pública sin
  // sesión (HU-40, origen "WEB"), y ahí ni siquiera se pide el detalle de la
  // reserva ocupante — ver el comentario de incluirOcupadas/incluirHuesped
  // en consultarDisponibilidad (reservas.servicio.js).
  const mostrarOcupadas = origen !== "WEB";
  const canal = origen === "WEB" ? "WEB" : "RECEPCION";

  const [form, setForm] = useState(() => estadoInicial(reserva, valoresIniciales));
  const [errorGeneral, setErrorGeneral] = useState("");
  const [huespedTocado, setHuespedTocado] = useState({ nombre: false, numeroDocumento: false, contacto: false });
  const [intentoConfirmarHuesped, setIntentoConfirmarHuesped] = useState(false);
  const [medioSenia, setMedioSenia] = useState("");
  const [referenciaSenia, setReferenciaSenia] = useState(null);
  const [panelTarjetaAbierto, setPanelTarjetaAbierto] = useState(false);
  // Confirmación manual para los medios que no pasan por la terminal
  // simulada (Efectivo, Transferencia) — mismo rol que `referenciaSenia`
  // para tarjeta, pero sin autorización real de por medio.
  const [confirmacionManualSenia, setConfirmacionManualSenia] = useState(false);
  const esTarjetaSenia = MEDIOS_CON_TARJETA.includes(medioSenia);
  const queryClient = useQueryClient();

  // Errores en vivo, pero solo se muestran una vez que el usuario tocó el
  // campo (onBlur) o intentó confirmar con el paso incompleto — mismo
  // criterio que CheckInWalkIn.jsx, para no arrancar el paso de huésped en
  // rojo apenas se muestra vacío.
  const erroresHuesped = validarHuesped(form.huesped);
  const huespedValido = Object.keys(erroresHuesped).length === 0;
  function errorHuesped(campo) {
    return huespedTocado[campo] || intentoConfirmarHuesped ? erroresHuesped[campo] : undefined;
  }
  function tocarHuesped(campo) {
    setHuespedTocado((t) => ({ ...t, [campo]: true }));
  }

  const hoy = hoyEnHoraLocal();
  const rangoCompleto = Boolean(form.fechaDesde && form.fechaHasta && form.fechaHasta > form.fechaDesde);
  const nochesElegidas = calcularNoches(form.fechaDesde, form.fechaHasta);
  // Etapa 4A — mismo tope y mismo mensaje que el motor de cotización
  // (MAX_NOCHES_ESTADIA): frena ANTES de pedir disponibilidad, no después.
  const estadiaDemasiadoLarga = rangoCompleto && nochesElegidas > LIMITES_RESERVA.nochesPorReserva;

  const disponibilidadQuery = useQuery({
    queryKey: ["reservas", "disponibilidad", form.fechaDesde, form.fechaHasta, reserva?.id ?? null, mostrarOcupadas],
    queryFn: () =>
      consultarDisponibilidad({
        fechaDesde: form.fechaDesde,
        fechaHasta: form.fechaHasta,
        // Al editar, la propia reserva no puede contarse como ocupante de
        // sus habitaciones: si no, sus cuartos actuales desaparecerían de
        // la lista y no se los podría conservar.
        ...(esEdicion ? { excluirReservaId: reserva.id } : {}),
        ...(mostrarOcupadas ? { incluirOcupadas: true, incluirHuesped: true } : {}),
      }),
    enabled: rangoCompleto && !estadiaDemasiadoLarga,
  });

  const disponibilidad = disponibilidadQuery.data;
  const noches = disponibilidad?.noches ?? nochesElegidas;

  // HU-89 — catálogo para el select de tipo del paso 2 (ya no `resumenPorTipo`,
  // que solo trae los tipos que tienen habitaciones en el universo consultado
  // hoy — ver DisponibilidadPublicaPage.jsx para el mismo criterio). En modo
  // "WEB" (autoservicio del huésped, HU-40) mismo filtro que la disponibilidad
  // pública: solo tipos activos con al menos una habitación activa. En modo
  // mostrador, todos los tipos activos del catálogo.
  const tiposQuery = useQuery({
    queryKey: ["tipos-habitacion", "activos", origen],
    queryFn: () => listarTiposHabitacion(origen === "WEB" ? { activo: "true", conHabitacionActiva: "true" } : { activo: "true" }),
  });

  // El filtro de tipo/capacidad se aplica sobre lo ya traído: el backend
  // también los acepta, pero volver a pedir la lista entera por cada
  // cambio de un <select> es viaje de más para un dato que ya está.
  //
  // Con mostrarOcupadas, la grilla sale de `todas` (disponibles + tomadas,
  // ver consultarDisponibilidad) en vez de `habitaciones` (solo
  // disponibles) — origen "WEB" nunca pide `todas` (ver mostrarOcupadas más
  // arriba), así que ahí sigue exactamente el mismo universo de hoy.
  const universoHabitaciones = mostrarOcupadas ? (disponibilidad?.todas ?? []) : (disponibilidad?.habitaciones ?? []);
  const habitacionesFiltradas = useMemo(() => {
    const tipoId = form.tipoHabitacionId ? Number(form.tipoHabitacionId) : null;
    const capacidad = Number(form.capacidadMinima) || 0;
    return universoHabitaciones.filter(
      (h) => (!tipoId || h.tipoHabitacionId === tipoId) && (!capacidad || h.capacidad >= capacidad)
    );
  }, [universoHabitaciones, form.tipoHabitacionId, form.capacidadMinima]);
  const cantidadDisponiblesFiltradas = habitacionesFiltradas.filter((h) => h.disponible !== false).length;

  // Habitación real (número, tipo, capacidad) detrás de cada fila elegida —
  // se busca en el universo consultado, no en `form.habitaciones` (que solo
  // tiene id + ocupación).
  const habitacionPorId = useMemo(() => new Map(universoHabitaciones.map((h) => [h.id, h])), [universoHabitaciones]);
  const elegidas = useMemo(
    () => form.habitaciones.map((h) => ({ ...h, info: habitacionPorId.get(h.habitacionId) })),
    [form.habitaciones, habitacionPorId]
  );
  const capacidadTotal = elegidas.reduce((acc, h) => acc + (h.info?.capacidad ?? 0), 0);
  const ocupacionValida = form.habitaciones.every((h) => {
    const capacidad = habitacionPorId.get(h.habitacionId)?.capacidad;
    return h.adultos >= 1 && (capacidad === undefined || h.adultos + h.menores <= capacidad);
  });

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

  // Etapa 4A (HU-95) — cotización real contra el motor para el paso "Plan":
  // misma ocupación por habitación que ya eligió el paso anterior. Se
  // recalcula si cambia cualquier cosa que afecte el precio (fechas,
  // habitaciones u ocupación).
  const claveOcupacion = form.habitaciones.map((h) => `${h.habitacionId}:${h.adultos}:${h.menores}`).join("|");
  const cotizarQuery = useQuery({
    queryKey: ["reservas", "cotizar", form.fechaDesde, form.fechaHasta, claveOcupacion, canal],
    queryFn: () =>
      cotizarReserva({
        fechaDesde: form.fechaDesde,
        fechaHasta: form.fechaHasta,
        habitaciones: form.habitaciones,
        canal,
      }),
    enabled: form.paso >= PASO_PLAN && rangoCompleto && form.habitaciones.length > 0 && ocupacionValida,
  });
  const planesDisponibles = cotizarQuery.data?.planes ?? [];

  // El id numérico del plan (planTarifarioId, lo que pide el backend) no
  // viaja en la cotización (identifica los planes por `codigo`) — sale del
  // catálogo de planes activos, que ya se usa en el ABM de Tarifas.
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
  const seniaMonto = Number((totalEstadia * PORCENTAJE_SENIA_RESERVA).toFixed(2));

  function elegirPlan(plan) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, planCodigo: plan.codigo, planTarifarioId: idPlanPorCodigo[plan.codigo] ?? "" }));
  }

  const datosComunes = {
    fechaDesde: form.fechaDesde,
    fechaHasta: form.fechaHasta,
    habitaciones: form.habitaciones,
    planTarifarioId: form.planTarifarioId,
    huesped: {
      nombre: form.huesped.nombre.trim(),
      tipoDocumento: form.huesped.tipoDocumento,
      numeroDocumento: form.huesped.numeroDocumento.trim(),
      contacto: form.huesped.contacto.trim(),
      preferencias: form.huesped.preferencias.trim() || undefined,
    },
  };

  // Etapa 4A (HU-96, regla 9) — vista previa de una modificación: qué costaba
  // antes vs. qué va a costar con los cambios, ANTES de guardar. Solo tiene
  // sentido en edición, y solo una vez que hay plan elegido.
  const previaQuery = useQuery({
    queryKey: [
      "reservas",
      "modificar-previa",
      reserva?.id,
      form.fechaDesde,
      form.fechaHasta,
      claveOcupacion,
      form.planTarifarioId,
    ],
    queryFn: () => modificarReserva(reserva.id, { ...datosComunes, soloPrevia: true }),
    enabled: esEdicion && form.paso === PASO_HUESPED && Boolean(form.planTarifarioId),
  });

  const mutacion = useMutation({
    mutationFn: async () => {
      if (esEdicion) {
        return modificarReserva(reserva.id, datosComunes);
      }

      const datosAlta = {
        ...datosComunes,
        totalEsperado: totalEstadia,
        canalConfirmacion: form.canalConfirmacion,
        origen,
      };

      // Con seña (HU-88): un único POST que crea la Reserva y cobra la seña
      // en la misma transacción atómica — hasta que esto no resuelve bien,
      // no se guardó nada en la base (ni la reserva). Si el cobro falla acá
      // (tarjeta rechazada, error de validación), no queda ninguna reserva
      // creada — el recepcionista reintenta desde el mismo paso sin haber
      // perdido los datos anteriores, que siguen en `form`.
      if (requiereSenia) {
        return crearReservaConSena({
          ...datosAlta,
          medios: [
            {
              tipo: medioSenia,
              importe: seniaMonto,
              referencia: esTarjetaSenia ? referenciaSenia : undefined,
            },
          ],
        });
      }

      // Autoservicio web (HU-40): nunca cobra seña, alta simple de siempre.
      return crearReserva(datosAlta);
    },
    onSuccess: (guardada) => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      onExito(guardada);
    },
    onError: (error) => {
      setErrorGeneral(error?.response?.data?.error ?? "No se pudo guardar la reserva.");
      // HU-96 (regla 4) — el precio cambió entre la cotización que se
      // mostró y la que el backend volvió a calcular al confirmar (409):
      // se recotiza para que la próxima confirmación use el valor real.
      if (error?.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ["reservas", "cotizar"] });
        cotizarQuery.refetch();
        setForm((f) => ({ ...f, paso: PASO_PLAN, planCodigo: "", planTarifarioId: "" }));
      }
    },
  });

  function actualizar(campo, valor) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function actualizarHuesped(campo, valor) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, huesped: { ...f.huesped, [campo]: valor } }));
  }

  // Cambiar el rango invalida lo elegido: una habitación libre del 10 al 15
  // no tiene por qué seguir libre del 12 al 20, y arrastrar la selección
  // haría confirmar algo que la pantalla ya no mostró como disponible. El
  // plan también se invalida: el precio de un plan depende del rango.
  function cambiarFecha(campo, valor) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, [campo]: valor, habitaciones: [], planCodigo: "", planTarifarioId: "" }));
  }

  function irA(paso) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, paso }));
  }

  function avanzarDesdeHuesped() {
    if (!huespedValido) {
      setIntentoConfirmarHuesped(true);
      return;
    }
    irA(PASO_HUESPED + 1);
  }

  function elegirMedioSenia(medio) {
    setErrorGeneral("");
    setMedioSenia(medio);
    setReferenciaSenia(null);
    setPanelTarjetaAbierto(false);
    setConfirmacionManualSenia(false);
  }

  function confirmar() {
    // Paso de huésped como último paso (edición o autoservicio web, sin
    // seña): mismo chequeo de siempre. Con seña, el huésped ya se validó al
    // avanzar del paso de huésped al de seña (avanzarDesdeHuesped) — acá
    // solo queda mandar.
    if (form.paso === PASO_HUESPED && !huespedValido) {
      setIntentoConfirmarHuesped(true);
      return;
    }
    setErrorGeneral("");
    mutacion.mutate();
  }

  const puedeAvanzarPaso1 = rangoCompleto && !estadiaDemasiadoLarga && !disponibilidadQuery.isError;
  const puedeAvanzarPaso2 = form.habitaciones.length > 0 && ocupacionValida;
  const puedeAvanzarPasoPlan = Boolean(form.planTarifarioId) && !cotizarQuery.isError;
  const esUltimoPaso = form.paso === PASOS.length;
  const puedeConfirmarSenia = !medioSenia
    ? false
    : esTarjetaSenia
      ? Boolean(referenciaSenia)
      : confirmacionManualSenia;
  const puedeConfirmarFinal =
    form.paso === PASOS.length && requiereSenia
      ? puedeConfirmarSenia
      : huespedValido && !(esEdicion && form.paso === PASO_HUESPED && previaQuery.isError);

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <p className="-mt-1 font-mono text-[11px] text-tinta/55">
        {esEdicion
          ? "HU 37/96 — modificar fechas, habitaciones, plan o datos del huésped"
          : requiereSenia
            ? "HU 36, 39, 41, 42, 88, 95 y 96 — plan, precio del motor y seña cobrada antes de confirmar"
            : "HU 36, 39, 41, 42, 95 y 96 — plan y precio del motor validados antes de confirmar"}
      </p>

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

      {/* Paso 1 — fechas */}
      {form.paso === 1 && (
        <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-[22px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Entrada (check-in) *"
              type="date"
              min={hoy}
              value={form.fechaDesde}
              onChange={(e) => cambiarFecha("fechaDesde", e.target.value)}
            />
            <Input
              label="Salida (check-out) *"
              type="date"
              min={form.fechaDesde || hoy}
              value={form.fechaHasta}
              onChange={(e) => cambiarFecha("fechaHasta", e.target.value)}
            />
          </div>

          {form.fechaDesde && form.fechaHasta && !rangoCompleto && (
            <p className="text-[12.5px] text-error-texto">
              La salida tiene que ser posterior a la entrada: una estadía es de al menos una noche.
            </p>
          )}

          {estadiaDemasiadoLarga && <p className="text-[12.5px] text-error-texto">{MENSAJE_ESTADIA_LARGA}</p>}

          {rangoCompleto && !estadiaDemasiadoLarga && (
            <div className="flex flex-wrap items-center gap-6 rounded-lg border border-borde bg-hueso px-5 py-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-piedra">Noches</p>
                <Cifra tamano={26}>{noches}</Cifra>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-piedra">Habitaciones libres</p>
                <Cifra tamano={26}>
                  {disponibilidadQuery.isLoading ? "…" : (disponibilidad?.habitaciones.length ?? 0)}
                </Cifra>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(disponibilidad?.resumenPorTipo ?? []).map((r) => (
                  <Badge key={r.tipoHabitacionId} variante={r.disponibles > 0 ? "ok" : "neutro"}>
                    {r.tipo}: {r.disponibles}/{r.total}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {disponibilidadQuery.isError && (
            <p className="text-[12.5px] text-error-texto">
              {disponibilidadQuery.error?.response?.data?.error ?? "No se pudo consultar la disponibilidad."}
            </p>
          )}
        </div>
      )}

      {/* Paso 2 — habitaciones y ocupación */}
      {form.paso === 2 && (
        <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-[22px]">
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Tipo"
              value={form.tipoHabitacionId}
              onChange={(e) => actualizar("tipoHabitacionId", e.target.value)}
              className="min-w-[160px]"
            >
              <option value="">Todos los tipos</option>
              {(tiposQuery.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Select>
            <Select
              label="Capacidad mínima"
              value={form.capacidadMinima}
              onChange={(e) => actualizar("capacidadMinima", e.target.value)}
              className="min-w-[150px]"
            >
              <option value="">Sin mínimo</option>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} persona{n === 1 ? "" : "s"}
                </option>
              ))}
            </Select>
            <p className="ml-auto text-[12.5px] text-piedra">
              {cantidadDisponiblesFiltradas} habitación{cantidadDisponiblesFiltradas === 1 ? "" : "es"} disponible
              {cantidadDisponiblesFiltradas === 1 ? "" : "s"}
              {mostrarOcupadas ? ` de ${habitacionesFiltradas.length}` : ""} del {form.fechaDesde} al {form.fechaHasta}
            </p>
          </div>

          <Table
            columnas={["", "Habitación", "Tipo", "Capacidad", "Piso", "Desde / noche"]}
            filas={habitacionesFiltradas}
            columnasDerecha={["Capacidad", "Piso", "Desde / noche"]}
            vacio="No hay habitaciones disponibles con esos filtros para el período elegido."
            renderFila={(h) => {
              // "Tomada por otra reserva" (o bloqueada por su propio estado
              // físico hoy) NO es lo mismo que el badge informativo de
              // estadoActual (ver textoMotivoBloqueo más arriba): acá se
              // bloquea la selección entera, ahí solo se avisa sin bloquear
              // nada — nunca se mezclan en la misma tarjeta.
              const disponible = h.disponible !== false;
              const elegida = disponible && form.habitaciones.some((x) => x.habitacionId === h.id);
              const motivo = disponible ? null : textoMotivoBloqueo(h.motivo);
              const desde = precioDesde(h);
              return (
                <tr
                  key={h.id}
                  onClick={disponible ? () => alternarHabitacion(h.id) : undefined}
                  className={`h-14 border-b border-borde last:border-0 ${
                    disponible ? `cursor-pointer hover:bg-hueso ${elegida ? "bg-pino-100/60" : ""}` : "cursor-default bg-neutro-100/60 text-piedra"
                  }`}
                >
                  <td className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={elegida}
                      disabled={!disponible}
                      onChange={() => alternarHabitacion(h.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Elegir habitación ${h.numero}`}
                      className="h-4 w-4 cursor-pointer accent-pino disabled:cursor-default"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 font-mono text-[13px] font-medium">
                      <BedDouble size={16} className={disponible ? "text-pino" : "text-piedra"} />
                      {h.numero}
                      {disponible && h.estadoActual && (
                        <Badge variante={ESTADO_HABITACION_BADGE[h.estadoActual] ?? "neutro"}>
                          Actualmente {ESTADO_HABITACION_LABEL[h.estadoActual]?.toLowerCase() ?? h.estadoActual}
                        </Badge>
                      )}
                    </div>
                    {disponible && h.equipamiento && (
                      <div className="mt-0.5 max-w-[320px] truncate text-[11px] text-piedra">{h.equipamiento}</div>
                    )}
                    {motivo && <div className="mt-0.5 max-w-[320px] text-[11px] text-piedra">{motivo}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">{h.tipo}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{h.capacidad}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{h.piso}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {desde != null ? FORMATO_MONEDA.format(desde) : h.motivoNoDisponible ? "—" : "…"}
                  </td>
                </tr>
              );
            }}
          />

          {form.habitaciones.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-borde bg-hueso px-5 py-4">
              <div className="flex items-center gap-2 text-[13px]">
                <Users size={15} className="text-piedra" />
                {form.habitaciones.length} habitación{form.habitaciones.length === 1 ? "" : "es"} · capacidad total{" "}
                {capacidadTotal}
                {form.habitaciones.length > 1 && <Badge variante="info">Reserva grupal</Badge>}
              </div>

              {/* Etapa 4A (HU-95, regla 1) — ocupación editable por
                  habitación: los menores nunca suman cargo, así que no hace
                  falta que el recepcionista distinga edades exactas. */}
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
                      <span className="text-[11.5px] text-error-texto">
                        Supera la capacidad ({h.info.capacidad}).
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paso 3 — plan tarifario (Etapa 4A, HU-95) */}
      {form.paso === PASO_PLAN && (
        <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-[22px]">
          <p className="text-[12.5px] text-piedra">
            {elegidas.map((h) => `${h.info?.numero ?? h.habitacionId} (${h.info?.tipo ?? ""})`).join(", ")} · del{" "}
            {form.fechaDesde} al {form.fechaHasta} · {noches} noche{noches === 1 ? "" : "s"}
          </p>

          {cotizarQuery.isLoading && <p className="text-[13px] text-piedra">Calculando precios…</p>}

          {cotizarQuery.isError && (
            <p className="text-[12.5px] text-error-texto">
              {cotizarQuery.error?.response?.data?.error ?? "No se pudo cotizar la reserva."}
            </p>
          )}

          {cotizarQuery.data?.estadiaMinimaExigida != null && (
            <p className="text-[12px] text-piedra">
              Estadía mínima para esta consulta: {cotizarQuery.data.estadiaMinimaExigida} noche
              {cotizarQuery.data.estadiaMinimaExigida === 1 ? "" : "s"}.
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
              No hay ningún plan disponible para este canal y estas fechas.
            </p>
          )}
        </div>
      )}

      {/* Paso 4 — huésped */}
      {form.paso === PASO_HUESPED && (
        <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-[22px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Nombre y apellido *"
              value={form.huesped.nombre}
              maxLength={LIMITES_RESERVA.nombre}
              onChange={(e) => actualizarHuesped("nombre", e.target.value)}
              onBlur={() => tocarHuesped("nombre")}
              error={errorHuesped("nombre")}
              placeholder="Ana Pérez"
            />
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
              <Select
                label="Documento *"
                value={form.huesped.tipoDocumento}
                onChange={(e) => actualizarHuesped("tipoDocumento", e.target.value)}
              >
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
              <Input
                label="Número *"
                value={form.huesped.numeroDocumento}
                maxLength={LIMITES_RESERVA.numeroDocumento}
                onChange={(e) => actualizarHuesped("numeroDocumento", e.target.value)}
                onBlur={() => tocarHuesped("numeroDocumento")}
                error={errorHuesped("numeroDocumento")}
                placeholder="30111222"
              />
            </div>
            <Input
              label="Contacto (email o teléfono)"
              value={form.huesped.contacto}
              type="email"
              maxLength={LIMITES_RESERVA.contacto}
              onChange={(e) => actualizarHuesped("contacto", e.target.value)}
              onBlur={() => tocarHuesped("contacto")}
              error={errorHuesped("contacto")}
              placeholder="ana@mail.com"
            />
            {!esEdicion && (
              <Select
                label="Enviar confirmación por"
                value={form.canalConfirmacion}
                onChange={(e) => actualizar("canalConfirmacion", e.target.value)}
              >
                {CANALES_CONFIRMACION.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <label className="flex flex-col gap-1.5 font-body text-sm">
            <span className="text-[12px] text-tinta/70">Preferencias</span>
            <textarea
              rows={3}
              value={form.huesped.preferencias}
              maxLength={LIMITES_RESERVA.preferencias}
              onChange={(e) => actualizarHuesped("preferencias", e.target.value)}
              placeholder="Piso alto, cuna, alergias, horario de llegada…"
              className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
            />
          </label>

          <div className="rounded-lg border border-borde bg-hueso px-5 py-4 text-[13px]">
            <p className="font-semibold">Resumen</p>
            <p className="mt-1 text-piedra">
              {elegidas.map((h) => `${h.info?.numero ?? h.habitacionId} (${h.info?.tipo ?? ""})`).join(", ") || "—"} · del{" "}
              {form.fechaDesde} al {form.fechaHasta} · {noches} noche{noches === 1 ? "" : "s"} · {planSeleccionado?.nombre ?? "—"} ·{" "}
              <span className="font-semibold text-tinta">
                {/* Etapa 4A (HU-96) — en edición, `totalEstadia` es la
                    recotización cruda de TODA la estadía (lo que costaría si
                    nada se conservara); lo que de verdad se va a guardar es
                    el de la vista previa (con las noches sin cambios
                    conservando su precio congelado) — mostrar el crudo acá
                    confundiría al recepcionista con dos totales distintos
                    para la misma acción. */}
                {FORMATO_MONEDA.format(esEdicion ? (previaQuery.data?.totalNuevo ?? totalEstadia) : totalEstadia)}
              </span>
            </p>
          </div>

          {/* Etapa 4A (HU-96, regla 9) — vista previa de una modificación:
              antes de guardar, cuánto costaba y cuánto va a costar. Si el
              backend rechaza la vista previa (ej. cambio de fechas en un
              plan no reembolsable), se muestra ese motivo acá — no hace
              falta llegar a tocar "Guardar cambios" para enterarse. */}
          {esEdicion && previaQuery.data && (
            <div className="rounded-lg border border-pino-300 bg-pino-100 px-5 py-4 text-[13px] text-pino-700">
              <p className="font-semibold">Vista previa del cambio</p>
              <p className="mt-1">
                Antes: {FORMATO_MONEDA.format(previaQuery.data.totalAnterior)} · Ahora:{" "}
                {FORMATO_MONEDA.format(previaQuery.data.totalNuevo)} ·{" "}
                {previaQuery.data.diferencia === 0
                  ? "sin diferencia"
                  : `diferencia ${previaQuery.data.diferencia > 0 ? "+" : ""}${FORMATO_MONEDA.format(previaQuery.data.diferencia)}`}
              </p>
              {previaQuery.data.mensajeNoReembolsable && (
                <p className="mt-1 font-semibold">{previaQuery.data.mensajeNoReembolsable}</p>
              )}
              {/* Etapa 4B (HU-97) — si esta modificación va a recotizar (y
                  por lo tanto borrar) el ajuste manual de precio de alguna
                  noche, se avisa acá, antes de confirmar. */}
              {previaQuery.data.mensajeAjustePerdido && (
                <p className="mt-1 font-semibold">{previaQuery.data.mensajeAjustePerdido}</p>
              )}
            </div>
          )}
          {esEdicion && previaQuery.isError && (
            <p className="rounded-md border border-error bg-error-suave px-4 py-2.5 text-[12.5px] text-error-texto">
              {previaQuery.error?.response?.data?.error ?? "No se pudo calcular la vista previa del cambio."}
            </p>
          )}
        </div>
      )}

      {/* Paso 5 — seña (HU-88), solo alta asistida por mostrador */}
      {form.paso === PASOS.length && requiereSenia && (
        <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-[22px]">
          <div className="rounded-lg border border-borde bg-hueso px-5 py-4 text-[13px]">
            <p className="font-semibold">Resumen</p>
            <p className="mt-1 text-piedra">
              {elegidas.map((h) => `${h.info?.numero ?? h.habitacionId} (${h.info?.tipo ?? ""})`).join(", ") || "—"} · del{" "}
              {form.fechaDesde} al {form.fechaHasta} · {noches} noche{noches === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-tinta">{form.huesped.nombre}</span> · {planSeleccionado?.nombre ?? "—"} ·{" "}
              <span className="font-semibold text-tinta">{FORMATO_MONEDA.format(totalEstadia)}</span>
            </p>
          </div>

          <div className="rounded-lg border border-pino-300 bg-pino-100 px-5 py-4">
            <p className="text-[11px] uppercase tracking-wide text-pino-700">
              Seña requerida ({PORCENTAJE_SENIA_RESERVA * 100}%)
            </p>
            <Cifra tamano={26}>{FORMATO_MONEDA.format(seniaMonto)}</Cifra>
          </div>

          <Select
            label="Medio de pago de la seña *"
            value={medioSenia}
            onChange={(e) => elegirMedioSenia(e.target.value)}
          >
            <option value="">Elegí un medio…</option>
            {MEDIOS_SENIA.map((medio) => (
              <option key={medio} value={medio}>
                {MEDIO_SENIA_LABEL[medio]}
              </option>
            ))}
          </Select>

          {medioSenia && !esTarjetaSenia && (
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-tinta">
              <input
                type="checkbox"
                checked={confirmacionManualSenia}
                onChange={(e) => setConfirmacionManualSenia(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-pino"
              />
              <span>
                {medioSenia === "Transferencia"
                  ? `Confirmo la transferencia de ${FORMATO_MONEDA.format(seniaMonto)} recibida del huésped.`
                  : `Confirmo que recibí ${FORMATO_MONEDA.format(seniaMonto)} en efectivo del huésped.`}
              </span>
            </label>
          )}

          {esTarjetaSenia &&
            (referenciaSenia ? (
              <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-pino-300 bg-pino-100 px-4 py-2.5">
                <Badge variante="ok">Autorizada</Badge>
                <span className="text-[12px] text-pino-700">{referenciaSenia}</span>
                <button
                  type="button"
                  onClick={() => setReferenciaSenia(null)}
                  className="ml-auto cursor-pointer text-[11.5px] font-semibold text-piedra underline-offset-2 hover:underline"
                >
                  Cambiar tarjeta
                </button>
              </div>
            ) : panelTarjetaAbierto ? (
              <TarjetaSimuladaPanel
                tipo={medioSenia}
                importe={seniaMonto}
                onCancelar={() => setPanelTarjetaAbierto(false)}
                onAutorizada={(referencia) => {
                  setReferenciaSenia(referencia);
                  setPanelTarjetaAbierto(false);
                }}
              />
            ) : (
              <Button variante="ok" tamano="fila" icono={CreditCard} onClick={() => setPanelTarjetaAbierto(true)}>
                Autorizar tarjeta — {FORMATO_MONEDA.format(seniaMonto)}
              </Button>
            ))}
        </div>
      )}

      {errorGeneral && (
        <p className="rounded-md border border-error bg-error-suave px-4 py-2.5 text-[12.5px] text-error-texto">
          {errorGeneral}
          {form.paso === PASOS.length && requiereSenia && " No se guardó nada: podés corregir el medio de pago y reintentar."}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          {form.paso > 1 && (
            <Button variante="secundario" icono={ArrowLeft} onClick={() => irA(form.paso - 1)}>
              Atrás
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <Button variante="fantasma" onClick={onCancelar}>
            Cancelar
          </Button>
          {form.paso === 1 && (
            <Button variante="ok" disabled={!puedeAvanzarPaso1} onClick={() => irA(2)}>
              Ver disponibilidad <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === 2 && (
            <Button variante="ok" disabled={!puedeAvanzarPaso2} onClick={() => irA(PASO_PLAN)}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === PASO_PLAN && (
            <Button variante="ok" disabled={!puedeAvanzarPasoPlan} onClick={() => irA(PASO_HUESPED)}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === PASO_HUESPED && !esUltimoPaso && (
            <Button variante="ok" onClick={avanzarDesdeHuesped}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {esUltimoPaso && (
            <Button
              variante="ok"
              icono={Check}
              cargando={mutacion.isPending}
              disabled={!puedeConfirmarFinal}
              onClick={confirmar}
            >
              {esEdicion ? "Guardar cambios" : "Confirmar reserva"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Buscador de reservas por código de confirmación (HU-42) — lo usa la
// pantalla pública para que el huésped consulte la suya, y de paso es el
// mismo camino que va a necesitar Check-in (HU-43).
export function BuscadorPorCodigo({ onBuscar, cargando }) {
  const [codigo, setCodigo] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (codigo.trim()) onBuscar(codigo.trim().toUpperCase());
      }}
    >
      <Input
        label="Código de confirmación"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        placeholder="A1B2C3D4"
        className="font-mono uppercase"
      />
      <Button type="submit" variante="secundario" icono={Search} cargando={cargando} disabled={!codigo.trim()}>
        Buscar
      </Button>
    </form>
  );
}
