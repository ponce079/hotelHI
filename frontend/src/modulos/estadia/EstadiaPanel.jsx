import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useSesion } from "../../lib/sesion";
import { Button } from "../../componentes/Button";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Modal } from "../../componentes/Modal";
import { ConsumoModal } from "../servicios-adicionales/ConsumoModal";
import { obtenerCuenta } from "../check-out/checkOut.api";
import { PAISES_SELECTOR, buscarPaisOcupante } from "./ocupantesUbicacion";
import { TIPOS_DOCUMENTO, ETIQUETAS_NUMERO_DOCUMENTO } from "../../lib/tiposDocumento";
import { validarOcupante, pendientesParaIngreso } from "./validarOcupante";
import { titularRegistrado } from "./titularRegistrado";
import { formatearFechaHora, formatearFechaDdMmAaaa, edadEnFecha } from "../../lib/fechas";
import { MAYORIA_EDAD } from "../check-in/checkInPantalla.constantes";
import {
  reintentarLecturaEstadia as reintentarLectura,
  reintentarTitular,
  demoraReintentoTitular,
} from "./recuperacionEstadia";

function ErrorConsulta({ consulta, mensaje }) {
  return (
    <div role="alert" className="rounded border border-error bg-error-suave p-3 text-sm text-error-texto">
      <p>{consulta.error?.response?.data?.error || mensaje}</p>
      <Button className="mt-2" variante="secundario" cargando={consulta.isFetching} onClick={() => consulta.refetch()}>
        Volver a cargar
      </Button>
    </div>
  );
}
const moneda = (v) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(v || 0);
// Nombre de la acción del historial en lenguaje de recepción.
const ACCIONES_HISTORIAL = {
  cancelar: "Ficha dada de baja",
  retirar: "Salida registrada",
  verificar: "Datos verificados",
  ingresar: "Ingreso registrado",
};
const CAMPOS_EVENTO = {
  tipoDocumento: "tipo",
  paisDocumento: "país emisor",
  numeroDocumento: "número",
  nombre: "nombre",
  apellido: "apellido",
  fechaNacimiento: "nacimiento",
};
// "número: 30512874 → 30512875" (sin más datos que los que cambiaron).
const cambiosEvento = (d) =>
  d.anterior && d.nuevo
    ? Object.keys(d.nuevo)
        .filter((k) => d.anterior[k] !== d.nuevo[k])
        .map((k) => {
          const v = (x) => (x == null || x === "" ? "—" : k === "fechaNacimiento" ? formatearFechaDdMmAaaa(x) : x);
          return `${CAMPOS_EVENTO[k] ?? k}: ${v(d.anterior[k])} → ${v(d.nuevo[k])}`;
        })
        .join(", ")
    : null;
