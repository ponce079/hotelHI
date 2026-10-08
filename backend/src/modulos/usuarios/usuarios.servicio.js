// Usuarios y Seguridad — lógica de negocio (no conoce HTTP).
//
// Reparto de permisos:
// - Login: cualquiera, con usuario y contraseña reales (bloqueo después de
//   5 intentos fallidos seguidos, por 15 minutos).
// - Administrador: da de alta usuarios, les asigna el rol, los edita, los
//   desactiva/reactiva, los desbloquea y les restablece la contraseña.
// - Cada usuario: edita sus propios datos personales (nombre, apellido,
//   DNI, email, foto) y cambia su contraseña (pidiendo la actual). Nunca su
//   rol ni su nombre de usuario: eso es solo del administrador.

const prisma = require("../../lib/prisma");
const {
  ROL_ADMIN,
  ROLES_USUARIO,
  ETIQUETAS_ROL,
  MAX_INTENTOS_FALLIDOS,
  MINUTOS_BLOQUEO,
  LIMITES_USUARIO,
  REGEX_USUARIO,
  REGEX_DNI,
  REGEX_EMAIL,
  REGEX_FOTO,
  ADMIN_INICIAL,
} = require("./usuarios.constantes");
const { hashearContrasena, verificarContrasena, firmarToken } = require("./usuarios.seguridad");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

// ── Validaciones ────────────────────────────────────────────

function textoObligatorio(valor, campo, maximo) {
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!texto) throw new ErrorDeNegocio(`${campo} es obligatorio.`);
  if (texto.length > maximo) throw new ErrorDeNegocio(`${campo} no puede superar los ${maximo} caracteres.`);
  return texto;
}

function normalizarNombreUsuario(valor) {
  const usuario = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  if (!usuario) throw new ErrorDeNegocio("El usuario es obligatorio.");
  if (
    usuario.length < LIMITES_USUARIO.usuarioMin ||
    usuario.length > LIMITES_USUARIO.usuarioMax ||
    !REGEX_USUARIO.test(usuario)
  ) {
    throw new ErrorDeNegocio(
      `El usuario debe tener entre ${LIMITES_USUARIO.usuarioMin} y ${LIMITES_USUARIO.usuarioMax} caracteres: letras minúsculas, números, punto, guion o guion bajo (sin espacios).`
    );
  }
  return usuario;
}

function normalizarDni(valor) {
  // Se aceptan puntos o espacios al tipear ("30.111.222"), se guarda limpio.
  const dni = String(valor ?? "").replace(/[.\s]/g, "");
  if (!dni) throw new ErrorDeNegocio("El DNI es obligatorio.");
  if (!REGEX_DNI.test(dni)) throw new ErrorDeNegocio("El DNI debe tener 7 u 8 números.");
  return dni;
}

function normalizarEmail(valor) {
  const email = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  if (!email) return null;
  if (email.length > LIMITES_USUARIO.email) {
    throw new ErrorDeNegocio(`El email no puede superar los ${LIMITES_USUARIO.email} caracteres.`);
  }
  if (!REGEX_EMAIL.test(email)) throw new ErrorDeNegocio("El email no tiene un formato válido.");
  return email;
}

function validarRol(valor) {
  if (!ROLES_USUARIO.includes(valor)) throw new ErrorDeNegocio("Elegí un rol válido para el usuario.");
  return valor;
}

function validarContrasenaNueva(valor, campo = "La contraseña") {
  if (typeof valor !== "string" || valor.length < LIMITES_USUARIO.contrasenaMin) {
    throw new ErrorDeNegocio(`${campo} debe tener al menos ${LIMITES_USUARIO.contrasenaMin} caracteres.`);
  }
  if (valor.length > LIMITES_USUARIO.contrasenaMax) {
    throw new ErrorDeNegocio(`${campo} no puede superar los ${LIMITES_USUARIO.contrasenaMax} caracteres.`);
  }
  return valor;
}

// La contraseña que el administrador escribe al dar de alta o al restablecer: mínimo 10 caracteres (no hay
// contraseñas por defecto en el sistema).
function validarContrasenaInicial(valor, campo = "La contraseña") {
  if (typeof valor !== "string" || valor.length < LIMITES_USUARIO.contrasenaInicialMin) {
    throw new ErrorDeNegocio(`${campo} inicial debe tener al menos ${LIMITES_USUARIO.contrasenaInicialMin} caracteres.`);
  }
  return validarContrasenaNueva(valor, campo);
}

function normalizarFoto(valor) {
  if (valor === null || valor === "") return null;
  if (typeof valor !== "string" || !REGEX_FOTO.test(valor)) {
    throw new ErrorDeNegocio("La foto tiene que ser una imagen JPG o PNG.");
  }
  if (valor.length > LIMITES_USUARIO.fotoCaracteres) {
    throw new ErrorDeNegocio("La foto es demasiado pesada. Probá con otra imagen.");
  }
  return valor;
}

