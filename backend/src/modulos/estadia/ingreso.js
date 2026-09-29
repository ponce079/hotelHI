const s = require('./estadia.servicio');

// Se ejecuta dentro de la misma transacción del check-in y de su garantía.
async function prepararIngreso(tx, reservaId, habitacionIds, cantidades, operador) {
  const personas = await tx.ocupanteReserva.findMany({where:{reservaId,estado:'Previsto'},include:{asignaciones:true}});
  const hoy = new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
  const presentes = personas.filter(p=>p.fechaDesde.toISOString().slice(0,10)<=hoy&&p.fechaHasta.toISOString().slice(0,10)>hoy);
  const habitaciones = await tx.habitacion.findMany({where:{id:{in:habitacionIds}}});
  validarCantidades(habitaciones, presentes, cantidades);
  for(const h of habitacionIds){if(!presentes.some(p=>p.asignaciones.some(a=>a.habitacionId===h&&!a.hasta)))throw new s.ErrorDeNegocio('Registrá al menos un ocupante que ingrese hoy en cada habitación antes del check-in.');}
  for(const p of presentes){s.validarCompleto(p);if(!p.verificadoEn)throw new s.ErrorDeNegocio(`Verificá los datos de ${p.nombre} ${p.apellido} antes del ingreso.`);if(p.responsableId&&!presentes.some(a=>a.id===p.responsableId))throw new s.ErrorDeNegocio('El adulto responsable debe ingresar junto con el menor.');}
  for (const p of presentes) await tx.ocupanteReserva.update({where:{id:p.id},data:{estado:'Alojado',ingresoReal:new Date(),identidadActiva:s.identidad(p)}});
  await tx.eventoEstadia.create({data:{reservaId,accion:'Check-in: ocupantes declarados',detalle:JSON.stringify({cantidades,ocupanteIds:presentes.map(p=>p.id)}),operador:String(operador||'Recepción').slice(0,191)}});
}
function validarCantidades(habitaciones, personas, cantidades) {
  if (!Array.isArray(cantidades) || cantidades.length !== habitaciones.length || !habitaciones.length) {
    throw new s.ErrorDeNegocio('Declará cuántas personas ingresan en cada habitación.');
  }
  const ids = new Set();
  for (const dato of cantidades) {
    const habitacion = habitaciones.find(h=>h.id===dato?.habitacionId);
    if (!habitacion || ids.has(dato.habitacionId) || !Number.isSafeInteger(dato.cantidad) || dato.cantidad < 1) {
      throw new s.ErrorDeNegocio('Indicá una cantidad entera mayor a cero para cada habitación, sin repetir habitaciones.');
    }
    ids.add(dato.habitacionId);
    if (dato.cantidad > habitacion.capacidad) throw new s.ErrorDeNegocio(`La habitación ${habitacion.numero} admite hasta ${habitacion.capacidad} personas.`);
    const registrados = personas.filter(p=>p.asignaciones.some(a=>a.habitacionId===habitacion.id&&!a.hasta)).length;
    if (registrados !== dato.cantidad) throw new s.ErrorDeNegocio(`Habitación ${habitacion.numero}: declaraste ${dato.cantidad} personas y hay ${registrados} registradas para ingresar hoy. Registrá a todas y revisá la cantidad declarada.`);
  }
}
async function cargarWalkIn(tx,reservaId,personas,operador){
  if(!Array.isArray(personas)||!personas.length||personas.length>100)throw new s.ErrorDeNegocio('Registrá las personas que ingresan (máximo 100).');
  const ids=new Map();
  for(const persona of [...personas].sort((a,b)=>Number(Boolean(a.responsableId))-Number(Boolean(b.responsableId)))){
    const p=await s.guardar(reservaId,null,{...persona,responsableId:persona.responsableId?ids.get(Number(persona.responsableId)):null,operador},tx);
    s.validarCompleto(p);ids.set(Number(persona.id),p.id);
    await tx.ocupanteReserva.update({where:{id:p.id},data:{verificadoPor:operador,verificadoEn:new Date()}});
  }
}
module.exports={prepararIngreso,cargarWalkIn,validarCantidades};
