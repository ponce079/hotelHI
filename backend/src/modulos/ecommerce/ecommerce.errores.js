// Errores del e-commerce (/api/web) con la forma única del contrato
// (docs/ecommerce/CONTRATO.md → Errores): { error, codigo, ...extra }.
const reservasServicio = require("../reservas/reservas.servicio");
const cotizacionServicio = require("../tarifas/cotizacion.servicio");
const { esEsperaConexion } = require("../../lib/erroresConexion");

const CODIGO = {
  DATOS_INVALIDOS: "DATOS_INVALIDOS",
  SIN_DISPONIBILIDAD: "SIN_DISPONIBILIDAD",
  PRECIO_CAMBIADO: "PRECIO_CAMBIADO",
  CLAVE_REUTILIZADA: "CLAVE_REUTILIZADA",
  PAGO_RECHAZADO: "PAGO_RECHAZADO",
  TARJETA_VENCE_ANTES: "TARJETA_VENCE_ANTES",
  ERROR_INTERNO: "ERROR_INTERNO",
};

const MENSAJE_GENERICO = {
  [CODIGO.DATOS_INVALIDOS]: "Revisá los datos ingresados.",
  [CODIGO.SIN_DISPONIBILIDAD]: "Sin disponibilidad para estas fechas.",
  [CODIGO.PRECIO_CAMBIADO]: "El precio de tu selección cambió. Revisá el total nuevo antes de confirmar.",
  [CODIGO.CLAVE_REUTILIZADA]: "Este pedido ya se usó con otros datos. Volvé a intentarlo.",
  [CODIGO.PAGO_RECHAZADO]: "La tarjeta fue rechazada. Probá con otra tarjeta.",
  [CODIGO.TARJETA_VENCE_ANTES]: "La tarjeta vence antes de la fecha de salida. Usá otra tarjeta.",
  [CODIGO.ERROR_INTERNO]: "No pudimos completar la operación. Intentá de nuevo en unos minutos.",
};

class ErrorWeb extends Error {
  constructor(status, codigo, mensaje, extra = {}) {
    super(mensaje ?? MENSAJE_GENERICO[codigo]);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra;
  }
}

function datosInvalidos(campo, mensaje) {
  return new ErrorWeb(400, CODIGO.DATOS_INVALIDOS, mensaje, { campo });
}

// Lo que nunca puede llegar al huésped es un dato concreto de OTRA persona:
// el número de una habitación ("habitación 204", "hab. 050") o un código de
// reserva (8 hexadecimales, el formato de generarCodigoConfirmacion). Las
// palabras "habitación" o "reserva" solas no se filtran: esconderían motivos
// útiles como "La estadía mínima para esta reserva es de 3 noches".
const PATRON_NUMERO_HABITACION = /\b(habitaci[oó]n(es)?(\/es)?|hab\.?)\s*(n[°º.]?\s*)?\d{2,4}\b/i;
const PATRON_CODIGO_RESERVA = /\b[0-9A-F]{8}\b/;

function esMensajeSeguro(mensaje) {
  const texto = String(mensaje ?? "").trim();
  return texto !== "" && !PATRON_NUMERO_HABITACION.test(texto) && !PATRON_CODIGO_RESERVA.test(texto);
}

function mensajeSeguro(mensaje, generico) {
  return esMensajeSeguro(mensaje) ? String(mensaje).trim() : generico;
}

function esErrorDeNegocio(err) {
  return err instanceof reservasServicio.ErrorDeNegocio || err instanceof cotizacionServicio.ErrorDeNegocio;
}

// Traduce cualquier error a un ErrorWeb. `contexto.origen` ("cotizar" |
// "alta") queda preparado para la 1B-2: ahí el 409 de
// crearReservaEnTransaccion (el precio cambió) va a ser PRECIO_CAMBIADO.
// SIN_DISPONIBILIDAD lo arma el servicio solo cuando no hay habitación
// libre; un 409 del motor con mensaje seguro (estadía mínima, cierre a
// llegadas) se informa con ese mensaje.
function traducirError(err, contexto = {}) {
  if (err instanceof ErrorWeb) return err;
  if (esEsperaConexion(err)) {
    return new ErrorWeb(503, CODIGO.ERROR_INTERNO, "El sistema está ocupado. Intentá de nuevo en unos segundos.", {
      reintentarEn: 3,
    });
  }
  if (esErrorDeNegocio(err)) {
    // En el alta, un 409 de crearReservaEnTransaccion es un cambio de precio:
    // nunca se reenvía su mensaje (puede nombrar reservas ajenas). El
    // servicio del alta lo recotiza afuera para sumar totalNuevo; esto es la
    // red por si llega sin recotizar.
    if (contexto.origen === "alta" && err.statusCode === 409) {
      return new ErrorWeb(409, CODIGO.PRECIO_CAMBIADO);
    }
    // El resto de los errores de negocio 4xx (incluido un 409 del motor por
    // estadía mínima o cierre a llegadas) es DATOS_INVALIDOS con su mensaje,
    // si es seguro.
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return new ErrorWeb(
        400,
        CODIGO.DATOS_INVALIDOS,
        mensajeSeguro(err.message, MENSAJE_GENERICO[CODIGO.DATOS_INVALIDOS])
      );
    }
  }
  return null;
}

// Responde el error con la forma del contrato. Un error inesperado se
// loguea en el servidor (mensaje y stack; nunca el body ni el request).
function responderError(res, err, contexto = {}) {
  const web = traducirError(err, contexto);
  if (!web) {
    console.error("[ecommerce] Error inesperado:", err?.message, err?.stack);
    return res.status(500).json({ error: MENSAJE_GENERICO[CODIGO.ERROR_INTERNO], codigo: CODIGO.ERROR_INTERNO });
  }
  return res.status(web.status).json({ error: web.message, codigo: web.codigo, ...web.extra });
}

module.exports = {
  CODIGO,
  MENSAJE_GENERICO,
  ErrorWeb,
  datosInvalidos,
  esMensajeSeguro,
  mensajeSeguro,
  traducirError,
  responderError,
};
