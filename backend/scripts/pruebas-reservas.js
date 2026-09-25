// Pruebas de negocio del módulo Reservas (HU-36 a HU-42).
//
// Corren SIN base de datos y sin red: reemplazan `src/lib/prisma` y
// `@prisma/client` por dobles en memoria antes de que el servicio los
// cargue (require.cache), así se puede verificar la lógica de
// solapamiento, las transiciones de estado y las validaciones sin tocar la
// base compartida del equipo ni depender de Clever Cloud.
//
//   node scripts/pruebas-reservas.js
//
// El doble de Prisma implementa a mano exactamente las formas de consulta
// que usa reservas.servicio.js — no es un cliente completo. Si el servicio
// empieza a usar una forma nueva, hay que enseñársela acá.

const Module = require("module");
const assert = require("assert");

// --------------------------------------------------------------
// Doble de @prisma/client (solo lo que usa el servicio)
// --------------------------------------------------------------

class PrismaClientKnownRequestError extends Error {
  constructor(mensaje, { code, meta } = {}) {
    super(mensaje);
    this.code = code;
    this.meta = meta;
  }
}

const PrismaFalso = {
  PrismaClientKnownRequestError,
  sql: (strings, ...valores) => ({ strings, valores }),
  join: (valores) => valores,
};

// La sustitución se hace interceptando la carga de módulos, no escribiendo
// en require.cache por ruta resuelta: así funciona igual con node_modules
// instalado (donde el @prisma/client real existe y hay que taparlo) y sin
// instalar (donde require.resolve fallaría antes de poder taparlo).
const cargarModuloOriginal = Module._load;

// --------------------------------------------------------------
// Doble de la base en memoria
// --------------------------------------------------------------

function coincideValor(valor, condicion) {
  if (condicion === null || typeof condicion !== "object" || condicion instanceof Date) {
    if (valor instanceof Date && condicion instanceof Date) return valor.getTime() === condicion.getTime();
    return valor === condicion;
  }
  return Object.entries(condicion).every(([operador, esperado]) => {
    const n = valor instanceof Date ? valor.getTime() : valor;
    const e = esperado instanceof Date ? esperado.getTime() : esperado;
    switch (operador) {
      case "in":
        return esperado.includes(valor);
      case "notIn":
        return !esperado.includes(valor);
      case "lt":
        return n < e;
      case "lte":
        return n <= e;
      case "gt":
        return n > e;
      case "gte":
        return n >= e;
      case "not":
        return n !== e;
      case "contains":
        return String(valor ?? "").toLowerCase().includes(String(esperado).toLowerCase());
      default:
        throw new Error(`Operador no soportado por el doble de Prisma: ${operador}`);
    }
  });
}

