// Funciones PURAS del e-commerce (sin base ni Express): pasan lo que
// devuelven reservas.servicio.js y el motor de cotización a la forma pública
// del contrato (docs/ecommerce/CONTRATO.md). Las respuestas públicas nunca
// llevan números ni ids de habitación, datos de huéspedes ni códigos de
// reserva: por eso los planes se arman campo por campo.
const { mensajeSeguro } = require("./ecommerce.errores");

const MOTIVO_SIN_DISPONIBILIDAD = "Sin disponibilidad para estas fechas";
const MOTIVO_SIN_TARIFAS = "Sin tarifas disponibles para estas fechas";
const UMBRAL_ULTIMAS_DISPONIBLES = 2;

const motivoCapacidad = (capacidadMaxima) => `Admite hasta ${capacidadMaxima} personas`;

function planLimpio(plan) {
  return {
    planTarifarioId: plan.planTarifarioId ?? null,
    codigo: plan.codigo,
    nombre: plan.nombre,
    reembolsable: plan.reembolsable,
    horasCancelacionSinCargo: plan.reembolsable ? (plan.horasCancelacionSinCargo ?? null) : null,
    penalidadNoShow: plan.penalidadNoShow,
    total: plan.total,
    promedioPorNoche: plan.promedioPorNoche,
  };
}

