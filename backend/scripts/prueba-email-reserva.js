// Prueba manual end-to-end de HU-41 (email real de confirmación de reserva).
//
// A diferencia de scripts/pruebas-reservas.js (que corre con un doble de
// Prisma en memoria para no tocar la base compartida), este script SÍ pega
// contra la base real de Clever Cloud y contra el SMTP real configurado en
// .env: es justamente lo que hay que hacer para confirmar que el envío
// funciona de punta a punta, algo que un mock nunca puede probar.
//
// Por eso arma la reserva con un huésped marcado con un DNI ficticio
// reconocible (prefijo TEST-EMAIL-) y al final borra todo lo que creó
// (reservaHabitacion, notificacion, reserva, huesped) para no dejar basura
// en la base del equipo.
//
//   node scripts/prueba-email-reserva.js <email-destino>

require("dotenv").config();

const prisma = require("../src/lib/prisma");
const reservasServicio = require("../src/modulos/reservas/reservas.servicio");

const emailDestino = process.argv[2];
if (!emailDestino) {
  console.error("Uso: node scripts/prueba-email-reserva.js <email-destino>");
  process.exit(1);
}

function formatearFecha(fecha) {
  return fecha.toISOString().slice(0, 10);
}

async function elegirHabitacionLibre(fechaDesde, fechaHasta) {
  const habitaciones = await prisma.habitacion.findMany({ where: { activo: true } });
  for (const habitacion of habitaciones) {
    const conflicto = await prisma.reservaHabitacion.findFirst({
      where: {
        habitacionId: habitacion.id,
        reserva: {
          estado: { in: ["Confirmada", "En curso"] },
          fechaDesde: { lt: fechaHasta },
          fechaHasta: { gt: fechaDesde },
        },
      },
    });
    if (!conflicto) return habitacion;
  }
  throw new Error("No se encontró ninguna habitación activa libre en el rango elegido.");
}

async function main() {
  // Dentro de 2 años: minimiza la chance de pisar una reserva real ya
  // cargada, sin depender de que "mañana" esté libre.
  const desde = new Date();
  desde.setUTCFullYear(desde.getUTCFullYear() + 2);
  const hasta = new Date(desde);
  hasta.setUTCDate(hasta.getUTCDate() + 1);

  const habitacion = await elegirHabitacionLibre(desde, hasta);
  console.log(`Habitación elegida: ${habitacion.numero} (id ${habitacion.id})`);

  const numeroDocumentoTest = `TEST-EMAIL-${Date.now()}`;

  let reservaCreada;
  try {
    reservaCreada = await reservasServicio.crearReserva({
      fechaDesde: formatearFecha(desde),
      fechaHasta: formatearFecha(hasta),
      habitacionIds: [habitacion.id],
      huesped: {
        nombre: "Prueba Envío Email HU-41",
        tipoDocumento: "DNI",
        numeroDocumento: numeroDocumentoTest,
        contacto: emailDestino,
      },
      canalConfirmacion: "Email",
      origen: "RECEPCION",
    });

    console.log("Reserva de prueba creada:", reservaCreada.codigoConfirmacion);
    console.log("Resultado de enviarCorreo:", reservaCreada.confirmacionEmail);

    if (reservaCreada.confirmacionEmail?.enviado) {
      console.log(`ÉXITO: SMTP aceptó el envío. messageId = ${reservaCreada.confirmacionEmail.messageId}`);
    } else {
      console.log(`FALLO: ${reservaCreada.confirmacionEmail?.motivo}`);
    }
  } finally {
    // Limpieza, corra bien o mal el envío — no queremos dejar basura de
    // prueba en la base compartida en ningún caso.
    const reserva = await prisma.reserva.findUnique({
      where: { codigoConfirmacion: reservaCreada?.codigoConfirmacion ?? "___no-existe___" },
    });
    if (reserva) {
      await prisma.notificacion.deleteMany({ where: { reservaId: reserva.id } });
      await prisma.reservaHabitacion.deleteMany({ where: { reservaId: reserva.id } });
      await prisma.reserva.delete({ where: { id: reserva.id } });
      console.log(`Reserva de prueba ${reserva.codigoConfirmacion} eliminada.`);
    }
    const huesped = await prisma.huesped.findFirst({
      where: { tipoDocumento: "DNI", numeroDocumento: numeroDocumentoTest },
    });
    if (huesped) {
      await prisma.huesped.delete({ where: { id: huesped.id } });
      console.log(`Huésped de prueba ${huesped.numeroDocumento} eliminado.`);
    }
  }
}

main()
  .catch((err) => {
    console.error("Error en la prueba:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
