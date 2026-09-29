const prisma=require('../../lib/prisma');
const s=require('./estadia.servicio');
function identificador(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<=0)throw new s.ErrorDeNegocio('Identificador inválido.');return n;}
function habitacionDeLaNoche(persona,dia){
  if(persona.estado==='Cancelado'||persona.fechaDesde.toISOString().slice(0,10)>dia||persona.fechaHasta.toISOString().slice(0,10)<=dia)return null;
  const local=d=>new Date(d).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  if(persona.salidaReal&&local(persona.salidaReal)<=dia)return null;
  const historial=[...persona.asignaciones].sort((a,b)=>new Date(a.desde)-new Date(b.desde));
  const elegibles=historial.filter((a,i)=>(i===0?persona.fechaDesde.toISOString().slice(0,10):local(a.desde))<=dia);
  return elegibles.at(-1)?.habitacionId??null;
}
async function obtener(reservaId){return prisma.reservaHabitacion.findMany({where:{reservaId:identificador(reservaId)},include:{habitacion:true},orderBy:{id:'asc'}});}
async function guardar(reservaId,habitacionId,data){reservaId=identificador(reservaId);habitacionId=identificador(habitacionId);return prisma.$transaction(async tx=>{
  const r=await s.bloquear(tx,reservaId);const h=r.reservaHabitaciones.find(h=>h.habitacionId===habitacionId);if(!h)throw new s.ErrorDeNegocio('Habitación ajena a la reserva.');
  const incl=Number(data.ocupacionIncluida),precio=Number(data.precioPersonaExtra);if(!Number.isInteger(incl)||incl<1||incl>h.habitacion.capacidad||!Number.isFinite(precio)||precio<0||precio>99999999)throw new s.ErrorDeNegocio('Ocupación incluida o precio adicional inválidos.');
  const servicios=String(data.serviciosIncluidos||'').trim();if(servicios.length>2000)throw new s.ErrorDeNegocio('La descripción de servicios incluidos es demasiado extensa.');
  await tx.reservaHabitacion.update({where:{id:h.id},data:{ocupacionIncluida:incl,precioPersonaExtra:precio,serviciosIncluidos:servicios}});
  await s.evento(tx,reservaId,'Condiciones de habitación',{habitacionId,ocupacionIncluida:incl,precioPersonaExtra:precio,serviciosIncluidos:servicios},data.operador);
  return {ok:true};
},{timeout:15000});}
async function calcular(tx,reservaId){
  const r=await tx.reserva.findUnique({where:{id:reservaId},include:{reservaHabitaciones:{include:{habitacion:true}},ocupantes:{where:{estado:{not:'Cancelado'}},include:{asignaciones:true}}}});if(!r)throw new s.ErrorDeNegocio('Reserva inexistente.',404);
  const existentes=await tx.consumoServicioAdicional.findMany({where:{reservaId,tipoServicio:'Persona adicional'}});
  const items=[];
  for(const h of r.reservaHabitaciones){if(h.ocupacionIncluida==null||Number(h.precioPersonaExtra)===0)continue;
    for(let ms=r.fechaDesde.getTime();ms<r.fechaHasta.getTime();ms+=86400000){const fecha=new Date(ms),dia=fecha.toISOString().slice(0,10);
      const presentes=r.ocupantes.filter(p=>habitacionDeLaNoche(p,dia)===h.habitacionId);
      const cantidad=Math.max(0,presentes.length-h.ocupacionIncluida);const claveOperacion=`ocupacion-${reservaId}-${h.habitacionId}-${dia}`;
      if(cantidad&&!existentes.some(c=>c.claveOperacion===claveOperacion))items.push({habitacionId:h.habitacionId,numero:h.habitacion.numero,fecha:dia,cantidad,precioUnitario:Number(h.precioPersonaExtra),monto:Math.round(cantidad*Number(h.precioPersonaExtra)*100)/100,claveOperacion});
    }
  }
  return {items,total:items.reduce((n,i)=>n+i.monto,0)};
}
async function preview(reservaId){return calcular(prisma,identificador(reservaId));}
async function aplicar(reservaId,data){reservaId=identificador(reservaId);return prisma.$transaction(async tx=>{
  const r=await s.bloquear(tx,reservaId);if(r.estado!=='En curso')throw new s.ErrorDeNegocio('El cobro requiere una estadía en curso.');
  const propuesta=await calcular(tx,reservaId);if(!propuesta.items.length)throw new s.ErrorDeNegocio('No hay adicionales nuevos por ocupación.');
  if(JSON.stringify(propuesta.items)!==JSON.stringify(data.items))throw new s.ErrorDeNegocio('La ocupación cambió. Actualizá y revisá el cálculo antes de confirmar.',409);
  for(const item of propuesta.items)await tx.consumoServicioAdicional.create({data:{reservaId,habitacionId:item.habitacionId,tipoServicio:'Persona adicional',descripcion:`Persona adicional · noche ${item.fecha}`,cantidad:item.cantidad,precioUnitario:item.precioUnitario,monto:item.monto,claveOperacion:item.claveOperacion,registradoPor:String(data.operador||''),fechaServicio:new Date(item.fecha+'T00:00:00Z')}});
  await s.evento(tx,reservaId,'Confirmar adicional de ocupación',propuesta,data.operador);return propuesta;
},{timeout:15000});}
module.exports={obtener,guardar,preview,aplicar,habitacionDeLaNoche};
