import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, FileText, Info, KeyRound, Lock, Save, Trash2, User } from "lucide-react";
import { Input } from "../../componentes/Input";
import { Button } from "../../componentes/Button";
import { Badge } from "../../componentes/Badge";
import { Toast } from "../../componentes/Toast";
import { useToast } from "../../lib/useToast";
import { useSesion } from "../../lib/sesion";
import { Avatar } from "./Avatar";
import { CampoContrasena } from "./CampoContrasena";
import { actualizarMiPerfil, cambiarMiContrasena, obtenerMiPerfil } from "./usuarios.api";
import { prepararFoto } from "./fotoPerfil";
import {
  LIMITES_USUARIO,
  formatearDni,
  formatearFechaHora,
  limpiarDni,
  mensajeDeError,
  nombreCompleto,
  validarContrasenaNueva,
  validarDatosPersonales,
} from "./usuarios.constantes";

function formularioDesde(datos) {
  return {
    nombre: datos?.nombre ?? "",
    apellido: datos?.apellido ?? "",
    dni: datos?.dni ?? "",
    email: datos?.email ?? "",
  };
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return "—";
  return new Date(fechaISO).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Encabezado de cada tarjeta: ícono en un cuadrado, título y una línea de
// contexto (mismo bloque en "Datos personales" y "Contraseña").
function TituloTarjeta({ icono: Icono, titulo, subtitulo }) {
  return (
    <div className="flex items-start gap-3.5">
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-pino-100 text-pino">
        <Icono size={20} strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <h2 className="font-heading text-[24px] font-semibold leading-tight text-tinta">{titulo}</h2>
        <p className="mt-0.5 text-[13px] text-piedra">{subtitulo}</p>
      </div>
    </div>
  );
}

// Una regla de la contraseña nueva, con su tilde en vivo.
function Requisito({ cumplido, children }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[12.5px] ${cumplido ? "text-tinta" : "text-piedra"}`}>
      <span
        className={`flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full ${
          cumplido ? "bg-pino-100 text-pino" : "bg-neutro-300/70 text-transparent"
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </span>
      {children}
    </span>
  );
}

function FilaCuenta({ etiqueta, children }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borde py-2.5 last:border-0">
      <span className="text-[13px] text-piedra">{etiqueta}</span>
      <span className="text-right text-[13px] font-semibold text-tinta">{children}</span>
    </div>
  );
}

