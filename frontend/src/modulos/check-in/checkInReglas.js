// Reglas de la pantalla única de check-in (lógica pura). Los datos obligatorios y los formatos
// salen de la validación que ya existe para las fichas (validarOcupante / pendientesParaIngreso);
// acá se suman solo las reglas propias de la pantalla (edades, titular de la reserva, herencia de
// residencia y nacionalidad) y se redacta todo en lenguaje de recepción.
import { validarOcupante, pendientesParaIngreso } from "../estadia/validarOcupante";
import { edadEnFecha, ddMmAaaaAISO } from "../../lib/fechas";
import { nombrePais } from "../../lib/paises";
import { requiereAutorizacion } from "../../lib/vinculos";
import {
  EDAD_ADULTO_OCUPACION,
  MAYORIA_EDAD,
  MOTIVO_MENOR_SIN_DOCUMENTO,
} from "./checkInPantalla.constantes";
import { esQuienReservo, HEREDABLES_ACOMPANANTE, HEREDABLES_MENOR } from "./checkInEstado";

const texto = (v) => String(v ?? "").trim();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function listaY(items) {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

export const etiquetaOcupacion = (adultos, menores) =>
  plural(adultos, "adulto", "adultos") + (menores ? ` · ${plural(menores, "menor", "menores")}` : "");

// "Hab. 315" o, en el walk-in sin elegir, "Habitación 2".
export function nombreHabitacion(estado, clave) {
  const indice = estado.habitaciones.findIndex((h) => h.clave === clave);
  const h = estado.habitaciones[indice];
  return h?.numero ? `Hab. ${h.numero}` : `Habitación ${indice + 1}`;
}

// "Adulto 2" / "Menor 1", contando dentro de su habitación.
export function etiquetaFila(estado, fila) {
  const mismas = estado.filas.filter((f) => f.habitacionClave === fila.habitacionClave && f.tipo === fila.tipo);
  return `${fila.tipo === "adulto" ? "Adulto" : "Menor"} ${mismas.findIndex((f) => f.id === fila.id) + 1}`;
}

export const nombreDeFila = (fila) => `${texto(fila.campos.nombre)} ${texto(fila.campos.apellido)}`.trim();

export const idCampo = (filaId, campo) => `ci-${filaId}-${campo}`;

export const fechaIngresoDe = (contexto) => String(contexto.fechaDesde).slice(0, 10);

export function edadDeFila(fila, contexto) {
  return edadEnFecha(ddMmAaaaAISO(fila.campos.fechaNacimiento), fechaIngresoDe(contexto));
}

export const titularDeHabitacion = (estado, clave) =>
  estado.filas.find((f) => f.habitacionClave === clave && f.esTitular && f.tipo === "adulto") ?? null;

// Titular de la reserva: con reserva, el titular de habitación que es quien reservó; si ninguno
// lo es (o en el walk-in), el titular de la primera habitación. Es el único que necesita teléfono.
export function titularDeLaReserva(estado, contexto) {
  const titulares = estado.habitaciones.map((h) => titularDeHabitacion(estado, h.clave)).filter(Boolean);
  if (contexto.huespedReserva) {
    const coincide = titulares.find((f) => esQuienReservo(contexto.huespedReserva, f.campos));
    if (coincide) return { fila: coincide, coincide: true };
  }
  return { fila: titulares[0] ?? null, coincide: false };
}

export const necesitaMotivo = (estado, contexto) =>
  estado.modo === "reserva" && Boolean(contexto.huespedReserva) && !titularDeLaReserva(estado, contexto).coincide;

// Responsable efectivo: el elegido o, por defecto, el titular de la habitación.
export function responsableDe(estado, fila) {
  if (fila.responsableId != null) return estado.filas.find((f) => f.id === fila.responsableId) ?? null;
  const titular = titularDeHabitacion(estado, fila.habitacionClave);
  return titular && titular.id !== fila.id ? titular : null;
}

// Necesita responsable todo menor de 18 (incluye a los "Adultos" de 13 a 17 para la ocupación).
export function necesitaResponsable(fila, contexto) {
  if (fila.tipo === "menor") return true;
  const edad = edadDeFila(fila, contexto);
  return edad !== null && edad >= 0 && edad < MAYORIA_EDAD;
}

// Valores que se envían, con la herencia resuelta:
//   - adulto no titular: país de residencia del titular de su habitación;
//   - menor: nacionalidad y país de residencia de su adulto responsable.
// Un campo cargado a mano en la fila ("Más datos") deja de heredar.
export function resolverCampos(estado, fila, visitados = new Set()) {
  const campos = { ...fila.campos };
  const heredados = {};
  if (visitados.has(fila.id)) return { campos, heredados };
  visitados.add(fila.id);
  let origen = null;
  let lista = [];
  if (fila.tipo === "menor") {
    origen = responsableDe(estado, fila);
    lista = HEREDABLES_MENOR;
  } else if (!fila.esTitular) {
    origen = titularDeHabitacion(estado, fila.habitacionClave);
    lista = HEREDABLES_ACOMPANANTE;
  }
  if (origen && origen.id !== fila.id) {
    const delOrigen = resolverCampos(estado, origen, visitados).campos;
    for (const campo of lista) {
      if (fila.corregidos.includes(campo)) continue;
      campos[campo] = delOrigen[campo] ?? "";
      heredados[campo] = { de: fila.tipo === "menor" ? "responsable" : "titular", origenId: origen.id };
    }
  } else {
    for (const campo of lista) if (!fila.corregidos.includes(campo)) heredados[campo] = { de: fila.tipo === "menor" ? "responsable" : "titular", origenId: null };
  }
  return { campos, heredados };
}

// Texto de la herencia para la fila: "Residencia: la del titular · Nacionalidad: la del responsable".
export function textoHerencia(heredados) {
  const partes = [];
  if (heredados.paisResidencia) partes.push(`Residencia: la del ${heredados.paisResidencia.de}`);
  if (heredados.nacionalidad) partes.push(`Nacionalidad: la del ${heredados.nacionalidad.de}`);
  return partes.join(" · ");
}

// Adultos de 18 o más (o sin nacimiento cargado) de TODA la reserva que pueden ser responsables.
export function responsablesPosibles(estado, contexto, fila) {
  return estado.filas
    .filter((f) => f.tipo === "adulto" && f.id !== fila.id)
    .filter((f) => {
      const edad = edadDeFila(f, contexto);
      return edad === null || edad >= MAYORIA_EDAD;
    })
    .map((f) => ({ id: f.id, texto: `${nombreDeFila(f) || etiquetaFila(estado, f)} · ${nombreHabitacion(estado, f.habitacionClave)}` }));
}

// Aviso de edad de la fila (bloquea la confirmación).
export function problemaDeEdad(fila, contexto) {
  const edad = edadDeFila(fila, contexto);
  if (edad === null) return null;
  if (fila.tipo === "menor" && edad >= EDAD_ADULTO_OCUPACION)
    return `Tiene ${edad} años: desde los ${EDAD_ADULTO_OCUPACION} se registra como adulto y paga tarifa de adulto.`;
  if (fila.tipo === "adulto" && edad < EDAD_ADULTO_OCUPACION) return `Tiene ${edad} años: se registra como menor (sin cargo).`;
  if (fila.esTitular && edad < MAYORIA_EDAD) return `Tiene ${edad} años: el titular de la habitación tiene que ser mayor de ${MAYORIA_EDAD}.`;
  return null;
}

const NOMBRE_CAMPO = {
  numeroDocumento: "el documento",
  paisDocumento: "el país emisor",
  nombre: "el nombre",
  apellido: "el apellido",
  fechaNacimiento: "la fecha de nacimiento",
  nacionalidad: "la nacionalidad",
  paisResidencia: "el país de residencia",
  localidad: "la localidad",
  domicilio: "el domicilio",
  telefono: "el teléfono",
  email: "un correo válido",
  responsableId: "el adulto responsable",
  vinculoResponsable: "el vínculo con el menor",
  autorizacionPresentada: "la autorización de los padres o tutores",
};

// Lo que pendientesParaIngreso informa, llevado al campo de la pantalla.
const PENDIENTE_A_CAMPO = [
  [/^nombre$/, "nombre"],
  [/^apellido/, "apellido"],
  [/^nacimiento$/, "fechaNacimiento"],
  [/^nacionalidad$/, "nacionalidad"],
  [/^país de residencia$/, "paisResidencia"],
  [/^documento completo/, "numeroDocumento"],
  [/^adulto responsable$/, "responsableId"],
];

const telefonoValido = (v) => {
  const t = texto(v);
  const digitos = t.replace(/\D/g, "").length;
  return /^\+?[\d\s()-]+$/.test(t) && digitos >= 6 && digitos <= 20;
};

// Persona como la ve la validación existente (fechas ISO, habitación definitiva).
function comoFicha(estado, fila, contexto) {
  const { campos } = resolverCampos(estado, fila);
  const habitacion = estado.habitaciones.find((h) => h.clave === fila.habitacionClave);
  const responsable = necesitaResponsable(fila, contexto) ? responsableDe(estado, fila) : null;
  const sinDocumento = fila.tipo === "menor" && !texto(campos.numeroDocumento);
  return {
    id: fila.id,
    estado: "Previsto",
    ...campos,
    fechaNacimiento: ddMmAaaaAISO(campos.fechaNacimiento) ?? "",
    numeroDocumento: sinDocumento ? "" : campos.numeroDocumento,
    tipoDocumento: sinDocumento ? "" : campos.tipoDocumento,
    paisDocumento: sinDocumento ? "" : campos.paisDocumento,
    motivoSinDocumento: sinDocumento ? MOTIVO_MENOR_SIN_DOCUMENTO : "",
    responsableId: responsable?.id ?? "",
    habitacionId: habitacion?.habitacionId ?? habitacion?.clave,
    fechaDesde: fechaIngresoDe(contexto),
    fechaHasta: String(contexto.fechaHasta).slice(0, 10),
    esTitular: fila.esTitular,
  };
}

// Datos que faltan o están mal en una fila, en lenguaje de recepción.
// Devuelve { faltan: [{campo, texto}], edad, estado } para la fila y la barra.
export function revisarFila(estado, fila, contexto) {
  const ficha = comoFicha(estado, fila, contexto);
  const { heredados } = resolverCampos(estado, fila);
  const faltan = [];
  const agregar = (campo, textoFaltante) => {
    if (!faltan.some((f) => f.campo === campo)) faltan.push({ campo, texto: textoFaltante ?? NOMBRE_CAMPO[campo] });
  };

  // Lo que ya exige la validación de fichas.
  for (const pendiente of pendientesParaIngreso(ficha)) {
    const campo = PENDIENTE_A_CAMPO.find(([patron]) => patron.test(pendiente))?.[1];
    if (!campo) continue;
    if (campo === "numeroDocumento") {
      if (!texto(fila.campos.paisDocumento)) agregar("paisDocumento");
      agregar("numeroDocumento");
    } else if (heredados[campo]) {
      const origen = heredados[campo].origenId ? estado.filas.find((f) => f.id === heredados[campo].origenId) : null;
      const quien =
        heredados[campo].de === "titular"
          ? `del titular de la ${nombreHabitacion(estado, fila.habitacionClave)}`
          : origen
            ? `del responsable (${nombreDeFila(origen) || etiquetaFila(estado, origen)})`
            : "del responsable";
      faltan.push({ campo, heredado: true, texto: `${campo === "nacionalidad" ? "la nacionalidad" : "la residencia"} ${quien}` });
    } else agregar(campo);
  }
  if (texto(fila.campos.fechaNacimiento) && !ddMmAaaaAISO(fila.campos.fechaNacimiento)) agregar("fechaNacimiento", "una fecha de nacimiento válida");

  // Reglas propias de la pantalla.
  if (fila.tipo === "adulto" && !texto(fila.campos.paisDocumento)) agregar("paisDocumento");
  if (fila.esTitular) {
    for (const campo of ["paisResidencia", "localidad", "domicilio"]) if (!texto(fila.campos[campo])) agregar(campo);
  }
  // Menor de 18: vínculo del responsable y, si es otro familiar u otro adulto, la autorización.
  if (necesitaResponsable(fila, contexto)) {
    if (!texto(fila.campos.vinculoResponsable)) agregar("vinculoResponsable");
    else if (requiereAutorizacion(fila.campos.vinculoResponsable) && !fila.campos.autorizacionPresentada)
      agregar("autorizacionPresentada");
  }
  const titularReserva = titularDeLaReserva(estado, contexto).fila;
  if (titularReserva?.id === fila.id && !telefonoValido(fila.campos.telefono)) agregar("telefono");
  else if (texto(fila.campos.telefono) && !telefonoValido(fila.campos.telefono)) agregar("telefono", "un teléfono válido");

  // Formatos y duplicados de la validación existente (correo, documento repetido, nacimiento futuro).
  const otras = estado.filas.filter((f) => f.id !== fila.id).map((f) => comoFicha(estado, f, contexto));
  const reservaParaValidar = {
    fechaDesde: fechaIngresoDe(contexto),
    fechaHasta: String(contexto.fechaHasta).slice(0, 10),
    habitaciones: estado.habitaciones.map((h) => ({ id: h.habitacionId ?? h.clave, numero: h.numero, capacidad: 99 })),
  };
  const errores = validarOcupante(ficha, reservaParaValidar, otras, { id: fila.id }, {}, false, false);
  if (errores.email) agregar("email");
  if (errores.numeroDocumento) agregar("numeroDocumento", "un documento distinto (está repetido en este check-in)");
  if (errores.fechaNacimiento && ddMmAaaaAISO(fila.campos.fechaNacimiento)) agregar("fechaNacimiento", "una fecha de nacimiento válida (no futura)");

  const edad = problemaDeEdad(fila, contexto);
  const estadoFila = faltan.length ? (faltan.length === 1 ? "Falta 1 dato" : `Faltan ${faltan.length} datos`) : edad ? "Revisá la edad" : "Completa";
  return { faltan, edad, estado: estadoFila, completa: !faltan.length && !edad };
}

// Campos obligatorios de la fila (los del asterisco), con las mismas reglas que revisarFila:
// documento según la fila, residencia propia salvo que se herede, localidad y domicilio del
// titular de la habitación, teléfono solo del titular de la reserva, responsable y vínculo solo
// de menores de 18, y la autorización según el vínculo.
export function camposObligatorios(estado, fila, contexto) {
  const { heredados } = resolverCampos(estado, fila);
  const obligatorios = new Set(["nombre", "apellido", "fechaNacimiento"]);
  const conDocumento = fila.tipo === "adulto" || texto(fila.campos.numeroDocumento);
  if (conDocumento) for (const campo of ["tipoDocumento", "paisDocumento", "numeroDocumento"]) obligatorios.add(campo);
  for (const campo of ["nacionalidad", "paisResidencia"]) if (!heredados[campo]) obligatorios.add(campo);
  if (fila.esTitular) for (const campo of ["paisResidencia", "localidad", "domicilio"]) obligatorios.add(campo);
  if (titularDeLaReserva(estado, contexto).fila?.id === fila.id) obligatorios.add("telefono");
  if (necesitaResponsable(fila, contexto)) {
    obligatorios.add("responsableId");
    obligatorios.add("vinculoResponsable");
    if (requiereAutorizacion(fila.campos.vinculoResponsable)) obligatorios.add("autorizacionPresentada");
  }
  return obligatorios;
}

// Avisos informativos de la fila (no bloquean).
export function avisosDeFila(fila) {
  const avisos = [];
  if (fila.precargada && !texto(fila.campos.apellido) && /\s/.test(texto(fila.campos.nombre)))
    avisos.push("El nombre viene completo desde la reserva: separá nombre y apellido según el documento.");
  if (fila.alojadaEnOtra) avisos.push("Esta persona figura alojada en otra estadía.");
  return avisos;
}

// Todo lo que falta para confirmar, en orden de pantalla. Cada ítem lleva al campo.
export function faltantesParaConfirmar(estado, contexto) {
  const out = [];
  const varias = estado.habitaciones.length > 1;
  if (estado.modo === "walkin") {
    if (!estado.planCodigo) out.push({ texto: "Falta elegir la tarifa", campoId: "ci-tarifa" });
    estado.habitaciones.forEach((h, i) => {
      if (!h.habitacionId) out.push({ texto: `Falta elegir la habitación ${i + 1}`, campoId: `ci-hab-${h.clave}` });
    });
  }
  for (const h of estado.habitaciones) {
    if (h.capacidad != null && h.adultos + h.menores > h.capacidad)
      out.push({
        texto: `La ${nombreHabitacion(estado, h.clave)} admite hasta ${h.capacidad} personas: cambiá de habitación`,
        campoId: `ci-hab-${h.clave}`,
      });
    if (h.adultos < 1) out.push({ texto: `Falta al menos un adulto en la ${nombreHabitacion(estado, h.clave)}`, campoId: `ci-hab-${h.clave}` });
  }
  for (const fila of estado.filas) {
    const revision = revisarFila(estado, fila, contexto);
    const quien = `del ${etiquetaFila(estado, fila)}${varias || estado.modo === "reserva" ? ` (${nombreHabitacion(estado, fila.habitacionClave)})` : ""}`;
    // Lo heredado se informa como ítem propio: "Falta la residencia del titular de la Hab. 315".
    for (const f of revision.faltan.filter((x) => x.heredado)) {
      const textoHeredado = `Falta ${f.texto}`;
      if (!out.some((o) => o.texto === textoHeredado)) out.push({ texto: textoHeredado, campoId: idCampo(fila.id, f.campo), filaId: fila.id });
    }
    const propios = revision.faltan.filter((x) => !x.heredado);
    if (propios.length) {
      const primeros = propios.map((f) => f.texto);
      const textoFaltante =
        primeros.length > 3
          ? `Faltan ${primeros.length} datos ${quien}`
          : `${primeros.length === 1 ? "Falta" : "Faltan"} ${listaY(primeros)} ${quien}`;
      out.push({ texto: textoFaltante, campoId: idCampo(fila.id, propios[0].campo), filaId: fila.id });
    }
    if (revision.edad) out.push({ texto: `Revisá la edad ${quien}`, campoId: idCampo(fila.id, "fechaNacimiento"), filaId: fila.id });
  }
  if (necesitaMotivo(estado, contexto) && !texto(estado.motivoTitularDistinto))
    out.push({ texto: "Falta el motivo del titular distinto", campoId: "ci-motivo" });
  if (!estado.garantia.garantiaConfirmada) out.push({ texto: "Falta la garantía para consumos", campoId: "ci-garantia" });
  return out;
}

export const nombreDePais = (codigo) => nombrePais(codigo) ?? codigo ?? "";
