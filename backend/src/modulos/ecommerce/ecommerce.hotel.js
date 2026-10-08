// Datos de contacto del hotel para los emails del e-commerce. Proyecto académico: los datos son
// FICTICIOS. Tienen que ser los MISMOS que frontend/src/modulos/ecommerce/ecommerce.config.js
// (ecommerce.hotel.test.js lo verifica leyendo ese archivo como texto).
const { HORA_CHECKIN } = require("../tarifas/tarifas.constantes");

const HOTEL = {
  nombre: "Holiday Inn",
  bajada: "Hotel · Reservas online",
  direccion: "Av. Belgrano 1450, A4400 Salta Capital, Salta",
  telefono: "+54 387 421-0000",
  email: "hotelhi.notificaciones@gmail.com",
  checkIn: `${HORA_CHECKIN.hora} h`,
  checkOut: "10 h",
};

module.exports = { HOTEL };
