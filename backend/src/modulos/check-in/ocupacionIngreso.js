// Rediseño del check-in — validación de la ocupación real que ingresa, SIN acceso a la base.
//
// La usan el confirmar con reserva (body nuevo) y el walk-in, antes de abrir la transacción:
// así un error de carga responde 400 sin tocar nada. Devuelve los errores agrupados por
// habitación, redactados para mostrarse tal cual en la pantalla de recepción (sin nombres de
// campos ni de tablas).
//
// Dos criterios de edad, que no se mezclan (lib/fechas.js):
//   - EDAD_ADULTO_OCUPACION (13): solo para CONTAR adultos y menores de la habitación.
//   - MAYORIA_EDAD (18): titular de habitación, responsable de un menor y quién necesita uno.
const { EDAD_ADULTO_OCUPACION, MAYORIA_EDAD, edadEn } = require("../../lib/fechas");
const { normalizarVinculo, requiereAutorizacion } = require("../../lib/vinculos");
const { esTelefono } = require("../../lib/contacto");
const { normalizarTipoDocumento } = require("../../lib/tiposDocumento");
const { normalizarPais } = require("../estadia/persona.servicio");
const { normalizarNumeroDocumento } = require("../../lib/documento");

const texto = (v) => String(v ?? "").trim();
const nombreDe = (p) => `${texto(p.nombre)} ${texto(p.apellido)}`.trim() || "Una persona sin nombre";
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const etiquetaHabitacion = (h) => `Habitación ${h.numero ?? h.habitacionId}`;

