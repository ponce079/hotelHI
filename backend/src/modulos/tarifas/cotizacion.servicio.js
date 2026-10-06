// Motor de cotización (HU-94) — Etapa 3 de tarifas por temporada. Lógica
// de negocio pura, de solo lectura: no persiste nada y no conoce HTTP.
//
// Es la ÚNICA fuente de cálculo de precio por temporada del sistema — la
// Etapa 4 la reutiliza tal cual para reservas, web, walk-in, modificaciones
// y check-out (vía ReservaNoche). La seña (HU-88) y la regla fija de 24 hs de
// cancelación se retiraron: la penalidad por cancelación y por no-show la calcula
// calcularPenalidad (penalidades.servicio.js) y la cobra el módulo de garantías
// (garantias/cierreReserva.servicio.js).
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
const { obtenerTarifasVigentes, obtenerTarifasVigentesParaTipos } = require("./precios.servicio");
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
//
// `cliente` (Etapa 4A) — un `tx` opcional para que cotizarReserva (más
// abajo) pueda cotizar cada habitación DENTRO de la misma transacción del
// alta o la modificación de una reserva, en vez de leer contra la
// conexión suelta mientras esa transacción todavía no cerró.
//
// `precargado` (Etapa 4C) — opcional, con cualquier combinación de
// { tipo, habitacionesActivas, dias, tarifaPorTemporada, modificadores,
// planesActivos } ya resueltos por el llamador. Si no vienen, cada uno se
// lee acá adentro como siempre (el cotizador de pantalla, que cotiza un
// solo tipo suelto, nunca pasa este argumento). cotizarReserva lo usa para
// pedir UNA sola vez, para TODA la reserva, lo que es idéntico para
// cualquier habitación (rango de fechas, modificadores, planes) o idéntico
// por tipo (tarifas) — ver el comentario grande en cotizarReserva.
//
// `opciones.ignorarRestriccionesVenta` (rediseño del check-in) — omite SOLO
// la estadía mínima y el cierre a llegadas, que son restricciones de VENTA:
// no aplican al precio de una persona adicional en una estadía ya vendida y
// En curso. Precio por noche, plan, temporada, adicionales, menores y
// modificador por día de la semana se calculan igual. Sin la opción, nada
// cambia.
// --------------------------------------------------------------
async function cotizarEstadia(data = {}, cliente = prisma, precargado = {}, opciones = {}) {
  const ignorarRestriccionesVenta = opciones?.ignorarRestriccionesVenta === true;
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
    // Etapa 4A: mismo tope y mismo mensaje que reservas.servicio.js/el
    // frontend — MAX_NOCHES_ESTADIA es ahora la ÚNICA constante de la que
    // salen los tres (ver tarifas.constantes.js).
    throw new ErrorDeNegocio(
      `Las estadías de más de ${MAX_NOCHES_ESTADIA} noches requieren una tarifa de larga estadía: consultá con gerencia.`
    );
  }

  const tipo = precargado.tipo ?? (await cliente.tipoHabitacion.findUnique({ where: { id: tipoHabitacionId } }));
  if (!tipo) throw new ErrorDeNegocio("El tipo de habitación indicado no existe.", 404);
  if (!tipo.activo) throw new ErrorDeNegocio("El tipo de habitación indicado está dado de baja.");

  const habitacionesActivas =
    precargado.habitacionesActivas ??
    (await cliente.habitacion.findMany({
      where: { tipoHabitacionId, activo: true },
      select: { capacidad: true },
    }));
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
  const dias = precargado.dias ?? (await resolverTemporadasEfectivasEnRango(fechaIngreso, ultimaNoche, cliente));

  // -------- Regla 4: estadía mínima --------
  const estadiaMinimaExigida = dias.reduce((max, d) => Math.max(max, d.estadiaMinima || 0), 0);
  if (!ignorarRestriccionesVenta && noches < estadiaMinimaExigida) {
    const queExige = dias.find((d) => (d.estadiaMinima || 0) === estadiaMinimaExigida);
    throw new ErrorDeNegocio(
      `La temporada "${queExige.nombre}" exige una estadía mínima de ${estadiaMinimaExigida} noches.`
    );
  }

  // -------- Regla 5: cierre a llegadas --------
  if (!ignorarRestriccionesVenta && dias[0].cierreLlegada) {
    throw new ErrorDeNegocio(
      `No se puede ingresar el ${isoDeFecha(fechaIngreso)}: la temporada "${dias[0].nombre}" tiene cierre a llegadas.`
    );
  }

  // -------- Regla 6a: tarifa vigente por noche (una sola consulta) --------
  const temporadaIds = dias.map((d) => d.temporadaId);
  const tarifaPorTemporada =
    precargado.tarifaPorTemporada ?? (await obtenerTarifasVigentes(tipoHabitacionId, temporadaIds, fechaVenta, cliente));

  const nochesFaltantes = dias.filter((d) => !tarifaPorTemporada.has(d.temporadaId));
  if (nochesFaltantes.length > 0) {
    const detalleFaltantes = nochesFaltantes.map((d) => `${isoDeFecha(d.fecha)} (${d.nombre})`).join(", ");
    throw new ErrorDeNegocio(`No hay tarifa vigente para: ${detalleFaltantes}.`, 409);
  }

  const modificadores = precargado.modificadores ?? (await listarModificadores(cliente));
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
  const planesActivos = precargado.planesActivos ?? (await listarPlanesTarifarios({ activo: "true" }, cliente));
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

