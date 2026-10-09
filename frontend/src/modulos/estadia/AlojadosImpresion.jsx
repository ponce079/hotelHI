import { useEffect, useRef } from "react";
import { formatearDiaSemanaMes, formatearFechaHora } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { esMenor, SIN_HABITACION } from "./alojados.helpers";

// Lista impresa de "Huéspedes en casa" (evacuación y auditoría nocturna). Solo se ve al imprimir (`hidden
// print:block`) y siempre es el in-house COMPLETO, sin importar la pestaña ni la búsqueda de la pantalla.
// A propósito NO lleva documentos, códigos de reserva, indicadores ni filtros (Ley 25.326 de protección de datos
// personales): solo habitación, nombre, TITULAR/MENOR y salida. El botón "Imprimir lista" está en AlojadosPage.
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function ListaImpresion({ grupos, indicadores }) {
  const { usuario } = useSesion();
  const marcaRef = useRef(null);

  // La fecha y la hora de impresión se fijan en el momento de imprimir (botón o Ctrl+P), en hora argentina.
  useEffect(() => {
    const poner = () => {
      if (marcaRef.current) {
        marcaRef.current.textContent = `Impreso el ${formatearFechaHora(new Date())} h · por ${usuario ?? "—"}`;
      }
    };
    poner();
    window.addEventListener("beforeprint", poner);
    return () => window.removeEventListener("beforeprint", poner);
  }, [usuario]);

  return (
    <section aria-label="Lista para imprimir" className="hidden print:block">
      <h1 className="m-0 text-[20px] text-black">Huéspedes en casa — Holiday Inn Salta</h1>
      <p ref={marcaRef} className="mb-4 mt-1 text-[12px] text-black" />
      <table className="w-full border-collapse text-[12px] text-black">
        <thead>
          <tr>
            <th className="border-b border-black py-1 pr-3 text-left">Habitación</th>
            <th className="border-b border-black py-1 pr-3 text-left">Huéspedes</th>
            <th className="border-b border-black py-1 text-left">Salida</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.clave} className="break-inside-avoid border-b border-neutral-400 align-top">
              <td className="whitespace-nowrap py-1.5 pr-3">{g.numero ?? SIN_HABITACION}</td>
              <td className="py-1.5 pr-3">
                {g.ocupantes.map((p) => (
                  <div key={p.id}>
                    {p.nombre} {p.apellido}
                    {p.esTitular && " · TITULAR"}
                    {esMenor(p) && " · MENOR"}
                  </div>
                ))}
              </td>
              <td className="whitespace-nowrap py-1.5">
                {formatearDiaSemanaMes(g.salida) || "—"}
                {g.estadoSalida.tipo === "hoy" && " · sale hoy"}
                {g.estadoSalida.tipo === "vencida" && " · vencida"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 break-inside-avoid text-[12px] text-black">
        Total: {plural(indicadores.habitaciones, "habitación", "habitaciones")} ocupadas ·{" "}
        {plural(indicadores.huespedes, "huésped", "huéspedes")} ({plural(indicadores.adultos, "adulto", "adultos")} ·{" "}
        {plural(indicadores.menores, "menor", "menores")})
      </p>
    </section>
  );
}
