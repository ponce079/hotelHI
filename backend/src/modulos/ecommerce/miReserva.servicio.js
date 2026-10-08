// "Mi reserva" REAL (HU-104): consulta con código + email y cancelación
// online (con o sin cargo). Sin cuentas de huésped.
//
// Seguridad de la consulta:
//   - código o email con formato inválido, código inexistente, email que no
//     coincide o reserva del mostrador sin email → SIEMPRE el mismo 404
//     NO_ENCONTRADA, con el mismo mensaje;
//   - la búsqueda en la base se hace igual en todos los casos (con un código
//     imposible si el formato no sirve) y el email se compara en tiempo
//     constante;
//   - toda respuesta (encontrada o no) espera hasta un piso de 400 ms desde
//     que llegó el pedido, para que el tiempo no delate si el código existe.
//
// La cancelación online está en miReserva.cancelacion.js.
const prisma = require("../../lib/prisma");
const { calcularPenalidad } = require("../tarifas/penalidades.servicio");
const reservasServicio = require("../reservas/reservas.servicio");
const { CONCEPTO_PAGO_ANTICIPADO } = require("../garantias/garantias.constantes");
const { ErrorWeb, CODIGO } = require("./ecommerce.errores");
const {
  normalizarCodigo,
  normalizarEmail,
  codigoValido,
  emailValido,
  emailDeLaReserva,
  mismoEmail,
  evaluarCancelacion,
  llegadaSuperada,
  armarRespuestaMiReserva,
} = require("./miReserva");

const PISO_RESPUESTA_MS = 400;
const CODIGO_IMPOSIBLE = "--------"; // nunca coincide con un código real (8 hexadecimales)

const INCLUDE_MI_RESERVA = {
  huesped: { select: { nombre: true, nombres: true, apellido: true, numeroDocumento: true, contacto: true } },
  planTarifario: {
    select: { codigo: true, nombre: true, reembolsable: true, horasCancelacionSinCargo: true, penalidadNoShow: true },
  },
  reservaHabitaciones: {
    select: {
      id: true,
      adultos: true,
      menores: true,
      habitacion: { select: { tipoHabitacion: { select: { nombre: true } } } },
      reservaNoches: { select: { precioNoche: true } },
    },
  },
  pagosEstadia: { select: { anulado: true, concepto: true, medios: { select: { importe: true } } } },
  datosWeb: { select: { emailContacto: true } },
  garantiaReserva: { select: { tipo: true, marca: true, ultimos4: true } },
};

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

// Corre `fn` y, salga bien o mal, responde recién cuando pasaron al menos
// PISO_RESPUESTA_MS desde `inicio`.
async function conPiso(fn, piso = PISO_RESPUESTA_MS) {
  const inicio = Date.now();
  let resultado;
  let error;
  try {
    resultado = await fn();
  } catch (err) {
    error = err;
  }
  const falta = piso - (Date.now() - inicio);
  if (falta > 0) await esperar(falta);
  if (error) throw error;
  return resultado;
}

function noEncontrada() {
  return new ErrorWeb(404, CODIGO.NO_ENCONTRADA);
}

async function buscarReserva(cuerpo) {
  const codigo = normalizarCodigo(cuerpo?.codigo);
  const email = normalizarEmail(cuerpo?.email);
  const formatoValido = codigoValido(codigo) && emailValido(email);
  const reserva = await prisma.reserva.findUnique({
    where: { codigoConfirmacion: formatoValido ? codigo : CODIGO_IMPOSIBLE },
    include: INCLUDE_MI_RESERVA,
  });
  const emailReserva = reserva ? emailDeLaReserva(reserva) : null;
  const coincide = mismoEmail(emailReserva ?? "", email);
  if (!formatoValido || !reserva || !emailReserva || !coincide) throw noEncontrada();
  return { reserva, emailReserva };
}

async function evaluar(reserva, ahora = new Date()) {
  let penalidad = null;
  let liquidacion = null;
  if (reserva.estado === "Confirmada") {
    try {
      penalidad = await calcularPenalidad({ reservaId: reserva.id, tipo: "CANCELACION", momento: ahora });
    } catch {
      // Sin penalidad calculable (por ejemplo, sin plan): no se cancela online.
      penalidad = null;
    }
    // Con cargo (y antes de la hora límite) se pide la liquidación a Ricardo: previsualizarCierre envuelve a
    // calcularPenalidad y reparte lo ya pagado, lo que se cobra a la tarjeta y lo que no se puede cobrar.
    if (penalidad?.aplica && Number(penalidad.monto) > 0 && !llegadaSuperada(reserva.fechaDesde, ahora)) {
      try {
        liquidacion = await reservasServicio.previsualizarCierreReserva(reserva.id, "CANCELACION");
      } catch {
        liquidacion = null;
      }
    }
  }
  return evaluarCancelacion(
    {
      estado: reserva.estado,
      fechaDesde: reserva.fechaDesde,
      // Sin cargo, cualquier pago activo (por ejemplo, una seña) se resuelve en recepción. El "Pago anticipado" no
      // cuenta acá: solo existe en tarifas no reembolsables, que siempre tienen cargo (se decide con la liquidación).
      tienePagosActivos: (reserva.pagosEstadia ?? []).some((p) => !p.anulado && p.concepto !== CONCEPTO_PAGO_ANTICIPADO),
    },
    penalidad,
    ahora,
    liquidacion
  );
}

// POST /api/web/mi-reserva
function consultarMiReserva(cuerpo) {
  return conPiso(async () => {
    const { reserva } = await buscarReserva(cuerpo);
    return armarRespuestaMiReserva(reserva, await evaluar(reserva));
  });
}

module.exports = {
  consultarMiReserva,
  buscarReserva,
  evaluar,
  conPiso,
  PISO_RESPUESTA_MS,
  INCLUDE_MI_RESERVA,
};
