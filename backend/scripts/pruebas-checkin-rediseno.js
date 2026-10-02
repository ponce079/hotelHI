// Pruebas de integración del rediseño del check-in (etapa 1, backend), contra una base LOCAL
// (ESTADIA_TEST_DATABASE_URL, misma guardia que npm run test:estadia). Fechas siempre relativas
// a hoy. Cada bloque crea sus propios tipos, habitaciones y personas con una marca única.
//
//   npm run test:checkin-rediseno
const assert = require("node:assert/strict");
const { haceAnios, enDias } = require("./_fechasPrueba");
const entorno = require("./_entornoPruebas");
entorno.cargarEntornoDePruebas();
entorno.prepararEsquema();
const p = require("../src/lib/prisma");
const rutaCorreo = require.resolve("../src/lib/correo");
require.cache[rutaCorreo] = {
  id: rutaCorreo,
  filename: rutaCorreo,
  loaded: true,
  exports: { enviarCorreo: async () => ({ enviado: false }) },
};
const reservas = require("../src/modulos/reservas/reservas.servicio");
const checkin = require("../src/modulos/check-in/checkIn.servicio");
const apoyo = require("../src/modulos/check-in/checkIn.apoyo.servicio");
const huespedes = require("../src/modulos/huespedes/huespedes.servicio");
const { claveDocumento } = require("../src/modulos/estadia/persona.servicio");
const { firmarToken } = require("../src/modulos/usuarios/usuarios.seguridad");
const { MONTO_GARANTIA } = require("../src/modulos/check-in/checkIn.constantes");

const marca = Date.now().toString().slice(-7);
let secuencia = 0;
const sufijo = () => `${marca}${secuencia++}`;
const documento = () => String(40000000 + Number(marca.slice(-5)) * 100 + secuencia++);
const OPERADOR = "Prueba rediseño";
const GARANTIA = { garantiaConfirmada: true, medioGarantia: "Efectivo" };

let resultados = 0;
function ok(mensaje) {
  resultados += 1;
  console.log(`OK: ${mensaje}`);
}

// Rechazo con status y mensaje esperados.
async function rechaza(fn, status, patron, codigo) {
  await assert.rejects(fn, (err) => {
    assert.equal(err.statusCode, status, `status ${err.statusCode}: ${err.message}`);
    if (patron) assert.match(err.message, patron);
    if (codigo) assert.equal(err.codigo, codigo);
    return true;
  });
}

async function neutralizarModificadoresDeDiaSemana() {
  const originales = await p.modificadorDiaSemana.findMany();
  await p.modificadorDiaSemana.updateMany({ data: { porcentaje: 0 } });
  return async () => {
    for (const { id, porcentaje } of originales) await p.modificadorDiaSemana.update({ where: { id }, data: { porcentaje } });
  };
}

