// Ingreso de personas (check-in con reserva y walk-in) con una cantidad de consultas CONSTANTE dentro de la
// transacción: no crece con la cantidad de personas ni de habitaciones.
//
// Contra la base remota (~400 ms por consulta) cada consulta de la transacción cuesta casi medio segundo y
// mantiene tomada una de las pocas conexiones del pool. Por eso el trabajo se parte en dos:
//
//   1) prepararLote(cliente, …)   FUERA de la transacción: todas las lecturas y validaciones que no necesitan
//      bloqueo (validar a cada persona, quién ya está alojada, qué fichas existen por documento) y las
//      validaciones de ocupación que antes hacía prepararIngreso.
//   2) escribirLote(tx, …)        DENTRO de la transacción: solo escrituras agrupadas (createMany / updateMany /
//      una sentencia por tipo, nunca una por persona) y lo que necesita atomicidad.
//
// Las reglas son las de siempre (cargaMasiva.js + ingreso.js + checkIn.servicio.js): este archivo cambia DÓNDE se
// hace cada cosa, no QUÉ se valida. Las funciones de cargaMasiva.js / ingreso.js siguen existiendo para el resto
// de los flujos (agregar una persona a una estadía en curso, etc.).
const { randomUUID } = require("node:crypto");
const { Prisma } = require("@prisma/client");
const s = require("../estadia/estadia.servicio");
const personasServicio = require("../estadia/persona.servicio");
const { esEmail } = require("../../lib/contacto");
const { validarOcupacion } = require("../estadia/ingreso");
const { validarLote, filaDeOcupante, rechazarYaAlojadas, capacidadTotal } = require("../estadia/cargaMasiva");
const { claveNombre, normalizarNumeroDocumento } = require("../../lib/documento");

const { ErrorDeNegocio } = s;

const MENSAJE_YA_ALOJADA =
  "Una de las personas ya figura alojada en otra estadía: no puede ingresar dos veces a la vez.";

// Un P2002 sobre el índice único de identidadActiva (la base garantiza que la misma persona no figure alojada
// dos veces a la vez) es el mismo caso que la validación previa: 409 con el mismo mensaje.
function esDuplicadoDeIdentidadActiva(error) {
  const detalle = `${error?.code} ${error?.message} ${JSON.stringify(error?.meta || {})}`;
  return /identidadActiva/i.test(detalle) && /P2002|duplicate entry|\b1062\b/i.test(detalle);
}

// ---------------------------------------------------------------------------------------------------------
// 1) Fuera de la transacción
// ---------------------------------------------------------------------------------------------------------

