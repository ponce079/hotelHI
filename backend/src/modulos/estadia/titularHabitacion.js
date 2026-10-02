// Un solo titular activo por habitación. Lo usan todos los caminos que escriben fichas: alta y
// edición desde "Personas de la estadía" (estadia.servicio.js: guardar), la carga en lote del
// check-in (cargaMasiva.js) y el titular automático de la reserva (titular.servicio.js).
// Las fichas Canceladas o Retiradas no cuentan como titulares.
const ACTIVOS = ["Previsto", "Alojado"];
const CODIGO_TITULAR_EXISTENTE = "TITULAR_EXISTENTE";

// Titular activo (Previsto/Alojado con asignación vigente en la habitación), sin `excluirId`.
async function titularActivo(tx, reservaId, habitacionId, excluirId = null) {
  return tx.ocupanteReserva.findFirst({
    where: {
      reservaId,
      esTitular: true,
      estado: { in: ACTIVOS },
      asignaciones: { some: { habitacionId, hasta: null } },
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    select: { id: true, nombre: true, apellido: true },
  });
}

// Mismo criterio sobre fichas ya leídas (con `habitacionId` vigente y `estado`), sin consultas.
function titularActivoEn(fichas, habitacionId, excluirId = null) {
  return (
    fichas.find(
      (f) => f.esTitular && ACTIVOS.includes(f.estado ?? "Previsto") && f.habitacionId === habitacionId && f.id !== excluirId,
    ) ?? null
  );
}

function errorTitularExistente(ErrorDeNegocio, numero, titular, textoExtra) {
  const nombre = `${titular.nombre ?? ""} ${titular.apellido ?? ""}`.trim();
  const error = new ErrorDeNegocio(
    `La habitación ${numero} ya tiene titular${nombre ? ` (${nombre})` : ""}. ${textoExtra}`,
    409,
  );
  error.codigo = CODIGO_TITULAR_EXISTENTE;
  error.detalle = { titularId: titular.id };
  return error;
}

module.exports = { titularActivo, titularActivoEn, errorTitularExistente, CODIGO_TITULAR_EXISTENTE, ACTIVOS };
