import axios from "axios";
import { CLAVE_SESION, CODIGO_SESION_INVALIDA, EVENTO_SESION_VENCIDA } from "./sesionClaves";

export const api = axios.create({
  baseURL: "/api",
});

// Usuarios y Seguridad: cada pedido sale con el token de la sesión en el
// header Authorization. Hoy solo lo exigen /api/usuarios y /api/auth/yo; el
// resto del backend lo ignora, así que no cambia nada para los demás módulos.
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
    const datos = error?.response?.data;
    if (error?.response?.status === 401 && datos?.codigo === CODIGO_SESION_INVALIDA) {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_VENCIDA, { detail: datos.error }));
    }
    return Promise.reject(error);
  }
);
