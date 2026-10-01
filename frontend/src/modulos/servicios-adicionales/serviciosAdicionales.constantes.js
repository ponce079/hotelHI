// Mismas listas fijas que backend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js,
// duplicadas a mano (misma convención que el resto de Sprint 3).
export const TIPOS_SERVICIO = ["Restaurante", "Spa", "Lavandería", "Minibar", "Otro"];

// Sin variante propia por tipo: son categorías de consumo, no estados —
// "alerta" (tinte latón) para las 4 evita sugerir que alguna es "mejor",
// "peor" o tiene una condición operativa distinta de las demás. Mismo
// tinte que usan las tarjetas de totales de ServiciosAdicionalesPage.jsx.
export const TIPO_SERVICIO_BADGE = {
  Restaurante: "alerta",
  Spa: "alerta",
  Lavandería: "alerta",
  Minibar: "alerta",
};

export const LIMITES_SERVICIOS_ADICIONALES = {
  registradoPor: 100,
};

// Mismo valor que backend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js
// (duplicado a mano, misma convención). El consumo de Minibar SIEMPRE
// descuenta de este depósito fijo — no se le pide a quien carga el consumo
// que elija de dónde sale, solo se usa acá para mostrarle el stock
// disponible real de ese depósito puntual.
export const DEPOSITO_MINIBAR_NOMBRE = "Minibar";
