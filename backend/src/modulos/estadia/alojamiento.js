const { Prisma } = require("@prisma/client");
const s = require("./estadia.servicio");

const IDENTIDAD_DUPLICADA = /duplicate entry|\b1062\b|P2002/i;

// Pasa a "Alojado" a todas las personas que ingresan con UNA sola sentencia,
// sin importar cuántas sean. identidadActiva solo existe mientras la persona está
// alojada (se libera al salir) y su índice único impide que la misma persona figure
// alojada dos veces a la vez: si otra estadía ya la tiene, la base rechaza la sentencia
// completa y el ingreso se revierte.
async function marcarAlojados(tx, personas, ingresoReal) {
  if (!personas.length) return;
  const cuando = personas.map((p) => Prisma.sql`WHEN ${p.id} THEN ${s.identidad(p)}`);
  const ids = personas.map((p) => p.id);
  try {
    await tx.$executeRaw(
      Prisma.sql`UPDATE ocupantes_reserva SET estado = 'Alojado', ingresoReal = ${ingresoReal},
        identidadActiva = CASE id ${Prisma.join(cuando, " ")} END WHERE id IN (${Prisma.join(ids)})`,
    );
  } catch (error) {
    const detalle = `${error.code} ${error.message} ${JSON.stringify(error.meta || {})}`;
    if (!IDENTIDAD_DUPLICADA.test(detalle)) throw error;
    throw new s.ErrorDeNegocio(
      "Una de las personas ya figura alojada en otra estadía: no puede ingresar dos veces a la vez.",
      409,
    );
  }
}

module.exports = { marcarAlojados };
