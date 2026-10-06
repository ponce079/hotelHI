const { OPCIONES_TRANSACCION } = require("../../lib/constantes");
const prisma = require("../../lib/prisma");
const { codigoPais } = require("../../lib/paises");
const { CAMPOS_RESIDENCIA } = require("./persona.servicio");
const { MAYORIA_EDAD, edadEn } = require("../../lib/fechas");
const { TIPOS_DOCUMENTO, normalizarTipoDocumento } = require("../../lib/tiposDocumento");
const { esEmail, esTelefono } = require("../../lib/contacto");
const { VINCULOS_RESPONSABLE, normalizarVinculo, requiereAutorizacion } = require("../../lib/vinculos");
const personaAdicional = require("./personaAdicional");
function identidad(p) {
  return p.numeroDocumento
    ? require("node:crypto")
        .createHash("sha256")
        .update(
          [
            String(p.tipoDocumento || "").trim().toUpperCase(),
            String(p.paisDocumento || "").trim().toUpperCase(),
            require("../../lib/documento").normalizarNumeroDocumento(p.numeroDocumento),
          ].join("|"),
        )
        .digest("hex")
    : null;
}
class ErrorDeNegocio extends Error {
  constructor(message, statusCode = 400, campos) {
    super(message);
    this.statusCode = statusCode;
    this.campos = campos;
  }
}
const id = (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1) throw new ErrorDeNegocio("Identificador inválido.");
  return n;
};
function texto(v, campo, obligatorio = false, max = 191) {
  const s = String(v ?? "").trim();
  if ((obligatorio && !s) || s.length > max)
    throw new ErrorDeNegocio(`${campo}: valor inválido (máximo ${max} caracteres).`);
  return s || null;
}
function fecha(v, campo) {
  const s = String(v ?? "").slice(0, 10);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s)
    throw new ErrorDeNegocio(`${campo}: fecha inválida.`);
  return d;
}
// Años cumplidos en una fecha: la regla vive en lib/fechas.js.
const edad = edadEn;
function normalizarPersona(d, reserva) {
  const fechaDesde = fecha(d.fechaDesde || reserva.fechaDesde.toISOString(), "Ingreso previsto");
  const fechaHasta = fecha(d.fechaHasta || reserva.fechaHasta.toISOString(), "Salida prevista");
  if (fechaHasta <= fechaDesde || fechaDesde < reserva.fechaDesde || fechaHasta > reserva.fechaHasta)
    throw new ErrorDeNegocio("Las fechas del ocupante deben estar dentro de la reserva.");
  const nacimiento = d.fechaNacimiento ? fecha(d.fechaNacimiento, "Nacimiento") : null;
  if (nacimiento && nacimiento > new Date()) throw new ErrorDeNegocio("La fecha de nacimiento no puede ser futura.");
  const r = {
    nombre: texto(d.nombre, "Nombre", true),
    apellido: texto(d.apellido, "Apellido", true),
    fechaDesde,
    fechaHasta,
    fechaNacimiento: nacimiento,
  };
  for (const k of [
    "tipoDocumento",
    "numeroDocumento",
    "paisDocumento",
    "motivoSinDocumento",
    "nacionalidad",
    "domicilio",
    "localidad",
    "paisResidencia",
    "telefono",
    "email",
  ])
    r[k] = texto(d[k], k);
  for (const k of ["nacionalidad", "paisResidencia"]) r[k] = codigoPais(r[k]) || r[k];
  if (r.tipoDocumento) {
    // Catálogo único de huésped y ocupantes (lib/tiposDocumento.js), guardado con su valor canónico.
    const canonico = normalizarTipoDocumento(r.tipoDocumento);
    if (!canonico) {
      const mensaje = `El tipo de documento tiene que ser uno de: ${TIPOS_DOCUMENTO.join(", ")}.`;
      throw new ErrorDeNegocio(mensaje, 400, { tipoDocumento: mensaje });
    }
    r.tipoDocumento = canonico;
  }
  if (r.numeroDocumento) {
    r.numeroDocumento = require("../../lib/documento").normalizarNumeroDocumento(r.numeroDocumento);
    // "-" o "." no son un documento: tras normalizar no queda nada y no se puede armar una identidad.
    if (!r.numeroDocumento) {
      const mensaje = "El número de documento tiene que tener letras o números.";
      throw new ErrorDeNegocio(mensaje, 400, { numeroDocumento: mensaje });
    }
  }
  if (r.email && !esEmail(r.email))
    throw new ErrorDeNegocio("Correo electrónico inválido.", 400, {
      email: "Ingresá un correo electrónico válido.",
    });
  if (r.telefono && !esTelefono(r.telefono))
    throw new ErrorDeNegocio("Teléfono inválido.", 400, {
      telefono: "Ingresá un teléfono válido: números, +, espacios o guiones.",
    });
  r.responsableId = d.responsableId ? id(d.responsableId) : null;
  // Vínculo del responsable con el menor: solo valores del catálogo (lib/vinculos.js).
  if (d.vinculoResponsable) {
    r.vinculoResponsable = normalizarVinculo(d.vinculoResponsable);
    if (!r.vinculoResponsable) {
      const mensaje = `El vínculo con el menor tiene que ser uno de: ${VINCULOS_RESPONSABLE.join(", ")}.`;
      throw new ErrorDeNegocio(mensaje, 400, { vinculoResponsable: mensaje });
    }
  } else r.vinculoResponsable = null;
  r.autorizacionPresentada = d.autorizacionPresentada === true;
  return r;
}
// Todo menor de 18 (MAYORIA_EDAD, también los de 13 a 17 que cuentan como adultos para la ocupación)
// lleva el vínculo de su responsable; "Otro familiar" y "Otro adulto a cargo" exigen la autorización
// de los padres o tutores. Un adulto no lleva vínculo.
function validarVinculo(p) {
  const menor = Boolean(p.fechaNacimiento && edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD);
  if (!menor) {
    p.vinculoResponsable = null;
    p.autorizacionPresentada = false;
    return;
  }
  if (!p.vinculoResponsable) {
    const mensaje = "Indicá el vínculo del responsable con el menor.";
    throw new ErrorDeNegocio(mensaje, 400, { vinculoResponsable: mensaje });
  }
  if (requiereAutorizacion(p.vinculoResponsable) && !p.autorizacionPresentada) {
    const mensaje = "Pedí la autorización de los padres o tutores y marcá \"Autorización presentada\".";
    throw new ErrorDeNegocio(mensaje, 400, { autorizacionPresentada: mensaje });
  }
  if (!requiereAutorizacion(p.vinculoResponsable)) p.autorizacionPresentada = false;
}
async function bloquear(tx, reservaId) {
  await tx.$queryRaw`SELECT id FROM reservas WHERE id = ${reservaId} FOR UPDATE`;
  const r = await tx.reserva.findUnique({
    where: { id: reservaId },
    include: {
      huesped: true,
      reservaHabitaciones: { include: { habitacion: true } },
    },
  });
  if (!r) throw new ErrorDeNegocio("Reserva inexistente.", 404);
  if (!["Confirmada", "En curso"].includes(r.estado))
    throw new ErrorDeNegocio("La reserva está cerrada o cancelada.", 409);
  return r;
}
async function evento(tx, reservaId, accion, detalle, operador) {
  return tx.eventoEstadia.create({
    data: {
      reservaId,
      accion,
      detalle: JSON.stringify(detalle),
      operador: texto(operador, "Operador", true),
    },
  });
}
const includePersona = {
  asignaciones: { orderBy: { desde: "asc" } },
  huesped: { select: { id: true, nacionalidad: true, paisResidencia: true, domicilio: true, localidad: true } },
};
// Los datos de residencia viven en Huesped. Hacia afuera (API) siguen viéndose
// en la ficha del ocupante, con los mismos nombres de siempre.
function conResidencia(persona) {
  if (!persona) return persona;
  const { huesped, ...propios } = persona;
  for (const campo of CAMPOS_RESIDENCIA) propios[campo] = huesped?.[campo] ?? propios[campo] ?? null;
  return propios;
}
function sacarResidencia(persona) {
  const residencia = {};
  for (const campo of CAMPOS_RESIDENCIA) {
    residencia[campo] = persona[campo];
    delete persona[campo];
  }
  return residencia;
}
async function listar(reservaId) {
  const [personas, adicionales] = await Promise.all([
    prisma.ocupanteReserva.findMany({
      where: { reservaId: id(reservaId) },
      include: includePersona,
      orderBy: { id: "asc" },
    }),
    prisma.eventoEstadia.findMany({
      where: { reservaId: id(reservaId), accion: "Persona adicional" },
      select: { detalle: true },
    }),
  ]);
  // Marca a quien entró como persona adicional (la salida anticipada le baja la ocupación).
  const idsAdicionales = new Set(adicionales.map((e) => JSON.parse(e.detalle).ocupanteId));
  return personas.map((o) => ({ ...conResidencia(o), personaAdicional: idsAdicionales.has(o.id) }));
}
async function capacidad(tx, r, habitacionId, persona, excluirId) {
  const rh = r.reservaHabitaciones.find((h) => h.habitacionId === habitacionId);
  if (!rh) throw new ErrorDeNegocio("La habitación no pertenece a esta reserva.");
  const otras = await tx.ocupanteReserva.findMany({
    where: {
      reservaId: r.id,
      estado: { in: ["Previsto", "Alojado"] },
      ...(excluirId ? { id: { not: excluirId } } : {}),
      asignaciones: { some: { habitacionId, hasta: null } },
    },
  });
  verificarCapacidad(rh, persona, otras);
}
// Sin consultas: la usa también la carga en lote (cargaMasiva.js).
function verificarCapacidad(rh, persona, otras) {
  const eventos = [
    { fecha: persona.fechaDesde, delta: 1 },
    { fecha: persona.fechaHasta, delta: -1 },
  ];
  for (const p of otras) {
    eventos.push({ fecha: p.fechaDesde, delta: 1 }, { fecha: p.fechaHasta, delta: -1 });
  }
  eventos.sort((a, b) => a.fecha - b.fecha || a.delta - b.delta);
  let ocupados = 0;
  for (const e of eventos) {
    ocupados += e.delta;
    if (ocupados > rh.habitacion.capacidad)
      throw new ErrorDeNegocio(
        `La habitación ${rh.habitacion.numero} supera su capacidad (${rh.habitacion.capacidad}).`,
        409,
      );
  }
}
async function guardar(reservaId, ocupanteId, data, cliente) {
  reservaId = id(reservaId);
  const operador = texto(data.operador, "Operador", true);
  const ejecutar = async (tx) => {
    const r = await bloquear(tx, reservaId);
    const actual = ocupanteId
      ? await tx.ocupanteReserva.findFirst({
          where: { id: id(ocupanteId), reservaId },
          include: includePersona,
        })
      : null;
    if (ocupanteId && !actual) throw new ErrorDeNegocio("Ocupante inexistente.", 404);
    if (actual && ["Retirado", "Cancelado"].includes(actual.estado))
      throw new ErrorDeNegocio("No se modifica un registro finalizado.");
    const alojado = actual?.estado === "Alojado";
    const habitacionActual = actual?.asignaciones.find((a) => !a.hasta)?.habitacionId;
    if (alojado) {
      // Ingreso, salida y habitación de una persona alojada no se editan desde la ficha: para irse
      // antes, "Registrar salida"; para quedarse más, se modifica la reserva; para cambiar de
      // habitación, "Mover a otra habitación".
      const dia = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
      if (
        (data.fechaDesde && dia(data.fechaDesde) !== dia(actual.fechaDesde)) ||
        (data.fechaHasta && dia(data.fechaHasta) !== dia(actual.fechaHasta))
      )
        throw new ErrorDeNegocio(
          "Las fechas de una persona alojada no se cambian desde su ficha. Para irse antes, registrá la salida; para quedarse más, modificá la reserva.",
          409,
        );
      if (data.habitacionId && Number(data.habitacionId) !== habitacionActual)
        throw new ErrorDeNegocio("Para cambiar de habitación a una persona alojada, usá \"Mover a otra habitación\".", 409);
      data = { ...data, fechaDesde: dia(actual.fechaDesde), fechaHasta: dia(actual.fechaHasta), habitacionId: habitacionActual };
    }
    const p = normalizarPersona(data, r);
    const residencia = sacarResidencia(p);
    const habitacionId = id(data.habitacionId);
    // Una persona que se suma con la estadía en curso ingresa desde hoy, no desde la entrada de la reserva.
    const hoy = require("../../lib/fechas").hoyComoFechaUTC();
    if (!actual && r.estado === "En curso" && p.fechaDesde < hoy && hoy < p.fechaHasta) p.fechaDesde = hoy;
    // Adulto responsable: solo para menores de 18 (a la fecha de ingreso), y en ese caso obligatorio.
    const esMenorDeEdad = Boolean(p.fechaNacimiento && edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD);
    if (!esMenorDeEdad && p.responsableId) {
      const mensaje = "Solo un menor de 18 años lleva adulto responsable.";
      throw new ErrorDeNegocio(mensaje, 400, { responsableId: mensaje });
    }
    // Cambio de identidad de una ficha verificada: motivo obligatorio, evento con valores anterior y
    // nuevo, y la ficha vuelve a "Datos por verificar".
    const CAMPOS_DOCUMENTO = ["tipoDocumento", "paisDocumento", "numeroDocumento"];
    const cambiosDocumento = actual
      ? CAMPOS_DOCUMENTO.filter((k) => (p[k] ?? null) !== (actual[k] ?? null))
      : [];
    const motivoCambioIdentidad = texto(data.motivoCambioIdentidad, "Motivo del cambio de documento", false, 500);
    if (cambiosDocumento.length && actual.verificadoEn && !motivoCambioIdentidad) {
      const mensaje = "Indicá el motivo del cambio de documento.";
      throw new ErrorDeNegocio(
        "Esta ficha ya estaba verificada: para cambiar el documento indicá el motivo.",
        400,
        { motivoCambioIdentidad: mensaje },
      );
    }
    const CAMPOS_PERSONALES = ["nombre", "apellido", "fechaNacimiento"];
    const valorPersonal = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null));
    const cambiosPersonales = actual
      ? CAMPOS_PERSONALES.filter((k) => actual[k] != null && valorPersonal(p[k]) !== valorPersonal(actual[k]))
      : [];
    const { prepararContacto, comparteCorreo } = require("./contactoPersona");
    const { menor, responsable } = await prepararContacto(tx, r, p, actual, data, { edad, ErrorDeNegocio });
    if (esMenorDeEdad && !p.responsableId) {
      const mensaje = "Elegí el adulto responsable del menor.";
      throw new ErrorDeNegocio("El menor necesita un adulto responsable.", 400, { responsableId: mensaje });
    }
    validarVinculo(p);
    if (p.email) {
      // La reserva ya está bloqueada: dos altas simultáneas no eluden este control.
      const correos = await tx.ocupanteReserva.findMany({
        where: {
          reservaId,
          estado: { not: "Cancelado" },
          email: { not: null },
          ...(actual ? { id: { not: actual.id } } : {}),
        },
        select: { id: true, email: true, responsableId: true },
      });
      if (
        correos.some(
          (otro) =>
            String(otro.email || "")
              .trim()
              .toLowerCase() === p.email.toLowerCase() && !comparteCorreo(otro, p, actual, menor, responsable),
        )
      ) {
        const mensaje = "Este correo ya está registrado en otro ocupante de la reserva.";
        throw new ErrorDeNegocio(mensaje, 409, { email: mensaje });
      }
    }
    if (p.responsableId) {
      const adulto = await tx.ocupanteReserva.findFirst({
        where: {
          id: p.responsableId,
          reservaId,
          estado: { in: ["Previsto", "Alojado"] },
        },
      });
      if (
        !adulto ||
        !adulto.fechaNacimiento ||
        edad(adulto.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD ||
        adulto.id === actual?.id
      )
        throw new ErrorDeNegocio("El responsable debe ser un adulto de la misma reserva.");
    }
    if (
      p.numeroDocumento &&
      (await tx.ocupanteReserva.findFirst({
        where: {
          reservaId,
          numeroDocumento: p.numeroDocumento,
          tipoDocumento: p.tipoDocumento,
          paisDocumento: p.paisDocumento,
          estado: { not: "Cancelado" },
          ...(actual ? { id: { not: actual.id } } : {}),
        },
      }))
    )
      throw new ErrorDeNegocio("Esta persona ya está registrada en la reserva.", 409);
    if (
      actual &&
      (await tx.ocupanteReserva.count({
        where: {
          responsableId: actual.id,
          reservaId,
          estado: { in: ["Previsto", "Alojado"] },
        },
      })) &&
      (!p.fechaNacimiento || edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD)
    )
      throw new ErrorDeNegocio("El responsable de menores debe conservar su condición de adulto.");
    await capacidad(tx, r, habitacionId, p, actual?.id);
    p.esTitular = data.esTitular === undefined ? Boolean(actual?.esTitular) : data.esTitular === true;
    if (p.esTitular && (!p.fechaNacimiento || edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD))
      throw new ErrorDeNegocio("El titular de habitacion debe tener 18 años cumplidos.");
    // Un solo titular activo por habitación. Reemplazar al que ya está se pide explícitamente
    // (motivoCambioTitular, o reemplazarTitular antes del check-in) y con la estadía en curso el
    // motivo es obligatorio. El anterior se desmarca en esta misma transacción.
    let titularReemplazado = null;
    const motivoCambioTitular = texto(data.motivoCambioTitular, "Motivo del cambio de titular", false, 500);
    if (p.esTitular) {
      const { titularActivo, errorTitularExistente } = require("./titularHabitacion");
      const otro = await titularActivo(tx, reservaId, habitacionId, actual?.id);
      if (otro) {
        const numero = r.reservaHabitaciones.find((h) => h.habitacionId === habitacionId)?.habitacion.numero;
        if (r.estado === "En curso" && !motivoCambioTitular)
          throw errorTitularExistente(ErrorDeNegocio, numero, otro, "Con la estadía en curso, para cambiarlo indicá el motivo.");
        if (!motivoCambioTitular && data.reemplazarTitular !== true)
          throw errorTitularExistente(ErrorDeNegocio, numero, otro, "Para cambiarlo, confirmá el reemplazo del titular.");
        await tx.ocupanteReserva.update({ where: { id: otro.id }, data: { esTitular: false } });
        titularReemplazado = otro;
      }
    }
    // Persona adicional con la estadía en curso: supera la ocupación registrada de la habitación.
    // Entra Alojada en el momento, con la vista previa del cargo confirmada (capacidad ya controlada).
    let adicional = null;
    if (!actual && r.estado === "En curso") {
      adicional = await personaAdicional.evaluar(tx, r, habitacionId, p, { ErrorDeNegocio });
      if (adicional) {
        validarCompleto({ ...p, ...residencia });
        if (
          p.responsableId &&
          !(await tx.ocupanteReserva.findFirst({ where: { id: p.responsableId, reservaId, estado: "Alojado" } }))
        )
          throw new ErrorDeNegocio("Primero debe ingresar el adulto responsable.");
        personaAdicional.exigirConfirmacion(adicional, data.confirmacionPersonaAdicional, ErrorDeNegocio);
      }
    }
    const personas = require("./persona.servicio");
    p.huespedId = await personas.vincularPersona(tx, r, p, actual);
    await personas.sincronizarNombres(tx, p.huespedId, p);
    await personas.actualizarResidencia(tx, p.huespedId, residencia);
    const anterior = actual?.asignaciones.find((a) => !a.hasta);
    const cambio = anterior && anterior.habitacionId !== habitacionId;
    if (cambio && !texto(data.motivo, "Motivo")) throw new ErrorDeNegocio("Indicá el motivo del cambio de habitación.");
    if (actual?.estado === "Alojado" && cambio) {
      const h = r.reservaHabitaciones.find((h) => h.habitacionId === habitacionId).habitacion;
      if (!["ocupada", "libre"].includes(h.estado))
        throw new ErrorDeNegocio("La habitación de destino no está disponible.");
    }
    // Una ficha Prevista vuelve a verificarse ante cualquier cambio. Una persona alojada, solo si
    // cambia su documento (los demás cambios quedan auditados en el historial).
    const reverificar = !alojado || cambiosDocumento.length > 0;
    const saved = actual
      ? await tx.ocupanteReserva.update({
          where: { id: actual.id },
          data: {
            ...p,
            ...(reverificar ? { verificadoEn: null, verificadoPor: null } : {}),
            ...(alojado && cambiosDocumento.length ? { identidadActiva: identidad(p) } : {}),
          },
        })
      : await tx.ocupanteReserva.create({
          data: {
            ...p,
            reservaId,
            ...(adicional
              ? {
                  estado: "Alojado",
                  ingresoReal: new Date(),
                  identidadActiva: identidad(p),
                  verificadoEn: new Date(),
                  verificadoPor: operador,
                }
              : {}),
          },
        });
    if (!anterior || cambio) {
      if (anterior)
        await tx.asignacionOcupanteHabitacion.update({
          where: { id: anterior.id },
          data: { hasta: new Date() },
        });
      await tx.asignacionOcupanteHabitacion.create({
        data: {
          ocupanteId: saved.id,
          habitacionId,
          motivo: texto(data.motivo, "Motivo"),
        },
      });
    }
    await evento(
      tx,
      reservaId,
      actual ? "Actualizar ocupante" : "Agregar ocupante",
      { ocupanteId: saved.id, habitacionId, cambio: Boolean(cambio) },
      operador,
    );
    if (adicional) {
      await evento(tx, reservaId, "ingresar", { ocupanteId: saved.id }, operador);
      await personaAdicional.aplicar(tx, r, adicional, saved, operador, evento);
    }
    if (cambiosDocumento.length)
      await evento(
        tx,
        reservaId,
        "Cambio de documento",
        {
          ocupanteId: saved.id,
          anterior: Object.fromEntries(CAMPOS_DOCUMENTO.map((k) => [k, actual[k] ?? null])),
          nuevo: Object.fromEntries(CAMPOS_DOCUMENTO.map((k) => [k, p[k] ?? null])),
          motivo: motivoCambioIdentidad,
        },
        operador,
      );
    if (cambiosPersonales.length)
      await evento(
        tx,
        reservaId,
        "Corrección de datos personales",
        {
          ocupanteId: saved.id,
          anterior: Object.fromEntries(cambiosPersonales.map((k) => [k, valorPersonal(actual[k])])),
          nuevo: Object.fromEntries(cambiosPersonales.map((k) => [k, valorPersonal(p[k])])),
        },
        operador,
      );
    if (titularReemplazado)
      await evento(
        tx,
        reservaId,
        "Cambio de titular de habitación",
        { habitacionId, anteriorId: titularReemplazado.id, ocupanteId: saved.id, motivo: motivoCambioTitular || null },
        operador,
      );
    return conResidencia(
      await tx.ocupanteReserva.findUnique({
        where: { id: saved.id },
        include: includePersona,
      }),
    );
  };
  return cliente ? ejecutar(cliente) : prisma.$transaction(ejecutar, OPCIONES_TRANSACCION);
}
function validarCompleto(p) {
  if (!String(p.nombre || "").trim() || !String(p.apellido || "").trim())
    throw new ErrorDeNegocio("Completá nombre y apellido del ocupante.");
  const { nacionalidad, paisResidencia } = conResidencia(p);
  if (!p.fechaNacimiento || !nacionalidad || !paisResidencia)
    throw new ErrorDeNegocio("Completá nacimiento, nacionalidad y país de residencia.");
  if (!(p.tipoDocumento && p.numeroDocumento && p.paisDocumento) && !p.motivoSinDocumento)
    throw new ErrorDeNegocio("Completá el documento y su país emisor o justificá la excepción.");
  if (edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD && !p.responsableId)
    throw new ErrorDeNegocio("El menor necesita un adulto responsable.");
  if (edad(p.fechaNacimiento, p.fechaDesde) < MAYORIA_EDAD && !p.vinculoResponsable)
    throw new ErrorDeNegocio("Indicá el vínculo del responsable con el menor.");
  if (requiereAutorizacion(p.vinculoResponsable) && !p.autorizacionPresentada)
    throw new ErrorDeNegocio("Falta la autorización de los padres o tutores del menor.");
}
async function accion(reservaId, ocupanteId, data) {
  reservaId = id(reservaId);
  return prisma.$transaction(async (tx) => {
    const r = await bloquear(tx, reservaId);
    const p = await tx.ocupanteReserva.findFirst({
      where: { id: id(ocupanteId), reservaId },
      include: includePersona,
    });
    if (!p) throw new ErrorDeNegocio("Ocupante inexistente.", 404);
    const operador = texto(data.operador, "Operador", true);
    let cambio = {};
    let adicional = null;
    if (data.accion === "verificar") {
      if (!["Previsto", "Alojado"].includes(p.estado)) throw new ErrorDeNegocio("Ocupante finalizado.");
      validarCompleto(p);
      cambio = { verificadoPor: operador, verificadoEn: new Date() };
    } else if (data.accion === "ingresar") {
      if (r.estado !== "En curso" || p.estado !== "Previsto" || !p.verificadoEn)
        throw new ErrorDeNegocio("Se requiere check-in de la reserva y datos verificados.");
      const hoy = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
      });
      if (hoy < p.fechaDesde.toISOString().slice(0, 10) || hoy >= p.fechaHasta.toISOString().slice(0, 10))
        throw new ErrorDeNegocio("El ingreso está fuera del período previsto.");
      validarCompleto(p);
      const a = p.asignaciones.find((a) => !a.hasta);
      await capacidad(tx, r, a.habitacionId, p, p.id);
      if (
        p.responsableId &&
        !(await tx.ocupanteReserva.findFirst({
          where: { id: p.responsableId, reservaId, estado: "Alojado" },
        }))
      )
        throw new ErrorDeNegocio("Primero debe ingresar el adulto responsable.");
      adicional = await personaAdicional.evaluar(tx, r, a.habitacionId, p, { excluirId: p.id, ErrorDeNegocio });
      if (adicional) personaAdicional.exigirConfirmacion(adicional, data.confirmacionPersonaAdicional, ErrorDeNegocio);
      cambio = {
        estado: "Alojado",
        ingresoReal: new Date(),
        identidadActiva: identidad(p),
      };
    } else if (data.accion === "retirar") {
      if (p.estado !== "Alojado") throw new ErrorDeNegocio("La persona no está alojada.");
      if (
        await tx.ocupanteReserva.count({
          where: { responsableId: p.id, reservaId, estado: "Alojado" },
        })
      )
        throw new ErrorDeNegocio("Retirá primero a los menores a cargo o asignales otro responsable.");
      cambio = {
        estado: "Retirado",
        salidaReal: new Date(),
        identidadActiva: null,
      };
    } else if (data.accion === "cancelar") {
      if (p.estado !== "Previsto") throw new ErrorDeNegocio("Solo se cancela un ingreso pendiente.");
      if (
        await tx.ocupanteReserva.count({
          where: {
            responsableId: p.id,
            reservaId,
            estado: { in: ["Previsto", "Alojado"] },
          },
        })
      )
        throw new ErrorDeNegocio("Hay menores a cargo.");
      cambio = { estado: "Cancelado" };
    } else throw new ErrorDeNegocio("Acción inválida.");
    await tx.ocupanteReserva.update({ where: { id: p.id }, data: cambio });
    if (["retirar", "cancelar"].includes(data.accion))
      await tx.asignacionOcupanteHabitacion.updateMany({
        where: { ocupanteId: p.id, hasta: null },
        data: { hasta: new Date() },
      });
    await evento(tx, reservaId, data.accion, { ocupanteId: p.id }, operador);
    if (adicional) await personaAdicional.aplicar(tx, r, adicional, p, operador, evento);
    // Salida anticipada de una persona adicional: se anulan los cargos de las noches que no usa.
    if (data.accion === "retirar") {
      await personaAdicional.anularNochesNoUsadas(tx, reservaId, p.id, operador);
      await personaAdicional.ajustarOcupacionPorSalida(tx, r, p.id, operador, evento);
    }
    return { ok: true };
  }, OPCIONES_TRANSACCION);
}
async function alojados(q = "") {
  const personas = await prisma.ocupanteReserva.findMany({
    where: {
      estado: "Alojado",
      ...(q
        ? {
            OR: [{ nombre: { contains: q } }, { apellido: { contains: q } }, { numeroDocumento: { contains: q } }],
          }
        : {}),
    },
    include: {
      ...includePersona,
      reserva: {
        select: {
          codigoConfirmacion: true,
          reservaHabitaciones: { include: { habitacion: true } },
        },
      },
    },
    orderBy: { apellido: "asc" },
    take: 500,
  });
  return personas.map(conResidencia);
}
async function historial(reservaId) {
  return prisma.eventoEstadia.findMany({
    where: { reservaId: id(reservaId) },
    orderBy: { id: "desc" },
    take: 200,
  });
}
module.exports = {
  identidad,
  CAMPOS_RESIDENCIA,
  conResidencia,
  sacarResidencia,
  includePersona,
  verificarCapacidad,
  idValido: id,
  ErrorDeNegocio,
  normalizarPersona,
  validarVinculo,
  edad,
  validarCompleto,
  bloquear,
  evento,
  listar,
  guardar,
  accion,
  alojados,
  historial,
};