const nombreDeOcupante = (personas, id) => {
  const p = personas.find((x) => x.id === id);
  return p ? `${p.nombre} ${p.apellido}`.trim() : null;
};
const detalleEvento = (e, personas = [], habitaciones = []) => {
  try {
    const d = JSON.parse(e.detalle);
    const numero = habitaciones.find((h) => h.id === d.habitacionId)?.numero;
    return [
      d.ocupanteId ? nombreDeOcupante(personas, d.ocupanteId) : null,
      d.anteriorId ? `antes: ${nombreDeOcupante(personas, d.anteriorId) ?? "otro titular"}` : null,
      cambiosEvento(d),
      d.desdeHabitacionId
        ? `de la habitación ${habitaciones.find((h) => h.id === d.desdeHabitacionId)?.numero ?? d.desdeHabitacionId}`
        : null,
      d.habitacionId ? `${d.desdeHabitacionId ? "a la habitación" : "Habitación"} ${numero ?? d.habitacionId}` : null,
      d.nuevoTitularId ? `nuevo titular: ${nombreDeOcupante(personas, d.nuevoTitularId) ?? "otra persona"}` : null,
      d.motivo,
      d.monto != null ? moneda(d.monto) : null,
      d.devolver != null ? `Devolución ${moneda(d.devolver)}` : null,
      d.aplicar != null ? `Aplicación ${moneda(d.aplicar)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } catch {
    return "";
  }
};
const fecha = (v) => formatearFechaHora(v);
// Documento para mostrar: un menor registrado sin documento (con su justificación) no queda
// como "pendiente".
function documentoDe(p, reserva) {
  if (p.numeroDocumento) return `${p.tipoDocumento ?? ""} ${p.numeroDocumento}`.trim();
  if (p.motivoSinDocumento) {
    const nacimiento = p.fechaNacimiento ? String(p.fechaNacimiento).slice(0, 10) : null;
    const ingreso = String(p.fechaDesde ?? reserva.fechaDesde).slice(0, 10);
    const menor = nacimiento && `${Number(nacimiento.slice(0, 4)) + 18}${nacimiento.slice(4)}` > ingreso;
    return menor ? "Sin documento (menor)" : "Sin documento";
  }
  return "Documento pendiente";
}
const activa = (p) => p.asignaciones?.find((a) => !a.hasta);
// Catálogo único de huésped y ocupantes (lib/tiposDocumento.js).
const TIPOS_DOCUMENTO_OCUPANTE = TIPOS_DOCUMENTO;
// Campos que se eligen del catálogo de países (con "Otro país" para valores que no figuren en él).
const CAMPOS_PAIS = ["paisDocumento", "nacionalidad", "paisResidencia"];
const ETIQUETAS_PAIS_MANUAL = {
  paisDocumento: "Nombre del país emisor",
  nacionalidad: "Nombre del país de la nacionalidad",
  paisResidencia: "Nombre del país de residencia",
};
// El formulario se agrupa en tres bloques: Identidad · Residencia y contacto · Estadía.
const CAMPOS_IDENTIDAD = [
  ["nombre", "Nombre", "text", true],
  ["apellido", "Apellido", "text", true],
  ["tipoDocumento", "Tipo de documento", "text"],
  ["numeroDocumento", "Número de documento", "text"],
  ["paisDocumento", "País emisor", "text"],
  ["motivoSinDocumento", "Justificación sin documento", "text"],
  ["fechaNacimiento", "Nacimiento", "date"],
];
const CAMPOS_RESIDENCIA = [
  ["nacionalidad", "Nacionalidad", "text"],
  ["paisResidencia", "País de residencia", "text"],
  ["localidad", "Localidad", "text"],
  ["domicilio", "Domicilio", "text"],
  ["telefono", "Teléfono", "tel"],
  ["email", "Correo electrónico", "email"],
];
const CAMPOS_FECHAS = [
  ["fechaDesde", "Ingreso previsto", "date", true],
  ["fechaHasta", "Salida prevista", "date", true],
];
const campos = [...CAMPOS_IDENTIDAD, ...CAMPOS_RESIDENCIA, ...CAMPOS_FECHAS];
const CAMPOS_DOCUMENTO = ["tipoDocumento", "paisDocumento", "numeroDocumento"];
const normalizarDocumento = (k, v) => {
  const s = String(v ?? "").trim();
  return k === "numeroDocumento" ? s.toUpperCase().replace(/\s/g, "") : s;
};
const fechaISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").slice(0, 10)) ? String(v).slice(0, 10) : null);
// Menor de edad (MAYORIA_EDAD) a la fecha de ingreso, calculado mientras se tipea el nacimiento.
const esMenorDeEdad = (nacimiento, ingreso) => {
  const edad = fechaISO(nacimiento) && fechaISO(ingreso) ? edadEnFecha(fechaISO(nacimiento), fechaISO(ingreso)) : null;
  return edad !== null && edad < MAYORIA_EDAD;
};
function Bloque({ titulo, children }) {
  return (
    <fieldset className="space-y-3 rounded border border-borde p-4">
      <legend className="px-1 font-heading text-base">{titulo}</legend>
      {children}
    </fieldset>
  );
}
function Dato({ etiqueta, children }) {
  return (
    <div>
      <dt className="text-[12px] text-tinta/70">{etiqueta}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
export function PersonaFormulario({
  persona = {},
  reserva,
  personas = [],
  onGuardar,
  onClose,
  pendiente = false,
  error = "",
  erroresServidor = {},
  esTitular = false,
}) {
  const [form, setForm] = useState(() => ({
    ...persona,
    habitacionId: activa(persona)?.habitacionId || persona.habitacionId || reserva.habitaciones[0]?.id || "",
    fechaNacimiento: persona.fechaNacimiento?.slice(0, 10) || "",
    fechaDesde: (persona.fechaDesde || reserva.fechaDesde || "").slice(0, 10),
    fechaHasta: (persona.fechaHasta || reserva.fechaHasta || "").slice(0, 10),
  }));
  const [otraLocalidad, setOtraLocalidad] = useState(() =>
    Boolean(persona.localidad && !buscarPaisOcupante(persona.paisResidencia)?.localidades.includes(persona.localidad)),
  );
  const [paisManual, setPaisManual] = useState(() => ({
    paisDocumento: Boolean(persona.paisDocumento && !buscarPaisOcupante(persona.paisDocumento)),
    paisResidencia: Boolean(persona.paisResidencia && !buscarPaisOcupante(persona.paisResidencia)),
    nacionalidad: Boolean(persona.nacionalidad && !buscarPaisOcupante(persona.nacionalidad)),
  }));
  const paisResidencia = buscarPaisOcupante(form.paisResidencia);
  // Solo algunos países tienen localidades sugeridas: en los demás la localidad se escribe.
  const localidadLibre = Boolean(paisResidencia && !paisResidencia.localidades.length);
  const [tocados, setTocados] = useState({});
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const alojado = persona.estado === "Alojado";
  const esMenor = esMenorDeEdad(form.fechaNacimiento, form.fechaDesde);
  const responsableContacto = personas.find((p) => String(p.id) === String(form.responsableId));
  useEffect(() => {
    if (form.usarContactoResponsable)
      setForm((f) => ({
        ...f,
        usarContactoResponsable: esMenor,
        email: esMenor ? responsableContacto?.email || "" : "",
        telefono: esMenor ? responsableContacto?.telefono || "" : "",
      }));
  }, [
    form.usarContactoResponsable,
    esMenor,
    responsableContacto?.id,
    responsableContacto?.email,
    responsableContacto?.telefono,
  ]);
  const errores = validarOcupante(
    form,
    reserva,
    personas,
    persona,
    paisManual,
    otraLocalidad || localidadLibre,
    esTitular || form.esTitular,
  );
  for (const [campo, dato] of Object.entries(erroresServidor)) {
    if (form[campo] === dato.valor) errores[campo] = dato.mensaje;
  }
  // Un solo titular por habitación: marcar a esta persona reemplaza al titular actual de la
  // habitación elegida. Con la estadía en curso, el motivo es obligatorio (queda en el historial).
  const otroTitular = form.esTitular
    ? personas.find(
        (p) =>
          p.id !== persona.id &&
          p.esTitular &&
          ["Previsto", "Alojado"].includes(p.estado) &&
          Number(activa(p)?.habitacionId ?? p.habitacionId) === Number(form.habitacionId),
      )
    : null;
  const reemplazaTitular = Boolean(otroTitular);
  const motivoTitularObligatorio = reemplazaTitular && reserva.estado === "En curso";
  if (motivoTitularObligatorio && !String(form.motivoCambioTitular ?? "").trim())
    errores.motivoCambioTitular = "Indicá el motivo del cambio de titular.";
  // Adulto responsable: solo para menores, y obligatorio para ellos.
  if (esMenor && !form.responsableId) errores.responsableId = "Elegí el adulto responsable del menor.";
  if (!esMenor) delete errores.responsableId;
  // Cambio de documento de una ficha verificada: pide motivo y la ficha vuelve a verificarse.
  const cambiaDocumento =
    Boolean(persona.id && persona.verificadoEn) &&
    CAMPOS_DOCUMENTO.some((k) => normalizarDocumento(k, form[k]) !== normalizarDocumento(k, persona[k]));
  if (cambiaDocumento && !String(form.motivoCambioIdentidad ?? "").trim())
    errores.motivoCambioIdentidad = "Indicá el motivo del cambio de documento.";
  const habitacionActual = activa(persona)?.habitacionId;
  const cambiaHabitacion = Boolean(
    persona.id && habitacionActual && Number(form.habitacionId) !== Number(habitacionActual),
  );
  const adultos = personas.filter(
    (p) =>
      p.id !== persona.id &&
      !["Cancelado", "Retirado"].includes(p.estado) &&
      fechaISO(p.fechaNacimiento) &&
      !esMenorDeEdad(p.fechaNacimiento, form.fechaDesde),
  );
  const aCargo = persona.id
    ? personas.filter(
        (p) => String(p.responsableId) === String(persona.id) && !["Cancelado", "Retirado"].includes(p.estado),
      )
    : [];
  const habitacionDeLaPersona = reserva.habitaciones.find((h) => Number(h.id) === Number(form.habitacionId));
  const pendientesIngreso = pendientesParaIngreso(form);
  function propsCampo(campo) {
    const visible =
      intentoGuardar ||
      tocados[campo] ||
      (["email", "numeroDocumento", "habitacionId"].includes(campo) && form[campo]) ||
      erroresServidor[campo];
    const definicion = campos.find((c) => c[0] === campo);
    let etiqueta = definicion
      ? definicion[1] + (definicion[3] ? " *" : "")
      : {
          habitacionId: "Habitación *",
          responsableId: "Adulto responsable (menores)",
          motivo: "Motivo del cambio de habitación",
          motivoCambioTitular: "Motivo del cambio de titular",
          motivoCambioIdentidad: "Motivo del cambio de documento",
        }[campo];
    if (campo === "numeroDocumento") etiqueta = ETIQUETAS_NUMERO_DOCUMENTO[form.tipoDocumento] || etiqueta;
    if (campo === "localidad" && (otraLocalidad || localidadLibre || paisManual.paisResidencia))
      etiqueta = "Nombre de la localidad";
    if (paisManual[campo]) etiqueta = ETIQUETAS_PAIS_MANUAL[campo];
    return {
      name: campo,
      error: visible ? errores[campo] : undefined,
      "aria-label": etiqueta,
      "aria-description": visible ? errores[campo] : undefined,
      "aria-invalid": Boolean(visible && errores[campo]),
    };
  }

  function cambiarPais(campo, valor) {
    setForm((f) => ({
      ...f,
      [campo]: valor,
      ...(campo === "paisResidencia" ? { localidad: "" } : {}),
    }));
    if (campo === "paisResidencia") setOtraLocalidad(false);
  }

  function renderCampo([k, label, type, required]) {
    if (CAMPOS_PAIS.includes(k)) {
      const pais = buscarPaisOcupante(form[k]);
      return (
        <div key={k} className="space-y-2">
          <Select
            label={label}
            {...(!paisManual[k] ? propsCampo(k) : {})}
            value={paisManual[k] ? "__otro__" : pais?.codigo || ""}
            onChange={(e) => {
              const manual = e.target.value === "__otro__";
              setPaisManual((p) => ({ ...p, [k]: manual }));
              cambiarPais(k, manual ? "" : e.target.value);
            }}
          >
            <option value="">Seleccionar país</option>
            {PAISES_SELECTOR.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
            <option value="__otro__">Otro país</option>
          </Select>
          {paisManual[k] && (
            <Input
              {...propsCampo(k)}
              label={ETIQUETAS_PAIS_MANUAL[k]}
              required
              pattern={".*\\S.*"}
              maxLength={191}
              value={form[k] || ""}
              placeholder="Escribí el nombre del país"
              onChange={(e) => cambiarPais(k, e.target.value)}
            />
          )}
        </div>
      );
    }
    if (k === "localidad") {
      if (paisManual.paisResidencia || localidadLibre) {
        return (
          <Input
            key={k}
            {...propsCampo(k)}
            label="Nombre de la localidad"
            required
            pattern={".*\\S.*"}
            disabled={!form.paisResidencia?.trim()}
            maxLength={191}
            value={form.localidad || ""}
            placeholder="Ingresá la localidad de residencia"
            onChange={(e) => setForm((f) => ({ ...f, localidad: e.target.value }))}
          />
        );
      }
      return (
        <div key={k} className="space-y-2">
          <Select
            label="Localidad"
            {...(!otraLocalidad ? propsCampo(k) : {})}
            disabled={!form.paisResidencia}
            value={otraLocalidad ? "__otra__" : form.localidad || ""}
            onChange={(e) => {
              setOtraLocalidad(e.target.value === "__otra__");
              setForm((f) => ({
                ...f,
                localidad: e.target.value === "__otra__" ? "" : e.target.value,
              }));
            }}
          >
            <option value="">
              {form.paisResidencia ? "Seleccionar localidad" : "Primero seleccioná el país de residencia"}
            </option>
            {(paisResidencia?.localidades || []).map((localidad) => (
              <option key={localidad} value={localidad}>
                {localidad}
              </option>
            ))}
            <option value="__otra__">Otra localidad</option>
          </Select>
          {otraLocalidad && (
            <Input
              {...propsCampo(k)}
              label="Nombre de la localidad"
              required
              maxLength={191}
              value={form.localidad || ""}
              placeholder="Ingresá la localidad de residencia"
              onChange={(e) => setForm((f) => ({ ...f, localidad: e.target.value }))}
            />
          )}
        </div>
      );
    }
    if (k === "tipoDocumento") {
      return (
        <Select
          key={k}
          {...propsCampo(k)}
          label={label}
          value={form.tipoDocumento || ""}
          onChange={(e) => setForm((f) => ({ ...f, tipoDocumento: e.target.value }))}
        >
          <option value="">Seleccionar tipo de documento</option>
          {form.tipoDocumento && !TIPOS_DOCUMENTO_OCUPANTE.includes(form.tipoDocumento) && (
            <option value={form.tipoDocumento} disabled>
              {form.tipoDocumento} (registrado anteriormente)
            </option>
          )}
          {TIPOS_DOCUMENTO_OCUPANTE.map((tipo) => (
            <option key={tipo} value={tipo}>
              {tipo}
            </option>
          ))}
        </Select>
      );
    }
    const etiqueta = k === "numeroDocumento" ? ETIQUETAS_NUMERO_DOCUMENTO[form.tipoDocumento] || label : label;
    return (
      <Input
        key={k}
        {...propsCampo(k)}
        label={etiqueta + (required ? " *" : "")}
        placeholder={k === "numeroDocumento" ? `Ingresá el ${etiqueta.replace("Número", "número")}` : undefined}
        type={type}
        disabled={Boolean(form.usarContactoResponsable) && ["email", "telefono"].includes(k)}
        required={required}
        maxLength={191}
        value={form[k] || ""}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
      />
    );
  }
  return (
    <form
      noValidate
      onBlur={(e) => {
        const campo = e.target.name;
        if (campo) setTocados((t) => ({ ...t, [campo]: true }));
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (pendiente) return;
        setIntentoGuardar(true);
        const camposInvalidos = Object.keys(errores);
        if (camposInvalidos.length) {
          e.currentTarget.elements.namedItem(camposInvalidos[0])?.focus();
          return;
        }
        const datos = {
          ...form,
          responsableId: esMenor ? form.responsableId : null,
          usarContactoResponsable: esMenor ? form.usarContactoResponsable : false,
          ...(reemplazaTitular ? { reemplazarTitular: true } : {}),
        };
        if (!cambiaDocumento) delete datos.motivoCambioIdentidad;
        // Ingreso, salida y habitación de una persona alojada no se cambian desde acá.
        if (alojado) {
          delete datos.fechaDesde;
          delete datos.fechaHasta;
          delete datos.habitacionId;
          delete datos.motivo;
        }
        onGuardar(datos);
      }}
      className="space-y-4 p-5"
    >
      <p className="text-sm text-piedra">
        Los datos identifican al ocupante. Todos los cargos se asignan a la habitación.
      </p>
      <Bloque titulo="Identidad">
        <div className="grid gap-3 sm:grid-cols-2">
          {CAMPOS_IDENTIDAD.filter(
            ([k]) => k !== "motivoSinDocumento" || !String(form.numeroDocumento ?? "").trim(),
          ).map(renderCampo)}
          {esMenor && (
            <Select
              {...propsCampo("responsableId")}
              label="Adulto responsable *"
              value={form.responsableId || ""}
              onChange={(e) => setForm({ ...form, responsableId: e.target.value })}
            >
              <option value="">Elegí el adulto responsable</option>
              {adultos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} {p.apellido}
                </option>
              ))}
            </Select>
          )}
        </div>
        {cambiaDocumento && (
          <div className="space-y-2 rounded border border-laton-300 bg-laton-100 p-3 text-sm text-laton-700">
            <p>Esta ficha ya estaba verificada. Al cambiar el documento vuelve a "Datos por verificar".</p>
            <Input
              {...propsCampo("motivoCambioIdentidad")}
              label="Motivo del cambio de documento *"
              value={form.motivoCambioIdentidad || ""}
              maxLength={500}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  motivoCambioIdentidad: e.target.value,
                }))
              }
            />
          </div>
        )}
      </Bloque>
      <Bloque titulo="Residencia y contacto">
        {esMenor && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.usarContactoResponsable)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  usarContactoResponsable: e.target.checked,
                  email: "",
                  telefono: "",
                }))
              }
            />
            Usar correo y teléfono del adulto responsable (opcional)
          </label>
        )}
        {esMenor && (
          <p className="text-xs text-piedra">
            Podés dejar el correo y teléfono vacíos. Si usás los del responsable, se copian los datos disponibles al
            guardar.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">{CAMPOS_RESIDENCIA.map(renderCampo)}</div>
      </Bloque>
      <Bloque titulo="Estadía">
        {alojado ? (
          <>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Dato etiqueta="Habitación">
                {habitacionDeLaPersona ? `Habitación ${habitacionDeLaPersona.numero}` : "—"}
              </Dato>
              <Dato etiqueta="Ingreso">{formatearFechaHora(persona.ingresoReal)}</Dato>
              <Dato etiqueta="Salida prevista">{formatearFechaDdMmAaaa(reserva.fechaHasta)}</Dato>
              <Dato etiqueta="Rol">
                {[
                  persona.esTitular ? "Titular" : null,
                  aCargo.length
                    ? `Responsable de: ${aCargo.map((p) => `${p.nombre} ${p.apellido}`.trim()).join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Acompañante"}
              </Dato>
            </dl>
            <p className="text-xs text-piedra">
              Para irse antes, usá "Registrar salida". Para quedarse más, se modifica la reserva. Para cambiar de
              habitación, usá "Mover a otra habitación".
            </p>
          </>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS_FECHAS.map(renderCampo)}
            <Select
              {...propsCampo("habitacionId")}
              label="Habitación *"
              required
              value={form.habitacionId}
              onChange={(e) => setForm({ ...form, habitacionId: e.target.value })}
            >
              {reserva.habitaciones.map((h) => (
                <option key={h.id} value={h.id}>
                  Habitación {h.numero} · capacidad {h.capacidad}
                </option>
              ))}
            </Select>
            {cambiaHabitacion && (
              <Input
                {...propsCampo("motivo")}
                label="Motivo del cambio de habitación"
                value={form.motivo || ""}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            )}
          </div>
        )}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(form.esTitular)}
            onChange={(e) => setForm((f) => ({ ...f, esTitular: e.target.checked }))}
          />
          Titular de esta habitación
        </label>
        {reemplazaTitular && (
          <div className="space-y-2 rounded border border-laton-300 bg-laton-100 p-3 text-sm text-laton-700">
            <p>
              Hoy el titular de esta habitación es {otroTitular.nombre} {otroTitular.apellido}. Al guardar deja de
              serlo: hay un solo titular por habitación.
            </p>
            <Input
              {...propsCampo("motivoCambioTitular")}
              label={`Motivo del cambio de titular${motivoTitularObligatorio ? " *" : " (opcional)"}`}
              value={form.motivoCambioTitular || ""}
              maxLength={500}
              onChange={(e) => setForm((f) => ({ ...f, motivoCambioTitular: e.target.value }))}
            />
          </div>
        )}
        {esTitular && <p className="text-sm">El titular debe tener al menos 18 años en la fecha de ingreso.</p>}
      </Bloque>
      {error && (
        <p role="alert" className="text-error-texto">
          {error}
        </p>
      )}
      {intentoGuardar && Object.keys(errores).length > 0 && (
        <p role="alert" className="text-error-texto">
          No se pudo guardar. Revisá los {Object.keys(errores).length} campos señalados.
        </p>
      )}
      {pendientesIngreso.length > 0 && (
        <p className="rounded border border-borde bg-hueso p-3 text-sm">
          Podés guardar los datos pendientes. Antes de verificar e ingresar faltará completar:{" "}
          {pendientesIngreso.join(", ")}.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variante="secundario" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" cargando={pendiente}>
          Guardar persona
        </Button>
      </div>
    </form>
  );
}

