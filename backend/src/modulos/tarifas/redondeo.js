// Redondeo al múltiplo de $100 más cercano — compartido por la
// actualización masiva (HU-93) y el motor de cotización (Etapa 3, HU-94).
// Extraído de lotesActualizacion.servicio.js, que era su único consumidor
// hasta esta etapa.
//
// Opera con Prisma.Decimal (no con Number/float): dividir por 100 y volver
// a multiplicar en punto flotante puede desalinear un valor que cae EXACTO
// en el límite entre dos múltiplos de $100 (ej. algo que en teoría es
// ...850,00 puede llegar como ...849,9999999998 por arrastre de coma
// flotante de las multiplicaciones previas del motor de cotización), lo que
// cambiaría el redondeo esperado. Decimal.js no tiene ese problema porque
// no usa punto flotante binario.
const { Prisma } = require("@prisma/client");
const { Decimal } = Prisma;

function redondearAMultiploDe100(valor) {
  const decimal = valor instanceof Decimal ? valor : new Decimal(valor);
  return decimal.dividedBy(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(100);
}

module.exports = { redondearAMultiploDe100 };
