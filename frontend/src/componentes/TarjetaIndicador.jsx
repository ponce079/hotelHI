import { Link } from "react-router-dom";

// Tarjeta de indicador del día ("Operación de hoy"): punto de color + etiqueta, enlace de texto a la derecha, cifra
// grande en la serif de marca y una línea secundaria.
//
// Uso:
//   <TarjetaIndicador
//     color="var(--terracota)"                    // punto de 8 px
//     etiqueta="Llegadas hoy"
//     valor={7}                                   // null/undefined = no se pudo cargar: se muestra "—"
//     enlace={{ texto: "Check-in →", to: "/check-in" }}
//     secundaria={<>pendientes de ingreso <span className="text-[var(--aviso-texto)]">· 2 de días anteriores</span></>}
//   />
// Agrupar varias en una grilla con la clase `grilla-indicadores` (auto-fit, mínimo 230 px; una columna en teléfono).
export function TarjetaIndicador({ color, etiqueta, valor, enlace, secundaria }) {
  const sinDato = valor === null || valor === undefined;
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-borde bg-white p-5" aria-label={etiqueta}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-tinta">
          <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate">{etiqueta}</span>
        </span>
        {enlace && (
          <Link to={enlace.to} className="flex-none text-[13px] font-semibold text-pino hover:underline">
            {enlace.texto}
          </Link>
        )}
      </div>
      <div className="font-heading text-[48px] font-semibold leading-none text-tinta">{sinDato ? "—" : valor}</div>
      <p className="m-0 text-[13px] leading-snug text-piedra">{secundaria}</p>
    </section>
  );
}