// Mover a una persona alojada a otra habitación de la MISMA reserva: con motivo, respetando la
// capacidad y un titular por habitación (si se mueve al titular, se elige quién queda en su lugar).
export function MoverHabitacion({ persona, reserva, personas = [], onClose, onMovida }) {
  const { usuario } = useSesion();
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const [nuevoTitularId, setNuevoTitularId] = useState("");
  const [intento, setIntento] = useState(false);
  const origen = activa(persona)?.habitacionId;
  const activas = personas.filter((p) => ["Previsto", "Alojado"].includes(p.estado));
  const enHabitacion = (habitacionId) => activas.filter((p) => activa(p)?.habitacionId === habitacionId);
  const quedan = enHabitacion(origen).filter((p) => p.id !== persona.id);
  const pideTitular = Boolean(persona.esTitular && quedan.length);
  const candidatos = quedan.filter(
    (p) => fechaISO(p.fechaNacimiento) && !esMenorDeEdad(p.fechaNacimiento, p.fechaDesde),
  );
  const opciones = reserva.habitaciones.filter((h) => h.id !== origen);
  const errores = {};
  if (!destino) errores.destino = "Elegí la habitación de destino.";
  if (!motivo.trim()) errores.motivo = "Indicá el motivo del cambio de habitación.";
  if (pideTitular && !nuevoTitularId)
    errores.nuevoTitularId = "Elegí quién queda como titular de la habitación que deja.";
  const mutacion = useMutation({
    mutationFn: () =>
      api.post(`/estadia/${reserva.id}/ocupantes/${persona.id}/mover`, {
        habitacionId: Number(destino),
        motivo: motivo.trim(),
        ...(pideTitular ? { nuevoTitularId: Number(nuevoTitularId) } : {}),
        operador: usuario,
      }),
    onSuccess: () => onMovida?.(),
  });
  const visible = (campo) => (intento ? errores[campo] : undefined);
  return (
    <form
      noValidate
      className="space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setIntento(true);
        if (Object.keys(errores).length || mutacion.isPending) return;
        mutacion.mutate();
      }}
    >
      <p className="text-sm">
        {persona.nombre} {persona.apellido} · hoy en la habitación{" "}
        {reserva.habitaciones.find((h) => h.id === origen)?.numero ?? "—"}. Solo se puede mover a otra habitación de
        esta reserva.
      </p>
      <Select
        label="Habitación de destino *"
        name="destino"
        error={visible("destino")}
        value={destino}
        onChange={(e) => setDestino(e.target.value)}
      >
        <option value="">Elegí la habitación</option>
        {opciones.map((h) => {
          const ocupadas = enHabitacion(h.id).length;
          return (
            <option key={h.id} value={h.id} disabled={ocupadas >= h.capacidad}>
              Habitación {h.numero} · {ocupadas} de {h.capacidad}
              {ocupadas >= h.capacidad ? " · completa" : ""}
            </option>
          );
        })}
      </Select>
      {pideTitular && (
        <Select
          label="Nuevo titular de la habitación que deja *"
          name="nuevoTitularId"
          error={visible("nuevoTitularId")}
          value={nuevoTitularId}
          onChange={(e) => setNuevoTitularId(e.target.value)}
        >
          <option value="">Elegí quién queda como titular</option>
          {candidatos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} {p.apellido}
            </option>
          ))}
        </Select>
      )}
      <Input
        label="Motivo *"
        name="motivo"
        error={visible("motivo")}
        value={motivo}
        maxLength={500}
        onChange={(e) => setMotivo(e.target.value)}
      />
      {mutacion.isError && (
        <p role="alert" className="text-error-texto">
          {mutacion.error?.response?.data?.error || "No se pudo mover a la persona."}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variante="secundario" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" cargando={mutacion.isPending}>
          Mover
        </Button>
      </div>
    </form>
  );
}

