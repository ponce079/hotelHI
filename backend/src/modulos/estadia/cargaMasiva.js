// Carga de todas las personas de un walk-in con una cantidad FIJA de consultas,
// sin importar cuántas personas o habitaciones haya (nada de create/update en bucle
// dentro de la transacción). Las validaciones son las mismas que las de guardar()
// una por una, pero se resuelven en memoria sobre lecturas agrupadas.
const { randomUUID } = require("node:crypto");
const s = require("./estadia.servicio");
const { MAYORIA_EDAD } = require("../../lib/fechas");
const personasServicio = require("./persona.servicio");
const { comparteCorreo } = require("./contactoPersona");
const { esEmail } = require("../../lib/contacto");

const { ErrorDeNegocio, edad } = s;
const normalizar = (v) =>
  String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s/g, "");
const ACTIVOS = ["Previsto", "Alojado"];
const claveDeDocumento = (p) => [p.tipoDocumento, p.paisDocumento, p.numeroDocumento].map(normalizar).join("|");

function capacidadTotal(reserva) {
  return reserva.reservaHabitaciones.reduce((total, rh) => total + rh.habitacion.capacidad, 0);
}

// Valida a cada persona, en orden, contra la reserva y contra las anteriores del mismo lote.
// Devuelve las fichas listas para escribir. No toca la base.
function validarLote(reserva, entradas, existentes) {
  const titularDeReserva = reserva.huesped;
  const aceptadas = [];
  const porClave = new Map();
  for (const [indice, entrada] of entradas.entries()) {
    const p = s.normalizarPersona(entrada, reserva);
    const residencia = s.sacarResidencia(p);
    const rh = reserva.reservaHabitaciones.find((h) => h.habitacionId === s.idValido(entrada.habitacionId));
    if (!rh) throw new ErrorDeNegocio("La habitación no pertenece a esta reserva.");
    const clave = `t${Number(entrada.id) || indice + 1}`;
    const responsable = entrada.responsableId ? porClave.get(`t${Number(entrada.responsableId)}`) : null;
    const menor = p.fechaNacimiento && edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD;
    const esTitular = entrada.esTitular === true;
    const comoTitularDeReserva =
      titularDeReserva &&
      normalizar(p.numeroDocumento) === normalizar(titularDeReserva.numeroDocumento) &&
      normalizar(p.tipoDocumento) === normalizar(titularDeReserva.tipoDocumento);
    if ((esTitular || comoTitularDeReserva) && (!p.fechaNacimiento || edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD))
      throw new ErrorDeNegocio("El titular debe tener al menos 18 años al ingresar.", 400, {
        fechaNacimiento: "Completá una fecha de nacimiento válida: el titular debe tener al menos 18 años al ingresar.",
      });
    if (entrada.usarContactoResponsable === true) {
      if (!menor || !responsable?.fechaNacimiento || edad(responsable.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD)
        throw new ErrorDeNegocio("Elegí un adulto responsable válido para compartir su contacto.", 400, {
          responsableId: "Elegí el adulto responsable del menor.",
        });
      p.email = responsable.email || null;
      p.telefono = responsable.telefono || null;
    }
    const otros = [...existentes.filter((o) => o.estado !== "Cancelado"), ...aceptadas];
    if (p.email) {
      const repetido = otros.some(
        (otro) =>
          String(otro.email || "")
            .trim()
            .toLowerCase() === p.email.toLowerCase() && !comparteCorreo(otro, p, null, menor, responsable),
      );
      if (repetido) {
        const mensaje = "Este correo ya está registrado en otro ocupante de la reserva.";
        throw new ErrorDeNegocio(mensaje, 409, { email: mensaje });
      }
    }
    if (entrada.responsableId) {
      const adulto = responsable && !responsable.responsableId ? responsable : null;
      if (!adulto || !adulto.fechaNacimiento || edad(adulto.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD)
        throw new ErrorDeNegocio("El responsable debe ser un adulto de la misma reserva.");
    }
    if (p.numeroDocumento) {
      // Repetida dentro del mismo envío (en la misma o en otra habitación): error de carga, 400.
      const repetida = aceptadas.find((o) => o.numeroDocumento && claveDeDocumento(o) === claveDeDocumento(p));
      if (repetida)
        throw new ErrorDeNegocio(
          `${p.nombre} ${p.apellido} figura dos veces en la lista (mismo documento ${p.tipoDocumento} ` +
            `${p.numeroDocumento}). Cargá a cada persona una sola vez.`,
          400,
        );
      if (existentes.some((o) => o.estado !== "Cancelado" && o.numeroDocumento && claveDeDocumento(o) === claveDeDocumento(p)))
        throw new ErrorDeNegocio("Esta persona ya está registrada en la reserva.", 409);
    }
    const enLaHabitacion = otros.filter(
      (o) => ACTIVOS.includes(o.estado ?? "Previsto") && o.habitacionId === rh.habitacionId,
    );
    s.verificarCapacidad(rh, p, enLaHabitacion);
    if (esTitular && (!p.fechaNacimiento || edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD))
      throw new ErrorDeNegocio("El titular de habitacion debe tener 18 años cumplidos.");
    const ficha = {
      ...p,
      id: clave,
      // Id temporal que mandó la pantalla: identifica la fila en los errores (PERSONA_ALOJADA).
      idTemporal: entrada.id ?? indice + 1,
      esTitular,
      habitacionId: rh.habitacionId,
      responsableId: responsable ? responsable.id : null,
      residencia,
    };
    s.validarCompleto({ ...ficha, ...residencia });
    porClave.set(clave, ficha);
    aceptadas.push(ficha);
  }
  return aceptadas;
}

// Resuelve la ficha de Huesped de cada persona con lecturas agrupadas. Devuelve
// un Map clave de la persona -> id de Huesped.
async function resolverHuespedes(tx, reserva, fichas) {
  const resultado = new Map();
  const claves = new Map();
  for (const ficha of fichas) {
    const identidad = personasServicio.claveDocumento(ficha);
    if (identidad) claves.set(ficha.id, identidad);
  }
  const existentes = claves.size
    ? await tx.huesped.findMany({ where: { identidadDocumento: { in: [...new Set(claves.values())] } } })
    : [];
  const porIdentidad = new Map(existentes.map((h) => [h.identidadDocumento, h]));
  const titular = reserva.huesped;
  const nuevos = [];
  const conIdentidadNueva = new Map();
  for (const ficha of fichas) {
    const identidad = claves.get(ficha.id);
    const datos = personasServicio.datosDeHuesped(ficha);
    const residencia = Object.fromEntries(
      personasServicio.CAMPOS_RESIDENCIA.map((campo) => [campo, ficha.residencia[campo] || null]),
    );
    if (!identidad) {
      const provisoria = `${personasServicio.PREFIJO_SIN_DOCUMENTO}${randomUUID()}`;
      nuevos.push({
        ...datos,
        tipoDocumento: ficha.tipoDocumento || "Sin documento",
        numeroDocumento: ficha.numeroDocumento || "",
        paisDocumento: ficha.paisDocumento || null,
        identidadDocumento: provisoria,
        ...residencia,
      });
      conIdentidadNueva.set(ficha.id, provisoria);
      continue;
    }
    const encontrado = porIdentidad.get(identidad);
    const esElTitular =
      titular &&
      normalizar(titular.tipoDocumento) === normalizar(ficha.tipoDocumento) &&
      normalizar(titular.numeroDocumento) === normalizar(ficha.numeroDocumento) &&
      (!titular.paisDocumento || personasServicio.normalizarPais(titular.paisDocumento) === datos.paisDocumento);
    if (esElTitular && !encontrado) {
      const contacto = esEmail(ficha.email) || !esEmail(titular.contacto) ? datos.contacto : titular.contacto;
      await tx.huesped.update({ where: { id: titular.id }, data: { ...datos, contacto, identidadDocumento: identidad } });
      resultado.set(ficha.id, titular.id);
    } else if (esElTitular && encontrado.id !== titular.id) {
      await tx.reserva.update({ where: { id: reserva.id }, data: { huespedId: encontrado.id } });
      resultado.set(ficha.id, encontrado.id);
    } else if (encontrado) {
      resultado.set(ficha.id, encontrado.id);
    } else {
      nuevos.push({ ...datos, identidadDocumento: identidad, ...residencia });
      conIdentidadNueva.set(ficha.id, identidad);
    }
  }
  if (nuevos.length) {
    await tx.huesped.createMany({ data: nuevos });
    const creados = await tx.huesped.findMany({
      where: { identidadDocumento: { in: [...conIdentidadNueva.values()] } },
    });
    const idPorIdentidad = new Map(creados.map((h) => [h.identidadDocumento, h.id]));
    for (const [clave, identidad] of conIdentidadNueva) resultado.set(clave, idPorIdentidad.get(identidad));
  }
  // Persona que vuelve: su ficha se reutiliza y se actualiza con lo declarado ahora. Contacto:
  // el correo manda; un correo ya guardado no se pisa con un teléfono si ahora no declaró correo.
  const contactoGuardado = new Map(existentes.map((h) => [h.id, h.contacto]));
  if (titular) contactoGuardado.set(titular.id, titular.contacto);
  const yaExistian = fichas.filter((ficha) => !conIdentidadNueva.has(ficha.id));
  await personasServicio.actualizarFichasEnLote(
    tx,
    yaExistian.map((ficha) => {
      const datos = personasServicio.datosDeHuesped(ficha);
      const huespedId = resultado.get(ficha.id);
      const correoNuevo = esEmail(ficha.email);
      const contacto = correoNuevo || !esEmail(contactoGuardado.get(huespedId)) ? datos.contacto : null;
      return {
        huespedId,
        datos: {
          nombre: datos.nombre,
          fechaNacimiento: datos.fechaNacimiento,
          contacto,
          ...ficha.residencia,
        },
      };
    }),
  );
  return resultado;
}

function filaDeOcupante(ficha, huespedId, responsableId, verificadoPor, ahora) {
  return {
    reservaId: ficha.reservaId,
    huespedId,
    esTitular: ficha.esTitular,
    nombre: ficha.nombre,
    apellido: ficha.apellido,
    tipoDocumento: ficha.tipoDocumento,
    numeroDocumento: ficha.numeroDocumento,
    paisDocumento: ficha.paisDocumento,
    motivoSinDocumento: ficha.motivoSinDocumento,
    fechaNacimiento: ficha.fechaNacimiento,
    telefono: ficha.telefono,
    email: ficha.email,
    responsableId,
    fechaDesde: ficha.fechaDesde,
    fechaHasta: ficha.fechaHasta,
    verificadoPor,
    verificadoEn: ahora,
  };
}

// Una persona alojada ahora en otra estadía (identidadActiva ocupada) no puede ingresar de
// nuevo. La base igual lo impide con el índice único al ingresar; esto lo avisa antes y con
// el nombre de la persona, en una sola consulta.
async function rechazarYaAlojadas(tx, fichas) {
  const identidades = fichas.map((f) => s.identidad(f)).filter(Boolean);
  if (!identidades.length) return;
  const alojadas = await tx.ocupanteReserva.findMany({
    where: { identidadActiva: { in: identidades } },
    select: { nombre: true, apellido: true, identidadActiva: true, reserva: { select: { codigoConfirmacion: true } } },
  });
  if (alojadas.length) {
    const quienes = alojadas
      .map((p) => `${p.nombre} ${p.apellido}`.trim() + (p.reserva ? ` (reserva ${p.reserva.codigoConfirmacion})` : ""))
      .join(", ");
    const error = new ErrorDeNegocio(
      `Ya figura alojada en otra estadía: ${quienes}. Registrá su salida antes de volver a ingresarla.`,
      409,
    );
    // Aditivo (etapa 2): qué filas del envío son, por su id temporal, para marcarlas en la pantalla.
    const ocupadas = new Set(alojadas.map((p) => p.identidadActiva));
    error.codigo = "PERSONA_ALOJADA";
    error.detalle = { personas: fichas.filter((f) => ocupadas.has(s.identidad(f))).map((f) => f.idTemporal) };
    throw error;
  }
}

async function cargarPersonasEnLote(tx, reservaId, entradas, operador) {
  const reserva = await s.bloquear(tx, reservaId);
  if (!Array.isArray(entradas) || !entradas.length) throw new ErrorDeNegocio("Registrá las personas que ingresan.");
  const maximo = capacidadTotal(reserva);
  if (entradas.length > maximo)
    throw new ErrorDeNegocio(`Las habitaciones de la reserva admiten como máximo ${maximo} personas.`);
  const quien = String(operador || "").trim();
  if (!quien) throw new ErrorDeNegocio("Operador: valor inválido (máximo 191 caracteres).");
  // Todas las fichas previas de la reserva, también las canceladas: una ficha cancelada de la
  // misma persona (mismo huespedId) no puede confundirse con la que se crea ahora.
  const previas = await tx.ocupanteReserva.findMany({
    where: { reservaId },
    include: { asignaciones: true },
  });
  const existentes = previas
    .filter((o) => o.estado !== "Cancelado")
    .map((o) => ({ ...o, habitacionId: o.asignaciones.find((a) => !a.hasta)?.habitacionId }));
  // Primero los que no dependen de nadie, después los menores a cargo de un adulto del lote.
  const ordenadas = [...entradas].sort((a, b) => Number(Boolean(a.responsableId)) - Number(Boolean(b.responsableId)));
  const fichas = validarLote(reserva, ordenadas, existentes).map((f) => ({ ...f, reservaId }));
  await rechazarYaAlojadas(tx, fichas);
  const huespedes = await resolverHuespedes(tx, reserva, fichas);
  const ahora = new Date();
  const ocupantes = new Map();
  const idsPrevios = new Set(previas.map((o) => o.id));
  async function crear(grupo, responsableDe) {
    if (!grupo.length) return;
    await tx.ocupanteReserva.createMany({
      data: grupo.map((f) => filaDeOcupante(f, huespedes.get(f.id), responsableDe(f), quien, ahora)),
    });
    const creados = await tx.ocupanteReserva.findMany({
      where: { reservaId, huespedId: { in: grupo.map((f) => huespedes.get(f.id)) } },
    });
    for (const f of grupo) {
      const creado = creados.find((o) => o.huespedId === huespedes.get(f.id) && !idsPrevios.has(o.id));
      ocupantes.set(f.id, creado.id);
    }
  }
  await crear(
    fichas.filter((f) => !f.responsableId),
    () => null,
  );
  await crear(
    fichas.filter((f) => f.responsableId),
    (f) => ocupantes.get(f.responsableId),
  );
  await tx.asignacionOcupanteHabitacion.createMany({
    data: fichas.map((f) => ({ ocupanteId: ocupantes.get(f.id), habitacionId: f.habitacionId, motivo: null })),
  });
  await tx.eventoEstadia.createMany({
    data: fichas.map((f) => ({
      reservaId,
      accion: "Agregar ocupante",
      detalle: JSON.stringify({ ocupanteId: ocupantes.get(f.id), habitacionId: f.habitacionId, cambio: false }),
      operador: quien,
    })),
  });
}

module.exports = { cargarPersonasEnLote, validarLote };
