const texto = (v) => String(v ?? "").trim();
const fecha = (v) => String(v ?? "").slice(0, 10);
const fechaValida = (v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const documento = (v) => texto(v).toUpperCase().replace(/\s/g, "");
export function validarOcupante(
  form,
  reserva,
  personas,
  persona,
  paisManual = {},
  otraLocalidad = false,
  esTitular = false,
) {
  const errores = {};
  for (const [campo, valor] of Object.entries(form)) {
    if (typeof valor === "string" && valor.trim().length > 191) errores[campo] = "El máximo es de 191 caracteres.";
  }
  if (!texto(form.nombre)) errores.nombre = "Completá el nombre.";
  if (!texto(form.apellido)) errores.apellido = "Completá el apellido.";
  const desde = fecha(form.fechaDesde),
    hasta = fecha(form.fechaHasta);
  if (!fechaValida(desde)) errores.fechaDesde = "Indicá una fecha de ingreso válida.";
  else if (desde < fecha(reserva.fechaDesde) || desde >= fecha(reserva.fechaHasta))
    errores.fechaDesde = "El ingreso debe estar dentro de la reserva.";
  if (!fechaValida(hasta)) errores.fechaHasta = "Indicá una fecha de salida válida.";
  else if (hasta <= desde || hasta > fecha(reserva.fechaHasta))
    errores.fechaHasta = "La salida debe ser posterior al ingreso y estar dentro de la reserva.";
  if (
    form.fechaNacimiento &&
    (!fechaValida(fecha(form.fechaNacimiento)) || new Date(form.fechaNacimiento) > new Date())
  )
    errores.fechaNacimiento = "Indicá un nacimiento válido, no futuro.";
  const otras = personas.filter(
    (p) => (persona.id == null || String(p.id) !== String(persona.id)) && p.estado !== "Cancelado",
  );
  const cumple18 = form.fechaNacimiento
    ? `${Number(fecha(form.fechaNacimiento).slice(0, 4)) + 18}${fecha(form.fechaNacimiento).slice(4)}`
    : "";
  const menor = cumple18 && cumple18 > desde;
  if (esTitular && (!cumple18 || menor))
    errores.fechaNacimiento =
      "El titular debe tener al menos 18 años al ingresar. Completá una fecha de nacimiento válida.";
  const responsable = otras.find((p) => String(p.id) === String(form.responsableId));
  if (form.usarContactoResponsable && (!menor || !responsable))
    errores.responsableId = "Elegí el adulto responsable del menor para usar su contacto.";
  const email = texto(form.email).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errores.email = "Ingresá un correo válido, por ejemplo nombre@gmail.com.";
  else if (
    email &&
    otras.some(
      (p) =>
        texto(p.email).toLowerCase() === email &&
        !(
          menor &&
          texto(responsable?.email).toLowerCase() === email &&
          (String(p.id) === String(form.responsableId) || String(p.responsableId) === String(form.responsableId))
        ) &&
        !(persona.id && String(p.responsableId) === String(persona.id)),
    )
  )
    errores.email = "Este correo ya está registrado en otro ocupante de la reserva.";
  if (
    form.numeroDocumento &&
    otras.some(
      (p) =>
        documento(p.numeroDocumento) === documento(form.numeroDocumento) &&
        texto(p.tipoDocumento) === texto(form.tipoDocumento) &&
        texto(p.paisDocumento) === texto(form.paisDocumento),
    )
  )
    errores.numeroDocumento = "Este documento ya está registrado en la reserva.";
  for (const campo of ["paisDocumento", "paisResidencia"])
    if (paisManual[campo] && !texto(form[campo])) errores[campo] = "Escribí el nombre del país.";
  if ((paisManual.paisResidencia || otraLocalidad) && !texto(form.localidad))
    errores.localidad = "Escribí el nombre de la localidad.";
  const habitacion = reserva.habitaciones.find((h) => Number(h.id) === Number(form.habitacionId));
  if (!habitacion) errores.habitacionId = "Seleccioná una habitación de la reserva.";
  else if (!errores.fechaDesde && !errores.fechaHasta) {
    const eventos = [
      { fecha: desde, delta: 1 },
      { fecha: hasta, delta: -1 },
    ];
    for (const p of otras.filter((p) => !p.estado || ["Previsto", "Alojado"].includes(p.estado))) {
      const hab = p.asignaciones?.find((a) => !a.hasta)?.habitacionId ?? p.habitacionId;
      if (Number(hab) !== Number(form.habitacionId)) continue;
      eventos.push(
        { fecha: fecha(p.fechaDesde || reserva.fechaDesde), delta: 1 },
        { fecha: fecha(p.fechaHasta || reserva.fechaHasta), delta: -1 },
      );
    }
    eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.delta - b.delta);
    let ocupados = 0;
    if (eventos.some((e) => (ocupados += e.delta) > habitacion.capacidad))
      errores.habitacionId =
        `La habitación ${habitacion.numero} supera su capacidad (${habitacion.capacidad}) en esas fechas.`;
  }
  const anterior = persona.asignaciones?.find((a) => !a.hasta);
  if (form.responsableId) {
    const adulto = otras.find(
      (p) => String(p.id) === String(form.responsableId) && (!p.estado || ["Previsto", "Alojado"].includes(p.estado)),
    );
    const nacimiento = fecha(adulto?.fechaNacimiento);
    const cumple18 = nacimiento ? `${Number(nacimiento.slice(0, 4)) + 18}${nacimiento.slice(4)}` : "";
    if (!adulto || !fechaValida(nacimiento) || cumple18 > desde)
      errores.responsableId = "Elegí un adulto de esta reserva como responsable.";
  }
  if (anterior && Number(anterior.habitacionId) !== Number(form.habitacionId) && !texto(form.motivo))
    errores.motivo = "Indicá el motivo del cambio de habitación.";
  return errores;
}

export function pendientesParaIngreso(form) {
  const pendientes = [];
  if (!texto(form.nombre)) pendientes.push("nombre");
  if (!texto(form.apellido)) pendientes.push("apellido (revisá el nombre completo copiado de la reserva)");
  if (!form.fechaNacimiento) pendientes.push("nacimiento");
  if (!texto(form.nacionalidad)) pendientes.push("nacionalidad");
  if (!texto(form.paisResidencia)) pendientes.push("país de residencia");
  if (
    !texto(form.motivoSinDocumento) &&
    !(texto(form.tipoDocumento) && texto(form.numeroDocumento) && texto(form.paisDocumento))
  )
    pendientes.push("documento completo y país emisor");
  if (form.fechaNacimiento && form.fechaDesde) {
    const n = new Date(form.fechaNacimiento),
      ingreso = new Date(form.fechaDesde);
    let edad = ingreso.getUTCFullYear() - n.getUTCFullYear();
    if (
      ingreso.getUTCMonth() < n.getUTCMonth() ||
      (ingreso.getUTCMonth() === n.getUTCMonth() && ingreso.getUTCDate() < n.getUTCDate())
    )
      edad--;
    if (edad < 18 && !form.responsableId) pendientes.push("adulto responsable");
  }
  return pendientes;
}
