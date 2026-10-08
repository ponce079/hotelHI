// Operaciones de stock en LOTE: una sentencia para todos los artículos, en vez de una por artículo.
// Con la base remota (~0,9 s por consulta) una transacción que hace 2-4 consultas por ítem se pasa de los 15 s con
// 20 ítems; con estas funciones la cantidad de consultas dentro de la transacción no depende de cuántos ítems haya.
// La regla de negocio es la misma: sumar al stock, o descontar solo si alcanza (verificar y descontar en una sola
// sentencia atómica); si algún ítem no alcanza, quien llama descarta toda la transacción.
const { Prisma } = require("@prisma/client");

// filas: [{ articuloDepositoId, cantidad }]. Crea la fila de stock si no existía (con mínimo 0) o suma.
async function incrementarStockEnLote(tx, filas) {
  if (filas.length === 0) return;
  const valores = filas.map((f) => Prisma.sql`(${f.articuloDepositoId}, ${f.cantidad}, 0, NOW(3))`);
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO articulos_depositos_stock (articuloDepositoId, stockActual, stockMinimo, actualizadoEn)
      VALUES ${Prisma.join(valores)}
      ON DUPLICATE KEY UPDATE stockActual = stockActual + VALUES(stockActual), actualizadoEn = NOW(3)`,
  );
}

// Descuenta de todas las filas en UNA sentencia, solo si cada una tiene stock suficiente. Devuelve las filas que
// NO alcanzaron: [] si todo se descontó; si devuelve alguna, no se descontó NADA (la sentencia es todo o nada) y quien
// llama debe cortar la transacción con el mensaje de stock insuficiente. Una sola lectura extra solo en el camino de error.
async function descontarStockEnLote(tx, filas) {
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.articuloDepositoId);
  const casos = (campo) => Prisma.join(filas.map((f) => Prisma.sql`WHEN ${f.articuloDepositoId} THEN ${f[campo]}`), " ");
  const afectadas = await tx.$executeRaw(
    Prisma.sql`UPDATE articulos_depositos_stock
      SET stockActual = stockActual - CASE articuloDepositoId ${casos("cantidad")} END, actualizadoEn = NOW(3)
      WHERE articuloDepositoId IN (${Prisma.join(ids)})
        AND NOT EXISTS (
          SELECT 1 FROM (
            SELECT articuloDepositoId FROM articulos_depositos_stock
            WHERE articuloDepositoId IN (${Prisma.join(ids)})
              AND stockActual < CASE articuloDepositoId ${casos("cantidad")} END
          ) AS faltantes
        )`,
  );
  if (Number(afectadas) === filas.length) return [];
  const actuales = await tx.articuloDepositoStock.findMany({ where: { articuloDepositoId: { in: ids } } });
  const stockPorId = new Map(actuales.map((s) => [s.articuloDepositoId, Number(s.stockActual)]));
  return filas
    .map((f) => ({ ...f, stockActual: stockPorId.get(f.articuloDepositoId) ?? 0 }))
    .filter((f) => f.stockActual < f.cantidad);
}

module.exports = { incrementarStockEnLote, descontarStockEnLote };
