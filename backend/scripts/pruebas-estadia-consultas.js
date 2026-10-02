// Pruebas de que las transacciones de estadía hacen una cantidad FIJA de consultas: no crece con
// la cantidad de personas ni de habitaciones (auditoría de feature/estadia-ocupantes, punto
// "escrituras en bucle dentro de transacciones").
//
// Corren SIN base de datos, con el doble de Prisma compartido (_dobleSprint3.js), que cuenta las
// llamadas por tabla.método en `_contadorLlamadas`.
//
//   node scripts/pruebas-estadia-consultas.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
// La base real rechaza que la misma persona figure alojada dos veces (índice único de identidadActiva).
base._identidadActivaUnica = true;
instalarDoble(base);

const checkInServicio = require("../src/modulos/check-in/checkIn.servicio");
const checkOutServicio = require("../src/modulos/check-out/checkOut.servicio");
const reservasServicio = require("../src/modulos/reservas/reservas.servicio");
const estadia = require("../src/modulos/estadia/estadia.servicio");
const ingreso = require("../src/modulos/estadia/ingreso");
const { personasFixture, completarFixture } = require("./_ocupantesFixture");

let pasaron = 0;
const fallaron = [];

async function prueba(nombre, fn) {
  try {
    await fn();
    pasaron += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (err) {
    fallaron.push({ nombre, err });
    console.log(`  ✘ ${nombre}\n      ${err.message}`);
  }
}

function enDias(dias) {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  return new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const HUESPED = {
  paisDocumento: "AR",
  fechaNacimiento: "1990-01-01",
  nombre: "Ana Pérez",
  tipoDocumento: "DNI",
  numeroDocumento: "30111222",
  contacto: "ana@mail.com",
};
const GARANTIA_OK = { garantiaConfirmada: true, medioGarantia: "Efectivo" };

async function asegurarPlan() {
  let temporada = base._datos.temporada.find((t) => t.nivel === "BASE");
  if (!temporada) {
    temporada = await base.temporada.create({
      data: {
        nombre: "Base",
        nivel: "BASE",
        fechaDesde: null,
        fechaHasta: null,
        estadiaMinima: null,
        cierreLlegada: false,
        activa: true,
      },
    });
  }
  let plan = base._datos.planTarifario.find((p) => p.codigo === "BAR");
  if (!plan) {
    plan = await base.planTarifario.create({
      data: {
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
    });
  }
  return { temporada, plan };
}

// Precio 0: acá importa la cantidad de consultas, no la plata (así el check-out nunca se frena por saldo).
async function habitacion(numero, capacidad = 2) {
  const fila = base._sembrarHabitacion({ numero, capacidad });
  const { temporada } = await asegurarPlan();
  const yaTiene = base._datos.tarifa.some((t) => t.tipoHabitacionId === fila.tipoHabitacionId);
  if (!yaTiene) {
    await base.tarifa.create({
      data: {
        tipoHabitacionId: fila.tipoHabitacionId,
        temporadaId: temporada.id,
        precioBase: 0,
        adicionalAdultoExtra: 0,
        vigenteDesde: new Date(`${enDias(-365)}T00:00:00.000Z`),
      },
    });
  }
  return fila;
}

async function habitaciones(cantidad, capacidad = 2) {
  const filas = [];
  for (let i = 0; i < cantidad; i++)
    filas.push(await habitacion(`${100 + base._datos.habitacion.length + 1}`, capacidad));
  return filas.map((h) => ({ habitacionId: h.id, adultos: 2, menores: 0 }));
}

async function totalDe(datos) {
  const { plan } = await asegurarPlan();
  const cotizacion = await reservasServicio.cotizarParaReserva({
    ...datos,
    planTarifarioId: plan.id,
    canal: "RECEPCION",
  });
  return { planTarifarioId: plan.id, totalEsperado: cotizacion.planes[0]?.total ?? 0 };
}

async function reservaCompleta(habs, extra = {}) {
  const fechaDesde = extra.fechaDesde ?? enDias(0);
  const fechaHasta = extra.fechaHasta ?? enDias(2);
  const precio = await totalDe({ fechaDesde, fechaHasta, habitaciones: habs });
  const reserva = await reservasServicio.crearReserva({
    fechaDesde,
    fechaHasta,
    habitaciones: habs,
    ...precio,
    huesped: { ...HUESPED, ...(extra.huesped || {}) },
  });
  return completarFixture(reserva, habs);
}

// Cuenta las llamadas de `fn` que cumplen el filtro (prefijos de tabla.método), sin tocar el resto.
async function medir(prefijos, fn) {
  for (const clave of Object.keys(base._contadorLlamadas)) delete base._contadorLlamadas[clave];
  const resultado = await fn();
  const cuenta = {};
  for (const [clave, n] of Object.entries(base._contadorLlamadas)) {
    if (prefijos.some((p) => clave.startsWith(p))) cuenta[clave] = n;
  }
  return { cuenta, resultado };
}

function igual(chica, grande, descripcion) {
  assert.deepEqual(
    grande,
    chica,
    `${descripcion}: ${JSON.stringify(chica)} (chico) contra ${JSON.stringify(grande)} (grande)`,
  );
}

const TABLAS_ESTADIA = [
  "ocupanteReserva.",
  "huesped.",
  "asignacionOcupanteHabitacion.",
  "eventoEstadia.",
  "$executeRaw",
  "$queryRaw",
  "habitacion.",
  "notificacion.",
];

async function walkIn(habs) {
  const fechaHasta = enDias(2);
  const precio = await totalDe({ fechaDesde: enDias(0), fechaHasta, habitaciones: habs });
  return checkInServicio.registrarCheckInWalkIn({
    operador: "Prueba",
    personas: personasFixture(habs, HUESPED, enDias(0), fechaHasta),
    fechaHasta,
    habitaciones: habs,
    ...precio,
    huesped: { ...HUESPED },
    ...GARANTIA_OK,
  });
}

// Una reserva recién creada, sin ocupantes (como la deja el walk-in antes de cargar a las personas).
async function reservaSinOcupantes(habs) {
  const fechaDesde = enDias(0);
  const fechaHasta = enDias(2);
  const precio = await totalDe({ fechaDesde, fechaHasta, habitaciones: habs });
  const datos = reservasServicio.normalizarAltaReserva({
    fechaDesde,
    fechaHasta,
    habitaciones: habs,
    ...precio,
    huesped: { ...HUESPED },
    origen: "RECEPCION",
  });
  return base.$transaction((tx) => reservasServicio.crearReservaEnTransaccion(tx, datos, { incluirTitular: false }));
}

// Carga a las personas de un walk-in dentro de una transacción y cuenta solo esas consultas.
async function cargarWalkIn(habs, ajustar = (personas) => personas) {
  const reserva = await reservaSinOcupantes(habs);
  const personas = ajustar(personasFixture(habs, HUESPED, enDias(0), enDias(2)));
  return medir(TABLAS_ESTADIA, () =>
    base.$transaction((tx) => ingreso.cargarWalkIn(tx, reserva.id, personas, "Prueba")),
  );
}

async function main() {
  console.log("\nLas consultas no crecen con la cantidad de personas ni de habitaciones");

  await prueba(
    "walk-in: 2 personas en 1 habitación y 10 personas en 5 habitaciones hacen las mismas consultas",
    async () => {
      base._limpiar();
      const chica = await cargarWalkIn(await habitaciones(1));
      base._limpiar();
      const grande = await cargarWalkIn(await habitaciones(5));
      igual(chica.cuenta, grande.cuenta, "carga del walk-in");
      assert.equal(grande.cuenta["ocupanteReserva.update"] ?? 0, 0, "ningún update por ocupante");
      assert.equal(grande.cuenta["ocupanteReserva.create"] ?? 0, 0, "ningún create por ocupante");
      assert.equal(base._datos.ocupanteReserva.length, 10);
      assert.equal(base._datos.asignacionOcupanteHabitacion.length, 10);
      assert.equal(base._datos.eventoEstadia.length, 10);
    },
  );

  await prueba(
    "walk-in con adultos y menores: igual cantidad de consultas y el menor queda a cargo de su adulto",
    async () => {
      base._limpiar();
      const una = [{ ...(await habitaciones(1, 4))[0], adultos: 2, menores: 2 }];
      const chica = await cargarWalkIn(una);
      const menores = base._datos.ocupanteReserva.filter((o) => o.fechaNacimiento.getUTCFullYear() > 2000);
      assert.equal(menores.length, 2);
      for (const menor of menores) {
        const responsable = base._datos.ocupanteReserva.find((o) => o.id === menor.responsableId);
        assert.ok(responsable && responsable.responsableId === null, "el responsable es un adulto del mismo lote");
      }
      base._limpiar();
      const varias = await habitaciones(3, 4);
      const grande = await cargarWalkIn(varias.map((h) => ({ ...h, adultos: 2, menores: 2 })));
      igual(chica.cuenta, grande.cuenta, "walk-in con menores");
    },
  );

  await prueba("preparar el ingreso de una reserva: 2 personas y 10 personas hacen las mismas consultas", async () => {
    const consultas = async (cantidad) => {
      base._limpiar();
      const reserva = await reservaCompleta(await habitaciones(cantidad));
      return medir(TABLAS_ESTADIA.concat("reservaHabitacion."), () =>
        base.$transaction((tx) => ingreso.prepararIngreso(tx, reserva.id, "Prueba")),
      );
    };
    const chica = await consultas(1);
    const grande = await consultas(5);
    igual(chica.cuenta, grande.cuenta, "prepararIngreso");
    assert.equal(grande.cuenta["$executeRaw"], 1);
    assert.equal(base._datos.ocupanteReserva.filter((o) => o.estado === "Alojado").length, 10);
  });

  await prueba(
    "check-in de una reserva: ocupar 1 o 5 habitaciones hace las mismas consultas sobre habitaciones",
    async () => {
      const consultas = async (cantidad) => {
        base._limpiar();
        const reserva = await reservaCompleta(await habitaciones(cantidad));
        return medir(["habitacion."], () =>
          checkInServicio.confirmarCheckInConReserva({
            reservaId: reserva.id,
            numeroDocumentoIngresado: HUESPED.numeroDocumento,
            operador: "Prueba",
            ...GARANTIA_OK,
          }),
        );
      };
      const chica = await consultas(1);
      const grande = await consultas(5);
      igual(chica.cuenta, grande.cuenta, "check-in");
      assert.equal(grande.cuenta["habitacion.updateMany"], 1);
      assert.equal(grande.cuenta["habitacion.update"] ?? 0, 0);
      assert.ok(base._datos.habitacion.every((h) => h.estado === "ocupada"));
    },
  );

  await prueba(
    "check-out: cerrar 1 o 5 habitaciones hace las mismas consultas sobre habitaciones y notificaciones",
    async () => {
      const consultas = async (cantidad) => {
        base._limpiar();
        const habs = await habitaciones(cantidad);
        const reserva = await reservaCompleta(habs);
        await checkInServicio.confirmarCheckInConReserva({
          reservaId: reserva.id,
          numeroDocumentoIngresado: HUESPED.numeroDocumento,
          operador: "Prueba",
          ...GARANTIA_OK,
        });
        for (const h of habs) {
          await checkOutServicio.registrarVerificacion(reserva.id, {
            tipo: "SinNovedades",
            habitacionId: h.habitacionId,
            registradoPor: "Ana",
          });
        }
        return medir(
          ["habitacion.", "notificacion.", "$queryRaw", "ocupanteReserva.", "asignacionOcupanteHabitacion."],
          () => checkOutServicio.confirmarCheckOut(reserva.id, { cargosValidados: true }),
        );
      };
      const chica = await consultas(1);
      const grande = await consultas(5);
      igual(chica.cuenta, grande.cuenta, "check-out");
      assert.equal(grande.resultado.notificaciones.length, 5);
      assert.ok(base._datos.habitacion.every((h) => h.estado === "en limpieza"));
      assert.ok(base._datos.ocupanteReserva.every((o) => o.estado === "Retirado" && o.identidadActiva === null));
    },
  );

  await prueba(
    "modificar la ocupación de 1 o 4 habitaciones (con ocupaciones distintas) usa una sola sentencia",
    async () => {
      const consultas = async (cantidad) => {
        base._limpiar();
        const habs = await habitaciones(cantidad, 3);
        const reserva = await reservaCompleta(habs.map((h) => ({ ...h, adultos: 1, menores: 0 })));
        // Ocupaciones distintas entre sí: antes era un updateMany por cada par (adultos, menores).
        const nuevas = habs.map((h, i) => ({ ...h, adultos: 2, menores: i % 2 }));
        return medir(["reservaHabitacion.", "$executeRaw"], () =>
          reservasServicio.modificarReserva(reserva.id, { habitaciones: nuevas }),
        );
      };
      const chica = await consultas(1);
      const grande = await consultas(4);
      igual(chica.cuenta, grande.cuenta, "modificarReserva");
      assert.equal(grande.cuenta["$executeRaw"], 1);
      assert.equal(grande.cuenta["reservaHabitacion.updateMany"] ?? 0, 0);
      assert.equal(grande.cuenta["reservaHabitacion.update"] ?? 0, 0);
      assert.ok(base._datos.reservaHabitacion.every((rh) => rh.adultos === 2));
      assert.deepEqual(
        base._datos.reservaHabitacion.map((rh) => rh.menores),
        [0, 1, 0, 1],
      );
    },
  );

  console.log("\nLa carga en lote conserva las reglas de la carga persona por persona");

  await prueba("guarda nacionalidad y residencia en Huesped y la ficha del ocupante las muestra", async () => {
    base._limpiar();
    await walkIn(await habitaciones(1));
    const huesped = base._datos.huesped.find((h) => h.numeroDocumento === "80000002");
    assert.equal(huesped.nacionalidad, "AR");
    assert.equal(huesped.paisResidencia, "AR");
    assert.equal(base._datos.ocupanteReserva[0].nacionalidad, undefined, "OcupanteReserva ya no guarda esos datos");
    const [persona] = await estadia.listar(base._datos.ocupanteReserva[0].reservaId);
    assert.equal(persona.nacionalidad, "AR");
  });

  await prueba("rechaza más personas que la capacidad real de las habitaciones", async () => {
    base._limpiar();
    const habs = await habitaciones(1);
    const personas = personasFixture([{ ...habs[0], adultos: 2, menores: 1 }], HUESPED, enDias(0), enDias(2));
    const precio = await totalDe({ fechaDesde: enDias(0), fechaHasta: enDias(2), habitaciones: habs });
    await assert.rejects(
      () =>
        checkInServicio.registrarCheckInWalkIn({
          operador: "Prueba",
          personas,
          fechaHasta: enDias(2),
          habitaciones: habs,
          ...precio,
          huesped: { ...HUESPED },
          ...GARANTIA_OK,
        }),
      /como máximo 2 personas/,
    );
    assert.equal(base._datos.ocupanteReserva.length, 0, "el rechazo no deja nada a medias");
  });

  await prueba("rechaza el mismo documento dos veces en el lote", async () => {
    base._limpiar();
    const habs = await habitaciones(1);
    const personas = personasFixture(habs, HUESPED, enDias(0), enDias(2));
    personas[1].numeroDocumento = personas[0].numeroDocumento;
    const precio = await totalDe({ fechaDesde: enDias(0), fechaHasta: enDias(2), habitaciones: habs });
    await assert.rejects(
      () =>
        checkInServicio.registrarCheckInWalkIn({
          operador: "Prueba",
          personas,
          fechaHasta: enDias(2),
          habitaciones: habs,
          ...precio,
          huesped: { ...HUESPED },
          ...GARANTIA_OK,
        }),
      (err) => err.statusCode === 400 && /figura dos veces en la lista/.test(err.message),
    );
  });

  await prueba(
    "un menor sin documento queda con una ficha propia, con identidad provisoria y sin número inventado",
    async () => {
      base._limpiar();
      const habs = [{ ...(await habitaciones(1, 3))[0], adultos: 2, menores: 1 }];
      const personas = personasFixture(habs, HUESPED, enDias(0), enDias(2));
      Object.assign(personas[2], {
        tipoDocumento: undefined,
        numeroDocumento: undefined,
        paisDocumento: undefined,
        motivoSinDocumento: "Menor sin documento",
      });
      const precio = await totalDe({ fechaDesde: enDias(0), fechaHasta: enDias(2), habitaciones: habs });
      await checkInServicio.registrarCheckInWalkIn({
        operador: "Prueba",
        personas,
        fechaHasta: enDias(2),
        habitaciones: habs,
        ...precio,
        huesped: { ...HUESPED },
        ...GARANTIA_OK,
      });
      const sinDocumento = base._datos.huesped.find((h) => h.tipoDocumento === "Sin documento");
      assert.equal(sinDocumento.numeroDocumento, "");
      assert.ok(sinDocumento.identidadDocumento.startsWith("SIN-DOC:"));
      assert.equal(sinDocumento.nacionalidad, "AR");
    },
  );

  console.log("\nUna persona no puede figurar alojada dos veces a la vez");

  await prueba("dos check-in de la misma persona: el segundo falla; liberada la primera, ingresa", async () => {
    base._limpiar();
    const hs = await habitaciones(2);
    const unaPersona = (h) => [{ ...h, adultos: 1, menores: 0 }];
    const a = await reservaCompleta(unaPersona(hs[0]));
    const b = await reservaCompleta(unaPersona(hs[1]));
    const ingresar = (reserva) =>
      checkInServicio.confirmarCheckInConReserva({
        reservaId: reserva.id,
        numeroDocumentoIngresado: HUESPED.numeroDocumento,
        operador: "Prueba",
        ...GARANTIA_OK,
      });
    await ingresar(a);
    await assert.rejects(
      () => ingresar(b),
      (error) => error.statusCode === 409 && /ya figura alojada/.test(error.message),
    );
    assert.equal(
      base._datos.reserva.find((r) => r.id === b.id).estado,
      "Confirmada",
      "el ingreso rechazado no deja nada a medias",
    );
    assert.equal(base._datos.habitacion.find((h) => h.id === hs[1].habitacionId).estado, "libre");
    // Lo que hace el check-out de la primera estadía: libera la identidad.
    await base.ocupanteReserva.updateMany({
      where: { reservaId: a.id },
      data: { estado: "Retirado", identidadActiva: null },
    });
    await ingresar(b);
    assert.equal(base._datos.reserva.find((r) => r.id === b.id).estado, "En curso");
  });

  await prueba(
    "la misma persona en dos reservas consecutivas, con la ficha precargada en las dos, se guarda en ambas",
    async () => {
      base._limpiar();
      const hs = await habitaciones(2);
      const a = await reservaCompleta([{ ...hs[0], adultos: 1, menores: 0 }]);
      const b = await reservaCompleta([{ ...hs[1], adultos: 1, menores: 0 }], {
        fechaDesde: enDias(2),
        fechaHasta: enDias(4),
      });
      const fichas = [...(await estadia.listar(a.id)), ...(await estadia.listar(b.id))];
      assert.equal(fichas.length, 2);
      assert.equal(fichas[0].huespedId, fichas[1].huespedId, "una sola ficha de persona con dos estadías");
      assert.ok(
        fichas.every((f) => f.identidadActiva == null),
        "la identidad activa solo existe mientras está alojada",
      );
    },
  );

  console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
  if (fallaron.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
