// Pruebas de Usuarios y Seguridad (login real, bloqueo por intentos,
// gestión de usuarios del admin y autogestión del perfil).
//
// Corren SIN base de datos y sin red: se reemplaza src/lib/prisma por un
// doble en memoria que implementa solo la parte del cliente de Prisma que
// usa este módulo (findUnique / findMany / create / update / count sobre
// `usuario`, con los índices únicos de usuario y dni). Nada de esto toca la
// base compartida de Clever Cloud.
//
// Además de la lógica de negocio, levanta las rutas reales de Express en un
// puerto local para probar de punta a punta el token y los permisos.
//
//   cd backend
//   node scripts/pruebas-usuarios.js

const assert = require("assert");
const Module = require("module");

// ── Doble en memoria de Prisma ──────────────────────────────

function crearBase() {
  let usuarios = [];
  let secuencia = 0;

  function errorUnico(campo) {
    const err = new Error(`Unique constraint failed on the constraint: \`usuarios_${campo}_key\``);
    err.code = "P2002";
    err.meta = { target: `usuarios_${campo}_key` };
    return err;
  }

  function coincide(fila, where = {}) {
    return Object.entries(where).every(([campo, valor]) => fila[campo] === valor);
  }

  function copia(fila) {
    return fila ? { ...fila } : null;
  }

  function chequearUnicos(datos, excluirId = null) {
    for (const campo of ["usuario", "dni"]) {
      if (datos[campo] !== undefined && usuarios.some((u) => u.id !== excluirId && u[campo] === datos[campo])) {
        throw errorUnico(campo);
      }
    }
  }

  const usuario = {
    async findUnique({ where }) {
      const [campo, valor] = Object.entries(where)[0];
      return copia(usuarios.find((u) => u[campo] === valor));
    },
    async findMany({ where = {}, orderBy } = {}) {
      let filas = usuarios.filter((u) => coincide(u, where)).map(copia);
      if (orderBy) {
        const criterios = Array.isArray(orderBy) ? orderBy : [orderBy];
        filas.sort((a, b) => {
          for (const criterio of criterios) {
            const [campo, sentido] = Object.entries(criterio)[0];
            const comparacion = String(a[campo]).localeCompare(String(b[campo]));
            if (comparacion !== 0) return sentido === "desc" ? -comparacion : comparacion;
          }
          return 0;
        });
      }
      return filas;
    },
    async create({ data }) {
      chequearUnicos(data);
      const ahora = new Date();
      const fila = {
        email: null,
        foto: null,
        activo: true,
        intentosFallidos: 0,
        bloqueadoHasta: null,
        ultimoIngreso: null,
        ...data,
        id: ++secuencia,
        creadoEn: ahora,
        actualizadoEn: ahora,
      };
      usuarios.push(fila);
      return copia(fila);
    },
    async update({ where, data }) {
      const fila = usuarios.find((u) => u.id === where.id);
      if (!fila) {
        const err = new Error("Record to update not found.");
        err.code = "P2025";
        throw err;
      }
      chequearUnicos(data, fila.id);
      Object.assign(fila, data, { actualizadoEn: new Date() });
      return copia(fila);
    },
    async count({ where = {} } = {}) {
      return usuarios.filter((u) => coincide(u, where)).length;
    },
  };

  return {
    usuario,
    async $executeRawUnsafe() {
      return 0;
    },
    async $disconnect() {},
    _limpiar() {
      usuarios = [];
      secuencia = 0;
    },
    _fila(id) {
      return usuarios.find((u) => u.id === id);
    },
  };
}

const base = crearBase();
const cargarModuloOriginal = Module._load;
Module._load = function (solicitud, ...resto) {
  if (/(^|[/\\])lib[/\\]prisma$/.test(solicitud)) return base;
  return cargarModuloOriginal.call(this, solicitud, ...resto);
};

process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://prueba:prueba@localhost:3306/prueba";

const servicio = require("../src/modulos/usuarios/usuarios.servicio");
const { firmarToken, verificarToken } = require("../src/modulos/usuarios/usuarios.seguridad");
const { MAX_INTENTOS_FALLIDOS, LIMITES_USUARIO } = require("../src/modulos/usuarios/usuarios.constantes");

// ── Mini framework ──────────────────────────────────────────

