import { useEffect, useState } from "react";
import { Button } from "../../componentes/Button";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { PAISES_SELECTOR, buscarPaisOcupante } from "./ocupantesUbicacion";
import { TIPOS_DOCUMENTO, ETIQUETAS_NUMERO_DOCUMENTO } from "../../lib/tiposDocumento";
import { validarOcupante, pendientesParaIngreso } from "./validarOcupante";
import { formatearFechaDdMmAaaa, formatearFechaHora } from "../../lib/fechas";
import { formatearNombrePropio } from "../../lib/nombres";
import { VINCULOS_RESPONSABLE, requiereAutorizacion } from "../../lib/vinculos";
import { activa, esMenorDeEdad, fechaISO, ingresoPorDefecto } from "./estadiaUtils";

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
  ["domicilio", "Domicilio (opcional)", "text"],
  ["telefono", "Teléfono (opcional)", "tel"],
  ["email", "Correo electrónico (opcional)", "email"],
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
function Bloque({ titulo, obligatorio = false, children }) {
  return (
    <fieldset className="space-y-3 rounded border border-borde p-4">
      <legend className="px-1 font-heading text-base">{titulo}</legend>
      {obligatorio && <p className="text-xs text-piedra">* obligatorio</p>}
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
    fechaDesde: (persona.fechaDesde || ingresoPorDefecto(reserva) || "").slice(0, 10),
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
  // Adulto responsable: solo para menores, y obligatorio para ellos, con su vínculo y, si es otro
  // familiar u otro adulto a cargo, la autorización de los padres o tutores.
  if (esMenor && !form.responsableId) errores.responsableId = "Elegí el adulto responsable del menor.";
  if (esMenor && !form.vinculoResponsable) errores.vinculoResponsable = "Indicá el vínculo con el menor.";
  if (esMenor && requiereAutorizacion(form.vinculoResponsable) && !form.autorizacionPresentada)
    errores.autorizacionPresentada = "Marcá la autorización presentada por los padres o tutores.";
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
          vinculoResponsable: "Vínculo con el menor *",
          autorizacionPresentada: "Autorización presentada *",
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
        onBlur={
          k === "nombre" || k === "apellido"
            ? (e) => setForm((f) => ({ ...f, [k]: formatearNombrePropio(e.target.value) }))
            : undefined
        }
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
          vinculoResponsable: esMenor ? form.vinculoResponsable || null : null,
          autorizacionPresentada: esMenor && requiereAutorizacion(form.vinculoResponsable) ? form.autorizacionPresentada === true : false,
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
      <Bloque titulo="Identidad" obligatorio>
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
          {esMenor && (
            <Select
              {...propsCampo("vinculoResponsable")}
              label="Vínculo con el menor *"
              value={form.vinculoResponsable || ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  vinculoResponsable: e.target.value,
                  autorizacionPresentada: requiereAutorizacion(e.target.value) ? f.autorizacionPresentada : false,
                }))
              }
            >
              <option value="">Elegí el vínculo</option>
              {VINCULOS_RESPONSABLE.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </div>
        {esMenor && requiereAutorizacion(form.vinculoResponsable) && (
          <div className="space-y-2 rounded border border-laton-300 bg-laton-100 p-3 text-sm text-laton-700">
            <p>Pedí la autorización de los padres o tutores.</p>
            <label className="flex items-center gap-2 font-semibold">
              <input
                type="checkbox"
                name="autorizacionPresentada"
                checked={Boolean(form.autorizacionPresentada)}
                onChange={(e) => setForm((f) => ({ ...f, autorizacionPresentada: e.target.checked }))}
              />
              Autorización presentada *
            </label>
            {(intentoGuardar || tocados.autorizacionPresentada) && errores.autorizacionPresentada && (
              <p className="text-error-texto">{errores.autorizacionPresentada}</p>
            )}
          </div>
        )}
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
      <Bloque titulo="Estadía" obligatorio={!alojado}>
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
        {/* El titular tiene que ser mayor de edad: a un menor no se le ofrece. */}
        {(!esMenor || form.esTitular) && (
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.esTitular)}
              onChange={(e) => setForm((f) => ({ ...f, esTitular: e.target.checked }))}
            />
            Titular de esta habitación
          </label>
        )}
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
