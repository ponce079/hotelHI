import { hoyEnHoraLocal } from '../../lib/fechas';

export function resumenOcupantes(habitaciones, personas, cantidades, walkIn = false) {
  const hoy = hoyEnHoraLocal();
  return habitaciones.map(h => {
    const presentes = personas.filter(p =>
      (walkIn || p.estado === 'Previsto') &&
      String(p.fechaDesde).slice(0, 10) <= hoy && String(p.fechaHasta).slice(0, 10) > hoy &&
      (walkIn ? Number(p.habitacionId) === h.id : p.asignaciones?.some(a => a.habitacionId === h.id && !a.hasta))
    );
    const cantidad = Number(cantidades[h.id]);
    const verificadas = presentes.filter(p => walkIn || p.verificadoEn).length;
    return { ...h, registradas: presentes.length, verificadas,
      completo: Number.isSafeInteger(cantidad) && cantidad > 0 && cantidad <= h.capacidad && presentes.length === cantidad && verificadas === cantidad };
  });
}

export const cantidadesParaEnviar = (habitaciones, cantidades) => habitaciones.map(h => ({ habitacionId: h.id, cantidad: Number(cantidades[h.id]) }));
