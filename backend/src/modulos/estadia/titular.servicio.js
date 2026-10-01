const prisma = require('../../lib/prisma');
const estadia = require('./estadia.servicio');
const ACCION = 'Titular incorporado como ocupante';
const documento = valor => String(valor || '').trim().toUpperCase().replace(/\s/g, '');

function tienePlaza(r, habitacionId, capacidad, personas) {
  const eventos = [{ fecha: r.fechaDesde, delta: 1 }, { fecha: r.fechaHasta, delta: -1 }];
  for (const p of personas) {
    if (!['Previsto', 'Alojado'].includes(p.estado) || !p.asignaciones.some(a => a.habitacionId === habitacionId && !a.hasta)) continue;
    eventos.push({ fecha: p.fechaDesde, delta: 1 }, { fecha: p.fechaHasta, delta: -1 });
  }
  eventos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha) || a.delta - b.delta);
  let cantidad = 0;
  return !eventos.some(e => (cantidad += e.delta) > capacidad);
}

// La reserva debe estar recién creada en esta transacción o bloqueada FOR UPDATE.
// El evento enlaza al titular con su ocupante sin cambiar el esquema compartido.
async function incorporarEnTransaccion(tx, reserva, huesped, operador, nueva = false) {
  if (!huesped) throw new estadia.ErrorDeNegocio('La reserva no tiene un titular disponible.', 409);
  if (!nueva) {
    const evento = await tx.eventoEstadia.findFirst({ where: { reservaId: reserva.id, accion: ACCION }, orderBy: { id: 'asc' } });
    if (evento) return { incorporado: false, ...JSON.parse(evento.detalle) };
  }
  const personas = nueva ? [] : await tx.ocupanteReserva.findMany({ where: { reservaId: reserva.id }, include: { asignaciones: true } });
  // El registro original no tiene país emisor: no lo inferimos del tipo de documento.
  const coincidencias = personas.filter(p => documento(p.numeroDocumento) === documento(huesped.numeroDocumento) && documento(p.tipoDocumento) === documento(huesped.tipoDocumento));
  if (coincidencias.length > 1) throw new estadia.ErrorDeNegocio('Hay varios ocupantes con el documento del titular. Revisá sus datos antes de incorporarlo.', 409);
  let ocupante = coincidencias[0];
  let creado = false;
  let aviso = null;
  if (!ocupante) {
    const rh = [...reserva.reservaHabitaciones].sort((a, b) => a.habitacionId - b.habitacionId)
      .find(h => tienePlaza(reserva, h.habitacionId, h.habitacion.capacidad, personas));
    if (!rh) throw new estadia.ErrorDeNegocio('No hay una plaza disponible para el titular. Revisá las asignaciones de los ocupantes; no se puede superar la capacidad.', 409);
    const contacto = String(huesped.contacto || '').trim();
    let email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto) ? contacto : null;
    if (email && personas.some(p => p.estado !== 'Cancelado' && String(p.email || '').trim().toLowerCase() === email.toLowerCase())) {
      aviso = 'El correo del titular ya está usado por otro ocupante. Revisá el contacto al completar sus datos.';
      email = null;
    }
    ocupante = await tx.ocupanteReserva.create({
      data: {
        reservaId: reserva.id, nombre: huesped.nombre, apellido: '',
        ...(huesped.fechaNacimiento ? {fechaNacimiento:huesped.fechaNacimiento} : {}),
        tipoDocumento: huesped.tipoDocumento, numeroDocumento: documento(huesped.numeroDocumento),
        email, telefono: !contacto.includes('@') && contacto ? contacto : null,
        fechaDesde: reserva.fechaDesde, fechaHasta: reserva.fechaHasta, estado: 'Previsto',
        asignaciones: { create: { habitacionId: rh.habitacionId, motivo: 'Incorporación del titular de la reserva' } },
      },
      include: { asignaciones: true },
    });
    creado = true;
  }
  const detalle = { ocupanteId: ocupante.id, huespedId: huesped.id, creado, aviso };
  await estadia.evento(tx, reserva.id, ACCION, detalle, operador);
  return { incorporado: creado, ...detalle };
}

async function asegurarTitular(reservaId, operador) {
  const id = Number(reservaId);
  if (!Number.isSafeInteger(id) || id < 1) throw new estadia.ErrorDeNegocio('Reserva inválida.');
  return prisma.$transaction(async tx => {
    const reserva = await estadia.bloquear(tx, id);
    const huesped = await tx.huesped.findUnique({ where: { id: reserva.huespedId } });
    return incorporarEnTransaccion(tx, reserva, huesped, operador);
  }, { timeout: 15000, maxWait: 10000 });
}
module.exports = { incorporarEnTransaccion, asegurarTitular };
