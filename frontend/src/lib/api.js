import axios from "axios";
import { CLAVE_SESION, CODIGO_SESION_INVALIDA, EVENTO_SESION_VENCIDA } from "./sesionClaves";
import { CODIGO_DEMORA, MENSAJE_DEMORA, TIMEOUT_DEFECTO_MS } from "./tiempos";

// Sin timeout el cliente espera para siempre; con la base remota eso se ve como una pantalla trabada.
export const api = axios.create({
  baseURL: "/api",
  timeout: TIMEOUT_DEFECTO_MS,
});

function esDemora(error) {
  return (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") && /timeout/i.test(String(error?.message ?? ""));
}

// Usuarios y Seguridad: cada pedido sale con el token de la sesión en el
// header Authorization. Desde HU-106 el backend exige sesión en TODO /api salvo /api/web/* y el login: este
// es el ÚNICO cliente HTTP de la app (no hay fetch ni descargas por fuera), así que ningún pedido sale sin ella.
api.interceptors.request.use((config) => {
  try {
    const token = JSON.parse(sessionStorage.getItem(CLAVE_SESION) ?? "null")?.token;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  } catch {
    // Sin sesión guardada (o ilegible): el pedido sale sin token.
  }
  return config;
});

// Si el backend avisa que el token venció o el usuario fue desactivado, se
// avisa a la sesión (lib/sesion.jsx) para que la cierre y mande al login.
api.interceptors.response.use(
  (respuesta) => respuesta,
  (error) => {
    // Se venció la espera: se le da al resto de la app un error con el aviso para recepción (misma forma que un
    // error del servidor, así cada pantalla lo muestra donde ya muestra errores). No se aplica a /web (el sitio
    // público maneja su propio ERROR_RED) y nunca se reintenta una escritura automáticamente.
    if (esDemora(error) && !String(error?.config?.url ?? "").startsWith("/web")) {
      error.response = { status: 0, data: { codigo: CODIGO_DEMORA, error: MENSAJE_DEMORA } };
      return Promise.reject(error);
    }
    const datos = error?.response?.data;
    if (error?.response?.status === 401 && datos?.codigo === CODIGO_SESION_INVALIDA) {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_VENCIDA, { detail: datos.error }));
    }
    return Promise.reject(error);
  }
);