function fechaSinHora(valor) {
  if (!valor) return null;
  const s = String(valor instanceof Date ? valor.toISOString() : valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? d : null;
}

// Clave de documento comparable (tipo + país + número), la misma idea que la identidad de
// Huesped: sin país no se puede afirmar que dos documentos sean de la misma persona.
function claveDocumento(p) {
  // El número se compara sin puntos, guiones ni espacios (así se guarda: lib/documento.js).
  const numero = normalizarNumeroDocumento(p.numeroDocumento);
  const tipo = normalizarTipoDocumento(p.tipoDocumento) ?? texto(p.tipoDocumento);
  if (!numero || !tipo) return null;
  const pais = texto(p.paisDocumento) ? normalizarPais(p.paisDocumento) : "";
  return `${tipo.toUpperCase()}|${pais}|${numero}`;
}

// El huésped de la reserva puede no tener país emisor (registros anteriores): se compara por
// tipo y número, y por país solo cuando los dos lo tienen.
function esLaMismaPersona(huesped, persona) {
  if (!huesped) return false;
  // Sin puntos, guiones ni espacios: la reserva guarda "45112902" y en el mostrador se tipea "45.112.902".
  const numero = normalizarNumeroDocumento;
  const tipo = (v) => (normalizarTipoDocumento(v) ?? texto(v)).toUpperCase();
  if (!numero(huesped.numeroDocumento) || numero(huesped.numeroDocumento) !== numero(persona.numeroDocumento)) return false;
  if (tipo(huesped.tipoDocumento) !== tipo(persona.tipoDocumento)) return false;
  if (texto(huesped.paisDocumento) && texto(persona.paisDocumento))
    return normalizarPais(huesped.paisDocumento) === normalizarPais(persona.paisDocumento);
  return true;
}

/**
 * @param {object} args
 * @param {Array<{habitacionId:number, numero:string, capacidad:number, adultos:number, menores:number}>} args.habitaciones
 *        habitaciones DEFINITIVAS, en el orden de la pantalla (la primera define al titular en walk-in).
 * @param {Array<object>} args.personas  personas del body (id temporal, habitacionId, esTitular, responsableId, ficha).
 * @param {Date} args.fechaIngreso       fecha de ingreso por defecto (la de la reserva).
 * @param {object|null} args.huespedReserva  quien reservó (solo con reserva).
 * @param {string} [args.motivoTitularDistinto]
 * @returns {{ errores: {generales:string[], porHabitacion:Array}, hayErrores:boolean,
 *            titularDistinto:boolean, faltaMotivo:boolean, titularDeLaReserva:object|null }}
 */
function validarOcupacionIngreso({ habitaciones, personas, fechaIngreso, huespedReserva = null, motivoTitularDistinto }) {
  const generales = [];
  const porHabitacion = habitaciones.map((h) => ({ habitacionId: h.habitacionId, numero: h.numero, errores: [] }));
  const erroresDe = (habitacionId) => porHabitacion.find((h) => h.habitacionId === habitacionId)?.errores;
  const lista = Array.isArray(personas) ? personas : [];

  if (!lista.length) generales.push("Cargá a las personas que ingresan.");

  // Edad de cada persona a su fecha de ingreso (la de la reserva si no trae otra).
  const edades = new Map();
  for (const p of lista) {
    const nacimiento = fechaSinHora(p.fechaNacimiento);
    const ingreso = fechaSinHora(p.fechaDesde) ?? fechaIngreso;
    edades.set(p, nacimiento && ingreso ? edadEn(nacimiento, ingreso) : null);
  }

  // Misma persona dos veces en el envío (en la misma o en otra habitación).
  const vistas = new Map();
  for (const p of lista) {
    const clave = claveDocumento(p);
    if (!clave) continue;
    if (vistas.has(clave)) {
      generales.push(
        `${nombreDe(vistas.get(clave))} y ${nombreDe(p)} tienen el mismo documento ` +
          `(${texto(p.tipoDocumento)} ${texto(p.numeroDocumento)}). Cargá a cada persona una sola vez.`,
      );
    } else vistas.set(clave, p);
  }

  // Ids temporales únicos: el responsable se indica con el id de otra persona del envío.
  const porId = new Map();
  for (const p of lista) {
    const idTemporal = String(p.id ?? "");
    if (!idTemporal) generales.push(`Falta identificar en la lista a ${nombreDe(p)}. Volvé a cargar la pantalla.`);
    else if (porId.has(idTemporal)) generales.push(`${nombreDe(p)} figura dos veces en la lista. Volvé a cargar la pantalla.`);
    else porId.set(idTemporal, p);
  }

  for (const p of lista) {
    const habitacion = habitaciones.find((h) => Number(h.habitacionId) === Number(p.habitacionId));
    if (!habitacion) generales.push(`${nombreDe(p)} no tiene asignada una habitación de este check-in.`);
    const edad = edades.get(p);
    const nacimiento = fechaSinHora(p.fechaNacimiento);
    if (!nacimiento) generales.push(`Falta la fecha de nacimiento de ${nombreDe(p)}.`);
    else if (edad === null || edad < 0) generales.push(`La fecha de nacimiento de ${nombreDe(p)} no es válida.`);
    // Todo menor de 18 necesita un adulto responsable (de 18 o más) de esta misma reserva.
    if (edad !== null && edad >= 0 && edad < MAYORIA_EDAD) {
      const responsable = p.responsableId != null && p.responsableId !== "" ? porId.get(String(p.responsableId)) : null;
      if (!responsable) generales.push(`${nombreDe(p)} es menor de 18 años: indicá qué adulto es su responsable.`);
      else if (responsable === p) generales.push(`${nombreDe(p)} no puede ser su propio responsable.`);
      else {
        const edadResponsable = edades.get(responsable);
        if (edadResponsable === null || edadResponsable < MAYORIA_EDAD)
          generales.push(`El responsable de ${nombreDe(p)} (${nombreDe(responsable)}) tiene que ser mayor de 18 años.`);
        // Vínculo del responsable con el menor (catálogo) y, si es otro familiar u otro adulto,
        // la autorización de los padres o tutores.
        const vinculo = normalizarVinculo(p.vinculoResponsable);
        if (!vinculo) generales.push(`Indicá el vínculo de ${nombreDe(responsable)} con ${nombreDe(p)}.`);
        else if (requiereAutorizacion(vinculo) && p.autorizacionPresentada !== true)
          generales.push(
            `${nombreDe(p)} está a cargo de ${nombreDe(responsable)} (${vinculo}): pedí la autorización de los padres o tutores y marcá "Autorización presentada".`,
          );
      }
    }
  }

  for (const h of habitaciones) {
    const errores = erroresDe(h.habitacionId);
    const adultos = Number(h.adultos);
    const menores = Number(h.menores);
    if (!Number.isInteger(adultos) || adultos < 1) errores.push(`${etiquetaHabitacion(h)}: tiene que ingresar al menos un adulto.`);
    if (!Number.isInteger(menores) || menores < 0) errores.push(`${etiquetaHabitacion(h)}: la cantidad de menores no es válida.`);
    if (Number.isInteger(adultos) && Number.isInteger(menores) && adultos + menores > h.capacidad)
      errores.push(
        `${etiquetaHabitacion(h)}: entran como máximo ${plural(h.capacidad, "persona", "personas")} y se indicaron ${adultos + menores}.`,
      );

    const deLaHabitacion = lista.filter((p) => Number(p.habitacionId) === Number(h.habitacionId));
    const conEdad = deLaHabitacion.filter((p) => edades.get(p) !== null && edades.get(p) >= 0);
    if (conEdad.length === deLaHabitacion.length) {
      const menoresCargados = conEdad.filter((p) => edades.get(p) < EDAD_ADULTO_OCUPACION).length;
      const adultosCargados = conEdad.length - menoresCargados;
      if (adultosCargados !== adultos || menoresCargados !== menores)
        errores.push(
          `${etiquetaHabitacion(h)}: se indicaron ${plural(adultos, "adulto", "adultos")} y ${plural(menores, "menor", "menores")}, ` +
            `pero se cargaron ${plural(adultosCargados, "adulto", "adultos")} y ${plural(menoresCargados, "menor", "menores")} ` +
            `(desde los ${EDAD_ADULTO_OCUPACION} años cuenta como adulto).`,
        );
    }

    const titulares = deLaHabitacion.filter((p) => p.esTitular === true);
    if (titulares.length === 0) errores.push(`${etiquetaHabitacion(h)}: marcá quién es el titular.`);
    else if (titulares.length > 1)
      errores.push(
        `${etiquetaHabitacion(h)}: hay ${titulares.length} titulares (${titulares.map(nombreDe).join(" y ")}); tiene que haber uno solo.`,
      );
    else {
      const edadTitular = edades.get(titulares[0]);
      if (edadTitular !== null && edadTitular >= 0 && edadTitular < MAYORIA_EDAD)
        errores.push(`${etiquetaHabitacion(h)}: el titular (${nombreDe(titulares[0])}) tiene que ser mayor de 18 años.`);
    }
  }

  // Titular de la reserva: con reserva, el titular de habitación que es quien reservó; si es
  // otra persona, el de la primera habitación (igual que en el walk-in). Es el único que
  // necesita teléfono: los titulares de las demás habitaciones lo tienen opcional.
  const titularesPorHabitacion = habitaciones
    .map((h) => lista.find((p) => Number(p.habitacionId) === Number(h.habitacionId) && p.esTitular === true))
    .filter(Boolean);
  const coincideConQuienReservo = huespedReserva
    ? titularesPorHabitacion.find((p) => esLaMismaPersona(huespedReserva, p))
    : null;
  const titularDeLaReserva = coincideConQuienReservo ?? titularesPorHabitacion[0] ?? null;
  if (titularDeLaReserva && !esTelefono(titularDeLaReserva.telefono))
    generales.push(
      `${nombreDe(titularDeLaReserva)} es el titular de la reserva y necesita un teléfono de contacto válido ` +
        "(números, +, espacios o guiones).",
    );

  const hayErrores = generales.length > 0 || porHabitacion.some((h) => h.errores.length > 0);
  const titularDistinto = Boolean(huespedReserva) && titularesPorHabitacion.length > 0 && !coincideConQuienReservo;
  const faltaMotivo = titularDistinto && !texto(motivoTitularDistinto);
  return {
    errores: { generales: [...new Set(generales)], porHabitacion },
    hayErrores,
    titularDistinto,
    faltaMotivo,
    titularDeLaReserva,
  };
}

// Mensaje único para el 400 (la pantalla puede usar el detalle por habitación).
function resumirErrores({ generales, porHabitacion }) {
  const todos = [...porHabitacion.flatMap((h) => h.errores), ...generales];
  return todos.length === 1 ? todos[0] : `Revisá la carga antes de confirmar: ${todos.join(" ")}`;
}

module.exports = { validarOcupacionIngreso, resumirErrores, esLaMismaPersona, claveDocumento };
