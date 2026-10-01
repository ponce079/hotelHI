// Usa exclusivamente la base local aislada. No carga .env ni envía correos.
const assert = require("node:assert/strict");
require("../../scripts/entorno-estadia.cjs").cargarEntorno("test");
process.env.DATABASE_SSL = "false";
const p = require("../src/lib/prisma");
const rutaCorreo = require.resolve("../src/lib/correo");
require.cache[rutaCorreo] = {
  id: rutaCorreo,
  filename: rutaCorreo,
  loaded: true,
  exports: { enviarCorreo: async () => ({ enviado: false }) },
};
const s = require("../src/modulos/estadia/estadia.servicio");
const reservas = require("../src/modulos/reservas/reservas.servicio");
const cargos = require("../src/modulos/servicios-adicionales/serviciosAdicionales.servicio");
const checkin = require("../src/modulos/check-in/checkIn.servicio");
const checkout = require("../src/modulos/check-out/checkOut.servicio");
const pagos = require("../src/modulos/pagos-estadia/pagoEstadia.servicio");
const {
  cotizarReserva,
} = require("../src/modulos/tarifas/cotizacion.servicio");
const { asegurarTitular } = require("../src/modulos/estadia/titular.servicio");

async function main() {
  const marca = Date.now().toString(),
    hoy = reservas.hoyComoFechaUTC();
  const hasta = new Date(hoy.getTime() + 2 * 86400000),
    iso = (d) => d.toISOString().slice(0, 10);
  const temporada =
    (await p.temporada.findFirst({ where: { nivel: "BASE" } })) ||
    (await p.temporada.create({
      data: { nombre: "Base pruebas", nivel: "BASE" },
    }));
  const plan = await p.planTarifario.upsert({
    where: { codigo: "BAR" },
    update: {},
    create: {
      codigo: "BAR",
      nombre: "Flexible pruebas",
      tipo: "BASE",
      horasCancelacionSinCargo: 48,
      penalidadNoShow: "PRIMERA_NOCHE",
    },
  });
  let secuencia = 0;
  const documento = () =>
    String(20000000 + Number(marca.slice(-6)) * 10 + secuencia++);
  async function habitacion(capacidad = 2, precioBase = 100000) {
    const codigo = `T${marca}-${secuencia++}`;
    const tipo = await p.tipoHabitacion.create({
      data: { codigo, nombre: codigo, ocupacionBase: 1 },
    });
    await p.tarifa.create({
      data: {
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        precioBase,
        adicionalAdultoExtra: 10000,
        vigenteDesde: new Date("2020-01-01"),
      },
    });
    return p.habitacion.create({
      data: { numero: codigo, tipoHabitacionId: tipo.id, capacidad, piso: 1 },
    });
  }
  async function datos(habitaciones) {
    const d = {
      fechaDesde: iso(hoy),
      fechaHasta: iso(hasta),
      habitaciones,
      planTarifarioId: plan.id,
      huesped: {
        paisDocumento: "AR",
        fechaNacimiento: "1990-01-01",
        nombre: "Titular Prueba",
        tipoDocumento: "DNI",
        numeroDocumento: documento(),
        contacto: "local@example.test",
      },
      origen: "RECEPCION",
    };
    d.totalEsperado = (
      await cotizarReserva({ ...d, canal: "RECEPCION" })
    ).planes[0].total;
    return d;
  }
  const ficha = (h, doc = documento(), extra = {}) => ({
    nombre: "Persona",
    apellido: "Prueba",
    tipoDocumento: "DNI",
    numeroDocumento: doc,
    paisDocumento: "AR",
    fechaNacimiento: "1990-01-01",
    nacionalidad: "AR",
    paisResidencia: "AR",
    habitacionId: h.id,
    operador: "Prueba local",
    ...extra,
  });
  const ingresar = (r, doc) =>
    checkin.confirmarCheckInConReserva({
      reservaId: r.id,
      numeroDocumentoIngresado: doc,
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
      operador: "Prueba local",
    });
  async function verificar(r) {
    for (const persona of await s.listar(r.id))
      await s.accion(r.id, persona.id, {
        accion: "verificar",
        operador: "Prueba local",
      });
  }

  const h1 = await habitacion(2),
    h2 = await habitacion(1, 80000);
  const d = await datos([
    { habitacionId: h1.id, adultos: 1, menores: 1 },
    { habitacionId: h2.id, adultos: 1, menores: 0 },
  ]);
  const r = await reservas.crearReserva(d),
    inicial = await s.listar(r.id);
  assert.equal(inicial.length, 1);
  assert.equal(iso(inicial[0].fechaNacimiento), d.huesped.fechaNacimiento);
  assert.equal(
    iso(new Date(r.huesped.fechaNacimiento)),
    d.huesped.fechaNacimiento,
  );
  await assert.rejects(
    () => ingresar(r, d.huesped.numeroDocumento),
    /nombre y apellido|registradas/,
  );
  await assert.rejects(
    () =>
      s.guardar(
        r.id,
        inicial[0].id,
        ficha(h1, d.huesped.numeroDocumento, { fechaNacimiento: "2015-01-01" }),
      ),
    /18 años/,
  );
  const a = await s.guardar(
    r.id,
    inicial[0].id,
    ficha(h1, d.huesped.numeroDocumento, {
      email: "familia@example.test",
      telefono: "123456789",
    }),
  );
  await assert.rejects(
    () => s.guardar(r.id, null, ficha(h1, d.huesped.numeroDocumento)),
    /ya está registrada/,
  );
  const hijo = await s.guardar(
    r.id,
    null,
    ficha(h1, undefined, {
      fechaNacimiento: "2015-01-01",
      responsableId: a.id,
      usarContactoResponsable: true,
    }),
  );
  assert.equal(hijo.email, a.email);
  assert.equal(hijo.telefono, a.telefono);
  await assert.rejects(() => s.guardar(r.id, null, ficha(h1)), /capacidad/);
  await s.guardar(r.id, null, ficha(h2, undefined, { esTitular: true }));
  await assert.rejects(
    () => ingresar(r, d.huesped.numeroDocumento),
    /Verificá/,
  );
  assert.equal(
    (await p.reserva.findUnique({ where: { id: r.id } })).estado,
    "Confirmada",
  );
  await verificar(r);
  await ingresar(r, d.huesped.numeroDocumento);
  assert.equal(
    (await s.listar(r.id)).filter((x) => x.estado === "Alojado").length,
    3,
  );
  await assert.rejects(
    () => s.accion(r.id, a.id, { accion: "retirar", operador: "Prueba" }),
    /menores/,
  );
  await p.tarifa.updateMany({
    where: { tipoHabitacionId: h1.tipoHabitacionId },
    data: { precioBase: 900000 },
  });
  let cuenta = await checkout.consolidarCargos(r.id);
  assert.equal(cuenta.totalAdeudado, d.totalEsperado);
  assert.equal(cuenta.totalPagado, 30000);
  const payload = {
    reservaId: r.id,
    habitacionId: h1.id,
    tipoServicio: "Lavandería",
    descripcion: "Dos prendas",
    cantidad: 2,
    precioUnitario: 5000,
    registradoPor: "Prueba",
    claveOperacion: `test-${marca}`,
  };
  const cargo = await cargos.registrarConsumo(payload);
  assert.equal((await cargos.registrarConsumo(payload)).id, cargo.id);
  assert.equal(
    (
      await cargos.registrarConsumo({
        ...payload,
        claveOperacion: `incl-${marca}`,
        incluido: true,
      })
    ).monto,
    0,
  );
  cuenta = await checkout.consolidarCargos(r.id);
  assert.equal(cuenta.totalAdeudado, d.totalEsperado + 10000);
  assert.equal(
    cuenta.habitaciones.find((h) => h.habitacionId === h1.id).adicionales,
    10000,
  );
  await cargos.anularConsumo(cargo.id, {
    motivo: "Prueba de anulación",
    operador: "Prueba",
  });
  assert.equal(
    (await checkout.consolidarCargos(r.id)).totalAdeudado,
    d.totalEsperado,
  );
  await assert.rejects(
    () =>
      checkout.registrarVerificacion(r.id, {
        tipo: "SinNovedades",
        registradoPor: "Prueba",
      }),
    /Seleccioná/,
  );
  await checkout.registrarVerificacion(r.id, {
    habitacionId: h1.id,
    tipo: "SinNovedades",
    registradoPor: "Prueba",
  });
  await assert.rejects(
    () => checkout.confirmarCheckOut(r.id, { cargosValidados: true }),
    /verificar/,
  );
  await checkout.registrarVerificacion(r.id, {
    habitacionId: h2.id,
    tipo: "SinNovedades",
    registradoPor: "Prueba",
  });
  await pagos.crearPago({
    reservaId: r.id,
    medios: [{ tipo: "Efectivo", importe: d.totalEsperado - 30000 }],
  });
  await checkout.confirmarCheckOut(r.id, { cargosValidados: true });
  assert.equal(
    (await s.listar(r.id)).filter((x) => x.estado === "Retirado").length,
    3,
  );
  assert.equal(
    (await p.habitacion.findUnique({ where: { id: h1.id } })).estado,
    "en limpieza",
  );
  await assert.rejects(
    () =>
      cargos.registrarConsumo({
        ...payload,
        claveOperacion: `closed-${marca}`,
      }),
    /reserva cerrada/i,
  );
  console.log(
    "OK: titular, menor, capacidad, verificación, noches congeladas, cargos por habitación, garantía y check-out.",
  );

  const hw = await habitacion(),
    dw = await datos([{ habitacionId: hw.id, adultos: 1, menores: 1 }]);
  const walk = {
    ...dw,
    garantiaConfirmada: true,
    medioGarantia: "Efectivo",
    operador: "Prueba",
    personas: [
      { ...ficha(hw, dw.huesped.numeroDocumento, { esTitular: true }), id: 1 },
    ],
  };
  const antes = await p.reserva.count();
  await assert.rejects(
    () => checkin.registrarCheckInWalkIn(walk),
    /registradas/,
  );
  assert.equal(await p.reserva.count(), antes);
  assert.equal(
    (await p.habitacion.findUnique({ where: { id: hw.id } })).estado,
    "libre",
  );
  walk.personas.push({
    ...ficha(hw, undefined, {
      fechaNacimiento: "2015-01-01",
      responsableId: 1,
    }),
    id: 2,
  });
  const rw = await checkin.registrarCheckInWalkIn(walk);
  assert.equal(
    (await s.listar(rw.id)).filter((x) => x.estado === "Alojado").length,
    2,
  );
  console.log(
    "OK: walk-in, rollback si falta una persona y garantías históricas.",
  );

  for (const tipo of ["Efectivo", "Transferencia"]) {
    const h = await habitacion(),
      ds = await datos([{ habitacionId: h.id, adultos: 1, menores: 0 }]);
    const antes = await p.reserva.count();
    await assert.rejects(
      () =>
        reservas.crearReservaConSena({
          ...ds,
          medios: [{ tipo, importe: ds.totalEsperado + 1 }],
        }),
      /supera el saldo/,
    );
    assert.equal(await p.reserva.count(), antes);
    const rs = await reservas.crearReservaConSena({
      ...ds,
      medios: [{ tipo, importe: 40000 }],
    });
    assert.equal(Number(rs.pagoSenia.medios[0].importe), 40000);
    const [auto1, auto2] = await Promise.all([
      asegurarTitular(rs.id, "Prueba"),
      asegurarTitular(rs.id, "Prueba"),
    ]);
    assert.equal(auto1.ocupanteId, auto2.ocupanteId);
    assert.equal((await s.listar(rs.id)).length, 1);
    assert.equal(
      (await checkout.consolidarCargos(rs.id)).saldo,
      ds.totalEsperado - 40000,
    );
  }
  console.log(
    "OK: señas en efectivo/transferencia, rollback y titular concurrente sin duplicación.",
  );

  const hm = await habitacion(3),
    dm = await datos([{ habitacionId: hm.id, adultos: 1, menores: 0 }]);
  const rm = await reservas.crearReserva(dm);
  const rhAntes = await p.reservaHabitacion.findFirst({
      where: { reservaId: rm.id },
    }),
    titularAntes = (await s.listar(rm.id))[0];
  await s.guardar(
    rm.id,
    titularAntes.id,
    ficha(hm, dm.huesped.numeroDocumento),
  );
  await verificar(rm);
  const cambios = {
    habitaciones: [{ habitacionId: hm.id, adultos: 2, menores: 0 }],
    fechaHasta: iso(new Date(hasta.getTime() + 86400000)),
  };
  const previa = await reservas.modificarReserva(rm.id, {
    ...cambios,
    soloPrevia: true,
  });
  assert.equal(previa.totalNuevo, 330000);
  await reservas.modificarReserva(rm.id, cambios);
  assert.equal(
    (await p.reservaHabitacion.findFirst({ where: { reservaId: rm.id } })).id,
    rhAntes.id,
  );
  const titularDespues = (await s.listar(rm.id))[0];
  assert.equal(titularDespues.id, titularAntes.id);
  assert.equal(iso(titularDespues.fechaHasta), cambios.fechaHasta);
  assert.equal(titularDespues.verificadoEn, null);
  assert.equal(
    (await checkout.consolidarCargos(rm.id)).totalAdeudado,
    previa.totalNuevo,
  );
  await s.guardar(rm.id, null, ficha(hm));
  await verificar(rm);
  await ingresar(rm, dm.huesped.numeroDocumento);
  console.log(
    "OK: modificación recotizada, habitación/titular conservados, fechas sincronizadas y check-in.",
  );

  // I1: una persona conserva su ficha en otra reserva.
  const hc = await habitacion(2),
    dc = await datos([{ habitacionId: hc.id, adultos: 2, menores: 0 }]);
  const rc = await reservas.crearReserva(dc);
  const repetida = await s.guardar(
    rc.id,
    null,
    ficha(hc, d.huesped.numeroDocumento),
  );
  assert.equal(repetida.huespedId, a.huespedId);
  assert.equal(
    await p.huesped.count({
      where: {
        identidadDocumento:
          require("../src/modulos/estadia/persona.servicio").claveDocumento(a),
      },
    }),
    1,
  );

  // I2 e I4: titulares explícitos y ampliación atómica con precios del motor.
  const ha = await habitacion(2),
    da = await datos([{ habitacionId: ha.id, adultos: 1, menores: 0 }]);
  const ra = await reservas.crearReserva(da),
    titularA = (await s.listar(ra.id))[0];
  await s.guardar(
    ra.id,
    titularA.id,
    ficha(ha, da.huesped.numeroDocumento, { esTitular: false }),
  );
  await verificar(ra);
  await assert.rejects(
    () => ingresar(ra, da.huesped.numeroDocumento),
    /exactamente un titular/,
  );
  await s.guardar(
    ra.id,
    titularA.id,
    ficha(ha, da.huesped.numeroDocumento, { esTitular: true }),
  );
  const extra = await s.guardar(
    ra.id,
    null,
    ficha(ha, undefined, { esTitular: true }),
  );
  await verificar(ra);
  let advertencia;
  try {
    await ingresar(ra, da.huesped.numeroDocumento);
  } catch (e) {
    advertencia = e;
  }
  assert.equal(advertencia?.statusCode, 409);
  assert.equal(
    advertencia.codigo,
    "AMPLIACION_OCUPACION_REQUIERE_CONFIRMACION",
  );
  const confirmarAmpliacion = (token) =>
    checkin.confirmarCheckInConReserva({
      reservaId: ra.id,
      numeroDocumentoIngresado: da.huesped.numeroDocumento,
      garantiaConfirmada: true,
      medioGarantia: "Efectivo",
      operador: "Prueba",
      confirmacionAmpliacion: token,
    });
  await assert.rejects(
    () => confirmarAmpliacion(advertencia.detalle.token),
    /exactamente un titular/,
  );
  assert.equal(
    (await p.reservaHabitacion.findFirst({ where: { reservaId: ra.id } }))
      .adultos,
    1,
  );
  assert.equal(
    (await checkout.consolidarCargos(ra.id)).totalAdeudado,
    da.totalEsperado,
  );
  await s.guardar(
    ra.id,
    extra.id,
    ficha(ha, extra.numeroDocumento, { esTitular: false }),
  );
  await verificar(ra);
  const cotizada = await cotizarReserva({
    ...da,
    habitaciones: [{ habitacionId: ha.id, adultos: 2, menores: 0 }],
    canal: "RECEPCION",
  });
  assert.equal(advertencia.detalle.totalNuevo, cotizada.planes[0].total);
  await confirmarAmpliacion(advertencia.detalle.token);
  assert.equal(
    (await checkout.consolidarCargos(ra.id)).totalAdeudado - da.totalEsperado,
    advertencia.detalle.diferencia,
  );
  assert.equal(
    (await p.reservaHabitacion.findFirst({ where: { reservaId: ra.id } }))
      .adultos,
    2,
  );
  assert.equal(
    (await s.listar(ra.id)).filter((x) => x.estado === "Alojado").length,
    2,
  );
  console.log(
    "OK: I1 ficha única; I2 cero/dos titulares; I4 advertencia, rollback y ampliación recotizada.",
  );

  const express = require("express"),
    app = express();
  app.use(express.json());
  app.use("/api/estadia", require("../src/modulos/estadia/estadia.routes"));
  app.use(
    "/api/consumos-servicios",
    require("../src/modulos/servicios-adicionales/serviciosAdicionales.routes"),
  );
  app.use("/api/check-in", require("../src/modulos/check-in/checkIn.routes"));
  const server = await new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const ruta of [
      `/api/estadia/${rw.id}/ocupantes`,
      `/api/estadia/${rw.id}/historial`,
      "/api/consumos-servicios/hotel/resumen",
    ])
      assert.equal((await fetch(url + ruta)).status, 200);
    const res = await fetch(url + "/api/check-in/walk-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...walk, cantidadesOcupantes: [] }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(
    "OK: rutas HTTP y rechazo de ocupación duplicada en contratos anteriores.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