export function EstadiaPanel({ reserva, soloPersonas = false, onTitularPreparado }) {
  const [erroresServidor, setErroresServidor] = useState({});
  const { usuario, puede } = useSesion();
  const qc = useQueryClient();
  const [tab, setTab] = useState("Personas");
  const [editor, setEditor] = useState(null);
  const [cargoHabitacion, setCargoHabitacion] = useState(null);
  const [anular, setAnular] = useState(null);
  const [moviendo, setMoviendo] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const puedeEditar =
    (puede("gestionarReservas") || puede("gestionarCheckIn")) && ["Confirmada", "En curso"].includes(reserva.estado);
  const puedeCargos = puede("registrarConsumoServicio") && reserva.estado === "En curso";
  const puedeCuenta = puede("verPagosEstadia");
  const intentoTitular = useRef(null);
  const necesitaTitular = puedeEditar && Boolean(reserva.huesped);
  const personas = useQuery({
    queryKey: ["ocupantes", reserva.id],
    queryFn: () => api.get(`/estadia/${reserva.id}/ocupantes`).then((r) => r.data),
    retry: reintentarLectura,
  });
  const titular = useMutation({
    mutationFn: () => api.post(`/estadia/${reserva.id}/titular`, { operador: usuario }).then((r) => r.data),
    retry: reintentarTitular,
    retryDelay: demoraReintentoTitular,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ocupantes", reserva.id] });
      qc.invalidateQueries({ queryKey: ["estadia-historial", reserva.id] });
      onTitularPreparado?.(reserva.id);
    },
  });
  const titularExistente = titularRegistrado(personas.data || [], reserva.huesped, titular.data?.ocupanteId);
  const titularDeLaReservaActivo =
    titularExistente && titularExistente.estado !== "Cancelado" ? titularExistente : null;
  useEffect(() => {
    if (
      necesitaTitular &&
      personas.isSuccess &&
      !personas.isFetching &&
      !titularExistente &&
      intentoTitular.current !== reserva.id
    ) {
      intentoTitular.current = reserva.id;
      titular.mutate();
    }
  }, [necesitaTitular, reserva.id, titular.mutate, personas.isSuccess, personas.isFetching, titularExistente]);
  useEffect(() => {
    if (necesitaTitular && personas.isSuccess && titularExistente) onTitularPreparado?.(reserva.id);
  }, [necesitaTitular, personas.isSuccess, titularExistente?.id, reserva.id, onTitularPreparado]);
  const preparandoTitular = necesitaTitular && !titularExistente && !titular.isSuccess;
  const cuenta = useQuery({
    queryKey: ["check-out", "cuenta", String(reserva.id)],
    queryFn: () => obtenerCuenta(reserva.id),
    enabled: !soloPersonas && puedeCuenta && tab === "Cuenta",
    retry: reintentarLectura,
  });
  const cargos = useQuery({
    queryKey: ["consumos-servicios", "detalle", reserva.id],
    queryFn: () => api.get("/consumos-servicios", { params: { reservaId: reserva.id } }).then((r) => r.data),
    enabled: !soloPersonas && puede("verConsumosServicio") && tab === "Cargos por habitación",
    retry: reintentarLectura,
  });
  const historial = useQuery({
    queryKey: ["estadia-historial", reserva.id],
    queryFn: () => api.get(`/estadia/${reserva.id}/historial`).then((r) => r.data),
    enabled: tab === "Historial",
    retry: reintentarLectura,
  });
  const refrescar = () => {
    for (const k of [
      "ocupantes",
      "estadia-historial",
      "check-out",
      "consumos-servicios",
      "pagos-estadia",
      "reservas",
      "alojados",
    ])
      qc.invalidateQueries({ queryKey: [k] });
  };
  const mutation = useMutation({
    mutationFn: async ({ tipo, data }) => {
      setError("");
      setErroresServidor({});
      if (tipo === "guardar")
        return editor.id
          ? api.put(`/estadia/${reserva.id}/ocupantes/${editor.id}`, {
              ...data,
              operador: usuario,
            })
          : api.post(`/estadia/${reserva.id}/ocupantes`, {
              ...data,
              operador: usuario,
            });
      if (tipo === "anular")
        return api.post(`/consumos-servicios/${anular.id}/anular`, {
          motivo,
          operador: usuario,
        });
      return api.post(`/estadia/${reserva.id}/ocupantes/${data.id}/accion`, {
        accion: tipo,
        operador: usuario,
      });
    },
    onSuccess: () => {
      setEditor(null);
      setAnular(null);
      setMotivo("");
      refrescar();
    },
    onError: (e, variables) => {
      setError(e.response?.data?.error || "No se pudo guardar el cambio.");
      setErroresServidor(
        Object.fromEntries(
          Object.entries(e.response?.data?.campos || {}).map(([k, mensaje]) => [
            k,
            { mensaje, valor: variables?.data?.[k] },
          ]),
        ),
      );
    },
  });
  // Las fichas canceladas (por ejemplo, reemplazadas en el check-in) no se listan ni generan
  // faltantes: quedan en el Historial con su motivo.
  const todas = personas.data || [];
  const listado = todas.filter((p) => p.estado !== "Cancelado");
  const errorCargaPersonas =
    preparandoTitular && titular.isError ? titular.error : personas.isError ? personas.error : null;
  const cargandoPersonas = personas.isFetching || (preparandoTitular && titular.isPending);
  function recuperarPersonas() {
    if (cargandoPersonas) return;
    // Si el POST perdió la respuesta, se recupera el mismo titular; nunca
    // se envía el formulario de alta de otro ocupante durante este reintento.
    if (personas.isError || !personas.isSuccess) personas.refetch();
    else if (preparandoTitular) titular.mutate();
    else personas.refetch();
  }
  return (
    <section className="rounded-lg border border-borde bg-white p-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        {(soloPersonas
          ? ["Personas"]
          : [
              "Personas",
              ...(puede("verConsumosServicio") ? ["Cargos por habitación"] : []),
              ...(puedeCuenta ? ["Cuenta"] : []),
              "Historial",
            ]
        ).map((t) => (
          <Button key={t} variante={tab === t ? "ok" : "secundario"} onClick={() => setTab(t)}>
            {t}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-error-texto">
          {error}
        </p>
      )}
      {tab === "Personas" && (
        <>
          {preparandoTitular && titular.isPending && (
            <p role="status">
              {titular.failureCount > 0
                ? "Se interrumpió la conexión. Reintentando la carga del titular…"
                : "Incorporando los datos del titular…"}
            </p>
          )}
          {errorCargaPersonas && (
            <div role="alert" className="rounded border border-error p-3 text-error-texto">
              <p>
                {errorCargaPersonas.response?.data?.error ||
                  "Se interrumpió la carga de personas. " +
                    "Cuando el servidor esté disponible, volvé a cargar para continuar."}
              </p>
              <p className="mt-1 text-sm">
                Agregar persona se habilita al recuperar al titular y el listado de ocupantes. No vuelvas a crear la
                reserva.
              </p>
              <Button variante="secundario" className="mt-2" cargando={cargandoPersonas} onClick={recuperarPersonas}>
                Volver a cargar personas
              </Button>
            </div>
          )}
          {titular.data?.aviso && (
            <p role="alert" className="text-error-texto">
              {titular.data.aviso}
            </p>
          )}
          <div className="flex justify-between gap-3">
            <div>
              <h2 className="font-heading text-xl">Personas de la estadía</h2>
              <p className="text-sm text-piedra">
                El titular se incorpora con los datos de la reserva. Completá los pendientes y verificá a cada persona
                antes del ingreso.
              </p>
            </div>
            {puedeEditar && (
              <Button
                disabled={!personas.isSuccess || cargandoPersonas || preparandoTitular}
                onClick={() => {
                  setEditor({});
                  setError("");
                  setErroresServidor({});
                }}
              >
                Agregar persona
              </Button>
            )}
          </div>
          {personas.isLoading && <p>Cargando personas…</p>}
          {!listado.length && personas.isSuccess && !cargandoPersonas && !preparandoTitular && (
            <p className="text-piedra">
              Todavía no se registraron ocupantes. El titular aparecerá al terminar su incorporación.
            </p>
          )}
          {reserva.habitaciones.map((h) => (
            <div key={h.id} className="rounded border border-borde p-3">
              <h3 className="font-semibold">
                Habitación {h.numero} · capacidad {h.capacidad}
              </h3>
              {listado
                .filter((p) => (activa(p) || p.asignaciones?.at(-1))?.habitacionId === h.id)
                .map((p) => (
                  <div key={p.id} className="border-t border-borde py-3 flex flex-wrap justify-between gap-2">
                    <div>
                      <strong>
                        {p.nombre} {p.apellido}
                      </strong>
                      {p.esTitular && <span className="ml-2 text-xs text-pino">Titular de habitación</span>}
                      {titularDeLaReservaActivo?.id === p.id && (
                        <span className="ml-2 text-xs text-pino">Titular de la reserva</span>
                      )}
                      {pendientesParaIngreso(p).length > 0 && (
                        <p className="text-sm text-error-texto">
                          Falta completar: {pendientesParaIngreso(p).join(", ")}.
                        </p>
                      )}
                      <p className="text-sm">
                        {documentoDe(p, reserva)} · {p.estado} · {p.verificadoEn ? "Verificado" : "Datos por verificar"}
                      </p>
                      <p className="text-xs text-piedra">
                        Ingreso: {fecha(p.ingresoReal)} · Salida: {fecha(p.salidaReal)}
                      </p>
                    </div>
                    {puedeEditar && (
                      <div className="flex flex-wrap gap-2">
                        {["Previsto", "Alojado"].includes(p.estado) && (
                          <>
                            <Button
                              variante="secundario"
                              onClick={() => {
                                setError("");
                                setErroresServidor({});
                                setEditor(p);
                              }}
                            >
                              {pendientesParaIngreso(p).length ? "Completar datos" : "Editar"}
                            </Button>
                            <Button
                              variante="secundario"
                              disabled={mutation.isPending || pendientesParaIngreso(p).length > 0}
                              onClick={() => mutation.mutate({ tipo: "verificar", data: p })}
                            >
                              Verificar datos
                            </Button>
                          </>
                        )}
                        {p.estado === "Previsto" && (
                          <>
                            <Button
                              disabled={!p.verificadoEn || reserva.estado !== "En curso" || mutation.isPending}
                              onClick={() => mutation.mutate({ tipo: "ingresar", data: p })}
                            >
                              Registrar ingreso
                            </Button>
                            <Button
                              variante="secundario"
                              disabled={mutation.isPending}
                              onClick={() => mutation.mutate({ tipo: "cancelar", data: p })}
                            >
                              Cancelar ingreso
                            </Button>
                          </>
                        )}
                        {p.estado === "Alojado" && reserva.estado === "En curso" && reserva.habitaciones.length > 1 && (
                          <Button
                            variante="secundario"
                            disabled={mutation.isPending}
                            onClick={() => {
                              setError("");
                              setMoviendo(p);
                            }}
                          >
                            Mover a otra habitación
                          </Button>
                        )}
                        {p.estado === "Alojado" && (
                          <Button
                            variante="secundario"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate({ tipo: "retirar", data: p })}
                          >
                            Registrar salida
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </>
      )}
      {tab === "Cargos por habitación" && (
        <>
          {cargos.isError && <ErrorConsulta consulta={cargos} mensaje="No se pudieron cargar los cargos." />}
          {reserva.habitaciones.map((h) => (
            <div key={h.id} className="border border-borde rounded p-4 space-y-3">
              <div className="flex justify-between">
                <h3 className="font-semibold">Habitación {h.numero}</h3>
                {puedeCargos && <Button onClick={() => setCargoHabitacion(h.id)}>Agregar cargo</Button>}
              </div>
              {(cargos.data || [])
                .filter((c) => c.habitacionId === h.id)
                .map((c) => (
                  <div key={c.id} className="flex justify-between gap-3 border-t border-borde py-2">
                    <div>
                      <p className={c.anulado ? "line-through text-piedra" : ""}>
                        {c.descripcion || c.tipoServicio} · {c.cantidad || 1} × {moneda(c.precioUnitario ?? c.monto)} ·{" "}
                        <strong>{moneda(c.monto)}</strong>
                        {c.incluido ? " · Incluido en tarifa" : ""}
                      </p>
                      <p className="text-xs text-piedra">
                        {fecha(c.fechaServicio || c.fechaHora)} · Registró: {c.registradoPor}
                        {c.anulado ? ` · Anulado: ${c.motivoAnulacion}` : ""}
                      </p>
                    </div>
                    {puedeCargos && !c.anulado && (
                      <Button
                        variante="secundario"
                        onClick={() => {
                          setAnular(c);
                          setError("");
                        }}
                      >
                        Anular
                      </Button>
                    )}
                  </div>
                ))}
              <p className="text-right font-semibold">
                Adicionales:{" "}
                {moneda(
                  (cargos.data || [])
                    .filter((c) => c.habitacionId === h.id && !c.anulado)
                    .reduce((s, c) => s + c.monto, 0),
                )}
              </p>
            </div>
          ))}
        </>
      )}
      {tab === "Cuenta" && (
        <>
          {cuenta.isError && <ErrorConsulta consulta={cuenta} mensaje="No se pudo cargar la cuenta." />}
          {cuenta.data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {["Habitación", "Alojamiento", "Adicionales", "Revisión", "Total"].map((t) => (
                        <th key={t} className="text-left p-2">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cuenta.data.habitaciones.map((h) => (
                      <tr key={h.habitacionId}>
                        {[
                          h.numero,
                          moneda(h.subtotal),
                          moneda(h.adicionales),
                          moneda(h.verificacion),
                          moneda(h.total),
                        ].map((v, i) => (
                          <td key={i} className="p-2 border-t border-borde">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Total reserva: <strong>{moneda(cuenta.data.totalAdeudado)}</strong> · Pagado:{" "}
                {moneda(cuenta.data.totalPagado)} · Saldo: <strong>{moneda(cuenta.data.saldo)}</strong>
              </p>
              <p className="text-xs text-piedra">
                Los pagos pertenecen a la reserva. Los cargos históricos sin habitación identificada se incluyen en el
                total general.
              </p>
            </>
          )}
        </>
      )}
      {tab === "Historial" && (
        <>
          {historial.isError && <ErrorConsulta consulta={historial} mensaje="No se pudo cargar el historial." />}
          {(historial.data || []).map((e) => (
            <p key={e.id} className="border-b border-borde py-2 text-sm">
              {fecha(e.fecha)} · {ACCIONES_HISTORIAL[e.accion] ?? e.accion} · {e.operador}
              <span className="block text-xs text-piedra">{detalleEvento(e, todas, reserva.habitaciones)}</span>
            </p>
          ))}
        </>
      )}
      {editor && (
        <Modal
          titulo={editor.id ? "Editar ocupante" : "Agregar ocupante"}
          onClose={() => setEditor(null)}
          ancho="max-w-3xl"
        >
          <PersonaFormulario
            esTitular={editor.id != null && editor.id === titularExistente?.id}
            persona={editor}
            reserva={reserva}
            personas={listado}
            erroresServidor={erroresServidor}
            error={error}
            pendiente={mutation.isPending}
            onClose={() => setEditor(null)}
            onGuardar={(data) => mutation.mutate({ tipo: "guardar", data })}
          />
        </Modal>
      )}
      {moviendo && (
        <Modal titulo="Mover a otra habitación" onClose={() => setMoviendo(null)}>
          <MoverHabitacion
            persona={moviendo}
            reserva={reserva}
            personas={listado}
            onClose={() => setMoviendo(null)}
            onMovida={() => {
              setMoviendo(null);
              refrescar();
            }}
          />
        </Modal>
      )}
      {cargoHabitacion && (
        <ConsumoModal
          reserva={reserva}
          habitacionIdInicial={cargoHabitacion}
          onClose={() => setCargoHabitacion(null)}
          onExito={() => {
            setCargoHabitacion(null);
            refrescar();
          }}
        />
      )}
      {anular && (
        <Modal titulo="Anular cargo" onClose={() => setAnular(null)}>
          <div className="p-5 space-y-3">
            <p>
              Se anula el cargo de {moneda(anular.monto)}. El producto consumido no vuelve automáticamente al stock.
            </p>
            <Input label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
            {error && <p role="alert">{error}</p>}
            <Button
              disabled={!motivo.trim()}
              cargando={mutation.isPending}
              onClick={() => mutation.mutate({ tipo: "anular" })}
            >
              Confirmar anulación
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
