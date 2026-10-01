import {expect,test} from 'vitest';
import {validarFechaConsumo} from './validarFechaConsumo';
const reserva={estado:'En curso',fechaDesde:'2026-09-30',fechaHasta:'2026-10-02'};
test('rechaza fecha fuera del intervalo argentino',()=>{
  expect(validarFechaConsumo(reserva,'2026-09-30T02:59:59Z')).toMatch(/dentro de la estadía/);
  expect(validarFechaConsumo(reserva,'2026-10-03T03:00:00Z')).toMatch(/dentro de la estadía/);
});
test('admite horario nocturno y fecha de salida mientras esté en curso',()=>{
  expect(validarFechaConsumo(reserva,'2026-10-01T02:30:00Z')).toBe('');
  expect(validarFechaConsumo(reserva,'2026-10-02T12:00:00Z')).toBe('');
});
test('rechaza reserva cerrada',()=>{
  expect(validarFechaConsumo({...reserva,estado:'Cerrada'},'2026-10-01T12:00:00Z')).toMatch(/reserva cerrada/);
});
