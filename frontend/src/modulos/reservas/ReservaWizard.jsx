import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, BedDouble, Check, Search, Users } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Table } from "../../componentes/Table";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { ESTADO_HABITACION_BADGE, ESTADO_HABITACION_LABEL } from "../habitaciones/habitaciones.constantes";
import { consultarDisponibilidad, crearReserva, modificarReserva } from "./reservas.api";
import { CANALES_CONFIRMACION, LIMITES_RESERVA, TIPOS_DOCUMENTO } from "./reservas.constantes";
import { validarHuesped } from "./validarHuesped";

// Alta de reserva (HU-36) y edición de una existente (HU-37) en el mismo
// wizard: los tres pasos son idénticos, solo cambia con qué datos arranca
// y a qué endpoint confirma. Es además el mismo componente que usa el
// autoservicio web (HU-40) — ahí cambia el `origen` y el envoltorio, nunca
// la lógica, que es justo lo que pide el criterio de aceptación.
//
// Estructura calcada de OrdenPagoWizard.jsx: array PASOS, un único estado
// `form` con todo, y el botón final que cambia según el paso.
const PASOS = ["Fechas de la estadía", "Habitaciones", "Datos del huésped"];

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const HUESPED_VACIO = {
  nombre: "",
  tipoDocumento: TIPOS_DOCUMENTO[0],
  numeroDocumento: "",
  contacto: "",
  preferencias: "",
};

function soloFecha(valorISO) {
  return valorISO ? String(valorISO).slice(0, 10) : "";
}

