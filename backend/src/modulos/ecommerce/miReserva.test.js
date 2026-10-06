// Funciones puras de "Mi reserva" (HU-104).
const {
  MOTIVO,
  normalizarCodigo,
  normalizarEmail,
  codigoValido,
  emailValido,
  emailDeLaReserva,
  mismoEmail,
  enmascararTitular,
  enmascararDocumento,
  evaluarCancelacion,
  armarRespuestaMiReserva,
} = require("./miReserva");

describe("normalización y formato", () => {
  test("código: mayúsculas, sin espacios ni guiones", () => {
    expect(normalizarCodigo(" 3fa9-c21b ")).toBe("3FA9C21B");
    expect(normalizarCodigo(null)).toBe("");
    expect(codigoValido("3FA9C21B")).toBe(true);
    expect(codigoValido("3FA9C21")).toBe(false);
    expect(codigoValido("ZZZZZZZZ")).toBe(false);
  });

  test("email: minúsculas, sin espacios", () => {
    expect(normalizarEmail(" Juan.Perez @Correo.com ")).toBe("juan.perez@correo.com");
    expect(emailValido("juan@correo.com")).toBe(true);
    expect(emailValido("juan@")).toBe(false);
    expect(emailValido(`${"a".repeat(190)}@x.com`)).toBe(false);
  });
});

describe("emailDeLaReserva (decisión 6)", () => {
  test("reserva web: el de DatosReservaWeb, aunque la ficha tenga otro", () => {
    expect(emailDeLaReserva({ datosWeb: { emailContacto: "Web@Correo.com" }, huesped: { contacto: "otro@correo.com" } })).toBe("web@correo.com");
  });
  test("mostrador: Huesped.contacto solo si es un email", () => {
    expect(emailDeLaReserva({ datosWeb: null, huesped: { contacto: "Ficha@Correo.com" } })).toBe("ficha@correo.com");
    expect(emailDeLaReserva({ datosWeb: null, huesped: { contacto: "+54 9 387 555-0101" } })).toBeNull();
    expect(emailDeLaReserva({ datosWeb: null, huesped: null })).toBeNull();
  });
});

test("mismoEmail: iguales → true; distintos o vacíos → false", () => {
  expect(mismoEmail("a@b.com", "a@b.com")).toBe(true);
  expect(mismoEmail("a@b.com", "a@b.co")).toBe(false);
  expect(mismoEmail("", "")).toBe(false);
});

test("enmascarado del titular y del documento", () => {
  expect(enmascararTitular({ nombres: "Juan Carlos", apellido: "pérez" })).toBe("Juan P.");
  expect(enmascararTitular({ nombre: "Ana María López" })).toBe("Ana L.");
  expect(enmascararTitular({ nombre: "Cher" })).toBe("Cher");
  expect(enmascararDocumento("30 111 222")).toBe("****222");
  expect(enmascararDocumento(null)).toBe("");
});

describe("evaluarCancelacion (decisión 14)", () => {
  // Llegada el 2026-10-16: el límite de llegada es 16/10 14:00 de Argentina (17:00 UTC).
  const base = { estado: "Confirmada", fechaDesde: new Date("2026-10-16T00:00:00.000Z"), reembolsable: true, tienePagosActivos: false };
  const SIN_CARGO = { aplica: false, monto: 0, limiteSinCargo: new Date("2026-10-14T17:00:00.000Z"), mensaje: "Cancelación sin cargo.", tipo: "x" };
  const CON_CARGO = { aplica: true, monto: 25000, limiteSinCargo: new Date("2026-10-14T17:00:00.000Z"), mensaje: "Ya pasó el plazo: se cobra la primera noche." };
  const ANTES = new Date("2026-10-10T12:00:00.000Z");

  test("flexible, en plazo y sin pagos → se cancela online; la penalidad sale reducida", () => {
    expect(evaluarCancelacion(base, SIN_CARGO, ANTES)).toEqual({
      puedeCancelarOnline: true,
      motivo: null,
      penalidad: { aplica: false, monto: 0, limiteSinCargo: SIN_CARGO.limiteSinCargo, mensaje: "Cancelación sin cargo." },
    });
  });

  test("con cargo → motivo con el monto y la explicación", () => {
    const r = evaluarCancelacion(base, CON_CARGO, ANTES);
    expect(r.puedeCancelarOnline).toBe(false);
    expect(r.motivo).toMatch(/^Cancelar ahora tiene un cargo de \$\s?25\.000 \(ya pasó el plazo: se cobra la primera noche\)\. Para cancelar, contactá a recepción\.$/);
    expect(r.penalidad).toMatchObject({ aplica: true, monto: 25000 });
  });

  test("no reembolsable → motivo de la tarifa", () => {
    expect(evaluarCancelacion({ ...base, reembolsable: false }, CON_CARGO, ANTES).motivo).toBe(MOTIVO.NO_REEMBOLSABLE);
  });

  test("con un pago activo → motivo del pago (antes que la regla del plan)", () => {
    expect(evaluarCancelacion({ ...base, reembolsable: false, tienePagosActivos: true }, CON_CARGO, ANTES).motivo).toBe(MOTIVO.CON_PAGO);
    expect(evaluarCancelacion({ ...base, tienePagosActivos: true }, SIN_CARGO, ANTES).motivo).toBe(MOTIVO.CON_PAGO);
  });

  test("el día de llegada desde las 14 h → llegada hoy (antes que pagos y plan); después → ya pasó", () => {
    const hoy1401 = new Date("2026-10-16T17:01:00.000Z");
    expect(evaluarCancelacion({ ...base, tienePagosActivos: true, reembolsable: false }, SIN_CARGO, hoy1401).motivo).toBe(MOTIVO.LLEGADA_HOY);
    expect(evaluarCancelacion(base, SIN_CARGO, new Date("2026-10-16T16:59:00.000Z")).puedeCancelarOnline).toBe(true);
    expect(evaluarCancelacion(base, SIN_CARGO, new Date("2026-10-18T12:00:00.000Z")).motivo).toBe(MOTIVO.LLEGADA_PASADA);
  });

  test("estado: Cancelada lo dice; otros estados no se cancelan y no traen motivo", () => {
    expect(evaluarCancelacion({ ...base, estado: "Cancelada" }, null, ANTES)).toEqual({ puedeCancelarOnline: false, motivo: MOTIVO.CANCELADA, penalidad: null });
    expect(evaluarCancelacion({ ...base, estado: "En curso" }, null, ANTES)).toEqual({ puedeCancelarOnline: false, motivo: null, penalidad: null });
  });

  test("estado No-show: no se cancela y dice que figura como no presentada", () => {
    expect(evaluarCancelacion({ ...base, estado: "No-show" }, null, ANTES)).toEqual({
      puedeCancelarOnline: false,
      motivo: "La reserva figura como no presentada. Contactá a recepción.",
      penalidad: null,
    });
  });

  test("sin penalidad calculable → no se cancela online", () => {
    expect(evaluarCancelacion(base, null, ANTES).puedeCancelarOnline).toBe(false);
  });
});

