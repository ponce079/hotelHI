const s = require('./estadia.servicio');

function validarOcupacion(habitaciones, personas) {
  if (!habitaciones.length) throw new s.ErrorDeNegocio('La reserva no tiene habitaciones.');
  for (const rh of habitaciones) {
    const h = rh.habitacion;
    const esperadas = rh.adultos + rh.menores;
    if (!Number.isSafeInteger(esperadas) || rh.adultos < 1 || rh.menores < 0 || esperadas > h.capacidad) {
      throw new s.ErrorDeNegocio(`Revisá la ocupación reservada de la habitación ${h.numero}.`, 409);
    }
    const registradas = personas.filter(p => p.asignaciones.some(a => a.habitacionId === rh.habitacionId && !a.hasta));
    if (registradas.length !== esperadas) {
      throw new s.ErrorDeNegocio(`Habitación ${h.numero}: hay ${registradas.length} personas registradas y ${esperadas} reservadas. Completá las fichas o modificá la ocupación de la reserva y revisá su nueva cotización.`, 409);
    }
    for (const p of registradas) s.validarCompleto(p);
    const menores = registradas.filter(p => s.edad(p.fechaNacimiento, p.fechaDesde) < 18).length;
    if (menores !== rh.menores) throw new s.ErrorDeNegocio(`Habitación ${h.numero}: las edades no coinciden con los ${rh.adultos} adultos y ${rh.menores} menores reservados.`, 409);
  }
  for (const p of personas) {
    const activas = p.asignaciones.filter(a => !a.hasta);
    if (activas.length !== 1 || !habitaciones.some(h => h.habitacionId === activas[0].habitacionId)) {
      throw new s.ErrorDeNegocio('Cada ocupante debe tener una única habitación vigente de esta reserva.', 409);
    }
  }
}

async function prepararIngreso(tx, reservaId, operador) {
  const personas = await tx.ocupanteReserva.findMany({ where: { reservaId, estado: 'Previsto' }, include: { asignaciones: true } });
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const presentes = personas.filter(p => p.fechaDesde.toISOString().slice(0, 10) <= hoy && p.fechaHasta.toISOString().slice(0, 10) > hoy);
  const habitaciones = await tx.reservaHabitacion.findMany({ where: { reservaId }, include: { habitacion: true } });
  validarOcupacion(habitaciones, presentes);
  for (const p of presentes) {
    if (!p.verificadoEn) throw new s.ErrorDeNegocio(`Verificá los datos de ${p.nombre} ${p.apellido} antes del ingreso.`);
    if (p.responsableId && !presentes.some(a => a.id === p.responsableId)) throw new s.ErrorDeNegocio('El adulto responsable debe ingresar junto con el menor.');
  }
  for (const p of presentes) {
    await tx.ocupanteReserva.update({ where: { id: p.id }, data: { estado: 'Alojado', ingresoReal: new Date(), identidadActiva: s.identidad(p) } });
  }
  await s.evento(tx, reservaId, 'Check-in: ocupantes registrados', { ocupanteIds: presentes.map(p => p.id) }, operador || 'Recepción');
}

async function cargarWalkIn(tx, reservaId, personas, operador) {
  if (!Array.isArray(personas) || !personas.length || personas.length > 100) throw new s.ErrorDeNegocio('Registrá las personas que ingresan (máximo 100).');
  const ids = new Map();
  for (const persona of [...personas].sort((a, b) => Number(Boolean(a.responsableId)) - Number(Boolean(b.responsableId)))) {
    const p = await s.guardar(reservaId, null, { ...persona, responsableId: persona.responsableId ? ids.get(Number(persona.responsableId)) : null, operador }, tx);
    s.validarCompleto(p);
    ids.set(Number(persona.id), p.id);
    await tx.ocupanteReserva.update({ where: { id: p.id }, data: { verificadoPor: operador, verificadoEn: new Date() } });
  }
}
module.exports = { prepararIngreso, cargarWalkIn, validarOcupacion };
