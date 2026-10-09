import { CheckCircle2 } from "lucide-react";
import { Input } from "../../../componentes/Input";
import { Select } from "../../../componentes/Select";
import { TIPOS_DOCUMENTO } from "../../../lib/tiposDocumento";
import { formatearFechaDdMmAaaa, mascaraFecha } from "../../../lib/fechas";
import { PAISES_SELECTOR } from "../../estadia/ocupantesUbicacion";
import { Chip } from "../ui";
import { MAYORIA_EDAD } from "../checkInPantalla.constantes";
import { useEffect } from "react";
import { Button } from "../../../componentes/Button";
import { useIdentificarPersona } from "../../../lib/identificacion/useIdentificarPersona";
import { EstadoIdentificacion } from "../../../lib/identificacion/EstadoIdentificacion";
import { ActualizarFicha } from "../../../lib/identificacion/ActualizarFicha";
import { camposCambiados } from "../../../lib/identificacion/ficha";
import { formatearNombrePropio } from "../../../lib/nombres";
import { VINCULOS_RESPONSABLE, requiereAutorizacion } from "../../../lib/vinculos";
import { CONTENEDOR_FICHA, FILA_FICHA, Rotulo } from "../../../componentes/FilaFicha";
import {
  AVISO_NOMBRE_COMPLETO,
  AVISO_NOMBRE_FICHA,
  avisosDeFila,
  fichaSinNombreSeparado,
  nombreEditable,
  camposObligatorios,
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

// Filas compartidas con la ficha de ocupante y el alta de reserva (componentes/FilaFicha.jsx).
const { documento: FILA_DOCUMENTO, identidad: FILA_IDENTIDAD, residencia: FILA_RESIDENCIA, contacto: FILA_CONTACTO, menor: FILA_MENOR, responsable: FILA_RESPONSABLE } = FILA_FICHA;

export function FilaHuesped({ estado, contexto, fila, dispatch, puedeQuitar }) {
  // Persona que vuelve: en filas cargadas a mano; en las precargadas, solo si se cambia el documento.
  // Identificación por documento (hook único): tipo + país emisor + número, a los 400 ms o con el botón "Buscar". En las
  // filas precargadas de la reserva, solo si se cambia el documento.
  const identificacion = useIdentificarPersona({
    tipoDocumento: fila.campos.tipoDocumento,
    paisDocumento: fila.campos.paisDocumento,
    numeroDocumento: fila.campos.numeroDocumento,
    habilitada: fila.tipo === "adulto" || fila.conDocumento,
  });
  useEffect(() => {
    if (identificacion.estado === "registrada" && fila.ficha?.clave !== identificacion.clave) {
      // Fila precargada de la reserva (documento sin tocar): solo se guarda la ficha como referencia para comparar lo que cambie
      // la recepción (por ejemplo el teléfono del titular) y ofrecer la casilla; no se pisa lo que ya está cargado.
      const soloReferencia = fila.precargada && !fila.documentoEditado;
      dispatch({ tipo: soloReferencia ? "fijarFicha" : "completarDesdeFicha", filaId: fila.id, ficha: identificacion.ficha, clave: identificacion.clave });
    }
  }, [identificacion.estado, identificacion.clave, identificacion.ficha, fila.ficha?.clave, fila.id, dispatch]);
  const cambiados = fila.ficha?.original ? camposCambiados(fila.campos, fila.ficha.original) : [];
  const revision = revisarFila(estado, fila, contexto);
  const { heredados } = resolverCampos(estado, fila);
  // El aviso de separar nombre y apellido va debajo de esos campos; los demás, al final de la fila.
  const todosLosAvisos = avisosDeFila(fila);
  const esAvisoNombre = (a) => a === AVISO_NOMBRE_COMPLETO || a === AVISO_NOMBRE_FICHA;
  const avisoNombre = todosLosAvisos.find(esAvisoNombre);
  const avisos = todosLosAvisos.filter((a) => !esAvisoNombre(a));
  // Nombres y Apellido son de la ficha (bloqueados), salvo en una ficha vieja sin el nombre separado.
  const nombreBloqueado = !nombreEditable(fila);
  const edad = edadDeFila(fila, contexto);
  const etiqueta = etiquetaFila(estado, fila);
  const esTitularReserva = titularDeLaReserva(estado, contexto).fila?.id === fila.id;
  const titularHabitacion = titularDeHabitacion(estado, fila.habitacionClave);
  const cambiar = (campo) => (valor) => dispatch({ tipo: "campo", filaId: fila.id, campo, valor });
  // Asterisco en cada obligatorio, con las mismas reglas que bloquean la confirmación.
  const obligatorios = camposObligatorios(estado, fila, contexto);
  const rotulo = (nombre, texto, { opcional = false } = {}) => (
    <Rotulo texto={texto} obligatorio={obligatorios.has(nombre)} opcional={opcional && !obligatorios.has(nombre)} />
  );
  // Nombre y apellido con mayúscula inicial al salir del campo (partículas en minúscula).
  const esNombre = (nombre) => nombre === "nombre" || nombre === "apellido";
  const campo = (nombre, label, extra = {}) => (
    <Input
      id={idCampo(fila.id, nombre)}
      label={rotulo(nombre, label)}
      value={fila.campos[nombre] ?? ""}
      onChange={(e) => cambiar(nombre)(nombre === "fechaNacimiento" ? mascaraFecha(e.target.value) : e.target.value)}
      onBlur={esNombre(nombre) ? (e) => cambiar(nombre)(formatearNombrePropio(e.target.value)) : undefined}
      autoComplete="off"
      {...extra}
    />
  );
  const documento = (
    <>
      <Select id={idCampo(fila.id, "tipoDocumento")} label={rotulo("tipoDocumento", "Tipo")} value={fila.campos.tipoDocumento} onChange={(e) => cambiar("tipoDocumento")(e.target.value)}>
        {TIPOS_DOCUMENTO.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </Select>
      <SelectorPais id={idCampo(fila.id, "paisDocumento")} label={rotulo("paisDocumento", "País emisor")} valor={fila.campos.paisDocumento} onCambiar={cambiar("paisDocumento")} />
      {campo("numeroDocumento", "Número")}
    </>
  );
  const herencia = textoHerencia(heredados);
  const opcionesResponsable = responsablesPosibles(estado, contexto, fila).filter((r) => r.id !== titularHabitacion?.id);
  const vinculo = fila.campos.vinculoResponsable ?? "";
  const conResponsable = necesitaResponsable(fila, contexto);
  const selectResponsable = conResponsable && (
    <Select
      id={idCampo(fila.id, "responsableId")}
      label={rotulo("responsableId", "Adulto responsable")}
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
  const selectVinculo = conResponsable && (
    <Select
      id={idCampo(fila.id, "vinculoResponsable")}
      label={rotulo("vinculoResponsable", "Vínculo")}
      value={vinculo}
      onChange={(e) => {
        cambiar("vinculoResponsable")(e.target.value);
        if (!requiereAutorizacion(e.target.value)) cambiar("autorizacionPresentada")(false);
      }}
    >
      <option value="">Elegí…</option>
      {VINCULOS_RESPONSABLE.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </Select>
  );
  const bloqueAutorizacion = conResponsable && requiereAutorizacion(vinculo) && (
      <div className="mt-2.5 flex flex-col gap-1.5 rounded-md bg-laton-100 px-2.5 py-2 text-[13px] text-laton-700">
        <span>Pedí la autorización de los padres o tutores.</span>
        <label className="flex items-center gap-2 font-semibold">
          <input
            id={idCampo(fila.id, "autorizacionPresentada")}
            type="checkbox"
            checked={Boolean(fila.campos.autorizacionPresentada)}
            onChange={(e) => cambiar("autorizacionPresentada")(e.target.checked)}
          />
          {rotulo("autorizacionPresentada", "Autorización presentada")}
        </label>
      </div>
  );
  const avisoSepararNombre = avisoNombre && (
    <p className="mt-2 rounded-md bg-laton-100 px-2.5 py-1.5 text-[13.5px] text-laton-700">{avisoNombre}</p>
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
        <p className="mb-1 text-[13.5px] text-pino-700">
          {fila.ficha.soloReferencia ? <>Ficha de <b>{fila.ficha.nombre}</b>: lo que cambies se compara con sus datos guardados. </> : <>Ficha de <b>{fila.ficha.nombre}</b>: se completaron todos sus datos. </>}
          {fichaSinNombreSeparado(fila)
            ? "Separá nombre y apellido según el documento (tienen que formar el mismo nombre); al confirmar se guarda en la ficha."
            : "El nombre es de la ficha; solo un administrador lo corrige, desde la ficha del huésped."}
        </p>
      )}
      <EstadoIdentificacion identificacion={identificacion} className="mb-2.5" />
      <ActualizarFicha
        id={idCampo(fila.id, "actualizarFicha")}
        cambiados={cambiados}
        marcada={fila.actualizarFicha}
        onCambiar={(valor) => dispatch({ tipo: "actualizarFicha", filaId: fila.id, valor })}
        className="mb-2.5"
      />

      {fila.tipo === "adulto" ? (
        <div className={CONTENEDOR_FICHA}>
          <div className={FILA_DOCUMENTO}>{documento}</div>
          {identificacion.puedeBuscar && (
            <div className="mt-1.5">
              <Button variante="secundario" tamano="fila" type="button" onClick={identificacion.buscarAhora}>
                Buscar
              </Button>
            </div>
          )}
          <div className={`${FILA_IDENTIDAD} mt-2.5`}>
            {campo("nombre", "Nombres", { disabled: nombreBloqueado })}
            {campo("apellido", "Apellido", { disabled: nombreBloqueado })}
            {campo("fechaNacimiento", "Nacimiento", { placeholder: "dd/mm/aaaa", inputMode: "numeric" })}
            <SelectorPais id={idCampo(fila.id, "nacionalidad")} label={rotulo("nacionalidad", "Nacionalidad")} valor={fila.campos.nacionalidad} onCambiar={cambiar("nacionalidad")} />
          </div>
          {avisoSepararNombre}
          {/* Adulto de 13 a 17 para la ocupación: responsable y vínculo en una fila aparte. */}
          {conResponsable && (
            <div className={`${FILA_RESPONSABLE} mt-2.5`}>
              {selectResponsable}
              {selectVinculo}
            </div>
          )}
          {bloqueAutorizacion}
          {fila.esTitular && (
            <>
              <p className="mb-1.5 mt-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-piedra">
                {esTitularReserva ? "Residencia y contacto del titular de la reserva" : "Residencia del titular de la habitación"}
              </p>
              <div className={FILA_RESIDENCIA}>
                <SelectorPais id={idCampo(fila.id, "paisResidencia")} label={rotulo("paisResidencia", "País de residencia")} valor={fila.campos.paisResidencia} onCambiar={cambiar("paisResidencia")} />
                {campo("localidad", "Localidad")}
                {campo("domicilio", "Domicilio")}
              </div>
              <div className={`${FILA_CONTACTO} mt-2.5`}>
                {campo("telefono", "Teléfono", { inputMode: "tel", label: rotulo("telefono", "Teléfono", { opcional: true }) })}
                {campo("email", "Correo", { inputMode: "email", label: rotulo("email", "Correo", { opcional: true }) })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className={CONTENEDOR_FICHA}>
          <div className={FILA_MENOR}>
            {campo("nombre", "Nombres", { disabled: nombreBloqueado })}
            {campo("apellido", "Apellido", { disabled: nombreBloqueado })}
            {campo("fechaNacimiento", "Nacimiento", { placeholder: "dd/mm/aaaa", inputMode: "numeric" })}
            {selectResponsable}
            {selectVinculo}
          </div>
          {avisoSepararNombre}
          {bloqueAutorizacion}
          {!fila.conDocumento && <p className="mt-1 text-[12.5px] text-piedra">Si el menor tiene DNI, cargalo: así se lo reconoce en la próxima estadía.</p>}
          {fila.conDocumento ? (
            <div className={`${FILA_DOCUMENTO} mt-2.5`}>{documento}</div>
          ) : (
            <button
              type="button"
              onClick={() => dispatch({ tipo: "conDocumento", filaId: fila.id })}
              className="mt-1.5 cursor-pointer rounded px-2 py-1 text-[13px] font-semibold text-pino-700 hover:bg-pino-100 focus-visible:outline-2 focus-visible:outline-pino"
            >
              Agregar documento (recomendado)
            </button>
          )}
        </div>
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
        <div className={`${CONTENEDOR_FICHA} mt-2`}>
          <div className={FILA_RESPONSABLE}>
          {fila.tipo === "menor" && (
            <SelectorPais id={idCampo(fila.id, "nacionalidad")} label={rotulo("nacionalidad", "Nacionalidad")} valor={resolverCampos(estado, fila).campos.nacionalidad} onCambiar={cambiar("nacionalidad")} />
          )}
          <SelectorPais id={idCampo(fila.id, "paisResidencia")} label={rotulo("paisResidencia", "País de residencia")} valor={resolverCampos(estado, fila).campos.paisResidencia} onCambiar={cambiar("paisResidencia")} />
          {fila.tipo === "adulto" && (
            <>
              {campo("telefono", "Teléfono", { inputMode: "tel", label: rotulo("telefono", "Teléfono", { opcional: true }) })}
              {campo("email", "Correo", { inputMode: "email", label: rotulo("email", "Correo", { opcional: true }) })}
            </>
          )}
          </div>
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
