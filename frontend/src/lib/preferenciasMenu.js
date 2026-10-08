// Preferencias del menú lateral (HU-117), por usuario, en localStorage. Todo
// con try/catch: sin almacenamiento (ventana privada, sitio bloqueado) el menú
// funciona igual, solo que no recuerda nada.
const CLAVE_CONTRAIDO = "sgh_menu_contraido";
const CLAVE_GRUPOS = "sgh_menu_grupos";

function clave(base, usuario) {
  return `${base}:${usuario ?? "anonimo"}`;
}

export function leerMenuContraido(usuario) {
  try {
    return localStorage.getItem(clave(CLAVE_CONTRAIDO, usuario)) === "1";
  } catch {
    return false;
  }
}

export function guardarMenuContraido(usuario, contraido) {
  try {
    localStorage.setItem(clave(CLAVE_CONTRAIDO, usuario), contraido ? "1" : "0");
  } catch {
    // Sin almacenamiento: el estado vive solo en memoria.
  }
}

// { [grupo]: true|false } con lo que el usuario abrió o cerró a mano; los
// grupos sin entrada usan el estado por defecto (ver estadoInicialGrupos).
export function leerGruposMenu(usuario) {
  try {
    const guardado = JSON.parse(localStorage.getItem(clave(CLAVE_GRUPOS, usuario)) ?? "null");
    return guardado && typeof guardado === "object" && !Array.isArray(guardado) ? guardado : {};
  } catch {
    return {};
  }
}

export function guardarGruposMenu(usuario, estado) {
  try {
    localStorage.setItem(clave(CLAVE_GRUPOS, usuario), JSON.stringify(estado));
  } catch {
    // Sin almacenamiento: el estado vive solo en memoria.
  }
}

// Abierto por defecto todo menos "Administración", salvo que sea el único
// grupo visible para el rol o contenga la ruta activa.
export function grupoAbiertoPorDefecto(nombre, nombresVisibles) {
  return nombre !== "Administración" || nombresVisibles.length === 1;
}
