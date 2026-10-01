const { createHash } = require("node:crypto");
const normalizar = (v) =>
  String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
function claveDocumento(p) {
  if (!p.tipoDocumento || !p.paisDocumento || !p.numeroDocumento) return null;
  return createHash("sha256")
    .update(
      [p.tipoDocumento, normalizarPais(p.paisDocumento), p.numeroDocumento]
        .map(normalizar)
        .join("|"),
    )
    .digest("hex");
}
function normalizarPais(valor) {
  const clave = normalizar(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    {
      ARGENTINA: "AR",
      BRASIL: "BR",
      CHILE: "CL",
      URUGUAY: "UY",
      PARAGUAY: "PY",
      BOLIVIA: "BO",
    }[clave] || clave
  );
}
async function vincularPersona(tx, reserva, persona, actual) {
  const identidadDocumento = claveDocumento(persona);
  if (!identidadDocumento) {
    if (actual?.huespedId) return actual.huespedId;
    // Sin documento no se deducen coincidencias: cada ficha conserva su FK
    // para completarla después, sin inventar un número de identificación.
    const creada = await tx.huesped.create({
      data: {
        nombre: `${persona.nombre} ${persona.apellido}`.trim(),
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
    if (previa && !previa.identidadDocumento && !existente) {
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
    nombre: `${persona.nombre} ${persona.apellido}`.trim(),
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
    normalizar(titular.numeroDocumento) ===
      normalizar(persona.numeroDocumento) &&
    (!titular.paisDocumento ||
      normalizarPais(titular.paisDocumento) === datos.paisDocumento)
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
    update: {},
    create: { ...datos, identidadDocumento },
  });
  return personaUnica.id;
}
module.exports = { claveDocumento, vincularPersona, normalizarPais };
