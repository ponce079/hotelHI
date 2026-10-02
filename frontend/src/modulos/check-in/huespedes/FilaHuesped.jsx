import { CheckCircle2 } from "lucide-react";
import { Input } from "../../../componentes/Input";
import { Select } from "../../../componentes/Select";
import { TIPOS_DOCUMENTO } from "../../../lib/tiposDocumento";
import { formatearFechaDdMmAaaa, mascaraFecha } from "../../../lib/fechas";
import { PAISES_SELECTOR } from "../../estadia/ocupantesUbicacion";
import { Chip } from "../ui";
import { MAYORIA_EDAD } from "../checkInPantalla.constantes";
import { usePersonaQueVuelve } from "../usePersonaQueVuelve";
import {
  avisosDeFila,
  edadDeFila,
  etiquetaFila,
  idCampo,
  necesitaResponsable,
  nombreDeFila,
  resolverCampos,
  responsablesPosibles,
  revisarFila,
  textoHerencia,
  titularDeHabitacion,
  titularDeLaReserva,
} from "../checkInReglas";

function SelectorPais({ id, label, valor, onCambiar }) {
  return (
    <Select id={id} label={label} value={valor || ""} onChange={(e) => onCambiar(e.target.value)}>
      <option value="">Elegí…</option>
      {PAISES_SELECTOR.map((p) => (
        <option key={p.codigo} value={p.codigo}>
          {p.nombre}
        </option>
      ))}
    </Select>
  );
}

const GRILLA_DOCUMENTO = "grid gap-x-3 gap-y-2.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] 2xl:[grid-template-columns:120px_minmax(140px,1.1fr)_minmax(140px,1fr)_minmax(140px,1.2fr)_minmax(140px,1.2fr)_minmax(130px,.9fr)_minmax(140px,1fr)]";
const GRILLA = "grid gap-x-3 gap-y-2.5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]";

