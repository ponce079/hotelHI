// Doble de Prisma en memoria COMPARTIDO por pruebas-checkin.js y
// pruebas-servicios-adicionales.js — no es un script ejecutable en sí
// mismo, es un helper que cargan los dos.
//
// Por qué es compartido y no uno por script (a diferencia de
// pruebas-reservas.js, que sí es autocontenido): Check-in y Servicios
// Adicionales no manejan tablas propias — son lógica que ORQUESTA módulos
// ajenos (reservas.servicio.js, habitaciones.servicio.js,
// movimientoSalida.servicio.js, y ésta a su vez requerimientos.servicio.js
// para verificarStockMinimoCentral). Las dos suites de pruebas necesitan el
// mismo universo de tablas (Reserva/Habitacion/Stock a la vez) para poder
// ejercitar el código real de esos cuatro módulos sin mockearlos — duplicar
// ~300 líneas de matching/CRUD genérico en dos archivos hubiera significado
// arreglar cualquier bug de acá dos veces.
//
// Mismo patrón de matching genérico que pruebas-reservas.js
// (coincideValor/coincide/expandir/modelo) — si un servicio empieza a usar
// una forma de consulta nueva, hay que enseñársela acá.

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

const TABLAS = [
  "habitacion",
  "ordenMantenimiento",
  "reserva",
  "reservaHabitacion",
  "huesped",
  "notificacion",
  "consumoServicioAdicional",
  "deposito",
  "tipoMovimientoStock",
  "articulo",
  "articuloDeposito",
  "articuloDepositoStock",
  "movimientoStock",
  "movimientoStockDetalle",
  "requerimientoReposicion",
];

// Campos `@default(now())` del schema real que ningún servicio setea a
// mano al crear (confían en que Prisma/la base lo complete solo) — el
// doble tiene que aplicarlos él mismo, si no esos campos quedan
// `undefined` en las pruebas. Reloj propio y estrictamente creciente (no
// `new Date()` sin más): dos altas en el mismo tick de JS pueden caer en el
// mismo milisegundo real, lo que rompería cualquier prueba que ordene "más
// reciente primero" — acá cada alta siguiente queda garantizada un
// milisegundo después de la anterior, sin depender del reloj del sistema.
const CAMPO_FECHA_POR_DEFECTO = {
  consumoServicioAdicional: "fechaHora",
  movimientoStock: "fecha",
  notificacion: "fechaEnvio",
  ordenMantenimiento: "fecha",
};
let relojFalso = Date.now();
function ahoraFalso() {
  relojFalso += 1;
  return new Date(relojFalso);
}

