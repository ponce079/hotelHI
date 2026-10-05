// Contenido estático por tipo de habitación, indexado por el NOMBRE del tipo
// (el que devuelve /api/web/tipos). Las fotos son placeholders, como en el
// mockup, hasta tener fotos reales. Sin número de habitación ni piso.
import { AirVent, BedDouble, BedSingle, Monitor, Refrigerator, Table2, Wifi } from "lucide-react";

export const CONTENIDO_TIPOS = {
  Simple: {
    descripcion:
      "Pensada para viajes de trabajo o escapadas cortas. Cama simple, escritorio y todo lo necesario para descansar.",
    descripcionAmpliada:
      "Una habitación cómoda y silenciosa para una o dos personas. [COMPLETAR: ambientes, vista, metros cuadrados.]",
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
    descripcion:
      "Más espacio para parejas, familias o grupos. Ideal para estadías largas con la comodidad de siempre.",
    descripcionAmpliada:
      "Una habitación amplia para hasta cuatro huéspedes. [COMPLETAR: ambientes, vista, metros cuadrados.]",
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
  descripcionAmpliada: "[COMPLETAR: descripción del tipo de habitación.]",
  comodidades: [{ nombre: "Wi-Fi", Icono: Wifi }],
  fotos: ["Foto · Habitación"],
};

export function contenidoDeTipo(nombre) {
  return CONTENIDO_TIPOS[nombre] ?? { ...CONTENIDO_GENERICO, fotos: [`Foto · Habitación ${nombre ?? ""}`.trim()] };
}
