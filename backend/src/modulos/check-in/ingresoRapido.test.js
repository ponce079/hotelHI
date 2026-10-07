// Ingreso por lotes: la cantidad de consultas DENTRO de la transacción no puede crecer con la cantidad de
jest.mock("../../lib/prisma", () => ({}));
// personas ni de habitaciones (con la base remota cada consulta cuesta ~400 ms y ocupa una conexión del pool).
const { prepararLote, escribirLote, esDuplicadoDeIdentidadActiva } = require("./ingresoRapido");

const DIA = 86400000;
function hoyUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

// Reserva grupal en memoria: `n` personas repartidas en habitaciones de capacidad 3 (un titular por habitación).
function escenario(n) {
  const desde = hoyUTC();
  const hasta = new Date(desde.getTime() + 2 * DIA);
  const habitaciones = Math.ceil(n / 3);
  const personas = [];
  const reservaHabitaciones = [];
  for (let h = 1; h <= habitaciones; h += 1) {
    const enHabitacion = Math.min(3, n - (h - 1) * 3);
    reservaHabitaciones.push({ habitacionId: h, adultos: enHabitacion, menores: 0, habitacion: { numero: String(100 + h), capacidad: 3 } });
    for (let i = 0; i < enHabitacion; i += 1) {
      const k = personas.length + 1;
      personas.push({
        id: k, habitacionId: h, esTitular: i === 0, nombre: `Nombre${k}`, apellido: `Apellido${k}`,
        tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: String(30000000 + k), fechaNacimiento: "1985-04-10",
        nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", domicilio: "Calle 1", telefono: "3875550100",
        email: `persona${k}@example.com`,
      });
    }
  }
  return { reserva: { id: 900 + n, fechaDesde: desde, fechaHasta: hasta, huesped: null, reservaHabitaciones }, personas };
}

// Doble de Prisma que cuenta CADA consulta que recibe.
function doble() {
  const llamadas = [];
  let idHuesped = 1000;
  let idOcupante = 5000;
  const huespedes = [];
  const ocupantes = [];
  const contar = (nombre, resultado) => (...argumentos) => {
    llamadas.push(nombre);
    return Promise.resolve(typeof resultado === "function" ? resultado(...argumentos) : resultado);
  };
  const cliente = {
    ocupanteReserva: { findMany: contar("ocupanteReserva.findMany", []), createMany: contar("ocupanteReserva.createMany", ({ data }) => {
      for (const fila of data) ocupantes.push({ ...fila, id: ++idOcupante });
      return { count: data.length };
    }) },
    reserva: { findMany: contar("reserva.findMany", []), update: contar("reserva.update", {}) },
    huesped: {
      findMany: contar("huesped.findMany", ({ where }) => {
        const identidades = where.identidadDocumento.in;
        return identidades.length ? huespedes.filter((h) => identidades.includes(h.identidadDocumento)) : [];
      }),
      createMany: contar("huesped.createMany", ({ data }) => {
        for (const fila of data) huespedes.push({ ...fila, id: ++idHuesped });
        return { count: data.length };
      }),
      update: contar("huesped.update", {}),
    },
    asignacionOcupanteHabitacion: { createMany: contar("asignacion.createMany", ({ data }) => ({ count: data.length })) },
    eventoEstadia: { createMany: contar("evento.createMany", ({ data }) => ({ count: data.length })) },
    $executeRaw: contar("raw", 1),
    // Relectura de las fichas recién creadas con lectura "actual" (FOR UPDATE): cuenta como la relectura de huéspedes.
    $queryRaw: contar("huesped.findMany", (sql) =>
      huespedes.filter((h) => sql.values.includes(h.identidadDocumento)).map((h) => ({ id: h.id, identidadDocumento: h.identidadDocumento })),
    ),
  };
  // Releer ocupantes: devuelve los creados Alojado de esa reserva (con su id).
  cliente.ocupanteReserva.findMany = contar("ocupanteReserva.findMany", ({ where }) => {
    if (where?.identidadActiva) return [];
    return ocupantes.filter((o) => o.estado === "Alojado" && (!where?.huespedId?.in || where.huespedId.in.includes(o.huespedId)));
  });
  return { cliente, llamadas, huespedes, ocupantes };
}

async function correr(n) {
  const { reserva, personas } = escenario(n);
  const previo = doble();
  const lote = await prepararLote(previo.cliente, reserva, personas);
  const tx = doble();
  await escribirLote(tx.cliente, {
    reserva, reservaId: reserva.id, fichas: lote.fichas, identidades: lote.identidades,
    huespedesExistentes: lote.huespedesExistentes, operador: "recepcionista.prueba",
  });
  return { previas: previo.llamadas.length, enTransaccion: tx.llamadas.length, llamadas: tx.llamadas, tx };
}

