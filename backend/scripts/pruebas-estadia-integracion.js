// Solo base aislada local. Nunca usa backend/.env ni modifica la base compartida.
const assert=require('node:assert/strict');
process.env.DATABASE_URL='mysql://root:HotelHiTestOnly@127.0.0.1:3308/hotelhi_estadia_test_v2';
process.env.DATABASE_SSL='false';
const p=require('../src/lib/prisma');
const s=require('../src/modulos/estadia/estadia.servicio');
const cargos=require('../src/modulos/servicios-adicionales/serviciosAdicionales.servicio');
const checkin=require('../src/modulos/check-in/checkIn.servicio');
const checkout=require('../src/modulos/check-out/checkOut.servicio');
const pagos=require('../src/modulos/pagos-estadia/pagoEstadia.servicio');
async function main(){
  const marca=Date.now().toString();
  const hoy=new Date(new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'})+'T00:00:00Z');const hasta=new Date(hoy.getTime()+86400000*2);
  const h1=await p.habitacion.create({data:{numero:'T'+marca+'A',tipo:'Doble',capacidad:2,piso:1,tarifaPorNoche:100000}});
  const h2=await p.habitacion.create({data:{numero:'T'+marca+'B',tipo:'Simple',capacidad:1,piso:1,tarifaPorNoche:80000}});
  const titular=await p.huesped.create({data:{nombre:'Titular Prueba',tipoDocumento:'DNI',numeroDocumento:marca}});
  const r=await p.reserva.create({data:{huespedId:titular.id,fechaDesde:hoy,fechaHasta:hasta,codigoConfirmacion:'T'+marca,reservaHabitaciones:{create:[{habitacionId:h1.id,tarifaPactada:100000},{habitacionId:h2.id,tarifaPactada:80000}]}}});
  const dato={nombre:'Adulto',apellido:'Prueba',tipoDocumento:'DNI',numeroDocumento:'A'+marca,paisDocumento:'AR',fechaNacimiento:'1990-01-01',nacionalidad:'AR',paisResidencia:'AR',habitacionId:h1.id,operador:'Prueba'};
  const a=await s.guardar(r.id,null,dato);
  await assert.rejects(()=>s.guardar(r.id,null,dato),/ya está registrada/);
  const menor=await s.guardar(r.id,null,{...dato,nombre:'Menor',numeroDocumento:'B'+marca,fechaNacimiento:'2015-01-01',responsableId:a.id});
  await assert.rejects(()=>s.guardar(r.id,null,{...dato,numeroDocumento:'C'+marca}),/capacidad/);
  const b=await s.guardar(r.id,null,{...dato,numeroDocumento:'C'+marca,habitacionId:h2.id});
  const params={reservaId:r.id,numeroDocumentoIngresado:marca,garantiaConfirmada:true,medioGarantia:'Efectivo',cantidadesOcupantes:[{habitacionId:h1.id,cantidad:2},{habitacionId:h2.id,cantidad:1}],operador:'Prueba'};
  await assert.rejects(()=>checkin.confirmarCheckInConReserva({...params,cantidadesOcupantes:undefined}),/Declará/);
  await assert.rejects(()=>checkin.confirmarCheckInConReserva({...params,cantidadesOcupantes:[{habitacionId:h1.id,cantidad:1},{habitacionId:h2.id,cantidad:1}]}),/declaraste/);
  await assert.rejects(()=>checkin.confirmarCheckInConReserva(params),/Verificá/);
  assert.equal((await p.reserva.findUnique({where:{id:r.id}})).estado,'Confirmada');
  for(const persona of [a,menor,b])await s.accion(r.id,persona.id,{accion:'verificar',operador:'Prueba'});
  await checkin.confirmarCheckInConReserva(params);
  assert.equal((await s.listar(r.id)).filter(x=>x.estado==='Alojado').length,3);
  await assert.rejects(()=>s.accion(r.id,a.id,{accion:'retirar',operador:'Prueba'}),/menores/);
  await p.habitacion.update({where:{id:h1.id},data:{tarifaPorNoche:900000}});
  let cuenta=await checkout.consolidarCargos(r.id);
  assert.equal(cuenta.totalAdeudado,360000);assert.equal(cuenta.totalPagado,0);assert.equal(cuenta.garantias[0].pendiente,30000);
  const payload={reservaId:r.id,habitacionId:h1.id,tipoServicio:'Lavandería',descripcion:'Dos prendas',cantidad:2,precioUnitario:5000,registradoPor:'Prueba',claveOperacion:'test-'+marca};
  const cargo=await cargos.registrarConsumo(payload);const repetido=await cargos.registrarConsumo(payload);assert.equal(cargo.id,repetido.id);
  const incl=await cargos.registrarConsumo({...payload,claveOperacion:'incl-'+marca,incluido:true});assert.equal(incl.monto,0);
  cuenta=await checkout.consolidarCargos(r.id);assert.equal(cuenta.totalAdeudado,370000);assert.equal(cuenta.habitaciones.find(h=>h.habitacionId===h1.id).adicionales,10000);
  await cargos.anularConsumo(cargo.id,{motivo:'Duplicación de prueba',operador:'Prueba'});
  assert.equal((await checkout.consolidarCargos(r.id)).totalAdeudado,360000);
  await assert.rejects(()=>checkout.registrarVerificacion(r.id,{tipo:'SinNovedades',registradoPor:'Prueba'}),/Seleccioná/);
  await checkout.registrarVerificacion(r.id,{habitacionId:h1.id,tipo:'SinNovedades',registradoPor:'Prueba'});
  await assert.rejects(()=>checkout.confirmarCheckOut(r.id,{cargosValidados:true}),/verificar/);
  await checkout.registrarVerificacion(r.id,{habitacionId:h2.id,tipo:'SinNovedades',registradoPor:'Prueba'});
  await assert.rejects(()=>checkout.confirmarCheckOut(r.id,{cargosValidados:true}),/garantía/);
  await s.liquidarGarantia(r.id,{pagoId:cuenta.garantias[0].id,devolver:30000,aplicar:0,operador:'Prueba',motivo:'Sin daños'});
  await pagos.crearPago({reservaId:r.id,medios:[{tipo:'Efectivo',importe:360000}]});
  await checkout.confirmarCheckOut(r.id,{cargosValidados:true});
  assert.equal((await s.listar(r.id)).filter(x=>x.estado==='Retirado').length,3);
  assert.equal((await p.habitacion.findUnique({where:{id:h1.id}})).estado,'en limpieza');
  await assert.rejects(()=>cargos.registrarConsumo({...payload,claveOperacion:'closed-'+marca}),/en curso/i);
  // El ingreso sin reserva debe revertir toda el alta si faltan personas.
  const hw=await p.habitacion.create({data:{numero:'W'+marca,tipo:'Doble',capacidad:2,piso:1,tarifaPorNoche:100000}});
  const walk={fechaHasta:hasta.toISOString().slice(0,10),habitacionIds:[hw.id],huesped:{nombre:'Persona Prueba',tipoDocumento:'DNI',numeroDocumento:marca.slice(-8),contacto:'prueba@example.com'},garantiaConfirmada:true,medioGarantia:'Efectivo',operador:'Prueba',cantidadesOcupantes:[{habitacionId:hw.id,cantidad:2}],personas:[{...dato,id:1,habitacionId:hw.id,numeroDocumento:'W'+marca}]};
  const antes=await p.reserva.count();
  await assert.rejects(()=>checkin.registrarCheckInWalkIn(walk),/declaraste/);
  assert.equal(await p.reserva.count(),antes);
  assert.equal((await p.habitacion.findUnique({where:{id:hw.id}})).estado,'libre');
  walk.personas.push({...dato,id:2,habitacionId:hw.id,numeroDocumento:'M'+marca,fechaNacimiento:'2015-01-01',responsableId:1});
  const rw=await checkin.registrarCheckInWalkIn(walk);
  assert.equal((await s.listar(rw.id)).filter(x=>x.estado==='Alojado').length,2);
  const condiciones=require('../src/modulos/estadia/condiciones.servicio');
  await condiciones.guardar(rw.id,hw.id,{ocupacionIncluida:1,precioPersonaExtra:1000,serviciosIncluidos:'Desayuno',operador:'Prueba'});
  const propuesta=await condiciones.preview(rw.id);
  assert.equal(propuesta.total,2000);
  await condiciones.aplicar(rw.id,{items:propuesta.items,operador:'Prueba'});
  assert.equal((await condiciones.preview(rw.id)).items.length,0);
  // Una garantía anterior sin marca no cambia retroactivamente de cuenta.
  await p.pagoEstadia.create({data:{reservaId:rw.id,concepto:'Garantía',garantiaSeparada:false,medios:{create:{medioPago:'Efectivo',importe:5000}}}});
  const cuentaWalk=await checkout.consolidarCargos(rw.id);
  assert.equal(cuentaWalk.totalPagado,5000);
  assert.equal(cuentaWalk.garantias.length,1);
  assert.equal(cuentaWalk.garantias[0].recibida,30000);
  // Prueba HTTP de los routers: resumen y panel usan los contratos reales.
  const express=require('express');const app=express();app.use(express.json());
  app.use('/api/estadia',require('../src/modulos/estadia/estadia.routes'));
  app.use('/api/consumos-servicios',require('../src/modulos/servicios-adicionales/serviciosAdicionales.routes'));
  app.use('/api/check-in',require('../src/modulos/check-in/checkIn.routes'));
  const server=await new Promise(resolve=>{const server=app.listen(0,'127.0.0.1',()=>resolve(server));});
  try {
    const url='http://127.0.0.1:'+server.address().port;
    for(const ruta of ['/api/estadia/'+rw.id+'/ocupantes','/api/estadia/'+rw.id+'/historial','/api/consumos-servicios/hotel/resumen'])assert.equal((await fetch(url+ruta)).status,200);
    const conflict=await fetch(url+'/api/check-in/walk-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(walk)});
    assert.equal(conflict.status,409);
    const hhttp=await p.habitacion.create({data:{numero:'HTTP'+marca,tipo:'Doble',capacidad:2,piso:1,tarifaPorNoche:100000}});
    const res=await fetch(url+'/api/check-in/walk-in',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...walk,habitacionIds:[hhttp.id],cantidadesOcupantes:[{habitacionId:hhttp.id,cantidad:2}],personas:[]})});
    assert.equal(res.status,400);
  } finally {await new Promise(resolve=>server.close(resolve));}
  console.log('OK: walk-in completo, rollback, menores, condiciones, garantías históricas y rutas HTTP.');
  console.log('OK: ocupantes, duplicados, capacidad, menores, rollback de check-in, ingreso, tarifa pactada, garantía, cargos por habitación, idempotencia, incluidos, anulación, revisión por habitación, pagos y check-out.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>p.$disconnect());

