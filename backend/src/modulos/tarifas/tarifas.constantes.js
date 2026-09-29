// Etapa 2 de tarifas por temporada (HU-90 a HU-93) — listas fijas
// validadas en código, mismo criterio que el resto del proyecto (el
// schema guarda String suelto, la lista válida vive acá).

const NIVEL_TEMPORADA = {
  BASE: "BASE",
  BAJA: "BAJA",
  MEDIA: "MEDIA",
  ALTA: "ALTA",
  EVENTO: "EVENTO",
};
const NIVELES_TEMPORADA = [NIVEL_TEMPORADA.BASE, NIVEL_TEMPORADA.BAJA, NIVEL_TEMPORADA.MEDIA, NIVEL_TEMPORADA.ALTA, NIVEL_TEMPORADA.EVENTO];

// Mayor número = prevalece en un solapamiento entre niveles distintos
// (regla de negocio 2/HU-90): EVENTO > ALTA > MEDIA > BAJA > BASE.
const PRIORIDAD_NIVEL = {
  [NIVEL_TEMPORADA.BASE]: 0,
  [NIVEL_TEMPORADA.BAJA]: 1,
  [NIVEL_TEMPORADA.MEDIA]: 2,
  [NIVEL_TEMPORADA.ALTA]: 3,
  [NIVEL_TEMPORADA.EVENTO]: 4,
};

const TIPO_PLAN = { BASE: "BASE", DERIVADO: "DERIVADO" };
const TIPOS_PLAN = [TIPO_PLAN.BASE, TIPO_PLAN.DERIVADO];

const PENALIDAD_NO_SHOW = { PRIMERA_NOCHE: "PRIMERA_NOCHE", TOTAL_ESTADIA: "TOTAL_ESTADIA" };
const PENALIDADES_NO_SHOW = [PENALIDAD_NO_SHOW.PRIMERA_NOCHE, PENALIDAD_NO_SHOW.TOTAL_ESTADIA];

const ESTADO_LOTE = { APLICADO: "Aplicado", ANULADO: "Anulado" };

const LIMITES_TARIFAS = {
  nombreTemporada: 80,
  motivoBaja: 300,
  nombrePlan: 80,
  codigoPlanMax: 20,
  motivoLote: 300,
  motivoAnulacionLote: 300,
};

// Modificador por día de semana (HU-92) y descuento de un plan derivado.
const RANGO_MODIFICADOR_DIA = { min: -50, max: 50 };

// Motor de cotización (Etapa 3, HU-94).
const MAX_NOCHES_ESTADIA = 30;
const EDAD_MAXIMA_MENOR_SIN_CARGO = 12;

module.exports = {
  NIVEL_TEMPORADA,
  NIVELES_TEMPORADA,
  PRIORIDAD_NIVEL,
  TIPO_PLAN,
  TIPOS_PLAN,
  PENALIDAD_NO_SHOW,
  PENALIDADES_NO_SHOW,
  ESTADO_LOTE,
  LIMITES_TARIFAS,
  RANGO_MODIFICADOR_DIA,
  MAX_NOCHES_ESTADIA,
  EDAD_MAXIMA_MENOR_SIN_CARGO,
};
