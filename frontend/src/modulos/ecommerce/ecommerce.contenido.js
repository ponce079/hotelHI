// Contenido estático por tipo de habitación, indexado por el NOMBRE del tipo
// (el que devuelve /api/web/tipos). Las fotos son placeholders, como en el
// mockup, hasta tener fotos reales. Sin número de habitación ni piso.
import {
  AirVent,
  BedDouble,
  BedSingle,
  Dumbbell,
  Flower2,
  Landmark,
  Leaf,
  Monitor,
  Mountain,
  Refrigerator,
  SquareParking,
  Table2,
  UtensilsCrossed,
  Waves,
  Wifi,
} from "lucide-react";

export const CONTENIDO_TIPOS = {
  Simple: {
    descripcion:
      "Cómoda y funcional, pensada para quien viaja por trabajo o por placer. A pocas cuadras del centro histórico de Salta.",
    descripcionAmpliada:
      "Una habitación tranquila y luminosa para una o dos personas, con escritorio para trabajar, Wi-Fi, aire acondicionado, TV y frigobar. Ideal para estadías cortas: llegás, descansás y salís a recorrer la ciudad a pie, desde la Plaza 9 de Julio hasta el Cerro San Bernardo.",
    comodidades: [
      { nombre: "Wi-Fi", Icono: Wifi },
      { nombre: "TV", Icono: Monitor },
      { nombre: "Aire acondicionado", Icono: AirVent },
      { nombre: "Frigobar", Icono: Refrigerator },
      { nombre: "Escritorio", Icono: Table2 },
      { nombre: "Cama simple", Icono: BedSingle },
    ],
    fotos: ["Foto · Habitación simple", "Foto · Baño", "Foto · Vista", "Foto · Detalle cama", "Foto · Escritorio"],
  },
  Doble: {
    descripcion: "Más espacio para compartir el viaje en pareja, con amigos o en familia, hasta 3 personas.",
    descripcionAmpliada:
      "Amplia y equipada para estadías más largas, con capacidad para hasta tres personas. Tiene Wi-Fi, aire acondicionado, TV y frigobar. Un buen punto de partida para conocer Salta y salir de excursión a los Valles Calchaquíes, la Quebrada de Humahuaca o Cafayate.",
    comodidades: [
      { nombre: "Wi-Fi", Icono: Wifi },
      { nombre: "TV", Icono: Monitor },
      { nombre: "Aire acondicionado", Icono: AirVent },
      { nombre: "Frigobar", Icono: Refrigerator },
      { nombre: "Cama doble", Icono: BedDouble },
    ],
    fotos: ["Foto · Habitación doble", "Foto · Baño", "Foto · Vista", "Foto · Detalle cama", "Foto · Escritorio"],
  },
};

// Para un tipo que todavía no tenga contenido cargado.
const CONTENIDO_GENERICO = {
  descripcion: "Habitación con todo lo necesario para tu estadía.",
  descripcionAmpliada: "Habitación equipada para tu estadía en Salta, con Wi-Fi y todo lo necesario para descansar.",
  comodidades: [{ nombre: "Wi-Fi", Icono: Wifi }],
  fotos: ["Foto · Habitación"],
};

export function contenidoDeTipo(nombre) {
  return CONTENIDO_TIPOS[nombre] ?? { ...CONTENIDO_GENERICO, fotos: [`Foto · Habitación ${nombre ?? ""}`.trim()] };
}

// --- Rediseño "Holiday Inn Salta" (modelo HTML del equipo) ---------------------
// Fotos del modelo, servidas desde frontend/public/web/fotos.
const FOTOS = "/web/fotos";
export const fotoWeb = (nombre) => `${FOTOS}/${nombre}.jpg`;

// Foto de cada tipo de habitación según su nombre; el resto usa una genérica.
const FOTO_TIPO = { Simple: "std", Standard: "std", Doble: "pre", Premium: "pre", Suite: "sui" };
export function fotoDeTipo(nombre) {
  const clave = Object.keys(FOTO_TIPO).find((k) => String(nombre ?? "").toLowerCase().includes(k.toLowerCase()));
  return fotoWeb(clave ? FOTO_TIPO[clave] : "hab");
}

// "Elegí tu experiencia": accesos a las secciones del Inicio.
export const ACCESOS_INICIO = [
  { titulo: "Habitaciones", texto: "Confort y calidez en cada detalle", foto: "e1", destino: "#habitaciones" },
  { titulo: "Promociones", texto: "Viví más por menos", foto: "e2", destino: "#promociones" },
  { titulo: "Experiencias en Salta", texto: "Paisajes, cultura y tradición", foto: "e3", destino: "#experiencias" },
  { titulo: "Gastronomía", texto: "Sabores de nuestra tierra", foto: "e4", destino: "#experiencias" },
];

export const SERVICIOS_HOTEL = [
  { nombre: "Habitaciones", texto: "Confort premium", Icono: BedDouble },
  { nombre: "Wi-Fi gratuito", texto: "En todo el hotel", Icono: Wifi },
  { nombre: "Restaurante", texto: "Sabores del norte", Icono: UtensilsCrossed },
  { nombre: "Excursiones", texto: "Salta a tu medida", Icono: Mountain },
  { nombre: "Piscina", texto: "Con vista a las sierras", Icono: Waves },
  { nombre: "Estacionamiento", texto: "Sin cargo", Icono: SquareParking },
  { nombre: "Gimnasio", texto: "Abierto 24 hs", Icono: Dumbbell },
  { nombre: "Spa", texto: "Relax y bienestar", Icono: Flower2 },
];

// Promociones del modelo: contenido de difusión. El precio final siempre lo
// calcula el motor de reservas con la tarifa vigente.
export const PROMOCIONES_WEB = [
  { etiqueta: "Feriado", titulo: "Feriado del 12 de Octubre", beneficio: "15% OFF", detalle: "en estadías de 3 noches o más", foto: "p1" },
  { etiqueta: "Fin de semana largo", titulo: "Puente de noviembre", beneficio: "20% OFF", detalle: "en tarifas reembolsables", foto: "p2" },
  { etiqueta: "Vacaciones de invierno", titulo: "Viví Salta en invierno", beneficio: "Hasta 25% OFF", detalle: "+ desayuno incluido", foto: "p3" },
];

export const EXPERIENCIAS_SALTA = [
  { nombre: "Excursiones", texto: "Quebrada de Humahuaca, Cafayate y los Valles Calchaquíes.", Icono: Mountain },
  { nombre: "Cultura y tradición", texto: "Museos, peñas y el casco histórico a pocas cuadras.", Icono: Landmark },
  { nombre: "Gastronomía", texto: "Empanadas, locro, humita y vinos de altura.", Icono: UtensilsCrossed },
  { nombre: "Naturaleza", texto: "Cerro San Bernardo, reservas y paisajes andinos.", Icono: Leaf },
];

export const DISTANCIAS_HOTEL = [
  "20 min del Aeropuerto Internacional",
  "5 min de la Plaza 9 de Julio",
  "10 min de la Terminal de Ómnibus",
];

// Fotos de la galería de un tipo: su foto principal primero y después el resto del hotel.
export function imagenesDeTipo(nombre) {
  const principal = fotoDeTipo(nombre);
  return [principal, ...["det", "pre", "std", "sui", "hab"].map(fotoWeb).filter((src) => src !== principal)];
}
