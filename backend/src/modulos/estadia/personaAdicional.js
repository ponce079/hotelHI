// Persona adicional con la estadía en curso (decisión de negocio: cargo en la cuenta de la
// habitación, SIN recotizar la reserva).
//
// Aplica a "Agregar persona" y a "Registrar ingreso" cuando, con esta persona, la habitación supera
// la ocupación registrada (ReservaHabitacion.adultos + menores). La persona entra Alojada en el
// momento, después de una vista previa obligatoria confirmada con un token (mismo patrón que la
// ampliación del check-in):
//   - adulto (EDAD_ADULTO_OCUPACION o más): por cada noche desde hoy hasta la anterior a la salida,
//     precio de la habitación con ocupación + 1 menos precio con la ocupación registrada, con el plan
//     de la reserva y las tarifas vigentes hoy (motor de cotización existente, sin modificarlo). Las
//     noches con diferencia se cargan en la cuenta de la habitación como "Persona adicional — …";
//   - menor: sin cargo.
// La estadía mínima y el cierre a llegadas (restricciones de venta) no aplican a este cálculo.
// La ocupación registrada de la habitación se actualiza; ReservaNoche no se toca (precio congelado).
// En la salida anticipada se anulan (baja lógica) los cargos de las noches que no se usan.
const { createHash } = require("node:crypto");
const { Prisma } = require("@prisma/client");
const { EDAD_ADULTO_OCUPACION, edadEn, hoyComoFechaUTC } = require("../../lib/fechas");
const { cotizarReserva } = require("../tarifas/cotizacion.servicio");
const cargos = require("../servicios-adicionales/serviciosAdicionales.servicio");

const CODIGO_CONFIRMACION = "PERSONA_ADICIONAL_REQUIERE_CONFIRMACION";
const iso = (d) => d.toISOString().slice(0, 10);
const prefijoClave = (ocupanteId) => `persona-adicional:${ocupanteId}:`;
// Mediodía en Argentina de la fecha de la noche: el día del cargo es esa fecha en hora local.
const mediodiaArgentina = (fecha) => new Date(`${fecha}T12:00:00-03:00`);

// Devuelve null si la persona no supera la ocupación registrada; si la supera, la vista previa.
async function evaluar(tx, r, habitacionId, persona, { excluirId = null, ErrorDeNegocio }) {
  if (r.estado !== "En curso") return null;
  const rh = r.reservaHabitaciones.find((h) => h.habitacionId === habitacionId);
  if (!rh) return null;
  const presentes = await tx.ocupanteReserva.count({
    where: {
      reservaId: r.id,
      estado: { in: ["Previsto", "Alojado"] },
      ...(excluirId ? { id: { not: excluirId } } : {}),
      asignaciones: { some: { habitacionId, hasta: null } },
    },
  });
  if (presentes + 1 <= rh.adultos + rh.menores) return null;

  const hoy = hoyComoFechaUTC();
  const adulto = !persona.fechaNacimiento || edadEn(persona.fechaNacimiento, hoy) >= EDAD_ADULTO_OCUPACION;
  const actual = { adultos: rh.adultos, menores: rh.menores };
  const nueva = adulto ? { adultos: rh.adultos + 1, menores: rh.menores } : { adultos: rh.adultos, menores: rh.menores + 1 };
  let noches = [];
  if (adulto && hoy < r.fechaHasta) {
    let cotizacion;
    try {
      cotizacion = await cotizarReserva(
        {
          fechaDesde: iso(hoy),
          fechaHasta: iso(r.fechaHasta),
          planTarifarioId: r.planTarifarioId,
          habitaciones: [
            { habitacionId, ...actual },
            { habitacionId, ...nueva },
          ],
          canal: "RECEPCION",
          fechaVenta: iso(hoy),
        },
        tx,
        { ignorarRestriccionesVenta: true },
      );
    } catch (e) {
      if (e.statusCode) throw new ErrorDeNegocio(`No se pudo calcular el cargo de la persona adicional: ${e.message}`, 409);
      throw e;
    }
    const [conActual, conNueva] = cotizacion.planes[0].habitaciones;
    const precioActual = new Map(conActual.detalle.map((n) => [n.fecha, n.precioNoche]));
    noches = conNueva.detalle.map((n) => {
      const diferencia = new Prisma.Decimal(n.precioNoche).minus(precioActual.get(n.fecha) ?? 0).toDecimalPlaces(2);
      return { fecha: n.fecha, diferencia: Prisma.Decimal.max(diferencia, 0).toNumber() };
    });
  }
  const total = noches.reduce((acc, n) => acc.plus(n.diferencia), new Prisma.Decimal(0)).toNumber();
  const vista = {
    habitacionId,
    numero: rh.habitacion?.numero ?? null,
    categoria: adulto ? "adulto" : "menor",
    ocupacionActual: actual,
    ocupacionNueva: nueva,
    noches,
    nochesConCargo: noches.filter((n) => n.diferencia > 0).length,
    total,
  };
  const huella = { reservaId: r.id, persona: [persona.tipoDocumento, persona.numeroDocumento, persona.nombre, persona.apellido], ...vista };
  return { ...vista, token: createHash("sha256").update(JSON.stringify(huella)).digest("hex") };
}

