// Pruebas de la Etapa 4B de tarifas por temporada — HU-97 (ajuste manual de
// precio) y HU-98 (cálculo de penalidades). Mismo harness que
// pruebas-reserva-precio.js (_dobleSprint3, fixture BASE+BAR+NRF propia,
// enDias() relativo) — se duplica en vez de importarse, mismo criterio que
// ya usa ese archivo respecto de pruebas-reservas.js.
//
// Cubre también los permisos HTTP reales del endpoint de ajuste de precio
// (primer endpoint de reservas con requiereSesion/requiereRol en el
// backend): levanta un Express real en un puerto local, mismo patrón que
// pruebas-usuarios.js ("Rutas HTTP de punta a punta"), con un doble de
// `usuario` mínimo propio de este archivo (no se toca _dobleSprint3.js
// compartido: solo necesita findUnique por id para que requiereSesion
// resuelva la sesión).
//
//   node scripts/pruebas-ajuste-penalidad.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();

// Doble mínimo de `usuario`, agregado directo sobre `base` (no en el
// archivo compartido): solo lo que necesita
// usuarios.servicio.js:obtenerUsuarioParaSesion (prisma.usuario.findUnique
// por id). Los tokens se firman directo con firmarToken({id, rol}) más
// abajo, sin pasar por un login real — no hace falta contraseña/hash acá.
const USUARIOS_PRUEBA = [
  { id: 1, usuario: "gerente.prueba", rol: "gerente", activo: true },
  { id: 2, usuario: "recepcionista.prueba", rol: "recepcionista", activo: true },
];
base.usuario = {
  async findUnique({ where }) {
    const [campo, valor] = Object.entries(where)[0];
    const fila = USUARIOS_PRUEBA.find((u) => u[campo] === valor);
    return fila ? { ...fila } : null;
  },
};

instalarDoble(base);

const servicio = require("../src/modulos/reservas/reservas.servicio");
const penalidadesServicio = require("../src/modulos/tarifas/penalidades.servicio");
const { ESTADO_RESERVA } = require("../src/modulos/reservas/reservas.constantes");
const { MODO_AJUSTE_PRECIO, TIPO_PENALIDAD, HORA_CHECKIN } = require("../src/modulos/tarifas/tarifas.constantes");
const { combinarFechaConHoraArgentina } = require("../src/lib/fechas");

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

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

function limpiar() {
  base._limpiar();
}

