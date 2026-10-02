jest.mock("../../lib/prisma", () => ({}));
const { armarHistorial, obtenerHistorial } = require("./reservas.historial");

const habitaciones = [
  { id: 10, numero: "404" },
  { id: 11, numero: "405" },
];
const personas = [
  { id: 1, nombre: "Martín", apellido: "Gutiérrez" },
  { id: 2, nombre: "Carolina", apellido: "Paz" },
];
const fecha = (h) => new Date(`2026-10-02T${h}:00.000Z`);

test("une ficha, confirmaciones, pagos y consumos con sus anulaciones, del más reciente al más antiguo", () => {
  const h = armarHistorial({
    habitaciones,
    personas,
    eventos: [
      { id: 1, fecha: fecha("15:19"), accion: "Check-in: ocupantes registrados", operador: "recepcion", detalle: JSON.stringify({ ocupanteIds: [1, 2], menores: [] }) },
      { id: 2, fecha: fecha("16:00"), accion: "Cambio de documento", operador: "recepcion", detalle: JSON.stringify({ ocupanteId: 2, anterior: { numeroDocumento: "1" }, nuevo: { numeroDocumento: "2" }, motivo: "error de tipeo" }) },
      { id: 3, fecha: fecha("16:30"), accion: "Cambio de habitación", operador: "recepcion", detalle: JSON.stringify({ ocupanteId: 2, desdeHabitacionId: 10, habitacionId: 11, motivo: "ruido" }) },
    ],
    notificaciones: [{ id: 5, canal: "Email", destinatarioArea: "mg@correo.test", fechaEnvio: fecha("10:23") }],
    pagos: [
      { id: 7, fecha: fecha("10:22"), concepto: "Seña", anulado: false, medios: [{ medioPago: "Tarjeta crédito", importe: "25600", referencia: "5521" }] },
      { id: 8, fecha: fecha("17:00"), concepto: "Pago final", anulado: true, motivoAnulacion: "error de carga", medios: [{ medioPago: "Efectivo", importe: "1000", referencia: null }] },
    ],
    consumos: [
      { id: 9, fecha: null, fechaHora: fecha("21:40"), tipoServicio: "Restaurante", descripcion: null, monto: "18500", habitacionId: 10, registradoPor: "resto", anulado: true, motivoAnulacion: "duplicado", anuladoPor: "gerente", anuladoEn: fecha("22:00") },
    ],
  });
  expect(h.map((e) => e.titulo)).toEqual([
    "Consumo anulado",
    "Consumo cargado",
    "Pago registrado",
    "Cambio de habitación",
    "Documento modificado",
    "Check-in confirmado",
    "Confirmación enviada por correo",
    "Seña registrada",
  ]);
  // Orden descendente por fecha.
  const fechas = h.map((e) => e.fecha);
  expect(fechas).toEqual([...fechas].sort().reverse());
  expect(h.find((e) => e.titulo === "Documento modificado").detalle).toBe("Carolina Paz · número: 1 → 2 · error de tipeo");
  expect(h.find((e) => e.titulo === "Cambio de habitación").detalle).toBe("Carolina Paz · de la habitación 404 a la 405 · ruido");
  expect(h.find((e) => e.titulo === "Check-in confirmado").detalle).toBe("2 personas registradas");
  const sena = h.find((e) => e.titulo === "Seña registrada");
  expect(sena.detalle).toBe("$ 25.600 · Tarjeta crédito (ref. 5521)");
  const pagoAnulado = h.find((e) => e.id === "pago-8");
  expect(pagoAnulado.anulado).toBe(true);
  expect(pagoAnulado.detalle).toContain("Anulado: error de carga");
  const anulacion = h.find((e) => e.id === "consumo-anulado-9");
  expect(anulacion).toMatchObject({ operador: "gerente", fecha: fecha("22:00").toISOString() });
  expect(h.find((e) => e.id === "consumo-9").operador).toBe("resto");
});

test("suma los ajustes manuales de precio con noche, precios, motivo y gerente", () => {
  const h = armarHistorial({
    habitaciones,
    noches: [
      { id: 1, fecha: new Date("2026-10-03T00:00:00.000Z"), precioOriginal: 42400, precioNoche: 39000, ajustada: true, motivoAjuste: "cliente frecuente", ajustadoPor: "gerente.prueba", ajustadoEn: fecha("12:00"), habitacionNumero: "404" },
      { id: 2, fecha: new Date("2026-10-04T00:00:00.000Z"), precioNoche: 43200, ajustada: false },
    ],
  });
  expect(h).toHaveLength(1);
  expect(h[0]).toMatchObject({
    titulo: "Ajuste manual de precio",
    operador: "gerente.prueba",
    detalle: "Noche del 03/10/2026 · Habitación 404 · $ 42.400 → $ 39.000 · cliente frecuente",
  });
});

test("no inventa eventos: una reserva sin registros devuelve la lista vacía y un detalle roto no corta el resto", () => {
  expect(armarHistorial({})).toEqual([]);
  const h = armarHistorial({ eventos: [{ id: 1, fecha: fecha("10:00"), accion: "cancelar", operador: "x", detalle: "no es json" }] });
  expect(h).toHaveLength(1);
  expect(h[0]).toMatchObject({ titulo: "Ficha dada de baja", detalle: "" });
});

test("una ficha dada de baja muestra su motivo y los datos solo de la reserva pedida", async () => {
  const cliente = {
    reserva: {
      findUnique: jest.fn().mockResolvedValue({
        id: 3,
        reservaHabitaciones: [{ habitacionId: 10, habitacion: { numero: "404" }, reservaNoches: [] }],
      }),
    },
    eventoEstadia: { findMany: jest.fn().mockResolvedValue([{ id: 1, fecha: fecha("09:00"), accion: "cancelar", operador: "recepcion", detalle: JSON.stringify({ ocupanteId: 1, motivo: "Reemplazada en el check-in" }) }]) },
    ocupanteReserva: { findMany: jest.fn().mockResolvedValue(personas) },
    notificacion: { findMany: jest.fn().mockResolvedValue([]) },
    pagoEstadia: { findMany: jest.fn().mockResolvedValue([]) },
    consumoServicioAdicional: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const h = await obtenerHistorial("3", cliente);
  expect(h).toHaveLength(1);
  expect(h[0].detalle).toBe("Martín Gutiérrez · Reemplazada en el check-in");
  for (const tabla of ["eventoEstadia", "notificacion", "pagoEstadia", "consumoServicioAdicional", "ocupanteReserva"]) {
    expect(cliente[tabla].findMany.mock.calls[0][0].where.reservaId).toBe(3);
  }
  cliente.reserva.findUnique.mockResolvedValue(null);
  await expect(obtenerHistorial(99, cliente)).rejects.toMatchObject({ statusCode: 404 });
  await expect(obtenerHistorial("abc", cliente)).rejects.toMatchObject({ statusCode: 400 });
});
