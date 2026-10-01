// Datos de prueba explícitos para los contratos de registro de huéspedes.
function personasFixture(habitaciones, huesped, fechaDesde, fechaHasta) {
  let id = 0;
  return habitaciones.flatMap((h) =>
    Array.from({ length: h.adultos + h.menores }, (_, i) => {
      id += 1;
      const menor = i >= h.adultos;
      return {
        id,
        habitacionId: h.habitacionId,
        nombre: "Persona",
        apellido: "Prueba",
        tipoDocumento: id === 1 ? huesped.tipoDocumento : "DNI",
        numeroDocumento: id === 1 ? huesped.numeroDocumento : String(80000000 + id),
        paisDocumento: "AR",
        nacionalidad: "AR",
        paisResidencia: "AR",
        fechaNacimiento: menor ? "2020-01-01" : "1990-01-01",
        fechaDesde: new Date(fechaDesde).toISOString().slice(0, 10),
        fechaHasta: new Date(fechaHasta).toISOString().slice(0, 10),
        esTitular: i === 0,
        responsableId: menor ? id - i : null,
      };
    }),
  );
}

async function completarFixture(reserva, habitaciones) {
  const s = require("../src/modulos/estadia/estadia.servicio");
  const existentes = await s.listar(reserva.id);
  const personas = personasFixture(habitaciones, reserva.huesped, reserva.fechaDesde, reserva.fechaHasta);
  const ids = new Map();
  for (const persona of personas) {
    const guardada = await s.guardar(reserva.id, persona.id === 1 ? existentes[0].id : null, {
      ...persona,
      responsableId: persona.responsableId ? ids.get(persona.responsableId) : null,
      operador: "Prueba",
    });
    ids.set(persona.id, guardada.id);
    await s.accion(reserva.id, guardada.id, {
      accion: "verificar",
      operador: "Prueba",
    });
  }
  return reserva;
}
module.exports = { personasFixture, completarFixture };
