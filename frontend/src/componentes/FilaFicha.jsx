// Filas de los datos de una persona, compartidas por las filas de huéspedes del check-in, la ficha
// de ocupante (detalle de la reserva) y el huésped del alta de reserva de mostrador, para que las
// tres pantallas se vean iguales.
//
// Las columnas responden al ancho del contenedor (container queries, el contenedor lleva la clase
// CONTENEDOR_FICHA), no al de la ventana: la misma fila se ve completa en el check-in y se reparte
// en 2 o 3 columnas en un modal angosto o en pantallas chicas. Nunca hay scroll horizontal.
//
// Todos los controles miden lo mismo (40 px) y quedan alineados abajo aunque un rótulo ocupe dos
// renglones (items-end).
export const CONTENEDOR_FICHA = "@container";

const BASE =
  "grid items-end gap-x-3 gap-y-2.5 grid-cols-1 @min-[380px]:grid-cols-2 @min-[620px]:grid-cols-3 " +
  "[&_input:not([type=checkbox])]:h-10 [&_select]:h-10";

export const FILA_FICHA = {
  // Tipo · País emisor · Número
  documento: `${BASE} @min-[880px]:[grid-template-columns:minmax(120px,160px)_minmax(150px,190px)_minmax(160px,200px)]`,
  // Nombres · Apellido · Nacimiento · Nacionalidad
  identidad: `${BASE} @min-[880px]:[grid-template-columns:minmax(0,2fr)_minmax(0,2fr)_minmax(130px,150px)_minmax(150px,190px)]`,
  // País de residencia · Localidad · Domicilio
  residencia: `${BASE} @min-[880px]:[grid-template-columns:minmax(150px,190px)_minmax(0,1fr)_minmax(0,2fr)]`,
  // Teléfono · Correo
  contacto: `${BASE} @min-[880px]:[grid-template-columns:minmax(160px,200px)_minmax(0,2fr)]`,
  // Menor: Nombres · Apellido · Nacimiento · Adulto responsable · Vínculo
  menor: `${BASE} @min-[880px]:[grid-template-columns:minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(130px,150px)_minmax(0,2.4fr)_minmax(150px,1.3fr)]`,
  // Adulto responsable · Vínculo (cuando van en una fila aparte)
  responsable: `${BASE} @min-[880px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]`,
};

// Rótulo corto que no se parte, con el asterisco de obligatorio pegado, en el color de acento y un
// poco más chico. "(opcional)" para los opcionales que conviene aclarar.
export function Rotulo({ texto, obligatorio = false, opcional = false }) {
  return (
    <span className="whitespace-nowrap">
      {texto}
      {obligatorio && <span className="ml-px text-[0.9em] font-semibold text-laton">*</span>}
      {opcional && <span className="text-tinta/55"> (opcional)</span>}
    </span>
  );
}
