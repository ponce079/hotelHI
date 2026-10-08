import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { SinPermiso } from "../../componentes/SinPermiso";
import { useSesion } from "../../lib/sesion";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { TarifasTabs } from "./TarifasTabs";
import { obtenerCalendario } from "./tarifas.api";
import { NIVEL_TEMPORADA_LABEL, NIVEL_TEMPORADA_COLOR } from "./tarifas.constantes";

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_SEMANA = ["D", "L", "M", "M", "J", "V", "S"];

// Matriz de semanas (cada una de 7 casilleros, null = día de otro mes) para
// un mes dado — mismo criterio que cualquier calendario de escritorio.
function semanasDelMes(anio, mesIndice) {
  const primerDia = new Date(Date.UTC(anio, mesIndice, 1));
  const diasEnMes = new Date(Date.UTC(anio, mesIndice + 1, 0)).getUTCDate();
  const semanas = [];
  let semana = new Array(primerDia.getUTCDay()).fill(null);
  for (let dia = 1; dia <= diasEnMes; dia += 1) {
    semana.push(dia);
    if (semana.length === 7) {
      semanas.push(semana);
      semana = [];
    }
  }
  if (semana.length > 0) {
    while (semana.length < 7) semana.push(null);
    semanas.push(semana);
  }
  return semanas;
}

function isoDia(anio, mesIndice, dia) {
  return `${anio}-${String(mesIndice + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function CalendarioPage() {
  const { puede } = useSesion();
  const [anio, setAnio] = useState(Number(hoyEnHoraLocal().slice(0, 4)));

  if (!puede("verTarifas")) return <SinPermiso />;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tarifas", "calendario", anio],
    queryFn: () => obtenerCalendario(`${anio}-01-01`, `${anio}-12-31`),
  });

  // Map "AAAA-MM-DD" -> día del calendario (nivel, nombre, restricciones).
  const porFecha = useMemo(() => {
    const mapa = new Map();
    (data ?? []).forEach((d) => mapa.set(String(d.fecha).slice(0, 10), d));
    return mapa;
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <TarifasTabs activa="/tarifas/calendario" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Calendario anual</h1>
          <p className="text-sm text-piedra">Temporada efectiva de cada día, con código de colores.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAnio((a) => a - 1)} className="cursor-pointer rounded-md border border-borde p-1.5 hover:bg-hueso">
            <ChevronLeft size={18} />
          </button>
          <span className="font-heading text-lg font-semibold">{anio}</span>
          <button type="button" onClick={() => setAnio((a) => a + 1)} className="cursor-pointer rounded-md border border-borde p-1.5 hover:bg-hueso">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(NIVEL_TEMPORADA_LABEL).map(([nivel, label]) => (
          <span key={nivel} className="flex items-center gap-1.5 text-[12px] text-tinta/70">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: NIVEL_TEMPORADA_COLOR[nivel]?.fondo }} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[12px] text-tinta/70">
          <AlertTriangle size={13} /> Estadía mínima o cierre a llegadas
        </span>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-piedra">Cargando…</p>}
      {isError && <p className="py-8 text-center text-sm text-error">No se pudo calcular el calendario.</p>}

      {!isLoading && !isError && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MESES.map((nombreMes, mesIndice) => (
            <div key={nombreMes} className="rounded-lg border border-borde bg-white p-3">
              <h3 className="mb-2 text-center font-heading text-sm font-semibold">{nombreMes}</h3>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-piedra">
                {DIAS_SEMANA.map((d, i) => (
                  <span key={i}>{d}</span>
                ))}
              </div>
              {semanasDelMes(anio, mesIndice).map((semana, i) => (
                <div key={i} className="grid grid-cols-7 gap-0.5">
                  {semana.map((dia, j) => {
                    if (!dia) return <span key={j} />;
                    const info = porFecha.get(isoDia(anio, mesIndice, dia));
                    const color = info ? NIVEL_TEMPORADA_COLOR[info.nivel] : null;
                    const restriccion = info && (info.estadiaMinima || info.cierreLlegada);
                    const tooltip = info
                      ? [
                          `${info.nombre} (${NIVEL_TEMPORADA_LABEL[info.nivel] ?? info.nivel})`,
                          info.estadiaMinima ? `Estadía mínima: ${info.estadiaMinima} noches` : null,
                          info.cierreLlegada ? "Cierre a llegadas" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "";
                    return (
                      <span
                        key={j}
                        title={tooltip}
                        className="relative flex h-6 items-center justify-center rounded-sm text-[10.5px]"
                        style={color ? { backgroundColor: color.fondo, color: color.texto } : undefined}
                      >
                        {dia}
                        {restriccion && (
                          <AlertTriangle size={8} className="absolute right-0 top-0" style={{ color: color?.texto }} />
                        )}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
