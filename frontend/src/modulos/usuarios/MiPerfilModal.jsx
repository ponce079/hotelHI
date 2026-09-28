import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, KeyRound, Save, Trash2, X } from "lucide-react";
import { Modal } from "../../componentes/Modal";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { useSesion } from "../../lib/sesion";
import { Avatar } from "./Avatar";
import { CampoContrasena } from "./CampoContrasena";
import { actualizarMiPerfil, cambiarMiContrasena } from "./usuarios.api";
import { prepararFoto } from "./fotoPerfil";
import {
  LIMITES_USUARIO,
  formatearDni,
  limpiarDni,
  mensajeDeError,
  nombreCompleto,
  validarContrasenaNueva,
  validarDatosPersonales,
} from "./usuarios.constantes";

// "Mi perfil": cada usuario edita sus propios datos personales, su foto y
// su contraseña. El nombre de usuario y el rol se muestran pero no se
// pueden cambiar desde acá (eso es solo del administrador).
export function MiPerfilModal({ onClose }) {
  const { perfil, usuario, rolInfo, actualizarPerfil } = useSesion();
  const datosIniciales = perfil ?? { usuario, nombre: "", apellido: "", dni: "", email: "", foto: null };

  const [form, setForm] = useState({
    nombre: datosIniciales.nombre ?? "",
    apellido: datosIniciales.apellido ?? "",
    dni: datosIniciales.dni ?? "",
    email: datosIniciales.email ?? "",
  });
  const [foto, setFoto] = useState(datosIniciales.foto ?? null);
  const [errores, setErrores] = useState({});
  const [avisoPerfil, setAvisoPerfil] = useState("");
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const inputFotoRef = useRef(null);

  const [claves, setClaves] = useState({ actual: "", nueva: "", repetir: "" });
  const [erroresClave, setErroresClave] = useState({});
  const [avisoClave, setAvisoClave] = useState("");

  const mutacionPerfil = useMutation({
    mutationFn: () =>
      actualizarMiPerfil({
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        dni: limpiarDni(form.dni),
        email: form.email.trim(),
        foto,
      }),
    onSuccess: (actualizado) => {
      actualizarPerfil(actualizado);
      setAvisoPerfil("Tus datos se guardaron correctamente.");
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error, "No se pudieron guardar tus datos.");
      setErrores(error?.response?.status === 409 ? { dni: mensaje } : { general: mensaje });
    },
  });

  const mutacionClave = useMutation({
    mutationFn: () => cambiarMiContrasena(claves.actual, claves.nueva),
    onSuccess: () => {
      setClaves({ actual: "", nueva: "", repetir: "" });
      setAvisoClave("Contraseña actualizada. La próxima vez entrá con la nueva.");
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error, "No se pudo cambiar la contraseña.");
      setErroresClave(mensaje.toLowerCase().includes("actual") ? { actual: mensaje } : { general: mensaje });
    },
  });

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => ({ ...actual, [campo]: undefined, general: undefined }));
    setAvisoPerfil("");
  }

  function cambiarClave(campo, valor) {
    setClaves((actual) => ({ ...actual, [campo]: valor }));
    setErroresClave({});
    setAvisoClave("");
  }

  async function elegirFoto(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    setProcesandoFoto(true);
    setErrores((actual) => ({ ...actual, foto: undefined, general: undefined }));
    setAvisoPerfil("");
    try {
      setFoto(await prepararFoto(archivo));
    } catch (error) {
      setErrores((actual) => ({ ...actual, foto: error.message }));
    } finally {
      setProcesandoFoto(false);
    }
  }

  function quitarFoto() {
    setFoto(null);
    setErrores((actual) => ({ ...actual, foto: undefined }));
    setAvisoPerfil("");
  }

  function guardarPerfil(evento) {
    evento.preventDefault();
    const nuevos = validarDatosPersonales(form);
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacionPerfil.mutate();
  }

  function guardarClave(evento) {
    evento.preventDefault();
    const nuevos = {};
    if (!claves.actual) nuevos.actual = "Ingresá tu contraseña actual.";
    const errNueva = validarContrasenaNueva(claves.nueva, claves.repetir);
    if (errNueva.contrasena) nuevos.nueva = errNueva.contrasena;
    if (errNueva.repetir) nuevos.repetir = errNueva.repetir;
    if (!nuevos.nueva && claves.actual && claves.nueva === claves.actual) {
      nuevos.nueva = "Tiene que ser distinta de la actual.";
    }
    if (Object.keys(nuevos).length) {
      setErroresClave(nuevos);
      return;
    }
    mutacionClave.mutate();
  }

  const vistaPrevia = { ...datosIniciales, ...form, foto };

  return (
    <Modal titulo="Mi perfil" subtitulo="Tus datos personales, tu foto y tu contraseña" onClose={onClose} ancho="max-w-2xl">
      {/* ── Datos personales y foto ── */}
      <form onSubmit={guardarPerfil} noValidate>
        <div className="flex flex-col gap-5 px-6 py-5">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar usuario={vistaPrevia} tamano={76} />
            <div className="flex min-w-0 flex-col gap-2">
              <div>
                <div className="font-heading text-[18px] font-semibold text-tinta">{nombreCompleto(vistaPrevia) || usuario}</div>
                <div className="text-[12.5px] text-piedra">
                  Usuario <span className="font-mono text-tinta">{usuario}</span> · {rolInfo?.label}
                  {perfil?.dni && <> · DNI {formatearDni(perfil.dni)}</>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={inputFotoRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={elegirFoto}
                  aria-label="Elegir foto de perfil"
                />
                <Button
                  type="button"
                  variante="secundario"
                  tamano="fila"
                  icono={Camera}
                  cargando={procesandoFoto}
                  onClick={() => inputFotoRef.current?.click()}
                >
                  {foto ? "Cambiar foto" : "Subir foto"}
                </Button>
                {foto && (
                  <Button type="button" variante="fantasma" tamano="fila" icono={Trash2} onClick={quitarFoto}>
                    Quitar foto
                  </Button>
                )}
              </div>
              <span className="text-[11.5px] text-piedra">JPG o PNG, hasta 2 MB. Se recorta cuadrada automáticamente.</span>
              {errores.foto && <span className="text-[11.5px] text-error-texto">{errores.foto}</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {errores.general && <p className="text-sm text-error-texto sm:col-span-2">{errores.general}</p>}
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
          </div>
          {avisoPerfil && <p className="rounded-md bg-exito-suave px-3 py-2 text-[12.5px] font-semibold text-exito">{avisoPerfil}</p>}
          <div className="flex justify-end">
            <Button type="submit" icono={Save} cargando={mutacionPerfil.isPending} disabled={procesandoFoto}>
              Guardar mis datos
            </Button>
          </div>
        </div>
      </form>

      {/* ── Contraseña ── */}
      <form onSubmit={guardarClave} noValidate className="border-t border-borde">
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <h4 className="font-heading text-[16px] font-semibold text-tinta">Cambiar contraseña</h4>
            <p className="text-[12.5px] text-piedra">Por seguridad te pedimos la contraseña actual antes de poner una nueva.</p>
          </div>
          {erroresClave.general && <p className="text-sm text-error-texto">{erroresClave.general}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CampoContrasena
              label="Contraseña actual"
              value={claves.actual}
              onChange={(e) => cambiarClave("actual", e.target.value)}
              error={erroresClave.actual}
              autoComplete="current-password"
              maxLength={LIMITES_USUARIO.contrasenaMax}
            />
            <CampoContrasena
              label="Nueva contraseña"
              value={claves.nueva}
              onChange={(e) => cambiarClave("nueva", e.target.value)}
              error={erroresClave.nueva}
              autoComplete="new-password"
              maxLength={LIMITES_USUARIO.contrasenaMax}
              placeholder={`Mínimo ${LIMITES_USUARIO.contrasenaMin}`}
            />
            <CampoContrasena
              label="Repetir nueva"
              value={claves.repetir}
              onChange={(e) => cambiarClave("repetir", e.target.value)}
              error={erroresClave.repetir}
              autoComplete="new-password"
              maxLength={LIMITES_USUARIO.contrasenaMax}
            />
          </div>
          {avisoClave && <p className="rounded-md bg-exito-suave px-3 py-2 text-[12.5px] font-semibold text-exito">{avisoClave}</p>}
          <div className="flex justify-end">
            <Button type="submit" variante="secundario" icono={KeyRound} cargando={mutacionClave.isPending}>
              Cambiar contraseña
            </Button>
          </div>
        </div>
      </form>

      <div className="flex justify-end border-t border-borde px-6 py-4">
        <Button type="button" variante="secundario" icono={X} onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Modal>
  );
}
