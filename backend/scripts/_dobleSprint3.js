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

// Prisma real acepta tanto `include: { reserva: { include: {...} } }` como
// `include: { reserva: { select: {...} } }` para bajar un nivel más en una
// relación (select además recorta campos, que acá no importa: el doble
// siempre expone la fila completa). Este doble es más simple: sus `if
// (include.campo)` esperan las flags DIRECTO en el objeto, sin el
// select/include intermedio — así que antes de pasar el include de una
// relación a `expandir` en el nivel de abajo, hay que desenvolverlo. Sin
// esto, un `reserva: { select: { huesped: {...} } }` (el patrón real que ya
// usa comprobanteEstadia.servicio.js) expandía la reserva pero nunca el
// huésped adentro — bug latente hasta que pagoEstadia.servicio.js
// (listarMovimientos, HU-88) fue el primero en de verdad leer ese campo.
function desenvolverInclude(valor) {
  if (valor === true || !valor) return {};
  return valor.select || valor.include || valor;
}

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
  "tipoHabitacion",
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
  // Sumadas para pruebas-integracion-mantenimiento-checkout.js: lo mínimo
  // que necesita consolidarCargos (checkOut.servicio.js) para no fallar al
  // leerlas — cargoVerificacionCheckout y pagoEstadiaMedio quedan vacías en
  // esas pruebas a propósito (tarifaPorNoche = 0 en la habitación sembrada,
  // así el saldo da 0 sin necesidad de simular un pago real).
  "cargoVerificacionCheckout",
  "pagoEstadia",
  "pagoEstadiaMedio",
  // Sumada para pruebas-checkout-facturacion.js (crearComprobante,
  // crearNotaCredito, anularComprobante, reporteCajaDiaria). No la usa
  // ningún otro script hoy.
  "comprobanteEstadia",
  // Etapa 2 de tarifas por temporada (HU-90 a HU-93).
  "temporada",
  "planTarifario",
  "tarifa",
  "modificadorDiaSemana",
  "loteActualizacionTarifaria",
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
  cargoVerificacionCheckout: "fechaHora",
  pagoEstadia: "fecha",
  comprobanteEstadia: "fecha",
};

// Mismo problema que CAMPO_FECHA_POR_DEFECTO pero para `Boolean
// @default(false)` — sumado para pruebas-checkout-facturacion.js:
// pagoEstadiaServicio.crearPago y comprobanteEstadiaServicio.crearComprobante/
// crearNotaCredito no setean `anulado` a mano (confían en el default del
// schema), así que sin esto quedaba `undefined` en el doble y cualquier
// `where: { anulado: false }` (el chequeo de "comprobante vigente", el de
// "pagos no anulados" de consolidarCargos, etc.) no matcheaba nunca.
const CAMPO_BOOLEANO_FALSE_POR_DEFECTO = {
  pagoEstadia: ["anulado"],
  comprobanteEstadia: ["anulado"],
};

// Mismo problema, para `Boolean @default(true)` — sumado para HU-89:
// tiposHabitacion.servicio.js no setea `activo` a mano al crear (confía en
// el default del schema, mismo criterio que crearProveedor en
// proveedores.servicio.js), así que sin esto quedaba `undefined` en el
// doble y `listarTiposHabitacion({activo:"true"})` no matcheaba nunca.
const CAMPO_BOOLEANO_TRUE_POR_DEFECTO = {
  tipoHabitacion: ["activo"],
  // Etapa 2 de tarifas por temporada: temporadas.servicio.js/
  // planesTarifarios.servicio.js tampoco setean `activa`/`activo` a mano
  // al crear (mismo criterio de arriba).
  temporada: ["activa"],
  planTarifario: ["activo"],
};

// Mismo problema, para un default de tipo texto (`String @default("...")`)
// — sumado para HU-93: lotesActualizacion.servicio.js no setea `estado` a
// mano al crear un lote (confía en el default "Aplicado" del schema).
const CAMPO_STRING_POR_DEFECTO = {
  loteActualizacionTarifaria: { estado: "Aplicado" },
};