describe("armarRespuestaMiReserva", () => {
  const reserva = {
    id: 375,
    codigoConfirmacion: "3FA9C21B",
    estado: "Confirmada",
    fechaDesde: new Date("2026-10-16T00:00:00.000Z"),
    fechaHasta: new Date("2026-10-18T00:00:00.000Z"),
    huesped: { nombres: "Juan", apellido: "Pérez", numeroDocumento: "30111222", contacto: "juan@correo.com" },
    planTarifario: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
    reservaHabitaciones: [
      { id: 9, adultos: 1, menores: 0, habitacion: { numero: 204, tipoHabitacion: { nombre: "Simple" } }, reservaNoches: [{ precioNoche: "20000.50" }, { precioNoche: "20000.50" }] },
      { id: 8, adultos: 2, menores: 1, habitacion: { numero: 101, tipoHabitacion: { nombre: "Doble" } }, reservaNoches: [{ precioNoche: "25000" }, { precioNoche: "25000" }] },
    ],
    pagosEstadia: [
      { anulado: false, concepto: "Seña", medios: [{ importe: "10000" }, { importe: "5000" }] },
      { anulado: true, concepto: "Seña", medios: [{ importe: "99999" }] },
    ],
    datosWeb: { emailContacto: "juan@correo.com" },
    garantiaReserva: { tipo: "TARJETA", marca: "Visa", ultimos4: "4242" },
  };

  const CLAVES_PROHIBIDAS = ["id", "reservaId", "huespedId", "habitacionId", "numero", "numeroDocumento", "email", "emailContacto", "contacto", "token"];
  function clavesProhibidas(valor, ruta = "$") {
    if (Array.isArray(valor)) return valor.flatMap((v, i) => clavesProhibidas(v, `${ruta}[${i}]`));
    if (!valor || typeof valor !== "object") return [];
    return Object.entries(valor).flatMap(([clave, v]) => [
      ...(CLAVES_PROHIBIDAS.includes(clave) ? [`${ruta}.${clave}`] : []),
      ...clavesProhibidas(v, `${ruta}.${clave}`),
    ]);
  }

  test("forma del contrato: totales con decimales, habitaciones por id, garantía y datos enmascarados", () => {
    const cancelacion = { puedeCancelarOnline: false, motivo: MOTIVO.CON_PAGO, penalidad: null };
    const r = armarRespuestaMiReserva(reserva, cancelacion);
    expect(r).toEqual({
      codigoConfirmacion: "3FA9C21B",
      estado: "Confirmada",
      fechaDesde: "2026-10-16",
      fechaHasta: "2026-10-18",
      noches: 2,
      plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
      habitaciones: [
        { tipo: "Doble", adultos: 2, menores: 1 },
        { tipo: "Simple", adultos: 1, menores: 0 },
      ],
      total: 90001,
      cobrado: 15000,
      garantia: { tipo: "GARANTIA", marca: "Visa", ultimos4: "4242" },
      titular: "Juan P.",
      documento: "****222",
      cancelacion,
    });
  });

  test("sin claves prohibidas (ids, números de habitación, documento o email completos) en ningún nivel", () => {
    const r = armarRespuestaMiReserva(reserva, { puedeCancelarOnline: true, motivo: null, penalidad: null });
    expect(clavesProhibidas(r)).toEqual([]);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("30111222");
    expect(texto).not.toContain("juan@correo.com");
    expect(texto).not.toMatch(/\b(204|101)\b/);
  });

  test("mostrador: sin garantía; no reembolsable → PREPAGO y sin horas", () => {
    expect(armarRespuestaMiReserva({ ...reserva, datosWeb: null, garantiaReserva: null }, null).garantia).toBeNull();
    const nrf = armarRespuestaMiReserva({ ...reserva, planTarifario: { ...reserva.planTarifario, reembolsable: false } }, null);
    expect(nrf.garantia.tipo).toBe("PREPAGO");
    expect(nrf.plan.horasCancelacionSinCargo).toBeNull();
  });
});
