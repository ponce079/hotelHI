jest.mock('../../lib/prisma',()=>({$transaction:jest.fn()}));
const prisma=require('../../lib/prisma');
const {registrarConsumo}=require('./serviciosAdicionales.servicio');
const payload={reservaId:1,habitacionId:1,tipoServicio:'Lavandería',registradoPor:'Prueba',cantidad:1,precioUnitario:100};
let tx;
beforeEach(()=>{
  tx={$queryRaw:jest.fn(),reserva:{findUnique:jest.fn().mockResolvedValue({estado:'En curso',fechaDesde:new Date('2026-09-30'),fechaHasta:new Date('2026-10-02'),reservaHabitaciones:[{habitacionId:1}]})},consumoServicioAdicional:{create:jest.fn().mockImplementation(async({data})=>({id:1,...data}))},eventoEstadia:{create:jest.fn()}};
  prisma.$transaction.mockImplementation(fn=>fn(tx));
});
test.each(['2026-09-30T02:59:59Z','2026-10-03T03:00:00Z'])('rechaza fuera de estadía sin guardar: %s',async fechaServicio=>{
  await expect(registrarConsumo({...payload,fechaServicio})).rejects.toThrow(/dentro de la estadía/);
  expect(tx.consumoServicioAdicional.create).not.toHaveBeenCalled();
  expect(tx.eventoEstadia.create).not.toHaveBeenCalled();
});
test.each(['2026-09-30T03:00:00Z','2026-10-01T02:59:59Z','2026-10-03T02:59:59Z'])('admite día de ingreso, noche y día de salida: %s',async fechaServicio=>{
  await expect(registrarConsumo({...payload,fechaServicio})).resolves.toMatchObject({id:1});
});
test('rechaza reserva cerrada aunque la fecha pertenezca a la estadía',async()=>{
  tx.reserva.findUnique.mockResolvedValue({estado:'Cerrada'});
  await expect(registrarConsumo({...payload,fechaServicio:'2026-10-01T12:00:00Z'})).rejects.toMatchObject({statusCode:409,message:expect.stringContaining('reserva cerrada')});
  expect(tx.consumoServicioAdicional.create).not.toHaveBeenCalled();
});
