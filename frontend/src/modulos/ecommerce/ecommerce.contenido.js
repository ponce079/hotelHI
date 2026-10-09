// Contenido estático por tipo de habitación, indexado por el NOMBRE del tipo
// (el que devuelve /api/web/tipos). `fotos` son los textos alternativos de la
// galería; las imágenes salen de imagenesDeTipo. Sin número de habitación ni piso.
import {
  AirVent,
  Bath,
  BedDouble,
  BedSingle,
  Dumbbell,
  Flower2,
  Landmark,
  Leaf,
  Monitor,
  Mountain,
  Refrigerator,
  Sofa,
  SquareParking,
  Table2,
  UtensilsCrossed,
  Waves,
  Wifi,
} from "lucide-react";
import { HOTEL } from "./ecommerce.config";

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
    // Etiqueta del rediseño en las tarjetas de habitación.
    destacada: "Más elegida",
  },
  Suite: {
    descripcion: "Nuestra categoría más amplia, con living integrado, para viajar en familia o con amigos.",
    descripcionAmpliada:
      "La habitación más espaciosa del hotel, con living integrado y capacidad para hasta cuatro personas. Tiene Wi-Fi, aire acondicionado, TV, frigobar y baño completo. Ideal para quedarse varios días y descansar entre excursión y excursión.",
    comodidades: [
      { nombre: "Wi-Fi", Icono: Wifi },
      { nombre: "TV", Icono: Monitor },
      { nombre: "Aire acondicionado", Icono: AirVent },
      { nombre: "Frigobar", Icono: Refrigerator },
      { nombre: "Living", Icono: Sofa },
      { nombre: "Baño completo", Icono: Bath },
      { nombre: "Cama doble", Icono: BedDouble },
    ],
    fotos: ["Foto · Suite", "Foto · Living", "Foto · Baño", "Foto · Vista", "Foto · Detalle cama"],
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
// Fotos de Pexels (licencia libre), achicadas y servidas desde frontend/public/web/fotos.
const FOTOS = "/web/fotos";
export const fotoWeb = (nombre) => `${FOTOS}/${nombre}.jpg`;

// Foto de cada tipo de habitación según su nombre; el resto usa una genérica.
const FOTO_TIPO = { Simple: "std", Standard: "std", Doble: "pre", Premium: "pre", Suite: "sui" };
export function fotoDeTipo(nombre) {
  const clave = Object.keys(FOTO_TIPO).find((k) => String(nombre ?? "").toLowerCase().includes(k.toLowerCase()));
  return fotoWeb(clave ? FOTO_TIPO[clave] : "hab");
}

// "Elegí tu experiencia": accesos a las páginas del sitio.
export const ACCESOS_INICIO = [
  { titulo: "Habitaciones", texto: "Confort y calidez en cada detalle", foto: "e1", destino: "/web/habitaciones" },
  { titulo: "Promociones", texto: "Viví más por menos", foto: "e2", destino: "/web/promociones" },
  { titulo: "Experiencias en Salta", texto: "Paisajes, cultura y tradición", foto: "e3", destino: "/web/experiencias" },
  { titulo: "Gastronomía", texto: "Sabores de nuestra tierra", foto: "e4", destino: "/web/experiencias" },
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

// Galería "Conocé el hotel" del Inicio, debajo de los servicios.
export const FOTOS_SERVICIOS = [
  { nombre: "Piscina", foto: "s-piscina" },
  { nombre: "Restaurante", foto: "s-restaurante" },
  { nombre: "Spa", foto: "s-spa" },
  { nombre: "Gimnasio", foto: "s-gimnasio" },
  { nombre: "Estacionamiento", foto: "s-estacionamiento" },
];

// Promociones del modelo: contenido de difusión. El precio final siempre lo
// calcula el motor de reservas con la tarifa vigente.
export const PROMOCIONES_WEB = [
  { categoria: "Feriados", etiqueta: "Feriado", titulo: "Feriado del 12 de Octubre", beneficio: "15% OFF", detalle: "en estadías de 3 noches o más", foto: "p1", destacada: true, vigencia: "Del 10 al 12 de octubre", condiciones: ["Mínimo 3 noches.", "Aplica a tarifa flexible y no reembolsable.", "Sujeto a disponibilidad."] },
  { categoria: "Fines de semana largos", etiqueta: "Fin de semana largo", titulo: "Puente de noviembre", beneficio: "20% OFF", detalle: "en tarifas reembolsables", foto: "p2", vigencia: "Del 20 al 23 de noviembre", condiciones: ["Solo tarifa flexible (reembolsable).", "Mínimo 2 noches.", "Sujeto a disponibilidad."] },
  { categoria: "Vacaciones", etiqueta: "Vacaciones de invierno", titulo: "Viví Salta en invierno", beneficio: "Hasta 25% OFF", detalle: "+ desayuno incluido", foto: "p3", vigencia: "Julio de 2027", condiciones: ["El descuento varía según la fecha.", "Desayuno incluido en todas las tarifas.", "Sujeto a disponibilidad."] },
];

export const CATEGORIAS_PROMOCIONES = ["Todas", "Feriados", "Fines de semana largos", "Vacaciones"];

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
  return [principal, ...["hab-vista", "det", "pre", "std", "sui", "hab", "e1"].map(fotoWeb).filter((src) => src !== principal)];
}

// Franja de confianza: lo que el sitio realmente ofrece (precio final, confirmación,
// cancelación de la tarifa flexible y pago con tarjeta cifrado).
export const CONFIANZA_WEB = [
  { titulo: "Precio final", texto: "En pesos, IVA incluido" },
  { titulo: "Confirmación inmediata", texto: "Tu código al instante y por email" },
  { titulo: "Cancelación flexible", texto: "Sin cargo hasta 48 h antes" },
  { titulo: "Pago seguro", texto: "Conexión cifrada" },
];

// Excursiones y paseos (página Experiencias). Fotos libres de Wikimedia Commons y
// Pexels: el crédito de autor y licencia se muestra en cada tarjeta, como piden las licencias CC.
const COMMONS = "https://commons.wikimedia.org/wiki/File:";
const PEXELS = "https://www.pexels.com/photo/";
export const EXCURSIONES_SALTA = [
  {
    nombre: "Quebrada de las Conchas",
    tipo: "Excursión",
    duracion: "Día completo",
    texto: "Cerros rojizos, la Garganta del Diablo y el Anfiteatro camino a Cafayate.",
    foto: "x-conchas",
    credito: { autor: "Bernard Gagnon", licencia: "CC BY-SA 4.0", pagina: `${COMMONS}Quebrada_de_las_Conchas_04.jpg` },
  },
  {
    nombre: "Cafayate y sus bodegas",
    tipo: "Excursión",
    duracion: "Día completo",
    texto: "Viñedos de altura y degustación de torrontés en los Valles Calchaquíes.",
    foto: "x-cafayate",
    credito: { autor: "Micah MacAllen", licencia: "CC BY-SA 2.0", pagina: `${COMMONS}Cafayate_vineyard.jpg` },
  },
  {
    nombre: "Tren a las Nubes",
    tipo: "Excursión",
    duracion: "Día completo",
    texto: "Hasta el viaducto La Polvorilla, a más de 4.200 metros de altura.",
    foto: "x-tren",
    credito: { autor: "Ministerio de Transporte de la Nación", licencia: "CC BY-SA 2.0", pagina: `${COMMONS}Tren_nubes_trenesarg.jpg` },
  },
  {
    nombre: "Salinas Grandes",
    tipo: "Excursión",
    duracion: "Día completo",
    texto: "Un desierto blanco de sal en plena Puna, entre Salta y Jujuy.",
    foto: "x-salinas",
    credito: { autor: "Bernard Gagnon", licencia: "CC BY-SA 4.0", pagina: `${COMMONS}Salinas_Grandes_(Jujuy_and_Salta)_02.jpg` },
  },
  {
    nombre: "Casco histórico y Cabildo",
    tipo: "En la ciudad",
    duracion: "Medio día · a pie",
    texto: "La Plaza 9 de Julio, la Catedral y el Cabildo, hoy Museo Histórico del Norte.",
    foto: "x-cabildo",
    credito: { autor: "Fulviusbsas", licencia: "CC BY-SA 3.0", pagina: `${COMMONS}Salta-Cabildo1.jpg` },
  },
  {
    nombre: "Teleférico al San Bernardo",
    tipo: "En la ciudad",
    duracion: "2 a 3 horas",
    texto: "Subí al cerro en teleférico y mirá todo el valle de Lerma desde arriba.",
    foto: "x-sanbernardo",
    credito: { autor: "Héctor Pérez", licencia: "Licencia Pexels", pagina: `${PEXELS}4062592/` },
  },
];

// Itinerario sugerido "Tu fin de semana en Salta" (página Experiencias).
export const ITINERARIO_SALTA = [
  {
    dia: "Viernes",
    titulo: "Llegada y ciudad",
    momentos: [
      { hora: "Tarde", texto: `Check-in desde las ${HOTEL.checkIn} y paseo por la Plaza 9 de Julio y el Cabildo.` },
      { hora: "Noche", texto: "Peña folclórica en la calle Balcarce, con empanadas y vino." },
    ],
  },
  {
    dia: "Sábado",
    titulo: "Quebrada y Cafayate",
    momentos: [
      { hora: "Mañana", texto: "Salida temprano por la Quebrada de las Conchas." },
      { hora: "Tarde", texto: "Bodegas de Cafayate y helado de vino antes de volver." },
    ],
  },
  {
    dia: "Domingo",
    titulo: "Salta desde arriba",
    momentos: [
      { hora: "Mañana", texto: `Desayuno sin apuro y check-out hasta las ${HOTEL.checkOut}.` },
      { hora: "Mediodía", texto: "Teleférico al San Bernardo y un locro antes de partir." },
    ],
  },
];
