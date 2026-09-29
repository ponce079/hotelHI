const prisma = require('../../lib/prisma');
function identidad(p) { return p.numeroDocumento ? require('node:crypto').createHash('sha256').update([p.tipoDocumento,p.paisDocumento,p.numeroDocumento].map(v=>String(v||'').trim().toUpperCase()).join('|')).digest('hex') : null; }
class ErrorDeNegocio extends Error { constructor(message, statusCode=400) { super(message); this.statusCode=statusCode; } }
const id = v => { const n=Number(v); if(!Number.isSafeInteger(n)||n<1) throw new ErrorDeNegocio('Identificador inválido.'); return n; };
function texto(v, campo, obligatorio=false, max=191) { const s=String(v??'').trim(); if((obligatorio&&!s)||s.length>max) throw new ErrorDeNegocio(`${campo}: valor inválido (máximo ${max} caracteres).`); return s||null; }
function fecha(v,campo) { const s=String(v??'').slice(0,10); const d=new Date(`${s}T00:00:00Z`); if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s) throw new ErrorDeNegocio(`${campo}: fecha inválida.`); return d; }
function edad(nacimiento, en) { let n=en.getUTCFullYear()-nacimiento.getUTCFullYear(); if(en.getUTCMonth()<nacimiento.getUTCMonth() || (en.getUTCMonth()===nacimiento.getUTCMonth()&&en.getUTCDate()<nacimiento.getUTCDate()))n--; return n; }
function normalizarPersona(d, reserva) {
  const fechaDesde=fecha(d.fechaDesde||reserva.fechaDesde.toISOString(),'Ingreso previsto');
  const fechaHasta=fecha(d.fechaHasta||reserva.fechaHasta.toISOString(),'Salida prevista');
  if(fechaHasta<=fechaDesde||fechaDesde<reserva.fechaDesde||fechaHasta>reserva.fechaHasta) throw new ErrorDeNegocio('Las fechas del ocupante deben estar dentro de la reserva.');
  const nacimiento=d.fechaNacimiento?fecha(d.fechaNacimiento,'Nacimiento'):null;
  if(nacimiento && nacimiento>new Date()) throw new ErrorDeNegocio('La fecha de nacimiento no puede ser futura.');
  const r={nombre:texto(d.nombre,'Nombre',true),apellido:texto(d.apellido,'Apellido',true),fechaDesde,fechaHasta,fechaNacimiento:nacimiento};
  for(const k of ['tipoDocumento','numeroDocumento','paisDocumento','motivoSinDocumento','nacionalidad','domicilio','localidad','paisResidencia','telefono','email']) r[k]=texto(d[k],k);
  if(r.numeroDocumento) r.numeroDocumento=r.numeroDocumento.toUpperCase().replace(/\s/g,'');
  if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))throw new ErrorDeNegocio('Correo electrónico inválido.');
  r.responsableId=d.responsableId?id(d.responsableId):null;
  return r;
}
async function bloquear(tx,reservaId) { await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${reservaId} FOR UPDATE`; const r=await tx.reserva.findUnique({where:{id:reservaId},include:{reservaHabitaciones:{include:{habitacion:true}}}});if(!r)throw new ErrorDeNegocio('Reserva inexistente.',404);if(!['Confirmada','En curso'].includes(r.estado))throw new ErrorDeNegocio('La reserva está cerrada o cancelada.',409);return r; }
async function evento(tx,reservaId,accion,detalle,operador) {return tx.eventoEstadia.create({data:{reservaId,accion,detalle:JSON.stringify(detalle),operador:texto(operador,'Operador',true)}});}
const includePersona={asignaciones:{orderBy:{desde:'asc'}}};
async function listar(reservaId) {return prisma.ocupanteReserva.findMany({where:{reservaId:id(reservaId)},include:includePersona,orderBy:{id:'asc'}});}
async function capacidad(tx,r,habitacionId,persona,excluirId) {
  const rh=r.reservaHabitaciones.find(h=>h.habitacionId===habitacionId);if(!rh)throw new ErrorDeNegocio('La habitación no pertenece a esta reserva.');
  const otras=await tx.ocupanteReserva.findMany({where:{reservaId:r.id,estado:{in:['Previsto','Alojado']},...(excluirId?{id:{not:excluirId}}:{}),asignaciones:{some:{habitacionId,hasta:null}}}});
  const eventos=[{fecha:persona.fechaDesde,delta:1},{fecha:persona.fechaHasta,delta:-1}];
  for(const p of otras) {eventos.push({fecha:p.fechaDesde,delta:1},{fecha:p.fechaHasta,delta:-1});}
  eventos.sort((a,b)=>a.fecha-b.fecha||a.delta-b.delta);let ocupados=0;for(const e of eventos){ocupados+=e.delta;if(ocupados>rh.habitacion.capacidad)throw new ErrorDeNegocio(`La habitación ${rh.habitacion.numero} supera su capacidad (${rh.habitacion.capacidad}).`,409);}
}
async function guardar(reservaId,ocupanteId,data,cliente) {
  reservaId=id(reservaId); const operador=texto(data.operador,'Operador',true);
  const ejecutar=async tx=>{
    const r=await bloquear(tx,reservaId);const actual=ocupanteId?await tx.ocupanteReserva.findFirst({where:{id:id(ocupanteId),reservaId},include:includePersona}):null;
    if(ocupanteId&&!actual)throw new ErrorDeNegocio('Ocupante inexistente.',404);
    if(actual?.estado==='Alojado' && (String(data.numeroDocumento||'').trim().toUpperCase().replace(/\s/g,'')!==actual.numeroDocumento || data.tipoDocumento!==actual.tipoDocumento || data.paisDocumento!==actual.paisDocumento))throw new ErrorDeNegocio('La identidad de una persona alojada no se cambia. Registrá la salida antes de corregirla.');
    if(actual&&['Retirado','Cancelado'].includes(actual.estado))throw new ErrorDeNegocio('No se modifica un registro finalizado.');
    const p=normalizarPersona(data,r); const habitacionId=id(data.habitacionId);
    if(p.responsableId) {const adulto=await tx.ocupanteReserva.findFirst({where:{id:p.responsableId,reservaId,estado:{in:['Previsto','Alojado']}}});if(!adulto||!adulto.fechaNacimiento||edad(adulto.fechaNacimiento,p.fechaDesde)<18||adulto.id===actual?.id)throw new ErrorDeNegocio('El responsable debe ser un adulto de la misma reserva.');}
    if(p.numeroDocumento&&await tx.ocupanteReserva.findFirst({where:{reservaId,numeroDocumento:p.numeroDocumento,tipoDocumento:p.tipoDocumento,paisDocumento:p.paisDocumento,estado:{not:'Cancelado'},...(actual?{id:{not:actual.id}}:{})}}))throw new ErrorDeNegocio('Esta persona ya está registrada en la reserva.',409);
    if(actual && await tx.ocupanteReserva.count({where:{responsableId:actual.id,reservaId,estado:{in:['Previsto','Alojado']}}}) && (!p.fechaNacimiento || edad(p.fechaNacimiento,p.fechaDesde)<18))throw new ErrorDeNegocio('El responsable de menores debe conservar su condición de adulto.');
    await capacidad(tx,r,habitacionId,p,actual?.id);
    const anterior=actual?.asignaciones.find(a=>!a.hasta);
    const cambio=anterior&&anterior.habitacionId!==habitacionId;
    if(cambio&&!texto(data.motivo,'Motivo'))throw new ErrorDeNegocio('Indicá el motivo del cambio de habitación.');
    if(actual?.estado==='Alojado'&&cambio){const h=r.reservaHabitaciones.find(h=>h.habitacionId===habitacionId).habitacion;if(!['ocupada','libre'].includes(h.estado))throw new ErrorDeNegocio('La habitación de destino no está disponible.');}
    const saved=actual?await tx.ocupanteReserva.update({where:{id:actual.id},data:{...p,verificadoEn:null,verificadoPor:null}}):await tx.ocupanteReserva.create({data:{...p,reservaId}});
    if(!anterior||cambio){if(anterior)await tx.asignacionOcupanteHabitacion.update({where:{id:anterior.id},data:{hasta:new Date()}});await tx.asignacionOcupanteHabitacion.create({data:{ocupanteId:saved.id,habitacionId,motivo:texto(data.motivo,'Motivo')}});}
    await evento(tx,reservaId,actual?'Actualizar ocupante':'Agregar ocupante',{ocupanteId:saved.id,habitacionId,cambio:Boolean(cambio)},operador);
    return tx.ocupanteReserva.findUnique({where:{id:saved.id},include:includePersona});
  };
  return cliente?ejecutar(cliente):prisma.$transaction(ejecutar,{timeout:15000});
}
function validarCompleto(p){if(!p.fechaNacimiento||!p.nacionalidad||!p.paisResidencia)throw new ErrorDeNegocio('Completá nacimiento, nacionalidad y país de residencia.');if(!(p.tipoDocumento&&p.numeroDocumento&&p.paisDocumento)&&!p.motivoSinDocumento)throw new ErrorDeNegocio('Completá el documento y su país emisor o justificá la excepción.');if(edad(p.fechaNacimiento,p.fechaDesde)<18&&!p.responsableId)throw new ErrorDeNegocio('El menor necesita un adulto responsable.');}
async function accion(reservaId,ocupanteId,data){reservaId=id(reservaId);return prisma.$transaction(async tx=>{
  const r=await bloquear(tx,reservaId);const p=await tx.ocupanteReserva.findFirst({where:{id:id(ocupanteId),reservaId},include:includePersona});if(!p)throw new ErrorDeNegocio('Ocupante inexistente.',404);
  const operador=texto(data.operador,'Operador',true);let cambio={};
  if(data.accion==='verificar'){if(!['Previsto','Alojado'].includes(p.estado))throw new ErrorDeNegocio('Ocupante finalizado.');validarCompleto(p);cambio={verificadoPor:operador,verificadoEn:new Date()};}
  else if(data.accion==='ingresar'){if(r.estado!=='En curso'||p.estado!=='Previsto'||!p.verificadoEn)throw new ErrorDeNegocio('Se requiere check-in de la reserva y datos verificados.');const hoy=new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});if(hoy<p.fechaDesde.toISOString().slice(0,10)||hoy>=p.fechaHasta.toISOString().slice(0,10))throw new ErrorDeNegocio('El ingreso está fuera del período previsto.');validarCompleto(p);const a=p.asignaciones.find(a=>!a.hasta);await capacidad(tx,r,a.habitacionId,p,p.id);if(p.responsableId&&!await tx.ocupanteReserva.findFirst({where:{id:p.responsableId,reservaId,estado:'Alojado'}}))throw new ErrorDeNegocio('Primero debe ingresar el adulto responsable.');cambio={estado:'Alojado',ingresoReal:new Date(),identidadActiva:identidad(p)};}
  else if(data.accion==='retirar'){if(p.estado!=='Alojado')throw new ErrorDeNegocio('La persona no está alojada.');if(await tx.ocupanteReserva.count({where:{responsableId:p.id,reservaId,estado:'Alojado'}}))throw new ErrorDeNegocio('Retirá primero a los menores a cargo o asignales otro responsable.');cambio={estado:'Retirado',salidaReal:new Date(),identidadActiva:null};}
  else if(data.accion==='cancelar'){if(p.estado!=='Previsto')throw new ErrorDeNegocio('Solo se cancela un ingreso pendiente.');if(await tx.ocupanteReserva.count({where:{responsableId:p.id,reservaId,estado:{in:['Previsto','Alojado']}}}))throw new ErrorDeNegocio('Hay menores a cargo.');cambio={estado:'Cancelado'};}
  else throw new ErrorDeNegocio('Acción inválida.');
  await tx.ocupanteReserva.update({where:{id:p.id},data:cambio});if(['retirar','cancelar'].includes(data.accion))await tx.asignacionOcupanteHabitacion.updateMany({where:{ocupanteId:p.id,hasta:null},data:{hasta:new Date()}});await evento(tx,reservaId,data.accion,{ocupanteId:p.id},operador);return {ok:true};
},{timeout:15000});}
async function alojados(q=''){return prisma.ocupanteReserva.findMany({where:{estado:'Alojado',...(q?{OR:[{nombre:{contains:q}},{apellido:{contains:q}},{numeroDocumento:{contains:q}}]}:{})},include:{...includePersona,reserva:{select:{codigoConfirmacion:true,reservaHabitaciones:{include:{habitacion:true}}}}},orderBy:{apellido:'asc'},take:500});}
async function historial(reservaId){return prisma.eventoEstadia.findMany({where:{reservaId:id(reservaId)},orderBy:{id:'desc'},take:200});}
async function liquidarGarantia(reservaId,data){reservaId=id(reservaId);return prisma.$transaction(async tx=>{await bloquear(tx,reservaId);const pago=await tx.pagoEstadia.findFirst({where:{id:id(data.pagoId),reservaId,concepto:'Garantía',garantiaSeparada:true,anulado:false},include:{medios:true}});if(!pago)throw new ErrorDeNegocio('Garantía inexistente.');const devolver=Number(data.devolver||0),aplicar=Number(data.aplicar||0);const total=pago.medios.reduce((s,m)=>s+Number(m.importe),0);const disponible=total-Number(pago.garantiaDevuelta)-Number(pago.garantiaAplicada);if(Math.abs(devolver*100-Math.round(devolver*100))>0.000001||Math.abs(aplicar*100-Math.round(aplicar*100))>0.000001||!Number.isFinite(devolver)||!Number.isFinite(aplicar)||devolver<0||aplicar<0||devolver+aplicar<=0||Math.round((devolver+aplicar)*100)>Math.round(disponible*100))throw new ErrorDeNegocio('Importes inválidos o superiores a la garantía disponible.');const cuenta=await require('../check-out/checkOut.servicio').consolidarCargos(reservaId,tx);if(aplicar>cuenta.saldo)throw new ErrorDeNegocio('La aplicación supera el saldo pendiente.');await tx.pagoEstadia.update({where:{id:pago.id},data:{garantiaDevuelta:{increment:devolver},garantiaAplicada:{increment:aplicar}}});await evento(tx,reservaId,'Liquidar garantía',{pagoId:pago.id,devolver,aplicar,motivo:texto(data.motivo,'Motivo',true)},data.operador);return {ok:true};},{timeout:15000});}
module.exports={identidad,ErrorDeNegocio,normalizarPersona,edad,validarCompleto,bloquear,evento,listar,guardar,accion,alojados,historial,liquidarGarantia};
