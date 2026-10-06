// Planificador (puro, sin base de datos) de la normalización de documentos.
//
// Antes, "45.112.902" y "45112902" eran dos documentos distintos y el mismo huésped podía quedar
// duplicado. Ahora el número se guarda sin puntos, guiones ni espacios. Este planificador decide,
// a partir de lo que hay en la base, qué cambiar:
//   - cada ficha de Huesped: número normalizado y su identidad (hash) recalculada;
//   - fichas que pasan a ser el mismo documento: se unifican en la de menor id (las reservas y
//     ocupantes de las demás se redirigen a ella);
//   - cada OcupanteReserva: número normalizado e identidadActiva recalculada (solo la tienen
//     quienes están alojados);
//   - conflictos (dos personas alojadas a la vez con el mismo documento): se informan y no se tocan.
const { normalizarNumeroDocumento } = require("../src/lib/documento");
const { claveDocumento } = require("../src/modulos/estadia/persona.servicio");
const { identidad } = require("../src/modulos/estadia/estadia.servicio");

function planificar({ huespedes, ocupantes }) {
  const plan = {
    fichasACorregir: [], // { id, numeroDocumento, identidadDocumento }
    fusiones: [], // { principalId, duplicadosIds }
    ocupantesACorregir: [], // { id, numeroDocumento, identidadActiva }
    conflictos: [],
  };

  const porIdentidad = new Map();
  for (const h of [...huespedes].sort((a, b) => a.id - b.id)) {
    const numero = normalizarNumeroDocumento(h.numeroDocumento);
    const nueva = claveDocumento({ tipoDocumento: h.tipoDocumento, paisDocumento: h.paisDocumento, numeroDocumento: numero });
    const identidadFinal = nueva ?? h.identidadDocumento ?? null;
    if (identidadFinal && nueva) {
      if (!porIdentidad.has(identidadFinal)) porIdentidad.set(identidadFinal, []);
      porIdentidad.get(identidadFinal).push(h.id);
    }
    if (numero !== h.numeroDocumento || (nueva && nueva !== h.identidadDocumento)) {
      plan.fichasACorregir.push({ id: h.id, numeroDocumento: numero, identidadDocumento: identidadFinal });
    }
  }
  for (const ids of porIdentidad.values()) {
    if (ids.length > 1) plan.fusiones.push({ principalId: ids[0], duplicadosIds: ids.slice(1) });
  }
  const duplicados = new Set(plan.fusiones.flatMap((f) => f.duplicadosIds));
  plan.fichasACorregir = plan.fichasACorregir.filter((f) => !duplicados.has(f.id));

  const activas = new Map();
  for (const o of ocupantes) {
    const numero = normalizarNumeroDocumento(o.numeroDocumento);
    const identidadActiva = o.identidadActiva ? identidad({ ...o, numeroDocumento: numero }) : null;
    if (identidadActiva) {
      if (activas.has(identidadActiva)) {
        plan.conflictos.push({ ocupanteIds: [activas.get(identidadActiva), o.id], documento: numero });
        continue;
      }
      activas.set(identidadActiva, o.id);
    }
    if (numero !== (o.numeroDocumento ?? "") || (identidadActiva && identidadActiva !== o.identidadActiva)) {
      plan.ocupantesACorregir.push({ id: o.id, numeroDocumento: numero, identidadActiva });
    }
  }
  return plan;
}

module.exports = { planificar };