async function pruebas({ bar, nrf, temporada }) {
  async function tipo({ ocupacionBase = 2, precioBase = 100000, adicional = 10000 } = {}) {
    const codigo = `R${sufijo()}`;
    const t = await p.tipoHabitacion.create({ data: { codigo, nombre: `Rediseño ${codigo}`, ocupacionBase } });
    await p.tarifa.create({
      data: {
        tipoHabitacionId: t.id,
        temporadaId: temporada.id,
        precioBase,
        adicionalAdultoExtra: adicional,
        vigenteDesde: new Date("2020-01-01"),
      },
    });
    return t;
  }
  const habitacion = (t, capacidad = 3, extra = {}) =>
    p.habitacion.create({ data: { numero: `H${sufijo()}`, tipoHabitacionId: t.id, capacidad, piso: 1, ...extra } });

  function persona(id, habitacionId, anios, extra = {}) {
    return {
      id,
      habitacionId,
      nombre: `Persona${id}`,
      apellido: `Rediseño${marca}`,
      tipoDocumento: "DNI",
      paisDocumento: "AR",
      numeroDocumento: documento(),
      fechaNacimiento: haceAnios(anios),
      nacionalidad: "AR",
      paisResidencia: "AR",
      localidad: "Salta",
      domicilio: "Calle Falsa 123",
      telefono: "+54 387 555-1234",
      email: "",
      // Un menor lleva el vínculo de su responsable (padre o madre, salvo que la prueba diga otro).
      ...(extra.responsableId ? { vinculoResponsable: "Padre o madre" } : {}),
      ...extra,
    };
  }

  async function cotizar(habitaciones, planId, noches = 2) {
    const r = await reservas.cotizarParaReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(noches),
      habitaciones,
      planTarifarioId: planId,
      canal: "RECEPCION",
    });
    return r.planes[0].total;
  }

  // Reserva Confirmada que ingresa hoy. El titular de la reserva tiene el documento de `titular`.
  async function reservar(habitaciones, { plan = bar, titular, noches = 2 } = {}) {
    const huesped = {
      nombre: `${titular.nombre} ${titular.apellido}`,
      tipoDocumento: titular.tipoDocumento,
      paisDocumento: titular.paisDocumento,
      numeroDocumento: titular.numeroDocumento,
      fechaNacimiento: titular.fechaNacimiento,
      contacto: "titular@example.test",
    };
    const totalEsperado = await cotizar(habitaciones, plan.id, noches);
    const r = await reservas.crearReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(noches),
      habitaciones,
      planTarifarioId: plan.id,
      totalEsperado,
      huesped,
      origen: "RECEPCION",
    });
    return { reserva: await reservas.obtenerReserva(r.id), total: totalEsperado };
  }

  const confirmar = (reserva, cuerpo) =>
    checkin.confirmarCheckInConReserva({ reservaId: reserva.id, operador: OPERADOR, ...GARANTIA, ...cuerpo });

  async function foto(reservaId) {
    const [ocupantes, noches, eventos, pagos, reserva, rh] = await Promise.all([
      p.ocupanteReserva.findMany({ where: { reservaId }, select: { id: true, estado: true } }),
      p.reservaNoche.aggregate({ where: { reservaHabitacion: { reservaId } }, _sum: { precioNoche: true }, _count: true }),
      p.eventoEstadia.count({ where: { reservaId } }),
      p.pagoEstadia.count({ where: { reservaId } }),
      p.reserva.findUnique({ where: { id: reservaId }, select: { estado: true, huespedId: true } }),
      p.reservaHabitacion.findMany({ where: { reservaId }, select: { habitacionId: true, adultos: true, menores: true } }),
    ]);
    return {
      ocupantes: JSON.stringify(ocupantes),
      noches: `${noches._count}|${noches._sum.precioNoche}`,
      eventos,
      pagos,
      reserva: JSON.stringify(reserva),
      rh: JSON.stringify(rh),
    };
  }

  // ---------------------------------------------------------------- criterio 1
  const doble = await tipo({ ocupacionBase: 2 });
  {
    const h = await habitacion(doble, 3);
    const titular = persona(1, h.id, 40, { esTitular: true });
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 2, menores: 1 }], { titular });
    const previas = await p.ocupanteReserva.findMany({ where: { reservaId: reserva.id } });
    assert.equal(previas.length, 1, "el alta incorpora al titular como ficha prevista");
    const personas = [titular, persona(2, h.id, 38), persona(3, h.id, 8, { responsableId: 1, telefono: "" })];
    const r = await confirmar(reserva, {
      habitaciones: [{ habitacionIdAnterior: h.id, habitacionId: h.id, adultos: 2, menores: 1 }],
      personas,
      totalEsperado: total,
    });
    assert.equal(r.estado, "En curso");
    const ocupantes = await p.ocupanteReserva.findMany({ where: { reservaId: reserva.id }, include: { asignaciones: true } });
    const alojados = ocupantes.filter((o) => o.estado === "Alojado");
    assert.equal(alojados.length, 3);
    assert.ok(alojados.every((o) => o.verificadoEn && o.verificadoPor === OPERADOR), "fichas verificadas por el operador");
    assert.equal(alojados.filter((o) => o.esTitular).length, 1);
    const reemplazada = ocupantes.find((o) => o.id === previas[0].id);
    assert.equal(reemplazada.estado, "Cancelado", "la ficha prevista anterior queda dada de baja");
    const evento = await p.eventoEstadia.findFirst({
      where: { reservaId: reserva.id, detalle: { contains: "Reemplazada en el check-in" } },
    });
    assert.ok(evento, "la baja queda auditada con su motivo");
    assert.equal((await p.habitacion.findUnique({ where: { id: h.id } })).estado, "ocupada");
    const quienReservo = await p.huesped.findUnique({ where: { id: reserva.huespedId } });
    assert.equal(quienReservo.contacto, "titular@example.test", "el correo de quien reservó se conserva");
    assert.equal(quienReservo.localidad, "Salta", "y se completan sus datos declarados");
    const garantias =await p.pagoEstadia.findMany({ where: { reservaId: reserva.id, concepto: "Garantía" }, include: { medios: true } });
    assert.equal(garantias.length, 1);
    assert.equal(Number(garantias[0].medios[0].importe), MONTO_GARANTIA);
    ok("1 — reserva 2 adultos + 1 menor confirmada con 3 personas en una llamada (En curso, verificadas, ocupada, una garantía)");

    // ------------------------------------------------------------ PERSONA_ALOJADA (aditivo, etapa 2)
    {
      const otra = await habitacion(doble, 3);
      const nuevoTitular = persona(7, otra.id, 33, { esTitular: true });
      const { reserva: segunda, total: totalSegunda } = await reservar([{ habitacionId: otra.id, adultos: 2, menores: 0 }], {
        titular: nuevoTitular,
      });
      const antesSegunda = await foto(segunda.id);
      // La persona 2 de la primera reserva ya está alojada: se la carga como acompañante (id temporal 8).
      const yaAlojada = { ...personas[1], id: 8, habitacionId: otra.id };
      const err = await confirmar(segunda, {
        habitaciones: [{ habitacionIdAnterior: otra.id, adultos: 2, menores: 0 }],
        personas: [nuevoTitular, yaAlojada],
        totalEsperado: totalSegunda,
      }).catch((e) => e);
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Ya figura alojada en otra estadía/);
      assert.equal(err.codigo, "PERSONA_ALOJADA");
      assert.deepEqual(err.detalle, { personas: [8] });
      assert.deepEqual(await foto(segunda.id), antesSegunda, "nada escrito");
      ok("409 PERSONA_ALOJADA: mismo mensaje y status, con el id temporal de la fila en detalle.personas");
    }

    // ------------------------------------------------------------ criterio 8 (sobre esta ficha)
    const encontrado = await huespedes.buscarPorDocumento({ tipo: "DNI", pais: "AR", numero: titular.numeroDocumento });
    assert.equal(encontrado.nombre, "Persona1");
    assert.equal(encontrado.apellido, titular.apellido);
    assert.equal(encontrado.alojadaAhora, true);
    assert.equal(encontrado.fechaUltimaEstadia, enDias(0));
    assert.equal(encontrado.telefono, titular.telefono);
    assert.deepEqual(Object.keys(encontrado).sort(), [
      "alojadaAhora", "apellido", "domicilio", "email", "fechaNacimiento", "fechaUltimaEstadia", "localidad",
      "nacionalidad", "nombre", "numeroDocumento", "paisDocumento", "paisResidencia", "telefono", "tipoDocumento",
    ]);
    await rechaza(() => huespedes.buscarPorDocumento({ tipo: "DNI", pais: "AR", numero: titular.numeroDocumento.slice(0, -1) }), 404);
    await rechaza(() => huespedes.buscarPorDocumento({ tipo: "DNI", pais: "UY", numero: titular.numeroDocumento }), 404);
    await http(titular.numeroDocumento);
    ok("8 — persona que vuelve: exacta devuelve solo la ficha permitida; parcial u otro país → 404; sin sesión → 401");
  }

  // ---------------------------------------------------------------- criterio 2
  {
    const h = await habitacion(doble, 3);
    const titular = persona(1, h.id, 40, { esTitular: true });
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 2, menores: 1 }], { titular });
    const sinMenor = await cotizar([{ habitacionId: h.id, adultos: 2, menores: 0 }], bar.id);
    assert.equal(sinMenor, total, "el menor no suma cargo");
    await confirmar(reserva, {
      habitaciones: [{ habitacionIdAnterior: h.id, adultos: 2, menores: 0 }],
      personas: [titular, persona(2, h.id, 35)],
      totalEsperado: total,
    });
    const rh = await p.reservaHabitacion.findFirst({ where: { reservaId: reserva.id } });
    assert.deepEqual([rh.adultos, rh.menores], [2, 0]);
    assert.equal((await reservas.obtenerReserva(reserva.id)).totalEstimadoAlojamiento, total);
    ok("2 — el menor no vino: total igual y ocupación de la reserva actualizada a 2 + 0");
  }

  // ---------------------------------------------------------------- criterio 3
  {
    const h = await habitacion(doble, 3);
    const titular = persona(1, h.id, 50, { esTitular: true });
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 3, menores: 0 }], { titular });
    const conDos = await cotizar([{ habitacionId: h.id, adultos: 2, menores: 0 }], bar.id);
    assert.equal(total - conDos, 10000 * 2, "BAR: un adulto adicional por noche");
    const previa = await apoyo.previaOcupacion(reserva.id, { habitaciones: [{ habitacionIdAnterior: h.id, adultos: 2, menores: 0 }] });
    assert.equal(previa.diferencia, -20000);
    assert.equal(previa.diferenciaPorNoche.length, 2);
    assert.ok(previa.diferenciaPorNoche.every((n) => n.diferencia === -10000));
    assert.equal(previa.porHabitacion[0].diferencia, -20000);
    await confirmar(reserva, {
      habitaciones: [{ habitacionIdAnterior: h.id, adultos: 2, menores: 0 }],
      personas: [titular, persona(2, h.id, 48)],
      totalEsperado: conDos,
    });
    assert.equal((await reservas.obtenerReserva(reserva.id)).totalEstimadoAlojamiento, conDos);

    const h2 = await habitacion(doble, 3);
    const titularNrf = persona(1, h2.id, 50, { esTitular: true });
    const nrfReserva = await reservar([{ habitacionId: h2.id, adultos: 3, menores: 0 }], { titular: titularNrf, plan: nrf });
    const previaNrf = await apoyo.previaOcupacion(nrfReserva.reserva.id, {
      habitaciones: [{ habitacionIdAnterior: h2.id, adultos: 2, menores: 0 }],
    });
    assert.equal(previaNrf.diferencia, 0);
    assert.match(previaNrf.mensajeNoReembolsable, /no reembolsable/i);
    await confirmar(nrfReserva.reserva, {
      habitaciones: [{ habitacionIdAnterior: h2.id, adultos: 2, menores: 0 }],
      personas: [titularNrf, persona(2, h2.id, 47)],
      totalEsperado: nrfReserva.total,
    });
    assert.equal((await reservas.obtenerReserva(nrfReserva.reserva.id)).totalEstimadoAlojamiento, nrfReserva.total);
    ok("3 — 3 adultos en Doble confirmada con 2: en BAR baja un adicional × noches; en NRF el total no baja");
  }

  // ---------------------------------------------------------------- criterios 4 y 5
  {
    const h = await habitacion(doble, 3);
    const titular = persona(1, h.id, 40, { esTitular: true });
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 3, menores: 0 }], { titular });
    const antes = await foto(reserva.id);
    const cuerpo = {
      habitaciones: [{ habitacionIdAnterior: h.id, adultos: 2, menores: 0 }],
      personas: [titular, persona(2, h.id, 30)],
      totalEsperado: total, // desactualizado: con 2 adultos corresponde menos
    };
    await assert.rejects(
      () => confirmar(reserva, cuerpo),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.codigo, "PRECIO_CAMBIO");
        assert.equal(err.detalle.totalAnterior, total);
        assert.equal(err.detalle.totalNuevo, total - 20000);
        assert.equal(err.detalle.diferencia, -20000);
        assert.ok("mensajeNoReembolsable" in err.detalle);
        return true;
      },
    );
    assert.deepEqual(await foto(reserva.id), antes, "el 409 no escribe nada");
    // Contrato HTTP que consume la etapa 2: { error, codigo, detalle }.
    const respuesta = await conServidor(async (url) => {
      const r = await fetch(`${url}/api/check-in/${reserva.id}/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpo, operador: OPERADOR, ...GARANTIA }),
      });
      return { status: r.status, json: await r.json() };
    });
    assert.equal(respuesta.status, 409);
    assert.equal(respuesta.json.codigo, "PRECIO_CAMBIO");
    assert.deepEqual(Object.keys(respuesta.json.detalle).sort(), ["diferencia", "mensajeNoReembolsable", "totalAnterior", "totalNuevo"]);
    assert.match(respuesta.json.error, /El total cambió/);
    assert.deepEqual(await foto(reserva.id), antes, "tampoco por HTTP");
    ok("4 — totalEsperado desactualizado: 409 PRECIO_CAMBIO (también por HTTP, con codigo y detalle) y la reserva queda exactamente igual");

    const base = { habitaciones: [{ habitacionIdAnterior: h.id, adultos: 3, menores: 0 }], totalEsperado: total };
    const tres = () => [titular, persona(2, h.id, 30), persona(3, h.id, 25)];
    const casos = [
      ["personas distintas de la ocupación", { personas: tres().slice(0, 2) }, /se indicaron 3 adultos y 0 menores, pero se cargaron 2 adultos y 0 menores/],
      ["0 adultos", { habitaciones: [{ habitacionIdAnterior: h.id, adultos: 0, menores: 3 }], personas: tres() }, /tiene que ingresar al menos un adulto/],
      ["capacidad superada", { habitaciones: [{ habitacionIdAnterior: h.id, adultos: 4, menores: 0 }], personas: [...tres(), persona(4, h.id, 22)] }, /entran como máximo 3 personas y se indicaron 4/],
      ["dos titulares", { personas: [titular, persona(2, h.id, 30, { esTitular: true }), persona(3, h.id, 25)] }, /hay 2 titulares/],
      ["titular menor de 18", { personas: [{ ...titular, esTitular: false }, persona(2, h.id, 30), persona(3, h.id, 16, { esTitular: true, responsableId: 2 })] }, /tiene que ser mayor de 18 años/],
      ["menor sin responsable", { habitaciones: [{ habitacionIdAnterior: h.id, adultos: 2, menores: 1 }], personas: [titular, persona(2, h.id, 30), persona(3, h.id, 7)] }, /es menor de 18 años: indicá qué adulto es su responsable/],
    ];
    for (const [nombre, extra, patron] of casos) {
      await rechaza(() => confirmar(reserva, { ...base, ...extra }), 400, patron, "OCUPACION_INVALIDA");
    }
    const repetida = tres();
    repetida[2].numeroDocumento = repetida[1].numeroDocumento;
    await rechaza(() => confirmar(reserva, { ...base, personas: repetida }), 400, /tienen el mismo documento/);
    const errorClaro = await confirmar(reserva, { ...base, personas: tres().slice(0, 2) }).catch((e) => e);
    assert.ok(errorClaro.detalle.porHabitacion[0].errores.length > 0, "detalle por habitación para la barra de faltantes");
    assert.doesNotMatch(errorClaro.message, /habitacionId|esTitular|responsableId|fechaNacimiento|OcupanteReserva/);
    assert.deepEqual(await foto(reserva.id), antes, "ningún 400 escribe nada");
    ok("5 — diferencias de ocupación, 0 adultos, capacidad, dos titulares, titular menor, menor sin responsable y persona repetida → 400 claros");
  }

  // ---------------------------------------------------------------- criterio 6
  {
    const h = await habitacion(doble, 3);
    const quienReservo = persona(9, h.id, 60);
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 2, menores: 0 }], { titular: quienReservo });
    const viajan = [persona(1, h.id, 35, { esTitular: true }), persona(2, h.id, 33)];
    const cuerpo = { habitaciones: [{ habitacionIdAnterior: h.id, adultos: 2, menores: 0 }], personas: viajan, totalEsperado: total };
    await rechaza(() => confirmar(reserva, cuerpo), 400, /no figura como titular de ninguna habitación\. Indicá el motivo/, "MOTIVO_TITULAR_REQUERIDO");
    await confirmar(reserva, { ...cuerpo, motivoTitularDistinto: "Reservó un familiar que no viaja" });
    const final = await p.reserva.findUnique({ where: { id: reserva.id } });
    assert.equal(final.estado, "En curso");
    assert.equal(final.huespedId, reserva.huespedId, "quien reservó y paga no cambia");
    const auditoria = await p.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: "Titular distinto del de la reserva" } });
    assert.equal(auditoria.operador, OPERADOR);
    assert.ok(auditoria.fecha instanceof Date);
    assert.equal(JSON.parse(auditoria.detalle).motivo, "Reservó un familiar que no viaja");
    ok("6 — titular distinto sin motivo → 400; con motivo confirma, queda auditado y la reserva sigue a nombre de quien reservó");
  }

  // ---------------------------------------------------------------- criterio 7 (y ajuste c)
  {
    const twin = await tipo({ ocupacionBase: 2 });
    const a = await habitacion(doble, 3);
    const b = await habitacion(doble, 3);
    const otroTipo = await habitacion(twin, 3);
    const enMantenimiento = await habitacion(doble, 3, { estado: "mantenimiento" });
    const titular = persona(1, b.id, 40, { esTitular: true });
    const { reserva, total } = await reservar([{ habitacionId: a.id, adultos: 2, menores: 0 }], { titular });
    const nochesAntes = await p.reservaNoche.findMany({ where: { reservaHabitacion: { reservaId: reserva.id } }, orderBy: { fecha: "asc" } });
    const cambio = (destino) => ({
      habitaciones: [{ habitacionIdAnterior: a.id, habitacionId: destino.id, adultos: 2, menores: 0 }],
      personas: [{ ...titular, habitacionId: destino.id }, persona(2, destino.id, 38)],
      totalEsperado: total,
    });
    await rechaza(() => confirmar(reserva, cambio(otroTipo)), 409, /es de otro tipo/, "CAMBIO_HABITACION_INVALIDO");
    await rechaza(() => confirmar(reserva, cambio(enMantenimiento)), 409, /no está libre/, "CAMBIO_HABITACION_INVALIDO");
    // Aditivo de la etapa 2: el 409 dice qué habitación de la reserva marcar en la pantalla.
    for (const destino of [otroTipo, enMantenimiento]) {
      const err = await confirmar(reserva, cambio(destino)).catch((e) => e);
      assert.deepEqual(err.detalle, { habitacionIdAnterior: a.id });
    }
    // Ya incluida en la reserva: una reserva de dos habitaciones que intenta mover una sobre la otra.
    const c = await habitacion(doble, 3);
    const d = await habitacion(doble, 3);
    const titular2 = persona(1, c.id, 40, { esTitular: true });
    const doble2 = await reservar(
      [{ habitacionId: c.id, adultos: 1, menores: 0 }, { habitacionId: d.id, adultos: 1, menores: 0 }],
      { titular: titular2 },
    );
    await rechaza(
      () =>
        confirmar(doble2.reserva, {
          habitaciones: [
            { habitacionIdAnterior: c.id, habitacionId: d.id, adultos: 1, menores: 0 },
            { habitacionIdAnterior: d.id, habitacionId: c.id, adultos: 1, menores: 0 },
          ],
          personas: [{ ...titular2, habitacionId: d.id }, persona(2, c.id, 30, { esTitular: true })],
          totalEsperado: doble2.total,
        }),
      409,
      /ya forma parte de esta reserva/,
      "CAMBIO_HABITACION_INVALIDO",
    );
    // Ocupada por otra reserva en esas noches.
    const tomada = await habitacion(doble, 3);
    await reservar([{ habitacionId: tomada.id, adultos: 1, menores: 0 }], { titular: persona(1, tomada.id, 44) });
    await rechaza(() => confirmar(reserva, cambio(tomada)), 409, /no está disponible para todas las noches/, "CAMBIO_HABITACION_INVALIDO");

    await confirmar(reserva, cambio(b));
    const rh = await p.reservaHabitacion.findMany({ where: { reservaId: reserva.id } });
    assert.deepEqual(rh.map((x) => x.habitacionId), [b.id]);
    const nochesDespues = await p.reservaNoche.findMany({ where: { reservaHabitacion: { reservaId: reserva.id } }, orderBy: { fecha: "asc" } });
    assert.deepEqual(nochesDespues.map((n) => [n.id, Number(n.precioNoche)]), nochesAntes.map((n) => [n.id, Number(n.precioNoche)]));
    const asignaciones = await p.asignacionOcupanteHabitacion.findMany({
      where: { ocupante: { reservaId: reserva.id, estado: "Alojado" }, hasta: null },
    });
    assert.ok(asignaciones.length === 2 && asignaciones.every((x) => x.habitacionId === b.id));
    const [anterior, definitiva] = await Promise.all([
      p.habitacion.findUnique({ where: { id: a.id } }),
      p.habitacion.findUnique({ where: { id: b.id } }),
    ]);
    assert.equal(anterior.estado, "libre", "la habitación anterior no cambia de estado");
    assert.equal(anterior.estadoAnterior, null);
    assert.equal(definitiva.estado, "ocupada", "solo se ocupa la definitiva");
    ok("7 — cambio a otra libre del mismo tipo: reserva, noches (mismo precio) y asignaciones en la nueva; la anterior intacta; otro tipo, no libre, ya incluida u ocupada → 409");
  }

  // ---------------------------------------------------------------- criterios 9 y 10 (y ajuste b)
  {
    const twin = await tipo({ ocupacionBase: 2 });
    const h1 = await habitacion(doble, 3);
    const h2 = await habitacion(twin, 2);
    const titular = persona(1, h1.id, 42, { esTitular: true, email: "", telefono: "+54 387 444-5566" });
    // Ajuste b: la persona ya existe como Huesped (con otro nombre): se reutiliza y se actualiza.
    await p.huesped.create({
      data: {
        nombre: "Nombre viejo",
        tipoDocumento: "DNI",
        paisDocumento: "AR",
        numeroDocumento: titular.numeroDocumento,
        identidadDocumento: claveDocumento(titular),
        contacto: "viejo@example.test",
      },
    });
    const habitaciones = [
      { habitacionId: h1.id, adultos: 2, menores: 1 },
      { habitacionId: h2.id, adultos: 2, menores: 0 },
    ];
    const totalEsperado = await cotizar(habitaciones, bar.id, 2);
    const personas = [
      titular,
      persona(2, h1.id, 40),
      persona(3, h1.id, 9, { responsableId: 1, telefono: "" }),
      persona(4, h2.id, 20, { esTitular: true, telefono: "" }),
      persona(5, h2.id, 19, { telefono: "" }),
    ];
    const walk = { operador: OPERADOR, fechaHasta: enDias(2), habitaciones, planTarifarioId: bar.id, totalEsperado, personas, ...GARANTIA };
    const r = await checkin.registrarCheckInWalkIn(walk);
    assert.equal(r.habitaciones.length, 2);
    assert.equal(r.totalEstimadoAlojamiento, totalEsperado, "mismo total que /reservas/cotizar");
    const ocupantes = await p.ocupanteReserva.findMany({ where: { reservaId: r.id }, include: { asignaciones: true } });
    assert.equal(ocupantes.filter((o) => o.estado === "Alojado").length, 5);
    for (const h of [h1, h2])
      assert.equal(ocupantes.filter((o) => o.esTitular && o.asignaciones[0].habitacionId === h.id).length, 1);
    assert.equal(await p.pagoEstadia.count({ where: { reservaId: r.id, concepto: "Garantía" } }), 1);
    const huespedReserva = await p.huesped.findUnique({ where: { id: r.huespedId } });
    assert.equal(huespedReserva.identidadDocumento, claveDocumento(titular));
    assert.equal(await p.huesped.count({ where: { identidadDocumento: claveDocumento(titular) } }), 1, "no se duplica");
    assert.equal(huespedReserva.nombre, `${titular.nombre} ${titular.apellido}`, "se actualiza con lo declarado");
    assert.deepEqual([huespedReserva.nombres, huespedReserva.apellido], [titular.nombre, titular.apellido], "walk-in: nombres y apellido separados");
    assert.equal(huespedReserva.contacto, "viejo@example.test", "un correo ya guardado no se pisa con el teléfono");
    // Persona nueva que solo deja teléfono: el contacto de su ficha es el teléfono.
    const nuevaSoloTelefono = await p.huesped.findUnique({ where: { identidadDocumento: claveDocumento(personas[3]) } });
    assert.equal(nuevaSoloTelefono.contacto, null, "un acompañante sin correo ni teléfono queda sin contacto");
    ok("9 — walk-in Doble (2+1) y Twin (2), mismo plan: una reserva, 5 ocupantes, un titular por habitación, total del cotizador, una garantía, titular solo con teléfono y Huesped reutilizado");

    const h3 = await habitacion(doble, 3);
    const p3 = [persona(1, h3.id, 40, { esTitular: true })];
    const base3 = { operador: OPERADOR, fechaHasta: enDias(2), planTarifarioId: bar.id, totalEsperado: 1, ...GARANTIA };
    await rechaza(
      () => checkin.registrarCheckInWalkIn({ ...base3, habitaciones: [{ habitacionId: h3.id, adultos: 1, menores: 0 }, { habitacionId: h3.id, adultos: 1, menores: 0 }], personas: p3 }),
      400,
      /figura dos veces/,
    );
    await rechaza(
      () => checkin.registrarCheckInWalkIn({ ...base3, habitaciones: [{ habitacionId: h3.id, adultos: 1, menores: 0, planTarifarioId: nrf.id }], personas: p3 }),
      400,
      /mismo plan tarifario/,
    );
    ok("10 — walk-in con la misma habitación repetida o con planes distintos → 400");

    // Doble envío simultáneo del mismo walk-in.
    const h4 = await habitacion(doble, 3);
    const unico = [{ habitacionId: h4.id, adultos: 1, menores: 0 }];
    const envio = async () =>
      checkin.registrarCheckInWalkIn({
        operador: OPERADOR,
        fechaHasta: enDias(2),
        habitaciones: unico,
        planTarifarioId: bar.id,
        totalEsperado: await cotizar(unico, bar.id, 2),
        personas: [persona(1, h4.id, 41, { esTitular: true, numeroDocumento: `D${marca}` })],
        ...GARANTIA,
      });
    const antes = await p.reserva.count();
    const resultados = await Promise.allSettled([envio(), envio()]);
    assert.equal(resultados.filter((x) => x.status === "fulfilled").length, 1, "solo uno se registra");
    const rechazo = resultados.find((x) => x.status === "rejected").reason;
    assert.equal(rechazo.statusCode, 409, rechazo.message);
    assert.equal(await p.reserva.count(), antes + 1, "un doble envío no crea dos reservas");
    ok(`doble envío del walk-in: una sola reserva; el segundo recibe 409 ("${rechazo.message.slice(0, 70)}…")`);
  }

  // ---------------------------------------------------------------- criterio 11
  {
    const familiar = await tipo({ ocupacionBase: 2 });
    const chica = await habitacion(familiar, 2);
    const grande1 = await habitacion(familiar, 4);
    const grande2 = await habitacion(familiar, 4);
    const r = await checkin.listarHabitacionesLibresAhora({
      fechaHasta: enDias(2),
      tipoHabitacionId: familiar.id,
      adultos: 3,
      menores: 0,
      excluir: String(grande2.id),
    });
    const ids = r.habitaciones.map((h) => h.id);
    assert.ok(!ids.includes(chica.id), "no devuelve capacidad 2 para 3 adultos");
    assert.ok(!ids.includes(grande2.id), "respeta excluir");
    assert.ok(ids.includes(grande1.id));
    const ofrecida = r.habitaciones.find((h) => h.id === grande1.id);
    assert.ok(ofrecida.planes.every((pl) => Number.isInteger(pl.planTarifarioId)));
    const cotizacion = await reservas.cotizarParaReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(2),
      habitaciones: [{ habitacionId: grande1.id, adultos: 3, menores: 0 }],
      canal: "RECEPCION",
    });
    for (const plan of ofrecida.planes) {
      const mismo = cotizacion.planes.find((x) => x.codigo === plan.codigo);
      assert.equal(plan.total, mismo.total, `plan ${plan.codigo}`);
      assert.equal(plan.planTarifarioId, mismo.planTarifarioId);
    }
    ok("11 — habitaciones libres para 3 adultos: sin capacidad 2, respeta excluir y el total de cada plan coincide con /reservas/cotizar (con planTarifarioId)");
  }

  // ---------------------------------------------------------------- criterio 12
  {
    const h = await habitacion(doble, 3);
    const hManana = await habitacion(doble, 3);
    const hAyer = await habitacion(doble, 3);
    const titular = persona(1, h.id, 40, { esTitular: true });
    const { reserva } = await reservar([{ habitacionId: h.id, adultos: 2, menores: 0 }], { titular });
    const manana = await reservas.crearReserva({
      fechaDesde: enDias(1),
      fechaHasta: enDias(3),
      habitaciones: [{ habitacionId: hManana.id, adultos: 1, menores: 0 }],
      planTarifarioId: bar.id,
      totalEsperado: (
        await reservas.cotizarParaReserva({
          fechaDesde: enDias(1),
          fechaHasta: enDias(3),
          habitaciones: [{ habitacionId: hManana.id, adultos: 1, menores: 0 }],
          planTarifarioId: bar.id,
        })
      ).planes[0].total,
      huesped: { nombre: "Llega Mañana", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: documento(), fechaNacimiento: haceAnios(30), contacto: "+54 387 111-2222" },
    });
    const antes = await apoyo.listarLlegadas({});
    // Una Confirmada que debía llegar ayer (se fuerza la fecha: el alta no admite fechas pasadas).
    const { reserva: ayer } = await reservar([{ habitacionId: hAyer.id, adultos: 1, menores: 0 }], { titular: persona(1, hAyer.id, 33) });
    await p.reserva.update({ where: { id: ayer.id }, data: { fechaDesde: new Date(`${enDias(-1)}T00:00:00.000Z`) } });
    const despues = await apoyo.listarLlegadas({});
    assert.equal(despues.anterioresPendientes, antes.anterioresPendientes + 1);
    const codigos = despues.reservas.map((x) => x.codigoConfirmacion);
    assert.ok(codigos.includes(reserva.codigoConfirmacion));
    assert.ok(!codigos.includes(manana.codigoConfirmacion), "la de mañana no figura");
    assert.ok(!codigos.includes(ayer.codigoConfirmacion), "la de ayer no figura");
    assert.ok(despues.reservas.every((x) => new Date(x.fechaDesde).toISOString().slice(0, 10) === enDias(0)));
    const filtrada = await apoyo.listarLlegadas({ q: reserva.codigoConfirmacion });
    assert.deepEqual(filtrada.reservas.map((x) => x.codigoConfirmacion), [reserva.codigoConfirmacion]);
    const fila = filtrada.reservas[0];
    assert.equal(fila.noches, 2);
    assert.equal(fila.titular.numeroDocumento, titular.numeroDocumento);
    assert.deepEqual(fila.habitaciones.map((x) => [x.id, x.adultos, x.menores]), [[h.id, 2, 0]]);
    assert.equal(fila.plan.id, bar.id);
    assert.equal(fila.senia.registrada, false);
    assert.equal((await apoyo.listarLlegadas({ q: titular.numeroDocumento })).reservas.length >= 1, true);
    ok("12 — llegadas: solo las de hoy, búsqueda por código o documento y aviso de Confirmadas anteriores que cuenta bien");
  }

  // ---------------------------------------------------------------- un solo titular por habitación
  {
    const estadia = require("../src/modulos/estadia/estadia.servicio");
    const { cargarPersonasEnLote } = require("../src/modulos/estadia/cargaMasiva");
    const { incorporarEnTransaccion } = require("../src/modulos/estadia/titular.servicio");
    const titularesActivos = async (reservaId, habitacionId) =>
      p.ocupanteReserva.findMany({
        where: { reservaId, esTitular: true, estado: { in: ["Previsto", "Alojado"] }, asignaciones: { some: { habitacionId, hasta: null } } },
      });
    const ficha = (pers, habitacionId, extra = {}) => ({ ...pers, habitacionId, operador: OPERADOR, ...extra });

    // Antes del check-in: la reserva ya tiene al titular automático en la habitación.
    const h = await habitacion(doble, 3);
    const titular = persona(1, h.id, 40);
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 2, menores: 0 }], { titular });
    const otra = persona(2, h.id, 35, { esTitular: true });

    // Camino 1: alta desde "Personas de la estadía" marcando titular → 409.
    await rechaza(() => estadia.guardar(reserva.id, null, ficha(otra, h.id)), 409, /ya tiene titular \(Persona1/, "TITULAR_EXISTENTE");
    // Camino 2: carga en lote con un titular cuando ya hay uno → 409.
    await rechaza(
      () => p.$transaction((tx) => cargarPersonasEnLote(tx, reserva.id, [{ ...otra, id: 9 }], OPERADOR)),
      409,
      /ya tiene titular/,
      "TITULAR_EXISTENTE",
    );
    // Camino 3: titular automático de otra persona en una habitación con titular → entra sin marcar.
    const otroHuesped = await p.huesped.create({
      data: { nombre: "Otra Persona", tipoDocumento: "DNI", numeroDocumento: documento(), paisDocumento: "AR" },
    });
    await p.$transaction(async (tx) => {
      const bloqueada = await estadia.bloquear(tx, reserva.id);
      await incorporarEnTransaccion(tx, bloqueada, otroHuesped, OPERADOR);
    });
    assert.equal((await titularesActivos(reserva.id, h.id)).length, 1, "el titular automático no deja dos");
    const automatica = await p.ocupanteReserva.findFirst({ where: { reservaId: reserva.id, huespedId: otroHuesped.id } });
    assert.equal(automatica.esTitular, false);
    await estadia.accion(reserva.id, automatica.id, { accion: "cancelar", operador: OPERADOR });
    // Reemplazo explícito antes del check-in: un solo titular y evento registrado.
    const nueva = await estadia.guardar(reserva.id, null, ficha(otra, h.id, { reemplazarTitular: true }));
    const activos = await titularesActivos(reserva.id, h.id);
    assert.deepEqual(activos.map((o) => o.id), [nueva.id]);
    const evento = await p.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: "Cambio de titular de habitación" } });
    assert.equal(JSON.parse(evento.detalle).ocupanteId, nueva.id);
    assert.equal(evento.operador, OPERADOR);

    // Con la estadía en curso el cambio de titular exige motivo.
    const h2 = await habitacion(doble, 3);
    const t2 = persona(1, h2.id, 40, { esTitular: true });
    const { reserva: r2, total: total2 } = await reservar([{ habitacionId: h2.id, adultos: 2, menores: 0 }], { titular: t2 });
    const acompanante = persona(2, h2.id, 37);
    await confirmar(r2, {
      habitaciones: [{ habitacionIdAnterior: h2.id, adultos: 2, menores: 0 }],
      personas: [t2, acompanante],
      totalEsperado: total2,
    });
    const fichaAcompanante = await p.ocupanteReserva.findFirst({ where: { reservaId: r2.id, numeroDocumento: acompanante.numeroDocumento, estado: "Alojado" } });
    const datosAcompanante = { ...acompanante, habitacionId: h2.id, operador: OPERADOR, esTitular: true };
    await rechaza(() => estadia.guardar(r2.id, fichaAcompanante.id, datosAcompanante), 409, /Con la estadía en curso, para cambiarlo indicá el motivo/, "TITULAR_EXISTENTE");
    await rechaza(() => estadia.guardar(r2.id, fichaAcompanante.id, { ...datosAcompanante, reemplazarTitular: true }), 409, /indicá el motivo/);
    await estadia.guardar(r2.id, fichaAcompanante.id, { ...datosAcompanante, motivoCambioTitular: "El titular se retira antes" });
    const activos2 = await titularesActivos(r2.id, h2.id);
    assert.deepEqual(activos2.map((o) => o.id), [fichaAcompanante.id]);
    const cambio = await p.eventoEstadia.findFirst({ where: { reservaId: r2.id, accion: "Cambio de titular de habitación" } });
    assert.equal(JSON.parse(cambio.detalle).motivo, "El titular se retira antes");
    assert.equal(cambio.operador, OPERADOR);
    // Las fichas Canceladas no cuentan como titulares (la reemplazada en el check-in sigue esTitular).
    const reemplazada = await p.ocupanteReserva.findFirst({ where: { reservaId: r2.id, estado: "Cancelado" } });
    assert.equal(reemplazada.esTitular, true);
    void total;
    ok("un solo titular por habitación: alta, lote y titular automático no dejan dos (409); el cambio con motivo deja uno y queda auditado");
  }

  // ---------------------------------------------------------------- editar y mover con la estadía en curso
  {
    const estadia = require("../src/modulos/estadia/estadia.servicio");
    const { mover } = require("../src/modulos/estadia/moverOcupante");
    const ficha = (pers, habitacionId, extra = {}) => ({ ...pers, habitacionId, operador: OPERADOR, ...extra });
    const hA = await habitacion(doble, 3);
    const hB = await habitacion(doble, 2);
    const tA = persona(1, hA.id, 40, { esTitular: true });
    const acomp = persona(2, hA.id, 38);
    const b = persona(3, hB.id, 45, { esTitular: true });
    const { reserva, total } = await reservar(
      [
        { habitacionId: hA.id, adultos: 2, menores: 0 },
        { habitacionId: hB.id, adultos: 1, menores: 0 },
      ],
      { titular: tA },
    );
    await confirmar(reserva, {
      habitaciones: [
        { habitacionIdAnterior: hA.id, adultos: 2, menores: 0 },
        { habitacionIdAnterior: hB.id, adultos: 1, menores: 0 },
      ],
      personas: [tA, acomp, b],
      totalEsperado: total,
    });
    const alojada = (pers) =>
      p.ocupanteReserva.findFirst({ where: { reservaId: reserva.id, numeroDocumento: pers.numeroDocumento, estado: "Alojado" } });
    const [fT, fAcomp, fB] = [await alojada(tA), await alojada(acomp), await alojada(b)];
    assert.ok(fT && fAcomp && fB && fAcomp.verificadoEn, "check-in con las tres personas alojadas y verificadas");

    // Adulto responsable: solo para menores, y obligatorio para ellos.
    await rechaza(() => estadia.guardar(reserva.id, null, ficha(persona(4, hA.id, 36), hA.id, { responsableId: fT.id })), 400, /Solo un menor/);
    await rechaza(() => estadia.guardar(reserva.id, null, ficha(persona(5, hA.id, 10), hA.id)), 400, /adulto responsable/);
    // Supera la ocupación registrada (2 + 0): entra como persona adicional, con su vista previa.
    const datosMenor = ficha(persona(5, hA.id, 10), hA.id, { responsableId: fT.id, vinculoResponsable: "Padre o madre" });
    const vistaMenor = await estadia.guardar(reserva.id, null, datosMenor).catch((e) => e.detalle);
    const menor = await estadia.guardar(reserva.id, null, { ...datosMenor, confirmacionPersonaAdicional: vistaMenor.token });

    // Ingreso, salida y habitación de una persona alojada no se cambian desde "Editar".
    await rechaza(() => estadia.guardar(reserva.id, fAcomp.id, ficha(acomp, hA.id, { fechaHasta: enDias(1) })), 409, /fechas de una persona alojada/);
    await rechaza(() => estadia.guardar(reserva.id, fAcomp.id, ficha(acomp, hB.id, { motivo: "Prefiere otra" })), 409, /Mover a otra habitación/);

    // Cambio de documento de una ficha verificada: motivo, evento con anterior y nuevo, vuelve a verificar.
    const nuevoDocumento = documento();
    await rechaza(() => estadia.guardar(reserva.id, fAcomp.id, ficha(acomp, hA.id, { numeroDocumento: nuevoDocumento })), 400, /motivo/);
    await estadia.guardar(reserva.id, fAcomp.id, ficha(acomp, hA.id, { numeroDocumento: nuevoDocumento, motivoCambioIdentidad: "Error de tipeo en el check-in" }));
    const acompCorregido = await p.ocupanteReserva.findUnique({ where: { id: fAcomp.id } });
    assert.equal(acompCorregido.numeroDocumento, nuevoDocumento);
    assert.equal(acompCorregido.verificadoEn, null, "vuelve a Datos por verificar");
    assert.notEqual(acompCorregido.identidadActiva, fAcomp.identidadActiva);
    const evDoc = await p.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: "Cambio de documento" } });
    const detDoc = JSON.parse(evDoc.detalle);
    assert.deepEqual(
      [detDoc.anterior.numeroDocumento, detDoc.nuevo.numeroDocumento, detDoc.motivo, evDoc.operador],
      [acomp.numeroDocumento, nuevoDocumento, "Error de tipeo en el check-in", OPERADOR],
    );
    assert.deepEqual(Object.keys(detDoc).sort(), ["anterior", "motivo", "nuevo", "ocupanteId"]);

    // Nombre: se guarda con evento de auditoría, sin motivo y sin perder la verificación.
    await estadia.guardar(reserva.id, fB.id, ficha(b, hB.id, { nombre: "Corregido" }));
    assert.ok((await p.ocupanteReserva.findUnique({ where: { id: fB.id } })).verificadoEn, "un cambio de nombre no pierde la verificación");
    const evNombre = await p.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: "Corrección de datos personales" } });
    assert.deepEqual(JSON.parse(evNombre.detalle).anterior, { nombre: b.nombre });

    // Mover a otra habitación: solo de la misma reserva, con motivo, capacidad y titular.
    const ajena = await habitacion(doble, 3);
    const moverA = (ocupanteId, habitacionId, extra = {}) =>
      mover(reserva.id, ocupanteId, { habitacionId, motivo: "Pidió cambiar", operador: OPERADOR, ...extra });
    await rechaza(() => moverA(fAcomp.id, ajena.id), 400, /no pertenece a esta reserva/);
    await rechaza(() => moverA(fAcomp.id, hB.id, { motivo: "" }), 400, /motivo/);
    await rechaza(() => moverA(fT.id, hB.id), 400, /quién queda como titular/);
    await rechaza(() => moverA(fT.id, hB.id, { nuevoTitularId: menor.id }), 400, /18 años/);
    await moverA(fT.id, hB.id, { nuevoTitularId: fAcomp.id });
    const titulares = async (habitacionId) =>
      (
        await p.ocupanteReserva.findMany({
          where: { reservaId: reserva.id, esTitular: true, estado: { in: ["Previsto", "Alojado"] }, asignaciones: { some: { habitacionId, hasta: null } } },
        })
      ).map((o) => o.id);
    assert.deepEqual(await titulares(hA.id), [fAcomp.id], "queda el nuevo titular en la habitación que deja");
    assert.deepEqual(await titulares(hB.id), [fB.id], "en el destino sigue su titular");
    const evMover = await p.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: "Cambio de habitación" } });
    assert.deepEqual(JSON.parse(evMover.detalle), {
      ocupanteId: fT.id,
      desdeHabitacionId: hA.id,
      habitacionId: hB.id,
      motivo: "Pidió cambiar",
      nuevoTitularId: fAcomp.id,
    });
    // hB ya tiene 2 de 2: no entra nadie más.
    await rechaza(() => moverA(fAcomp.id, hB.id, { nuevoTitularId: fT.id }), 409, /capacidad/);
    ok("estadía en curso: responsable solo para menores, fechas y habitación fijas en Editar, cambio de documento con motivo y mover respetando capacidad y titular");
  }

  // ---------------------------------------------------------------- cargos en lote (servicio de cargos)
  const estadiaS = require("../src/modulos/estadia/estadia.servicio");
  const servicioCargos = require("../src/modulos/servicios-adicionales/serviciosAdicionales.servicio");
  // Reserva doble En curso con 2 adultos alojados (check-in de hoy).
  async function enCurso({ noches = 3, capacidad = 3 } = {}) {
    const h = await habitacion(doble, capacidad);
    const t = persona(1, h.id, 40, { esTitular: true });
    const acomp = persona(2, h.id, 38);
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 2, menores: 0 }], { titular: t, noches });
    await confirmar(reserva, {
      habitaciones: [{ habitacionIdAnterior: h.id, adultos: 2, menores: 0 }],
      personas: [t, acomp],
      totalEsperado: total,
    });
    const titular = await p.ocupanteReserva.findFirst({ where: { reservaId: reserva.id, numeroDocumento: t.numeroDocumento, estado: "Alojado" } });
    return { reserva: await p.reserva.findUnique({ where: { id: reserva.id } }), h, titular };
  }
  // "Un día después": corre un día hacia atrás la reserva, sus noches, sus fichas y sus cargos.
  async function correrUnDia(reservaId) {
    const menos = (d) => (d ? new Date(d.getTime() - 86400000) : d);
    const r = await p.reserva.findUnique({ where: { id: reservaId }, include: { reservaHabitaciones: true } });
    await p.reserva.update({ where: { id: reservaId }, data: { fechaDesde: menos(r.fechaDesde), fechaHasta: menos(r.fechaHasta) } });
    const ids = r.reservaHabitaciones.map((rh) => rh.id);
    await p.$executeRawUnsafe(
      `UPDATE reservas_noche SET fecha = DATE_SUB(fecha, INTERVAL 1 DAY) WHERE reservaHabitacionId IN (${ids.join(",")}) ORDER BY fecha ASC`,
    );
    for (const o of await p.ocupanteReserva.findMany({ where: { reservaId } }))
      await p.ocupanteReserva.update({ where: { id: o.id }, data: { fechaDesde: menos(o.fechaDesde), fechaHasta: menos(o.fechaHasta) } });
    for (const c of await p.consumoServicioAdicional.findMany({ where: { reservaId } }))
      await p.consumoServicioAdicional.update({ where: { id: c.id }, data: { fechaServicio: menos(c.fechaServicio) } });
  }
  {
    const { reserva, h } = await enCurso();
    const eventos = (accion) => p.eventoEstadia.count({ where: { reservaId: reserva.id, accion } });
    const dia = (n) => new Date(`${enDias(n)}T12:00:00-03:00`);
    const lote = (cargosLote, extra = {}) =>
      p.$transaction((tx) =>
        servicioCargos.registrarCargosEnTransaccion(tx, {
          reservaId: reserva.id,
          habitacionId: h.id,
          tipoServicio: "Otro",
          registradoPor: OPERADOR,
          cargos: cargosLote,
          ...extra,
        }),
      );
    const clave = (n) => `prueba-lote:${marca}:${n}`;
    const dos = [
      { fechaServicio: dia(0), precioUnitario: 1500.5, descripcion: "Cargo de prueba", claveOperacion: clave(0) },
      { fechaServicio: dia(1), precioUnitario: 1500.5, descripcion: "Cargo de prueba", claveOperacion: clave(1) },
    ];
    assert.equal((await lote(dos)).creados, 2);
    // Un reintento con las mismas claves no duplica ni registra otro evento.
    const reintento = await lote(dos);
    assert.equal(reintento.creados, 0);
    assert.equal(reintento.consumos.length, 2);
    assert.equal(await p.consumoServicioAdicional.count({ where: { claveOperacion: { in: [clave(0), clave(1)] } } }), 2);
    assert.equal(await eventos("Agregar cargos"), 1);
    const guardados = await p.consumoServicioAdicional.findMany({ where: { claveOperacion: { in: [clave(0), clave(1)] } } });
    assert.ok(guardados.every((c) => Number(c.monto) === 1500.5 && c.tipoServicio === "Otro" && !c.anulado));
    // Mismas validaciones que registrarConsumo.
    await rechaza(() => lote([{ fechaServicio: dia(0), precioUnitario: 0 }]), 400, /precio unitario/);
    await rechaza(() => lote([{ fechaServicio: dia(0), precioUnitario: 10 }], { tipoServicio: "Minibar" }), 400, /minibar/);
    await rechaza(() => lote([{ fechaServicio: dia(9), precioUnitario: 10 }]), 400, /dentro de la estadía/);
    await rechaza(() => lote([{ fechaServicio: dia(0), precioUnitario: 10 }], { tipoServicio: "Casino" }), 400, /tipoServicio/);
    // Anulación en lote: prefijo + desde una fecha, baja lógica con motivo y un evento.
    const anular = (extra) =>
      p.$transaction((tx) =>
        servicioCargos.anularCargosEnTransaccion(tx, { reservaId: reserva.id, motivo: "Prueba", operador: OPERADOR, ...extra }),
      );
    const anulacion = await anular({ claveOperacionPrefijo: `prueba-lote:${marca}:`, fechaServicioDesde: new Date(`${enDias(1)}T00:00:00-03:00`) });
    assert.equal(anulacion.anulados, 1);
    const [c0, c1] = await p.consumoServicioAdicional.findMany({ where: { claveOperacion: { in: [clave(0), clave(1)] } }, orderBy: { fechaServicio: "asc" } });
    assert.equal(c0.anulado, false);
    assert.deepEqual([c1.anulado, c1.motivoAnulacion, c1.anuladoPor], [true, "Prueba", OPERADOR]);
    assert.equal((await anular({ claveOperacionPrefijo: `prueba-lote:${marca}:`, fechaServicioDesde: new Date(`${enDias(1)}T00:00:00-03:00`) })).anulados, 0);
    assert.equal(await eventos("Anular cargos"), 1);
    await rechaza(() => anular({}), 400, /qué cargos/);
    ok("cargos en lote: createMany idempotente por claveOperacion, mismas validaciones y anulación en lote con motivo, un evento por operación");
  }

  // ---------------------------------------------------------------- persona adicional con la estadía en curso
  {
    const adicionales = (reservaId) =>
      p.consumoServicioAdicional.findMany({ where: { reservaId, claveOperacion: { startsWith: "persona-adicional:" } }, orderBy: { fechaServicio: "asc" } });
    const nochesDe = async (reservaId) =>
      (
        await p.reservaNoche.findMany({ where: { reservaHabitacion: { reservaId } }, orderBy: { fecha: "asc" } })
      ).map((n) => [n.fecha.toISOString(), Number(n.precioNoche)]);

    // Criterio 1: doble con 2 adultos, salida en 3 noches, hoy la primera → 3 cargos.
    const { reserva, h, titular } = await enCurso({ noches: 3 });
    const nochesAntes = await nochesDe(reserva.id);
    const tercero = persona(3, h.id, 30);
    const alta = (pers, extra = {}) => estadiaS.guardar(reserva.id, null, { ...pers, habitacionId: h.id, operador: OPERADOR, ...extra });
    let vista;
    await assert.rejects(
      () => alta(tercero),
      (e) => {
        assert.equal(e.statusCode, 409);
        assert.equal(e.codigo, "PERSONA_ADICIONAL_REQUIERE_CONFIRMACION");
        vista = e.detalle;
        return true;
      },
    );
    assert.equal(vista.categoria, "adulto");
    assert.deepEqual(vista.noches.map((n) => n.fecha), [enDias(0), enDias(1), enDias(2)]);
    assert.ok(vista.noches.every((n) => n.diferencia > 0), "con 3 adultos en una base 2 hay diferencia");
    assert.equal(vista.total, vista.noches.reduce((a, n) => a + n.diferencia, 0));
    assert.equal(await p.ocupanteReserva.count({ where: { reservaId: reserva.id, numeroDocumento: tercero.numeroDocumento } }), 0, "sin confirmar no escribe");
    await rechaza(() => alta(tercero, { confirmacionPersonaAdicional: "otra" }), 409, /supera la ocupación registrada/);
    const ficha = await alta(tercero, { confirmacionPersonaAdicional: vista.token });
    assert.equal(ficha.estado, "Alojado");
    assert.ok(ficha.ingresoReal && ficha.verificadoEn);
    const cargos3 = await adicionales(reserva.id);
    assert.equal(cargos3.length, 3);
    assert.ok(cargos3.every((c) => c.tipoServicio === "Otro" && c.descripcion === `Persona adicional — ${tercero.nombre} ${tercero.apellido}` && !c.anulado));
    assert.deepEqual(cargos3.map((c) => c.claveOperacion), [0, 1, 2].map((n) => `persona-adicional:${ficha.id}:${enDias(n)}`));
    assert.deepEqual(cargos3.map((c) => Number(c.monto)), vista.noches.map((n) => n.diferencia));
    assert.deepEqual(await nochesDe(reserva.id), nochesAntes, "ReservaNoche no se recotiza");
    const rh = await p.reservaHabitacion.findFirst({ where: { reservaId: reserva.id } });
    assert.deepEqual([rh.adultos, rh.menores], [3, 0], "ocupación registrada actualizada");
    const evento = await p.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: "Persona adicional" } });
    assert.deepEqual(JSON.parse(evento.detalle), { ocupanteId: ficha.id, habitacionId: h.id, categoria: "adulto", noches: 3, monto: vista.total });
    assert.equal(evento.operador, OPERADOR);

    // Criterio 5: capacidad superada → no deja agregar (antes de la vista previa).
    await rechaza(() => alta(persona(4, h.id, 33)), 409, /supera su capacidad/);

    // Criterio 4: un día después, salida anticipada → se anulan las noches no usadas, la usada queda.
    await correrUnDia(reserva.id);
    await estadiaS.accion(reserva.id, ficha.id, { accion: "retirar", operador: OPERADOR });
    const despues = await adicionales(reserva.id);
    assert.deepEqual(despues.map((c) => c.anulado), [false, true, true]);
    assert.ok(despues.filter((c) => c.anulado).every((c) => c.motivoAnulacion === "Salida anticipada" && c.anuladoPor === OPERADOR));
    // Entró como persona adicional: su salida anticipada baja la ocupación registrada, con evento.
    const ocupacion = async () => {
      const x = await p.reservaHabitacion.findFirst({ where: { reservaId: reserva.id } });
      return [x.adultos, x.menores];
    };
    assert.deepEqual(await ocupacion(), [2, 0], "la salida anticipada de la persona adicional baja la ocupación");
    const ajustes = () => p.eventoEstadia.findMany({ where: { reservaId: reserva.id, accion: "Ocupación ajustada" } });
    const [ajuste] = await ajustes();
    assert.deepEqual(JSON.parse(ajuste.detalle), {
      ocupanteId: ficha.id,
      habitacionId: h.id,
      ocupacionAnterior: { adultos: 3, menores: 0 },
      ocupacionNueva: { adultos: 2, menores: 0 },
      motivo: "Salida anticipada de una persona adicional",
    });
    assert.equal(ajuste.operador, OPERADOR);
    // Retirar a alguien sin cargos adicionales no anula nada.
    const anuladosAntes = await p.consumoServicioAdicional.count({ where: { reservaId: reserva.id, anulado: true } });
    const acompanante = await p.ocupanteReserva.findFirst({ where: { reservaId: reserva.id, estado: "Alojado", esTitular: false } });
    await estadiaS.accion(reserva.id, acompanante.id, { accion: "retirar", operador: OPERADOR });
    assert.equal(await p.consumoServicioAdicional.count({ where: { reservaId: reserva.id, anulado: true } }), anuladosAntes);
    // Era de la reserva original: la ocupación registrada no cambia (el precio congelado no se reintegra).
    assert.deepEqual(await ocupacion(), [2, 0]);
    assert.equal((await ajustes()).length, 1);
    assert.equal((await estadiaS.listar(reserva.id)).find((o) => o.id === ficha.id).personaAdicional, true);
    assert.equal((await estadiaS.listar(reserva.id)).find((o) => o.id === acompanante.id).personaAdicional, false);
    void titular;
    ok("persona adicional: vista previa obligatoria, 3 cargos por noche, ficha Alojada, ReservaNoche intacta, capacidad y salida anticipada");
  }
  {
    // Criterio 2: mismo caso un día después → 2 cargos (hoy y mañana).
    const { reserva, h } = await enCurso({ noches: 3 });
    await correrUnDia(reserva.id);
    const r = await p.reserva.findUnique({ where: { id: reserva.id } });
    const tercero = persona(3, h.id, 30);
    const alta = (extra = {}) => estadiaS.guardar(reserva.id, null, { ...tercero, habitacionId: h.id, operador: OPERADOR, ...extra });
    const vista = await alta().catch((e) => e.detalle);
    assert.deepEqual(vista.noches.map((n) => n.fecha), [enDias(0), enDias(1)]);
    const ficha = await alta({ confirmacionPersonaAdicional: vista.token });
    assert.equal(ficha.fechaDesde.toISOString().slice(0, 10), enDias(0), "ingresa desde hoy");
    assert.equal(
      await p.consumoServicioAdicional.count({ where: { reservaId: reserva.id, claveOperacion: { startsWith: `persona-adicional:${ficha.id}:` } } }),
      2,
    );
    void r;
    ok("persona adicional un día después: 2 cargos (hoy y mañana)");
  }
  {
    // Criterio 3: un menor que supera la ocupación → vista previa "menor", sin cargos.
    const { reserva, h, titular } = await enCurso({ noches: 3 });
    const menor = persona(3, h.id, 8, { responsableId: titular.id });
    const alta = (extra = {}) => estadiaS.guardar(reserva.id, null, { ...menor, habitacionId: h.id, operador: OPERADOR, ...extra });
    const vista = await alta().catch((e) => {
      assert.equal(e.codigo, "PERSONA_ADICIONAL_REQUIERE_CONFIRMACION");
      return e.detalle;
    });
    assert.deepEqual([vista.categoria, vista.total, vista.noches.length], ["menor", 0, 0]);
    const ficha = await alta({ confirmacionPersonaAdicional: vista.token });
    assert.equal(ficha.estado, "Alojado");
    assert.equal(await p.consumoServicioAdicional.count({ where: { reservaId: reserva.id, claveOperacion: { startsWith: "persona-adicional:" } } }), 0);
    const rh = await p.reservaHabitacion.findFirst({ where: { reservaId: reserva.id } });
    assert.deepEqual([rh.adultos, rh.menores], [2, 1]);
    // Su salida anticipada baja la ocupación en un menor.
    await estadiaS.accion(reserva.id, ficha.id, { accion: "retirar", operador: OPERADOR });
    const rhSalida = await p.reservaHabitacion.findFirst({ where: { reservaId: reserva.id } });
    assert.deepEqual([rhSalida.adultos, rhSalida.menores], [2, 0]);
    ok("persona adicional menor: vista previa sin cargo, entra alojado, suma un menor y su salida anticipada lo resta");
  }
  {
    // "Registrar ingreso" de una ficha Prevista que supera la ocupación: misma vista previa y cargos.
    const { reserva, h } = await enCurso({ noches: 2 });
    const extra = persona(3, h.id, 29);
    const nacimiento = new Date(`${extra.fechaNacimiento}T00:00:00Z`);
    const huesped = await p.huesped.create({
      data: {
        nombre: `${extra.nombre} ${extra.apellido}`,
        tipoDocumento: extra.tipoDocumento,
        numeroDocumento: extra.numeroDocumento,
        paisDocumento: extra.paisDocumento,
        identidadDocumento: claveDocumento(extra),
        fechaNacimiento: nacimiento,
        nacionalidad: "AR",
        paisResidencia: "AR",
        localidad: "Salta",
      },
    });
    const prevista = await p.ocupanteReserva.create({
      data: {
        huespedId: huesped.id,
        nombre: extra.nombre,
        apellido: extra.apellido,
        tipoDocumento: extra.tipoDocumento,
        numeroDocumento: extra.numeroDocumento,
        paisDocumento: extra.paisDocumento,
        telefono: extra.telefono,
        reservaId: reserva.id,
        fechaNacimiento: nacimiento,
        fechaDesde: reserva.fechaDesde,
        fechaHasta: reserva.fechaHasta,
        verificadoEn: new Date(),
        verificadoPor: OPERADOR,
        asignaciones: { create: { habitacionId: h.id } },
      },
    });
    const ingresar = (extraDatos = {}) => estadiaS.accion(reserva.id, prevista.id, { accion: "ingresar", operador: OPERADOR, ...extraDatos });
    const vista = await ingresar().catch((e) => {
      assert.equal(e.codigo, "PERSONA_ADICIONAL_REQUIERE_CONFIRMACION");
      return e.detalle;
    });
    assert.equal(vista.noches.length, 2);
    await ingresar({ confirmacionPersonaAdicional: vista.token });
    assert.equal((await p.ocupanteReserva.findUnique({ where: { id: prevista.id } })).estado, "Alojado");
    assert.equal(await p.consumoServicioAdicional.count({ where: { reservaId: reserva.id, claveOperacion: { startsWith: `persona-adicional:${prevista.id}:` } } }), 2);
    ok("persona adicional por Registrar ingreso: vista previa y 2 cargos");
  }
  {
    // Restricciones de venta: una temporada con estadía mínima 3 no impide registrar a una persona
    // adicional cuando queda 1 noche. Va al final y se borra al terminar (afecta a toda la base).
    const { reserva, h } = await enCurso({ noches: 2 });
    await correrUnDia(reserva.id);
    const evento = await p.temporada.create({
      data: { nombre: `Evento mínima 3 ${marca}`, nivel: "EVENTO", fechaDesde: new Date(`${enDias(-1)}T00:00:00Z`), fechaHasta: new Date(`${enDias(5)}T00:00:00Z`), estadiaMinima: 3 },
    });
    const habitacionDb = await p.habitacion.findUnique({ where: { id: h.id } });
    const tarifa = await p.tarifa.create({
      data: { tipoHabitacionId: habitacionDb.tipoHabitacionId, temporadaId: evento.id, precioBase: 150000, adicionalAdultoExtra: 25000, vigenteDesde: new Date("2020-01-01") },
    });
    try {
      const r = await p.reserva.findUnique({ where: { id: reserva.id } });
      const cotizar = (opciones) =>
        require("../src/modulos/tarifas/cotizacion.servicio").cotizarReserva(
          {
            fechaDesde: enDias(0),
            fechaHasta: r.fechaHasta.toISOString().slice(0, 10),
            planTarifarioId: r.planTarifarioId,
            habitaciones: [{ habitacionId: h.id, adultos: 3, menores: 0 }],
            canal: "RECEPCION",
          },
          p,
          opciones,
        );
      // Sin el parámetro, la estadía mínima se sigue exigiendo.
      await assert.rejects(() => cotizar(), /estadía mínima de 3 noches/);
      const tercero = persona(3, h.id, 30);
      const alta = (extra = {}) => estadiaS.guardar(reserva.id, null, { ...tercero, habitacionId: h.id, operador: OPERADOR, ...extra });
      const vista = await alta().catch((e) => {
        assert.equal(e.codigo, "PERSONA_ADICIONAL_REQUIERE_CONFIRMACION", e.message);
        return e.detalle;
      });
      assert.deepEqual(vista.noches, [{ fecha: enDias(0), diferencia: 25000 }], "1 noche: el adicional por adulto del evento");
      const ficha = await alta({ confirmacionPersonaAdicional: vista.token });
      const cargosFicha = await p.consumoServicioAdicional.findMany({ where: { claveOperacion: { startsWith: `persona-adicional:${ficha.id}:` } } });
      assert.deepEqual(cargosFicha.map((c) => Number(c.monto)), [25000]);
    } finally {
      await p.tarifa.delete({ where: { id: tarifa.id } });
      await p.temporada.delete({ where: { id: evento.id } });
    }
    ok("persona adicional con estadía mínima 3 y 1 noche restante: se registra con 1 cargo (sin el parámetro, la mínima se sigue exigiendo)");
  }

  // ---------------------------------------------------------------- nombres y apellido separados
  {
    const estadiaS = require("../src/modulos/estadia/estadia.servicio");
    const { buscarPorDocumento } = require("../src/modulos/huespedes/huespedes.servicio");
    const h = await habitacion(doble, 3);
    const titular = persona(1, h.id, 40, { nombre: "María José", apellido: "de la Vega" });
    const totalEsperado = await cotizar([{ habitacionId: h.id, adultos: 2, menores: 0 }], bar.id);
    // Alta de mostrador con nombres y apellido por separado.
    const alta = await reservas.crearReserva({
      fechaDesde: enDias(0),
      fechaHasta: enDias(2),
      habitaciones: [{ habitacionId: h.id, adultos: 2, menores: 0 }],
      planTarifarioId: bar.id,
      totalEsperado,
      huesped: {
        nombres: titular.nombre,
        apellido: titular.apellido,
        tipoDocumento: "DNI",
        paisDocumento: "AR",
        numeroDocumento: titular.numeroDocumento,
        fechaNacimiento: titular.fechaNacimiento,
        contacto: "maria.vega@example.test",
      },
      origen: "RECEPCION",
    });
    const huesped = await p.huesped.findUnique({ where: { id: alta.huespedId } });
    assert.deepEqual([huesped.nombres, huesped.apellido, huesped.nombre], ["María José", "de la Vega", "María José de la Vega"]);
    const conDatos = await reservas.obtenerReserva(alta.id);
    assert.deepEqual([conDatos.huesped.nombres, conDatos.huesped.apellido], ["María José", "de la Vega"]);
    // Faltando uno de los dos, el alta se rechaza.
    await assert.rejects(
      () => reservas.crearReserva({ fechaDesde: enDias(0), fechaHasta: enDias(2), habitaciones: [{ habitacionId: h.id, adultos: 2, menores: 0 }], planTarifarioId: bar.id, totalEsperado, huesped: { nombres: "Ana", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "99000001", fechaNacimiento: titular.fechaNacimiento, contacto: "+54 387 555-0000" }, origen: "RECEPCION" }),
      /apellido del huésped es obligatorio/,
    );
    // Titular automático: cada uno en su campo.
    await p.$transaction(async (tx) => {
      const bloqueada = await estadiaS.bloquear(tx, alta.id);
      await require("../src/modulos/estadia/titular.servicio").incorporarEnTransaccion(tx, bloqueada, huesped, OPERADOR);
    });
    const fichaTitular = await p.ocupanteReserva.findFirst({ where: { reservaId: alta.id, huespedId: huesped.id } });
    assert.deepEqual([fichaTitular.nombre, fichaTitular.apellido], ["María José", "de la Vega"]);
    // Editar el apellido de la ficha actualiza nombres, apellido y nombre del Huesped.
    await estadiaS.guardar(alta.id, fichaTitular.id, { ...titular, apellido: "De La Vega Paz", habitacionId: h.id, operador: OPERADOR });
    const editado = await p.huesped.findUnique({ where: { id: huesped.id } });
    assert.deepEqual([editado.nombres, editado.apellido, editado.nombre], ["María José", "De La Vega Paz", "María José De La Vega Paz"]);
    // Persona que vuelve sin ficha previa: nombres y apellido del Huesped; huésped viejo: nombre completo.
    const nuevo = await p.huesped.create({ data: { nombre: "Lucas Prado", nombres: "Lucas", apellido: "Prado", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: documento(), identidadDocumento: null } });
    await p.huesped.update({ where: { id: nuevo.id }, data: { identidadDocumento: claveDocumento(nuevo) } });
    const encontrado = await buscarPorDocumento({ tipo: "DNI", pais: "AR", numero: nuevo.numeroDocumento });
    assert.deepEqual([encontrado.nombre, encontrado.apellido], ["Lucas", "Prado"]);
    const viejo = await p.huesped.create({ data: { nombre: "Rosa Inés Mamaní", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: documento() } });
    await p.huesped.update({ where: { id: viejo.id }, data: { identidadDocumento: claveDocumento(viejo) } });
    const encontradoViejo = await buscarPorDocumento({ tipo: "DNI", pais: "AR", numero: viejo.numeroDocumento });
    assert.deepEqual([encontradoViejo.nombre, encontradoViejo.apellido], ["Rosa Inés Mamaní", null], "un nombre viejo no se parte");
    ok("nombres y apellido separados: alta de mostrador, titular automático, edición de ficha sincronizada y persona que vuelve");
  }

  // ---------------------------------------------------------------- vínculo del responsable con el menor
  {
    const estadiaS = require("../src/modulos/estadia/estadia.servicio");
    const h = await habitacion(doble, 3);
    const titular = persona(1, h.id, 40, { esTitular: true });
    // 15 años: cuenta como adulto para la ocupación pero, por ser menor de 18, lleva vínculo.
    const { reserva, total } = await reservar([{ habitacionId: h.id, adultos: 3, menores: 0 }], { titular });
    const menor = persona(3, h.id, 15, { responsableId: 2, vinculoResponsable: "Otro adulto a cargo", telefono: "" });
    const cuerpo = (m) => ({
      habitaciones: [{ habitacionIdAnterior: h.id, adultos: 3, menores: 0 }],
      personas: [titular, persona(2, h.id, 45), m],
      totalEsperado: total,
    });
    // Sin la autorización no se confirma (y no queda nada a medias).
    await rechaza(() => confirmar(reserva, cuerpo(menor)), 400, /pedí la autorización de los padres o tutores/);
    assert.equal((await p.reserva.findUnique({ where: { id: reserva.id } })).estado, "Confirmada");
    // Un vínculo fuera del catálogo tampoco.
    await rechaza(() => confirmar(reserva, cuerpo({ ...menor, vinculoResponsable: "Vecino" })), 400, /Indicá el vínculo/);
    // Con la autorización: confirma, queda en la ficha y en el evento del check-in.
    await confirmar(reserva, cuerpo({ ...menor, autorizacionPresentada: true }));
    const ficha = await p.ocupanteReserva.findFirst({ where: { reservaId: reserva.id, numeroDocumento: menor.numeroDocumento } });
    assert.deepEqual([ficha.vinculoResponsable, ficha.autorizacionPresentada], ["Otro adulto a cargo", true]);
    const evento = await p.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: "Check-in: ocupantes registrados" } });
    assert.deepEqual(JSON.parse(evento.detalle).menores, [
      { ocupanteId: ficha.id, responsableId: ficha.responsableId, vinculo: "Otro adulto a cargo", autorizacionPresentada: true },
    ]);
    // Guardar la ficha: mismas reglas (sin autorización 400; un adulto no lleva vínculo).
    const datosFicha = { ...menor, habitacionId: h.id, responsableId: ficha.responsableId, operador: OPERADOR };
    await rechaza(() => estadiaS.guardar(reserva.id, ficha.id, { ...datosFicha, autorizacionPresentada: false }), 400, /autorización/);
    await estadiaS.guardar(reserva.id, ficha.id, { ...datosFicha, vinculoResponsable: "Tutor legal", autorizacionPresentada: true });
    const tutor = await p.ocupanteReserva.findUnique({ where: { id: ficha.id } });
    assert.deepEqual([tutor.vinculoResponsable, tutor.autorizacionPresentada], ["Tutor legal", false], "Tutor legal no lleva autorización");
    const adulto = await p.ocupanteReserva.findFirst({ where: { reservaId: reserva.id, numeroDocumento: titular.numeroDocumento } });
    assert.equal(adulto.vinculoResponsable, null);
    ok("vínculo del responsable: obligatorio para menores de 18, autorización para otro familiar u otro adulto, guardado y en el evento del check-in");
  }
}

// Servidor HTTP efímero con las rutas del check-in.
async function conServidor(fn) {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/check-in", require("../src/modulos/check-in/checkIn.routes"));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Criterio 8 por HTTP: sin sesión 401, rol sin permiso 403, recepcionista 200. El usuario se crea
// SOLO en la base local de pruebas.
async function http(numero) {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/huespedes", require("../src/modulos/huespedes/huespedes.routes"));
  app.use("/api/check-in", require("../src/modulos/check-in/checkIn.routes"));
  const crearUsuario = (rol) =>
    p.usuario.create({
      data: {
        usuario: `prueba-${rol}-${marca}`,
        nombre: "Prueba",
        apellido: "Rediseño",
        dni: `9${marca}${rol.length}`,
        passwordHash: "sin-contraseña",
        rol,
      },
    });
  const recepcion = await crearUsuario("recepcionista");
  const limpieza = await crearUsuario("housekeeping");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const ruta = `/api/huespedes/por-documento?tipo=DNI&pais=AR&numero=${numero}`;
    const pedir = (token) => fetch(url + ruta, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    assert.equal((await pedir()).status, 401);
    assert.equal((await pedir(firmarToken({ id: limpieza.id, rol: limpieza.rol }))).status, 403);
    const respuesta = await pedir(firmarToken({ id: recepcion.id, rol: recepcion.rol }));
    assert.equal(respuesta.status, 200);
    assert.equal((await respuesta.json()).numeroDocumento, numero);
    assert.equal((await fetch(`${url}/api/check-in/llegadas`)).status, 401);
    assert.equal((await fetch(`${url}/api/check-in/1/previa-ocupacion`, { method: "POST" })).status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await p.usuario.deleteMany({ where: { id: { in: [recepcion.id, limpieza.id] } } });
  }
}

async function main() {
  const restituir = await neutralizarModificadoresDeDiaSemana();
  const temporada =
    (await p.temporada.findFirst({ where: { nivel: "BASE" } })) ||
    (await p.temporada.create({ data: { nombre: "Base pruebas", nivel: "BASE" } }));
  const bar = await p.planTarifario.upsert({
    where: { codigo: "BAR" },
    update: {},
    create: { codigo: "BAR", nombre: "Flexible pruebas", tipo: "BASE", horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
  });
  // Plan no reembolsable SOLO durante esta prueba: se desactiva al terminar para no cambiar la
  // lista de planes que ven las otras pruebas.
  const nrf = await p.planTarifario.upsert({
    where: { codigo: "NRFPRUEBA" },
    update: { activo: true },
    create: {
      codigo: "NRFPRUEBA",
      nombre: "No reembolsable pruebas",
      tipo: "DERIVADO",
      planBaseId: bar.id,
      descuentoPorcentaje: 10,
      reembolsable: false,
      penalidadNoShow: "TOTAL_ESTADIA",
    },
  });
  try {
    await pruebas({ bar, nrf, temporada });
    console.log(`\n${resultados} bloques OK.`);
  } finally {
    await p.planTarifario.update({ where: { id: nrf.id }, data: { activo: false } });
    await restituir();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
