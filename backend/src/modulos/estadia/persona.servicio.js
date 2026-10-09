const { createHash } = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { codigoPais } = require("../../lib/paises");
const { normalizarNumeroDocumento, claveNombre } = require("../../lib/documento");
const normalizar = (v) =>
  String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
// Error de validación (400) con el mismo formato que los ErrorDeNegocio del módulo (message, statusCode, campos).
class ErrorDocumento extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.statusCode = 400;
    this.campos = { numeroDocumento: mensaje };
  }
}
// Regla 2.3 — el nombre y el apellido de una ficha EXISTENTE no se cambian desde los formularios de personas
// (asistente de reserva, detalle, check-in, walk-in, ficha). Solo un administrador, con un motivo. Se aplica acá, en el
// servidor: la pantalla solo lo avisa. El cambio queda en el log del servidor (usuario, ficha, nombre anterior, nombre
// nuevo y motivo) y, si hay una reserva de contexto, también en su historial.
class ErrorNombreDistinto extends Error {
  constructor(mensaje, statusCode = 409, codigo = "NOMBRE_DISTINTO") {
    super(mensaje);
    this.statusCode = statusCode;
    this.codigo = codigo;
  }
}
const MENSAJE_NOMBRE_DISTINTO =
  "Ese documento ya está registrado con otro nombre. Verificá el número o pedile a un administrador que corrija el nombre.";

// Devuelve true si hay un cambio de nombre AUTORIZADO que aplicar, false si el nombre coincide; lanza si no se puede.
// `permiso`: { esAdmin, motivo, usuario, reservaId }.
function autorizarCambioDeNombre(ficha, persona, permiso = {}) {
  if (claveNombre(ficha.nombre) === claveNombre(nombresDeFicha(persona).nombre)) return false;
  if (permiso.esAdmin !== true) throw new ErrorNombreDistinto(MENSAJE_NOMBRE_DISTINTO);
  const motivo = String(permiso.motivo ?? "").trim();
  if (!motivo) {
    const e = new ErrorNombreDistinto("Indicá el motivo del cambio de nombre de la ficha.", 400, "MOTIVO_CAMBIO_NOMBRE");
    e.campos = { motivoCambioNombre: "Indicá el motivo del cambio de nombre de la ficha." };
    throw e;
  }
  return true;
}

// Deja constancia de un cambio de nombre autorizado (log del servidor siempre; historial de la reserva si hay una).
async function registrarCambioDeNombre(tx, ficha, persona, permiso = {}) {
  const nuevo = nombresDeFicha(persona).nombre;
  console.info(
    "[ficha] Cambio de nombre autorizado:",
    JSON.stringify({ usuario: permiso.usuario ?? null, fichaId: ficha.id, nombreAnterior: ficha.nombre, nombreNuevo: nuevo, motivo: String(permiso.motivo ?? "").trim(), reservaId: permiso.reservaId ?? null })
  );
  if (permiso.reservaId) {
    await tx.eventoEstadia.create({
      data: {
        reservaId: permiso.reservaId,
        accion: "Corrección de nombre de la ficha",
        detalle: JSON.stringify({ fichaId: ficha.id, nombreAnterior: ficha.nombre, nombreNuevo: nuevo, motivo: String(permiso.motivo ?? "").trim() }),
        operador: permiso.usuario || "Recepción",
      },
    });
  }
}

