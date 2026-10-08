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

// Lo que ve la persona en el login cuando la sesión deja de valer (token vencido o inválido, o API cerrada
// sin sesión): un mensaje único y claro, no un error genérico. El único motivo que se conserva tal cual es
// el del usuario desactivado, porque dice algo distinto ("consultá con el administrador").
export const MENSAJE_SESION_VENCIDA = "Tu sesión venció. Ingresá de nuevo.";

export function mensajeSesionVencida(detalle) {
  return /ya no está activo/i.test(String(detalle ?? "")) ? String(detalle) : MENSAJE_SESION_VENCIDA;
}
