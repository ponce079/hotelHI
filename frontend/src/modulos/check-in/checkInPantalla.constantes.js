// Constantes de la pantalla única de check-in. Las de garantía siguen en checkIn.constantes.js.

// Hora desde la que se entrega la habitación. Duplica a mano HORA_CHECKIN de
// backend/src/modulos/tarifas/tarifas.constantes.js (misma convención que el resto de las
// constantes compartidas): si cambia allá, cambia acá.
export const HORA_CHECKIN = "14:00";

// Hora de salida: es la política del hotel y se muestra solo como información ("hasta las
// 10:00"). No participa en ningún cálculo (precio, noches, penalidades).
export const HORA_CHECKOUT = "10:00";

// Dos criterios de edad que no se mezclan (mismos valores que backend/src/lib/fechas.js):
//   - EDAD_ADULTO_OCUPACION: solo para contar adultos y menores (y el precio).
//   - MAYORIA_EDAD: titular de habitación, responsable de un menor y quién necesita uno.
export const EDAD_ADULTO_OCUPACION = 13;
export const MAYORIA_EDAD = 18;

// Menor que ingresa sin documento: el backend exige el documento o una justificación.
export const MOTIVO_MENOR_SIN_DOCUMENTO = "Menor sin documento presentado";

export const NOCHES_MINIMAS_WALKIN = 1;
export const NOCHES_MAXIMAS_WALKIN = 30;

// La persona que vuelve se busca solo con un número de al menos esta longitud: nunca parciales.
export const LARGO_MINIMO_DOCUMENTO = 6;
export const DEMORA_BUSQUEDA_DOCUMENTO_MS = 400;
export const DEMORA_BUSQUEDA_LLEGADAS_MS = 300;
