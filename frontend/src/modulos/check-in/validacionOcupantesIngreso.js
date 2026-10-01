import { hoyEnHoraLocal } from '../../lib/fechas';

export function resumenOcupantes(habitaciones, personas, walkIn = false) {
  const hoy = hoyEnHoraLocal();
  return habitaciones.map(h => {
    const presentes = personas.filter(p =>
      (walkIn || p.estado === 'Previsto') &&
      String(p.fechaDesde).slice(0, 10) <= hoy && String(p.fechaHasta).slice(0, 10) > hoy &&
      (walkIn ? Number(p.habitacionId) === h.id : p.asignaciones?.some(a => a.habitacionId === h.id && !a.hasta))
    );
    const cantidad = Number(h.adultos) + Number(h.menores);
    const menoresRegistrados = presentes.filter(p => {
      if (!p.fechaNacimiento) return false;
      const nacimiento = String(p.fechaNacimiento).slice(0,10);
      const cumple18 = `${Number(nacimiento.slice(0,4))+18}${nacimiento.slice(4)}`;
      return cumple18 > String(p.fechaDesde).slice(0,10);
    }).length;
    const edadesCoinciden = presentes.every(p=>p.fechaNacimiento) && menoresRegistrados === Number(h.menores);
    const verificadas = presentes.filter(p => walkIn || p.verificadoEn).length;
    return { ...h, esperadas:cantidad, registradas: presentes.length, verificadas, edadesCoinciden,
      titulares: presentes.filter(p => p.esTitular).length,
      ampliable: presentes.length > cantidad && presentes.length <= h.capacidad && presentes.every(p => p.fechaNacimiento),
      completo: Number.isSafeInteger(cantidad) && cantidad > 0 && cantidad <= h.capacidad && presentes.length === cantidad && verificadas === cantidad && edadesCoinciden && presentes.filter(p => p.esTitular).length === 1 };
  });
}
