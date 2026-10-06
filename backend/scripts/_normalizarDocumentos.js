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
//   - fichas viejas sin país: se unen a las del mismo tipo y número si hay un solo país posible;
//   - mismo documento con NOMBRES DISTINTOS: no se unifica NI SE CORRIGE nada de esas fichas (quedan fuera
//     de la transacción) y se informa en "Revisar a mano" para que lo decida una persona. Corregir una
//     sola de ellas dejaría dos fichas con la misma identidad y la transacción abortaría por P2002;
//   - conflictos (dos personas alojadas a la vez con el mismo documento): se informan y no se tocan.
const { normalizarNumeroDocumento, claveNombre } = require("../src/lib/documento");
const { claveDocumento, normalizarPais } = require("../src/modulos/estadia/persona.servicio");
const { identidad } = require("../src/modulos/estadia/estadia.servicio");

function planificar({ huespedes, ocupantes }) {
  const plan = {
    fichasACorregir: [], // { id, numeroDocumento, identidadDocumento, paisDocumento? }
    fusiones: [], // { principalId, duplicadosIds }
    ocupantesACorregir: [], // { id, numeroDocumento, identidadActiva }
    conflictos: [], // alojados a la vez con el mismo documento
    nombresDistintos: [], // mismo documento, distinto nombre: lo decide una persona
  };

  // Agrupa por tipo + número normalizado. Una ficha sin país (dato viejo) se une a las que tienen
  // país si hay un solo país en el grupo; si hay varios, queda aparte porque no se sabe cuál es.
  const grupos = new Map();
  const ordenados = [...huespedes].sort((a, b) => a.id - b.id);
  for (const h of ordenados) {
    const numero = normalizarNumeroDocumento(h.numeroDocumento);
    if (!numero) continue;
    const tipo = String(h.tipoDocumento ?? "").trim().toUpperCase();
    const pais = h.paisDocumento ? normalizarPais(h.paisDocumento) : "";
    const clave = `${tipo}|${numero}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push({ h, numero, pais });
  }

  const descartadas = new Set();
  const aRevisarAMano = new Set(); // ids de fichas con el mismo documento y nombres distintos: no se tocan
  const paisFinal = new Map(); // id -> país con el que queda la ficha
  const subgrupos = [];
  for (const miembros of grupos.values()) {
    const paises = [...new Set(miembros.map((m) => m.pais).filter(Boolean))];
    const unico = paises.length === 1 ? paises[0] : null;
    const porPais = new Map();
    for (const m of miembros) {
      const destino = m.pais || unico || "";
      paisFinal.set(m.h.id, destino);
      if (!porPais.has(destino)) porPais.set(destino, []);
      porPais.get(destino).push(m);
    }
    subgrupos.push(...porPais.values());
  }

  for (const miembros of subgrupos) {
    if (miembros.length < 2) continue;
    const nombres = new Set(miembros.map((m) => claveNombre(m.h.nombre)));
    if (nombres.size > 1) {
      plan.nombresDistintos.push({
        documento: miembros[0].numero,
        fichas: miembros.map((m) => ({ id: m.h.id, nombre: m.h.nombre })),
      });
      for (const m of miembros) aRevisarAMano.add(m.h.id);
      continue;
    }
    // La ficha que ya tiene país (identidad) manda; si ninguna lo tiene, la de menor id.
    const principal = miembros.find((m) => m.pais) ?? miembros[0];
    const duplicadosIds = miembros.filter((m) => m !== principal).map((m) => m.h.id);
    plan.fusiones.push({ principalId: principal.h.id, duplicadosIds });
    for (const id of duplicadosIds) descartadas.add(id);
  }

  for (const h of ordenados) {
    if (descartadas.has(h.id) || aRevisarAMano.has(h.id)) continue;
    const numero = normalizarNumeroDocumento(h.numeroDocumento);
    const pais = paisFinal.get(h.id) ?? (h.paisDocumento ? normalizarPais(h.paisDocumento) : "");
    const nueva = claveDocumento({ tipoDocumento: h.tipoDocumento, paisDocumento: pais, numeroDocumento: numero });
    const identidadFinal = nueva ?? h.identidadDocumento ?? null;
    const paisCambia = pais && pais !== (h.paisDocumento ?? "");
    if (numero !== h.numeroDocumento || (nueva && nueva !== h.identidadDocumento) || paisCambia) {
      plan.fichasACorregir.push({
        id: h.id,
        numeroDocumento: numero,
        identidadDocumento: identidadFinal,
        ...(paisCambia ? { paisDocumento: pais } : {}),
      });
    }
  }

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

// Para mostrar "Revisar a mano" sin datos personales completos: iniciales del nombre y documento
// enmascarado (solo los últimos 3 caracteres), más los ids para encontrar las fichas.
function iniciales(nombre) {
  const partes = String(nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return partes.length ? partes.map((p) => `${p[0].toUpperCase()}.`).join(" ") : "(sin nombre)";
}

function enmascararDocumento(numero) {
  const texto = String(numero ?? "");
  return texto ? `****${texto.slice(-3)}` : "(vacío)";
}

function describirRevisarAMano(nombresDistintos) {
  return nombresDistintos.map(
    (d) => `documento ${enmascararDocumento(d.documento)}: ${d.fichas.map((f) => `ficha ${f.id} (${iniciales(f.nombre)})`).join(" | ")}`
  );
}

module.exports = { planificar, describirRevisarAMano, iniciales, enmascararDocumento };
