jest.mock('../../lib/prisma',()=>({}));
jest.mock('../check-out/checkOut.servicio',()=>({consolidarCargos:jest.fn(),ErrorDeNegocio:class extends Error {}}));
const checkout=require('../check-out/checkOut.servicio');
const pagos=require('./pagoEstadia.servicio');
const reserva={id:42,estado:'Confirmada',fechaDesde:new Date('2026-10-01'),fechaHasta:new Date('2026-10-03'),reservaHabitaciones:[{adultos:1,menores:0,reservaNoches:[{fecha:new Date('2026-10-01'),precioNoche:90000},{fecha:new Date('2026-10-02'),precioNoche:110000}],habitacion:{id:1,numero:'101',tipoHabitacion:{nombre:'Doble'}}}]};
let tx;
beforeEach(()=>{jest.clearAllMocks();tx={pagoEstadia:{create:jest.fn().mockImplementation(async x=>x.data)}};});
test.each(['Efectivo','Transferencia'])('seña con %s usa las noches congeladas sin consultar toda la cuenta',async tipo=>{
  const pago=await pagos.crearSeniaReservaNuevaEnTransaccion(tx,reserva,[{tipo,importe:40000}]);
  expect(pago).toMatchObject({reservaId:42,estado:'Parcial',concepto:'Seña',medios:{create:[{medioPago:tipo,importe:40000}]}});
  expect(checkout.consolidarCargos).not.toHaveBeenCalled();
});
test('rechaza un importe que supera alojamiento pactado y no escribe',async()=>{
  await expect(pagos.crearSeniaReservaNuevaEnTransaccion(tx,reserva,[{tipo:'Efectivo',importe:200001}])).rejects.toThrow(/supera el saldo/);
  expect(tx.pagoEstadia.create).not.toHaveBeenCalled();
});
test('mantiene la validación de autorización de tarjeta',async()=>{
  await expect(pagos.crearSeniaReservaNuevaEnTransaccion(tx,reserva,[{tipo:'Tarjeta crédito',importe:10000}])).rejects.toThrow(/autorización/);
  expect(tx.pagoEstadia.create).not.toHaveBeenCalled();
});
test('los pagos de reservas existentes siguen consultando el saldo actual',async()=>{
  checkout.consolidarCargos.mockResolvedValue({saldo:5000,estadoReserva:'En curso'});
  await expect(pagos.crearPagoEnTransaccion(tx,{reservaId:42,medios:[{tipo:'Efectivo',importe:6000}]})).rejects.toThrow(/supera el saldo/);
  expect(checkout.consolidarCargos).toHaveBeenCalledWith(42,tx);
  expect(tx.pagoEstadia.create).not.toHaveBeenCalled();
});
