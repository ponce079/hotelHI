// Datos de una reserva web para el MOSTRADOR (etapa 2): el bloque "Reserva
// web" del detalle de reserva. Endpoint interno, con sesión (ver
// reservasWeb.routes.js). Devuelve SOLO lo que el recepcionista necesita ver:
// contacto, llegada, solicitudes, políticas aceptadas y el titular de la tarjeta.
// La garantía (marca, últimos 4, estado) NO se repite acá: vive en
// GarantiaReserva y la muestra el detalle de la reserva, una sola vez.
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
      aceptaPoliticasEn: true,
      versionPoliticas: true,
      aceptaComunicaciones: true,
    },
  });
  if (!datos) return null;
  return {
    emailContacto: datos.emailContacto,
    telefonoContacto: datos.telefonoContacto,
    horaEstimadaLlegada: datos.horaEstimadaLlegada,
    solicitudesEspeciales: datos.solicitudesEspeciales,
    tarjetaTitular: datos.tarjetaTitular,
    aceptaPoliticasEn: datos.aceptaPoliticasEn,
    versionPoliticas: datos.versionPoliticas,
    aceptaComunicaciones: datos.aceptaComunicaciones,
  };
}

module.exports = { datosWebDeReserva };
