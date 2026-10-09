// Identificación de una persona por documento (regla general del mostrador): primero TIPO + PAÍS EMISOR + NÚMERO
// (nunca la nacionalidad); si existe, se trae su ficha completa; si no, se cargan los datos. Funciones puras: las usan
// el asistente de reserva, el detalle, el check-in, el walk-in y la ficha de huésped.
import { formatearFechaDdMmAaaa } from "../fechas";

// Mismo criterio que el backend (lib/documento.js): sin puntos, guiones ni espacios.
export function normalizarNumeroDocumento(valor) {
  return String(valor ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export const LARGO_MINIMO_DOCUMENTO = 6;
export const DEMORA_BUSQUEDA_DOCUMENTO_MS = 400;
export const PAIS_EMISOR_POR_DEFECTO = "AR";

// Datos de la ficha que se traen al encontrarla (sin el nombre: el nombre es de la ficha y no se cambia desde acá).
export const CAMPOS_DE_LA_FICHA = ["fechaNacimiento", "nacionalidad", "paisResidencia", "localidad", "domicilio", "telefono", "email"];

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
// "1985-03-12" → "12/03/1985" (formato de los formularios dd/mm/aaaa); lo que ya viene así se deja igual.
export function fechaParaFormulario(valor) {
  const m = ISO.exec(String(valor ?? ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor ?? "");
}
// "12/03/1985" → "1985-03-12" para comparar con lo que guarda el servidor.
function fechaISO(valor) {
  const t = String(valor ?? "").trim();
  const dma = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (dma) return `${dma[3]}-${dma[2]}-${dma[1]}`;
  const m = ISO.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : t;
}

const vacio = (v) => v === null || v === undefined || String(v).trim() === "";

// Mismo criterio que el backend (lib/documento.js, claveNombre): sin tildes, mayúsculas ni espacios de más.
export function claveNombre(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ¿Nombres + apellido forman el mismo nombre completo? (separar el nombre de una ficha vieja no es cambiarlo)
export function mismoNombreCompleto(nombres, apellido, nombreCompleto) {
  return claveNombre(`${nombres ?? ""} ${apellido ?? ""}`) === claveNombre(nombreCompleto);
}
const norm = (v) => String(v ?? "").trim().toLowerCase();

// Respuesta de GET /huespedes/por-documento → la ficha que usan las pantallas.
export function fichaDesdeRespuesta(datos) {
  if (!datos) return null;
  const nombres = datos.nombreRegistrado?.nombres ?? datos.nombre ?? "";
  const apellido = datos.nombreRegistrado?.apellido ?? datos.apellido ?? "";
  return {
    tipoDocumento: datos.tipoDocumento ?? "",
    paisDocumento: datos.paisDocumento ?? "",
    numeroDocumento: datos.numeroDocumento ?? "",
    nombres,
    apellido,
    nombreCompleto: `${nombres} ${apellido}`.trim(),
    // Ficha vieja: el nombre completo en un solo campo. La recepción lo separa según el documento y se guarda al confirmar.
    nombreSeparado: datos.nombreSeparado ?? Boolean(String(apellido).trim()),
    fechaNacimiento: datos.fechaNacimiento ?? "",
    nacionalidad: datos.nacionalidad ?? "",
    paisResidencia: datos.paisResidencia ?? "",
    localidad: datos.localidad ?? "",
    domicilio: datos.domicilio ?? "",
    telefono: datos.telefono ?? "",
    email: datos.email ?? "",
    fechaUltimaEstadia: datos.fechaUltimaEstadia ?? null,
    alojadaAhora: Boolean(datos.alojadaAhora),
  };
}

// Valores de la ficha tal como los usan los formularios (fecha dd/mm/aaaa).
export function valoresDeLaFicha(ficha) {
  const valores = {};
  for (const campo of CAMPOS_DE_LA_FICHA) {
    const v = campo === "fechaNacimiento" ? fechaParaFormulario(ficha[campo]) : ficha[campo];
    if (!vacio(v)) valores[campo] = v;
  }
  return valores;
}

// Qué datos escribió el recepcionista que son DISTINTOS de los de la ficha (solo los que la ficha ya tiene: un campo
// que la ficha no tenía no es un "cambio", es un dato nuevo que se completa). Se marcan en la pantalla y solo se
// guardan en la ficha con la casilla "Actualizar la ficha del huésped con estos datos".
export function camposCambiados(valores, ficha) {
  if (!ficha) return [];
  const cambiados = [];
  for (const campo of CAMPOS_DE_LA_FICHA) {
    const enFicha = campo === "fechaNacimiento" ? fechaISO(ficha[campo]) : ficha[campo];
    const escrito = campo === "fechaNacimiento" ? fechaISO(valores[campo]) : valores[campo];
    if (vacio(enFicha) || vacio(escrito)) continue;
    if (norm(enFicha) !== norm(escrito)) cambiados.push(campo);
  }
  // La ficha guarda UN solo contacto (correo, o teléfono si no tiene correo) y el correo manda. Un correo nuevo cuando la
  // ficha solo tenía teléfono (o al revés) no se pisa en silencio: se marca como "contacto" para ofrecer la casilla.
  if (!cambiados.includes("email") && !cambiados.includes("telefono")) {
    const enFicha = ficha.email || ficha.telefono;
    const escrito = valores.email || valores.telefono;
    if (!vacio(enFicha) && !vacio(escrito) && norm(enFicha) !== norm(escrito)) cambiados.push("contacto");
  }
  return cambiados;
}

export const ETIQUETA_CAMPO = {
  fechaNacimiento: "nacimiento",
  nacionalidad: "nacionalidad",
  paisResidencia: "país de residencia",
  localidad: "localidad",
  domicilio: "domicilio",
  telefono: "teléfono",
  email: "correo",
  contacto: "contacto",
};

export const TEXTO_ACTUALIZAR_FICHA = "Actualizar la ficha del huésped con estos datos";
export const TEXTO_NO_REGISTRADA = "No hay un huésped registrado con ese documento";

export function textoRegistrada(ficha) {
  const ultima = ficha?.fechaUltimaEstadia ? ` · última estadía: ${formatearFechaDdMmAaaa(ficha.fechaUltimaEstadia)}` : "";
  return `Huésped registrado${ultima}`;
}

// "Hay un huésped con el mismo número y otro tipo/país de documento: Pasaporte, BR, M. J. G."
export function textoOtrosDocumentos(otros = []) {
  if (!otros.length) return "";
  const lista = otros.map((o) => [o.tipoDocumento, o.paisDocumento, o.iniciales].filter(Boolean).join(", ")).join(" · ");
  return `Hay un huésped con el mismo número y otro tipo/país de documento: ${lista}. Confirmá que es otra persona; las fichas no se unen solas.`;
}