// Usuarios y Seguridad — "Mi perfil" como página propia del sistema (antes
// era un modal). Cada usuario edita acá sus datos personales, su foto y su
// contraseña. El nombre de usuario y el rol se muestran pero no se editan:
// eso es solo del administrador (pantalla Usuarios).
export function MiPerfilPage() {
  const { perfil, usuario, rolInfo, actualizarPerfil } = useSesion();
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();

  // Los datos frescos del backend (alta en el sistema, último acceso…). Si
  // todavía no llegaron, se usa lo que quedó guardado en la sesión.
  const perfilQuery = useQuery({ queryKey: ["mi-perfil"], queryFn: obtenerMiPerfil, retry: false });
  const datos = perfilQuery.data ?? perfil ?? { usuario };

  // ── Datos personales ──
  const [form, setForm] = useState(() => formularioDesde(datos));
  const [base, setBase] = useState(() => formularioDesde(datos));
  const [errores, setErrores] = useState({});
  const [cargadoDelServidor, setCargadoDelServidor] = useState(false);

  // Cuando llega la versión del backend por primera vez, se refresca el
  // formulario solo si la persona todavía no empezó a editarlo.
  if (perfilQuery.data && !cargadoDelServidor) {
    setCargadoDelServidor(true);
    const delServidor = formularioDesde(perfilQuery.data);
    setBase(delServidor);
    if (JSON.stringify(form) === JSON.stringify(base)) setForm(delServidor);
  }

  const hayCambios = JSON.stringify(form) !== JSON.stringify(base);

  function alGuardarPerfil(actualizado) {
    actualizarPerfil(actualizado);
    queryClient.setQueryData(["mi-perfil"], actualizado);
  }

  const mutacionDatos = useMutation({
    mutationFn: () =>
      actualizarMiPerfil({
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        dni: limpiarDni(form.dni),
        email: form.email.trim(),
      }),
    onSuccess: (actualizado) => {
      alGuardarPerfil(actualizado);
      const nuevo = formularioDesde(actualizado);
      setForm(nuevo);
      setBase(nuevo);
      mostrarToast("Tus datos se guardaron correctamente.");
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error, "No se pudieron guardar tus datos.");
      setErrores(error?.response?.status === 409 ? { dni: mensaje } : { general: mensaje });
    },
  });

  function cambiar(campo, valor) {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => ({ ...actual, [campo]: undefined, general: undefined }));
  }

  function descartar() {
    setForm(base);
    setErrores({});
  }

  function guardarDatos(evento) {
    evento.preventDefault();
    const nuevos = validarDatosPersonales(form);
    if (Object.keys(nuevos).length) {
      setErrores(nuevos);
      return;
    }
    mutacionDatos.mutate();
  }

  // ── Foto (se guarda al elegirla, con los datos ya guardados) ──
  const inputFotoRef = useRef(null);
  const [errorFoto, setErrorFoto] = useState("");
  const [procesandoFoto, setProcesandoFoto] = useState(false);

  const mutacionFoto = useMutation({
    mutationFn: (foto) =>
      actualizarMiPerfil({
        nombre: datos.nombre,
        apellido: datos.apellido,
        dni: datos.dni,
        email: datos.email ?? "",
        foto,
      }),
    onSuccess: (actualizado, foto) => {
      alGuardarPerfil(actualizado);
      mostrarToast(foto ? "Foto de perfil actualizada." : "Foto de perfil quitada.");
    },
    onError: (error) => setErrorFoto(mensajeDeError(error, "No se pudo guardar la foto.")),
  });

  async function elegirFoto(evento) {
    const archivo = evento.target.files?.[0];
    evento.target.value = ""; // permite volver a elegir el mismo archivo
    if (!archivo) return;
    setErrorFoto("");
    setProcesandoFoto(true);
    try {
      mutacionFoto.mutate(await prepararFoto(archivo));
    } catch (error) {
      setErrorFoto(error.message);
    } finally {
      setProcesandoFoto(false);
    }
  }

  const ocupadoConFoto = procesandoFoto || mutacionFoto.isPending;

  // ── Contraseña ──
  const [claves, setClaves] = useState({ actual: "", nueva: "", repetir: "" });
  const [erroresClave, setErroresClave] = useState({});

  const mutacionClave = useMutation({
    mutationFn: () => cambiarMiContrasena(claves.actual, claves.nueva),
    onSuccess: () => {
      setClaves({ actual: "", nueva: "", repetir: "" });
      mostrarToast("Contraseña actualizada. La próxima vez entrá con la nueva.");
    },
    onError: (error) => {
      const mensaje = mensajeDeError(error, "No se pudo cambiar la contraseña.");
      setErroresClave(mensaje.toLowerCase().includes("actual") ? { actual: mensaje } : { general: mensaje });
    },
  });

  function cambiarClave(campo, valor) {
    setClaves((actual) => ({ ...actual, [campo]: valor }));
    setErroresClave({});
  }

  const cumpleLargo = claves.nueva.length >= LIMITES_USUARIO.contrasenaMin;
  const cumpleDistinta = Boolean(claves.nueva) && claves.nueva !== claves.actual;
  const cumpleCoinciden = Boolean(claves.nueva) && claves.nueva === claves.repetir;

  function guardarClave(evento) {
    evento.preventDefault();
    const nuevos = {};
    if (!claves.actual) nuevos.actual = "Ingresá tu contraseña actual.";
    const errNueva = validarContrasenaNueva(claves.nueva, claves.repetir);
    if (errNueva.contrasena) nuevos.nueva = errNueva.contrasena;
    if (errNueva.repetir) nuevos.repetir = errNueva.repetir;
    if (!nuevos.nueva && claves.actual && claves.nueva === claves.actual) nuevos.nueva = "Tiene que ser distinta de la actual.";
    if (Object.keys(nuevos).length) {
      setErroresClave(nuevos);
      return;
    }
    mutacionClave.mutate();
  }

  const nombreVisible = nombreCompleto(datos) || usuario;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ubicación" className="text-[13px] text-piedra">
        <Link to="/" className="hover:text-tinta hover:underline">
          Inicio
        </Link>
        <span className="mx-2">/</span>
        <span className="font-semibold text-tinta">Mi perfil</span>
      </nav>

      <div>
        <h1 className="font-heading text-[38px] font-semibold leading-tight text-pino-900">Mi perfil</h1>
        <p className="mt-1 text-[14px] text-piedra">Tus datos personales, tu foto y la seguridad de tu cuenta.</p>
      </div>

      {/* ── Encabezado con foto ── */}
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-pino px-7 py-6 text-hueso">
        <div className="flex min-w-0 items-center gap-5">
          <div className="relative flex-none">
            <Avatar usuario={datos} tamano={104} className="ring-4 ring-hueso/15" />
            <button
              type="button"
              onClick={() => inputFotoRef.current?.click()}
              disabled={ocupadoConFoto}
              aria-label="Cambiar foto de perfil"
              title="Cambiar foto de perfil"
              className="absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-pino bg-laton-400 text-pino-900 transition-colors hover:bg-laton-300 disabled:cursor-wait"
            >
              <Camera size={15} />
            </button>
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-heading text-[30px] font-semibold leading-tight">{nombreVisible}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-laton-400 px-3 py-1 text-[12px] font-semibold text-pino-900">
                {rolInfo?.label ?? datos.rol}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-hueso/10 px-3 py-1 text-[12px] font-semibold text-hueso/90">
                <User size={12} /> {datos.usuario ?? usuario}
              </span>
              {datos.dni && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-hueso/10 px-3 py-1 text-[12px] font-semibold text-hueso/90">
                  <FileText size={12} /> DNI {formatearDni(datos.dni)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={elegirFoto}
            aria-label="Elegir foto de perfil"
          />
          <div className="flex flex-wrap justify-end gap-2">
            {datos.foto && (
              <button
                type="button"
                onClick={() => mutacionFoto.mutate(null)}
                disabled={ocupadoConFoto}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 font-heading text-[13px] font-semibold text-hueso/70 transition-colors hover:bg-hueso/10 hover:text-hueso disabled:opacity-50"
              >
                <Trash2 size={14} /> Quitar foto
              </button>
            )}
            <button
              type="button"
              onClick={() => inputFotoRef.current?.click()}
              disabled={ocupadoConFoto}
              className="cursor-pointer rounded-md border border-hueso/40 px-4 py-2 font-heading text-[14px] font-semibold text-hueso transition-colors hover:bg-hueso/10 disabled:cursor-wait disabled:opacity-60"
            >
              {ocupadoConFoto ? "Subiendo…" : datos.foto ? "Cambiar foto" : "Subir foto"}
            </button>
          </div>
          <span className="text-[11.5px] text-hueso/60">JPG o PNG · hasta 2 MB · se recorta cuadrada</span>
          {errorFoto && <span className="text-[12px] font-semibold text-laton-300">{errorFoto}</span>}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          {/* ── Datos personales ── */}
          <form onSubmit={guardarDatos} noValidate className="overflow-hidden rounded-2xl border border-borde bg-white">
            <div className="flex flex-col gap-5 px-7 py-6">
              <TituloTarjeta
                icono={User}
                titulo="Datos personales"
                subtitulo="Se muestran en el sistema y en los comprobantes que generes."
              />
              {errores.general && <p className="text-sm text-error-texto">{errores.general}</p>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  placeholder="nombre@hotel.com (opcional)"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-borde bg-hueso/60 px-7 py-4">
              <Button
                type="button"
                variante="secundario"
                disabled={!hayCambios || mutacionDatos.isPending}
                onClick={descartar}
              >
                Descartar cambios
              </Button>
              <Button type="submit" icono={Save} cargando={mutacionDatos.isPending} disabled={!hayCambios}>
                Guardar cambios
              </Button>
            </div>
          </form>

          {/* ── Contraseña ── */}
          <form onSubmit={guardarClave} noValidate className="overflow-hidden rounded-2xl border border-borde bg-white">
            <div className="flex flex-col gap-5 px-7 py-6">
              <TituloTarjeta icono={Lock} titulo="Contraseña" subtitulo="Por seguridad, primero ingresá tu contraseña actual." />
              {erroresClave.general && <p className="text-sm text-error-texto">{erroresClave.general}</p>}
              <CampoContrasena
                label="Contraseña actual"
                value={claves.actual}
                onChange={(e) => cambiarClave("actual", e.target.value)}
                error={erroresClave.actual}
                autoComplete="current-password"
                maxLength={LIMITES_USUARIO.contrasenaMax}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CampoContrasena
                  label="Nueva contraseña"
                  value={claves.nueva}
                  onChange={(e) => cambiarClave("nueva", e.target.value)}
                  error={erroresClave.nueva}
                  autoComplete="new-password"
                  maxLength={LIMITES_USUARIO.contrasenaMax}
                  placeholder={`Mínimo ${LIMITES_USUARIO.contrasenaMin} caracteres`}
                />
                <CampoContrasena
                  label="Repetir nueva contraseña"
                  value={claves.repetir}
                  onChange={(e) => cambiarClave("repetir", e.target.value)}
                  error={erroresClave.repetir}
                  autoComplete="new-password"
                  maxLength={LIMITES_USUARIO.contrasenaMax}
                />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Requisitos de la contraseña">
                <Requisito cumplido={cumpleLargo}>Al menos {LIMITES_USUARIO.contrasenaMin} caracteres</Requisito>
                <Requisito cumplido={cumpleDistinta}>Distinta a la actual</Requisito>
                <Requisito cumplido={cumpleCoinciden}>Ambas coinciden</Requisito>
              </div>
            </div>
            <div className="flex justify-end border-t border-borde bg-hueso/60 px-7 py-4">
              <Button type="submit" icono={KeyRound} cargando={mutacionClave.isPending}>
                Actualizar contraseña
              </Button>
            </div>
          </form>
        </div>

        {/* ── Columna derecha ── */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-borde bg-white px-6 py-5">
            <h3 className="mb-1.5 font-body text-[15px] font-semibold text-tinta">Tu cuenta</h3>
            <FilaCuenta etiqueta="Usuario">
              <span className="font-mono font-medium">{datos.usuario ?? usuario}</span>
            </FilaCuenta>
            <FilaCuenta etiqueta="Rol">
              <Badge variante="alerta">{rolInfo?.label ?? datos.rol}</Badge>
            </FilaCuenta>
            <FilaCuenta etiqueta="Estado">
              <Badge variante={datos.activo === false ? "neutro" : "ok"}>{datos.activo === false ? "Inactiva" : "Activa"}</Badge>
            </FilaCuenta>
            <FilaCuenta etiqueta="Alta en el sistema">{formatearFecha(datos.creadoEn)}</FilaCuenta>
            <FilaCuenta etiqueta="Último acceso">{datos.ultimoIngreso ? formatearFechaHora(datos.ultimoIngreso) : "—"}</FilaCuenta>
          </div>
          <div className="flex gap-3 rounded-2xl bg-pino-100 px-5 py-4 text-[13px] leading-relaxed text-pino-800">
            <Info size={17} className="mt-0.5 flex-none" />
            <p>El usuario y el rol los asigna un administrador. Si necesitás cambiarlos, pedíselo desde tu área.</p>
          </div>
        </aside>
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
