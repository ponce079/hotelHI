import { describe, expect, it } from 'vitest';
import { bloqueosCheckIn } from './bloqueosCheckIn';
const listo = {
  resultado: { reserva: { id: 5 }, puedeIniciarCheckIn: true }, titularPreparado: true,
  ocupantes: { isSuccess: true, isFetching: false },
  resumen: [{ id: 1, numero: '301', capacidad: 3, esperadas:3, edadesCoinciden:true, registradas: 3, verificadas: 3 }],
  form: { documento: '30111222', garantiaConfirmada: true },
};
describe('motivos que impiden confirmar check-in',()=>{
  it('habilita titular y dos acompañantes cuando las tres personas están verificadas',()=>{
    expect(bloqueosCheckIn(listo)).toEqual([]);
  });
  it('explica que guardar datos no verifica al ocupante',()=>{
    expect(bloqueosCheckIn({...listo,resumen:[{...listo.resumen[0],verificadas:2}]})).toEqual([expect.stringContaining('1 persona(s) pendiente(s) de verificar')]);
  });
  it('expone todos los campos pendientes a la vez',()=>{
    const motivos=bloqueosCheckIn({...listo,form:{documento:'',garantiaConfirmada:false}});
    expect(motivos).toHaveLength(2);
    expect(motivos.join(' ')).toMatch(/documento presentado/);
    expect(motivos.join(' ')).toMatch(/garantía/);
  });
  it('explica incorporación pendiente, errores de carga y diferencias de cantidad sin eludirlos',()=>{
    expect(bloqueosCheckIn({...listo,titularPreparado:false})[0]).toMatch(/incorporación del titular/);
    expect(bloqueosCheckIn({...listo,ocupantes:{isError:true}})[0]).toMatch(/Volver a cargar/);
    expect(bloqueosCheckIn({...listo,resumen:[{...listo.resumen[0],registradas:2,verificadas:2} ]})[0]).toMatch(/3 personas reservadas y 2 registradas/);
  });
});
