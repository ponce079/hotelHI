// Cubre HU-88 (alta de reserva CON seña, atómica — crearReservaConSena):
// nunca toca la base compartida ni manda un email real (a diferencia de
// scripts/prueba-email-reserva.js, que sí lo hace, a mano). El doble de
// Prisma es una versión reducida del de scripts/pruebas-reservas.js, con
// una diferencia clave: acá `$transaction` SÍ modela algo real, no solo un
// callback directo — encola las transacciones y cada una trabaja sobre una
// COPIA de las tablas, que solo se "commitea" si el callback no tira. Eso
// da (a) atomicidad real para el test de rollback, y (b) el mismo tipo de
// serialización que tiene la app real: src/lib/prisma.js configura
// connectionLimit: 1 porque la base de Clever Cloud es compartida por todo
// el equipo, así que ahí tampoco corren 2 transacciones en paralelo — se
// encolan. Modelar eso acá es más fiel a producción que simular locks por
// fila.

function coincideValor(valor, condicion) {
  if (condicion === null || typeof condicion !== "object" || condicion instanceof Date) {
    return valor === condicion;
  }
  return Object.entries(condicion).every(([operador, esperado]) => {
    switch (operador) {
      case "in":
        return esperado.includes(valor);
      case "not":
        return valor !== esperado;
      case "lt":
        return valor < esperado;
      case "gt":
        return valor > esperado;
      case "lte":
        return valor <= esperado;
      case "gte":
        return valor >= esperado;
      default:
        throw new Error(`Operador no soportado por el doble: ${operador}`);
    }
  });
}

function coincide(t, tabla, registro, where = {}) {
  return Object.entries(where).every(([campo, condicion]) => {
    if (campo === "OR") return condicion.some((sub) => coincide(t, tabla, registro, sub));
    if (campo === "AND") return condicion.every((sub) => coincide(t, tabla, registro, sub));
    if (tabla === "reservaHabitacion" && campo === "reserva") {
      const reserva = t.reserva.find((r) => r.id === registro.reservaId);
      return reserva ? coincide(t, "reserva", reserva, condicion) : false;
    }
    return coincideValor(registro[campo], condicion);
  });
}

function expandirReserva(t, reserva, include) {
  if (!reserva) return null;
  const salida = { ...reserva };
  if (include?.huesped) salida.huesped = t.huesped.find((h) => h.id === reserva.huespedId);
  if (include?.reservaHabitaciones) {
    salida.reservaHabitaciones = t.reservaHabitacion
      .filter((rh) => rh.reservaId === reserva.id)
      .map((rh) => ({
        ...rh,
        habitacion: t.habitacion.find((h) => h.id === rh.habitacionId),
        // Etapa 4C — checkOutFalsoFactory necesita esto para calcular el
        // total sobre ReservaNoche (ya no hay Habitacion.tarifaPorNoche).
        reservaNoches: t.reservaNoche.filter((n) => n.reservaHabitacionId === rh.id),
      }));
  }
  if (include?.notificaciones) {
    salida.notificaciones = t.notificacion.filter((n) => n.reservaId === reserva.id);
  }
  return salida;
}

