import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, X, UserPlus } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { ROLES } from "../../lib/sesion";
import { CampoContrasena } from "./CampoContrasena";
import { crearUsuario, actualizarUsuario } from "./usuarios.api";
import {
  LIMITES_USUARIO,
  limpiarDni,
  mensajeDeError,
  validarContrasenaNueva,
  validarDatosPersonales,
  validarNombreUsuario,
} from "./usuarios.constantes";

const VACIO = { usuario: "", nombre: "", apellido: "", dni: "", email: "", rol: "", contrasena: "", repetir: "" };

// Alta y edición de un usuario (solo admin). En la edición el nombre de
// usuario queda fijo y la contraseña no se toca desde acá (para eso está
// "Restablecer contraseña").
export function UsuarioModal({ usuario, esUnoMismo = false, onClose, onExito }) {
  const editando = Boolean(usuario);
  const [form, setForm] = useState(
    usuario
      ? { ...VACIO, usuario: usuario.usuario, nombre: usuario.nombre, apellido: usuario.apellido, dni: usuario.dni, email: usuario.email ?? "", rol: usuario.rol }
      : VACIO
  );
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => {
      const datos = {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        dni: limpiarDni(form.dni),
        email: form.email.trim(),
        rol: form.rol,
      };
      return editando
        ? actualizarUsuario(usuario.id, datos)
        : crearUsuario({ ...datos, usuario: form.usuario.trim().toLowerCase(), contrasena: form.contrasena });
    },
    onSuccess: (guardado) => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      onExito(editando ? `Usuario ${guardado.usuario} actualizado.` : `Usuario ${guardado.usuario} creado. Ya puede iniciar sesión.`, guardado);
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error, "No se pudo guardar el usuario.");
      if (error?.response?.status === 409) {
        setErrores(mensaje.toLowerCase().includes("dni") ? { dni: mensaje } : { usuario: mensaje });
      } else {
        setErrores({ general: mensaje });
      }
    },
  });

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => ({ ...actual, [campo]: undefined, general: undefined }));
  }

  function validar() {
    const nuevos = validarDatosPersonales(form);
    if (!form.rol) nuevos.rol = "Elegí el rol del usuario.";
    if (!editando) {
      const errorUsuario = validarNombreUsuario(form.usuario);
      if (errorUsuario) nuevos.usuario = errorUsuario;
      Object.assign(nuevos, validarContrasenaNueva(form.contrasena, form.repetir));
    }
    return nuevos;
  }

  function handleSubmit(evento) {
    evento.preventDefault();
    const nuevos = validar();
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal
      titulo={editando ? `Editar usuario ${usuario.usuario}` : "Nuevo usuario"}
      subtitulo={editando ? "Datos personales y rol del usuario" : "El usuario va a poder entrar con este usuario y contraseña"}
      onClose={onClose}
      ancho="max-w-2xl"
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          {errores.general && <p className="text-sm text-error-texto sm:col-span-2">{errores.general}</p>}

          <Input
            label="Usuario (para iniciar sesión) *"
            value={form.usuario}
            onChange={(e) => cambiar("usuario", e.target.value.toLowerCase().replace(/\s/g, ""))}
            error={errores.usuario}
            maxLength={LIMITES_USUARIO.usuarioMax}
            placeholder="ej. ana.recepcion"
            autoComplete="off"
            disabled={editando}
            className={editando ? "cursor-not-allowed bg-hueso text-tinta/60" : ""}
          />
          <Select
            label="Rol *"
            value={form.rol}
            onChange={(e) => cambiar("rol", e.target.value)}
            error={errores.rol}
            disabled={esUnoMismo}
          >
            <option value="">Elegí un rol…</option>
            {Object.entries(ROLES).map(([valor, info]) => (
              <option key={valor} value={valor}>
                {info.label}
              </option>
            ))}
          </Select>
          {form.rol && ROLES[form.rol] && (
            <p className="-mt-2 text-[12px] text-piedra sm:col-span-2">
              <span className="font-semibold text-tinta">{ROLES[form.rol].label}:</span> {ROLES[form.rol].descripcion}
              {esUnoMismo && " — Tu propio rol no se puede cambiar: si hace falta, pedíselo a otro administrador."}
            </p>
          )}

          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
            error={errores.nombre}
            maxLength={LIMITES_USUARIO.nombre}
          />
          <Input
            label="Apellido *"
            value={form.apellido}
            onChange={(e) => cambiar("apellido", e.target.value)}
            error={errores.apellido}
            maxLength={LIMITES_USUARIO.apellido}
          />
          <Input
            label="DNI *"
            value={form.dni}
            onChange={(e) => cambiar("dni", e.target.value)}
            error={errores.dni}
            inputMode="numeric"
            maxLength={10}
            placeholder="Solo números"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => cambiar("email", e.target.value)}
            error={errores.email}
            maxLength={LIMITES_USUARIO.email}
            placeholder="opcional"
          />

          {!editando && (
            <>
              <CampoContrasena
                label="Contraseña *"
                value={form.contrasena}
                onChange={(e) => cambiar("contrasena", e.target.value)}
                error={errores.contrasena}
                maxLength={LIMITES_USUARIO.contrasenaMax}
                autoComplete="new-password"
                placeholder={`Mínimo ${LIMITES_USUARIO.contrasenaMin} caracteres`}
              />
              <CampoContrasena
                label="Repetir contraseña *"
                value={form.repetir}
                onChange={(e) => cambiar("repetir", e.target.value)}
                error={errores.repetir}
                maxLength={LIMITES_USUARIO.contrasenaMax}
                autoComplete="new-password"
              />
              <p className="-mt-2 text-[12px] text-piedra sm:col-span-2">
                Pasale esta contraseña al usuario: después la puede cambiar él mismo desde “Mi perfil”.
              </p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icono={editando ? Save : UserPlus} cargando={mutacion.isPending}>
            {editando ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
