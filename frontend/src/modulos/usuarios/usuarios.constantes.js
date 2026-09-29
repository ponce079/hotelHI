// Usuarios y Seguridad — mismas reglas que
// backend/src/modulos/usuarios/usuarios.constantes.js, duplicadas a mano
// (el frontend no importa nada del backend). Acá sirven para avisar el
// error antes de mandar el formulario; el backend igual vuelve a validar.

export const LIMITES_USUARIO = {
  usuarioMin: 3,
  usuarioMax: 30,
  nombre: 60,
  apellido: 60,
  email: 120,
  contrasenaMin: 6,
  contrasenaMax: 72,
};

export const MAX_INTENTOS_FALLIDOS = 5;
export const MINUTOS_BLOQUEO = 15;

const REGEX_USUARIO = /^[a-z0-9._-]+$/;
const REGEX_DNI = /^\d{7,8}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FILTROS_ESTADO = [
  { valor: "", etiqueta: "Todos" },
  { valor: "activos", etiqueta: "Activos" },
  { valor: "inactivos", etiqueta: "Inactivos" },
  { valor: "bloqueados", etiqueta: "Bloqueados" },
];

export function limpiarDni(valor) {
  return String(valor ?? "").replace(/[.\s]/g, "");
}

// "40123456" → "40.123.456" (solo para mostrar).
export function formatearDni(dni) {
  const limpio = limpiarDni(dni);
  return limpio ? limpio.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "—";
}

export function nombreCompleto(usuario) {
  if (!usuario) return "";
  return `${usuario.nombre ?? ""} ${usuario.apellido ?? ""}`.trim() || usuario.usuario || "";
}

export function inicialesDe(usuario) {
  if (usuario?.nombre && usuario?.apellido) return `${usuario.nombre[0]}${usuario.apellido[0]}`.toUpperCase();
  return String(usuario?.usuario || usuario?.nombre || "?").slice(0, 2).toUpperCase();
}

export function estadoUsuario(usuario) {
  if (usuario.bloqueado) return { etiqueta: "Bloqueado", variante: "alerta" };
  if (!usuario.activo) return { etiqueta: "Inactivo", variante: "neutro" };
  return { etiqueta: "Activo", variante: "ok" };
}

export function formatearFechaHora(fechaISO) {
  if (!fechaISO) return "Nunca";
  return new Date(fechaISO).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function validarNombreUsuario(valor) {
  const usuario = String(valor ?? "").trim().toLowerCase();
  if (!usuario) return "El usuario es obligatorio.";
  if (usuario.length < LIMITES_USUARIO.usuarioMin || usuario.length > LIMITES_USUARIO.usuarioMax || !REGEX_USUARIO.test(usuario)) {
    return `Entre ${LIMITES_USUARIO.usuarioMin} y ${LIMITES_USUARIO.usuarioMax} caracteres: minúsculas, números, punto, guion o guion bajo.`;
  }
  return undefined;
}

// Nombre, apellido, DNI y email — los mismos en el alta del admin y en
// "Mi perfil".
export function validarDatosPersonales(form) {
  const errores = {};
  if (!form.nombre?.trim()) errores.nombre = "El nombre es obligatorio.";
  if (!form.apellido?.trim()) errores.apellido = "El apellido es obligatorio.";
  const dni = limpiarDni(form.dni);
  if (!dni) errores.dni = "El DNI es obligatorio.";
  else if (!REGEX_DNI.test(dni)) errores.dni = "El DNI debe tener 7 u 8 números.";
  const email = form.email?.trim() ?? "";
  if (email && !REGEX_EMAIL.test(email)) errores.email = "El email no tiene un formato válido.";
  return errores;
}

export function validarContrasenaNueva(contrasena, repetida) {
  const errores = {};
  if (!contrasena || contrasena.length < LIMITES_USUARIO.contrasenaMin) {
    errores.contrasena = `Mínimo ${LIMITES_USUARIO.contrasenaMin} caracteres.`;
  } else if (contrasena.length > LIMITES_USUARIO.contrasenaMax) {
    errores.contrasena = `Máximo ${LIMITES_USUARIO.contrasenaMax} caracteres.`;
  }
  if (repetida !== contrasena) errores.repetir = "Las contraseñas no coinciden.";
  return errores;
}

export function mensajeDeError(error, porDefecto) {
  if (error?.response?.data?.error) return error.response.data.error;
  if (!error?.response) return "No se pudo conectar con el servidor. Revisá que el backend esté levantado.";
  return porDefecto;
}
