// Usuarios y Seguridad — valores fijos del módulo.
//
// Los roles son los mismos 6 que ya usa el frontend (ROLES en
// frontend/src/lib/sesion.jsx), duplicados a mano: el backend no importa
// nada del frontend (misma convención que habitaciones/reservas).

const ROL_ADMIN = "admin";

const ROLES_USUARIO = ["admin", "recepcionista", "housekeeping", "deposito", "compras", "gerente"];

// Mismos nombres que muestran las tarjetas de perfil del login (ROLES en
// frontend/src/lib/sesion.jsx), para los mensajes de error.
const ETIQUETAS_ROL = {
  admin: "Administrador",
  recepcionista: "Recepcionista",
  housekeeping: "Housekeeping",
  deposito: "Encargado de Depósito",
  compras: "Encargado de Compras",
  gerente: "Gerente",
};

// Bloqueo por intentos fallidos: al quinto intento seguido con contraseña
// incorrecta, el usuario queda bloqueado 15 minutos. Pasado ese tiempo se
// desbloquea solo (o antes, si el administrador lo desbloquea a mano).
const MAX_INTENTOS_FALLIDOS = 5;
const MINUTOS_BLOQUEO = 15;

// Duración de la sesión: un turno de trabajo. Pasado ese tiempo el token
// vence y hay que volver a iniciar sesión.
const DURACION_SESION_MS = 8 * 60 * 60 * 1000;

const LIMITES_USUARIO = {
  usuarioMin: 3,
  usuarioMax: 30,
  nombre: 60,
  apellido: 60,
  email: 120,
  contrasenaMin: 6,
  // La contraseña que el administrador escribe al DAR DE ALTA a un usuario o al RESTABLECERLE la suya: no hay
  // contraseñas por defecto en ninguna parte, así que esa inicial tiene que ser más larga. (Cambiarla uno mismo
  // desde Mi perfil y entrar con la de siempre siguen con su regla de antes.)
  contrasenaInicialMin: 10,
  // scrypt no tiene tope real, pero una contraseña gigante solo sirve para
  // gastar CPU del servidor a propósito.
  contrasenaMax: 72,
  // La foto llega ya achicada desde el navegador (256x256 JPEG, ver
  // frontend/src/modulos/usuarios/fotoPerfil.js) y ocupa ~20-60 mil
  // caracteres. El tope deja margen y a la vez entra holgado en el límite
  // de 100 KB del express.json() global de index.js.
  fotoCaracteres: 90000,
};

// Solo minúsculas, números, punto, guion y guion bajo (ej. "tomi.recepcion").
const REGEX_USUARIO = /^[a-z0-9._-]+$/;
const REGEX_DNI = /^\d{7,8}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_FOTO = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

// Usuario que se crea solo la primera vez (ver asegurarAdminInicial en
// usuarios.servicio.js y scripts/crear-tabla-usuarios.js). Es el único que
// existe "de fábrica": el resto lo da de alta este administrador. La contraseña NO está acá: quien corre
// scripts/crear-tabla-usuarios.js la define en la variable de entorno ADMIN_PASSWORD_INICIAL (mínimo 10 caracteres).
const ADMIN_INICIAL = {
  usuario: "admin",
  nombre: "Administrador",
  apellido: "General",
  dni: "00000000",
};

module.exports = {
  ROL_ADMIN,
  ROLES_USUARIO,
  ETIQUETAS_ROL,
  MAX_INTENTOS_FALLIDOS,
  MINUTOS_BLOQUEO,
  DURACION_SESION_MS,
  LIMITES_USUARIO,
  REGEX_USUARIO,
  REGEX_DNI,
  REGEX_EMAIL,
  REGEX_FOTO,
  ADMIN_INICIAL,
};