function crearCliente(obtenerTablas) {
  return {
    ocupanteReserva: {
      create: async ({ data }) => {
        const t = obtenerTablas();
        const { asignaciones, ...resto } = data;
        const fila = { id: t.ocupanteReserva.length + 1, ...resto };
        t.ocupanteReserva.push(fila);
        t.asignacionOcupanteHabitacion.push({ ocupanteId: fila.id, ...asignaciones.create });
        return fila;
      },
    },
    eventoEstadia: {
      create: async ({ data }) => {
        const t = obtenerTablas();
        t.eventoEstadia.push(data);
        return data;
      },
    },
    habitacion: {
      findMany: async ({ where }) => obtenerTablas().habitacion.filter((h) => coincide(obtenerTablas(), "habitacion", h, where)),
      findUnique: async ({ where }) => obtenerTablas().habitacion.find((h) => h.id === where.id) ?? null,
    },
    // Etapa 4A (HU-95/96) — crearReserva ahora pasa por el motor de
    // cotización (cotizacion.servicio.js), que necesita estas 5 tablas.
    // Solo se implementa lo que ese camino de lectura pide: nada de acá
    // crea Temporada/PlanTarifario/Tarifa durante el test.
    tipoHabitacion: {
      findUnique: async ({ where }) => obtenerTablas().tipoHabitacion.find((t) => t.id === where.id) ?? null,
    },
    temporada: {
      findMany: async ({ where = {} }) => {
        const t = obtenerTablas();
        return t.temporada.filter((x) => coincide(t, "temporada", x, where));
      },
    },
    planTarifario: {
      findMany: async ({ where = {} }) => {
        const t = obtenerTablas();
        return t.planTarifario.filter((x) => coincide(t, "planTarifario", x, where));
      },
      findUnique: async ({ where }) => obtenerTablas().planTarifario.find((p) => p.id === where.id) ?? null,
    },
    tarifa: {
      findMany: async ({ where = {} }) => {
        const t = obtenerTablas();
        return t.tarifa.filter((x) => coincide(t, "tarifa", x, where));
      },
    },
    modificadorDiaSemana: {
      findMany: async () => obtenerTablas().modificadorDiaSemana,
    },
    reservaNoche: {
      createMany: async ({ data }) => {
        const t = obtenerTablas();
        for (const fila of data) t.reservaNoche.push({ id: t.secuencias.reservaNoche++, ...fila });
        return { count: data.length };
      },
      create: async ({ data }) => {
        const t = obtenerTablas();
        const fila = { id: t.secuencias.reservaNoche++, ...data };
        t.reservaNoche.push(fila);
        return fila;
      },
    },
    reservaHabitacion: {
      findMany: async ({ where }) => {
        const t = obtenerTablas();
        return t.reservaHabitacion
          .filter((rh) => coincide(t, "reservaHabitacion", rh, where))
          .map((rh) => ({
            ...rh,
            habitacion: t.habitacion.find((h) => h.id === rh.habitacionId),
            reserva: t.reserva.find((r) => r.id === rh.reservaId),
          }));
      },
    },
    huesped: {
      upsert: async ({ where, create, update }) => {
        const t = obtenerTablas();
        let fila = t.huesped.find((h) => h.identidadDocumento === where.identidadDocumento);
        if (fila) {
          Object.assign(fila, update);
          return fila;
        }
        fila = { id: t.secuencias.huesped++, ...create };
        t.huesped.push(fila);
        return fila;
      },
      findFirst: async ({ where }) => {
        const t = obtenerTablas();
        return t.huesped.find((h) => coincide(t, "huesped", h, where)) ?? null;
      },
      create: async ({ data }) => {
        const t = obtenerTablas();
        const fila = { id: t.secuencias.huesped++, ...data };
        t.huesped.push(fila);
        return fila;
      },
      update: async ({ where, data }) => {
        const t = obtenerTablas();
        const fila = t.huesped.find((h) => h.id === where.id);
        Object.assign(fila, data);
        return fila;
      },
    },
    reserva: {
      create: async ({ data, include }) => {
        const t = obtenerTablas();
        const { reservaHabitaciones, ...resto } = data;
        const fila = { id: t.secuencias.reserva++, ...resto };
        t.reserva.push(fila);
        const creadas = (reservaHabitaciones?.create ?? []).map((rh) => {
          const nueva = { id: t.secuencias.reservaHabitacion++, reservaId: fila.id, ...rh };
          t.reservaHabitacion.push(nueva);
          return nueva;
        });
        // Etapa 4A — crearReservaEnTransaccion pide de vuelta las filas
        // reservaHabitaciones recién creadas (para mapear habitacionId ->
        // reservaHabitacionId y colgarles las ReservaNoche).
        return include?.reservaHabitaciones ? { ...fila, reservaHabitaciones: creadas } : fila;
      },
      findUnique: async ({ where, include }) => {
        const t = obtenerTablas();
        const fila =
          where.id !== undefined
            ? t.reserva.find((r) => r.id === where.id)
            : t.reserva.find((r) => r.codigoConfirmacion === where.codigoConfirmacion);
        return fila ? expandirReserva(t, fila, include) : null;
      },
      update: async ({ where, data }) => {
        const t = obtenerTablas();
        const fila = t.reserva.find((r) => r.id === where.id);
        Object.assign(fila, data);
        return fila;
      },
    },
    notificacion: {
      create: async ({ data }) => {
        const t = obtenerTablas();
        const fila = { id: t.secuencias.notificacion++, fechaEnvio: new Date(), ...data };
        t.notificacion.push(fila);
        return fila;
      },
    },
    pagoEstadia: {
      create: async ({ data }) => {
        const t = obtenerTablas();
        const { medios, ...resto } = data;
        const fila = { id: t.secuencias.pagoEstadia++, anulado: false, fecha: new Date(), ...resto };
        t.pagoEstadia.push(fila);
        const mediosCreados = (medios?.create ?? []).map((m) => {
          const medioFila = { id: t.secuencias.pagoEstadiaMedio++, pagoEstadiaId: fila.id, ...m };
          t.pagoEstadiaMedio.push(medioFila);
          return medioFila;
        });
        return { ...fila, medios: mediosCreados, reserva: t.reserva.find((r) => r.id === fila.reservaId) };
      },
      findMany: async ({ where }) => {
        const t = obtenerTablas();
        return t.pagoEstadia
          .filter((p) => coincide(t, "pagoEstadia", p, where))
          .map((p) => ({ ...p, medios: t.pagoEstadiaMedio.filter((m) => m.pagoEstadiaId === p.id) }));
      },
    },
    // El lock real de FOR UPDATE lo da la serialización global de
    // $transaction más abajo — acá no hace falta simular nada más.
    $queryRaw: async () => [],
  };
}