// Relaciones 1-a-N creadas con la sintaxis anidada de Prisma
// (`campo: { create: [...] }` dentro de un `.create`/`.update`) que de
// verdad usa código real de este proyecto — sin esto, el doble guardaba el
// objeto `{ create: [...] }` tal cual como si fuera un campo más, en vez de
// crear las filas hijas en su propia tabla.
const RELACIONES_ANIDADAS = {
  reserva: { reservaHabitaciones: { tabla: "reservaHabitacion", fk: "reservaId" } },
  // pagoEstadiaServicio.crearPago: `medios: { create: [...] }`.
  pagoEstadia: { medios: { tabla: "pagoEstadiaMedio", fk: "pagoEstadiaId" } },
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
      // HU-89 — tiposHabitacion.servicio.js (listarTiposHabitacion con
      // conHabitacionActiva) filtra por la relación inversa Habitacion[].
      if (tabla === "tipoHabitacion" && campo === "habitaciones") {
        const propias = datos.habitacion.filter((h) => h.tipoHabitacionId === registro.id);
        if (condicion.some) return propias.some((h) => coincide("habitacion", h, condicion.some));
        throw new Error("Solo se soporta `some` sobre habitaciones");
      }
      // Etapa 2 de tarifas por temporada — lotesActualizacion.servicio.js
      // busca conflictos con el índice único compuesto de Tarifa
      // (@@unique([tipoHabitacionId, temporadaId, vigenteDesde])). Prisma
      // real nombra esa clave concatenando los 3 campos con "_"; el doble
      // la desarma y evalúa los 3 como un where plano normal.
      if (tabla === "tarifa" && campo === "tipoHabitacionId_temporadaId_vigenteDesde") {
        return coincide(tabla, registro, condicion);
      }

      // --- Relación de checkOut.servicio.js (consolidarCargos: filtra
      // pagoEstadiaMedio por el pagoEstadia al que pertenece) ---
      if (tabla === "pagoEstadiaMedio" && campo === "pagoEstadia") {
        const pago = datos.pagoEstadia.find((p) => p.id === registro.pagoEstadiaId);
        return pago ? coincide("pagoEstadia", pago, condicion) : false;
      }
      // --- Relación de pagoEstadia.servicio.js (listarMovimientos, HU-88:
      // el filtro `q` busca por reserva.codigoConfirmacion o
      // reserva.huesped.nombre) ---
      if (tabla === "pagoEstadia" && campo === "reserva") {
        const reserva = datos.reserva.find((r) => r.id === registro.reservaId);
        return reserva ? coincide("reserva", reserva, condicion) : false;
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
        // HU-89: honra el include anidado hasta tipoHabitacion (INCLUDE_RESERVA
        // en reservas.servicio.js pide reservaHabitaciones.habitacion.tipoHabitacion)
        // en vez del find() plano de antes, que no expandía nada más abajo de
        // habitacion.
        const incluirHabitacion = desenvolverInclude(include.reservaHabitaciones).habitacion;
        salida.reservaHabitaciones = datos.reservaHabitacion
          .filter((rh) => rh.reservaId === registro.id)
          .map((rh) => {
            const habitacion = datos.habitacion.find((h) => h.id === rh.habitacionId) ?? null;
            return {
              ...rh,
              habitacion: habitacion ? expandir("habitacion", habitacion, desenvolverInclude(incluirHabitacion)) : null,
            };
          });
      }
      if (include.notificaciones) {
        salida.notificaciones = datos.notificacion.filter((n) => n.reservaId === registro.id);
      }
    }
    if (tabla === "reservaHabitacion") {
      if (include.habitacion) {
        const habitacion = datos.habitacion.find((h) => h.id === registro.habitacionId) ?? null;
        salida.habitacion = habitacion ? expandir("habitacion", habitacion, desenvolverInclude(include.habitacion)) : null;
      }
      if (include.reserva) salida.reserva = datos.reserva.find((r) => r.id === registro.reservaId) ?? null;
    }
    if (tabla === "habitacion") {
      if (include.ordenesMantenimiento) {
        salida.ordenesMantenimiento = datos.ordenMantenimiento
          .filter((o) => o.habitacionId === registro.id)
          .map((o) => ({ ...o, notificaciones: datos.notificacion.filter((n) => n.ordenMantenimientoId === o.id) }));
      }
      // HU-89 — habitaciones.servicio.js/reservas.servicio.js/checkOut.servicio.js
      // ahora piden `include: { tipoHabitacion: ... }` para armar `conTipoPlano`.
      if (include.tipoHabitacion) {
        salida.tipoHabitacion = datos.tipoHabitacion.find((t) => t.id === registro.tipoHabitacionId) ?? null;
      }
    }
    // Reverso de la relación de arriba — lo usa resolverOrdenMantenimiento
    // (habitaciones.servicio.js) al leer la orden con su habitación para
    // decidir a qué estado restaurarla. Nunca antes ejercitado por un
    // script: pruebas-habitaciones.js solo prueba cambiarEstadoHabitacion.
    if (tabla === "ordenMantenimiento") {
      if (include.habitacion) salida.habitacion = datos.habitacion.find((h) => h.id === registro.habitacionId) ?? null;
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
    // Relaciones de pagoEstadia.servicio.js (pruebas-checkout-facturacion.js).
    if (tabla === "pagoEstadia") {
      if (include.medios) {
        salida.medios = datos.pagoEstadiaMedio.filter((m) => m.pagoEstadiaId === registro.id);
      }
      if (include.reserva) {
        const reserva = datos.reserva.find((r) => r.id === registro.reservaId);
        salida.reserva = reserva ? expandir("reserva", reserva, desenvolverInclude(include.reserva)) : null;
      }
    }
    // Relaciones de comprobanteEstadia.servicio.js (pruebas-checkout-facturacion.js):
    // mismo mecanismo auto-referenciado (tipo + comprobanteRelacionadoId) que
    // ComprobanteProveedor.ajustes en Sprint 2.
    if (tabla === "comprobanteEstadia") {
      if (include.ajustes) {
        const condicionAjustes = include.ajustes === true ? {} : (include.ajustes.where ?? {});
        salida.ajustes = datos.comprobanteEstadia.filter((c) =>
          coincide("comprobanteEstadia", c, { comprobanteRelacionadoId: registro.id, ...condicionAjustes })
        );
      }
      if (include.comprobanteRelacionado) {
        salida.comprobanteRelacionado =
          datos.comprobanteEstadia.find((c) => c.id === registro.comprobanteRelacionadoId) ?? null;
      }
      if (include.reserva) {
        const reserva = datos.reserva.find((r) => r.id === registro.reservaId);
        salida.reserva = reserva ? expandir("reserva", reserva, desenvolverInclude(include.reserva)) : null;
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
    // Etapa 2 de tarifas por temporada — lotesActualizacion.servicio.js lee
    // el lote con sus Tarifa asociadas (relación inversa) para reportar el
    // resultado de confirmarActualizacion y para revisar cada celda al anular.
    if (tabla === "loteActualizacionTarifaria") {
      if (include.tarifas) {
        salida.tarifas = datos.tarifa.filter((t) => t.loteActualizacionId === registro.id);
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
      // Usado por resolverOrdenMantenimiento (habitaciones.servicio.js) para
      // saber si queda otra orden "Pendiente" antes de restaurar el estado.
      count: async ({ where = {} } = {}) => datos[tabla].filter((r) => coincide(tabla, r, where)).length,
      findUnique: async ({ where = {}, include, select } = {}) => {
        const fila = datos[tabla].find((r) => coincide(tabla, r, where));
        if (!fila) return null;
        if (select) return Object.fromEntries(Object.keys(select).map((k) => [k, fila[k]]));
        return expandir(tabla, fila, include ?? {});
      },
      // Solo `_sum` (lo único que usa consolidarCargos en checkOut.servicio.js,
      // vía pagoEstadiaMedio.aggregate). Mismo criterio que Prisma real: si no
      // hay filas que matcheen, el campo da `null`, no 0 — por eso el
      // `Number(x || 0)` que ya hace el código que lo consume.
      // Usado por reporteCajaDiaria (comprobanteEstadia.servicio.js) sobre
      // pagoEstadiaMedio.groupBy y consumoServicioAdicional.groupBy. Solo
      // soporta `by` (un campo o varios) + `_sum` — es lo único que pide
      // ese reporte hoy.
      groupBy: async ({ by, where = {}, _sum } = {}) => {
        const claves = Array.isArray(by) ? by : [by];
        const filas = datos[tabla].filter((r) => coincide(tabla, r, where));
        const grupos = new Map();
        for (const fila of filas) {
          const clave = claves.map((c) => fila[c]).join("|");
          if (!grupos.has(clave)) grupos.set(clave, []);
          grupos.get(clave).push(fila);
        }
        return [...grupos.values()].map((filasDelGrupo) => {
          const resultado = {};
          claves.forEach((c) => {
            resultado[c] = filasDelGrupo[0][c];
          });
          if (_sum) {
            resultado._sum = Object.fromEntries(
              Object.keys(_sum).map((campo) => [campo, filasDelGrupo.reduce((acc, f) => acc + Number(f[campo] ?? 0), 0)])
            );
          }
          return resultado;
        });
      },
      aggregate: async ({ where = {}, _sum } = {}) => {
        const filas = datos[tabla].filter((r) => coincide(tabla, r, where));
        const resultado = {};
        if (_sum) {
          resultado._sum = Object.fromEntries(
            Object.keys(_sum).map((campo) => [
              campo,
              filas.length ? filas.reduce((acc, f) => acc + Number(f[campo] ?? 0), 0) : null,
            ])
          );
        }
        return resultado;
      },
      create: async ({ data, include }) => {
        const relaciones = RELACIONES_ANIDADAS[tabla] ?? {};
        const propios = { ...data };
        for (const clave of Object.keys(relaciones)) delete propios[clave];
        const fila = { id: siguienteId(tabla), ...propios };
        const campoFecha = CAMPO_FECHA_POR_DEFECTO[tabla];
        if (campoFecha && fila[campoFecha] === undefined) fila[campoFecha] = ahoraFalso();
        for (const campoBool of CAMPO_BOOLEANO_FALSE_POR_DEFECTO[tabla] ?? []) {
          if (fila[campoBool] === undefined) fila[campoBool] = false;
        }
        for (const campoBool of CAMPO_BOOLEANO_TRUE_POR_DEFECTO[tabla] ?? []) {
          if (fila[campoBool] === undefined) fila[campoBool] = true;
        }
        for (const [campoString, valorDefecto] of Object.entries(CAMPO_STRING_POR_DEFECTO[tabla] ?? {})) {
          if (fila[campoString] === undefined) fila[campoString] = valorDefecto;
        }
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
        // Etapa 2 de tarifas por temporada — @@unique([tipoHabitacionId,
        // temporadaId, vigenteDesde]) de Tarifa (precios.servicio.js:crearTarifa
        // depende de este P2002 para el mensaje de "ya existe una versión...").
        if (
          tabla === "tarifa" &&
          datos.tarifa.some(
            (t) =>
              t.tipoHabitacionId === fila.tipoHabitacionId &&
              t.temporadaId === fila.temporadaId &&
              t.vigenteDesde?.getTime() === fila.vigenteDesde?.getTime()
          )
        ) {
          throw new PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            meta: { target: ["tipoHabitacionId", "temporadaId", "vigenteDesde"] },
          });
        }
        datos[tabla].push(fila);
        for (const [clave, { tabla: tablaHija, fk }] of Object.entries(relaciones)) {
          const anidado = data[clave];
          if (anidado?.create) {
            for (const hijo of anidado.create) {
              datos[tablaHija].push({ id: siguienteId(tablaHija), [fk]: fila.id, ...hijo });
            }
          }
        }
        return expandir(tabla, fila, include ?? {});
      },
      update: async ({ where, data, include }) => {
        const fila = datos[tabla].find((r) => coincide(tabla, r, where));
        if (!fila) throw new Error(`No existe la fila a actualizar en ${tabla}`);
        const relaciones = RELACIONES_ANIDADAS[tabla] ?? {};
        const propios = { ...data };
        for (const clave of Object.keys(relaciones)) delete propios[clave];
        // Soporta `{ decrement: n }` (usado por articuloDepositoStock).
        for (const [campo, valor] of Object.entries(propios)) {
          if (valor && typeof valor === "object" && "decrement" in valor) {
            fila[campo] = Number(fila[campo]) - Number(valor.decrement);
          } else {
            fila[campo] = valor;
          }
        }
        for (const [clave, { tabla: tablaHija, fk }] of Object.entries(relaciones)) {
          const anidado = data[clave];
          if (anidado?.create) {
            for (const hijo of anidado.create) {
              datos[tablaHija].push({ id: siguienteId(tablaHija), [fk]: fila.id, ...hijo });
            }
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
      // Singular — sumado para HU-92 (precios.servicio.js:eliminarTarifa,
      // borra una versión futura puntual por id). A diferencia de
      // deleteMany, Prisma real tira P2025 si no encuentra la fila; acá no
      // hace falta reproducir ese detalle porque los servicios que llaman
      // a esto ya validan `findUnique` antes de borrar.
      delete: async ({ where = {} }) => {
        const fila = datos[tabla].find((r) => coincide(tabla, r, where));
        datos[tabla] = datos[tabla].filter((r) => r !== fila);
        return fila;
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
  // Cola FIFO de transacciones — sumada para pruebas-checkout-facturacion.js
  // (condición de carrera de crearPago). Sin esto, dos `$transaction`
  // lanzadas con Promise.all se interlazarían libremente con el event loop
  // de JS: las dos leerían el saldo "viejo" antes de que cualquiera
  // escriba, y las dos pasarían la validación — exactamente el doble cobro
  // que el `SELECT ... FOR UPDATE` real evita en MySQL bloqueando la
  // segunda transacción hasta que la primera libera la fila. Acá no hay
  // filas reales que lockear, así que se simula con un mutex global: la
  // segunda transacción espera a que la primera termine (commit o
  // rollback) antes de correr su propio cuerpo. Es más estricto que un
  // lock real (serializa TODAS las transacciones concurrentes, no solo
  // las que compiten por la misma fila), pero para probar que el patrón
  // "recalcular con lock adentro de la transacción" evita la carrera,
  // alcanza y sobra.
  //
  // Reentrante a propósito (cuenta `profundidad`, solo espera en la cola
  // si es la llamada MÁS externa): `movimientoSalida.servicio.js` abre su
  // propia `cliente.$transaction` cuando lo llaman con un `tx` que ya está
  // "dentro" de otra transacción (ver su comentario sobre `typeof
  // cliente.$transaction === "function"`) — en Prisma real un `tx` no
  // tiene `$transaction`, así que esa rama nunca se ejecutaría anidada,
  // pero acá `cliente` es el mismo objeto siempre, así que si la cola no
  // fuera reentrante, la transacción anidada de HU-61 (Minibar, ver
  // pruebas-servicios-adicionales.js) esperaría para siempre a que la
  // transacción externa (que la está esperando a ELLA) termine —
  // deadlock. Con `profundidad`, solo la llamada externa hace cola; las
  // anidadas corren enseguida, igual que antes de sumar este mutex.
  let colaTransacciones = Promise.resolve();
  let profundidadTransaccion = 0;
  cliente.$transaction = async (fn, _opciones) => {
    if (typeof fn !== "function") return Promise.all(fn);
    let liberar = null;
    if (profundidadTransaccion === 0) {
      const anterior = colaTransacciones;
      colaTransacciones = new Promise((resolve) => {
        liberar = resolve;
      });
      await anterior;
    }
    profundidadTransaccion += 1;
    try {
      const snapshot = structuredClone(datos);
      try {
        return await fn(cliente);
      } catch (err) {
        for (const tabla of TABLAS) datos[tabla] = snapshot[tabla];
        throw err;
      }
    } finally {
      profundidadTransaccion -= 1;
      if (liberar) liberar();
    }
  };

  cliente._limpiar = () => {
    for (const tabla of TABLAS) datos[tabla] = [];
    for (const tabla of TABLAS) secuencias[tabla] = 0;
  };

  // HU-89: sigue aceptando `tipo` como string de conveniencia (mínimo
  // churn en los scripts pruebas-*.js existentes), pero por debajo
  // resuelve-o-crea un TipoHabitacion real y setea tipoHabitacionId — así
  // la FK se ejercita de verdad. `tipoHabitacionId` explícito en `extra`
  // gana si viene (para las pruebas que sí quieren un tipo puntual, ej.
  // uno ya dado de baja).
  cliente._resolverOCrearTipoHabitacion = (nombre, extra = {}) => {
    let tipoRow = datos.tipoHabitacion.find((t) => t.nombre.toLowerCase() === String(nombre).toLowerCase());
    if (!tipoRow) {
      const codigo = String(nombre).toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 10) || "TIPO";
      tipoRow = {
        id: siguienteId("tipoHabitacion"),
        codigo,
        nombre,
        descripcion: null,
        activo: true,
        // Etapa 2 de tarifas por temporada (HU-92) — default del schema,
        // overrideable por las pruebas que necesiten un tipo con otra
        // ocupación puntual.
        ocupacionBase: 2,
        creadoEn: ahoraFalso(),
        actualizadoEn: ahoraFalso(),
        ...extra,
      };
      datos.tipoHabitacion.push(tipoRow);
    }
    return tipoRow;
  };

  cliente._sembrarHabitacion = (extra = {}) => {
    const { tipo = "Doble", tipoHabitacionId, ...resto } = extra;
    const tipoId = tipoHabitacionId ?? cliente._resolverOCrearTipoHabitacion(tipo).id;
    const fila = {
      id: siguienteId("habitacion"),
      activo: true,
      estado: "libre",
      piso: 1,
      capacidad: 2,
      tipoHabitacionId: tipoId,
      equipamiento: null,
      tarifaPorNoche: 50000,
      ...resto,
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
    // Dos formas de pedirlo según desde dónde se requiere: "../../lib/prisma"
    // (la mayoría de los *.servicio.js) o "./prisma" (archivos que ya viven
    // adentro de src/lib/, como comprobantes.js — sumado al requerir
    // checkOut.servicio.js para pruebas-integracion-mantenimiento-checkout.js,
    // que es el primer script que lo trae transitivamente).
    if (/(^|[/\\])lib[/\\]prisma$/.test(solicitud) || solicitud === "./prisma") return base;
    return cargarModuloOriginal.call(this, solicitud, ...resto);
  };
}

module.exports = { crearBase, instalarDoble, PrismaFalso };
