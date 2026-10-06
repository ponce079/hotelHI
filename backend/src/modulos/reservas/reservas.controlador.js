const reservasServicio = require("./reservas.servicio");

// Solo un administrador con sesión puede corregir el nombre de un huésped ya registrado: el
// valor que mande el cliente se ignora y lo decide la sesión.
function conPermisoDeCorreccion(req) {
  const cuerpo = req.body;
  if (!cuerpo || typeof cuerpo !== "object" || !cuerpo.huesped || typeof cuerpo.huesped !== "object") return cuerpo;
  const pedido = cuerpo.huesped.corregirNombre === true;
  return { ...cuerpo, huesped: { ...cuerpo.huesped, corregirNombre: pedido && req.usuarioActual?.rol === "admin" } };
}

function responderError(res, err, contexto, mensaje) {
  if (err instanceof reservasServicio.ErrorDeNegocio) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.codigo ? { codigo: err.codigo } : {}) });
  }
  console.error(contexto, err);
  return res.status(500).json({ error: mensaje });
}

// HU-38 — consulta pública de disponibilidad por fecha y tipo. Va antes
// que getReservaPorId en el router: si no, "/disponibilidad" entraría por
// "/:id" y fallaría pidiendo un id numérico.
async function getDisponibilidad(req, res) {
  try {
    return res.json(await reservasServicio.consultarDisponibilidad(req.query));
  } catch (err) {
    return responderError(res, err, "Error al consultar disponibilidad:", "No se pudo consultar la disponibilidad.");
  }
}

async function getReservas(req, res) {
  try {
    return res.json(await reservasServicio.listarReservas(req.query));
  } catch (err) {
    return responderError(res, err, "Error al listar reservas:", "No se pudieron listar las reservas.");
  }
}

async function getReservaPorCodigo(req, res) {
  try {
    return res.json(await reservasServicio.obtenerPorCodigoConfirmacion(req.params.codigo));
  } catch (err) {
    return responderError(res, err, "Error al buscar la reserva por código:", "No se pudo buscar la reserva.");
  }
}

async function getReservaPorId(req, res) {
  try {
    return res.json(await reservasServicio.obtenerReserva(req.params.id));
  } catch (err) {
    return responderError(res, err, "Error al obtener la reserva:", "No se pudo obtener la reserva.");
  }
}

// HU-36 (alta asistida por recepcionista) y HU-40 (autoservicio web): el
// mismo endpoint y la misma validación de disponibilidad para los dos
// canales, sin duplicar lógica — la pantalla pública manda origen: "WEB"
// y eso solo cambia el texto de la confirmación.
// HU-95 (regla 5) — cotización previa a confirmar un alta o una
// modificación (mostrador o web), sin persistir nada.
async function postCotizar(req, res) {
  try {
    return res.json(await reservasServicio.cotizarParaReserva(req.body));
  } catch (err) {
    return responderError(res, err, "Error al cotizar la reserva:", "No se pudo cotizar la reserva.");
  }
}

async function postReserva(req, res) {
  try {
    return res.status(201).json(await reservasServicio.crearReserva(conPermisoDeCorreccion(req)));
  } catch (err) {
    return responderError(res, err, "Error al crear la reserva:", "No se pudo crear la reserva.");
  }
}

// Alta de reserva CON garantía (tarjeta de crédito o prepago). Reemplaza a la
// seña. El body trae la tarjeta (se valida y NO se guarda) en
// `garantia.tarjeta`; este controlador nunca la escribe en logs.
async function postReservaConGarantia(req, res) {
  try {
    return res.status(201).json(await reservasServicio.crearReservaConGarantia(conPermisoDeCorreccion(req)));
  } catch (err) {
    return responderError(res, err, "Error al crear la reserva con garantía:", "No se pudo crear la reserva.");
  }
}

async function patchReserva(req, res) {
  try {
    return res.json(await reservasServicio.modificarReserva(req.params.id, conPermisoDeCorreccion(req)));
  } catch (err) {
    return responderError(res, err, "Error al modificar la reserva:", "No se pudo modificar la reserva.");
  }
}

