// Claves compartidas entre la sesión (lib/sesion.jsx) y el cliente HTTP
// (lib/api.js). Viven en un archivo aparte para que ninguno de los dos
// tenga que importar al otro.

// Dónde se guarda la sesión del navegador (rol, usuario, token y perfil).
export const CLAVE_SESION = "sgh_sesion";

// Mensaje para mostrar en el login la próxima vez (ej. "tu sesión venció").
export const CLAVE_AVISO_LOGIN = "sgh_aviso_login";

// Evento que dispara api.js cuando el backend dice que el token ya no vale.
export const EVENTO_SESION_VENCIDA = "sgh:sesion-vencida";

// Código que manda el backend en esos casos (usuarios.middleware.js).
export const CODIGO_SESION_INVALIDA = "SESION_INVALIDA";
