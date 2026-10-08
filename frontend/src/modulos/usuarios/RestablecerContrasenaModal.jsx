import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Button } from "../../componentes/Button";
import { CampoContrasena } from "./CampoContrasena";
import { restablecerContrasenaUsuario } from "./usuarios.api";
import { LIMITES_USUARIO, mensajeDeError, nombreCompleto, validarContrasenaInicial } from "./usuarios.constantes";

// Para cuando alguien se olvida la contraseña: el admin le pone una nueva
// (también lo desbloquea) y se la pasa.
export function RestablecerContrasenaModal({ usuario, onClose, onExito }) {
  const [contrasena, setContrasena] = useState("");
  const [repetir, setRepetir] = useState("");
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const mutacion = useMutation({
    mutationFn: () => restablecerContrasenaUsuario(usuario.id, contrasena),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      onExito(`Contraseña de ${usuario.usuario} restablecida.`);
    },
    onError: (error) => setErrores({ general: mensajeDeError(error, "No se pudo restablecer la contraseña.") }),
  });

  function handleSubmit(evento) {
    evento.preventDefault();
    const nuevos = validarContrasenaInicial(contrasena, repetir);
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacion.mutate();
  }

  return (
    <Modal titulo="Restablecer contraseña" subtitulo={`${nombreCompleto(usuario)} · ${usuario.usuario}`} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-4 px-6 py-5">
          {errores.general && <p className="text-sm text-error-texto">{errores.general}</p>}
          <CampoContrasena
            label="Nueva contraseña *"
            value={contrasena}
            onChange={(e) => {
              setContrasena(e.target.value);
              setErrores({});
            }}
            error={errores.contrasena}
            maxLength={LIMITES_USUARIO.contrasenaMax}
            autoComplete="new-password"
            placeholder={`Mínimo ${LIMITES_USUARIO.contrasenaInicialMin} caracteres`}
          />
          <CampoContrasena
            label="Repetir contraseña *"
            value={repetir}
            onChange={(e) => {
              setRepetir(e.target.value);
              setErrores({});
            }}
            error={errores.repetir}
            maxLength={LIMITES_USUARIO.contrasenaMax}
            autoComplete="new-password"
          />
          <p className="text-[12px] text-piedra">
            Si el usuario estaba bloqueado por intentos fallidos, también queda desbloqueado. Pasale la contraseña nueva y
            pedile que la cambie desde “Mi perfil”.
          </p>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icono={KeyRound} cargando={mutacion.isPending}>
            Restablecer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