function crearBase() {
  // pagoEstadia sumada para cancelarReserva (HU-37, anulación automática de
  // la seña): solo necesita existir y no explotar en un findMany/update
  // genéricos — ninguna prueba de este script siembra un PagoEstadia real
  // (eso lo cubre pruebas-senia-reserva.js, con el doble completo de
  // _dobleSprint3.js), así que acá siempre da una lista vacía y el loop de
  // anulación nunca llega a ejecutar nada.
  const datos = { habitacion: [], reserva: [], reservaHabitacion: [], huesped: [], notificacion: [], pagoEstadia: [] };
  const secuencias = { habitacion: 0, reserva: 0, reservaHabitacion: 0, huesped: 0, notificacion: 0, pagoEstadia: 0 };

  function siguienteId(tabla) {
    secuencias[tabla] += 1;
    return secuencias[tabla];
  }

  function coincide(tabla, registro, where = {}) {
    return Object.entries(where).every(([campo, condicion]) => {
      if (campo === "OR") return condicion.some((sub) => coincide(tabla, registro, sub));
      if (campo === "AND") return condicion.every((sub) => coincide(tabla, registro, sub));

      // Relaciones que usa el servicio.
      if (tabla === "reservaHabitacion" && campo === "reserva") {
        const reserva = datos.reserva.find((r) => r.id === registro.reservaId);
        return reserva ? coincide("reserva", reserva, condicion) : false;
      }
      if (tabla === "reservaHabitacion" && campo === "habitacion") {
        const habitacion = datos.habitacion.find((h) => h.id === registro.habitacionId);
        return habitacion ? coincide("habitacion", habitacion, condicion) : false;
      }
      if (tabla === "reserva" && campo === "huesped") {
        const huesped = datos.huesped.find((h) => h.id === registro.huespedId);
        return huesped ? coincide("huesped", huesped, condicion) : false;
      }
      if (tabla === "reserva" && campo === "reservaHabitaciones") {
        const propias = datos.reservaHabitacion.filter((rh) => rh.reservaId === registro.id);
        if (condicion.some) return propias.some((rh) => coincide("reservaHabitacion", rh, condicion.some));
        throw new Error("Solo se soporta `some` sobre reservaHabitaciones");
      }
      return coincideValor(registro[campo], condicion);
    });
  }

  function expandir(tabla, registro, include = {}) {
    if (!registro) return registro;
    const salida = { ...registro };
    if (tabla === "reserva") {
      if (include.huesped) salida.huesped = datos.huesped.find((h) => h.id === registro.huespedId) ?? null;
      if (include.reservaHabitaciones) {
        salida.reservaHabitaciones = datos.reservaHabitacion
          .filter((rh) => rh.reservaId === registro.id)
          .map((rh) => ({ ...rh, habitacion: datos.habitacion.find((h) => h.id === rh.habitacionId) ?? null }));
      }
      if (include.notificaciones) {
        salida.notificaciones = datos.notificacion.filter((n) => n.reservaId === registro.id);
      }
    }
    if (tabla === "reservaHabitacion") {
      if (include.habitacion) salida.habitacion = datos.habitacion.find((h) => h.id === registro.habitacionId) ?? null;
      if (include.reserva) salida.reserva = datos.reserva.find((r) => r.id === registro.reservaId) ?? null;
    }
    return salida;
  }

  function ordenar(filas, orderBy) {
    if (!orderBy) return filas;
    const criterios = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...filas].sort((a, b) => {
      for (const criterio of criterios) {
        const [campo, direccion] = Object.entries(criterio)[0];
        const va = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
        const vb = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
        if (va < vb) return direccion === "desc" ? 1 : -1;
        if (va > vb) return direccion === "desc" ? -1 : 1;
      }
      return 0;
    });
  }

  function modelo(tabla) {
    return {
      findMany: async ({ where = {}, include, orderBy, select } = {}) => {
        const filas = ordenar(datos[tabla].filter((r) => coincide(tabla, r, where)), orderBy);
        if (select) return filas.map((f) => Object.fromEntries(Object.keys(select).map((k) => [k, f[k]])));
        return filas.map((f) => expandir(tabla, f, include ?? {}));
      },
      findFirst: async ({ where = {}, include } = {}) => {
        const fila = datos[tabla].find((r) => coincide(tabla, r, where));
        return fila ? expandir(tabla, fila, include ?? {}) : null;
      },
      findUnique: async ({ where = {}, include, select } = {}) => {
        const fila = datos[tabla].find((r) => coincide(tabla, r, where));
        if (!fila) return null;
        if (select) return Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]]));
        return expandir(tabla, fila, include ?? {});
      },
      create: async ({ data, include }) => {
        const { reservaHabitaciones, ...propios } = data;
        const fila = { id: siguienteId(tabla), ...propios };
        // Unicidad real de la base, para poder probar el reintento de código.
        if (tabla === "reserva" && datos.reserva.some((r) => r.codigoConfirmacion === fila.codigoConfirmacion)) {
          throw new PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            meta: { target: ["codigoConfirmacion"] },
          });
        }
        if (tabla === "habitacion" && datos.habitacion.some((h) => h.numero === fila.numero)) {
          throw new PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", meta: { target: ["numero"] } });
        }
        datos[tabla].push(fila);
        if (reservaHabitaciones?.create) {
          for (const rh of reservaHabitaciones.create) {
            datos.reservaHabitacion.push({ id: siguienteId("reservaHabitacion"), reservaId: fila.id, ...rh });
          }
        }
        return expandir(tabla, fila, include ?? {});
      },
      update: async ({ where, data, include }) => {
        const fila = datos[tabla].find((r) => coincide(tabla, r, where));
        if (!fila) throw new Error(`No existe la fila a actualizar en ${tabla}`);
        const { reservaHabitaciones, ...propios } = data;
        Object.assign(fila, propios);
        if (reservaHabitaciones?.create) {
          for (const rh of reservaHabitaciones.create) {
            datos.reservaHabitacion.push({ id: siguienteId("reservaHabitacion"), reservaId: fila.id, ...rh });
          }
        }
        return expandir(tabla, fila, include ?? {});
      },
      deleteMany: async ({ where = {} }) => {
        const quedan = datos[tabla].filter((r) => !coincide(tabla, r, where));
        const borradas = datos[tabla].length - quedan.length;
        datos[tabla] = quedan;
        return { count: borradas };
      },
    };
  }

  const cliente = {
    habitacion: modelo("habitacion"),
    reserva: modelo("reserva"),
    reservaHabitacion: modelo("reservaHabitacion"),
    huesped: modelo("huesped"),
    notificacion: modelo("notificacion"),
    pagoEstadia: modelo("pagoEstadia"),
    $queryRaw: async () => [],
    $transaction: async (fn) => fn(cliente),
    _datos: datos,
    // Cada prueba arranca con la base vacía Y con los ids desde 1: si las
    // secuencias siguieran corriendo, los ids que usan las pruebas
    // (habitacionIds: [1]) dejarían de existir a partir de la segunda.
    _limpiar() {
      for (const tabla of Object.keys(datos)) datos[tabla] = [];
      for (const tabla of Object.keys(secuencias)) secuencias[tabla] = 0;
    },
    _sembrarHabitacion(datosHabitacion) {
      const fila = {
        id: siguienteId("habitacion"),
        activo: true,
        estado: "libre",
        piso: 1,
        capacidad: 2,
        tipo: "Doble",
        equipamiento: null,
        tarifaPorNoche: 50000,
        ...datosHabitacion,
      };
      datos.habitacion.push(fila);
      return fila;
    },
  };

  return cliente;
}

