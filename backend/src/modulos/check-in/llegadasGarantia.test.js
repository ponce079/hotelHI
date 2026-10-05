// Llegadas de hoy: cómo está asegurada cada reserva (seña, prepago de una
// reserva web no reembolsable, garantía con tarjeta de una reserva web).
jest.mock("../../lib/prisma", () => ({ reserva: { findMany: jest.fn(), count: jest.fn() } }));
const prisma = require("../../lib/prisma");
const { listarLlegadas } = require("./checkIn.apoyo.servicio");

function reserva(id, { pagos = [], datosWeb = null } = {}) {
  return {
    id,
    codigoConfirmacion: `0000000${id}`,
    fechaDesde: new Date("2026-10-04T00:00:00.000Z"),
    fechaHasta: new Date("2026-10-06T00:00:00.000Z"),
    huesped: { nombre: "Ana Pérez", nombres: "Ana", apellido: "Pérez", tipoDocumento: "DNI", numeroDocumento: "1", paisDocumento: "AR" },
    planTarifario: { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true },
    reservaHabitaciones: [
      {
        habitacion: { id: 6, numero: "030", tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble" }, capacidad: 2, estado: "libre" },
        adultos: 2,
        menores: 0,
        reservaNoches: [{ precioNoche: "40000" }, { precioNoche: "40000" }],
      },
    ],
    pagosEstadia: pagos,
    datosWeb,
  };
}

const pago = (concepto, importe, referencia) => ({ concepto, medios: [{ medioPago: "Tarjeta crédito", importe: String(importe), referencia }] });

beforeEach(() => {
  prisma.reserva.count.mockResolvedValue(0);
});

test("trae seña, prepago y datos web en UNA consulta, sin token ni referencia de la pasarela", async () => {
  prisma.reserva.findMany.mockResolvedValue([]);
  await listarLlegadas({});
  expect(prisma.reserva.findMany).toHaveBeenCalledTimes(1);
  const { include } = prisma.reserva.findMany.mock.calls[0][0];
  expect(include.pagosEstadia.where).toEqual({ concepto: { in: ["Seña", "Prepago"] }, anulado: false });
  expect(include.datosWeb).toEqual({ select: { tarjetaMarca: true, tarjetaUltimos4: true } });
});

test("los cuatro casos: prepago, garantía con tarjeta web, seña y nada", async () => {
  prisma.reserva.findMany.mockResolvedValue([
    reserva(1, { pagos: [pago("Prepago", 80000, "PRE-ABC")], datosWeb: { tarjetaMarca: "VISA", tarjetaUltimos4: "4242" } }),
    reserva(2, { datosWeb: { tarjetaMarca: "MASTERCARD", tarjetaUltimos4: "4444" } }),
    reserva(3, { pagos: [pago("Seña", 24000, "VISA ****4242 · aut. 5521")] }),
    reserva(4),
  ]);
  const { reservas } = await listarLlegadas({});
  const [prepagada, garantizada, conSenia, sinNada] = reservas;

  expect(prepagada.prepago).toEqual({ registrado: true, importe: 80000 });
  expect(prepagada.senia).toEqual({ registrada: false, importe: 0, medios: [] });
  expect(prepagada.garantiaWeb).toEqual({ marca: "VISA", ultimos4: "4242" });

  expect(garantizada.prepago).toEqual({ registrado: false, importe: 0 });
  expect(garantizada.garantiaWeb).toEqual({ marca: "MASTERCARD", ultimos4: "4444" });

  // La seña sigue igual que antes (solo pagos "Seña").
  expect(conSenia.senia).toEqual({
    registrada: true,
    importe: 24000,
    medios: [{ medioPago: "Tarjeta crédito", importe: 24000, referencia: "VISA ****4242 · aut. 5521" }],
  });
  expect(conSenia.prepago.registrado).toBe(false);
  expect(conSenia.garantiaWeb).toBeNull();

  expect(sinNada.senia.registrada).toBe(false);
  expect(sinNada.prepago.registrado).toBe(false);
  expect(sinNada.garantiaWeb).toBeNull();

  expect(JSON.stringify(reservas)).not.toMatch(/garantiaToken|pasarelaReferencia|PRE-ABC/);
});