// Tipos vendibles en la web: activos y con al menos una habitación activa.
// Recibe habitaciones activas con su tipo ({ capacidad, tipoHabitacionId,
// tipoHabitacion: { id, nombre, activo } }). capacidadMaxima = la mayor
// capacidad entre las habitaciones activas del tipo.
function armarTiposWeb(habitaciones) {
  const porTipo = new Map();
  for (const h of habitaciones ?? []) {
    if (!h?.tipoHabitacion?.activo) continue;
    const actual = porTipo.get(h.tipoHabitacionId);
    if (!actual) {
      porTipo.set(h.tipoHabitacionId, {
        tipoHabitacionId: h.tipoHabitacionId,
        nombre: h.tipoHabitacion.nombre,
        capacidadMaxima: h.capacidad,
      });
    } else if (h.capacidad > actual.capacidadMaxima) {
      actual.capacidadMaxima = h.capacidad;
    }
  }
  return [...porTipo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Arma la respuesta de GET /api/web/disponibilidad.
//   tipos: salida de armarTiposWeb (el universo: TODOS aparecen siempre).
//   disponibilidad: salida de consultarDisponibilidad SIN capacidadMinima
//     (habitaciones libres de todas las capacidades + resumenPorTipo con los
//     planes y el motivo del motor por tipo).
// Motivo, en este orden: (a) la ocupación supera la capacidad del tipo;
// (b) ninguna habitación libre con capacidad suficiente; (c) sin planes
// vendibles (motivo del motor si es seguro, si no el genérico); null si se
// puede reservar. Con motivo, planes: [] y desdePorNoche: null.
function armarDisponibilidadWeb({ tipos, disponibilidad, adultos, menores, fechaDesde, fechaHasta }) {
  const personas = adultos + menores;
  const resumenPorTipo = new Map((disponibilidad?.resumenPorTipo ?? []).map((r) => [r.tipoHabitacionId, r]));
  const libres = disponibilidad?.habitaciones ?? [];

  return {
    fechaDesde,
    fechaHasta,
    noches: disponibilidad?.noches ?? null,
    tipos: (tipos ?? []).map((tipo) => {
      const libresQueAlcanzan = libres.filter(
        (h) => h.tipoHabitacionId === tipo.tipoHabitacionId && h.capacidad >= personas
      ).length;
      const resumen = resumenPorTipo.get(tipo.tipoHabitacionId);
      const planes = (resumen?.planes ?? []).map(planLimpio);

      let motivoNoDisponible = null;
      if (personas > tipo.capacidadMaxima) motivoNoDisponible = motivoCapacidad(tipo.capacidadMaxima);
      else if (libresQueAlcanzan === 0) motivoNoDisponible = MOTIVO_SIN_DISPONIBILIDAD;
      else if (planes.length === 0) motivoNoDisponible = mensajeSeguro(resumen?.motivoNoDisponible, MOTIVO_SIN_TARIFAS);

      const base = { tipoHabitacionId: tipo.tipoHabitacionId, nombre: tipo.nombre, capacidadMaxima: tipo.capacidadMaxima };
      if (motivoNoDisponible) {
        return { ...base, ultimasDisponibles: false, desdePorNoche: null, planes: [], motivoNoDisponible };
      }
      return {
        ...base,
        ultimasDisponibles: libresQueAlcanzan <= UMBRAL_ULTIMAS_DISPONIBLES,
        desdePorNoche: Math.min(...planes.map((p) => p.promedioPorNoche)),
        planes,
        motivoNoDisponible: null,
      };
    }),
  };
}

// Habitación "representante" por línea de la selección: la que se cotiza
// en POST /api/web/cotizar y la que va a asignar el alta real en la 1B-2
// (HU-100) — mismo criterio en los dos lados, así totalEsperado coincide:
//   - las líneas se atienden de MAYOR a menor cantidad de personas (así una
//     línea chica no se queda con la única habitación grande);
//   - a cada una, la habitación libre de su tipo, todavía no usada, con la
//     MENOR capacidad que alcance; desempate por id;
//   - dos líneas del mismo tipo nunca comparten habitación.
// Devuelve un id por línea, en el orden original, o null si alguna línea no
// tiene habitación (quien llama responde SIN_DISPONIBILIDAD).
function elegirRepresentantes(libres, lineas) {
  const usadas = new Set();
  const elegidas = new Array(lineas.length).fill(null);
  const orden = lineas
    .map((linea, indice) => ({ linea, indice, personas: linea.adultos + linea.menores }))
    .sort((a, b) => b.personas - a.personas || a.indice - b.indice);

  for (const { linea, indice, personas } of orden) {
    const candidata = libres
      .filter((h) => h.tipoHabitacionId === linea.tipoHabitacionId && h.capacidad >= personas && !usadas.has(h.id))
      .sort((a, b) => a.capacidad - b.capacidad || a.id - b.id)[0];
    if (!candidata) return null;
    usadas.add(candidata.id);
    elegidas[indice] = candidata.id;
  }
  return elegidas;
}

// Respuesta de POST /api/web/cotizar a partir de la cotización del sistema
// (cotizarParaReserva, ya filtrada a un solo plan) — sin ids de habitación.
function armarCotizacionWeb({ cotizacion, lineas, representantes, nombrePorTipo }) {
  const plan = cotizacion.planes[0];
  const habitacionDelPlan = new Map(plan.habitaciones.map((h) => [h.habitacionId, h]));
  // Precio final de cada noche (IVA incluido), del mismo cálculo que el subtotal: su suma es exactamente el subtotal.
  const nochesDe = (h) => (h?.detalle ?? []).map((n) => ({ fecha: n.fecha, precio: n.precioNoche }));
  return {
    total: plan.total,
    promedioPorNoche: plan.promedioPorNoche,
    noches: cotizacion.noches,
    plan: planLimpio(plan),
    habitaciones: lineas.map((linea, i) => ({
      tipo: nombrePorTipo.get(linea.tipoHabitacionId) ?? null,
      adultos: linea.adultos,
      menores: linea.menores,
      subtotal: habitacionDelPlan.get(representantes[i])?.total ?? null,
      noches: nochesDe(habitacionDelPlan.get(representantes[i])),
    })),
  };
}

module.exports = {
  MOTIVO_SIN_DISPONIBILIDAD,
  MOTIVO_SIN_TARIFAS,
  UMBRAL_ULTIMAS_DISPONIBLES,
  motivoCapacidad,
  planLimpio,
  armarTiposWeb,
  armarDisponibilidadWeb,
  elegirRepresentantes,
  armarCotizacionWeb,
};