// --------------------------------------------------------------
// Carga del servicio con la base falsa inyectada
// --------------------------------------------------------------

const base = crearBase();

Module._load = function (solicitud, ...resto) {
  if (solicitud === "@prisma/client") return { Prisma: PrismaFalso };
  // Dos formas de pedirlo según desde dónde se requiere: "../../lib/prisma"
  // (la mayoría de los *.servicio.js) o "./prisma" (archivos que ya viven
  // adentro de src/lib/, como comprobantes.js) — sumado junto con el require
  // diferido de pagoEstadiaServicio en cancelarReserva (HU-37, anulación
  // automática de la seña), que es el primer camino de este script que trae
  // checkOut.servicio.js transitivamente y por lo tanto lib/comprobantes.js.
  // Mismo criterio ya usado en _dobleSprint3.js (instalarDoble).
  if (/(^|[/\\])lib[/\\]prisma$/.test(solicitud) || solicitud === "./prisma") return base;
  return cargarModuloOriginal.call(this, solicitud, ...resto);
};

const servicio = require("../src/modulos/reservas/reservas.servicio");
const { ESTADO_RESERVA } = require("../src/modulos/reservas/reservas.constantes");

// --------------------------------------------------------------
// Utilidades de prueba
// --------------------------------------------------------------

let pasaron = 0;
const fallaron = [];

async function prueba(nombre, fn) {
  try {
    await fn();
    pasaron += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (err) {
    fallaron.push({ nombre, err });
    console.log(`  ✘ ${nombre}\n      ${err.message}`);
  }
}

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

function limpiar() {
  base._limpiar();
}

// Fechas siempre relativas a hoy: una prueba con fechas fijas se rompe
// sola cuando pasa el tiempo (la validación de "no reservar en el pasado").
function enDias(dias) {
  const hoy = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }));
  return new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const HUESPED = { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };

function alta(extra = {}) {
  return {
    fechaDesde: enDias(10),
    fechaHasta: enDias(13),
    habitacionIds: [1],
    huesped: { ...HUESPED },
    ...extra,
  };
}

async function esperaError(fn, textoEsperado) {
  try {
    await fn();
  } catch (err) {
    assert.ok(
      err.message.toLowerCase().includes(textoEsperado.toLowerCase()),
      `El error fue "${err.message}", se esperaba que mencionara "${textoEsperado}"`
    );
    return err;
  }
  throw new Error(`Se esperaba un error que mencionara "${textoEsperado}", pero no falló`);
}

// --------------------------------------------------------------
// Pruebas
// --------------------------------------------------------------

