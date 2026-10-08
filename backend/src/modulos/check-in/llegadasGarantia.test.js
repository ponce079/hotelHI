// Llegadas de hoy: cómo está asegurada cada reserva. Una sola fuente de garantía
// (GarantiaReserva, para el mostrador y para la web) más el pago anticipado y la seña histórica.
jest.mock("../../lib/prisma", () => ({ reserva: { findMany: jest.fn(), count: jest.fn() } }));
const prisma = require("../../lib/prisma");
const { listarLlegadas } = require("./checkIn.apoyo.servicio");

function reserva(id, { pagos = [], garantiaReserva = null } = {}) {
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
    garantiaReserva,
  };
}

const pago = (concepto, importe, referencia) => ({ concepto, medios: [{ medioPago: "Tarjeta crédito", importe: String(importe), referencia }] });
const tarjeta = (marca, ultimos4, extra = {}) => ({ tipo: "TARJETA", marca, ultimos4, estado: "Vigente", ...extra });

beforeEach(() => {
  prisma.reserva.count.mockResolvedValue(0);
});

test("trae pago anticipado, seña y garantía en UNA consulta, sin token ni referencia de la pasarela", async () => {
  prisma.reserva.findMany.mockResolvedValue([]);
  await listarLlegadas({});
  expect(prisma.reserva.findMany).toHaveBeenCalledTimes(1);
  const { include } = prisma.reserva.findMany.mock.calls[0][0];
  expect(include.pagosEstadia.where).toEqual({ concepto: { in: ["Pago anticipado", "Seña"] }, anulado: false });
  expect(include.garantiaReserva).toEqual({ select: { tipo: true, marca: true, ultimos4: true, estado: true } });
  expect(include).not.toHaveProperty("datosWeb");
});

test("marca la reserva web cuyo nombre declarado no coincide con la ficha (regla 2.6), en la misma consulta", async () => {
  prisma.reserva.findMany.mockResolvedValue([{ ...reserva(1), historialEstadia: [{ id: 9 }] }, reserva(2)]);
  const { reservas } = await listarLlegadas({});
  const { include } = prisma.reserva.findMany.mock.calls[0][0];
  expect(include.historialEstadia.where).toEqual({ accion: "Nombre declarado en la web distinto del de la ficha" });
  expect(reservas.map((r) => r.nombreWebDistinto)).toEqual([true, false]);
});

test("los cuatro casos: web no reembolsable (tarjeta + pago anticipado), tarjeta flexible, seña histórica y nada", async () => {
  prisma.reserva.findMany.mockResolvedValue([
    reserva(1, { pagos: [pago("Pago anticipado", 80000, "Visa ****4242 · aut. CAP-123456")], garantiaReserva: tarjeta("Visa", "4242", { estado: "Capturada" }) }),
    reserva(2, { garantiaReserva: tarjeta("Mastercard", "4444") }),
    reserva(3, { pagos: [pago("Seña", 24000, "VISA ****4242 · aut. 5521")] }),
    reserva(4),
  ]);
  const { reservas } = await listarLlegadas({});
  const [prepagada, garantizada, conSenia, sinNada] = reservas;

  expect(prepagada.garantia).toEqual({ tipo: "TARJETA", marca: "Visa", ultimos4: "4242" });
  expect(prepagada.senia).toEqual({
    registrada: true,
    importe: 80000,
    medios: [{ medioPago: "Tarjeta crédito", importe: 80000, referencia: "Visa ****4242 · aut. CAP-123456" }],
  });

  expect(garantizada.garantia).toEqual({ tipo: "TARJETA", marca: "Mastercard", ultimos4: "4444" });
  expect(garantizada.senia.registrada).toBe(false);

  expect(conSenia.senia.importe).toBe(24000);
  expect(conSenia.garantia).toBeNull();

  expect(sinNada.senia.registrada).toBe(false);
  expect(sinNada.garantia).toBeNull();

  // Los campos de la versión anterior (prepago y garantiaWeb) ya no existen.
  for (const r of reservas) {
    expect(r).not.toHaveProperty("prepago");
    expect(r).not.toHaveProperty("garantiaWeb");
  }
  expect(JSON.stringify(reservas)).not.toMatch(/token|pasarelaReferencia|PRE-ABC/);
});

test("una garantía que no es de tarjeta (prepago) no se muestra como tarjeta", async () => {
  prisma.reserva.findMany.mockResolvedValue([reserva(5, { garantiaReserva: { tipo: "PREPAGO", marca: null, ultimos4: null, estado: "Capturada" } })]);
  const { reservas } = await listarLlegadas({});
  expect(reservas[0].garantia).toBeNull();
});
