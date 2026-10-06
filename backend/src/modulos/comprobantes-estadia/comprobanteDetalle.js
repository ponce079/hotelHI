const { redondear } = require('../../lib/comprobantes');

// Observación 3 (Sprint 3): el comprobante del check-out tiene que mostrar de
// qué está hecho su total, no solo la cifra. Esto convierte la cuenta que
// arma consolidarCargos (la única fuente de verdad de lo adeudado) en líneas
// de comprobante: alojamiento por habitación, cargos adicionales
// (servicios/consumos) y cargos de la verificación de la habitación.
//
// Función pura: no toca la base. La suma de las líneas coincide con
// cuenta.totalAdeudado (se verifica con `coincide`).

const TIPOS_VERIFICACION = {
  Daño: 'Daño en la habitación',
  Faltante: 'Faltante en la habitación',
  ConsumoNoRegistrado: 'Consumo no registrado',
};

function armarDetalleCuenta(cuenta) {
  const habitacionPorId = new Map((cuenta.habitaciones ?? []).map((h) => [h.habitacionId, h.numero]));
  const numeroDe = (id) => (habitacionPorId.has(id) ? habitacionPorId.get(id) : null);

  const alojamiento = (cuenta.habitaciones ?? []).map((h) => ({
    categoria: 'Alojamiento',
    concepto: `Habitación ${h.numero}${h.tipo ? ` (${h.tipo})` : ''}`,
    cantidad: h.noches,
    unidad: h.noches === 1 ? 'noche' : 'noches',
    precioUnitario: h.promedioPorNoche,
    importe: h.subtotal,
  }));

  const adicionales = (cuenta.consumos ?? []).map((c) => ({
    categoria: 'Cargos adicionales',
    concepto: c.tipoServicio,
    habitacion: numeroDe(c.habitacionId),
    fecha: c.fechaHora,
    cantidad: c.cantidad,
    importe: c.monto,
  }));

  const verificacion = (cuenta.verificaciones ?? [])
    // "Sin novedades" es un registro de control con monto 0: no es una línea.
    .filter((v) => v.monto !== 0)
    .map((v) => ({
      categoria: 'Verificación de la habitación',
      concepto: TIPOS_VERIFICACION[v.tipo] ?? v.tipo,
      descripcion: v.descripcion,
      habitacion: numeroDe(v.habitacionId),
      fecha: v.fechaHora,
      importe: v.monto,
    }));

  const lineas = [...alojamiento, ...adicionales, ...verificacion];
  const total = redondear(lineas.reduce((acc, l) => acc + l.importe, 0));

  return {
    lineas,
    subtotales: {
      alojamiento: redondear(alojamiento.reduce((a, l) => a + l.importe, 0)),
      cargosAdicionales: redondear(adicionales.reduce((a, l) => a + l.importe, 0)),
      verificacion: redondear(verificacion.reduce((a, l) => a + l.importe, 0)),
    },
    total,
    // Falso si la cuenta tuvo algún concepto que no entró en las líneas.
    coincide: Math.round(total * 100) === Math.round(cuenta.totalAdeudado * 100),
  };
}

module.exports = { armarDetalleCuenta };
