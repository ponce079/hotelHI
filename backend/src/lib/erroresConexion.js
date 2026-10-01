// Solo identifica falta de conexión disponible; no confunde una transacción
// expirada durante una escritura con una que no llegó a comenzar.
function esEsperaConexion(error) {
  if (error?.code === 'P2028') return /Unable to start a transaction in the given time/i.test(error.message || '');
  if (error?.code !== 'P2039') return false;
  const adapter = error.meta?.driverAdapterError;
  return [error.message, adapter?.message, adapter?.cause?.message, adapter?.cause?.originalMessage]
    .some(mensaje => /pool timeout: failed to retrieve a connection from pool/i.test(mensaje || ''));
}

function responderEsperaConexion(res, error) {
  if (!esEsperaConexion(error)) return false;
  res.set('Retry-After', '3');
  res.status(503).json({ codigo: 'BASE_OCUPADA', error: 'La base de datos está ocupada y no hubo una conexión disponible a tiempo. Esperá unos segundos antes de volver a intentar.' });
  return true;
}
module.exports = { esEsperaConexion, responderEsperaConexion };
