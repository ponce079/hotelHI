// Mismos valores que CargoVerificacionCheckout.tipo en el backend
// (backend/src/modulos/check-out/checkOut.constantes.js), duplicados a mano:
// el frontend no importa nada del backend.
export const TIPOS_CARGO_VERIFICACION = [
  { valor: "Daño", etiqueta: "Daño en la habitación" },
  { valor: "Faltante", etiqueta: "Faltante de un elemento" },
  { valor: "ConsumoNoRegistrado", etiqueta: "Consumo de minibar no registrado" },
];

export const ETIQUETA_TIPO_CARGO = Object.fromEntries(TIPOS_CARGO_VERIFICACION.map((t) => [t.valor, t.etiqueta]));

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
