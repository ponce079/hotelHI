// Datos de contacto del hotel para los emails del e-commerce. Proyecto académico: los datos son
// FICTICIOS. Tienen que ser los MISMOS que frontend/src/modulos/ecommerce/ecommerce.config.js
// (ecommerce.hotel.test.js lo verifica leyendo ese archivo como texto).
const { HORA_CHECKIN } = require("../tarifas/tarifas.constantes");

const HOTEL = {
  nombre: "Holiday Inn",
  bajada: "Salta",
  direccion: "Av. Bicentenario de la Batalla de Salta 1250, A4400 Salta Capital, Argentina",
  telefono: "+54 387 400-0000",
  email: "reservas@holidayinnsalta.com.ar",
  checkIn: `${HORA_CHECKIN.hora} h`,
  checkOut: "11 h",
};

module.exports = { HOTEL };
