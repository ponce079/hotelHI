import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { documentoEnmascarado } from "../../lib/documento";
import { formatearDiaSemanaMes } from "../../lib/fechas";
import { etiquetaPax, iniciales } from "../../lib/formatosReserva";
import { codigoPais, nombrePais } from "../../lib/paises";
import { avisoSalida, tipoHabitaciones } from "./listadoCheckOut.helpers";

const COLUMNAS = ["Huésped", "Habitación", "Estadía", "Pax", "Plan", "Acción"];

const VACIOS = {
  hoy: "No hay salidas para hoy",
  vencidas: "No hay salidas vencidas",
  todas: "No hay estadías en curso",
};

function AvisoSalida({ aviso }) {
  if (aviso.tipo === "hoy") return <span className="aviso-pildora">{aviso.texto}</span>;
  if (aviso.tipo === "vencida") {
    return (
      <span className="inline-block whitespace-nowrap rounded-full bg-[var(--aviso-texto)] px-2 py-px text-[11.5px] font-semibold text-white">
        {aviso.texto}
      </span>
    );
  }
  return <span className="text-[12px] text-piedra">{aviso.texto}</span>;
}

function CeldaHuesped({ r }) {
  const h = r.huesped ?? {};
  const pais = h.paisDocumento ? (nombrePais(codigoPais(h.paisDocumento)) ?? h.paisDocumento) : "";
  const documento = documentoEnmascarado(h.tipoDocumento, h.numeroDocumento);
  return (
    <div className="flex items-start gap-3">
      <span className="avatar-iniciales" aria-hidden="true">
        {iniciales(h.nombre)}
      </span>
      <div className="min-w-0">
        <div className="max-w-[260px] truncate text-[15px] font-semibold text-tinta" title={h.nombre ?? undefined}>
          {h.nombre ?? "—"}
        </div>
        <div className="text-[12px] text-piedra">
          <span className="font-mono font-medium text-tinta">{r.codigoConfirmacion}</span>
          {documento && <> · {documento}</>}
          {pais && <> · {pais}</>}
        </div>
      </div>
    </div>
  );
}

// Lista de estadías en curso de una vista. La fila completa y el botón llevan a la pantalla de cierre.
export function TablaSalidas({ vista, filas, cargando, hoy, busqueda = "", puedeGestionar }) {
  const navigate = useNavigate();
  return (
    <Table
      cargando={cargando}
      columnas={COLUMNAS}
      columnasDerecha={["Acción"]}
      filas={filas}
      vacioTitulo={busqueda ? "Sin resultados" : (VACIOS[vista] ?? VACIOS.todas)}
      vacioDescripcion={busqueda ? "Probá con otro código, huésped, documento o número de habitación." : undefined}
      onRowClick={(r) => navigate(`/check-out/${r.id}`)}
      renderFila={(r) => {
        const numeros = (r.habitaciones ?? []).map((h) => h.numero).join(" · ") || "—";
        const detalle = tipoHabitaciones(r);
        const aviso = avisoSalida(r, hoy);
        return (
          <tr key={r.id} className="align-top">
            <td className="px-3 py-4">
              <CeldaHuesped r={r} />
            </td>
            <td className="px-3 py-4">
              <div className="font-mono text-[13px] font-medium text-tinta">{numeros}</div>
              {detalle && <div className="mt-0.5 text-[12px] text-piedra">{detalle}</div>}
            </td>
            <td className="px-3 py-4">
              <div className="whitespace-nowrap text-[13.5px] font-medium text-tinta">
                {formatearDiaSemanaMes(r.fechaDesde)} → {formatearDiaSemanaMes(r.fechaHasta)}
              </div>
              <div className="mt-1.5">
                <AvisoSalida aviso={aviso} />
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-[13px] text-tinta">{etiquetaPax(r)}</td>
            <td className="px-3 py-4">
              <div className="text-[13px] text-tinta">{r.planTarifario?.nombre ?? "—"}</div>
              {r.planTarifario?.reembolsable === false && (
                <div className="mt-1">
                  <span className="etiqueta-plan">No reembolsable</span>
                </div>
              )}
            </td>
            <td className="px-3 py-4 text-right">
              {puedeGestionar ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    tamano="fila"
                    onClick={() => navigate(`/check-out/${r.id}`)}
                    aria-label={`Iniciar check-out de la reserva ${r.codigoConfirmacion}`}
                  >
                    Iniciar check-out
                  </Button>
                </div>
              ) : (
                <Link to={`/check-out/${r.id}`} className="text-[13px] font-semibold text-pino hover:underline">
                  Ver cuenta
                </Link>
              )}
            </td>
          </tr>
        );
      }}
    />
  );
}