// `reserva`: { id (puede ser null en un walk-in), fechaDesde, fechaHasta, huesped, reservaHabitaciones:
// [{ habitacionId, adultos, menores, habitacion: { numero, capacidad } }] }.
// `previas`: fichas de ocupante ya cargadas en la reserva (con `asignaciones`), para no repetir personas.
// Devuelve las fichas validadas y las fichas de huésped que ya existen por documento.
async function prepararLote(cliente, reserva, entradas, { previas = [], hoy, permisoNombre = {} } = {}) {
  if (!Array.isArray(entradas) || !entradas.length) throw new ErrorDeNegocio("Registrá las personas que ingresan.");
  const maximo = capacidadTotal(reserva);
  if (entradas.length > maximo)
    throw new ErrorDeNegocio(`Las habitaciones de la reserva admiten como máximo ${maximo} personas.`);

  const existentes = previas
    .filter((o) => o.estado !== "Cancelado")
    .map((o) => ({ ...o, habitacionId: o.asignaciones?.find((a) => !a.hasta)?.habitacionId }));
  // Primero los que no dependen de nadie, después los menores a cargo de un adulto del lote.
  const ordenadas = [...entradas].sort((a, b) => Number(Boolean(a.responsableId)) - Number(Boolean(b.responsableId)));
  const fichas = validarLote(reserva, ordenadas, existentes).map((f) => ({ ...f, reservaId: reserva.id ?? null }));

  // Quién ya figura alojada (una sola consulta). La base lo vuelve a garantizar con el índice único.
  await rechazarYaAlojadas(cliente, fichas);

  // Fichas de huésped que ya existen, por identidad de documento (una sola consulta).
  const identidades = new Map();
  for (const ficha of fichas) {
    const identidad = personasServicio.claveDocumento(ficha);
    if (identidad) identidades.set(ficha.id, identidad);
  }
  const huespedesExistentes = identidades.size
    ? await cliente.huesped.findMany({ where: { identidadDocumento: { in: [...new Set(identidades.values())] } } })
    : [];

  // Lo que antes validaba prepararIngreso dentro de la transacción, ahora sobre los datos en memoria.
  validarIngresoEnMemoria(reserva, fichas, hoy);

  // Lo que cada persona pidió explícitamente sobre su ficha: actualizarla con lo declarado (casilla "Actualizar la ficha
  // del huésped con estos datos") y, solo para un administrador, el motivo de un cambio de nombre.
  const extras = new Map();
  for (const ficha of fichas) {
    const entrada = entradas.find((e) => e.id !== undefined && String(e.id) === String(ficha.idTemporal));
    extras.set(ficha.id, { actualizarFicha: entrada?.actualizarFicha === true, motivoCambioNombre: entrada?.motivoCambioNombre });
  }

  // Regla 2.3: el nombre de una ficha existente no se cambia en silencio. Se comprueba para TODAS las personas antes de
  // abrir la transacción (409 NOMBRE_DISTINTO; solo un administrador, con motivo, puede corregirlo).
  const porIdentidad = new Map(huespedesExistentes.map((h) => [h.identidadDocumento, h]));
  const renombres = [];
  for (const ficha of fichas) {
    const existente = identidades.get(ficha.id) && porIdentidad.get(identidades.get(ficha.id));
    if (existente && personasServicio.autorizarCambioDeNombre(existente, ficha, { ...permisoNombre, motivo: extras.get(ficha.id).motivoCambioNombre })) {
      renombres.push({ ficha, existente });
    }
  }
  // El titular de la reserva sin identidad todavía (se le completa el documento): su nombre también está protegido.
  const delTitular = fichaDelTitularDeLaReserva(reserva, fichas, identidades);
  if (delTitular && !porIdentidad.has(identidades.get(delTitular.id))) {
    if (personasServicio.autorizarCambioDeNombre(reserva.huesped, delTitular, { ...permisoNombre, motivo: extras.get(delTitular.id).motivoCambioNombre })) {
      renombres.push({ ficha: delTitular, existente: reserva.huesped });
    }
  }

  // Regla 2.5: un menor sin documento no se duplica: si ya hay una ficha del mismo menor (mismo adulto responsable,
  // nombres, apellido y fecha de nacimiento), se reutiliza.
  const menoresReutilizados = await buscarMenoresPrevios(cliente, fichas, identidades, porIdentidad);
  return { fichas, identidades, huespedesExistentes, extras, renombres, menoresReutilizados };
}

// ¿Cuál de las fichas del lote es el titular de la reserva (mismo tipo, número y país emisor)?
function fichaDelTitularDeLaReserva(reserva, fichas, identidades) {
  const titular = reserva?.huesped;
  if (!titular?.id) return null;
  return (
    fichas.find(
      (f) =>
        identidades.get(f.id) &&
        String(titular.tipoDocumento ?? "").trim().toUpperCase() === String(f.tipoDocumento ?? "").trim().toUpperCase() &&
        normalizarNumeroDocumento(titular.numeroDocumento) === normalizarNumeroDocumento(f.numeroDocumento) &&
        (!titular.paisDocumento || personasServicio.normalizarPais(titular.paisDocumento) === personasServicio.datosDeHuesped(f).paisDocumento),
    ) ?? null
  );
}