function normalizarDatosPersonales(data) {
  return {
    nombre: textoObligatorio(data?.nombre, "El nombre", LIMITES_USUARIO.nombre),
    apellido: textoObligatorio(data?.apellido, "El apellido", LIMITES_USUARIO.apellido),
    dni: normalizarDni(data?.dni),
    email: normalizarEmail(data?.email),
  };
}

function idValido(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new ErrorDeNegocio("El usuario no existe.", 404);
  return id;
}

// ── Helpers ─────────────────────────────────────────────────

function estaBloqueado(usuario, ahora = new Date()) {
  return Boolean(usuario.bloqueadoHasta && new Date(usuario.bloqueadoHasta) > ahora);
}

function minutosRestantes(usuario, ahora = new Date()) {
  return Math.max(1, Math.ceil((new Date(usuario.bloqueadoHasta) - ahora) / 60000));
}

// Lo único que sale del backend sobre un usuario: nunca el passwordHash.
function formatearUsuario(u) {
  return {
    id: u.id,
    usuario: u.usuario,
    nombre: u.nombre,
    apellido: u.apellido,
    dni: u.dni,
    email: u.email,
    rol: u.rol,
    foto: u.foto ?? null,
    activo: u.activo,
    bloqueado: estaBloqueado(u),
    bloqueadoHasta: estaBloqueado(u) ? u.bloqueadoHasta : null,
    ultimoIngreso: u.ultimoIngreso ?? null,
    creadoEn: u.creadoEn,
  };
}

// Traduce el choque de un índice único (P2002) a un mensaje claro. Las
// validaciones previas ya lo evitan en el caso normal; esto cubre la
// carrera de dos altas simultáneas con el mismo usuario o DNI.
function traducirDuplicado(err) {
  if (err?.code !== "P2002") return err;
  const destino = JSON.stringify(err.meta?.target ?? "");
  if (destino.includes("dni")) return new ErrorDeNegocio("Ya existe un usuario con ese DNI.", 409);
  return new ErrorDeNegocio("Ese nombre de usuario ya está en uso.", 409);
}

async function verificarDniLibre(dni, excluirId = null) {
  const existente = await prisma.usuario.findUnique({ where: { dni } });
  if (existente && existente.id !== excluirId) throw new ErrorDeNegocio("Ya existe un usuario con ese DNI.", 409);
}

async function buscarUsuario(id) {
  const usuario = await prisma.usuario.findUnique({ where: { id: idValido(id) } });
  if (!usuario) throw new ErrorDeNegocio("El usuario no existe.", 404);
  return usuario;
}

// ── Login ───────────────────────────────────────────────────

// `rol` (opcional): el perfil que se eligió en la tarjeta del login. Si
// viene, tiene que coincidir con el rol que el administrador le asignó al
// usuario — la tarjeta ya no "da" el rol, solo confirma con cuál se entra.
async function iniciarSesion({ usuario, contrasena, rol } = {}) {
  const nombreUsuario = typeof usuario === "string" ? usuario.trim().toLowerCase() : "";
  if (!nombreUsuario || typeof contrasena !== "string" || !contrasena) {
    throw new ErrorDeNegocio("Ingresá tu usuario y tu contraseña.");
  }

  const encontrado = await prisma.usuario.findUnique({ where: { usuario: nombreUsuario } });
  // Mismo mensaje para "no existe" y "contraseña incorrecta": no le
  // confirmamos a nadie qué usuarios existen.
  if (!encontrado) throw new ErrorDeNegocio("Usuario o contraseña incorrectos.", 401);

  const ahora = new Date();
  if (estaBloqueado(encontrado, ahora)) {
    const minutos = minutosRestantes(encontrado, ahora);
    throw new ErrorDeNegocio(
      `Usuario bloqueado por demasiados intentos fallidos. Probá de nuevo en ${minutos} minuto${minutos === 1 ? "" : "s"} o pedile al administrador que lo desbloquee.`,
      423
    );
  }

  const correcta = await verificarContrasena(contrasena, encontrado.passwordHash);
  if (!correcta) {
    // Si había un bloqueo que ya venció, el conteo arranca de cero.
    const previos = encontrado.bloqueadoHasta ? 0 : encontrado.intentosFallidos;
    const intentos = previos + 1;
    if (intentos >= MAX_INTENTOS_FALLIDOS) {
      await prisma.usuario.update({
        where: { id: encontrado.id },
        data: { intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + MINUTOS_BLOQUEO * 60000) },
      });
      throw new ErrorDeNegocio(
        `Contraseña incorrecta. Superaste los ${MAX_INTENTOS_FALLIDOS} intentos: el usuario quedó bloqueado por ${MINUTOS_BLOQUEO} minutos.`,
        423
      );
    }
    await prisma.usuario.update({
      where: { id: encontrado.id },
      data: { intentosFallidos: intentos, bloqueadoHasta: null },
    });
    const quedan = MAX_INTENTOS_FALLIDOS - intentos;
    throw new ErrorDeNegocio(
      `Usuario o contraseña incorrectos. Te quedan ${quedan} intento${quedan === 1 ? "" : "s"} antes del bloqueo.`,
      401
    );
  }

  if (!encontrado.activo) {
    throw new ErrorDeNegocio("Tu usuario está desactivado. Consultá con el administrador.", 403);
  }

  // Contraseña correcta pero perfil equivocado: no cuenta como intento
  // fallido (no es alguien probando contraseñas), solo se le avisa.
  if (rol !== undefined && rol !== null && rol !== "" && rol !== encontrado.rol) {
    const elegido = ETIQUETAS_ROL[rol] ?? rol;
    const suyo = ETIQUETAS_ROL[encontrado.rol] ?? encontrado.rol;
    throw new ErrorDeNegocio(
      `Tu usuario no tiene el perfil "${elegido}". Elegí el perfil "${suyo}" para entrar.`,
      403
    );
  }

  const actualizado = await prisma.usuario.update({
    where: { id: encontrado.id },
    data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoIngreso: ahora },
  });

  return {
    token: firmarToken({ id: actualizado.id, rol: actualizado.rol }),
    usuario: formatearUsuario(actualizado),
  };
}

