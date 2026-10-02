// Pruebas de negocio de Check-out y Facturación del Huésped (HU-48 a 52, 87
// y 53 a 56) — sumado en la re-auditoría del 2026-09-21 porque hasta acá
// consolidarCargos, crearPago (con su lock contra condiciones de carrera),
// crearComprobante, crearNotaCredito y anularComprobante no tenían NINGÚN
// test automatizado: el único script que toca el módulo
// (pruebas-integracion-mantenimiento-checkout.js) siembra la Tarifa en $0 a
// propósito para no ejercitar la plata. Este script SÍ la ejercita.
//
// Corre SIN base de datos y sin red — mismo doble en memoria que
// pruebas-checkin.js / pruebas-servicios-adicionales.js (_dobleSprint3.js,
// con comprobanteEstadia y el mutex de $transaction sumados ahí
// específicamente para este script — ver los comentarios en ese archivo).
//
//   node scripts/pruebas-checkout-facturacion.js

const assert = require("assert");
const { crearBase, instalarDoble } = require("./_dobleSprint3");

const base = crearBase();
instalarDoble(base);

const reservasServicio = require("../src/modulos/reservas/reservas.servicio");
const checkInServicio = require("../src/modulos/check-in/checkIn.servicio");
const serviciosAdicionalesServicio = require("../src/modulos/servicios-adicionales/serviciosAdicionales.servicio");
const checkOutServicio = require("../src/modulos/check-out/checkOut.servicio");
const pagoEstadiaServicio = require("../src/modulos/pagos-estadia/pagoEstadia.servicio");
const comprobanteEstadiaServicio = require("../src/modulos/comprobantes-estadia/comprobanteEstadia.servicio");

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