function crearBase() {
  const datos = Object.fromEntries(TABLAS.map((t) => [t, []]));
  const secuencias = Object.fromEntries(TABLAS.map((t) => [t, 0]));

  function siguienteId(tabla) {
    secuencias[tabla] += 1;
    return secuencias[tabla];
  }

  function coincide(tabla, registro, where = {}) {
    return Object.entries(where).every(([campo, condicion]) => {
      if (campo === "OR") return condicion.some((sub) => coincide(tabla, registro, sub));
      if (campo === "AND") return condicion.every((sub) => coincide(tabla, registro, sub));

      // --- Relaciones de Reservas (idénticas a pruebas-reservas.js) ---
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

      // --- Relaciones de Stock (Sprint 1) que usa movimientoSalida.servicio.js ---
      if (tabla === "articuloDeposito" && campo === "articulo") {
        const articulo = datos.articulo.find((a) => a.id === registro.articuloId);
        return articulo ? coincide("articulo", articulo, condicion) : false;
      }
      if (tabla === "articuloDeposito" && campo === "deposito") {
        const deposito = datos.deposito.find((d) => d.id === registro.depositoId);
        return deposito ? coincide("deposito", deposito, condicion) : false;
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
    if (tabla === "habitacion") {
      if (include.ordenesMantenimiento) {
        salida.ordenesMantenimiento = datos.ordenMantenimiento
          .filter((o) => o.habitacionId === registro.id)
          .map((o) => ({ ...o, notificaciones: datos.notificacion.filter((n) => n.ordenMantenimientoId === o.id) }));
      }
    }
    if (tabla === "consumoServicioAdicional") {
      if (include.articulo) salida.articulo = datos.articulo.find((a) => a.id === registro.articuloId) ?? null;
      if (include.habitacion) salida.habitacion = datos.habitacion.find((h) => h.id === registro.habitacionId) ?? null;
    }
    if (tabla === "articuloDeposito") {
      if (include.articulo) salida.articulo = datos.articulo.find((a) => a.id === registro.articuloId) ?? null;
      if (include.deposito) salida.deposito = datos.deposito.find((d) => d.id === registro.depositoId) ?? null;
      if (include.stock) {
        salida.stock = datos.articuloDepositoStock.find((s) => s.articuloDepositoId === registro.id) ?? null;
      }
    }
    if (tabla === "movimientoStock") {
      if (include.deposito) salida.deposito = datos.deposito.find((d) => d.id === registro.depositoId) ?? null;
      if (include.tipoMovStock) {
        salida.tipoMovStock = datos.tipoMovimientoStock.find((t) => t.id === registro.tipoMovStockId) ?? null;
      }
      if (include.detalleMovimientos) {
        salida.detalleMovimientos = datos.movimientoStockDetalle
          .filter((d) => d.movStockId === registro.id)
          .map((d) => ({ ...d, articulo: datos.articulo.find((a) => a.id === d.articuloId) ?? null }));
      }
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
      findMany: async ({ where = {}, include, orderBy, select, distinct } = {}) => {
        let filas = ordenar(datos[tabla].filter((r) => coincide(tabla, r, where)), orderBy);
        if (distinct) {
          const vistos = new Set();
          filas = filas.filter((f) => {
            const clave = distinct.map((c) => f[c]).join("|");
            if (vistos.has(clave)) return false;
            vistos.add(clave);
            return true;
          });
        }
        if (select) return filas.map((f) => Object.fromEntries(Object.keys(select).map((k) => [k, f[k]])));
        return filas.map((f) => expandir(tabla, f, include ?? {}));
      },
      findFirst: async ({ where = {}, include, orderBy } = {}) => {
        const filas = ordenar(datos[tabla].filter((r) => coincide(tabla, r, where)), orderBy);
        return filas[0] ? expandir(tabla, filas[0], include ?? {}) : null;
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
        const campoFecha = CAMPO_FECHA_POR_DEFECTO[tabla];
        if (campoFecha && fila[campoFecha] === undefined) fila[campoFecha] = ahoraFalso();
        // Unicidad real de la base, para probar reintentos (mismo criterio
        // que pruebas-reservas.js).
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
        // Soporta `{ decrement: n }` (usado por articuloDepositoStock).
        for (const [campo, valor] of Object.entries(propios)) {
          if (valor && typeof valor === "object" && "decrement" in valor) {
            fila[campo] = Number(fila[campo]) - Number(valor.decrement);
          } else {
            fila[campo] = valor;
          }
        }
        if (reservaHabitaciones?.create) {
          for (const rh of reservaHabitaciones.create) {
            datos.reservaHabitacion.push({ id: siguienteId("reservaHabitacion"), reservaId: fila.id, ...rh });
          }
        }
        return expandir(tabla, fila, include ?? {});
      },
      // Usado por movimientoSalida.servicio.js para el "verificar y
      // descontar" atómico (`stockActual: { gte: cantidad }` en el WHERE).
      updateMany: async ({ where = {}, data }) => {
        const filas = datos[tabla].filter((r) => coincide(tabla, r, where));
        for (const fila of filas) {
          for (const [campo, valor] of Object.entries(data)) {
            if (valor && typeof valor === "object" && "decrement" in valor) {
              fila[campo] = Number(fila[campo]) - Number(valor.decrement);
            } else {
              fila[campo] = valor;
            }
          }
        }
        return { count: filas.length };
      },
      upsert: async ({ where, update, create }) => {
        const fila = datos[tabla].find((r) => coincide(tabla, r, where));
        if (fila) {
          Object.assign(fila, update);
          return expandir(tabla, fila, {});
        }
        const nueva = { id: siguienteId(tabla), ...create };
        datos[tabla].push(nueva);
        return expandir(tabla, nueva, {});
      },
      deleteMany: async ({ where = {} }) => {
        const quedan = datos[tabla].filter((r) => !coincide(tabla, r, where));
        const borradas = datos[tabla].length - quedan.length;
        datos[tabla] = quedan;
        return { count: borradas };
      },
    };
  }

  const cliente = { $queryRaw: async () => [], _datos: datos };
  for (const tabla of TABLAS) cliente[tabla] = modelo(tabla);
  // Interactivo: el callback recibe el mismo cliente (todo corre "dentro"
  // de la única base en memoria). Con rollback real ante un error a mitad
  // de camino — HU-47 (check-in) y HU-61 (minibar) dependen exactamente de
  // esto: si algo falla después de haber escrito parte de la transacción,
  // nada de lo ya escrito puede quedar. `structuredClone` preserva los
  // `Date` (a diferencia de JSON.stringify/parse). Las secuencias de id NO
  // se restauran a propósito: un rollback real de Postgres/MySQL tampoco
  // "libera" el autoincremental que ya se consumió.
  cliente.$transaction = async (fn, _opciones) => {
    if (typeof fn !== "function") return Promise.all(fn);
    const snapshot = structuredClone(datos);
    try {
      return await fn(cliente);
    } catch (err) {
      for (const tabla of TABLAS) datos[tabla] = snapshot[tabla];
      throw err;
    }
  };

  cliente._limpiar = () => {
    for (const tabla of TABLAS) datos[tabla] = [];
    for (const tabla of TABLAS) secuencias[tabla] = 0;
  };

  cliente._sembrarHabitacion = (extra = {}) => {
    const fila = {
      id: siguienteId("habitacion"),
      activo: true,
      estado: "libre",
      piso: 1,
      capacidad: 2,
      tipo: "Doble",
      equipamiento: null,
      tarifaPorNoche: 50000,
      ...extra,
    };
    datos.habitacion.push(fila);
    return fila;
  };

  cliente._sembrarDeposito = (extra = {}) => {
    const fila = { id: siguienteId("deposito"), nombre: `Depósito ${secuencias.deposito + 1}`, activo: true, esCentral: false, ...extra };
    datos.deposito.push(fila);
    return fila;
  };

  cliente._sembrarTipoMovimiento = (extra = {}) => {
    const fila = {
      id: siguienteId("tipoMovimientoStock"),
      descripcion: "Salida por Consumo Interno",
      tipo: "S",
      contexto: "NORMAL",
      activo: true,
      ...extra,
    };
    datos.tipoMovimientoStock.push(fila);
    return fila;
  };

  cliente._sembrarArticulo = (extra = {}) => {
    const fila = { id: siguienteId("articulo"), nombre: `Artículo ${secuencias.articulo + 1}`, activo: true, categoria: "Alimentos y Bebidas", unidadMedida: "UN", ...extra };
    datos.articulo.push(fila);
    return fila;
  };

  // Habilita un artículo en un depósito con un stock inicial dado — cubre
  // en un solo paso lo que en la app real son dos altas (ArticuloDeposito +
  // su ArticuloDepositoStock).
  cliente._habilitarConStock = ({ articuloId, depositoId, stockActual = 10 }) => {
    const habilitacion = { id: siguienteId("articuloDeposito"), articuloId, depositoId, activo: true };
    datos.articuloDeposito.push(habilitacion);
    datos.articuloDepositoStock.push({
      id: siguienteId("articuloDepositoStock"),
      articuloDepositoId: habilitacion.id,
      stockActual,
      stockMinimo: 0,
      stockMaximo: null,
    });
    return habilitacion;
  };

  return cliente;
}

// Instala la sustitución de `@prisma/client` y `lib/prisma` para que, a
// partir de este punto, cualquier `require` (directo o transitivo, vía
// otro servicio) de esos dos módulos reciba el doble en vez de conectarse
// a la base real. Tiene que llamarse ANTES de requerir cualquier
// `*.servicio.js` real.
function instalarDoble(base) {
  const Module = require("module");
  const cargarModuloOriginal = Module._load;
  Module._load = function (solicitud, ...resto) {
    if (solicitud === "@prisma/client") return { Prisma: PrismaFalso };
    if (/(^|[/\\])lib[/\\]prisma$/.test(solicitud)) return base;
    return cargarModuloOriginal.call(this, solicitud, ...resto);
  };
}

module.exports = { crearBase, instalarDoble, PrismaFalso };
