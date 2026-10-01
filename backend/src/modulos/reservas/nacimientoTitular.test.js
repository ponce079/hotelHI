jest.mock('../../lib/prisma',()=>({}));
const {normalizarAltaReserva,hoyComoFechaUTC}=require('./reservas.servicio');
const hoy=hoyComoFechaUTC();
const iso=d=>d.toISOString().slice(0,10);
const datos={fechaDesde:iso(hoy),fechaHasta:iso(new Date(hoy.getTime()+86400000)),habitaciones:[{habitacionId:1,adultos:1,menores:0}],planTarifarioId:1,totalEsperado:100,huesped: { paisDocumento:"AR", nombre:'Prueba',tipoDocumento:'DNI',numeroDocumento:'30111222',contacto:'prueba@example.test',fechaNacimiento:'1990-01-01'}};
test('exige nacimiento y documento antes de crear reserva',()=>{
  expect(()=>normalizarAltaReserva({...datos,huesped:{...datos.huesped,fechaNacimiento:''}})).toThrow(/nacimiento/);
  expect(()=>normalizarAltaReserva({...datos,huesped:{...datos.huesped,numeroDocumento:''}})).toThrow(/documento/);
});
test('rechaza titular menor o nacimiento imposible y conserva la fecha normalizada',()=>{
  expect(()=>normalizarAltaReserva({...datos,huesped:{...datos.huesped,fechaNacimiento:'2015-01-01'}})).toThrow(/18 años/);
  expect(()=>normalizarAltaReserva({...datos,huesped:{...datos.huesped,fechaNacimiento:'1990-02-30'}})).toThrow();
  expect(normalizarAltaReserva(datos).huesped.fechaNacimiento).toEqual(new Date('1990-01-01'));
});
