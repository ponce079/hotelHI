// Datos de una reserva web para el MOSTRADOR (etapa 2): el bloque "Reserva
// web" del detalle de reserva. Endpoint interno, con sesión (ver
// reservasWeb.routes.js). Devuelve SOLO lo que el recepcionista necesita ver;
// nunca garantiaToken ni pasarelaReferencia.
const prisma = require("../../lib/prisma");

async function datosWebDeReserva(reservaId) {
  const datos = await prisma.datosReservaWeb.findUnique({
    where: { reservaId },
    select: {
      emailContacto: true,
      telefonoContacto: true,
      horaEstimadaLlegada: true,
      solicitudesEspeciales: true,
      tarjetaTitular: true,
      tarjetaMarca: true,
      tarjetaUltimos4: true,
      tarjetaVencimiento: true,
      aceptaPoliticasEn: true,
      versionPoliticas: true,
      aceptaComunicaciones: true,
      reserva: { select: { planTarifario: { select: { reembolsable: true } } } },
    },
  });
  if (!datos) return null;
  return {
    emailContacto: datos.emailContacto,
    telefonoContacto: datos.telefonoContacto,
    horaEstimadaLlegada: datos.horaEstimadaLlegada,
    solicitudesEspeciales: datos.solicitudesEspeciales,
    tarjeta: {
      titular: datos.tarjetaTitular,
      marca: datos.tarjetaMarca,
      ultimos4: datos.tarjetaUltimos4,
      vencimiento: datos.tarjetaVencimiento,
    },
    tipoGarantia: datos.reserva.planTarifario.reembolsable ? "GARANTIA" : "PREPAGO",
    aceptaPoliticasEn: datos.aceptaPoliticasEn,
    versionPoliticas: datos.versionPoliticas,
    aceptaComunicaciones: datos.aceptaComunicaciones,
  };
}

module.exports = { datosWebDeReserva };