// Menores sin documento cuyo adulto responsable ya tiene ficha: busca, con DOS consultas (sin importar cuántos menores
// haya), una ficha previa del mismo menor entre los ocupantes que tuvieron a ese adulto como responsable.
async function buscarMenoresPrevios(cliente, fichas, identidades, porIdentidad) {
  const resultado = new Map(); // ficha.id (del menor) -> huespedId existente
  const candidatos = fichas.filter((f) => !identidades.get(f.id) && f.responsableId);
  if (!candidatos.length) return resultado;
  const adultoDe = new Map(); // ficha.id (del menor) -> huespedId del adulto responsable
  for (const menor of candidatos) {
    const responsable = fichas.find((x) => x.id === menor.responsableId);
    const huesped = responsable && identidades.get(responsable.id) && porIdentidad.get(identidades.get(responsable.id));
    if (huesped) adultoDe.set(menor.id, huesped.id);
  }
  if (!adultoDe.size) return resultado;
  const adultos = [...new Set(adultoDe.values())];
  const ocupantesAdultos = await cliente.ocupanteReserva.findMany({ where: { huespedId: { in: adultos } }, select: { id: true, huespedId: true } });
  if (!ocupantesAdultos.length) return resultado;
  const huespedDeOcupante = new Map(ocupantesAdultos.map((o) => [o.id, o.huespedId]));
  const hijos = await cliente.ocupanteReserva.findMany({
    where: { responsableId: { in: [...huespedDeOcupante.keys()] }, huespedId: { not: null } },
    select: { responsableId: true, huespedId: true, nombre: true, apellido: true, fechaNacimiento: true },
  });
  const dia = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));
  for (const menor of candidatos) {
    const adulto = adultoDe.get(menor.id);
    const previo = hijos.find(
      (h) =>
        huespedDeOcupante.get(h.responsableId) === adulto &&
        claveNombre(h.nombre) === claveNombre(menor.nombre) &&
        claveNombre(h.apellido) === claveNombre(menor.apellido) &&
        dia(h.fechaNacimiento) === dia(menor.fechaNacimiento),
    );
    if (previo) resultado.set(menor.id, previo.huespedId);
  }
  return resultado;
}

function validarIngresoEnMemoria(reserva, fichas, hoy = require("../../lib/fechas").hoyComoFechaUTC()) {
  const hoyISO = hoy.toISOString().slice(0, 10);
  const personas = fichas.map((f) => ({
    ...f,
    ...f.residencia,
    asignaciones: [{ habitacionId: f.habitacionId, hasta: null }],
  }));
  const presentes = personas.filter(
    (p) => p.fechaDesde.toISOString().slice(0, 10) <= hoyISO && p.fechaHasta.toISOString().slice(0, 10) > hoyISO,
  );
  validarOcupacion(reserva.reservaHabitaciones, presentes);
  for (const p of presentes) {
    if (p.responsableId && !presentes.some((a) => a.id === p.responsableId))
      throw new ErrorDeNegocio("El adulto responsable debe ingresar junto con el menor.");
  }
  return presentes;
}

// ---------------------------------------------------------------------------------------------------------
// 2) Dentro de la transacción
// ---------------------------------------------------------------------------------------------------------

