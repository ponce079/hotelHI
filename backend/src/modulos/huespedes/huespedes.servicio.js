// Rediseño del check-in — "persona que vuelve": la ficha de un huésped por su documento.
//
// Coincidencia EXACTA por identidad de documento (tipo + país emisor + número, la misma clave
// única de Huesped): nunca parcial, nunca por nombre. Devuelve solo los datos que el check-in
// necesita para precargar la fila (Ley 25.326: minimización), la fecha de la última estadía y
// si está alojada ahora.
const prisma = require("../../lib/prisma");
const { claveDocumento } = require("../estadia/persona.servicio");
const { normalizarTipoDocumento } = require("../../lib/tiposDocumento");
const { esEmail } = require("../../lib/contacto");

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

const texto = (v) => String(v ?? "").trim();
const soloFecha = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function buscarPorDocumento({ tipo, pais, numero } = {}) {
  if (!texto(tipo) || !texto(pais) || !texto(numero))
    throw new ErrorDeNegocio("Indicá el tipo de documento, el país emisor y el número.");
  const tipoDocumento = normalizarTipoDocumento(tipo);
  if (!tipoDocumento) throw new ErrorDeNegocio("El tipo de documento no es válido.");
  if (!require("../../lib/documento").normalizarNumeroDocumento(texto(numero)))
    throw new ErrorDeNegocio("El número de documento tiene que tener letras o números.");
  const identidad = claveDocumento({ tipoDocumento, paisDocumento: texto(pais), numeroDocumento: texto(numero) });
  const huesped = identidad ? await prisma.huesped.findUnique({ where: { identidadDocumento: identidad } }) : null;
  if (!huesped) throw new ErrorDeNegocio("No hay ningún huésped registrado con ese documento.", 404);

  // Última ficha de ocupante (nombre y apellido separados, teléfono y correo declarados),
  // última estadía real y si está alojada ahora: tres lecturas, sin importar el historial.
  const [ultimaFicha, ultimaEstadia, alojada] = await Promise.all([
    prisma.ocupanteReserva.findFirst({
      where: { huespedId: huesped.id, estado: { not: "Cancelado" } },
      orderBy: { id: "desc" },
      select: { nombre: true, apellido: true, telefono: true, email: true },
    }),
    prisma.ocupanteReserva.findFirst({
      where: { huespedId: huesped.id, estado: { in: ["Alojado", "Retirado"] } },
      orderBy: { ingresoReal: "desc" },
      select: { reserva: { select: { fechaDesde: true } } },
    }),
    prisma.ocupanteReserva.count({ where: { huespedId: huesped.id, estado: "Alojado" } }),
  ]);
  const contactoEsEmail = esEmail(huesped.contacto);

  return {
    tipoDocumento: huesped.tipoDocumento,
    paisDocumento: huesped.paisDocumento,
    numeroDocumento: huesped.numeroDocumento,
    // Sin ficha previa: nombres y apellido del huésped; el nombre completo solo si no los tiene.
    ...(ultimaFicha
      ? { nombre: ultimaFicha.nombre, apellido: ultimaFicha.apellido || null }
      : huesped.nombres && huesped.apellido
        ? { nombre: huesped.nombres, apellido: huesped.apellido }
        : { nombre: huesped.nombre, apellido: null }),
    // Nombre tal como está guardado en la ficha del huésped: es el que protege el alta de reservas
    // (reservas.servicio.js, resolverHuesped), así que el mostrador autocompleta con este.
    nombreRegistrado: {
      nombres: huesped.nombres || huesped.nombre,
      apellido: huesped.nombres && huesped.apellido ? huesped.apellido : "",
    },
    fechaNacimiento: soloFecha(huesped.fechaNacimiento),
    nacionalidad: huesped.nacionalidad,
    paisResidencia: huesped.paisResidencia,
    localidad: huesped.localidad,
    domicilio: huesped.domicilio,
    telefono: ultimaFicha?.telefono ?? (!contactoEsEmail ? huesped.contacto : null),
    email: ultimaFicha?.email ?? (contactoEsEmail ? huesped.contacto : null),
    fechaUltimaEstadia: soloFecha(ultimaEstadia?.reserva?.fechaDesde),
    alojadaAhora: alojada > 0,
  };
}

module.exports = { buscarPorDocumento, ErrorDeNegocio };
