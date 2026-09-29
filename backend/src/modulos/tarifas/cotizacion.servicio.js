// Motor de cotización (HU-94) — Etapa 3 de tarifas por temporada. Lógica
// de negocio pura, de solo lectura: no persiste nada y no conoce HTTP.
//
// Es la ÚNICA fuente de cálculo de precio por temporada del sistema — la
// Etapa 4 la va a reutilizar tal cual para reservas, web, walk-in y
// modificaciones, sin reimplementar nada de esto. No toca
// Habitacion.tarifaPorNoche ni ningún cálculo de importe existente de
// reservas/disponibilidad/check-in/check-out/seña (HU-88), ni la regla fija
// de 24hs de cancelación — nada de eso se conecta acá todavía.
//
// Toda la aritmética de precio (bruto, modificador, descuento, redondeo,
// total y promedio) se hace con Prisma.Decimal, nunca con Number/float: el
// motor encadena varias multiplicaciones por noche y por plan, y el error
// de redondeo de punto flotante binario puede desalinear un resultado que
// en teoría cae justo en el límite entre dos múltiplos de $100. La
// conversión a número (para la respuesta JSON) es siempre el último paso.

const { Prisma } = require("@prisma/client");
const { Decimal } = Prisma;
const prisma = require("../../lib/prisma");
const { hoyComoFechaUTC, parsearFechaSinHora: parsearFechaSinHoraBase, diaSemanaDeFecha } = require("../../lib/fechas");
const { resolverTemporadasEfectivasEnRango } = require("./temporadas.servicio");
const { obtenerTarifasVigentes } = require("./precios.servicio");
const { listarPlanesTarifarios } = require("./planesTarifarios.servicio");
const { listarModificadores } = require("./modificadoresDiaSemana.servicio");
const { redondearAMultiploDe100 } = require("./redondeo");
const { TIPO_PLAN, MAX_NOCHES_ESTADIA } = require("./tarifas.constantes");

const UN_DIA_MS = 24 * 60 * 60 * 1000;

