// Duplicado a mano del backend (tarifas.constantes.js) — mismo criterio
// que el resto de los módulos con listas fijas/límites.

export const NIVELES_TEMPORADA = ["BASE", "BAJA", "MEDIA", "ALTA", "EVENTO"];

export const NIVEL_TEMPORADA_LABEL = {
  BASE: "Base",
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
  EVENTO: "Evento especial",
};

// Mismo espíritu que ESTADO_HABITACION_COLOR (habitaciones.constantes.js)
// — tinte fuerte por nivel, para el calendario anual (HU-90).
export const NIVEL_TEMPORADA_COLOR = {
  BASE: { fondo: "#e4e1d6", texto: "#5a5340", borde: "#cbc6b3" },
  BAJA: { fondo: "#cfe4d8", texto: "#1f4d3a", borde: "#a9cdb7" },
  MEDIA: { fondo: "#f0dcab", texto: "#7c541f", borde: "#dfbd77" },
  ALTA: { fondo: "#f2c6b9", texto: "#8f3322", borde: "#e4a08c" },
  EVENTO: { fondo: "#ddc6ea", texto: "#5a2d73", borde: "#c5a3da" },
};

export const TIPOS_PLAN = ["BASE", "DERIVADO"];
export const PENALIDADES_NO_SHOW = ["PRIMERA_NOCHE", "TOTAL_ESTADIA"];
export const PENALIDAD_NO_SHOW_LABEL = {
  PRIMERA_NOCHE: "Primera noche",
  TOTAL_ESTADIA: "Total de la estadía",
};

export const RANGO_MODIFICADOR_DIA = { min: -50, max: 50 };

export const DIA_SEMANA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export const LIMITES_TARIFAS = {
  nombreTemporada: 80,
  motivoBaja: 300,
  nombrePlan: 80,
  codigoPlanMax: 20,
  motivoLote: 300,
  motivoAnulacionLote: 300,
};

export const ESTADO_LOTE = { APLICADO: "Aplicado", ANULADO: "Anulado" };

// Motor de cotización (Etapa 3, HU-94).
export const EDAD_MAXIMA_MENOR_SIN_CARGO = 12;