// Sin la confirmación de ESTA vista previa (mismo token), 409 con la vista previa en el detalle.
function exigirConfirmacion(vista, confirmacion, ErrorDeNegocio) {
  if (confirmacion === vista.token) return;
  const error = new ErrorDeNegocio(
    "Esta persona supera la ocupación registrada de la habitación. Revisá y confirmá el cargo para continuar.",
    409,
  );
  error.codigo = CODIGO_CONFIRMACION;
  error.detalle = vista;
  throw error;
}

// Ocupación registrada + cargos por noche + evento. Se ejecuta en la transacción del alta o del ingreso.
async function aplicar(tx, r, vista, ocupante, operador, evento) {
  const rh = r.reservaHabitaciones.find((h) => h.habitacionId === vista.habitacionId);
  await tx.reservaHabitacion.update({ where: { id: rh.id }, data: vista.ocupacionNueva });
  const nombre = `${ocupante.nombre} ${ocupante.apellido}`.trim();
  const conCargo = vista.noches.filter((n) => n.diferencia > 0);
  if (conCargo.length)
    await cargos.registrarCargosEnTransaccion(tx, {
      reservaId: r.id,
      habitacionId: vista.habitacionId,
      tipoServicio: "Otro",
      registradoPor: operador,
      cargos: conCargo.map((n) => ({
        fechaServicio: mediodiaArgentina(n.fecha),
        precioUnitario: n.diferencia,
        descripcion: `Persona adicional — ${nombre}`,
        claveOperacion: `${prefijoClave(ocupante.id)}${n.fecha}`,
      })),
    });
  await evento(
    tx,
    r.id,
    "Persona adicional",
    {
      ocupanteId: ocupante.id,
      habitacionId: vista.habitacionId,
      categoria: vista.categoria,
      noches: conCargo.length,
      monto: vista.total,
    },
    operador,
  );
}

// Salida anticipada: anula los cargos "Persona adicional" de las noches desde hoy (no usadas).
async function anularNochesNoUsadas(tx, reservaId, ocupanteId, operador) {
  return cargos.anularCargosEnTransaccion(tx, {
    reservaId,
    claveOperacionPrefijo: prefijoClave(ocupanteId),
    fechaServicioDesde: new Date(`${iso(hoyComoFechaUTC())}T00:00:00-03:00`),
    motivo: "Salida anticipada",
    operador,
  });
}

// Evento "Persona adicional" de este ocupante (el registro de que entró por encima de la ocupación).
async function ingresoComoAdicional(tx, reservaId, ocupanteId) {
  const ev = await tx.eventoEstadia.findFirst({
    where: { reservaId, accion: "Persona adicional", detalle: { startsWith: `{"ocupanteId":${ocupanteId},` } },
    orderBy: { id: "desc" },
  });
  return ev ? JSON.parse(ev.detalle) : null;
}

// Salida anticipada de una persona adicional: la ocupación registrada de la habitación en la que
// se sumó baja en 1 (adulto o menor, según cómo entró). Si la persona era de la reserva original,
// la ocupación no cambia: el precio congelado de la reserva no se reintegra.
async function ajustarOcupacionPorSalida(tx, r, ocupanteId, operador, evento) {
  if (hoyComoFechaUTC() >= r.fechaHasta) return null;
  const ingreso = await ingresoComoAdicional(tx, r.id, ocupanteId);
  if (!ingreso) return null;
  const rh = await tx.reservaHabitacion.findFirst({ where: { reservaId: r.id, habitacionId: ingreso.habitacionId } });
  if (!rh) return null;
  const campo = ingreso.categoria === "menor" ? "menores" : "adultos";
  if (rh[campo] - 1 < (campo === "adultos" ? 1 : 0)) return null;
  const anterior = { adultos: rh.adultos, menores: rh.menores };
  const nueva = { ...anterior, [campo]: rh[campo] - 1 };
  await tx.reservaHabitacion.update({ where: { id: rh.id }, data: { [campo]: nueva[campo] } });
  await evento(
    tx,
    r.id,
    "Ocupación ajustada",
    {
      ocupanteId,
      habitacionId: ingreso.habitacionId,
      ocupacionAnterior: anterior,
      ocupacionNueva: nueva,
      motivo: "Salida anticipada de una persona adicional",
    },
    operador,
  );
  return nueva;
}

module.exports = {
  evaluar,
  exigirConfirmacion,
  aplicar,
  anularNochesNoUsadas,
  ingresoComoAdicional,
  ajustarOcupacionPorSalida,
  CODIGO_CONFIRMACION,
  prefijoClave,
};