function enDias(dias) {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  return new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const HUESPED = { paisDocumento:"AR", fechaNacimiento:"1990-01-01", nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };

// --------------------------------------------------------------
// Fixture — mismo esquema que pruebas-reserva-precio.js: temporada Base +
// plan BAR (reembolsable, 48hs) + plan NRF (derivado, -15%, no
// reembolsable, penalidadNoShow TOTAL_ESTADIA) + Tarifa con adicional real.
// --------------------------------------------------------------
const PRECIO_BASE_PRUEBA = 100000;
const ADICIONAL_ADULTO_EXTRA = 20000;

async function asegurarFixture() {
  let temporadaBase = base._datos.temporada.find((t) => t.nivel === "BASE");
  if (!temporadaBase) {
    temporadaBase = await base.temporada.create({
      data: { nombre: "Base", nivel: "BASE", fechaDesde: null, fechaHasta: null, estadiaMinima: null, cierreLlegada: false, activa: true },
    });
  }
  let planBar = base._datos.planTarifario.find((p) => p.codigo === "BAR");
  if (!planBar) {
    planBar = await base.planTarifario.create({
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
  let planNrf = base._datos.planTarifario.find((p) => p.codigo === "NRF");
  if (!planNrf) {
    planNrf = await base.planTarifario.create({
      data: {
        codigo: "NRF",
        nombre: "No Reembolsable",
        tipo: "DERIVADO",
        planBaseId: planBar.id,
        descuentoPorcentaje: 15,
        reembolsable: false,
        horasCancelacionSinCargo: null,
        penalidadNoShow: "TOTAL_ESTADIA",
        visibleWeb: true,
        activo: true,
      },
    });
  }
  return { temporadaBase, planBar, planNrf };
}

async function asegurarTarifaParaTipo(tipoHabitacionId) {
  const { temporadaBase } = await asegurarFixture();
  const yaTiene = base._datos.tarifa.some((t) => t.tipoHabitacionId === tipoHabitacionId && t.temporadaId === temporadaBase.id);
  if (!yaTiene) {
    await base.tarifa.create({
      data: {
        tipoHabitacionId,
        temporadaId: temporadaBase.id,
        precioBase: PRECIO_BASE_PRUEBA,
        adicionalAdultoExtra: ADICIONAL_ADULTO_EXTRA,
        vigenteDesde: new Date(`${enDias(-365)}T00:00:00.000Z`),
      },
    });
  }
}

async function sembrarHabitacion(extra) {
  const fila = base._sembrarHabitacion(extra);
  await asegurarTarifaParaTipo(fila.tipoHabitacionId);
  return fila;
}

function hab(habitacionId, extra = {}) {
  return { habitacionId, adultos: 2, menores: 0, ...extra };
}
function habs(ids) {
  return ids.map((id) => hab(id));
}

async function alta(planCodigo, extra = {}) {
  const { planBar, planNrf } = await asegurarFixture();
  const plan = planCodigo === "NRF" ? planNrf : planBar;
  const fechaDesde = extra.fechaDesde ?? enDias(10);
  const fechaHasta = extra.fechaHasta ?? enDias(13);
  const habitaciones = extra.habitaciones ?? habs([1]);
  const canal = extra.origen === "WEB" ? "WEB" : "RECEPCION";
  let totalEsperado = extra.totalEsperado;
  if (totalEsperado === undefined) {
    const cotizacion = await servicio.cotizarParaReserva({ fechaDesde, fechaHasta, planTarifarioId: plan.id, habitaciones, canal });
    totalEsperado = cotizacion.planes[0]?.total ?? 0;
  }
  return { fechaDesde, fechaHasta, habitaciones, planTarifarioId: plan.id, totalEsperado, huesped: { ...HUESPED }, ...extra };
}

async function esperaError(fn, textoEsperado) {
  try {
    await fn();
  } catch (err) {
    assert.ok(
      err.message.toLowerCase().includes(textoEsperado.toLowerCase()),
      `El error fue "${err.message}", se esperaba que mencionara "${textoEsperado}"`
    );
    return err;
  }
  throw new Error(`Se esperaba un error que mencionara "${textoEsperado}", pero no falló`);
}

// Primera ReservaNoche (fecha más temprana) de la primera habitación de una
// reserva ya formateada (obtenerReserva/crearReserva/modificarReserva).
function primeraNoche(reserva, indiceHabitacion = 0) {
  return reserva.habitaciones[indiceHabitacion].reservaNoches[0];
}

async function main() {
  seccion("HU-97 — ajuste manual de precio: cortesía y descuento");

  await prueba("PRECIO_FIJO 0 en una noche (cortesía): esa noche queda en 0 y el total baja exactamente lo mismo", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const noche = primeraNoche(reserva);
    const totalAntes = reserva.totalEstimadoAlojamiento;

    const ajustada = await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
      valor: 0,
      motivo: "Cortesía por reclamo del huésped",
    });

    const nocheAjustada = primeraNoche(ajustada);
    assert.equal(nocheAjustada.precioNoche, 0);
    assert.equal(nocheAjustada.ajustada, true);
    assert.equal(nocheAjustada.precioOriginal, noche.precioNoche);
    assert.equal(ajustada.totalEstimadoAlojamiento, totalAntes - noche.precioNoche);
  });

  await prueba("DESCUENTO_PORCENTAJE 15% en 3 noches: cada una redondeada de forma independiente, precioOriginal guardado", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR", { fechaDesde: enDias(10), fechaHasta: enDias(13) }));
    const noches = reserva.habitaciones[0].reservaNoches;
    assert.equal(noches.length, 3);

    const ajustada = await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: noches.map((n) => n.id),
      modo: MODO_AJUSTE_PRECIO.DESCUENTO_PORCENTAJE,
      valor: 15,
      motivo: "Descuento negociado con el huésped",
    });

    const esperado = Math.round(((noches[0].precioNoche * 0.85) / 100)) * 100;
    for (let i = 0; i < 3; i++) {
      const n = ajustada.habitaciones[0].reservaNoches[i];
      assert.equal(n.precioNoche, esperado);
      assert.equal(n.precioOriginal, noches[i].precioNoche);
      assert.equal(n.ajustada, true);
    }
  });

  await prueba("un segundo ajuste sobre la misma noche NO pisa precioOriginal (conserva el precio de antes del primero)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const noche = primeraNoche(reserva);

    const primerAjuste = await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
      valor: 40000,
      motivo: "Primer ajuste de prueba",
    });
    assert.equal(primeraNoche(primerAjuste).precioOriginal, noche.precioNoche);

    const segundoAjuste = await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.DESCUENTO_PORCENTAJE,
      valor: 50,
      motivo: "Segundo ajuste de prueba",
    });
    assert.equal(primeraNoche(segundoAjuste).precioNoche, 20000);
    assert.equal(
      primeraNoche(segundoAjuste).precioOriginal,
      noche.precioNoche,
      "precioOriginal tiene que seguir siendo el de ANTES del primer ajuste, no el del primer ajuste"
    );
  });

  seccion("HU-97 — validaciones");

  await prueba("rechaza ajustar una reserva Cerrada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    await servicio.marcarEnCurso(reserva.id);
    await servicio.marcarCerrada(reserva.id);
    await esperaError(
      () =>
        servicio.ajustarPrecioReserva(reserva.id, {
          nocheIds: [primeraNoche(reserva).id],
          modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
          valor: 0,
          motivo: "No debería aplicarse",
        }),
      "Confirmada"
    );
  });

  await prueba("rechaza ajustar una reserva Cancelada", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Prueba" });
    await esperaError(
      () =>
        servicio.ajustarPrecioReserva(reserva.id, {
          nocheIds: [primeraNoche(reserva).id],
          modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
          valor: 0,
          motivo: "No debería aplicarse",
        }),
      "Confirmada"
    );
  });

  await prueba("sin motivo, rechaza", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    await esperaError(
      () =>
        servicio.ajustarPrecioReserva(reserva.id, {
          nocheIds: [primeraNoche(reserva).id],
          modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
          valor: 0,
          motivo: "",
        }),
      "motivo"
    );
  });

  await prueba("motivo de menos de 10 caracteres, rechaza", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    await esperaError(
      () =>
        servicio.ajustarPrecioReserva(reserva.id, {
          nocheIds: [primeraNoche(reserva).id],
          modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
          valor: 0,
          motivo: "corto",
        }),
      "10 caracteres"
    );
  });

  await prueba("un nocheId de otra reserva se rechaza", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    await sembrarHabitacion({ numero: "102" });
    const reservaA = await servicio.crearReserva(await alta("BAR", { habitaciones: habs([1]) }));
    const reservaB = await servicio.crearReserva(await alta("BAR", { habitaciones: habs([2]) }));
    await esperaError(
      () =>
        servicio.ajustarPrecioReserva(reservaA.id, {
          nocheIds: [primeraNoche(reservaB).id],
          modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
          valor: 0,
          motivo: "No pertenece a esta reserva",
        }),
      "no pertenece a esta reserva"
    );
  });

  seccion("HU-97 — interacción con modificarReserva (regla 5, corregida)");

  await prueba("modificar agregando una noche nueva conserva el ajuste de las noches existentes", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR", { fechaDesde: enDias(10), fechaHasta: enDias(13) }));
    const noche = primeraNoche(reserva);
    await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
      valor: 0,
      motivo: "Cortesía a conservar",
    });

    const modificada = await servicio.modificarReserva(reserva.id, { fechaHasta: enDias(14) });
    const nochesOrdenadas = modificada.habitaciones[0].reservaNoches;
    assert.equal(nochesOrdenadas.length, 4);
    const primeraDeNuevo = nochesOrdenadas[0];
    assert.equal(primeraDeNuevo.precioNoche, 0, "la noche ajustada tiene que seguir en 0");
    assert.equal(primeraDeNuevo.ajustada, true);
    assert.equal(primeraDeNuevo.motivoAjuste, "Cortesía a conservar");
    // La noche nueva (4ta) nunca estuvo ajustada.
    assert.equal(nochesOrdenadas[3].ajustada, false);
  });

  await prueba("modificar cambiando la ocupación de una noche ajustada la recotiza y pierde el ajuste (BAR)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const noche = primeraNoche(reserva);
    await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
      valor: 0,
      motivo: "Cortesía que se va a perder",
    });

    const previa = await servicio.modificarReserva(reserva.id, {
      habitaciones: [{ habitacionId: 1, adultos: 3, menores: 0 }],
      soloPrevia: true,
    });
    assert.ok(previa.mensajeAjustePerdido, "tiene que avisar que se pierde el ajuste ANTES de confirmar");
    assert.ok(previa.mensajeAjustePerdido.includes("1"));

    const modificada = await servicio.modificarReserva(reserva.id, {
      habitaciones: [{ habitacionId: 1, adultos: 3, menores: 0 }],
    });
    const nocheModificada = primeraNoche(modificada);
    assert.ok(nocheModificada.precioNoche > 0, "se recotizó con el motor, ya no está en 0");
    assert.equal(nocheModificada.ajustada, false);
    assert.equal(nocheModificada.motivoAjuste, null);
  });

  await prueba("Ajuste B (NRF, baja de ocupación protegida): la noche ajustada CONSERVA su ajuste, no se pierde", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    // Arranca con 3 adultos (con adicional) en NRF: 120000 * 0.85 = 102000.
    const reserva = await servicio.crearReserva(await alta("NRF", { habitaciones: [{ habitacionId: 1, adultos: 3, menores: 0 }] }));
    const noche = primeraNoche(reserva);
    assert.equal(noche.precioNoche, 102000);
    // Descuento manual moderado: 95000. Sigue siendo MÁS que lo que
    // cotizaría el motor para 2 adultos (100000 * 0.85 = 85000) — a
    // propósito, para que bajar la ocupación dispare el Ajuste B (si no
    // se protegiera, el motor SÍ bajaría el precio de 95000 a 85000).
    await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
      valor: 95000,
      motivo: "Descuento que tiene que sobrevivir al Ajuste B",
    });

    const modificada = await servicio.modificarReserva(reserva.id, {
      habitaciones: [{ habitacionId: 1, adultos: 2, menores: 0 }],
    });
    const nocheModificada = primeraNoche(modificada);
    assert.equal(nocheModificada.precioNoche, 95000, "el precio ajustado (95000) tiene que conservarse, no bajar a 85000");
    assert.equal(nocheModificada.ajustada, true, "el ajuste NO se pierde en la rama de protección NRF");
    assert.equal(nocheModificada.motivoAjuste, "Descuento que tiene que sobrevivir al Ajuste B");
  });

  seccion("HU-98 — cálculo de penalidades: cancelación");

  await prueba("BAR cancelado con anticipación >= horasCancelacionSinCargo: sin cargo", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const { planBar } = await asegurarFixture();
    const limite = new Date(
      combinarFechaConHoraArgentina(new Date(reserva.fechaDesde), HORA_CHECKIN.hora, HORA_CHECKIN.minuto).getTime() -
        planBar.horasCancelacionSinCargo * 60 * 60 * 1000
    );
    const resultado = await penalidadesServicio.calcularPenalidad({
      reservaId: reserva.id,
      tipo: TIPO_PENALIDAD.CANCELACION,
      momento: new Date(limite.getTime() - 1000),
    });
    assert.equal(resultado.aplica, false);
    assert.equal(resultado.monto, 0);
    assert.equal(resultado.regla, "SIN_CARGO");
  });

  await prueba("BAR cancelado con menos anticipación: se cobra la primera noche", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const { planBar } = await asegurarFixture();
    const limite = new Date(
      combinarFechaConHoraArgentina(new Date(reserva.fechaDesde), HORA_CHECKIN.hora, HORA_CHECKIN.minuto).getTime() -
        planBar.horasCancelacionSinCargo * 60 * 60 * 1000
    );
    const resultado = await penalidadesServicio.calcularPenalidad({
      reservaId: reserva.id,
      tipo: TIPO_PENALIDAD.CANCELACION,
      momento: new Date(limite.getTime() + 1000),
    });
    assert.equal(resultado.aplica, true);
    assert.equal(resultado.monto, primeraNoche(reserva).precioNoche);
    assert.equal(resultado.regla, "PRIMERA_NOCHE");
  });

  await prueba("NRF cancelado (en cualquier momento): se cobra el total de la estadía", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("NRF"));
    const resultado = await penalidadesServicio.calcularPenalidad({
      reservaId: reserva.id,
      tipo: TIPO_PENALIDAD.CANCELACION,
      momento: new Date(),
    });
    assert.equal(resultado.aplica, true);
    assert.equal(resultado.monto, reserva.totalEstimadoAlojamiento);
    assert.equal(resultado.regla, "TOTAL_NO_REEMBOLSABLE");
  });

  seccion("HU-98 — cálculo de penalidades: no-show");

  await prueba("no-show en un plan PRIMERA_NOCHE (BAR): se cobra la primera noche", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const resultado = await penalidadesServicio.calcularPenalidad({ reservaId: reserva.id, tipo: TIPO_PENALIDAD.NO_SHOW });
    assert.equal(resultado.monto, primeraNoche(reserva).precioNoche);
    assert.equal(resultado.regla, "PRIMERA_NOCHE");
  });

  await prueba("no-show en un plan TOTAL_ESTADIA (NRF): se cobra el total", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("NRF"));
    const resultado = await penalidadesServicio.calcularPenalidad({ reservaId: reserva.id, tipo: TIPO_PENALIDAD.NO_SHOW });
    assert.equal(resultado.monto, reserva.totalEstimadoAlojamiento);
    assert.equal(resultado.regla, "TOTAL_ESTADIA");
  });

  seccion("HU-98 — casos borde");

  await prueba("reserva de 2 habitaciones: la primera noche es la suma de la primera noche de cada una", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101", capacidad: 4 });
    await sembrarHabitacion({ numero: "102", capacidad: 4 });
    const reserva = await servicio.crearReserva(
      await alta("BAR", { habitaciones: [hab(1), { habitacionId: 2, adultos: 3, menores: 0 }] })
    );
    const esperado = primeraNoche(reserva, 0).precioNoche + primeraNoche(reserva, 1).precioNoche;
    assert.notEqual(primeraNoche(reserva, 0).precioNoche, primeraNoche(reserva, 1).precioNoche, "sanity: precios distintos");
    const resultado = await penalidadesServicio.calcularPenalidad({
      reservaId: reserva.id,
      tipo: TIPO_PENALIDAD.NO_SHOW,
    });
    assert.equal(resultado.monto, esperado);
    assert.equal(resultado.detallePorHabitacion.length, 2);
  });

  // Corrección de negocio (2026-09-30): un ajuste manual (HU-97) es una
  // concesión condicionada a que la estadía ocurra — no reduce la
  // penalidad. Una noche ajustada penaliza por su precioOriginal, no por
  // el precioNoche ya rebajado.
  await prueba("una noche ajustada que cae en la primera noche penaliza por precioOriginal, no por el precio ya rebajado", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    const noche = primeraNoche(reserva);
    await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.PRECIO_FIJO,
      valor: 0,
      motivo: "Cortesía antes del no-show",
    });
    const resultado = await penalidadesServicio.calcularPenalidad({ reservaId: reserva.id, tipo: TIPO_PENALIDAD.NO_SHOW });
    assert.equal(
      resultado.monto,
      noche.precioNoche,
      "la penalidad tiene que cobrar el precio de ANTES del ajuste (la cortesía no aplica si no hubo estadía)"
    );
  });

  await prueba("un descuento manual tampoco reduce el TOTAL de la estadía (NRF cancelado)", async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("NRF", { fechaDesde: enDias(10), fechaHasta: enDias(13) }));
    const totalOriginal = reserva.totalEstimadoAlojamiento;
    const noche = primeraNoche(reserva);
    await servicio.ajustarPrecioReserva(reserva.id, {
      nocheIds: [noche.id],
      modo: MODO_AJUSTE_PRECIO.DESCUENTO_PORCENTAJE,
      valor: 20,
      motivo: "Descuento negociado, no debería bajar la penalidad",
    });
    const resultado = await penalidadesServicio.calcularPenalidad({
      reservaId: reserva.id,
      tipo: TIPO_PENALIDAD.CANCELACION,
      momento: new Date(),
    });
    assert.equal(
      resultado.monto,
      totalOriginal,
      "el total no reembolsable tiene que ser el de ANTES del descuento manual, no el ya rebajado"
    );
  });

  await prueba('calcularPenalidad SOLO funciona para reservas "Confirmada": En curso, Cerrada y Cancelada rechazan', async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });

    const reservaEnCurso = await servicio.crearReserva(await alta("BAR"));
    await servicio.marcarEnCurso(reservaEnCurso.id);
    await esperaError(
      () => penalidadesServicio.calcularPenalidad({ reservaId: reservaEnCurso.id, tipo: TIPO_PENALIDAD.CANCELACION }),
      "En curso"
    );

    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reservaCerrada = await servicio.crearReserva(await alta("BAR"));
    await servicio.marcarEnCurso(reservaCerrada.id);
    await servicio.marcarCerrada(reservaCerrada.id);
    await esperaError(
      () => penalidadesServicio.calcularPenalidad({ reservaId: reservaCerrada.id, tipo: TIPO_PENALIDAD.CANCELACION }),
      "Cerrada"
    );

    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reservaCancelada = await servicio.crearReserva(await alta("BAR"));
    await servicio.cancelarReserva(reservaCancelada.id, { motivoCancelacion: "Prueba" });
    await esperaError(
      () => penalidadesServicio.calcularPenalidad({ reservaId: reservaCancelada.id, tipo: TIPO_PENALIDAD.CANCELACION }),
      "Cancelada"
    );
  });

  await prueba('calcularPenalidad SÍ funciona para una reserva "Confirmada"', async () => {
    limpiar();
    await sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(await alta("BAR"));
    assert.equal(reserva.estado, ESTADO_RESERVA.CONFIRMADA);
    const resultado = await penalidadesServicio.calcularPenalidad({ reservaId: reserva.id, tipo: TIPO_PENALIDAD.NO_SHOW });
    assert.ok(resultado.monto > 0);
  });

  // ------------------------------------------------------------
  seccion("HU-97 — permisos del backend (POST /api/reservas/:id/ajuste-precio)");

  const express = require("express");
  const reservasRoutes = require("../src/modulos/reservas/reservas.routes");
  const { firmarToken } = require("../src/modulos/usuarios/usuarios.seguridad");
  const app = express();
  app.use(express.json());
  app.use("/api/reservas", reservasRoutes);
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, () => resolver(s));
  });
  const url = `http://127.0.0.1:${servidor.address().port}`;

  async function pedir(metodo, ruta, { token, cuerpo } = {}) {
    const respuesta = await fetch(`${url}${ruta}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const texto = await respuesta.text();
    return { status: respuesta.status, datos: texto ? JSON.parse(texto) : null };
  }

  try {
    await prueba("sin token: 401", async () => {
      limpiar();
      await sembrarHabitacion({ numero: "101" });
      const reserva = await servicio.crearReserva(await alta("BAR"));
      const { status, datos } = await pedir("POST", `/api/reservas/${reserva.id}/ajuste-precio`, {
        cuerpo: { nocheIds: [primeraNoche(reserva).id], modo: "PRECIO_FIJO", valor: 0, motivo: "Sin token, no debería aplicarse" },
      });
      assert.equal(status, 401);
      assert.equal(datos.codigo, "SESION_INVALIDA");
    });

    await prueba("con token de recepcionista: 403", async () => {
      limpiar();
      await sembrarHabitacion({ numero: "101" });
      const reserva = await servicio.crearReserva(await alta("BAR"));
      const token = firmarToken({ id: 2, rol: "recepcionista" });
      const { status } = await pedir("POST", `/api/reservas/${reserva.id}/ajuste-precio`, {
        token,
        cuerpo: { nocheIds: [primeraNoche(reserva).id], modo: "PRECIO_FIJO", valor: 0, motivo: "Recepcionista, no debería aplicarse" },
      });
      assert.equal(status, 403);
    });

    await prueba("con token de gerente: 200, y ajustadoPor sale de la sesión aunque el body mande otro usuario", async () => {
      limpiar();
      await sembrarHabitacion({ numero: "101" });
      const reserva = await servicio.crearReserva(await alta("BAR"));
      const token = firmarToken({ id: 1, rol: "gerente" });
      const { status, datos } = await pedir("POST", `/api/reservas/${reserva.id}/ajuste-precio`, {
        token,
        cuerpo: {
          nocheIds: [primeraNoche(reserva).id],
          modo: "PRECIO_FIJO",
          valor: 0,
          motivo: "Cortesía autorizada por el gerente",
          usuario: "un-nombre-cualquiera-del-body",
        },
      });
      assert.equal(status, 200);
      assert.equal(primeraNoche(datos).ajustadoPor, "gerente.prueba");
      assert.notEqual(primeraNoche(datos).ajustadoPor, "un-nombre-cualquiera-del-body");
    });

    // Encontrado en la verificación manual (no en pruebas directas a
    // penalidadesServicio.calcularPenalidad, que solo miran err.message):
    // obtenerPenalidad no traducía penalidadesServicio.ErrorDeNegocio a la
    // propia de este módulo, así que responderError (que compara con
    // `instanceof reservasServicio.ErrorDeNegocio`) no la reconocía y
    // devolvía 500 en vez del 400/404 real. Corregido con el mismo
    // envoltorio fino que ya usa cotizarReservaEnvuelto.
    await prueba("GET /penalidad de una reserva que no existe: 404 (no 500)", async () => {
      const { status, datos } = await pedir("GET", "/api/reservas/999999/penalidad?tipo=CANCELACION");
      assert.equal(status, 404);
      assert.equal(datos.error, "La reserva no existe.");
    });

    await prueba('GET /penalidad de una reserva "En curso": 400 con el mensaje real (no 500)', async () => {
      limpiar();
      await sembrarHabitacion({ numero: "101" });
      const reserva = await servicio.crearReserva(await alta("BAR"));
      await servicio.marcarEnCurso(reserva.id);
      const { status, datos } = await pedir("GET", `/api/reservas/${reserva.id}/penalidad?tipo=CANCELACION`);
      assert.equal(status, 400);
      assert.ok(datos.error.includes("En curso"));
    });
  } finally {
    servidor.close();
  }

  // ------------------------------------------------------------
  console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
  if (fallaron.length > 0) {
    console.log("\nFallaron:");
    for (const f of fallaron) console.log(`  - ${f.nombre}: ${f.err.stack}`);
    process.exitCode = 1;
  }
}

main();