// La identidad se calcula con el número YA normalizado (solo letras y dígitos). Un número que queda vacío
// ("-", ".") no tiene que producir una identidad: todas las personas con ese "número" compartirían la misma.
function claveDocumento(p) {
  if (!p.tipoDocumento || !p.paisDocumento || !p.numeroDocumento) return null;
  const numero = normalizarNumeroDocumento(p.numeroDocumento);
  if (!numero) throw new ErrorDocumento("El número de documento tiene que tener letras o números.");
  return createHash("sha256")
    .update([normalizar(p.tipoDocumento), normalizarPais(p.paisDocumento), numero].join("|"))
    .digest("hex");
}
// Cualquier país del catálogo ISO se reduce a su código; lo que no está en el
// catálogo conserva la clave de texto de siempre (mayúsculas, sin tildes ni espacios).
function normalizarPais(valor) {
  return (
    codigoPais(valor) ||
    normalizar(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );
}
// Nombres y apellido de la persona para Huesped: si la ficha trae los dos, se guardan por separado
// y `nombre` (el nombre completo que usan comprobantes y búsquedas) es "nombres apellido". Si falta
// alguno (huésped viejo con el nombre completo en un solo campo) solo se arma `nombre`: nunca se
// parte un nombre automáticamente.
function nombresDeFicha(persona) {
  const nombres = String(persona.nombre ?? "").trim();
  const apellido = String(persona.apellido ?? "").trim();
  if (nombres && apellido) return { nombre: `${nombres} ${apellido}`, nombres, apellido };
  return { nombre: `${nombres} ${apellido}`.trim() };
}
// Ficha vieja (el nombre completo en `nombre`, sin nombres ni apellido): si la persona trae nombres y apellido que forman
// EL MISMO nombre completo, la recepción lo separó según el documento. No es un cambio de nombre (la regla 2.3 sigue
// intacta: autorizarCambioDeNombre no lo ve como distinto), así que se guardan nombres y apellido en la ficha.
// Devuelve { nombre, nombres, apellido } para guardar, o null si no corresponde. Nunca parte un nombre por su cuenta.
function separacionDeNombre(ficha, persona) {
  if (!ficha || (String(ficha.nombres ?? "").trim() && String(ficha.apellido ?? "").trim())) return null;
  const datos = nombresDeFicha(persona);
  if (!datos.apellido) return null;
  return claveNombre(ficha.nombre) === claveNombre(datos.nombre) ? datos : null;
}
// Toda edición o alta de ficha sincroniza nombres y apellido en Huesped (si la ficha los tiene) — SOLO si el
// cambio está autorizado (regla 2.3): un nombre distinto del de la ficha existente se rechaza. Una ficha vieja
// con el nombre sin separar guarda la separación (separacionDeNombre).
async function sincronizarNombres(tx, huespedId, persona, permiso = {}) {
  const datos = nombresDeFicha(persona);
  if (!huespedId || !datos.apellido) return;
  const ficha = await tx.huesped.findUnique({ where: { id: huespedId } });
  if (!ficha) return;
  if (!autorizarCambioDeNombre(ficha, persona, permiso)) {
    const separacion = separacionDeNombre(ficha, persona);
    if (separacion) await tx.huesped.update({ where: { id: huespedId }, data: separacion });
    return;
  }
  await tx.huesped.update({ where: { id: huespedId }, data: datos });
  await registrarCambioDeNombre(tx, ficha, persona, permiso);
}
async function vincularPersona(tx, reserva, persona, actual, permiso = {}) {
  const identidadDocumento = claveDocumento(persona);
  if (!identidadDocumento) {
    if (actual?.huespedId) return actual.huespedId;
    // Sin documento no se deducen coincidencias: cada ficha conserva su FK
    // para completarla después, sin inventar un número de identificación.
    const creada = await tx.huesped.create({
      data: {
        ...nombresDeFicha(persona),
        tipoDocumento: persona.tipoDocumento || "Sin documento",
        numeroDocumento: persona.numeroDocumento || "",
        paisDocumento: persona.paisDocumento || null,
        fechaNacimiento: persona.fechaNacimiento,
        contacto: persona.email || persona.telefono || null,
      },
    });
    return creada.id;
  }
  if (actual?.huespedId) {
    const previa = await tx.huesped.findUnique({
      where: { id: actual.huespedId },
    });
    const existente = await tx.huesped.findUnique({
      where: { identidadDocumento },
    });
    if (previa && esProvisoria(previa) && !existente) {
      await tx.huesped.update({
        where: { id: previa.id },
        data: {
          tipoDocumento: persona.tipoDocumento,
          paisDocumento: normalizarPais(persona.paisDocumento),
          numeroDocumento: normalizarNumeroDocumento(persona.numeroDocumento),
          identidadDocumento,
        },
      });
      return previa.id;
    }
  }
  const datos = {
    ...nombresDeFicha(persona),
    tipoDocumento: persona.tipoDocumento,
    paisDocumento: normalizarPais(persona.paisDocumento),
    numeroDocumento: normalizarNumeroDocumento(persona.numeroDocumento),
    fechaNacimiento: persona.fechaNacimiento,
    contacto: persona.email || persona.telefono || null,
  };
  // El titular ya tiene ficha desde la reserva. Se completa su identidad
  // cuando se conoce el país emisor, sin crear otra persona por la estadía.
  const titular = reserva.huesped;
  if (
    titular &&
    normalizar(titular.tipoDocumento) === normalizar(persona.tipoDocumento) &&
    normalizarNumeroDocumento(titular.numeroDocumento) === normalizarNumeroDocumento(persona.numeroDocumento) &&
    (!titular.paisDocumento || normalizarPais(titular.paisDocumento) === datos.paisDocumento)
  ) {
    const existente = await tx.huesped.findUnique({
      where: { identidadDocumento },
    });
    if (!existente) {
      // Completa la identidad del titular de la reserva. Su nombre ya está en la ficha: no se cambia en silencio.
      const cambioNombre = autorizarCambioDeNombre(titular, persona, permiso);
      const { nombre, nombres, apellido, ...sinNombre } = datos;
      await tx.huesped.update({
        where: { id: titular.id },
        data: { ...sinNombre, ...(cambioNombre ? { nombre, nombres, apellido } : {}), identidadDocumento },
      });
      if (cambioNombre) await registrarCambioDeNombre(tx, titular, persona, permiso);
      return titular.id;
    }
    if (titular.id !== existente.id) {
      await tx.reserva.update({
        where: { id: reserva.id },
        data: { huespedId: existente.id },
      });
    }
    return existente.id;
  }
  // La ficha de esa persona: si existe se reutiliza SIN pisar su nombre ni sus datos; si no, se crea (y si otra
  // operación la creó en paralelo, P2002, se relee la existente y se usa tal cual).
  let personaUnica = await tx.huesped.findUnique({ where: { identidadDocumento } });
  if (personaUnica) {
    if (autorizarCambioDeNombre(personaUnica, persona, permiso)) {
      await tx.huesped.update({ where: { id: personaUnica.id }, data: nombresDeFicha(persona) });
      await registrarCambioDeNombre(tx, personaUnica, persona, permiso);
    }
  } else {
    try {
      personaUnica = await tx.huesped.create({ data: { ...datos, identidadDocumento } });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
      personaUnica = await tx.huesped.findUnique({ where: { identidadDocumento } });
      if (!personaUnica) throw error;
      autorizarCambioDeNombre(personaUnica, persona, permiso);
    }
  }
  return personaUnica.id;
}

const CAMPOS_RESIDENCIA = ["nacionalidad", "paisResidencia", "domicilio", "localidad"];

// La carga en lote necesita encontrar de nuevo las fichas que acaba de crear, y una persona
// sin documento no tiene una clave natural. Su ficha lleva una identidad provisoria única
// (nunca un número de documento inventado); se reemplaza cuando se completa el documento.
const PREFIJO_SIN_DOCUMENTO = "SIN-DOC:";
const esProvisoria = (huesped) =>
  !huesped?.identidadDocumento || huesped.identidadDocumento.startsWith(PREFIJO_SIN_DOCUMENTO);

function datosDeHuesped(persona) {
  return {
    ...nombresDeFicha(persona),
    tipoDocumento: persona.tipoDocumento,
    paisDocumento: normalizarPais(persona.paisDocumento),
    numeroDocumento: normalizarNumeroDocumento(persona.numeroDocumento),
    fechaNacimiento: persona.fechaNacimiento,
    contacto: persona.email || persona.telefono || null,
  };
}

// Mismo efecto que actualizarResidencia para muchas fichas, con UNA sola sentencia:
// la cantidad de consultas no crece con la cantidad de personas.
async function actualizarResidenciaEnLote(tx, filas) {
  const conDatos = filas.filter((fila) => CAMPOS_RESIDENCIA.some((campo) => fila.residencia[campo]));
  if (!conDatos.length) return;
  const asignaciones = CAMPOS_RESIDENCIA.map((campo) => {
    const cuando = conDatos.map((fila) => Prisma.sql`WHEN ${fila.huespedId} THEN ${fila.residencia[campo] || null}`);
    return Prisma.sql`${Prisma.raw(campo)} = COALESCE(CASE id ${Prisma.join(cuando, " ")} END, ${Prisma.raw(campo)})`;
  });
  const ids = conDatos.map((fila) => fila.huespedId);
  await tx.$executeRaw(
    Prisma.sql`UPDATE huespedes SET ${Prisma.join(asignaciones, ", ")} WHERE id IN (${Prisma.join(ids)})`,
  );
}

// Persona que vuelve: al reutilizar su ficha (misma identidad de documento) se completan nacimiento, contacto y
// residencia, en UNA sola sentencia. NUNCA se pisa un dato que la ficha ya tiene salvo que la fila lo pida
// explícitamente (`sobrescribir`, la casilla "Actualizar la ficha del huésped con estos datos"); sin eso, solo se
// completan los vacíos. Nombre y apellido no se tocan acá (regla 2.3, ver autorizarCambioDeNombre). Un dato vacío
// nunca borra el que ya estaba.
const CAMPOS_FICHA = ["fechaNacimiento", "contacto", ...CAMPOS_RESIDENCIA];
async function actualizarFichasEnLote(tx, filas) {
  const conDatos = filas.filter((fila) => fila.huespedId && CAMPOS_FICHA.some((campo) => fila.datos[campo]));
  if (!conDatos.length) return;
  const asignaciones = CAMPOS_FICHA.map((campo) => {
    const columna = Prisma.raw(campo);
    const cuando = conDatos.map((fila) => {
      const nuevo = fila.datos[campo] || null;
      if (fila.sobrescribir === true) return Prisma.sql`WHEN ${fila.huespedId} THEN COALESCE(${nuevo}, ${columna})`;
      // fechaNacimiento es una columna DATE: compararla con '' da error 1292 ("Incorrect date value") en la base;
      // un nacimiento vacío es NULL, así que alcanza con COALESCE. Las demás son texto y pueden estar vacías ('').
      return campo === "fechaNacimiento"
        ? Prisma.sql`WHEN ${fila.huespedId} THEN COALESCE(${columna}, ${nuevo})`
        : Prisma.sql`WHEN ${fila.huespedId} THEN COALESCE(NULLIF(${columna}, ''), ${nuevo}, ${columna})`;
    });
    return Prisma.sql`${columna} = CASE id ${Prisma.join(cuando, " ")} ELSE ${columna} END`;
  });
  const ids = conDatos.map((fila) => fila.huespedId);
  await tx.$executeRaw(
    Prisma.sql`UPDATE huespedes SET ${Prisma.join(asignaciones, ", ")} WHERE id IN (${Prisma.join(ids)})`,
  );
}

// Cambios de nombre AUTORIZADOS (administrador con motivo) de varias fichas, en una sola sentencia.
async function renombrarFichasEnLote(tx, filas) {
  if (!filas.length) return;
  const caso = (campo) =>
    Prisma.sql`${Prisma.raw(campo)} = CASE id ${Prisma.join(filas.map((f) => Prisma.sql`WHEN ${f.huespedId} THEN ${f.datos[campo] ?? null}`), " ")} ELSE ${Prisma.raw(campo)} END`;
  await tx.$executeRaw(
    Prisma.sql`UPDATE huespedes SET ${Prisma.join(["nombre", "nombres", "apellido"].map(caso), ", ")} WHERE id IN (${Prisma.join(filas.map((f) => f.huespedId))})`,
  );
}

// Nacionalidad, país de residencia, domicilio y localidad son datos de la persona:
// viven en Huesped y la ficha guarda los últimos declarados. Un dato que no se
// declara (vacío) no borra el que ya estaba.
async function actualizarResidencia(tx, huespedId, residencia, { sobrescribir = false } = {}) {
  const datos = {};
  for (const campo of CAMPOS_RESIDENCIA) if (residencia[campo]) datos[campo] = residencia[campo];
  if (!Object.keys(datos).length) return;
  if (sobrescribir) {
    await tx.huesped.update({ where: { id: huespedId }, data: datos });
    return;
  }
  // Sin la casilla de actualizar: solo se completan los datos que la ficha todavía no tiene.
  const asignaciones = Object.keys(datos).map((campo) => Prisma.sql`${Prisma.raw(campo)} = COALESCE(NULLIF(${Prisma.raw(campo)}, ''), ${datos[campo]})`);
  await tx.$executeRaw(Prisma.sql`UPDATE huespedes SET ${Prisma.join(asignaciones, ", ")} WHERE id = ${huespedId}`);
}

module.exports = {
  nombresDeFicha,
  separacionDeNombre,
  sincronizarNombres,
  claveDocumento,
  ErrorDocumento,
  vincularPersona,
  normalizarPais,
  actualizarResidencia,
  actualizarResidenciaEnLote,
  actualizarFichasEnLote,
  renombrarFichasEnLote,
  autorizarCambioDeNombre,
  registrarCambioDeNombre,
  ErrorNombreDistinto,
  MENSAJE_NOMBRE_DISTINTO,
  datosDeHuesped,
  esProvisoria,
  PREFIJO_SIN_DOCUMENTO,
  CAMPOS_RESIDENCIA,
};
