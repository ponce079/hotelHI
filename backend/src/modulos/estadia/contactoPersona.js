const { MAYORIA_EDAD } = require("../../lib/fechas");
const normalizar = (v) =>
  String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
async function prepararContacto(tx, r, p, actual, data, { edad, ErrorDeNegocio }) {
  const documentoTitular = r.huesped?.numeroDocumento;
  const esTitular =
    actual?.esTitular ||
    data.esTitular === true ||
    (documentoTitular &&
      normalizar(p.numeroDocumento) === normalizar(documentoTitular) &&
      normalizar(p.tipoDocumento) === normalizar(r.huesped.tipoDocumento));
  if (esTitular && (!p.fechaNacimiento || edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD))
    throw new ErrorDeNegocio("El titular debe tener al menos 18 años al ingresar.", 400, {
      fechaNacimiento: "Completá una fecha de nacimiento válida: el titular debe tener al menos 18 años al ingresar.",
    });
  const menor = p.fechaNacimiento && edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD;
  const responsable = p.responsableId
    ? await tx.ocupanteReserva.findFirst({
        where: {
          id: p.responsableId,
          reservaId: r.id,
          estado: { in: ["Previsto", "Alojado"] },
        },
      })
    : null;
  if (data.usarContactoResponsable === true) {
    if (
      !menor ||
      !responsable?.fechaNacimiento ||
      edad(responsable.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD ||
      responsable.id === actual?.id
    )
      throw new ErrorDeNegocio("Elegí un adulto responsable válido para compartir su contacto.", 400, {
        responsableId: "Elegí el adulto responsable del menor.",
      });
    p.email = responsable.email || null;
    p.telefono = responsable.telefono || null;
  }
  return { menor, responsable };
}
function comparteCorreo(otro, p, actual, menor, responsable) {
  return Boolean(
    (menor &&
      responsable &&
      String(responsable.email || "")
        .trim()
        .toLowerCase() === String(p.email).trim().toLowerCase() &&
      (otro.id === responsable.id || otro.responsableId === responsable.id)) ||
    (actual && otro.responsableId === actual.id),
  );
}
module.exports = { prepararContacto, comparteCorreo };