// --------------------------------------------------------------
// cotizarReserva (Etapa 4A, HU-95/96, regla 2) — orquesta cotizarEstadia
// por cada habitación REAL de una reserva (no por tipo, como el cotizador
// suelto) y agrupa el resultado por plan: detalle por habitación y noche,
// total por habitación, total de la reserva. Es la única que usan la
// vista previa (POST /api/reservas/cotizar), la confirmación del alta
// (crearReservaEnTransaccion) y la de la modificación — el precio de una
// reserva nunca se calcula en ningún otro lugar del código.
//
// Si viene `planTarifarioId`, el resultado se filtra a ESE plan (y se
// rechaza si no está disponible para el canal pedido) — pensado para el
// alta/modificación real, que ya sabe qué plan eligió el usuario y no
// necesita cotizar el resto. Sin `planTarifarioId` (vista previa/selector
// de plan) se devuelven todos los planes en alcance.
// --------------------------------------------------------------
async function cotizarReserva(
  { fechaDesde, fechaHasta, planTarifarioId, habitaciones, canal, fechaVenta } = {},
  cliente = prisma,
  opciones = {}
) {
  const lista = Array.isArray(habitaciones) ? habitaciones : [];
  if (lista.length === 0) throw new ErrorDeNegocio("Hay que elegir al menos una habitación para cotizar.");

  const habitacionesValidadas = [];
  for (const h of lista) {
    const habitacionId = enteroPositivo(h?.habitacionId, "habitacionId");
    const adultos = enteroPositivo(h?.adultos, "adultos");
    const menores = enteroNoNegativo(h?.menores, "menores");
    const habitacion = await cliente.habitacion.findUnique({ where: { id: habitacionId } });
    if (!habitacion) throw new ErrorDeNegocio("Alguna de las habitaciones elegidas no existe.", 404);
    if (!habitacion.activo) throw new ErrorDeNegocio(`La habitación ${habitacion.numero} está dada de baja.`);
    if (adultos + menores > habitacion.capacidad) {
      throw new ErrorDeNegocio(
        `La ocupación de la habitación ${habitacion.numero} (${adultos + menores}) supera su capacidad (${habitacion.capacidad}).`
      );
    }
    habitacionesValidadas.push({
      habitacionId,
      adultos,
      menores,
      numero: habitacion.numero,
      tipoHabitacionId: habitacion.tipoHabitacionId,
    });
  }

  // -------- Deduplicación (Etapa 4C, bug de timeout contra Clever Cloud)
  // --------
  // Todas las habitaciones de ESTA reserva comparten el mismo rango de
  // fechas → el mismo rango de temporadas, los mismos modificadores por
  // día de semana y los mismos planes activos. Antes, cotizarEstadia los
  // volvía a leer, idénticos, una vez por habitación — con una reserva de
  // varias habitaciones eso es trabajo repetido que no depende para nada
  // de CUÁL habitación se está cotizando. Acá se leen una sola vez para
  // toda la reserva y se le pasan ya cargados a cada cotizarEstadia (que
  // sigue pudiendo leerlos solo si no se los pasan — el cotizador de
  // pantalla, que cotiza un tipo suelto sin pasar por acá, sigue igual).
  // Las tarifas sí dependen del tipo de habitación (no son iguales entre
  // una Doble y una Simple), así que se piden en una sola consulta para
  // TODOS los tipos presentes en la reserva (antes: una consulta por
  // habitación, aunque dos compartieran tipo).
  const fechaIngresoComun = parsearFechaSinHora(fechaDesde, "La fecha de entrada");
  const fechaEgresoComun = parsearFechaSinHora(fechaHasta, "La fecha de salida");
  const ultimaNocheComun = new Date(fechaEgresoComun.getTime() - UN_DIA_MS);
  const diasComunes = await resolverTemporadasEfectivasEnRango(fechaIngresoComun, ultimaNocheComun, cliente);
  const temporadaIdsComunes = diasComunes.map((d) => d.temporadaId);
  const fechaVentaParaTarifas = fechaVenta ? parsearFechaSinHora(fechaVenta, "fechaVenta") : hoyComoFechaUTC();

  const tiposHabitacionIds = [...new Set(habitacionesValidadas.map((h) => h.tipoHabitacionId))];
  const [modificadoresComunes, planesActivosComunes, tarifaPorTipoYTemporada] = await Promise.all([
    listarModificadores(cliente),
    listarPlanesTarifarios({ activo: "true" }, cliente),
    obtenerTarifasVigentesParaTipos(tiposHabitacionIds, temporadaIdsComunes, fechaVentaParaTarifas, cliente),
  ]);

  // tipo/habitacionesActivas sí dependen del tipo (no de la fecha), así
  // que se cachean por tipo — dos habitaciones del mismo tipo (el caso más
  // común: "2 Dobles") comparten la misma entrada sin leerla dos veces.
  const tipoCache = new Map();
  async function tipoPrecargado(tipoHabitacionId) {
    if (!tipoCache.has(tipoHabitacionId)) {
      const [tipo, habitacionesActivas] = await Promise.all([
        cliente.tipoHabitacion.findUnique({ where: { id: tipoHabitacionId } }),
        cliente.habitacion.findMany({ where: { tipoHabitacionId, activo: true }, select: { capacidad: true } }),
      ]);
      tipoCache.set(tipoHabitacionId, { tipo, habitacionesActivas });
    }
    return tipoCache.get(tipoHabitacionId);
  }

  // Por cada habitación, cotiza su TIPO con SU propia ocupación —
  // cotizarEstadia ya devuelve todos los planes en alcance para ese canal;
  // acá solo se reorganiza el resultado por plan en vez de por habitación.
  const resultadosPorHabitacion = [];
  for (const h of habitacionesValidadas) {
    const { tipo, habitacionesActivas } = await tipoPrecargado(h.tipoHabitacionId);
    const resultado = await cotizarEstadia(
      {
        tipoHabitacionId: h.tipoHabitacionId,
        fechaIngreso: fechaDesde,
        fechaEgreso: fechaHasta,
        adultos: h.adultos,
        menores: h.menores,
        canal,
        fechaVenta,
      },
      cliente,
      {
        tipo,
        habitacionesActivas,
        dias: diasComunes,
        tarifaPorTemporada: tarifaPorTipoYTemporada.get(h.tipoHabitacionId) ?? new Map(),
        modificadores: modificadoresComunes,
        planesActivos: planesActivosComunes,
      },
      opciones
    );
    resultadosPorHabitacion.push({ ...h, resultado });
  }

  // Fecha de venta resuelta, noches y estadía mínima son iguales para
  // todas las habitaciones (mismo rango de fechas) — se toman de la
  // primera cotización.
  const { fechaVenta: fechaVentaResuelta, noches, estadiaMinimaExigida } = resultadosPorHabitacion[0].resultado;

  // Intersección de los códigos de plan presentes en TODAS las
  // habitaciones — en la práctica los planes solo dependen del canal (no
  // del tipo de habitación), así que esto suele ser "los planes de
  // cualquiera de ellas", pero se intersecta por las dudas.
  let codigosComunes = null;
  for (const rh of resultadosPorHabitacion) {
    const codigos = new Set(rh.resultado.planes.map((p) => p.codigo));
    codigosComunes = codigosComunes ? new Set([...codigosComunes].filter((c) => codigos.has(c))) : codigos;
  }

  let planes = [...codigosComunes].map((codigo) => {
    const habitacionesDelPlan = resultadosPorHabitacion.map((rh) => {
      const planHabitacion = rh.resultado.planes.find((p) => p.codigo === codigo);
      return {
        habitacionId: rh.habitacionId,
        numero: rh.numero,
        adultos: rh.adultos,
        menores: rh.menores,
        detalle: planHabitacion.detalle,
        total: planHabitacion.total,
      };
    });
    const infoPlan = resultadosPorHabitacion[0].resultado.planes.find((p) => p.codigo === codigo);
    const totalDecimal = habitacionesDelPlan.reduce((acc, h) => acc.plus(new Decimal(h.total)), new Decimal(0));
    const promedioDecimal = noches > 0 ? totalDecimal.dividedBy(noches) : new Decimal(0);
    return {
      codigo: infoPlan.codigo,
      nombre: infoPlan.nombre,
      tipo: infoPlan.tipo,
      reembolsable: infoPlan.reembolsable,
      horasCancelacionSinCargo: infoPlan.horasCancelacionSinCargo,
      penalidadNoShow: infoPlan.penalidadNoShow,
      visibleWeb: infoPlan.visibleWeb,
      habitaciones: habitacionesDelPlan,
      total: totalDecimal.toNumber(),
      promedioPorNoche: promedioDecimal.toNumber(),
    };
  });

  if (planTarifarioId !== undefined && planTarifarioId !== null && planTarifarioId !== "") {
    const id = enteroPositivo(planTarifarioId, "planTarifarioId");
    const plan = await cliente.planTarifario.findUnique({ where: { id } });
    const elegido = plan ? planes.find((p) => p.codigo === plan.codigo) : null;
    if (!elegido) {
      throw new ErrorDeNegocio(
        "El plan tarifario elegido no está disponible para esta cotización (revisá que esté activo y, si el canal es WEB, que sea visible en la web)."
      );
    }
    planes = [elegido];
  }

  return { fechaVenta: fechaVentaResuelta, noches, estadiaMinimaExigida, planes };
}

module.exports = { ErrorDeNegocio, cotizarEstadia, cotizarReserva };