// Escribe fichas de huésped, ocupantes (ya "Alojado"), asignaciones y eventos con cantidad fija de consultas:
//   - fichas nuevas: un createMany (skipDuplicates: si otra operación creó la misma ficha en paralelo, se usa
//     la existente y NO se pisa) + UNA relectura por identidad;
//   - fichas existentes: una sola sentencia (actualizarFichasEnLote);
//   - ocupantes: un createMany para los adultos y otro para los menores a cargo (necesitan el id del adulto)
//     con una relectura cada uno;
//   - asignaciones y eventos: un createMany cada uno.
async function resolverFichas(tx, { reserva, reservaId, fichas, identidades, huespedesExistentes, extras = new Map(), renombres = [], menoresReutilizados = new Map(), permisoNombre = {} }) {
  const porIdentidad = new Map(huespedesExistentes.map((h) => [h.identidadDocumento, h]));
  const titular = reserva.huesped;
  const huespedes = new Map(); // ficha.id -> huespedId
  const nuevos = [];
  const identidadNueva = new Map(); // ficha.id -> identidad (de las que se crean ahora)
  const nombreResuelto = new Set(); // huespedId cuyo nombre ya se escribió en esta transacción

  for (const ficha of fichas) {
    const identidad = identidades.get(ficha.id);
    const datos = personasServicio.datosDeHuesped(ficha);
    const residencia = Object.fromEntries(
      personasServicio.CAMPOS_RESIDENCIA.map((campo) => [campo, ficha.residencia[campo] || null]),
    );
    if (!identidad && menoresReutilizados.has(ficha.id)) {
      // El mismo menor ya tiene ficha: se reutiliza en vez de crear otra.
      huespedes.set(ficha.id, menoresReutilizados.get(ficha.id));
      continue;
    }
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
      identidadNueva.set(ficha.id, provisoria);
      continue;
    }
    const encontrado = porIdentidad.get(identidad);
    if (encontrado) huespedes.set(ficha.id, encontrado.id);
    else {
      nuevos.push({ ...datos, identidadDocumento: identidad, ...residencia });
      identidadNueva.set(ficha.id, identidad);
    }
  }

  // El titular de la reserva ya existía con otra identidad (por ejemplo, sin país emisor): se completa en una
  // sola sentencia en vez de crear otra persona; si en cambio ya hay otra ficha con esa identidad, la reserva
  // pasa a esa ficha. Solo en el check-in con reserva (en el walk-in no hay `titular`).
  if (titular?.id) {
    const documento = require("../../lib/documento");
    const delTitular = fichas.find(
      (f) =>
        identidades.get(f.id) &&
        String(titular.tipoDocumento ?? "").trim().toUpperCase() === String(f.tipoDocumento ?? "").trim().toUpperCase() &&
        documento.normalizarNumeroDocumento(titular.numeroDocumento) === documento.normalizarNumeroDocumento(f.numeroDocumento) &&
        (!titular.paisDocumento || personasServicio.normalizarPais(titular.paisDocumento) === personasServicio.datosDeHuesped(f).paisDocumento),
    );
    if (delTitular) {
      const encontrado = porIdentidad.get(identidades.get(delTitular.id));
      if (!encontrado) {
        const datos = personasServicio.datosDeHuesped(delTitular);
        const contacto = esEmail(delTitular.email) || !esEmail(titular.contacto) ? datos.contacto : titular.contacto;
        // Se completa la identidad del titular; su nombre solo cambia si un administrador lo autorizó.
        const { nombre, nombres, apellido, ...sinNombre } = datos;
        const conNombre = renombres.some((r) => r.ficha.id === delTitular.id);
        // Ficha vieja con el nombre completo en un solo campo: se guarda la separación que hizo la recepción.
        const separacion = conNombre ? null : personasServicio.separacionDeNombre(titular, delTitular);
        await tx.huesped.update({
          where: { id: titular.id },
          data: { ...sinNombre, ...(conNombre ? { nombre, nombres, apellido } : (separacion ?? {})), contacto, identidadDocumento: identidades.get(delTitular.id) },
        });
        nombreResuelto.add(titular.id);
        if (conNombre) await personasServicio.registrarCambioDeNombre(tx, titular, delTitular, { ...permisoNombre, motivo: extras.get(delTitular.id)?.motivoCambioNombre, reservaId });
        huespedes.set(delTitular.id, titular.id);
        const idx = nuevos.findIndex((n) => n.identidadDocumento === identidades.get(delTitular.id));
        if (idx >= 0) nuevos.splice(idx, 1);
        identidadNueva.delete(delTitular.id);
      } else if (encontrado.id !== titular.id) {
        await tx.reserva.update({ where: { id: reservaId }, data: { huespedId: encontrado.id } });
      }
    }
  }

  if (nuevos.length) {
    await tx.huesped.createMany({ data: nuevos, skipDuplicates: true });
    // Relectura con lectura "actual" (FOR UPDATE), no con la lectura normal de la transacción: si otra operación creó
    // la misma ficha en paralelo y ya hizo commit, el createMany la salteó (skipDuplicates) pero esta transacción, con
    // su instantánea anterior a ese commit, no la vería con un findMany común y la ficha quedaría sin id.
    const creados = await tx.$queryRaw(
      Prisma.sql`SELECT id, identidadDocumento FROM huespedes WHERE identidadDocumento IN (${Prisma.join([...identidadNueva.values()])}) FOR UPDATE`,
    );
    const idPorIdentidad = new Map(creados.map((h) => [h.identidadDocumento, Number(h.id)]));
    for (const [clave, identidad] of identidadNueva) huespedes.set(clave, idPorIdentidad.get(identidad));
  }

  // Persona que vuelve: su ficha se reutiliza y se actualiza con lo declarado ahora (una sola sentencia).
  // Contacto: el correo manda; un correo ya guardado no se pisa con un teléfono si ahora no declaró correo.
  const contactoGuardado = new Map(huespedesExistentes.map((h) => [h.id, h.contacto]));
  if (titular?.id) contactoGuardado.set(titular.id, titular.contacto);
  const yaExistian = fichas.filter((f) => !identidadNueva.has(f.id) && huespedes.get(f.id) !== titular?.id);
  await personasServicio.actualizarFichasEnLote(
    tx,
    yaExistian.map((ficha) => {
      const datos = personasServicio.datosDeHuesped(ficha);
      const huespedId = huespedes.get(ficha.id);
      const correoNuevo = esEmail(ficha.email);
      const contacto = correoNuevo || !esEmail(contactoGuardado.get(huespedId)) ? datos.contacto : null;
      return {
        huespedId,
        // Sin la casilla "Actualizar la ficha del huésped con estos datos" solo se completan los datos vacíos.
        sobrescribir: extras.get(ficha.id)?.actualizarFicha === true,
        datos: { fechaNacimiento: datos.fechaNacimiento, contacto, ...ficha.residencia },
      };
    }),
  );

  // Cambios de nombre AUTORIZADOS (administrador con motivo): una sola sentencia y constancia de cada uno.
  const aRenombrar = renombres.filter((r) => huespedes.get(r.ficha.id) && r.existente.id !== titular?.id);
  if (aRenombrar.length) {
    await personasServicio.renombrarFichasEnLote(
      tx,
      aRenombrar.map((r) => ({ huespedId: huespedes.get(r.ficha.id), datos: personasServicio.datosDeHuesped(r.ficha) })),
    );
    for (const r of aRenombrar) {
      await personasServicio.registrarCambioDeNombre(tx, r.existente, r.ficha, { ...permisoNombre, motivo: extras.get(r.ficha.id)?.motivoCambioNombre, reservaId });
      nombreResuelto.add(huespedes.get(r.ficha.id));
    }
  }

  // Fichas viejas (nombre completo en un solo campo) que la recepción separó según el documento: se guardan nombres y
  // apellido. No es un cambio de nombre (el nombre completo es el mismo), así que no pide administrador ni motivo.
  // Una sola sentencia, sin importar cuántas sean.
  const previoPorId = new Map(huespedesExistentes.map((h) => [h.id, h]));
  if (titular?.id) previoPorId.set(titular.id, titular);
  const separaciones = new Map(); // huespedId -> datos
  for (const ficha of fichas) {
    const huespedId = huespedes.get(ficha.id);
    if (!huespedId || identidadNueva.has(ficha.id) || nombreResuelto.has(huespedId) || separaciones.has(huespedId)) continue;
    const datos = personasServicio.separacionDeNombre(previoPorId.get(huespedId), ficha);
    if (datos) separaciones.set(huespedId, datos);
  }
  if (separaciones.size) {
    await personasServicio.renombrarFichasEnLote(
      tx,
      [...separaciones].map(([huespedId, datos]) => ({ huespedId, datos })),
    );
  }
  return huespedes;
}

