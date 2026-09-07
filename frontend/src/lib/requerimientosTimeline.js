import { ESTADOS_REQUERIMIENTO, TIPOS_REQUERIMIENTO } from "./constantes";
import { formatearFechaSolo } from "./fechas";

// Timeline construido por instancia, no un array fijo de pasos: cada
// requerimiento tiene su propio camino real. Compartido entre la ficha de
// detalle (RequerimientoDetallePage, con sublabels de fecha/usuario) y el
// indicador compacto de la lista (MiniPasos, sin sublabels) — mismo
// resultado {pasos, pasoActual}, cada widget decide cómo dibujarlo.
//
// Reglas:
//   - Un nodo solo aparece si de verdad puede pasar por ese estado en ESTE
//     camino puntual (ej. "Sugerencia confirmada" no existe si nunca fue
//     Sugerida — se sabe por el campo persistido `nacioComoSugerida`, no
//     parseando texto de log: dos caminos de creación distintos loggeaban
//     con redacciones distintas y un primer intento basado en texto se
//     perdió uno de los dos, ver REQ-0046).
//   - Un nodo solo lleva sublabel (fecha/usuario) si hay un registro real
//     de esa transición (RequerimientoLog) — nunca se inventa "sistema"
//     para simular una acción que no quedó registrada. Sin `req.log`
//     (la lista no lo trae, por rendimiento) los sublabels simplemente no
//     se calculan — no rompe nada, MiniPasos no los usa.
//   - `advertencia` (ver PasoAPaso.jsx) marca en ámbar, no verde, un nodo
//     que se alcanzó pero necesita revisión: "Recibida con diferencia" (ya
//     completo, no error) y "En tránsito" mientras está "Pendiente de
//     stock" (todavía en curso, no bloqueo duro).
//
// El matching de logs (para sublabels, no para la estructura) es por
// texto exacto de `accion` — frágil si el mensaje del backend cambia de
// redacción, pero es lo único que existe hoy; no hay un campo de "tipo de
// evento" estructurado en RequerimientoLog.
function subLabelDe(log) {
  return log ? `${formatearFechaSolo(log.fecha)} · ${log.usuario}` : undefined;
}

// COMPRA: siempre depósito central (ya no existe la excepción periférica).
// Puede o no haber pasado por "Sugerida" — es lo único condicional acá.
function construirEtapasCompra(req) {
  const fueSugerida = Boolean(req.nacioComoSugerida);
  const logConfirmacion = req.log?.find((l) => l.accion === "Sugerencia de reposición confirmada");
  const logCierre = req.log?.slice().reverse().find((l) => l.accion?.startsWith("Cerrada"));

  const pasos = [{ clave: "creado", label: "Creado", sublabel: `${formatearFechaSolo(req.fecha)} · ${req.solicitante || "—"}` }];
  if (fueSugerida) {
    pasos.push({ clave: "sugerida", label: "Sugerencia confirmada", sublabel: subLabelDe(logConfirmacion) });
  }
  pasos.push({ clave: "cotizacion", label: "En cotización" });
  // "Aprobado" hoy no deja ningún registro (ni log ni campo de fecha) —
  // se completa sin sublabel a propósito, en vez de inventar uno. Agregar
  // ese registro quedó anotado como tarea aparte, no se mezcla acá.
  pasos.push({ clave: "aprobado", label: "Aprobado" });
  pasos.push({ clave: "cerrada", label: "Cerrada", sublabel: subLabelDe(logCierre) });

  const offset = fueSugerida ? 1 : 0;
  let pasoActual;
  switch (req.estado) {
    case ESTADOS_REQUERIMIENTO.SUGERIDA:
      pasoActual = 1;
      break;
    case ESTADOS_REQUERIMIENTO.PENDIENTE:
      pasoActual = 1 + offset;
      break;
    case ESTADOS_REQUERIMIENTO.EN_COTIZACION:
      pasoActual = 2 + offset;
      break;
    case ESTADOS_REQUERIMIENTO.APROBADO:
      pasoActual = 3 + offset;
      break;
    case ESTADOS_REQUERIMIENTO.CERRADA:
      pasoActual = pasos.length; // todo completo — ver PasoAPaso.jsx
      break;
    default:
      pasoActual = 0;
  }
  return { pasos, pasoActual };
}

// TRANSFERENCIA: siempre depósito periférico. "Pendiente" es transitorio
// (crearRequerimiento resuelve el stock en la misma transacción que crea
// el requerimiento — casi nunca se llega a ver ese estado). "Recibida" y
// "Cerrada" son dos resultados posibles de la MISMA acción de recepción
// (con diferencia / limpio), no dos pasos en secuencia — un solo nodo
// final que cambia de label y color según cuál ocurrió.
function construirEtapasTransferencia(req) {
  const bloqueada = req.estado === ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK;
  const recibidaConDiferencia = req.estado === ESTADOS_REQUERIMIENTO.RECIBIDA;
  const logReserva = req.log?.find((l) => l.accion?.startsWith("Transferencia aprobada y reservada"));
  const logBloqueo = req.log
    ?.slice()
    .reverse()
    .find((l) => l.accion?.includes("pendiente de stock") || l.accion?.startsWith("Bloqueada"));
  const logRecepcion = req.log?.slice().reverse().find((l) => l.accion?.startsWith("Recepción confirmada"));

  const pasos = [
    { clave: "creado", label: "Creado", sublabel: `${formatearFechaSolo(req.fecha)} · ${req.solicitante || "—"}` },
    {
      clave: "transito",
      label: "En tránsito",
      sublabel: bloqueada ? subLabelDe(logBloqueo) : subLabelDe(logReserva),
      advertencia: bloqueada,
    },
    {
      clave: "recibido",
      label: recibidaConDiferencia ? "Recibida (con diferencia)" : "Cerrada",
      sublabel: subLabelDe(logRecepcion),
      advertencia: recibidaConDiferencia,
    },
  ];

  let pasoActual;
  if ([ESTADOS_REQUERIMIENTO.RECIBIDA, ESTADOS_REQUERIMIENTO.CERRADA].includes(req.estado)) {
    pasoActual = pasos.length; // todo completo
  } else if ([ESTADOS_REQUERIMIENTO.EN_TRANSITO, ESTADOS_REQUERIMIENTO.PENDIENTE_DE_STOCK].includes(req.estado)) {
    pasoActual = 1;
  } else {
    pasoActual = 0; // Pendiente — transitorio, casi nunca visible
  }
  return { pasos, pasoActual };
}

// Punto de entrada único: elige el camino según tipo. Tanto la ficha de
// detalle como la lista (vía MiniPasos) llaman esta misma función — una
// sola fuente de verdad para "cuántos pasos tiene este requerimiento y en
// cuál está".
export function construirEtapasRequerimiento(req) {
  return req.tipo === TIPOS_REQUERIMIENTO.TRANSFERENCIA ? construirEtapasTransferencia(req) : construirEtapasCompra(req);
}

export { construirEtapasCompra, construirEtapasTransferencia };
