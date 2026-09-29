import { expect, it } from 'vitest';
import { resumenOcupantes, cantidadesParaEnviar } from './validacionOcupantesIngreso';
const habitaciones = [{id:1,numero:'101',capacidad:2}];
const persona = {habitacionId:'1',estado:'Previsto',fechaDesde:'2020-01-01',fechaHasta:'2099-01-01',asignaciones:[{habitacionId:1,hasta:null}],verificadoEn:'2026-01-01'};
it('requiere declaración explícita y todos los registros en ingreso sin reserva', () => {
  expect(resumenOcupantes(habitaciones,[persona],{},true)[0].completo).toBe(false);
  expect(resumenOcupantes(habitaciones,[persona],{1:'2'},true)[0].completo).toBe(false);
  expect(resumenOcupantes(habitaciones,[persona,persona],{1:'2'},true)[0].completo).toBe(true);
  expect(cantidadesParaEnviar(habitaciones,{1:'2'})).toEqual([{habitacionId:1,cantidad:2}]);
});
it('excluye cancelados, fechas futuras y personas sin verificar del ingreso completo', () => {
  for (const cambio of [{estado:'Cancelado'},{fechaDesde:'2099-01-01'},{verificadoEn:null},{asignaciones:[{habitacionId:2,hasta:null}]}]) {
    expect(resumenOcupantes(habitaciones,[{...persona,...cambio}],{1:'1'})[0].completo).toBe(false);
  }
  expect(resumenOcupantes(habitaciones,[persona],{1:'1'})[0].completo).toBe(true);
});