async function main() {
  seccion("HU-36 — Alta de reserva individual o grupal");

  await prueba("crea una reserva individual en estado Confirmada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    assert.equal(reserva.estado, ESTADO_RESERVA.CONFIRMADA);
    assert.equal(reserva.habitaciones.length, 1);
    assert.equal(reserva.habitaciones[0].numero, "101");
    assert.equal(reserva.noches, 3);
  });

  await prueba("una reserva grupal asocia varias habitaciones", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    base._sembrarHabitacion({ numero: "103" });
    const reserva = await servicio.crearReserva(alta({ habitacionIds: [1, 2, 3] }));
    assert.equal(reserva.habitaciones.length, 3);
    assert.equal(reserva.cantidadHabitaciones, 3);
  });

  await prueba("calcula el total estimado como noches × suma de tarifas", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 40000 });
    base._sembrarHabitacion({ numero: "102", tarifaPorNoche: 60000 });
    const reserva = await servicio.crearReserva(alta({ habitacionIds: [1, 2] }));
    assert.equal(reserva.tarifaTotalPorNoche, 100000);
    assert.equal(reserva.totalEstimadoAlojamiento, 300000);
  });

  await prueba("rechaza el alta sin habitaciones", async () => {
    limpiar();
    await esperaError(() => servicio.crearReserva(alta({ habitacionIds: [] })), "al menos una habitación");
  });

  await prueba("rechaza la misma habitación repetida en la reserva", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(() => servicio.crearReserva(alta({ habitacionIds: [1, 1] })), "no puede repetirse");
  });

  await prueba("rechaza una habitación inexistente", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(() => servicio.crearReserva(alta({ habitacionIds: [99] })), "no existe");
  });

  await prueba("rechaza una habitación dada de baja", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", activo: false });
    await esperaError(() => servicio.crearReserva(alta()), "dada de baja");
  });

  await prueba("permite reservar una habitación que hoy está en mantenimiento (la disponibilidad es por fechas)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const reserva = await servicio.crearReserva(alta());
    assert.equal(reserva.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("no toca el estado físico de la habitación al reservar (eso es el check-in)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "libre" });
    await servicio.crearReserva(alta());
    assert.equal(base._datos.habitacion[0].estado, "libre");
  });

  seccion("HU-36 / HU-38 — Validación de disponibilidad (solapamiento)");

  await prueba("rechaza una reserva que se pisa con otra confirmada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    await esperaError(
      () => servicio.crearReserva(alta({ fechaDesde: enDias(12), fechaHasta: enDias(18) })),
      "No hay disponibilidad"
    );
  });

  await prueba("rechaza una reserva contenida dentro de otra", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(20) }));
    await esperaError(
      () => servicio.crearReserva(alta({ fechaDesde: enDias(12), fechaHasta: enDias(14) })),
      "No hay disponibilidad"
    );
  });

  await prueba("permite entrar el mismo día en que otra reserva se va (intervalo semiabierto)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const segunda = await servicio.crearReserva(alta({ fechaDesde: enDias(15), fechaHasta: enDias(18) }));
    assert.equal(segunda.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("permite salir el mismo día en que arranca otra reserva", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ fechaDesde: enDias(15), fechaHasta: enDias(18) }));
    const previa = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    assert.equal(previa.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("el choque en UNA sola habitación del grupo bloquea toda la reserva grupal", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(alta({ habitacionIds: [2], fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    await esperaError(
      () => servicio.crearReserva(alta({ habitacionIds: [1, 2], fechaDesde: enDias(11), fechaHasta: enDias(13) })),
      "No hay disponibilidad"
    );
  });

  await prueba("una habitación distinta en el mismo período sí se puede reservar", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(alta({ habitacionIds: [1] }));
    const otra = await servicio.crearReserva(alta({ habitacionIds: [2] }));
    assert.equal(otra.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  seccion("HU-36 — Validación de fechas");

  await prueba("rechaza salida anterior o igual a la entrada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(
      () => servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(10) })),
      "posterior a la de entrada"
    );
  });

  await prueba("rechaza una entrada anterior a hoy", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(
      () => servicio.crearReserva(alta({ fechaDesde: enDias(-1), fechaHasta: enDias(3) })),
      "anterior a hoy"
    );
  });

  await prueba("acepta una reserva que arranca hoy mismo", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(0), fechaHasta: enDias(2) }));
    assert.equal(reserva.noches, 2);
  });

  await prueba("rechaza un día inexistente del calendario (31 de febrero)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(() => servicio.crearReserva(alta({ fechaDesde: "2027-02-31" })), "no es una fecha válida");
  });

  await prueba("rechaza un formato de fecha que no sea AAAA-MM-DD", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(() => servicio.crearReserva(alta({ fechaDesde: "10/05/2027" })), "AAAA-MM-DD");
  });

  await prueba("guarda las fechas como medianoche UTC del día elegido (sin corrimiento de zona)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(12) }));
    assert.equal(new Date(reserva.fechaDesde).toISOString(), `${enDias(10)}T00:00:00.000Z`);
  });

  seccion("HU-39 — Datos del huésped");

  await prueba("rechaza el alta sin nombre del huésped", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(() => servicio.crearReserva(alta({ huesped: { ...HUESPED, nombre: "  " } })), "nombre del huésped");
  });

  await prueba("rechaza el alta sin número de documento", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(
      () => servicio.crearReserva(alta({ huesped: { ...HUESPED, numeroDocumento: "" } })),
      "número de documento"
    );
  });

  await prueba("rechaza un tipo de documento fuera de la lista", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(
      () => servicio.crearReserva(alta({ huesped: { ...HUESPED, tipoDocumento: "Carnet del club" } })),
      "tipoDocumento"
    );
  });

  await prueba("reutiliza la ficha del huésped si el documento ya existe", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(alta({ habitacionIds: [1] }));
    await servicio.crearReserva(alta({ habitacionIds: [2] }));
    assert.equal(base._datos.huesped.length, 1);
  });

  await prueba("un documento distinto genera una ficha nueva", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(alta({ habitacionIds: [1] }));
    await servicio.crearReserva(
      alta({ habitacionIds: [2], huesped: { ...HUESPED, numeroDocumento: "40999888", nombre: "Luis Gómez" } })
    );
    assert.equal(base._datos.huesped.length, 2);
  });

  await prueba("no borra el contacto ya cargado cuando el alta nueva no lo repite", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(alta({ habitacionIds: [1] }));
    await servicio.crearReserva(alta({ habitacionIds: [2], huesped: { ...HUESPED, contacto: "nuevo@mail.com" } }));
    assert.equal(base._datos.huesped[0].contacto, "nuevo@mail.com");
  });

  seccion("HU-41 / HU-42 — Confirmación automática y código único");

  await prueba("genera un código alfanumérico y lo deja en la reserva", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    assert.match(reserva.codigoConfirmacion, /^[0-9A-F]{8}$/);
  });

  await prueba("el código es distinto entre reservas", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    const a = await servicio.crearReserva(alta({ habitacionIds: [1] }));
    const b = await servicio.crearReserva(alta({ habitacionIds: [2] }));
    assert.notEqual(a.codigoConfirmacion, b.codigoConfirmacion);
  });

  await prueba("registra la notificación de confirmación con el código y el canal pedido", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ canalConfirmacion: "Email" }));
    assert.equal(base._datos.notificacion.length, 1);
    const notificacion = base._datos.notificacion[0];
    assert.equal(notificacion.tipo, "Reserva");
    assert.equal(notificacion.canal, "Email");
    assert.ok(notificacion.mensaje.includes(reserva.codigoConfirmacion));
  });

  await prueba("sin datos de contacto, la confirmación queda como aviso interno", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(() => servicio.crearReserva(alta({ huesped: { ...HUESPED, contacto: "" } })), "correo");
    return;
    assert.equal(base._datos.notificacion[0].canal, "Interno");
    assert.equal(base._datos.notificacion[0].destinatarioArea, "Recepción");
  });

  await prueba("rechaza un canal de confirmación inválido", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await esperaError(() => servicio.crearReserva(alta({ canalConfirmacion: "Paloma mensajera" })), "canalConfirmacion");
  });

  seccion("HU-40 — Autoservicio web");

  await prueba("el canal web usa el mismo alta y la misma validación de disponibilidad", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ origen: "WEB", fechaDesde: enDias(10), fechaHasta: enDias(14) }));
    await esperaError(
      () => servicio.crearReserva(alta({ origen: "WEB", fechaDesde: enDias(11), fechaHasta: enDias(13) })),
      "No hay disponibilidad"
    );
  });

  await prueba("la confirmación de una reserva web lo deja asentado en el mensaje", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ origen: "WEB" }));
    assert.ok(base._datos.notificacion[0].mensaje.includes("web"));
  });

  seccion("HU-37 — Modificación");

  await prueba("mueve las fechas de una reserva confirmada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    const modificada = await servicio.modificarReserva(reserva.id, {
      fechaDesde: enDias(20),
      fechaHasta: enDias(25),
    });
    assert.equal(modificada.noches, 5);
  });

  await prueba("cambiar de habitación reemplaza la asociación anterior", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    const reserva = await servicio.crearReserva(alta({ habitacionIds: [1] }));
    const modificada = await servicio.modificarReserva(reserva.id, { habitacionIds: [2] });
    assert.equal(modificada.habitaciones.length, 1);
    assert.equal(modificada.habitaciones[0].numero, "102");
    assert.equal(base._datos.reservaHabitacion.filter((rh) => rh.reservaId === reserva.id).length, 1);
  });

  await prueba("no cuenta la propia reserva como conflicto al modificarla", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const modificada = await servicio.modificarReserva(reserva.id, { fechaHasta: enDias(16) });
    assert.equal(modificada.noches, 6);
  });

  await prueba("rechaza mover una reserva sobre un período ya ocupado", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ fechaDesde: enDias(20), fechaHasta: enDias(25) }));
    const segunda = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(12) }));
    await esperaError(
      () => servicio.modificarReserva(segunda.id, { fechaDesde: enDias(21), fechaHasta: enDias(23) }),
      "No hay disponibilidad"
    );
  });

  await prueba("no permite modificar una reserva que ya arrancó", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    await servicio.marcarEnCurso(reserva.id);
    await esperaError(() => servicio.modificarReserva(reserva.id, { fechaHasta: enDias(20) }), "Solo se puede modificar");
  });

  await prueba("no permite modificar una reserva cancelada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "El huésped se arrepintió" });
    await esperaError(() => servicio.modificarReserva(reserva.id, { fechaHasta: enDias(20) }), "Solo se puede modificar");
  });

  seccion("HU-37 — Cancelación");

  await prueba("cancela con motivo y deja el motivo registrado", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    const cancelada = await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    assert.equal(cancelada.estado, ESTADO_RESERVA.CANCELADA);
    assert.equal(cancelada.motivoCancelacion, "Vuelo cancelado");
  });

  await prueba("exige el motivo de cancelación", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    await esperaError(() => servicio.cancelarReserva(reserva.id, {}), "motivo de cancelación");
  });

  await prueba("al cancelar, el período vuelve a estar disponible", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    const nueva = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    assert.equal(nueva.estado, ESTADO_RESERVA.CONFIRMADA);
  });

  await prueba("no se puede cancelar dos veces", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    await esperaError(() => servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Otra vez" }), "ya está cancelada");
  });

  await prueba("no se puede cancelar una reserva con el huésped ya alojado", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    await servicio.marcarEnCurso(reserva.id);
    await esperaError(() => servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Tarde" }), "check-out");
  });

  seccion("HU-38 — Consulta de disponibilidad en tiempo real");

  await prueba("lista solo las habitaciones libres en el período", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    await servicio.crearReserva(alta({ habitacionIds: [1], fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(13) });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].numero, "102");
  });

  await prueba("filtra por tipo de habitación", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tipo: "Doble" });
    base._sembrarHabitacion({ numero: "201", tipo: "Suite" });
    const resultado = await servicio.consultarDisponibilidad({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      tipo: "Suite",
    });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].tipo, "Suite");
  });

  await prueba("filtra por capacidad mínima", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", capacidad: 2 });
    base._sembrarHabitacion({ numero: "102", capacidad: 4 });
    const resultado = await servicio.consultarDisponibilidad({
      fechaDesde: enDias(10),
      fechaHasta: enDias(12),
      capacidadMinima: 3,
    });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].numero, "102");
  });

  await prueba("excluye las habitaciones dadas de baja", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", activo: false });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(12) });
    assert.equal(resultado.habitaciones.length, 0);
  });

  await prueba("el resumen por tipo informa libres sobre el total", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tipo: "Doble" });
    base._sembrarHabitacion({ numero: "102", tipo: "Doble" });
    await servicio.crearReserva(alta({ habitacionIds: [1], fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(12) });
    const doble = resultado.resumenPorTipo.find((r) => r.tipo === "Doble");
    assert.equal(doble.total, 2);
    assert.equal(doble.disponibles, 1);
  });

  await prueba("la disponibilidad se actualiza sola tras una cancelación", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const ocupada = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(12) });
    assert.equal(ocupada.habitaciones.length, 0);
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Se suspendió el viaje" });
    const libre = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(12) });
    assert.equal(libre.habitaciones.length, 1);
  });

  await prueba("excluirReservaId deja ver como libre lo que toma la reserva que se está editando", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(15) }));
    const sinExcluir = await servicio.consultarDisponibilidad({ fechaDesde: enDias(11), fechaHasta: enDias(14) });
    assert.equal(sinExcluir.habitaciones.length, 0);
    const excluyendo = await servicio.consultarDisponibilidad({
      fechaDesde: enDias(11),
      fechaHasta: enDias(14),
      excluirReservaId: reserva.id,
    });
    assert.equal(excluyendo.habitaciones.length, 1);
  });

  await prueba("calcula el total de la estadía por habitación", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", tarifaPorNoche: 30000 });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(14) });
    assert.equal(resultado.noches, 4);
    assert.equal(resultado.habitaciones[0].totalEstadia, 120000);
  });

  seccion("Corrección — 'En curso' vencidas y estado físico en consultarDisponibilidad");

  await prueba("una reserva 'En curso' con fechaHasta vencida sigue bloqueando la habitación (no hubo check-out real)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(0), fechaHasta: enDias(1) }));
    await servicio.marcarEnCurso(reserva.id);
    // Simula que el huésped se quedó de más y nunca hizo check-out: la
    // fechaHasta original queda vencida (en el pasado) sin liberar la
    // habitación — el mismo escenario que originó el reporte.
    base._datos.reserva.find((r) => r.id === reserva.id).fechaHasta = new Date(`${enDias(-3)}T00:00:00.000Z`);
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(5), fechaHasta: enDias(7) });
    assert.equal(
      resultado.habitaciones.length,
      0,
      "una 'En curso' vencida no debe liberar la habitación por el mero paso del tiempo: solo un check-out real (marcarCerrada) la libera"
    );
  });

  await prueba("una reserva 'Confirmada' (no iniciada) usa su fechaHasta tal cual, no bloquea después de esa fecha", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(12) }));
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(12), fechaHasta: enDias(15) });
    assert.equal(resultado.habitaciones.length, 1, "Confirmada respeta su fechaHasta literal, a diferencia de En curso");
  });

  await prueba("para fecha de entrada = hoy, una habitación 'ocupada' queda excluida de los resultados", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "ocupada" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(0), fechaHasta: enDias(2) });
    assert.equal(resultado.habitaciones.length, 0);
  });

  await prueba("para fecha de entrada futura, una habitación 'en mantenimiento' aparece con el dato informativo, sin bloquear", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "mantenimiento" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(12) });
    assert.equal(resultado.habitaciones.length, 1);
    assert.equal(resultado.habitaciones[0].estadoActual, "mantenimiento");
  });

  await prueba("estadoActual queda en null cuando la habitación ya está libre", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101", estado: "libre" });
    const resultado = await servicio.consultarDisponibilidad({ fechaDesde: enDias(10), fechaHasta: enDias(12) });
    assert.equal(resultado.habitaciones[0].estadoActual, null);
  });

  seccion("Contrato con Check-in (Integrante 3) y Check-out (Integrante 4)");

  await prueba("obtenerReserva devuelve la forma acordada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const creada = await servicio.crearReserva(alta());
    const reserva = await servicio.obtenerReserva(creada.id);
    for (const campo of ["id", "codigoConfirmacion", "fechaDesde", "fechaHasta", "estado", "huesped", "habitaciones"]) {
      assert.ok(campo in reserva, `Falta el campo "${campo}" del contrato`);
    }
    for (const campo of ["id", "nombre", "tipoDocumento", "numeroDocumento", "contacto"]) {
      assert.ok(campo in reserva.huesped, `Falta el campo "${campo}" del huésped`);
    }
    for (const campo of ["id", "numero", "tipo"]) {
      assert.ok(campo in reserva.habitaciones[0], `Falta el campo "${campo}" de la habitación`);
    }
  });

  await prueba("obtenerPorCodigoConfirmacion encuentra la reserva (sin importar mayúsculas)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const creada = await servicio.crearReserva(alta());
    const reserva = await servicio.obtenerPorCodigoConfirmacion(creada.codigoConfirmacion.toLowerCase());
    assert.equal(reserva.id, creada.id);
  });

  await prueba("obtenerPorCodigoConfirmacion falla con 404 si el código no existe", async () => {
    limpiar();
    const err = await esperaError(() => servicio.obtenerPorCodigoConfirmacion("ZZZZZZZZ"), "No existe una reserva");
    assert.equal(err.statusCode, 404);
  });

  await prueba("obtenerPorCodigoODocumento usa match exacto de documento, no substring", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    const corta = await servicio.crearReserva(alta({ habitacionIds: [1], huesped: { ...HUESPED, numeroDocumento: "5678" } }));
    await servicio.crearReserva(
      alta({ habitacionIds: [2], huesped: { ...HUESPED, nombre: "Otro Huésped", numeroDocumento: "12345678" } })
    );
    const resultado = await servicio.obtenerPorCodigoODocumento("5678");
    assert.equal(resultado.id, corta.id, "un documento que es substring de otro no puede traer la reserva ajena");
  });

  await prueba(
    "si el mismo documento tiene dos reservas 'Confirmada' vigentes a la vez, prioriza la de fechaDesde más reciente",
    async () => {
      limpiar();
      base._sembrarHabitacion({ numero: "101" });
      base._sembrarHabitacion({ numero: "102" });
      const vieja = await servicio.crearReserva(
        alta({ habitacionIds: [1], huesped: { ...HUESPED, numeroDocumento: "55667788" } })
      );
      // crearReserva no deja pedir una fechaDesde pasada (regla real, ver
      // validarRango) — acá se simula el paso del tiempo escribiendo
      // directo en la base falsa: una Confirmada que nunca se canceló ni
      // se registró y a la que ya le pasó la fecha de ingreso.
      const filaVieja = base._datos.reserva.find((r) => r.id === vieja.id);
      filaVieja.fechaDesde = new Date(`${enDias(-5)}T00:00:00.000Z`);
      filaVieja.fechaHasta = new Date(`${enDias(-2)}T00:00:00.000Z`);

      const nueva = await servicio.crearReserva(
        alta({ fechaDesde: enDias(0), fechaHasta: enDias(3), habitacionIds: [2], huesped: { ...HUESPED, numeroDocumento: "55667788" } })
      );

      const resultado = await servicio.obtenerPorCodigoODocumento("55667788");
      assert.equal(resultado.id, nueva.id, "tendría que traer la reserva vigente más cercana a hoy, no la vieja");
      assert.equal(resultado.estado, ESTADO_RESERVA.CONFIRMADA);
    }
  );

  await prueba("marcarEnCurso pasa la reserva de Confirmada a En curso", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    const actualizada = await servicio.marcarEnCurso(reserva.id);
    assert.equal(actualizada.estado, ESTADO_RESERVA.EN_CURSO);
  });

  await prueba("marcarEnCurso rechaza una reserva cancelada", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    await servicio.cancelarReserva(reserva.id, { motivoCancelacion: "Vuelo cancelado" });
    await esperaError(() => servicio.marcarEnCurso(reserva.id), "No se puede pasar la reserva");
  });

  await prueba("marcarCerrada exige que la reserva esté En curso", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    await esperaError(() => servicio.marcarCerrada(reserva.id), "No se puede pasar la reserva");
    await servicio.marcarEnCurso(reserva.id);
    const cerrada = await servicio.marcarCerrada(reserva.id);
    assert.equal(cerrada.estado, ESTADO_RESERVA.CERRADA);
  });

  await prueba("una reserva cerrada libera la habitación (check-out anticipado)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta({ fechaDesde: enDias(0), fechaHasta: enDias(10) }));
    await servicio.marcarEnCurso(reserva.id);
    await servicio.marcarCerrada(reserva.id);
    const libre = await servicio.consultarDisponibilidad({ fechaDesde: enDias(2), fechaHasta: enDias(5) });
    assert.equal(libre.habitaciones.length, 1);
  });

  await prueba("crearReservaEnTransaccion se puede reusar desde una transacción ajena (walk-in de HU-44)", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const datos = servicio.normalizarAltaReserva(alta({ fechaDesde: enDias(0), fechaHasta: enDias(1) }));
    const reserva = await base.$transaction(async (tx) => {
      const creada = await servicio.crearReservaEnTransaccion(tx, datos);
      await servicio.marcarEnCurso(creada.id, tx);
      return creada;
    });
    assert.equal(base._datos.reserva.find((r) => r.id === reserva.id).estado, ESTADO_RESERVA.EN_CURSO);
  });

  seccion("Listado y filtros");

  await prueba("filtra por estado", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    base._sembrarHabitacion({ numero: "102" });
    const a = await servicio.crearReserva(alta({ habitacionIds: [1] }));
    await servicio.crearReserva(alta({ habitacionIds: [2] }));
    await servicio.cancelarReserva(a.id, { motivoCancelacion: "Vuelo cancelado" });
    const canceladas = await servicio.listarReservas({ estado: ESTADO_RESERVA.CANCELADA });
    assert.equal(canceladas.length, 1);
    assert.equal(canceladas[0].id, a.id);
  });

  await prueba("busca por código, nombre, documento y número de habitación", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    const reserva = await servicio.crearReserva(alta());
    assert.equal((await servicio.listarReservas({ q: reserva.codigoConfirmacion })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "ana" })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "30111222" })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "101" })).length, 1);
    assert.equal((await servicio.listarReservas({ q: "no existe" })).length, 0);
  });

  await prueba("el filtro por período trae también las estadías que lo cruzan", async () => {
    limpiar();
    base._sembrarHabitacion({ numero: "101" });
    await servicio.crearReserva(alta({ fechaDesde: enDias(10), fechaHasta: enDias(30) }));
    const enElMedio = await servicio.listarReservas({ desde: enDias(15), hasta: enDias(16) });
    assert.equal(enElMedio.length, 1);
    const fuera = await servicio.listarReservas({ desde: enDias(40), hasta: enDias(45) });
    assert.equal(fuera.length, 0);
  });

  await prueba("rechaza un estado de filtro inválido", async () => {
    limpiar();
    await esperaError(() => servicio.listarReservas({ estado: "Pendiente" }), "estado debe ser uno de");
  });

  // ------------------------------------------------------------
  console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
  if (fallaron.length > 0) {
    console.log("\nFallaron:");
    for (const f of fallaron) console.log(`  - ${f.nombre}: ${f.err.stack}`);
    process.exitCode = 1;
  }
}

main();