export function FilaHuesped({ estado, contexto, fila, dispatch, puedeQuitar }) {
  // Persona que vuelve: en filas cargadas a mano; en las precargadas, solo si se cambia el documento.
  usePersonaQueVuelve(fila, dispatch, (fila.tipo === "adulto" || fila.conDocumento) && (!fila.precargada || Boolean(fila.documentoEditado)));
  const revision = revisarFila(estado, fila, contexto);
  const { heredados } = resolverCampos(estado, fila);
  const avisos = avisosDeFila(fila);
  const edad = edadDeFila(fila, contexto);
  const etiqueta = etiquetaFila(estado, fila);
  const esTitularReserva = titularDeLaReserva(estado, contexto).fila?.id === fila.id;
  const titularHabitacion = titularDeHabitacion(estado, fila.habitacionClave);
  const cambiar = (campo) => (valor) => dispatch({ tipo: "campo", filaId: fila.id, campo, valor });
  const campo = (nombre, label, extra = {}) => (
    <Input
      id={idCampo(fila.id, nombre)}
      label={label}
      value={fila.campos[nombre] ?? ""}
      onChange={(e) => cambiar(nombre)(nombre === "fechaNacimiento" ? mascaraFecha(e.target.value) : e.target.value)}
      autoComplete="off"
      {...extra}
    />
  );
  const documento = (
    <>
      <Select id={idCampo(fila.id, "tipoDocumento")} label="Tipo de documento" value={fila.campos.tipoDocumento} onChange={(e) => cambiar("tipoDocumento")(e.target.value)}>
        {TIPOS_DOCUMENTO.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <SelectorPais id={idCampo(fila.id, "paisDocumento")} label="País emisor" valor={fila.campos.paisDocumento} onCambiar={cambiar("paisDocumento")} />
      {campo("numeroDocumento", "Número de documento")}
    </>
  );
  const herencia = textoHerencia(heredados);
  const opcionesResponsable = responsablesPosibles(estado, contexto, fila).filter((r) => r.id !== titularHabitacion?.id);
  const selectorResponsable = necesitaResponsable(fila, contexto) && (
    <Select
      id={idCampo(fila.id, "responsableId")}
      label="Adulto responsable"
      value={fila.responsableId ?? ""}
      onChange={(e) => dispatch({ tipo: "responsable", filaId: fila.id, responsableId: e.target.value ? Number(e.target.value) : null })}
    >
      <option value="">
        Titular de la habitación{titularHabitacion && nombreDeFila(titularHabitacion) ? ` (${nombreDeFila(titularHabitacion)})` : ""}
      </option>
      {opcionesResponsable.map((r) => (
        <option key={r.id} value={r.id}>
          {r.texto}
        </option>
      ))}
    </Select>
  );

  return (
    <div
      id={`ci-fila-${fila.id}`}
      className={`rounded-[12px] border px-3.5 py-3 ${revision.completa ? "border-borde bg-white" : "border-borde bg-neutro-100"}`}
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <strong className="font-heading text-[16.5px] font-semibold">{etiqueta}</strong>
        {fila.esTitular && <Chip variante="ok">{esTitularReserva ? "Titular de la reserva" : "Titular de la habitación"}</Chip>}
        {fila.precargada && <Chip>Datos tomados de la reserva</Chip>}
        <span className="flex gap-1">
          {fila.tipo === "adulto" && !fila.esTitular && (edad === null || edad >= MAYORIA_EDAD) && (
            <button type="button" onClick={() => dispatch({ tipo: "marcarTitular", filaId: fila.id })} className="cursor-pointer rounded px-2 py-1 text-[13px] font-semibold text-pino-700 hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino">
              Marcar como titular
            </button>
          )}
          {puedeQuitar && (
            <button
              type="button"
              onClick={() => dispatch({ tipo: "abrirAccion", accion: { tipo: "quitar", habitacionClave: fila.habitacionClave, filaId: fila.id } })}
              className="cursor-pointer rounded px-2 py-1 text-[13px] font-semibold text-piedra hover:bg-hueso hover:text-tinta focus-visible:outline-2 focus-visible:outline-pino"
            >
              Quitar
            </button>
          )}
        </span>
        <span className={`ml-auto inline-flex items-center gap-1.5 text-[13px] ${revision.completa ? "text-pino-700" : "text-piedra"}`} data-testid={`estado-fila-${fila.id}`}>
          {revision.completa ? <CheckCircle2 size={16} aria-hidden="true" /> : <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border-2 border-borde" />}
          {revision.estado}
        </span>
      </div>

      {fila.ficha && (
        <p role="status" className="mb-2.5 rounded-md bg-pino-100 px-2.5 py-1.5 text-[13.5px] text-pino-700">
          ✓ Ficha encontrada: <b>{fila.ficha.nombre}</b> — datos completados
          {fila.ficha.ultimaEstadia ? ` · última estadía ${formatearFechaDdMmAaaa(fila.ficha.ultimaEstadia)}` : ""}
        </p>
      )}

      {fila.tipo === "adulto" ? (
        <>
          <div className={GRILLA_DOCUMENTO}>
            {documento}
            {campo("nombre", "Nombre")}
            {campo("apellido", "Apellido")}
            {campo("fechaNacimiento", "Nacimiento", { placeholder: "dd/mm/aaaa", inputMode: "numeric" })}
            <SelectorPais id={idCampo(fila.id, "nacionalidad")} label="Nacionalidad" valor={fila.campos.nacionalidad} onCambiar={cambiar("nacionalidad")} />
          </div>
          {selectorResponsable && <div className={`${GRILLA} mt-2.5`}>{selectorResponsable}</div>}
          {fila.esTitular && (
            <>
              <p className="mb-1.5 mt-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-piedra">
                {esTitularReserva ? "Residencia y contacto del titular de la reserva" : "Residencia del titular de la habitación"}
              </p>
              <div className={GRILLA}>
                <SelectorPais id={idCampo(fila.id, "paisResidencia")} label="País de residencia" valor={fila.campos.paisResidencia} onCambiar={cambiar("paisResidencia")} />
                {campo("localidad", "Localidad")}
                {campo("domicilio", "Domicilio")}
                {campo("telefono", esTitularReserva ? "Teléfono" : "Teléfono (opcional)", { inputMode: "tel" })}
                {campo("email", "Correo (opcional)", { inputMode: "email" })}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className={GRILLA}>
            {campo("nombre", "Nombre")}
            {campo("apellido", "Apellido")}
            {campo("fechaNacimiento", "Nacimiento", { placeholder: "dd/mm/aaaa", inputMode: "numeric" })}
            {selectorResponsable}
          </div>
          {fila.conDocumento ? (
            <div className={`${GRILLA} mt-2.5`}>{documento}</div>
          ) : (
            <button
              type="button"
              onClick={() => dispatch({ tipo: "conDocumento", filaId: fila.id })}
              className="mt-1.5 cursor-pointer rounded px-2 py-1 text-[13px] font-semibold text-pino-700 hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino"
            >
              Agregar documento (recomendado)
            </button>
          )}
        </>
      )}

      {!fila.esTitular && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-piedra">
          {herencia && <span>{herencia}</span>}
          <button
            type="button"
            aria-expanded={fila.masDatos}
            onClick={() => dispatch({ tipo: "masDatos", filaId: fila.id })}
            className="cursor-pointer rounded px-2 py-1 font-semibold text-pino-700 hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino"
          >
            {fila.masDatos ? "Menos datos" : "Más datos"}
          </button>
        </div>
      )}
      {fila.masDatos && !fila.esTitular && (
        <div className={`${GRILLA} mt-2`}>
          {fila.tipo === "menor" && (
            <SelectorPais id={idCampo(fila.id, "nacionalidad")} label="Nacionalidad" valor={resolverCampos(estado, fila).campos.nacionalidad} onCambiar={cambiar("nacionalidad")} />
          )}
          <SelectorPais id={idCampo(fila.id, "paisResidencia")} label="País de residencia" valor={resolverCampos(estado, fila).campos.paisResidencia} onCambiar={cambiar("paisResidencia")} />
          {fila.tipo === "adulto" && (
            <>
              {campo("telefono", "Teléfono (opcional)", { inputMode: "tel" })}
              {campo("email", "Correo (opcional)", { inputMode: "email" })}
            </>
          )}
        </div>
      )}

      {[revision.edad, ...avisos].filter(Boolean).map((aviso) => (
        <p key={aviso} className="mt-2.5 rounded-md bg-laton-100 px-2.5 py-1.5 text-[13.5px] text-laton-700">
          {aviso}
        </p>
      ))}
      {fila.errorServidor && (
        <p role="alert" className="mt-2.5 rounded-md bg-error-suave px-2.5 py-1.5 text-[13.5px] text-error-texto">
          {fila.errorServidor}
        </p>
      )}
    </div>
  );
}