function crearDoblePrisma() {
  let tablas = {
    ocupanteReserva: [],
    asignacionOcupanteHabitacion: [],
    eventoEstadia: [],
    habitacion: [{ id: 1, numero: "101", tipoHabitacionId: 1, capacidad: 2, piso: 1, activo: true }],
    // Etapa 4A — fixture mínima de tarifas: un tipo con ocupación base 2, la
    // temporada Base, el plan BAR y una Tarifa vigente hace mucho a $50000 —
    // así el total que cotiza el motor (100000 = 2 noches × 50000) coincide
    // con lo que ya esperaban estos tests.
    tipoHabitacion: [{ id: 1, nombre: "Doble", ocupacionBase: 2, activo: true }],
    temporada: [
      {
        id: 1,
        nombre: "Base",
        nivel: "BASE",
        fechaDesde: null,
        fechaHasta: null,
        estadiaMinima: null,
        cierreLlegada: false,
        activa: true,
      },
    ],
    planTarifario: [
      {
        id: 1,
        codigo: "BAR",
        nombre: "Best Available Rate",
        tipo: "BASE",
        planBaseId: null,
        descuentoPorcentaje: null,
        reembolsable: true,
        horasCancelacionSinCargo: 48,
        penalidadNoShow: "PRIMERA_NOCHE",
        visibleWeb: true,
        activo: true,
      },
    ],
    tarifa: [
      {
        id: 1,
        tipoHabitacionId: 1,
        temporadaId: 1,
        precioBase: 50000,
        adicionalAdultoExtra: 0,
        vigenteDesde: new Date("2020-01-01T00:00:00.000Z"),
      },
    ],
    modificadorDiaSemana: [],
    reservaNoche: [],
    reserva: [],
    reservaHabitacion: [],
    huesped: [],
    notificacion: [],
    pagoEstadia: [],
    pagoEstadiaMedio: [],
    secuencias: {
      reserva: 1,
      reservaHabitacion: 1,
      huesped: 1,
      notificacion: 1,
      pagoEstadia: 1,
      pagoEstadiaMedio: 1,
      reservaNoche: 1,
    },
  };

  function clonarTablas(t) {
    return {
      habitacion: t.habitacion.map((r) => ({ ...r })),
      tipoHabitacion: t.tipoHabitacion.map((r) => ({ ...r })),
      temporada: t.temporada.map((r) => ({ ...r })),
      planTarifario: t.planTarifario.map((r) => ({ ...r })),
      tarifa: t.tarifa.map((r) => ({ ...r })),
      modificadorDiaSemana: t.modificadorDiaSemana.map((r) => ({ ...r })),
      reservaNoche: t.reservaNoche.map((r) => ({ ...r })),
      reserva: t.reserva.map((r) => ({ ...r })),
      reservaHabitacion: t.reservaHabitacion.map((r) => ({ ...r })),
      huesped: t.huesped.map((r) => ({ ...r })),
      notificacion: t.notificacion.map((r) => ({ ...r })),
      pagoEstadia: t.pagoEstadia.map((r) => ({ ...r })),
      pagoEstadiaMedio: t.pagoEstadiaMedio.map((r) => ({ ...r })),
      ocupanteReserva: t.ocupanteReserva.map((r) => ({ ...r })),
      asignacionOcupanteHabitacion: t.asignacionOcupanteHabitacion.map((r) => ({ ...r })),
      eventoEstadia: t.eventoEstadia.map((r) => ({ ...r })),
      secuencias: { ...t.secuencias },
    };
  }

  // Cola global: cada $transaction espera a que la anterior termine (commit
  // o rollback) antes de arrancar — mismo efecto que connectionLimit: 1 en
  // la app real.
  let cola = Promise.resolve();
  function encolar(fn) {
    const resultado = cola.then(fn, fn);
    cola = resultado.then(
      () => {},
      () => {}
    );
    return resultado;
  }

  const prismaFalso = {
    ...crearCliente(() => tablas),
    $transaction: (fn) =>
      encolar(async () => {
        const copia = clonarTablas(tablas);
        const tx = crearCliente(() => copia);
        const resultado = await fn(tx);
        tablas = copia; // "commit" atómico — si fn tiró, esta línea nunca corre
        return resultado;
      }),
  };

  return { prismaFalso, obtenerTablas: () => tablas };
}

