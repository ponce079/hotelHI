// Mismos valores que CargoVerificacionCheckout.tipo en el backend
// (backend/src/modulos/check-out/checkOut.constantes.js), duplicados a mano:
// el frontend no importa nada del backend.
export const TIPOS_CARGO_VERIFICACION = [
  { valor: "Daño", etiqueta: "Daño en la habitación" },
  { valor: "Faltante", etiqueta: "Faltante de un elemento" },
  { valor: "ConsumoNoRegistrado", etiqueta: "Consumo de minibar no registrado" },
];

// Sentinela de "verificación sin novedades" (HU-87, re-auditoría del
// 2026-09-21) — mismo valor que TIPO_VERIFICACION_SIN_NOVEDADES en
// checkOut.constantes.js del backend. No aparece en el desplegable de "qué
// se encontró" (eso sigue siendo solo TIPOS_CARGO_VERIFICACION): lo manda
// directo el botón "Verificación sin novedades" de CheckOutReservaPage.
export const TIPO_VERIFICACION_SIN_NOVEDADES = "SinNovedades";

export const ETIQUETA_TIPO_CARGO = {
  ...Object.fromEntries(TIPOS_CARGO_VERIFICACION.map((t) => [t.valor, t.etiqueta])),
  [TIPO_VERIFICACION_SIN_NOVEDADES]: "Sin novedades",
};

export const LIMITES_VERIFICACION = { descripcion: 500 };

// Pasos del check-out para <PasoAPaso>. El último ("Cierre") es el único
// que necesita `ultimoPasoRequiereLlegada`: hasta que no se confirma de
// verdad no tiene que pintarse como completado.
export const PASOS_CHECKOUT = [
  { clave: "verificacion", label: "Verificación" },
  { clave: "confirmacion", label: "Confirmación de cargos" },
  { clave: "pago", label: "Pago" },
  { clave: "cierre", label: "Cierre", cerrado: true },
];
