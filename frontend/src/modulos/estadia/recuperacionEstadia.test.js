import { expect, it } from 'vitest';
import { reintentarTitular, reintentarLecturaEstadia } from './recuperacionEstadia';
it('no repite operaciones cuando faltan tablas o columnas: requiere actualizar la base',()=>{
  const error={response:{status:503,data:{codigo:'ESQUEMA_ESTADIA_INCOMPLETO'}}};
  expect(reintentarTitular(0,error)).toBe(false);
  expect(reintentarLecturaEstadia(0,error)).toBe(false);
});
it('reintenta de forma limitada la incorporación idempotente ante cortes y errores del proxy',()=>{
  expect(reintentarTitular(0,new Error('ECONNRESET'))).toBe(true);
  expect(reintentarTitular(1,{response:{status:502}})).toBe(true);
  expect(reintentarTitular(2,new Error('ECONNRESET'))).toBe(false);
});
it('no reintenta conflictos de capacidad, falta de permiso ni saturación explícita del pool',()=>{
  for(const status of [400,401,403,404,409]) expect(reintentarTitular(0,{response:{status}})).toBe(false);
  expect(reintentarTitular(0,{response:{status:503,data:{codigo:'BASE_OCUPADA'}}})).toBe(false);
});
