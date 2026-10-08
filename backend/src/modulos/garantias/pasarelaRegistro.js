// Registro persistente de la pasarela SIMULADA (tabla pasarela_operaciones, modelo PasarelaOperacion).
//
// Es lo que un proveedor real guardaría de su lado: cada operación con su idempotencia y el estado de cada
// preautorización. Cambia el ALMACENAMIENTO de la simulación (antes, una caché en memoria), no las reglas de
// negocio. NUNCA guarda el número completo de la tarjeta ni el CVV.
//
// Se llama siempre desde la pasarela, que a su vez se llama FUERA de las transacciones de negocio. La
// transición de estado de una preautorización y la fila de la operación que la causa se escriben juntas en
// una transacción propia y corta (del registro, no del negocio).
const { Prisma } = require("@prisma/client");
const prisma = require("../../lib/prisma");
const { OPCIONES_TRANSACCION } = require("../../lib/constantes");

function esUnicoDuplicado(err) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// Qué índice único chocó: "clave" (claveIdempotencia) o "referencia".
function campoDuplicado(err) {
  const destino = JSON.stringify(err.meta ?? {});
  return destino.includes("claveIdempotencia") ? "clave" : "referencia";
}

async function buscarPorClave(claveIdempotencia) {
  return prisma.pasarelaOperacion.findUnique({ where: { claveIdempotencia } });
}

async function buscarPreautorizacion(referencia) {
  return prisma.pasarelaOperacion.findFirst({
    where: { referencia, operacion: "PREAUTORIZACION", aprobada: true },
  });
}

// Inserta una fila. Devuelve { creada: true, fila } o { creada: false, duplicado: "clave" | "referencia" }.
async function crear(datos) {
  try {
    return { creada: true, fila: await prisma.pasarelaOperacion.create({ data: datos }) };
  } catch (err) {
    if (esUnicoDuplicado(err)) return { creada: false, duplicado: campoDuplicado(err) };
    throw err;
  }
}

// Mueve una preautorización de un estado a otro (SOLO si sigue en `desde`) y registra la operación que lo causa,
// todo junto. Devuelve { creada: true, fila } o { creada: false, duplicado: "estado" | "clave" | "referencia" }
// ("estado": alguien la movió antes; no se escribe nada).
async function transicionarYCrear({ referencia, desde, hasta, montoCapturado }, datos) {
  try {
    return await prisma.$transaction(async (tx) => {
      const { count } = await tx.pasarelaOperacion.updateMany({
        where: { referencia, operacion: "PREAUTORIZACION", aprobada: true, estadoPreautorizacion: desde },
        data: { estadoPreautorizacion: hasta, ...(montoCapturado !== undefined ? { montoCapturado } : {}) },
      });
      if (count !== 1) return { creada: false, duplicado: "estado" };
      return { creada: true, fila: await tx.pasarelaOperacion.create({ data: datos }) };
    }, OPCIONES_TRANSACCION);
  } catch (err) {
    if (esUnicoDuplicado(err)) return { creada: false, duplicado: campoDuplicado(err) };
    throw err;
  }
}

module.exports = { buscarPorClave, buscarPreautorizacion, crear, transicionarYCrear };