class ErrorDeNegocio extends Error {
  constructor(mensaje, statusCode = 400) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

function parsearFechaSinHora(valor, campo) {
  try {
    return parsearFechaSinHoraBase(valor, campo);
  } catch (err) {
    throw new ErrorDeNegocio(err.message);
  }
}

function enteroPositivo(valor, campo) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor a 0.`);
  return numero;
}

function enteroNoNegativo(valor, campo) {
  if (valor === undefined || valor === null || valor === "") return 0;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0) throw new ErrorDeNegocio(`${campo} debe ser un número entero mayor o igual a 0.`);
  return numero;
}

function isoDeFecha(fecha) {
  return fecha.toISOString().slice(0, 10);
}

// --------------------------------------------------------------
// cotizarEstadia (reglas 1 a 9) — función pura interna, exportada además
// del endpoint para que la Etapa 3 (tests) y la Etapa 4 (reservas/web/
// walk-in) la llamen directo. `fechaVenta` es de uso interno: el endpoint
// público (postCotizar en tarifas.controlador.js) nunca la lee del body.
// --------------------------------------------------------------
async function cotizarEstadia(data = {}) {
  const tipoHabitacionId = enteroPositivo(data?.tipoHabitacionId, "tipoHabitacionId");
  const fechaIngreso = parsearFechaSinHora(data?.fechaIngreso, "La fecha de ingreso");
  const fechaEgreso = parsearFechaSinHora(data?.fechaEgreso, "La fecha de egreso");
  const adultos = enteroPositivo(data?.adultos, "adultos");
  const menores = enteroNoNegativo(data?.menores, "menores");
  const canal = data?.canal === "WEB" ? "WEB" : "RECEPCION";
  const fechaVenta = data?.fechaVenta ? parsearFechaSinHora(data.fechaVenta, "fechaVenta") : hoyComoFechaUTC();

  // -------- Regla 2: validaciones previas --------
  if (fechaEgreso.getTime() <= fechaIngreso.getTime()) {
    throw new ErrorDeNegocio("La fecha de egreso tiene que ser posterior a la de ingreso (mínimo una noche).");
  }
  const hoy = hoyComoFechaUTC();
  if (fechaIngreso.getTime() < hoy.getTime()) {
    throw new ErrorDeNegocio("La fecha de ingreso no puede ser anterior a hoy.");
  }
  const noches = Math.round((fechaEgreso.getTime() - fechaIngreso.getTime()) / UN_DIA_MS);
  if (noches > MAX_NOCHES_ESTADIA) {
    throw new ErrorDeNegocio(`La estadía no puede superar las ${MAX_NOCHES_ESTADIA} noches.`);
  }

  const tipo = await prisma.tipoHabitacion.findUnique({ where: { id: tipoHabitacionId } });
  if (!tipo) throw new ErrorDeNegocio("El tipo de habitación indicado no existe.", 404);
  if (!tipo.activo) throw new ErrorDeNegocio("El tipo de habitación indicado está dado de baja.");

  const habitacionesActivas = await prisma.habitacion.findMany({
    where: { tipoHabitacionId, activo: true },
    select: { capacidad: true },
  });
  if (habitacionesActivas.length === 0) {
    throw new ErrorDeNegocio("El tipo de habitación no tiene habitaciones activas para cotizar.", 409);
  }
  const capacidadMaxima = Math.max(...habitacionesActivas.map((h) => h.capacidad));
  if (adultos + menores > capacidadMaxima) {
    throw new ErrorDeNegocio(
      `La cantidad de huéspedes (${adultos + menores}) supera la capacidad máxima de este tipo de habitación (${capacidadMaxima}).`
    );
  }

  // -------- Regla 3: noches y sus temporadas efectivas --------
  // El rango se pide hasta el día ANTERIOR al egreso — la noche de salida
  // no se cobra, así que ni siquiera entra en la resolución.
  const ultimaNoche = new Date(fechaEgreso.getTime() - UN_DIA_MS);
  const dias = await resolverTemporadasEfectivasEnRango(fechaIngreso, ultimaNoche);

  // -------- Regla 4: estadía mínima --------
  const estadiaMinimaExigida = dias.reduce((max, d) => Math.max(max, d.estadiaMinima || 0), 0);
  if (noches < estadiaMinimaExigida) {
    const queExige = dias.find((d) => (d.estadiaMinima || 0) === estadiaMinimaExigida);
    throw new ErrorDeNegocio(
      `La temporada "${queExige.nombre}" exige una estadía mínima de ${estadiaMinimaExigida} noches.`
    );
  }

  // -------- Regla 5: cierre a llegadas --------
  if (dias[0].cierreLlegada) {
    throw new ErrorDeNegocio(
      `No se puede ingresar el ${isoDeFecha(fechaIngreso)}: la temporada "${dias[0].nombre}" tiene cierre a llegadas.`
    );
  }

  // -------- Regla 6a: tarifa vigente por noche (una sola consulta) --------
  const temporadaIds = dias.map((d) => d.temporadaId);
  const tarifaPorTemporada = await obtenerTarifasVigentes(tipoHabitacionId, temporadaIds, fechaVenta);

  const nochesFaltantes = dias.filter((d) => !tarifaPorTemporada.has(d.temporadaId));
  if (nochesFaltantes.length > 0) {
    const detalleFaltantes = nochesFaltantes.map((d) => `${isoDeFecha(d.fecha)} (${d.nombre})`).join(", ");
    throw new ErrorDeNegocio(`No hay tarifa vigente para: ${detalleFaltantes}.`, 409);
  }

  const modificadores = await listarModificadores();
  const modificadorPorDia = new Map(modificadores.map((m) => [m.diaSemana, new Decimal(m.porcentaje)]));

  const ocupacionBase = new Decimal(tipo.ocupacionBase);
  const adultosExtra = Decimal.max(0, new Decimal(adultos).minus(ocupacionBase));

  // -------- Regla 6b/6c: base + adicional + modificador, UNA vez por
  // noche (no una vez por plan — todos los planes parten del mismo valor,
  // el derivado solo le suma su propio descuento encima). --------
  const nochesBase = dias.map((d) => {
    const tarifa = tarifaPorTemporada.get(d.temporadaId);
    const precioBase = new Decimal(tarifa.precioBase);
    const adicionalAplicado = new Decimal(tarifa.adicionalAdultoExtra).times(adultosExtra);
    const bruto = precioBase.plus(adicionalAplicado);
    const diaSemana = diaSemanaDeFecha(d.fecha);
    const porcentajeModificador = modificadorPorDia.get(diaSemana) || new Decimal(0);
    const conModificador = bruto.times(new Decimal(1).plus(porcentajeModificador.dividedBy(100)));
    return {
      fecha: d.fecha,
      diaSemana,
      temporadaId: d.temporadaId,
      temporadaNombre: d.nombre,
      temporadaNivel: d.nivel,
      tarifaId: tarifa.id,
      precioBase,
      adicionalAplicado,
      porcentajeModificador,
      conModificador,
    };
  });

  // -------- Regla 8: un plan (activo, y visibleWeb si canal=WEB) por
  // salida, cada uno con su propio detalle/total/promedio. --------
  const planesActivos = await listarPlanesTarifarios({ activo: "true" });
  const planesEnAlcance = canal === "WEB" ? planesActivos.filter((p) => p.visibleWeb) : planesActivos;

  const planes = planesEnAlcance.map((plan) => {
    const esDerivado = plan.tipo === TIPO_PLAN.DERIVADO;
    const porcentajeDescuentoPlan = esDerivado ? new Decimal(plan.descuentoPorcentaje) : new Decimal(0);
    const factorDescuento = new Decimal(1).minus(porcentajeDescuentoPlan.dividedBy(100));

    const nochesPlan = nochesBase.map((n) => {
      const conDescuento = esDerivado ? n.conModificador.times(factorDescuento) : n.conModificador;
      // Redondeo único, al final de la cadena de esta noche para este plan
      // (regla 6d) — nunca antes.
      return { ...n, precioNocheDecimal: redondearAMultiploDe100(conDescuento) };
    });

    const totalDecimal = nochesPlan.reduce((acc, n) => acc.plus(n.precioNocheDecimal), new Decimal(0));
    const promedioDecimal = totalDecimal.dividedBy(noches);

    const detalle = nochesPlan.map((n) => ({
      fecha: isoDeFecha(n.fecha),
      diaSemana: n.diaSemana,
      temporadaId: n.temporadaId,
      temporadaNombre: n.temporadaNombre,
      temporadaNivel: n.temporadaNivel,
      tarifaId: n.tarifaId,
      precioBase: n.precioBase.toNumber(),
      adicionalAplicado: n.adicionalAplicado.toNumber(),
      porcentajeModificador: n.porcentajeModificador.toNumber(),
      porcentajeDescuentoPlan: porcentajeDescuentoPlan.toNumber(),
      precioNoche: n.precioNocheDecimal.toNumber(),
    }));

    return {
      codigo: plan.codigo,
      nombre: plan.nombre,
      tipo: plan.tipo,
      reembolsable: plan.reembolsable,
      horasCancelacionSinCargo: plan.horasCancelacionSinCargo,
      penalidadNoShow: plan.penalidadNoShow,
      visibleWeb: plan.visibleWeb,
      detalle,
      total: totalDecimal.toNumber(),
      promedioPorNoche: promedioDecimal.toNumber(),
    };
  });

  return {
    fechaVenta: isoDeFecha(fechaVenta),
    noches,
    estadiaMinimaExigida,
    planes,
  };
}

module.exports = { ErrorDeNegocio, cotizarEstadia };