// Mismo criterio de fecha que pruebas-checkin.js/pruebas-reservas.js: "hoy"
// en hora argentina, para que reporteCajaDiaria (que arma su rango con
// offset -03:00 explícito) matchee con lo que graba la fecha real de la
// máquina que corre esto.
function enDias(dias) {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  return new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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

const HUESPED = {
  paisDocumento: "AR",
  fechaNacimiento: "1990-01-01",
  nombre: "Ana Pérez",
  tipoDocumento: "DNI",
  numeroDocumento: "30111222",
  contacto: "ana@mail.com",
};
const GARANTIA_OK = { garantiaConfirmada: true, medioGarantia: "Tarjeta crédito", referenciaGarantia: "PRUEBA-LOCAL" };

// --------------------------------------------------------------
// Fixture mínima de tarifas (Etapa 4A) — crearReserva ahora pasa por el
// motor de cotización, así que necesita un tipo con tarifa vigente. Una
// temporada Base + un plan BAR, y una Tarifa por tipo al precio que le pase
// cada prueba (Etapa 4C: ya no viaja como campo tarifaPorNoche de la
// habitación — esa columna no existe más).
// --------------------------------------------------------------
async function asegurarTemporadaYPlanBase() {
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
  return { temporadaBase, planBar };
}

async function asegurarTarifaParaTipo(tipoHabitacionId, precioPorNoche) {
  const { temporadaBase } = await asegurarTemporadaYPlanBase();
  const yaTiene = base._datos.tarifa.some((t) => t.tipoHabitacionId === tipoHabitacionId && t.temporadaId === temporadaBase.id);
  if (!yaTiene) {
    await base.tarifa.create({
      data: {
        tipoHabitacionId,
        temporadaId: temporadaBase.id,
        precioBase: precioPorNoche,
        adicionalAdultoExtra: 0,
        vigenteDesde: new Date(`${enDias(-365)}T00:00:00.000Z`),
      },
    });
  }
}

// Reserva "En curso" con una habitación propia — mismo camino real que
// HU-43/47 (crearReserva + confirmarCheckInConReserva), ya probado en
// pruebas-checkin.js. `numero` tiene que ser único por corrida de
// `limpiar()` así que cada prueba pasa el suyo.
async function crearReservaEnCurso({ numero, precioPorNoche = 10000, noches = 2 } = {}) {
  const habitacion = base._sembrarHabitacion({ numero });
  await asegurarTarifaParaTipo(habitacion.tipoHabitacionId, precioPorNoche);
  const { planBar } = await asegurarTemporadaYPlanBase();
  const fechaDesde = enDias(0);
  const fechaHasta = enDias(noches);
  const habitaciones = [{ habitacionId: habitacion.id, adultos: 2, menores: 0 }];
  const cotizacion = await reservasServicio.cotizarParaReserva({
    fechaDesde,
    fechaHasta,
    planTarifarioId: planBar.id,
    habitaciones,
    canal: "RECEPCION",
  });
  const reserva = await reservasServicio.crearReserva({
    fechaDesde,
    fechaHasta,
    habitaciones,
    planTarifarioId: planBar.id,
    totalEsperado: cotizacion.planes[0]?.total ?? 0,
    huesped: { ...HUESPED },
  });
  await require("./_ocupantesFixture").completarFixture(reserva, habitaciones);
  await checkInServicio.confirmarCheckInConReserva({
    reservaId: reserva.id,
    numeroDocumentoIngresado: HUESPED.numeroDocumento,
    ...GARANTIA_OK,
  });
  // Aislar las pruebas de pagos: anular el deposito previo con el contrato publico.
  const garantia = base._datos.pagoEstadia.find((p) => p.reservaId === reserva.id && p.concepto === "Garantía");
  await pagoEstadiaServicio.anularPago(garantia.id, "Fixture: verificar pagos sin deposito previo");
  return { habitacion, reserva };
}

async function main() {
  // ------------------------------------------------------------
  seccion("HU-48 — consolidarCargos suma las 3 fuentes + lo ya pagado");

  await prueba("alojamiento + servicios adicionales + verificación dan el total, y el pago parcial deja el saldo correcto", async () => {
    limpiar();
    // 2 noches x $10.000 = $20.000 de alojamiento.
    const { habitacion, reserva } = await crearReservaEnCurso({ numero: "301", precioPorNoche: 10000, noches: 2 });

    await serviciosAdicionalesServicio.registrarConsumo({
      reservaId: reserva.id,
      habitacionId: habitacion.id,
      tipoServicio: "Restaurante",
      monto: 1500,
      registradoPor: "Mozo",
    });
    await checkOutServicio.registrarVerificacion(reserva.id, {
      tipo: "Daño",
      descripcion: "Vidrio de la mesa de luz roto",
      monto: 500,
      registradoPor: "Ana",
    });

    let cuenta = await checkOutServicio.consolidarCargos(reserva.id);
    assert.equal(cuenta.subtotales.alojamiento, 20000);
    assert.equal(cuenta.subtotales.serviciosAdicionales, 1500);
    assert.equal(cuenta.subtotales.verificacion, 500);
    assert.equal(cuenta.totalAdeudado, 22000, "20.000 + 1.500 + 500");
    assert.equal(cuenta.totalPagado, 0);
    assert.equal(cuenta.saldo, 22000);

    // Pago parcial de $10.000 — pagoEstadia.servicio.js delega en esta
    // misma función (calcularSaldoReserva), así que probar acá que el
    // "totalPagado"/"saldo" se recalculan bien cubre las dos puntas.
    await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 10000 }] });
    cuenta = await checkOutServicio.consolidarCargos(reserva.id);
    assert.equal(cuenta.totalAdeudado, 22000, "los cargos no cambian por pagar");
    assert.equal(cuenta.totalPagado, 10000);
    assert.equal(cuenta.saldo, 12000);
  });

  await prueba("un pago anulado deja de contar para el saldo", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "302", precioPorNoche: 5000, noches: 1 });
    const pago = await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 5000 }] });
    assert.equal((await checkOutServicio.consolidarCargos(reserva.id)).saldo, 0);

    await pagoEstadiaServicio.anularPago(pago.id, "Se cargó un importe equivocado");

    const cuenta = await checkOutServicio.consolidarCargos(reserva.id);
    assert.equal(cuenta.totalPagado, 0);
    assert.equal(cuenta.saldo, 5000);
  });

  // ------------------------------------------------------------
  seccion("HU-50 — crearPago: validaciones básicas");

  await prueba("rechaza un medio de pago con importe 0 o negativo", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "303" });
    await esperaError(
      () => pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 0 }] }),
      "importe mayor a cero"
    );
    await esperaError(
      () => pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: -100 }] }),
      "importe mayor a cero"
    );
  });

  await prueba("rechaza un medio de pago con tipo inválido (ej. 'Cheque', que acá no existe)", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "304" });
    await esperaError(
      () => pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Cheque", importe: 100 }] }),
      "medioPago inválido"
    );
  });

  await prueba("rechaza si el total de los medios supera el saldo pendiente", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "305", precioPorNoche: 5000, noches: 1 });
    await esperaError(
      () => pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 5001 }] }),
      "supera el saldo pendiente"
    );
  });

  await prueba("pago parcial queda 'Parcial'; pago que cubre el saldo exacto queda 'Pagado'", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "306", precioPorNoche: 10000, noches: 1 });

    const parcial = await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 4000 }] });
    assert.equal(parcial.estado, "Parcial");
    assert.equal((await checkOutServicio.consolidarCargos(reserva.id)).saldo, 6000);

    const resto = await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Transferencia", importe: 6000 }] });
    assert.equal(resto.estado, "Pagado");
    assert.equal((await checkOutServicio.consolidarCargos(reserva.id)).saldo, 0);
  });

  await prueba("combina medios de pago (efectivo + tarjeta) en un solo pago y suma bien el importe", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "307", precioPorNoche: 10000, noches: 1 });
    const pago = await pagoEstadiaServicio.crearPago({
      reservaId: reserva.id,
      medios: [
        { tipo: "Efectivo", importe: 4000 },
        { tipo: "Tarjeta crédito", importe: 6000, referencia: "Visa ****4242 · aut. 123456" },
      ],
    });
    assert.equal(pago.medios.length, 2);
    assert.equal(pago.estado, "Pagado");
    assert.equal((await checkOutServicio.consolidarCargos(reserva.id)).saldo, 0);
  });

  await prueba("un pago con tarjeta sin la autorización (referencia) se rechaza en el backend, no solo en la pantalla", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "309", precioPorNoche: 10000, noches: 1 });
    for (const tipo of ["Tarjeta crédito", "Tarjeta débito"]) {
      await assert.rejects(
        () => pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo, importe: 10000 }] }),
        /autorización de la tarjeta/
      );
    }
    // una referencia vacía o de solo espacios tampoco vale
    await assert.rejects(
      () => pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Tarjeta débito", importe: 10000, referencia: "   " }] }),
      /autorización de la tarjeta/
    );
    // no quedó nada registrado ni cobrado
    assert.equal((await checkOutServicio.consolidarCargos(reserva.id)).saldo, 10000);
    // efectivo no necesita referencia; con ella la tarjeta sí pasa
    await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 4000 }] });
    const ok = await pagoEstadiaServicio.crearPago({
      reservaId: reserva.id,
      medios: [{ tipo: "Tarjeta débito", importe: 6000, referencia: "Visa ****4242 · aut. 123456" }],
    });
    assert.equal(ok.estado, "Pagado");
  });

  // ------------------------------------------------------------
  seccion("HU-50 — crearPago: condición de carrera real (dos pagos casi simultáneos)");

  await prueba(
    "el lock (FOR UPDATE + recálculo fresco) evita que dos pagos concurrentes cobren de más: solo uno de los dos se acepta",
    async () => {
      limpiar();
      // Saldo total: $10.000. Se disparan DOS crearPago en paralelo
      // (Promise.allSettled, no awaits secuenciales) por $6.000 y $5.000 —
      // cada uno, mirado solo, cabe en el saldo ($10.000), así que si no
      // hubiera lock, el chequeo "fail fast" de los dos pasaría con el
      // mismo saldo viejo y los dos se crearían (cobrando $11.000 sobre una
      // deuda de $10.000). Con el lock, la segunda transacción en llegar
      // recalcula el saldo YA DESCONTADO por la primera y se rechaza —
      // sin importar cuál de las dos gane la carrera (no se asume orden).
      const { reserva } = await crearReservaEnCurso({ numero: "308", precioPorNoche: 10000, noches: 1 });

      const resultados = await Promise.allSettled([
        pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 6000 }] }),
        pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Transferencia", importe: 5000 }] }),
      ]);

      const cumplidas = resultados.filter((r) => r.status === "fulfilled");
      const rechazadas = resultados.filter((r) => r.status === "rejected");
      assert.equal(cumplidas.length, 1, "tiene que ganar exactamente una de las dos");
      assert.equal(rechazadas.length, 1, "la otra tiene que rechazarse, no colarse");
      assert.ok(
        rechazadas[0].reason.message.toLowerCase().includes("saldo pendiente"),
        "el rechazo tiene que ser por el recálculo fresco del saldo, no por otro motivo — " +
          `fue: "${rechazadas[0].reason.message}"`,
      );

      // Lo cobrado nunca puede superar la deuda real, sea cual sea el
      // orden en que hayan corrido las dos transacciones.
      const cuenta = await checkOutServicio.consolidarCargos(reserva.id);
      assert.ok(cuenta.totalPagado === 6000 || cuenta.totalPagado === 5000, `totalPagado inesperado: ${cuenta.totalPagado}`);
      assert.equal(cuenta.saldo, 10000 - cuenta.totalPagado);
      assert.ok(cuenta.saldo >= 0, "el saldo nunca puede quedar negativo (cobrado de más)");
    }
  );

  // ------------------------------------------------------------
  seccion("HU-53 — crearComprobante: numeración, IVA, un solo vigente por reserva");

  await prueba("la numeración es correlativa (CE-00001, CE-00002, ...)", async () => {
    limpiar();
    const { reserva: reservaA } = await crearReservaEnCurso({ numero: "401", precioPorNoche: 10000, noches: 1 });
    const { reserva: reservaB } = await crearReservaEnCurso({ numero: "402", precioPorNoche: 10000, noches: 1 });

    const c1 = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reservaA.id, importeTotal: 1000, alicuotaIVA: 21 });
    const c2 = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reservaB.id, importeTotal: 1000, alicuotaIVA: 21 });

    assert.equal(c1.numero, "CE-00001");
    assert.equal(c2.numero, "CE-00002");
  });

  await prueba("el IVA se calcula bien en los dos sentidos: importeTotal (con IVA incluido) e importeNeto (IVA se suma encima)", async () => {
    limpiar();
    const { reserva: reservaA } = await crearReservaEnCurso({ numero: "403" });
    const { reserva: reservaB } = await crearReservaEnCurso({ numero: "404" });

    // Modo importeTotal (el que usa el check-out real): neto + iva tienen
    // que sumar EXACTAMENTE el total, sin centavos de diferencia.
    const conTotal = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reservaA.id, importeTotal: 1000, alicuotaIVA: 21 });
    assert.equal(Number(conTotal.importeTotal), 1000);
    assert.equal(
      Math.round((Number(conTotal.importeNeto) + Number(conTotal.importeIVA)) * 100),
      Math.round(1000 * 100),
      "neto + iva tiene que dar exactamente el total, redondeando en centavos"
    );
    // 1000 / 1.21 = 826.4462... → redondeado 826.45; iva = 1000 - 826.45 = 173.55.
    assert.equal(Number(conTotal.importeNeto), 826.45);
    assert.equal(Number(conTotal.importeIVA), 173.55);

    // Modo importeNeto: el IVA se suma encima.
    const conNeto = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reservaB.id, importeNeto: 1000, alicuotaIVA: 21 });
    assert.equal(Number(conNeto.importeNeto), 1000);
    assert.equal(Number(conNeto.importeIVA), 210);
    assert.equal(Number(conNeto.importeTotal), 1210);
  });

  await prueba("rechaza si se manda importeNeto e importeTotal juntos, o ninguno de los dos", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "405" });
    await esperaError(
      () => comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeNeto: 1000, importeTotal: 1210, alicuotaIVA: 21 }),
      "importeNeto o importeTotal"
    );
    await esperaError(
      () => comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, alicuotaIVA: 21 }),
      "importeNeto o importeTotal"
    );
  });

  await prueba("no permite un segundo comprobante vigente sobre la misma reserva", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "406" });
    await comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeTotal: 1000, alicuotaIVA: 21 });

    await esperaError(
      () => comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeTotal: 500, alicuotaIVA: 21 }),
      "ya tiene un comprobante vigente"
    );
  });

  // ------------------------------------------------------------
  seccion("HU-56 — crearNotaCredito: tope contra lo facturado, descuento en caja diaria");

  await prueba("no permite acreditar más de lo que factura el comprobante original", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "407" });
    const comprobante = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeTotal: 1000, alicuotaIVA: 21 });

    await esperaError(
      () => comprobanteEstadiaServicio.crearNotaCredito(comprobante.id, { importeTotal: 1000.01, alicuotaIVA: 21, motivo: "Ajuste" }),
      "supera lo que todavía se puede acreditar"
    );
  });

  await prueba("acumula el tope entre varias notas de crédito sobre el mismo comprobante", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "408" });
    const comprobante = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeTotal: 1000, alicuotaIVA: 21 });

    await comprobanteEstadiaServicio.crearNotaCredito(comprobante.id, { importeTotal: 400, alicuotaIVA: 21, motivo: "Descuento por queja" });
    // Ya se acreditaron $400 de $1.000 — quedan $600 disponibles, $700 no entra.
    await esperaError(
      () => comprobanteEstadiaServicio.crearNotaCredito(comprobante.id, { importeTotal: 700, alicuotaIVA: 21, motivo: "Otro ajuste" }),
      "supera lo que todavía se puede acreditar"
    );
    // $600 exactos sí entra.
    await comprobanteEstadiaServicio.crearNotaCredito(comprobante.id, { importeTotal: 600, alicuotaIVA: 21, motivo: "Resto" });
  });

  await prueba("reporteCajaDiaria descuenta las notas de crédito del día del total cobrado", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "409", precioPorNoche: 10000, noches: 1 });

    await pagoEstadiaServicio.crearPago({ reservaId: reserva.id, medios: [{ tipo: "Efectivo", importe: 10000 }] });
    const comprobante = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeTotal: 10000, alicuotaIVA: 21 });
    await comprobanteEstadiaServicio.crearNotaCredito(comprobante.id, { importeTotal: 3000, alicuotaIVA: 21, motivo: "Descuento por reclamo" });

    const reporte = await comprobanteEstadiaServicio.reporteCajaDiaria(enDias(0));
    assert.equal(reporte.totalCobrado, 10000);
    assert.equal(reporte.totalNotasCredito, 3000);
    assert.equal(reporte.totalNeto, 7000, "cobrado (10.000) menos notas de crédito (3.000)");
  });

  // ------------------------------------------------------------
  seccion("HU-53/56 — anularComprobante");

  await prueba("bloquea anular un comprobante que tiene notas de crédito vigentes", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "410" });
    const comprobante = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeTotal: 1000, alicuotaIVA: 21 });
    await comprobanteEstadiaServicio.crearNotaCredito(comprobante.id, { importeTotal: 200, alicuotaIVA: 21, motivo: "Ajuste" });

    await esperaError(() => comprobanteEstadiaServicio.anularComprobante(comprobante.id), "notas de crédito asociadas");
  });

  await prueba("anula sin problema un comprobante que no tiene ninguna nota de crédito", async () => {
    limpiar();
    const { reserva } = await crearReservaEnCurso({ numero: "411" });
    const comprobante = await comprobanteEstadiaServicio.crearComprobante({ reservaId: reserva.id, importeTotal: 1000, alicuotaIVA: 21 });

    const anulado = await comprobanteEstadiaServicio.anularComprobante(comprobante.id);
    assert.equal(anulado.anulado, true);
  });

  // ------------------------------------------------------------
  console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
  if (fallaron.length > 0) {
    console.log("\nFallaron:");
    for (const f of fallaron) console.log(`  - ${f.nombre}: ${f.err.stack}`);
    process.exitCode = 1;
  }
}

main();