let pasaron = 0;
const fallaron = [];

async function prueba(nombre, fn) {
  try {
    await fn();
    pasaron += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (err) {
    fallaron.push({ nombre, err });
    console.log(`  ✘ ${nombre}\n      ${err.message}`);
  }
}

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

async function esperaError(fn, { status, texto }) {
  try {
    await fn();
  } catch (err) {
    if (status !== undefined) assert.equal(err.statusCode, status, `status ${err.statusCode} (${err.message})`);
    if (texto) {
      assert.ok(
        err.message.toLowerCase().includes(texto.toLowerCase()),
        `El error fue "${err.message}", se esperaba que mencionara "${texto}"`
      );
    }
    return err;
  }
  throw new Error(`Se esperaba un error${texto ? ` que mencionara "${texto}"` : ""}, pero no falló`);
}

const DATOS = {
  usuario: "tomi.recepcion",
  nombre: "Tomás",
  apellido: "Gudiño",
  dni: "40.123.456",
  email: "Tomi@Mail.com",
  rol: "recepcionista",
  contrasena: "secreta1",
};

async function reiniciar() {
  base._limpiar();
  await servicio.asegurarAdminInicial();
}

async function adminId() {
  return (await base.usuario.findUnique({ where: { usuario: "admin" } })).id;
}

// Una foto "real" chiquita (PNG de 1x1) en formato data URL.
const FOTO_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function main() {
  // ── Admin inicial ─────────────────────────────────────────
  seccion("Semilla — administrador inicial");

  await prueba("crea admin/admin123 la primera vez y no lo duplica después", async () => {
    base._limpiar();
    const primero = await servicio.asegurarAdminInicial();
    assert.equal(primero.creado, true);
    assert.equal(primero.usuario.usuario, "admin");
    assert.equal(primero.usuario.rol, "admin");
    const segundo = await servicio.asegurarAdminInicial();
    assert.equal(segundo.creado, false);
    assert.equal(await base.usuario.count(), 1);
  });

  await prueba("la contraseña se guarda hasheada (nunca en texto plano)", async () => {
    await reiniciar();
    const fila = base._fila(await adminId());
    assert.ok(fila.passwordHash.startsWith("scrypt$"));
    assert.ok(!fila.passwordHash.includes("admin123"));
  });

  await prueba("dos usuarios con la misma contraseña quedan con hashes distintos (sal propia)", async () => {
    await reiniciar();
    await servicio.crearUsuario({ ...DATOS, contrasena: "admin123" });
    const admin = base._fila(await adminId());
    const otro = await base.usuario.findUnique({ where: { usuario: DATOS.usuario } });
    assert.notEqual(admin.passwordHash, otro.passwordHash);
  });

  // ── Login ─────────────────────────────────────────────────
  seccion("Login y bloqueo por intentos fallidos");

  await prueba("admin / admin123 entra y recibe token + datos sin passwordHash", async () => {
    await reiniciar();
    const { token, usuario } = await servicio.iniciarSesion({ usuario: "admin", contrasena: "admin123" });
    assert.ok(typeof token === "string" && token.includes("."));
    assert.equal(usuario.rol, "admin");
    assert.equal(usuario.passwordHash, undefined);
    assert.ok(usuario.ultimoIngreso instanceof Date);
    assert.deepEqual(verificarToken(token).id, usuario.id);
  });

  await prueba("el usuario no distingue mayúsculas ni espacios de más", async () => {
    await reiniciar();
    const { usuario } = await servicio.iniciarSesion({ usuario: "  ADMIN ", contrasena: "admin123" });
    assert.equal(usuario.usuario, "admin");
  });

  await prueba("usuario inexistente: mismo mensaje genérico que contraseña incorrecta", async () => {
    await reiniciar();
    await esperaError(() => servicio.iniciarSesion({ usuario: "nadie", contrasena: "x" }), {
      status: 401,
      texto: "usuario o contraseña incorrectos",
    });
  });

  await prueba("sin usuario o sin contraseña pide completar los dos", async () => {
    await reiniciar();
    await esperaError(() => servicio.iniciarSesion({ usuario: "admin" }), { status: 400, texto: "ingresá tu usuario" });
    await esperaError(() => servicio.iniciarSesion({}), { status: 400 });
  });

  await prueba("contraseña incorrecta avisa cuántos intentos quedan", async () => {
    await reiniciar();
    await esperaError(() => servicio.iniciarSesion({ usuario: "admin", contrasena: "mal" }), {
      status: 401,
      texto: `te quedan ${MAX_INTENTOS_FALLIDOS - 1} intentos`,
    });
    assert.equal(base._fila(await adminId()).intentosFallidos, 1);
  });

  await prueba(`al intento ${MAX_INTENTOS_FALLIDOS} se bloquea 15 minutos (423)`, async () => {
    await reiniciar();
    for (let i = 1; i < MAX_INTENTOS_FALLIDOS; i += 1) {
      await esperaError(() => servicio.iniciarSesion({ usuario: "admin", contrasena: "mal" }), { status: 401 });
    }
    await esperaError(() => servicio.iniciarSesion({ usuario: "admin", contrasena: "mal" }), {
      status: 423,
      texto: "bloqueado por 15 minutos",
    });
    const fila = base._fila(await adminId());
    const minutos = (new Date(fila.bloqueadoHasta) - new Date()) / 60000;
    assert.ok(minutos > 14 && minutos <= 15, `bloqueo de ${minutos} minutos`);
  });

  await prueba("bloqueado, ni la contraseña correcta entra hasta que pase el tiempo", async () => {
    await reiniciar();
    base._fila(await adminId()).bloqueadoHasta = new Date(Date.now() + 10 * 60000);
    await esperaError(() => servicio.iniciarSesion({ usuario: "admin", contrasena: "admin123" }), {
      status: 423,
      texto: "probá de nuevo en 10 minutos",
    });
  });

  await prueba("vencido el bloqueo, entra y el contador vuelve a cero", async () => {
    await reiniciar();
    const fila = base._fila(await adminId());
    fila.bloqueadoHasta = new Date(Date.now() - 1000);
    await servicio.iniciarSesion({ usuario: "admin", contrasena: "admin123" });
    assert.equal(fila.intentosFallidos, 0);
    assert.equal(fila.bloqueadoHasta, null);
  });

  await prueba("vencido el bloqueo, un nuevo error cuenta desde 1 (no bloquea de nuevo en el acto)", async () => {
    await reiniciar();
    const fila = base._fila(await adminId());
    fila.bloqueadoHasta = new Date(Date.now() - 1000);
    await esperaError(() => servicio.iniciarSesion({ usuario: "admin", contrasena: "mal" }), {
      status: 401,
      texto: `te quedan ${MAX_INTENTOS_FALLIDOS - 1} intentos`,
    });
    assert.equal(fila.intentosFallidos, 1);
  });

  await prueba("un login correcto limpia los intentos fallidos acumulados", async () => {
    await reiniciar();
    await esperaError(() => servicio.iniciarSesion({ usuario: "admin", contrasena: "mal" }), { status: 401 });
    await esperaError(() => servicio.iniciarSesion({ usuario: "admin", contrasena: "mal" }), { status: 401 });
    await servicio.iniciarSesion({ usuario: "admin", contrasena: "admin123" });
    assert.equal(base._fila(await adminId()).intentosFallidos, 0);
  });

  await prueba("usuario desactivado: con la contraseña correcta avisa que está desactivado (403)", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    await servicio.cambiarActivo(creado.id, false, await adminId());
    await esperaError(() => servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: DATOS.contrasena }), {
      status: 403,
      texto: "desactivado",
    });
  });

  await prueba("perfil de la tarjeta distinto al rol del usuario → 403 claro, sin contar como intento fallido", async () => {
    await reiniciar();
    await servicio.crearUsuario(DATOS);
    await esperaError(
      () => servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: DATOS.contrasena, rol: "gerente" }),
      { status: 403, texto: 'elegí el perfil "recepcionista"' }
    );
    const fila = await base.usuario.findUnique({ where: { usuario: DATOS.usuario } });
    assert.equal(fila.intentosFallidos, 0);
    assert.equal(fila.ultimoIngreso, null, "no quedó registrado como ingreso");
  });

  await prueba("perfil correcto en la tarjeta → entra", async () => {
    await reiniciar();
    await servicio.crearUsuario(DATOS);
    const { usuario } = await servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: DATOS.contrasena, rol: "recepcionista" });
    assert.equal(usuario.rol, "recepcionista");
  });

  await prueba("perfil equivocado con contraseña mala: cuenta como intento fallido (no revela el perfil)", async () => {
    await reiniciar();
    await servicio.crearUsuario(DATOS);
    await esperaError(() => servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: "mal", rol: "gerente" }), {
      status: 401,
      texto: "te quedan",
    });
  });

  // ── Token ─────────────────────────────────────────────────
  seccion("Token de sesión");

  await prueba("un token modificado a mano (ej. cambiarse el rol) se rechaza", async () => {
    const token = firmarToken({ id: 7, rol: "recepcionista" });
    const [cuerpo, firma] = token.split(".");
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString());
    const trucho = Buffer.from(JSON.stringify({ ...datos, rol: "admin" })).toString("base64url");
    assert.equal(verificarToken(`${trucho}.${firma}`), null);
    assert.equal(verificarToken(token).rol, "recepcionista");
  });

  await prueba("un token vencido o con basura se rechaza", async () => {
    assert.equal(verificarToken(undefined), null);
    assert.equal(verificarToken("cualquier.cosa"), null);
    assert.equal(verificarToken("sinpunto"), null);
    const ahoraReal = Date.now;
    try {
      const token = firmarToken({ id: 1, rol: "admin" });
      Date.now = () => ahoraReal() + 9 * 60 * 60 * 1000; // 9 horas después
      assert.equal(verificarToken(token), null);
    } finally {
      Date.now = ahoraReal;
    }
  });

  // ── Administración ────────────────────────────────────────
  seccion("Administración de usuarios (admin)");

  await prueba("alta: normaliza usuario, DNI y email, y no devuelve el hash", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario({ ...DATOS, usuario: "  Tomi.Recepcion " });
    assert.equal(creado.usuario, "tomi.recepcion");
    assert.equal(creado.dni, "40123456");
    assert.equal(creado.email, "tomi@mail.com");
    assert.equal(creado.rol, "recepcionista");
    assert.equal(creado.activo, true);
    assert.equal(creado.passwordHash, undefined);
    const { usuario } = await servicio.iniciarSesion({ usuario: "tomi.recepcion", contrasena: "secreta1" });
    assert.equal(usuario.id, creado.id);
  });

  await prueba("alta: email opcional", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario({ ...DATOS, email: "" });
    assert.equal(creado.email, null);
  });

  await prueba("alta: usuario repetido → 409", async () => {
    await reiniciar();
    await servicio.crearUsuario(DATOS);
    await esperaError(() => servicio.crearUsuario({ ...DATOS, dni: "30111222" }), { status: 409, texto: "ya está en uso" });
  });

  await prueba("alta: DNI repetido → 409 (aunque se tipee con puntos)", async () => {
    await reiniciar();
    await servicio.crearUsuario(DATOS);
    await esperaError(() => servicio.crearUsuario({ ...DATOS, usuario: "otro", dni: "40123456" }), {
      status: 409,
      texto: "dni",
    });
  });

  await prueba("alta: validaciones de cada campo", async () => {
    await reiniciar();
    await esperaError(() => servicio.crearUsuario({ ...DATOS, usuario: "con espacio" }), { status: 400, texto: "usuario debe tener" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, usuario: "ab" }), { status: 400, texto: "usuario debe tener" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, nombre: "  " }), { status: 400, texto: "nombre es obligatorio" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, apellido: "" }), { status: 400, texto: "apellido es obligatorio" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, dni: "12A45678" }), { status: 400, texto: "7 u 8 números" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, dni: "123" }), { status: 400, texto: "7 u 8 números" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, email: "sin-arroba" }), { status: 400, texto: "email" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, rol: "superusuario" }), { status: 400, texto: "rol válido" });
    await esperaError(() => servicio.crearUsuario({ ...DATOS, contrasena: "12345" }), {
      status: 400,
      texto: `al menos ${LIMITES_USUARIO.contrasenaMin}`,
    });
    assert.equal(await base.usuario.count(), 1, "ninguna alta inválida quedó guardada");
  });

  await prueba("alta simultánea con el mismo DNI (choque del índice único) → 409 claro", async () => {
    await reiniciar();
    await servicio.crearUsuario(DATOS);
    const original = base.usuario.findUnique;
    base.usuario.findUnique = async () => null; // simula que la verificación previa no lo vio
    try {
      await esperaError(() => servicio.crearUsuario({ ...DATOS, usuario: "otro.usuario" }), { status: 409, texto: "dni" });
    } finally {
      base.usuario.findUnique = original;
    }
  });

  await prueba("edición: cambia datos y rol de otro usuario; el nombre de usuario no se toca", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    const editado = await servicio.actualizarUsuario(
      creado.id,
      { ...DATOS, usuario: "hackeado", nombre: "Tomás Ignacio", rol: "gerente" },
      await adminId()
    );
    assert.equal(editado.nombre, "Tomás Ignacio");
    assert.equal(editado.rol, "gerente");
    assert.equal(editado.usuario, "tomi.recepcion");
  });

  await prueba("edición: un admin no puede cambiarse su propio rol", async () => {
    await reiniciar();
    const id = await adminId();
    await esperaError(
      () => servicio.actualizarUsuario(id, { nombre: "A", apellido: "B", dni: "00000000", rol: "gerente" }, id),
      { status: 400, texto: "tu propio rol" }
    );
    // Sus otros datos sí.
    const editado = await servicio.actualizarUsuario(id, { nombre: "Ana", apellido: "Admin", dni: "20111222", rol: "admin" }, id);
    assert.equal(editado.nombre, "Ana");
  });

  await prueba("edición: DNI de otro usuario → 409", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    const actor = await adminId();
    await esperaError(() => servicio.actualizarUsuario(creado.id, { ...DATOS, dni: "00000000" }, actor), {
      status: 409,
      texto: "dni",
    });
  });

  await prueba("desactivar/reactivar a otro sí; a uno mismo no", async () => {
    await reiniciar();
    const id = await adminId();
    const creado = await servicio.crearUsuario(DATOS);
    assert.equal((await servicio.cambiarActivo(creado.id, false, id)).activo, false);
    assert.equal((await servicio.cambiarActivo(creado.id, true, id)).activo, true);
    await esperaError(() => servicio.cambiarActivo(id, false, id), { status: 400, texto: "tu propio usuario" });
    await esperaError(() => servicio.cambiarActivo(creado.id, "no", id), { status: 400 });
  });

  await prueba("desbloquear limpia el bloqueo y los intentos", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    Object.assign(base._fila(creado.id), { bloqueadoHasta: new Date(Date.now() + 600000), intentosFallidos: 0 });
    const antes = (await servicio.listarUsuarios({})).find((u) => u.id === creado.id);
    assert.equal(antes.bloqueado, true);
    const despues = await servicio.desbloquearUsuario(creado.id);
    assert.equal(despues.bloqueado, false);
    await servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: DATOS.contrasena });
  });

  await prueba("restablecer contraseña: la nueva entra, la vieja no, y se levanta el bloqueo", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    base._fila(creado.id).bloqueadoHasta = new Date(Date.now() + 600000);
    await servicio.restablecerContrasena(creado.id, "nueva123");
    await servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: "nueva123" });
    await esperaError(() => servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: DATOS.contrasena }), { status: 401 });
    await esperaError(() => servicio.restablecerContrasena(creado.id, "123"), { status: 400 });
  });

  await prueba("listado: busca por nombre, apellido, usuario o DNI y filtra por rol y estado", async () => {
    await reiniciar();
    const tomi = await servicio.crearUsuario(DATOS);
    await servicio.crearUsuario({ ...DATOS, usuario: "ana.hk", nombre: "Ana", apellido: "Pérez", dni: "30111222", rol: "housekeeping" });
    await servicio.cambiarActivo(tomi.id, false, await adminId());

    assert.deepEqual((await servicio.listarUsuarios({ buscar: "gudi" })).map((u) => u.usuario), ["tomi.recepcion"]);
    assert.deepEqual((await servicio.listarUsuarios({ buscar: "30111" })).map((u) => u.usuario), ["ana.hk"]);
    assert.deepEqual((await servicio.listarUsuarios({ buscar: "ana pérez" })).map((u) => u.usuario), ["ana.hk"]);
    assert.deepEqual((await servicio.listarUsuarios({ rol: "housekeeping" })).map((u) => u.usuario), ["ana.hk"]);
    assert.deepEqual((await servicio.listarUsuarios({ estado: "inactivos" })).map((u) => u.usuario), ["tomi.recepcion"]);
    assert.equal((await servicio.listarUsuarios({ estado: "activos" })).length, 2);
    assert.ok((await servicio.listarUsuarios({})).every((u) => u.passwordHash === undefined));
  });

  await prueba("un id inexistente o inválido → 404", async () => {
    await reiniciar();
    await esperaError(() => servicio.obtenerPerfil(999), { status: 404 });
    await esperaError(() => servicio.obtenerPerfil("abc"), { status: 404 });
  });

  // ── Autogestión ───────────────────────────────────────────
  seccion("Mi perfil (cada usuario sobre sí mismo)");

  await prueba("edita nombre, apellido, DNI y email; rol y usuario no se pueden tocar desde acá", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    const editado = await servicio.actualizarMiPerfil(creado.id, {
      nombre: "Tomi",
      apellido: "G.",
      dni: "40123457",
      email: "otro@mail.com",
      rol: "admin",
      usuario: "admin2",
    });
    assert.equal(editado.nombre, "Tomi");
    assert.equal(editado.dni, "40123457");
    assert.equal(editado.email, "otro@mail.com");
    assert.equal(editado.rol, "recepcionista");
    assert.equal(editado.usuario, "tomi.recepcion");
  });

  await prueba("foto: se guarda, se conserva si no se manda, y se borra con null", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    const personales = { nombre: "Tomás", apellido: "Gudiño", dni: "40123456" };
    assert.equal((await servicio.actualizarMiPerfil(creado.id, { ...personales, foto: FOTO_PNG })).foto, FOTO_PNG);
    assert.equal((await servicio.actualizarMiPerfil(creado.id, personales)).foto, FOTO_PNG);
    assert.equal((await servicio.actualizarMiPerfil(creado.id, { ...personales, foto: null })).foto, null);
  });

  await prueba("foto: rechaza lo que no es JPG/PNG o es demasiado pesada", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    const personales = { nombre: "Tomás", apellido: "Gudiño", dni: "40123456" };
    await esperaError(() => servicio.actualizarMiPerfil(creado.id, { ...personales, foto: "data:image/gif;base64,AAAA" }), {
      status: 400,
      texto: "jpg o png",
    });
    await esperaError(() => servicio.actualizarMiPerfil(creado.id, { ...personales, foto: "<script>" }), { status: 400 });
    const gigante = `data:image/jpeg;base64,${"A".repeat(LIMITES_USUARIO.fotoCaracteres)}`;
    await esperaError(() => servicio.actualizarMiPerfil(creado.id, { ...personales, foto: gigante }), {
      status: 400,
      texto: "demasiado pesada",
    });
  });

  await prueba("perfil: no puede quedarse con el DNI de otro", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    await esperaError(() => servicio.actualizarMiPerfil(creado.id, { nombre: "a", apellido: "b", dni: "00000000" }), {
      status: 409,
    });
  });

  await prueba("cambiar contraseña: exige la actual y una nueva distinta de al menos 6", async () => {
    await reiniciar();
    const creado = await servicio.crearUsuario(DATOS);
    await esperaError(() => servicio.cambiarMiContrasena(creado.id, { contrasenaActual: "mal", contrasenaNueva: "nueva123" }), {
      status: 400,
      texto: "actual no es correcta",
    });
    await esperaError(() => servicio.cambiarMiContrasena(creado.id, { contrasenaNueva: "nueva123" }), {
      status: 400,
      texto: "contraseña actual",
    });
    await esperaError(
      () => servicio.cambiarMiContrasena(creado.id, { contrasenaActual: DATOS.contrasena, contrasenaNueva: DATOS.contrasena }),
      { status: 400, texto: "distinta" }
    );
    await esperaError(() => servicio.cambiarMiContrasena(creado.id, { contrasenaActual: DATOS.contrasena, contrasenaNueva: "123" }), {
      status: 400,
    });
    await servicio.cambiarMiContrasena(creado.id, { contrasenaActual: DATOS.contrasena, contrasenaNueva: "nueva123" });
    await servicio.iniciarSesion({ usuario: DATOS.usuario, contrasena: "nueva123" });
  });

  // ── Rutas HTTP de punta a punta ───────────────────────────
  seccion("Rutas HTTP (token y permisos)");

  const express = require("express");
  const { routerAuth, routerUsuarios } = require("../src/modulos/usuarios/usuarios.routes");
  const app = express();
  app.use(express.json()); // mismo parser (y mismo límite de 100 KB) que index.js
  app.use("/api/auth", routerAuth);
  app.use("/api/usuarios", routerUsuarios);
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, () => resolver(s));
  });
  const url = `http://127.0.0.1:${servidor.address().port}`;

  async function pedir(metodo, ruta, { token, cuerpo } = {}) {
    const respuesta = await fetch(`${url}${ruta}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await respuesta.text();
    return { status: respuesta.status, datos: texto ? JSON.parse(texto) : null, texto };
  }

  async function loguear(usuario, contrasena) {
    const { status, datos } = await pedir("POST", "/api/auth/login", { cuerpo: { usuario, contrasena } });
    assert.equal(status, 200, JSON.stringify(datos));
    return datos.token;
  }

  try {
    await prueba("POST /api/auth/login con el perfil de la tarjeta: correcto 200, equivocado 403", async () => {
      await reiniciar();
      const ok = await pedir("POST", "/api/auth/login", { cuerpo: { usuario: "admin", contrasena: "admin123", rol: "admin" } });
      assert.equal(ok.status, 200);
      const mal = await pedir("POST", "/api/auth/login", { cuerpo: { usuario: "admin", contrasena: "admin123", rol: "compras" } });
      assert.equal(mal.status, 403);
      assert.ok(mal.datos.error.includes('Elegí el perfil "Administrador"'));
    });

    await prueba("POST /api/auth/login → 200 con token; contraseña mala → 401 con mensaje", async () => {
      await reiniciar();
      await loguear("admin", "admin123");
      const { status, datos } = await pedir("POST", "/api/auth/login", { cuerpo: { usuario: "admin", contrasena: "x" } });
      assert.equal(status, 401);
      assert.ok(datos.error.includes("Te quedan"));
    });

    await prueba("sin token, /api/usuarios responde 401 con código SESION_INVALIDA", async () => {
      await reiniciar();
      const { status, datos } = await pedir("GET", "/api/usuarios");
      assert.equal(status, 401);
      assert.equal(datos.codigo, "SESION_INVALIDA");
    });

    await prueba("con un token adulterado → 401", async () => {
      await reiniciar();
      const token = await loguear("admin", "admin123");
      const { status } = await pedir("GET", "/api/usuarios", { token: `${token}x` });
      assert.equal(status, 401);
    });

    await prueba("admin lista usuarios (200) y en la respuesta no aparece ningún hash", async () => {
      await reiniciar();
      await servicio.crearUsuario(DATOS);
      const token = await loguear("admin", "admin123");
      const { status, datos, texto } = await pedir("GET", "/api/usuarios", { token });
      assert.equal(status, 200);
      assert.equal(datos.length, 2);
      assert.ok(!texto.includes("passwordHash") && !texto.includes("scrypt$"));
    });

    await prueba("admin crea un usuario (201) y un alta inválida da 400", async () => {
      await reiniciar();
      const token = await loguear("admin", "admin123");
      const ok = await pedir("POST", "/api/usuarios", { token, cuerpo: DATOS });
      assert.equal(ok.status, 201);
      assert.equal(ok.datos.usuario, "tomi.recepcion");
      const mal = await pedir("POST", "/api/usuarios", { token, cuerpo: { ...DATOS, usuario: "x" } });
      assert.equal(mal.status, 400);
    });

    await prueba("una recepcionista NO puede usar la administración (403)…", async () => {
      await reiniciar();
      const creado = await servicio.crearUsuario(DATOS);
      const token = await loguear(DATOS.usuario, DATOS.contrasena);
      assert.equal((await pedir("GET", "/api/usuarios", { token })).status, 403);
      assert.equal((await pedir("POST", "/api/usuarios", { token, cuerpo: { ...DATOS, usuario: "otra", dni: "1234567" } })).status, 403);
      assert.equal((await pedir("PUT", `/api/usuarios/${creado.id}`, { token, cuerpo: { ...DATOS, rol: "admin" } })).status, 403);
      assert.equal(base._fila(creado.id).rol, "recepcionista");
    });

    await prueba("…pero sí editar su propio perfil y ver sus datos en /api/auth/yo", async () => {
      await reiniciar();
      await servicio.crearUsuario(DATOS);
      const token = await loguear(DATOS.usuario, DATOS.contrasena);
      const perfil = await pedir("PATCH", "/api/usuarios/yo/perfil", {
        token,
        cuerpo: { nombre: "Tomi", apellido: "Gudiño", dni: "40123456", email: "", foto: FOTO_PNG },
      });
      assert.equal(perfil.status, 200);
      assert.equal(perfil.datos.nombre, "Tomi");
      assert.equal(perfil.datos.foto, FOTO_PNG);
      const yo = await pedir("GET", "/api/auth/yo", { token });
      assert.equal(yo.status, 200);
      assert.equal(yo.datos.nombre, "Tomi");
    });

    await prueba("una foto grande (~85 mil caracteres) entra por el límite de 100 KB de express.json()", async () => {
      await reiniciar();
      await servicio.crearUsuario(DATOS);
      const token = await loguear(DATOS.usuario, DATOS.contrasena);
      const foto = `data:image/jpeg;base64,${"A".repeat(85000)}`;
      const { status } = await pedir("PATCH", "/api/usuarios/yo/perfil", {
        token,
        cuerpo: { nombre: "Tomás", apellido: "Gudiño", dni: "40123456", foto },
      });
      assert.equal(status, 200);
    });

    await prueba("cambiar la propia contraseña por HTTP", async () => {
      await reiniciar();
      await servicio.crearUsuario(DATOS);
      const token = await loguear(DATOS.usuario, DATOS.contrasena);
      const { status } = await pedir("PATCH", "/api/usuarios/yo/contrasena", {
        token,
        cuerpo: { contrasenaActual: DATOS.contrasena, contrasenaNueva: "otra123" },
      });
      assert.equal(status, 200);
      await loguear(DATOS.usuario, "otra123");
    });

    await prueba("si el admin desactiva a alguien, su token deja de servir en el acto (401)", async () => {
      await reiniciar();
      const creado = await servicio.crearUsuario(DATOS);
      const token = await loguear(DATOS.usuario, DATOS.contrasena);
      await servicio.cambiarActivo(creado.id, false, await adminId());
      const { status, datos } = await pedir("GET", "/api/auth/yo", { token });
      assert.equal(status, 401);
      assert.equal(datos.codigo, "SESION_INVALIDA");
    });

    await prueba("si el admin le cambia el rol, los permisos cambian en el acto", async () => {
      await reiniciar();
      const creado = await servicio.crearUsuario(DATOS);
      const token = await loguear(DATOS.usuario, DATOS.contrasena);
      assert.equal((await pedir("GET", "/api/usuarios", { token })).status, 403);
      await servicio.actualizarUsuario(creado.id, { ...DATOS, rol: "admin" }, await adminId());
      assert.equal((await pedir("GET", "/api/usuarios", { token })).status, 200);
    });

    await prueba("admin: desactivar, desbloquear y restablecer por HTTP", async () => {
      await reiniciar();
      const creado = await servicio.crearUsuario(DATOS);
      const token = await loguear("admin", "admin123");
      assert.equal((await pedir("PATCH", `/api/usuarios/${creado.id}/activo`, { token, cuerpo: { activo: false } })).datos.activo, false);
      assert.equal((await pedir("PATCH", `/api/usuarios/${creado.id}/activo`, { token, cuerpo: { activo: true } })).datos.activo, true);
      assert.equal((await pedir("PATCH", `/api/usuarios/${creado.id}/desbloquear`, { token })).status, 200);
      const restablecer = await pedir("PATCH", `/api/usuarios/${creado.id}/restablecer-contrasena`, {
        token,
        cuerpo: { contrasena: "nueva123" },
      });
      assert.equal(restablecer.status, 200);
      await loguear(DATOS.usuario, "nueva123");
      assert.equal((await pedir("GET", "/api/usuarios/999", { token })).status, 404);
    });
  } finally {
    servidor.close();
  }

  console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
  if (fallaron.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
