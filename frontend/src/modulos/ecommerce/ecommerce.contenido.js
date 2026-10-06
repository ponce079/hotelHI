// Contenido estático por tipo de habitación, indexado por el NOMBRE del tipo
// (el que devuelve /api/web/tipos). Las fotos son placeholders, como en el
// mockup, hasta tener fotos reales. Sin número de habitación ni piso.
import { AirVent, BedDouble, BedSingle, Monitor, Refrigerator, Table2, Wifi } from "lucide-react";

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
