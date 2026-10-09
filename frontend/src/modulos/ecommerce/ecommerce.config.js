// Datos del hotel que muestra el sitio web. Proyecto académico: los datos de contacto son FICTICIOS.
// Tienen que ser los mismos que backend/src/modulos/ecommerce/ecommerce.hotel.js (los emails).
export const HOTEL = {
  nombre: "Holiday Inn",
  bajada: "Salta",
  direccion: "Av. Bicentenario de la Batalla de Salta 1250, A4400 Salta Capital, Argentina",
  // La misma dirección en dos líneas, para el pie del sitio.
  direccionCalle: "Av. Bicentenario de la Batalla de Salta 1250",
  direccionCiudad: "A4400 Salta Capital, Argentina",
  telefono: "+54 387 400-0000",
  email: "reservas@holidayinnsalta.com.ar",
  recepcion: "24 hs",
  // HORA_CHECKIN del backend (backend/src/modulos/tarifas/tarifas.constantes.js).
  checkIn: "14 h",
  // Hora de salida del hotel (rediseño del sitio: hasta las 11).
  checkOut: "11 h",
};
