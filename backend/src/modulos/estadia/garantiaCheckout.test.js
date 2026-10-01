jest.mock('../../lib/prisma',()=>({$transaction:jest.fn()}));
jest.mock('../check-out/checkOut.servicio',()=>({consolidarCargos:jest.fn()}));
const prisma=require('../../lib/prisma');
const {consolidarCargos}=require('../check-out/checkOut.servicio');
const {liquidarGarantia}=require('./estadia.servicio');
let tx;
const datos={pagoId:1,aplicar:8000,devolver:22000,motivo:'Daño confirmado y resto devuelto',operador:'Recepción',cargosValidados:true,totalConfirmado:108000};
beforeEach(()=>{
  tx={$queryRaw:jest.fn(),reserva:{findUnique:jest.fn().mockResolvedValue({id:1,estado:'En curso'})},pagoEstadia:{findFirst:jest.fn().mockResolvedValue({id:1,medios:[{importe:30000}],garantiaAplicada:0,garantiaDevuelta:0}),update:jest.fn()},eventoEstadia:{create:jest.fn()}};
  prisma.$transaction.mockImplementation(fn=>fn(tx));
  consolidarCargos.mockResolvedValue({habitaciones:[{verificada:true}],saldo:108000,totalAdeudado:108000});
});
test('aplica el daño y devuelve el resto solo con verificación y cargos confirmados',async()=>{
  await liquidarGarantia(1,datos);
  expect(tx.pagoEstadia.update).toHaveBeenCalledWith({where:{id:1},data:{garantiaDevuelta:{increment:22000},garantiaAplicada:{increment:8000}}});
});
test('impide liquidar si falta verificar alguna habitación',async()=>{
  consolidarCargos.mockResolvedValue({habitaciones:[{verificada:true},{verificada:false}],saldo:108000,totalAdeudado:108000});
  await expect(liquidarGarantia(1,datos)).rejects.toThrow(/Verificá todas/);
  expect(tx.pagoEstadia.update).not.toHaveBeenCalled();
});
test.each([{cargosValidados:false},{totalConfirmado:100000}])('rechaza confirmación ausente o total desactualizado %j',async cambio=>{
  await expect(liquidarGarantia(1,{...datos,...cambio})).rejects.toThrow(/Confirmá los cargos actuales/);
  expect(tx.pagoEstadia.update).not.toHaveBeenCalled();
});
test('impide aplicar más que el saldo o devolver más que lo recibido',async()=>{
  consolidarCargos.mockResolvedValue({habitaciones:[{verificada:true}],saldo:1000,totalAdeudado:108000});
  await expect(liquidarGarantia(1,datos)).rejects.toThrow(/supera el saldo/);
  await expect(liquidarGarantia(1,{...datos,devolver:30000})).rejects.toThrow(/superiores/);
  expect(tx.pagoEstadia.update).not.toHaveBeenCalled();
});