describe("ingreso por lotes: consultas constantes dentro de la transacción", () => {
  test.each([1, 3, 10, 20])("%i persona(s): sin una consulta por persona", async (n) => {
    const r = await correr(n);
    // fichas (createMany + relectura) + ocupantes (createMany + relectura) + asignaciones + eventos
    expect(r.llamadas).toEqual([
      "huesped.createMany", "huesped.findMany",
      "ocupanteReserva.createMany", "ocupanteReserva.findMany",
      "asignacion.createMany", "evento.createMany",
    ]);
  });

  test("la cantidad de consultas es la misma (±2) con 1, 3, 10 y 20 personas", async () => {
    const cuentas = [];
    for (const n of [1, 3, 10, 20]) cuentas.push((await correr(n)).enTransaccion);
    expect(Math.max(...cuentas) - Math.min(...cuentas)).toBeLessThanOrEqual(2);
    expect(Math.max(...cuentas)).toBeLessThanOrEqual(10);
  });

  test("con menores a cargo (necesitan el id del adulto) son 2 consultas más, no una por menor", async () => {
    const { reserva, personas } = escenario(4);
    // La persona 4 pasa a ser un menor a cargo del titular de la primera habitación.
    personas[3] = { ...personas[3], fechaNacimiento: "2018-05-10", habitacionId: 1, esTitular: false, responsableId: 1, vinculoResponsable: "Padre o madre", email: null };
    personas[2] = { ...personas[2], habitacionId: 2, esTitular: true };
    reserva.reservaHabitaciones = [
      { habitacionId: 1, adultos: 2, menores: 1, habitacion: { numero: "101", capacidad: 3 } },
      { habitacionId: 2, adultos: 1, menores: 0, habitacion: { numero: "102", capacidad: 3 } },
    ];
    personas[1] = { ...personas[1], habitacionId: 1, esTitular: false };
    personas[0] = { ...personas[0], habitacionId: 1, esTitular: true };
    const previo = doble();
    const lote = await prepararLote(previo.cliente, reserva, personas);
    const tx = doble();
    await escribirLote(tx.cliente, { reserva, reservaId: reserva.id, fichas: lote.fichas, identidades: lote.identidades, huespedesExistentes: lote.huespedesExistentes, operador: "x" });
    expect(tx.llamadas.filter((c) => c === "ocupanteReserva.createMany")).toHaveLength(2);
    expect(tx.llamadas.length).toBeLessThanOrEqual(8);
    const menor = tx.ocupantes.find((o) => o.nombre === "Nombre4");
    const adulto = tx.ocupantes.find((o) => o.nombre === "Nombre1");
    expect(menor.responsableId).toBe(adulto.id);
  });

  test("las fichas se crean con skipDuplicates (una ficha creada en paralelo se reutiliza sin pisarla)", async () => {
    const { reserva, personas } = escenario(3);
    const previo = doble();
    const lote = await prepararLote(previo.cliente, reserva, personas);
    const tx = doble();
    const espiar = jest.spyOn(tx.cliente.huesped, "createMany");
    await escribirLote(tx.cliente, { reserva, reservaId: reserva.id, fichas: lote.fichas, identidades: lote.identidades, huespedesExistentes: lote.huespedesExistentes, operador: "x" });
    expect(espiar).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  test("la relectura de las fichas es una lectura ACTUAL (FOR UPDATE): ve la ficha que otra operación acaba de confirmar", async () => {
    const { reserva, personas } = escenario(1);
    const previo = doble();
    const lote = await prepararLote(previo.cliente, reserva, personas);
    const tx = doble();
    const espiar = jest.spyOn(tx.cliente, "$queryRaw");
    await escribirLote(tx.cliente, { reserva, reservaId: reserva.id, fichas: lote.fichas, identidades: lote.identidades, huespedesExistentes: lote.huespedesExistentes, operador: "x" });
    expect(espiar).toHaveBeenCalledTimes(1);
    expect(espiar.mock.calls[0][0].sql).toMatch(/FOR UPDATE/);
  });

  test("los ocupantes quedan Alojado con su identidad activa (el índice único impide alojar dos veces a la misma persona)", async () => {
    const r = await correr(3);
    expect(r.tx.ocupantes).toHaveLength(3);
    for (const o of r.tx.ocupantes) {
      expect(o.estado).toBe("Alojado");
      expect(o.identidadActiva).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

test("un P2002 del índice único de identidadActiva se reconoce (y uno de otra columna, no)", () => {
  expect(esDuplicadoDeIdentidadActiva({ code: "P2002", message: "Unique constraint failed on the constraint: `identidadActiva`" })).toBe(true);
  expect(esDuplicadoDeIdentidadActiva({ code: "P2002", meta: { target: "ocupantes_reserva_identidadActiva_key" }, message: "x" })).toBe(true);
  expect(esDuplicadoDeIdentidadActiva({ code: "P2002", message: "Unique constraint failed on the constraint: `codigoConfirmacion`" })).toBe(false);
  expect(esDuplicadoDeIdentidadActiva(new Error("otra cosa"))).toBe(false);
});