async function postCancelar(req, res) {
  try {
    return res.json(await reservasServicio.cancelarReserva(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al cancelar la reserva:", "No se pudo cancelar la reserva.");
  }
}

// Llegadas no presentadas y marca de no-show (garantía con tarjeta). Mueven
// dinero (cobran la penalidad), así que las rutas exigen sesión de personal.
async function getNoShowPendientes(_req, res) {
  try {
    return res.json(await reservasServicio.listarNoShowPendientes());
  } catch (err) {
    return responderError(res, err, "Error al listar las llegadas no presentadas:", "No se pudo listar los no-show.");
  }
}

async function getCierrePrevio(req, res) {
  try {
    return res.json(await reservasServicio.previsualizarCierreReserva(req.params.id, req.query.tipo));
  } catch (err) {
    return responderError(res, err, "Error al calcular la vista previa:", "No se pudo calcular la vista previa.");
  }
}

// Resumen de las garantías de la reserva (la de la reserva y la del check-in),
// sin token ni referencias internas. Lo usan el check-in (¿hay tarjeta guardada?)
// y el detalle de la reserva.
async function getGarantias(req, res) {
  try {
    const reservaId = Number(req.params.id);
    if (!Number.isInteger(reservaId) || reservaId <= 0) {
      return res.status(400).json({ error: "id debe ser un entero positivo." });
    }
    return res.json(await require("../garantias/garantiaEstadia.servicio").obtenerResumenGarantias(reservaId));
  } catch (err) {
    return responderError(res, err, "Error al consultar las garantías:", "No se pudieron consultar las garantías.");
  }
}

// Usa la garantía del check-in para cubrir el saldo en el check-out (captura la
// preautorización hasta el saldo, o aplica el depósito en efectivo).
async function postAplicarGarantia(req, res) {
  try {
    const reservaId = Number(req.params.id);
    if (!Number.isInteger(reservaId) || reservaId <= 0) {
      return res.status(400).json({ error: "id debe ser un entero positivo." });
    }
    const servicio = require("../garantias/garantiaEstadiaCheckOut.servicio");
    return res.json(await servicio.aplicarGarantiaAlSaldo(reservaId));
  } catch (err) {
    // El módulo de garantías tiene su propia clase de error (mismo patrón que pagoEstadia).
    if (err?.statusCode && err.constructor?.name === "ErrorDeNegocio") {
      return res.status(err.statusCode).json({ error: err.message });
    }
    return responderError(res, err, "Error al usar la garantía:", "No se pudo usar la garantía.");
  }
}

async function postNoShow(req, res) {
  try {
    return res.json(await reservasServicio.marcarNoShow(req.params.id, req.body));
  } catch (err) {
    return responderError(res, err, "Error al marcar el no-show:", "No se pudo marcar el no-show.");
  }
}

// Etapa 4B (HU-97) — primer endpoint de reservas con auth en el backend de
// verdad (ver requiereSesion/requiereRol en la ruta, reservas.routes.js):
// modifica importes a cobrar, así que `ajustadoPor` sale SIEMPRE de la
// sesión autenticada (req.usuarioActual), nunca de lo que mande el body —
// si el body trae `usuario`, se ignora acá mismo, antes de llegar al
// servicio.
async function postAjustePrecio(req, res) {
  try {
    const payload = { ...req.body, usuario: req.usuarioActual.usuario };
    return res.json(await reservasServicio.ajustarPrecioReserva(req.params.id, payload));
  } catch (err) {
    return responderError(res, err, "Error al ajustar el precio de la reserva:", "No se pudo ajustar el precio.");
  }
}

// Etapa 4B (HU-98) — solo lectura, visible para recepcionista/gerente/admin
// (sin requiereRol acá: a diferencia del ajuste de precio, consultar la
// penalidad no cobra ni modifica nada).
async function getPenalidad(req, res) {
  try {
    return res.json(await reservasServicio.obtenerPenalidad(req.params.id, req.query.tipo));
  } catch (err) {
    return responderError(res, err, "Error al calcular la penalidad:", "No se pudo calcular la penalidad.");
  }
}

module.exports = {
  getDisponibilidad,
  getReservas,
  getReservaPorCodigo,
  getReservaPorId,
  postCotizar,
  postReserva,
  postReservaConGarantia,
  patchReserva,
  postCancelar,
  getNoShowPendientes,
  getCierrePrevio,
  getGarantias,
  postAplicarGarantia,
  postNoShow,
  postAjustePrecio,
  getPenalidad,
};