// --------------------------------------------------------------

function checkOutFalsoFactory() {
  return {
    ErrorDeNegocio: class ErrorDeNegocioFalso extends Error {},
    // Mismo cálculo que consolidarCargos, reducido a lo que necesita esta
    // reserva recién creada (sin consumos ni garantías todavía): suma de
    // las ReservaNoche ya congeladas, menos lo ya pagado (nada, la primera
    // vez). Etapa 4C: ya no puede caer a Habitacion.tarifaPorNoche (esa
    // columna no existe más), así que suma directo de reservaNoches, igual
    // que la implementación real.
    consolidarCargos: async (reservaId, tx) => {
      const reserva = await tx.reserva.findUnique({
        where: { id: Number(reservaId) },
        include: { reservaHabitaciones: { include: { habitacion: true } } },
      });
      const totalAdeudado = (reserva.reservaHabitaciones ?? []).reduce(
        (acc, rh) => acc + (rh.reservaNoches ?? []).reduce((a, n) => a + Number(n.precioNoche), 0),
        0
      );
      const pagos = await tx.pagoEstadia.findMany({ where: { reservaId: Number(reservaId), anulado: false } });
      const totalPagado = pagos.reduce((acc, p) => acc + p.medios.reduce((a, m) => a + Number(m.importe), 0), 0);
      return { estadoReserva: reserva.estado, totalAdeudado, totalPagado, saldo: totalAdeudado - totalPagado };
    },
  };
}

function huespedValido(sufijo) {
  return {
    paisDocumento: "AR",
    nombre: "Huésped de Prueba",
    tipoDocumento: "DNI",
    numeroDocumento: `3000000${sufijo}`,
    fechaNacimiento: "1990-01-01",
    contacto: `huesped${sufijo}@ejemplo.com`,
  };
}