// Para el middleware de sesión: el usuario vivo en la base (así un usuario
// desactivado o con el rol cambiado pierde el acceso en el acto, sin
// esperar a que venza su token).
async function obtenerUsuarioParaSesion(id) {
  if (!Number.isInteger(id)) return null;
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario || !usuario.activo) return null;
  return usuario;
}

async function obtenerPerfil(id) {
  return formatearUsuario(await buscarUsuario(id));
}

// ── Administración (solo admin) ─────────────────────────────

async function listarUsuarios(filtros = {}) {
  const where = {};
  if (filtros.rol && ROLES_USUARIO.includes(filtros.rol)) where.rol = filtros.rol;
  if (filtros.estado === "activos") where.activo = true;
  if (filtros.estado === "inactivos") where.activo = false;

  const usuarios = await prisma.usuario.findMany({ where, orderBy: [{ apellido: "asc" }, { nombre: "asc" }] });

  const buscar = typeof filtros.buscar === "string" ? filtros.buscar.trim().toLowerCase() : "";
  const filtrados = buscar
    ? usuarios.filter((u) =>
        [u.usuario, u.nombre, u.apellido, `${u.nombre} ${u.apellido}`, u.dni, u.email ?? ""].some((valor) =>
          String(valor).toLowerCase().includes(buscar)
        )
      )
    : usuarios;

  const lista = filtrados.map(formatearUsuario);
  return filtros.estado === "bloqueados" ? lista.filter((u) => u.bloqueado) : lista;
}

async function crearUsuario(data = {}) {
  const usuario = normalizarNombreUsuario(data.usuario);
  const personales = normalizarDatosPersonales(data);
  const rol = validarRol(data.rol);
  const contrasena = validarContrasenaInicial(data.contrasena);

  const existente = await prisma.usuario.findUnique({ where: { usuario } });
  if (existente) throw new ErrorDeNegocio("Ese nombre de usuario ya está en uso.", 409);
  await verificarDniLibre(personales.dni);

  try {
    const creado = await prisma.usuario.create({
      data: { usuario, ...personales, rol, passwordHash: await hashearContrasena(contrasena), activo: true },
    });
    return formatearUsuario(creado);
  } catch (err) {
    throw traducirDuplicado(err);
  }
}

// El nombre de usuario no se edita: queda registrado como "quién lo hizo"
// en otras tablas (registradoPor, resueltaPor…), cambiarlo rompería ese
// rastro.
async function actualizarUsuario(id, data = {}, actorId) {
  const existente = await buscarUsuario(id);
  const personales = normalizarDatosPersonales(data);
  const rol = validarRol(data.rol);

  // Un admin no puede cambiarse su propio rol: además de evitar quedarse
  // afuera por error, garantiza que siempre quede al menos un admin activo
  // (el que está operando).
  if (existente.id === actorId && rol !== existente.rol) {
    throw new ErrorDeNegocio("No podés cambiar tu propio rol. Pedíselo a otro administrador.");
  }

  await verificarDniLibre(personales.dni, existente.id);

  try {
    const actualizado = await prisma.usuario.update({ where: { id: existente.id }, data: { ...personales, rol } });
    return formatearUsuario(actualizado);
  } catch (err) {
    throw traducirDuplicado(err);
  }
}

