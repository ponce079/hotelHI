// src/lib/numeracion.js
//
// Numeracion correlativa tipo "OP-00001" para modelos cuyo campo unico
// `numero` es NOT NULL, asi que no se puede dejar en blanco como hace
// Articulo con `codigo` (que es nullable — ver crearArticulo en
// articulos.servicio.js). Se inserta con un placeholder aleatorio que
// nunca choca contra otra fila, y se reemplaza por el numero definitivo
// una vez que existe el id — las dos operaciones dentro de la misma
// transaccion, para que nunca quede una fila con el placeholder puesto.
//
// Usar este helper en vez de reinventar el placeholder en cada modulo
// nuevo — Ordenes de Compra (numero) va a necesitar exactamente lo mismo.

const crypto = require("crypto");

async function crearConNumeroSecuencial(tx, modelo, { prefijo, pad = 5, data, include }) {
  const creado = await tx[modelo].create({
    data: { ...data, numero: `${prefijo}-PENDIENTE-${crypto.randomUUID()}` },
  });
  return tx[modelo].update({
    where: { id: creado.id },
    data: { numero: `${prefijo}-${String(creado.id).padStart(pad, "0")}` },
    include,
  });
}

module.exports = { crearConNumeroSecuencial };