function estadoInicial(reserva, valoresIniciales) {
  if (!reserva) {
    return {
      paso: 1,
      // La pantalla pública de disponibilidad (HU-38) manda el período ya
      // elegido por querystring, para no hacerlo tipear dos veces.
      fechaDesde: valoresIniciales?.fechaDesde ?? "",
      fechaHasta: valoresIniciales?.fechaHasta ?? "",
      tipo: "",
      capacidadMinima: "",
      habitacionIds: [],
      huesped: { ...HUESPED_VACIO },
      canalConfirmacion: CANALES_CONFIRMACION[0],
    };
  }
  return {
    paso: 1,
    fechaDesde: soloFecha(reserva.fechaDesde),
    fechaHasta: soloFecha(reserva.fechaHasta),
    tipo: "",
    capacidadMinima: "",
    habitacionIds: reserva.habitaciones.map((h) => h.id),
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
  const [form, setForm] = useState(() => estadoInicial(reserva, valoresIniciales));
  const [errorGeneral, setErrorGeneral] = useState("");
  const [huespedTocado, setHuespedTocado] = useState({ nombre: false, numeroDocumento: false, contacto: false });
  const [intentoConfirmarHuesped, setIntentoConfirmarHuesped] = useState(false);
  const queryClient = useQueryClient();

  // Errores en vivo, pero solo se muestran una vez que el usuario tocó el
  // campo (onBlur) o intentó confirmar con el paso incompleto — mismo
  // criterio que CheckInWalkIn.jsx, para no arrancar el paso 3 en rojo
  // apenas se muestra vacío.
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

  const disponibilidadQuery = useQuery({
    queryKey: ["reservas", "disponibilidad", form.fechaDesde, form.fechaHasta, reserva?.id ?? null],
    queryFn: () =>
      consultarDisponibilidad({
        fechaDesde: form.fechaDesde,
        fechaHasta: form.fechaHasta,
        // Al editar, la propia reserva no puede contarse como ocupante de
        // sus habitaciones: si no, sus cuartos actuales desaparecerían de
        // la lista y no se los podría conservar.
        ...(esEdicion ? { excluirReservaId: reserva.id } : {}),
      }),
    enabled: rangoCompleto,
  });

  const disponibilidad = disponibilidadQuery.data;
  const noches = disponibilidad?.noches ?? 0;

  // El filtro de tipo/capacidad se aplica sobre lo ya traído: el backend
  // también los acepta, pero volver a pedir la lista entera por cada
  // cambio de un <select> es viaje de más para un dato que ya está.
  const habitacionesFiltradas = useMemo(() => {
    const todas = disponibilidad?.habitaciones ?? [];
    const capacidad = Number(form.capacidadMinima) || 0;
    return todas.filter(
      (h) => (!form.tipo || h.tipo === form.tipo) && (!capacidad || h.capacidad >= capacidad)
    );
  }, [disponibilidad, form.tipo, form.capacidadMinima]);

  const elegidas = useMemo(
    () => (disponibilidad?.habitaciones ?? []).filter((h) => form.habitacionIds.includes(h.id)),
    [disponibilidad, form.habitacionIds]
  );
  const totalPorNoche = elegidas.reduce((acc, h) => acc + h.tarifaPorNoche, 0);
  const totalEstadia = totalPorNoche * noches;
  const capacidadTotal = elegidas.reduce((acc, h) => acc + h.capacidad, 0);

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = {
        fechaDesde: form.fechaDesde,
        fechaHasta: form.fechaHasta,
        habitacionIds: form.habitacionIds,
        huesped: {
          nombre: form.huesped.nombre.trim(),
          tipoDocumento: form.huesped.tipoDocumento,
          numeroDocumento: form.huesped.numeroDocumento.trim(),
          contacto: form.huesped.contacto.trim(),
          preferencias: form.huesped.preferencias.trim() || undefined,
        },
      };
      if (esEdicion) return modificarReserva(reserva.id, payload);
      return crearReserva({ ...payload, canalConfirmacion: form.canalConfirmacion, origen });
    },
    onSuccess: (guardada) => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      onExito(guardada);
    },
    onError: (error) => {
      setErrorGeneral(error?.response?.data?.error ?? "No se pudo guardar la reserva.");
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
  // haría confirmar algo que la pantalla ya no mostró como disponible.
  function cambiarFecha(campo, valor) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, [campo]: valor, habitacionIds: [] }));
  }

  function alternarHabitacion(id) {
    setErrorGeneral("");
    setForm((f) => ({
      ...f,
      habitacionIds: f.habitacionIds.includes(id)
        ? f.habitacionIds.filter((x) => x !== id)
        : [...f.habitacionIds, id],
    }));
  }

  function irA(paso) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, paso }));
  }

  function confirmar() {
    if (!huespedValido) {
      setIntentoConfirmarHuesped(true);
      return;
    }
    setErrorGeneral("");
    mutacion.mutate();
  }

  const puedeAvanzarPaso1 = rangoCompleto && !disponibilidadQuery.isError;
  const puedeAvanzarPaso2 = form.habitacionIds.length > 0;

  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <p className="-mt-1 font-mono text-[11px] text-tinta/55">
        {esEdicion
          ? "HU 37 — modificar fechas, habitaciones o datos del huésped"
          : "HU 36, 39, 41 y 42 — disponibilidad validada antes de confirmar"}
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

          {rangoCompleto && (
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
                  <Badge key={r.tipo} variante={r.disponibles > 0 ? "ok" : "neutro"}>
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

      {/* Paso 2 — habitaciones */}
      {form.paso === 2 && (
        <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-[22px]">
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="Tipo"
              value={form.tipo}
              onChange={(e) => actualizar("tipo", e.target.value)}
              className="min-w-[160px]"
            >
              <option value="">Todos los tipos</option>
              {(disponibilidad?.resumenPorTipo ?? []).map((r) => (
                <option key={r.tipo} value={r.tipo}>
                  {r.tipo}
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
              {habitacionesFiltradas.length} habitación{habitacionesFiltradas.length === 1 ? "" : "es"} disponible
              {habitacionesFiltradas.length === 1 ? "" : "s"} del {form.fechaDesde} al {form.fechaHasta}
            </p>
          </div>

          <Table
            columnas={["", "Habitación", "Tipo", "Capacidad", "Piso", "Por noche", "Estadía"]}
            filas={habitacionesFiltradas}
            columnasDerecha={["Capacidad", "Piso", "Por noche", "Estadía"]}
            vacio="No hay habitaciones disponibles con esos filtros para el período elegido."
            renderFila={(h) => {
              const elegida = form.habitacionIds.includes(h.id);
              return (
                <tr
                  key={h.id}
                  onClick={() => alternarHabitacion(h.id)}
                  className={`h-14 cursor-pointer border-b border-borde last:border-0 hover:bg-hueso ${
                    elegida ? "bg-pino-100/60" : ""
                  }`}
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
                      {h.estadoActual && (
                        <Badge variante={ESTADO_HABITACION_BADGE[h.estadoActual] ?? "neutro"}>
                          Actualmente {ESTADO_HABITACION_LABEL[h.estadoActual]?.toLowerCase() ?? h.estadoActual}
                        </Badge>
                      )}
                    </div>
                    {h.equipamiento && (
                      <div className="mt-0.5 max-w-[320px] truncate text-[11px] text-piedra">{h.equipamiento}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[13px]">{h.tipo}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{h.capacidad}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{h.piso}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{FORMATO_MONEDA.format(h.tarifaPorNoche)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{FORMATO_MONEDA.format(h.totalEstadia)}</td>
                </tr>
              );
            }}
          />

          {form.habitacionIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-borde bg-hueso px-5 py-4">
              <div className="flex items-center gap-2 text-[13px]">
                <Users size={15} className="text-piedra" />
                {form.habitacionIds.length} habitación{form.habitacionIds.length === 1 ? "" : "es"} · capacidad total{" "}
                {capacidadTotal}
                {form.habitacionIds.length > 1 && <Badge variante="info">Reserva grupal</Badge>}
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-piedra">
                  Total estimado · {noches} noche{noches === 1 ? "" : "s"}
                </p>
                <Cifra tamano={26}>{FORMATO_MONEDA.format(totalEstadia)}</Cifra>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paso 3 — huésped */}
      {form.paso === 3 && (
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

          {/* Mensaje anterior conservado solo como referencia:
            <p className="text-[12px] text-piedra">
              Sin datos de contacto la confirmación no se puede enviar al huésped: queda registrada como aviso interno
              para el mostrador.
            </p>
          */}

          <div className="rounded-lg border border-borde bg-hueso px-5 py-4 text-[13px]">
            <p className="font-semibold">Resumen</p>
            <p className="mt-1 text-piedra">
              {elegidas.map((h) => `${h.numero} (${h.tipo})`).join(", ") || "—"} · del {form.fechaDesde} al{" "}
              {form.fechaHasta} · {noches} noche{noches === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold text-tinta">{FORMATO_MONEDA.format(totalEstadia)}</span>
            </p>
          </div>
        </div>
      )}

      {errorGeneral && (
        <p className="rounded-md border border-error bg-error-suave px-4 py-2.5 text-[12.5px] text-error-texto">
          {errorGeneral}
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
            <Button variante="ok" disabled={!puedeAvanzarPaso2} onClick={() => irA(3)}>
              Siguiente <ArrowRight size={16} className="flex-none" />
            </Button>
          )}
          {form.paso === 3 && (
            <Button variante="ok" icono={Check} cargando={mutacion.isPending} onClick={confirmar}>
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