async function escribirOcupantes(tx, { reservaId, fichas, huespedes, operador, eventosExtra = [], ahora = new Date() }) {
  // Ocupantes: ya "Alojado", con su identidad activa (el índice único impide que la misma persona figure
  // alojada dos veces a la vez).
  const ocupantes = new Map(); // ficha.id -> ocupanteId
  const idsPrevios = new Set();
  async function crear(grupo, responsableDe) {
    if (!grupo.length) return;
    await tx.ocupanteReserva.createMany({
      data: grupo.map((f) => ({
        ...filaDeOcupante({ ...f, reservaId }, huespedes.get(f.id), responsableDe(f), operador, ahora),
        estado: "Alojado",
        ingresoReal: ahora,
        identidadActiva: s.identidad(f),
      })),
    });
    const creados = await tx.ocupanteReserva.findMany({
      where: { reservaId, estado: "Alojado", huespedId: { in: grupo.map((f) => huespedes.get(f.id)) } },
    });
    for (const f of grupo) {
      const creado = creados.find((o) => o.huespedId === huespedes.get(f.id) && !idsPrevios.has(o.id));
      ocupantes.set(f.id, creado.id);
      idsPrevios.add(creado.id);
    }
  }
  await crear(fichas.filter((f) => !f.responsableId), () => null);
  await crear(fichas.filter((f) => f.responsableId), (f) => ocupantes.get(f.responsableId));

  await tx.asignacionOcupanteHabitacion.createMany({
    data: fichas.map((f) => ({ ocupanteId: ocupantes.get(f.id), habitacionId: f.habitacionId, motivo: null })),
  });

  const eventos = [
    ...fichas.map((f) => ({
      reservaId,
      accion: "Agregar ocupante",
      detalle: JSON.stringify({ ocupanteId: ocupantes.get(f.id), habitacionId: f.habitacionId, cambio: false }),
      operador,
    })),
    ...eventosExtra.map((e) => ({ reservaId, accion: e.accion, detalle: JSON.stringify(e.detalle), operador })),
    {
      reservaId,
      accion: "Check-in: ocupantes registrados",
      detalle: JSON.stringify({
        ocupanteIds: fichas.map((f) => ocupantes.get(f.id)),
        // Menores con su responsable, el vínculo y la autorización presentada (si correspondía).
        menores: fichas
          .filter((f) => f.responsableId)
          .map((f) => ({
            ocupanteId: ocupantes.get(f.id),
            responsableId: ocupantes.get(f.responsableId),
            vinculo: f.vinculoResponsable ?? null,
            autorizacionPresentada: f.autorizacionPresentada === true,
          })),
      }),
      operador,
    },
  ];
  await tx.eventoEstadia.createMany({ data: eventos });
  return { ocupantes };
}

// Para el check-in con reserva (la reserva ya existe): las dos partes seguidas.
async function escribirLote(tx, datos) {
  const huespedes = await resolverFichas(tx, datos);
  const { ocupantes } = await escribirOcupantes(tx, { ...datos, huespedes });
  return { huespedes, ocupantes };
}

module.exports = {
  prepararLote,
  resolverFichas,
  escribirOcupantes,
  escribirLote,
  validarIngresoEnMemoria,
  esDuplicadoDeIdentidadActiva,
  MENSAJE_YA_ALOJADA,
};