async function cambiarActivo(id, activo, actorId) {
  if (typeof activo !== "boolean") throw new ErrorDeNegocio("Indicá si el usuario queda activo o no.");
  const existente = await buscarUsuario(id);
  if (existente.id === actorId && !activo) {
    throw new ErrorDeNegocio("No podés desactivar tu propio usuario.");
  }
  const actualizado = await prisma.usuario.update({ where: { id: existente.id }, data: { activo } });
  return formatearUsuario(actualizado);
}

async function desbloquearUsuario(id) {
  const existente = await buscarUsuario(id);
  const actualizado = await prisma.usuario.update({
    where: { id: existente.id },
    data: { intentosFallidos: 0, bloqueadoHasta: null },
  });
  return formatearUsuario(actualizado);
}

// Para cuando alguien se olvida la contraseña: el admin le pone una nueva
// y se la pasa; después el usuario la cambia desde "Mi perfil".
async function restablecerContrasena(id, contrasena) {
  const existente = await buscarUsuario(id);
  const nueva = validarContrasenaInicial(contrasena, "La nueva contraseña");
  const actualizado = await prisma.usuario.update({
    where: { id: existente.id },
    data: { passwordHash: await hashearContrasena(nueva), intentosFallidos: 0, bloqueadoHasta: null },
  });
  return formatearUsuario(actualizado);
}

// ── Autogestión (cada usuario sobre sí mismo) ───────────────

async function actualizarMiPerfil(id, data = {}) {
  const existente = await buscarUsuario(id);
  const personales = normalizarDatosPersonales(data);
  const cambios = { ...personales };
  // La foto es opcional en el pedido: si no viene, no se toca; null o ""
  // la borran.
  if (Object.prototype.hasOwnProperty.call(data, "foto")) cambios.foto = normalizarFoto(data.foto);

  await verificarDniLibre(personales.dni, existente.id);

  try {
    const actualizado = await prisma.usuario.update({ where: { id: existente.id }, data: cambios });
    return formatearUsuario(actualizado);
  } catch (err) {
    throw traducirDuplicado(err);
  }
}

async function cambiarMiContrasena(id, { contrasenaActual, contrasenaNueva } = {}) {
  const existente = await buscarUsuario(id);
  if (typeof contrasenaActual !== "string" || !contrasenaActual) {
    throw new ErrorDeNegocio("Ingresá tu contraseña actual.");
  }
  const correcta = await verificarContrasena(contrasenaActual, existente.passwordHash);
  if (!correcta) throw new ErrorDeNegocio("La contraseña actual no es correcta.");
  const nueva = validarContrasenaNueva(contrasenaNueva, "La nueva contraseña");
  if (nueva === contrasenaActual) throw new ErrorDeNegocio("La nueva contraseña tiene que ser distinta de la actual.");

  await prisma.usuario.update({ where: { id: existente.id }, data: { passwordHash: await hashearContrasena(nueva) } });
  return { ok: true };
}

// ── Semilla ─────────────────────────────────────────────────

// Crea el administrador inicial ("admin") solo si todavía no hay ningún administrador. La contraseña la
// define quien lo corre (mínimo 10 caracteres): no hay una por defecto. Se puede correr las veces que sea: si ya
// existe un administrador, no hace nada (y no pide la contraseña).
async function asegurarAdminInicial(contrasena) {
  const admins = await prisma.usuario.count({ where: { rol: ROL_ADMIN } });
  if (admins > 0) return { creado: false };

  const ocupado = await prisma.usuario.findUnique({ where: { usuario: ADMIN_INICIAL.usuario } });
  if (ocupado) return { creado: false };

  const clave = validarContrasenaInicial(contrasena, "La contraseña del administrador");

  const creado = await prisma.usuario.create({
    data: {
      usuario: ADMIN_INICIAL.usuario,
      nombre: ADMIN_INICIAL.nombre,
      apellido: ADMIN_INICIAL.apellido,
      dni: ADMIN_INICIAL.dni,
      email: null,
      rol: ROL_ADMIN,
      passwordHash: await hashearContrasena(clave),
      activo: true,
    },
  });
  return { creado: true, usuario: formatearUsuario(creado) };
}

module.exports = {
  ErrorDeNegocio,
  iniciarSesion,
  obtenerUsuarioParaSesion,
  obtenerPerfil,
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  cambiarActivo,
  desbloquearUsuario,
  restablecerContrasena,
  actualizarMiPerfil,
  cambiarMiContrasena,
  asegurarAdminInicial,
  formatearUsuario,
};
