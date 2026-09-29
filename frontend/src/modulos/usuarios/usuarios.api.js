import { api } from "../../lib/api";

// ── Login ───────────────────────────────────────────────────

// `rol`: el perfil elegido en la pantalla de login; el backend verifica que
// sea el que el administrador le asignó a ese usuario.
export async function iniciarSesion(usuario, contrasena, rol) {
  const { data } = await api.post("/auth/login", { usuario, contrasena, rol });
  return data; // { token, usuario }
}

export async function obtenerMiPerfil() {
  const { data } = await api.get("/auth/yo");
  return data;
}

// ── Autogestión (cualquier usuario logueado, sobre sí mismo) ─

export async function actualizarMiPerfil(datos) {
  const { data } = await api.patch("/usuarios/yo/perfil", datos);
  return data;
}

export async function cambiarMiContrasena(contrasenaActual, contrasenaNueva) {
  const { data } = await api.patch("/usuarios/yo/contrasena", { contrasenaActual, contrasenaNueva });
  return data;
}

// ── Administración (solo admin) ─────────────────────────────

export async function listarUsuarios() {
  const { data } = await api.get("/usuarios");
  return data;
}

export async function crearUsuario(datos) {
  const { data } = await api.post("/usuarios", datos);
  return data;
}

export async function actualizarUsuario(id, datos) {
  const { data } = await api.put(`/usuarios/${id}`, datos);
  return data;
}

export async function cambiarActivoUsuario(id, activo) {
  const { data } = await api.patch(`/usuarios/${id}/activo`, { activo });
  return data;
}

export async function desbloquearUsuario(id) {
  const { data } = await api.patch(`/usuarios/${id}/desbloquear`);
  return data;
}

export async function restablecerContrasenaUsuario(id, contrasena) {
  const { data } = await api.patch(`/usuarios/${id}/restablecer-contrasena`, { contrasena });
  return data;
}
