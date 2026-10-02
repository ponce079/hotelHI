const { createHash } = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { codigoPais } = require("../../lib/paises");
const normalizar = (v) =>
  String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
function claveDocumento(p) {
  if (!p.tipoDocumento || !p.paisDocumento || !p.numeroDocumento) return null;
  return createHash("sha256")
    .update([p.tipoDocumento, normalizarPais(p.paisDocumento), p.numeroDocumento].map(normalizar).join("|"))
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
// Toda edición o alta de ficha sincroniza nombres y apellido en Huesped (si la ficha los tiene).
async function sincronizarNombres(tx, huespedId, persona) {
  const datos = nombresDeFicha(persona);
  if (!huespedId || !datos.apellido) return;
  await tx.huesped.update({ where: { id: huespedId }, data: datos });
}
async function vincularPersona(tx, reserva, persona, actual) {
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
          numeroDocumento: normalizar(persona.numeroDocumento),
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
    numeroDocumento: normalizar(persona.numeroDocumento),
    fechaNacimiento: persona.fechaNacimiento,
    contacto: persona.email || persona.telefono || null,
  };
  // El titular ya tiene ficha desde la reserva. Se completa su identidad
  // cuando se conoce el país emisor, sin crear otra persona por la estadía.
  const titular = reserva.huesped;
  if (
    titular &&
    normalizar(titular.tipoDocumento) === normalizar(persona.tipoDocumento) &&
    normalizar(titular.numeroDocumento) === normalizar(persona.numeroDocumento) &&
    (!titular.paisDocumento || normalizarPais(titular.paisDocumento) === datos.paisDocumento)
  ) {
    const existente = await tx.huesped.findUnique({
      where: { identidadDocumento },
    });
    if (!existente) {
      await tx.huesped.update({
        where: { id: titular.id },
        data: { ...datos, identidadDocumento },
      });
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
  const personaUnica = await tx.huesped.upsert({
    where: { identidadDocumento },
    update: nombresDeFicha(persona).apellido ? nombresDeFicha(persona) : {},
    create: { ...datos, identidadDocumento },
  });
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
    numeroDocumento: normalizar(persona.numeroDocumento),
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

// Persona que vuelve: al reutilizar su ficha (misma identidad de documento) se actualizan
// nombre (y nombres y apellido), nacimiento, contacto y residencia con lo declarado ahora, en UNA sola sentencia.
// Un dato vacío no borra el que ya estaba (COALESCE).
const CAMPOS_FICHA = ["nombre", "nombres", "apellido", "fechaNacimiento", "contacto", ...CAMPOS_RESIDENCIA];
async function actualizarFichasEnLote(tx, filas) {
  const conDatos = filas.filter((fila) => fila.huespedId && CAMPOS_FICHA.some((campo) => fila.datos[campo]));
  if (!conDatos.length) return;
  const asignaciones = CAMPOS_FICHA.map((campo) => {
    const cuando = conDatos.map((fila) => Prisma.sql`WHEN ${fila.huespedId} THEN ${fila.datos[campo] || null}`);
    return Prisma.sql`${Prisma.raw(campo)} = COALESCE(CASE id ${Prisma.join(cuando, " ")} END, ${Prisma.raw(campo)})`;
  });
  const ids = conDatos.map((fila) => fila.huespedId);
  await tx.$executeRaw(
    Prisma.sql`UPDATE huespedes SET ${Prisma.join(asignaciones, ", ")} WHERE id IN (${Prisma.join(ids)})`,
  );
}

// Nacionalidad, país de residencia, domicilio y localidad son datos de la persona:
// viven en Huesped y la ficha guarda los últimos declarados. Un dato que no se
// declara (vacío) no borra el que ya estaba.
async function actualizarResidencia(tx, huespedId, residencia) {
  const datos = {};
  for (const campo of CAMPOS_RESIDENCIA) if (residencia[campo]) datos[campo] = residencia[campo];
  if (!Object.keys(datos).length) return;
  await tx.huesped.update({ where: { id: huespedId }, data: datos });
}

module.exports = {
  nombresDeFicha,
  sincronizarNombres,
  claveDocumento,
  vincularPersona,
  normalizarPais,
  actualizarResidencia,
  actualizarResidenciaEnLote,
  actualizarFichasEnLote,
  datosDeHuesped,
  esProvisoria,
  PREFIJO_SIN_DOCUMENTO,
  CAMPOS_RESIDENCIA,
};