function altaBase(sufijo, overrides = {}) {
  return {
    fechaDesde: "2027-03-10",
    fechaHasta: "2027-03-12",
    habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
    planTarifarioId: 1,
    // 2 noches × 50000 (precioBase de la Tarifa sembrada) = 100000.
    totalEsperado: 100000,
    huesped: huespedValido(sufijo),
    canalConfirmacion: "Email",
    origen: "RECEPCION",
    medios: [{ tipo: "Efectivo", importe: 20000 }],
    ...overrides,
  };
}

describe("crearReservaConSena (HU-88, alta + seña atómica)", () => {
  let doble;
  let reservasServicio;

  beforeEach(() => {
    jest.resetModules();
    doble = crearDoblePrisma();
    jest.doMock("../../lib/prisma", () => doble.prismaFalso);
    jest.doMock("../check-out/checkOut.servicio", () => checkOutFalsoFactory());
    jest.doMock("../../lib/correo", () => ({ enviarCorreo: jest.fn().mockResolvedValue({ enviado: true, messageId: "fake-id" }) }));
    reservasServicio = require("./reservas.servicio");
  });

  test("si el cobro de la seña falla, no queda ninguna Reserva creada (rollback completo)", async () => {
    await expect(
      reservasServicio.crearReservaConSena(altaBase("1", { medios: [{ tipo: "Efectivo", importe: -100 }] }))
    ).rejects.toThrow(/importe mayor a cero/i);

    const t = doble.obtenerTablas();
    expect(t.reserva).toHaveLength(0);
    expect(t.reservaHabitacion).toHaveLength(0);
    expect(t.pagoEstadia).toHaveLength(0);
    expect(t.huesped).toHaveLength(0);
    expect(t.notificacion).toHaveLength(0);
    expect(t.ocupanteReserva).toHaveLength(0);
    expect(t.asignacionOcupanteHabitacion).toHaveLength(0);
    expect(t.eventoEstadia).toHaveLength(0);
  });

  test("si todo sale bien, Reserva y PagoEstadia quedan creados juntos y consistentes", async () => {
    const resultado = await reservasServicio.crearReservaConSena(altaBase("2"));

    expect(resultado.codigoConfirmacion).toBeTruthy();
    expect(resultado.pagoSenia).toMatchObject({ concepto: "Seña", estado: "Parcial" });

    const t = doble.obtenerTablas();
    expect(t.reserva).toHaveLength(1);
    expect(t.reserva[0].estado).toBe("Confirmada");
    expect(t.ocupanteReserva).toHaveLength(1);
    expect(t.asignacionOcupanteHabitacion).toHaveLength(1);
    expect(t.ocupanteReserva[0].reservaId).toBe(t.reserva[0].id);
    expect(t.pagoEstadia).toHaveLength(1);
    expect(t.pagoEstadia[0].reservaId).toBe(t.reserva[0].id);
    expect(t.pagoEstadia[0].concepto).toBe("Seña");
    expect(t.pagoEstadiaMedio).toHaveLength(1);
    expect(Number(t.pagoEstadiaMedio[0].importe)).toBe(20000);
    // Un huésped nuevo y una única fila de habitación asociada — nada
    // duplicado ni huérfano.
    expect(t.huesped).toHaveLength(1);
    expect(t.reservaHabitacion).toHaveLength(1);
  });

  test("dos altas simultáneas para la misma habitación y fechas: una sola puede tener éxito", async () => {
    const [a, b] = await Promise.allSettled([
      reservasServicio.crearReservaConSena(altaBase("3")),
      reservasServicio.crearReservaConSena(altaBase("4")),
    ]);

    const resultados = [a, b];
    const exitosas = resultados.filter((r) => r.status === "fulfilled");
    const fallidas = resultados.filter((r) => r.status === "rejected");
    expect(exitosas).toHaveLength(1);
    expect(fallidas).toHaveLength(1);
    expect(String(fallidas[0].reason.message)).toMatch(/No hay disponibilidad/i);

    // La perdedora no dejó ni reserva ni pago colgando — solo existe lo que
    // creó la ganadora.
    const t = doble.obtenerTablas();
    expect(t.reserva).toHaveLength(1);
    expect(t.pagoEstadia).toHaveLength(1);
    expect(t.huesped).toHaveLength(1);
  });
});
