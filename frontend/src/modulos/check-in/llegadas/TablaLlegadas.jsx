import { Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../../../componentes/Badge";
import { Button } from "../../../componentes/Button";
import { Table } from "../../../componentes/Table";
import { documentoEnmascarado } from "../../../lib/documento";
import { formatearIngreso } from "../../../lib/fechas";
import { etiquetaNoches, etiquetaPax, formatearDiaConSemana, iniciales, resumenHabitaciones } from "../../../lib/formatosReserva";
import { codigoPais, nombrePais } from "../../../lib/paises";
import { Chip } from "../ui";
import {
  avisoAtrasada,
  chipHabitaciones,
  garantiaDeLlegada,
  llegabaAntes,
  notasDeLlegada,
  TEXTO_NOMBRE_WEB_DISTINTO,
} from "./llegadasHelpers";

const COLUMNAS = ["Titular", "Habitación", "Estadía y plan", "Pax", "Garantía", ""];

const VACIOS = {
  pendientes: { titulo: "No hay llegadas pendientes para hoy", busqueda: "No hay llegadas de hoy que coincidan con la búsqueda." },
  atrasadas: { titulo: "No hay llegadas atrasadas", busqueda: "No hay llegadas atrasadas que coincidan con la búsqueda." },
  ingresadas: { titulo: "Todavía no hubo ingresos hoy", busqueda: "No hay ingresos de hoy que coincidan con la búsqueda." },
};

// Tonos del chip de estado de la habitación (los colores salen de las variables del tema).
const CLASE_TONO = {
  limpieza: "inline-flex items-center whitespace-nowrap rounded-full bg-[var(--aviso-bg)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--aviso-texto)]",
  bloqueada: "inline-flex items-center whitespace-nowrap rounded-full bg-[var(--aviso-texto)] px-2.5 py-0.5 text-[12px] font-semibold text-white",
};

function ChipHabitacion({ chip }) {
  if (chip.tono === "lista") return <Badge variante="ok">{chip.texto}</Badge>;
  if (chip.tono === "neutro") return <Badge variante="neutro">{chip.texto}</Badge>;
  return <span className={CLASE_TONO[chip.tono]}>{chip.texto}</span>;
}

function CeldaTitular({ r }) {
  const t = r.titular ?? {};
  const pais = t.paisDocumento ? (nombrePais(codigoPais(t.paisDocumento)) ?? t.paisDocumento) : "";
  const documento = documentoEnmascarado(t.tipoDocumento, t.numeroDocumento);
  const notas = notasDeLlegada(r);
  const hora = r.horaEstimadaLlegada;
  return (
    <div className="flex items-start gap-3">
      <span className="avatar-iniciales" aria-hidden="true">
        {iniciales(t.nombre)}
      </span>
      <div className="min-w-0">
        <div className="max-w-[260px] truncate text-[15px] font-semibold text-tinta" title={t.nombre ?? undefined}>
          {t.nombre ?? "—"}
        </div>
        <div className="text-[12px] text-piedra">
          <span className="font-mono font-medium text-tinta">{r.codigoConfirmacion}</span>
          {documento && <> · {documento}</>}
          {pais && <> · {pais}</>}
        </div>
        {(r.esWeb || hora) && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {r.esWeb && <span className="etiqueta-plan">Web</span>}
            {hora && (
              <span className="inline-flex items-center gap-1 text-[12px] text-piedra">
                <Clock size={12} strokeWidth={1.8} aria-hidden="true" />
                Llega {hora}
              </span>
            )}
          </div>
        )}
        {notas.length > 0 && (
          <div className="mt-1.5 max-w-[320px] rounded-md border border-[var(--etiqueta-borde)] bg-[var(--banda-filtros)] px-2.5 py-1.5 text-[12px] leading-snug text-tinta">
            {notas.map((n) => (
              <p key={n.completo} className="m-0" title={n.completo}>
                {n.texto}
              </p>
            ))}
          </div>
        )}
        {r.nombreWebDistinto && (
          <div className="mt-1.5">
            <Chip variante="aviso" envolver>
              {TEXTO_NOMBRE_WEB_DISTINTO}
            </Chip>
          </div>
        )}
      </div>
    </div>
  );
}

// En Ingresadas hoy la garantía de la reserva ya cumplió su papel en el check-in: sin ninguna, no hay nada que tomar al
// ingreso y se muestra un guion (con tarjeta o pago anticipado se muestra igual que antes).
function CeldaGarantia({ r, ingresada }) {
  const { sinGarantia, bloques } = garantiaDeLlegada(r);
  if (ingresada && sinGarantia) return <span className="relative text-piedra" title="Sin garantía de la reserva">
        —<span className="sr-only">Sin garantía de la reserva</span>
      </span>;
  return (
    <div className="flex flex-col gap-1.5">
      {bloques.map((b) => (
        <div key={b.clave}>
          <div className={sinGarantia ? "text-[13px] font-bold text-[var(--aviso-texto)]" : "text-[13px] font-semibold text-tinta"}>{b.tipo}</div>
          {b.detalle.map((linea) => (
            <div key={linea} className="text-[12px] text-piedra">
              {linea}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Lista de llegadas de una vista (Pendientes de hoy, Atrasadas o Ingresadas hoy). Un clic en la fila, Enter o el botón
// abren el check-in debajo (las ingresadas llevan al detalle de la reserva). Flechas arriba/abajo recorren la lista.
export function TablaLlegadas({ vista, filas, cargando, hoy, busqueda = "", seleccionadaId, onSeleccionar }) {
  const navigate = useNavigate();
  const ingresadas = vista === "ingresadas";
  const abrir = (r) => (ingresadas ? navigate(`/reservas/${r.id}`) : onSeleccionar(r));
  const moverFoco = (e, paso) => {
    const trs = [...e.currentTarget.parentElement.querySelectorAll("tr[data-reserva]")];
    trs[trs.indexOf(e.currentTarget) + paso]?.focus();
  };
  const vacio = VACIOS[vista] ?? VACIOS.pendientes;

  return (
    <Table
      cargando={cargando}
      columnas={COLUMNAS}
      columnasDerecha={[""]}
      filas={filas}
      vacioTitulo={busqueda ? "Sin resultados" : vacio.titulo}
      vacioDescripcion={busqueda ? vacio.busqueda : undefined}
      onRowClick={abrir}
      claseFila={(r) => (r.id === seleccionadaId ? "bg-pino-100" : "")}
      renderFila={(r) => {
        const { numeros, detalle } = resumenHabitaciones(r);
        const chip = chipHabitaciones(r.habitaciones, { ingresada: ingresadas });
        const aviso = vista === "atrasadas" ? avisoAtrasada(r, hoy) : ingresadas && llegabaAntes(r, hoy) ? avisoAtrasada(r, hoy) : null;
        const ingreso = ingresadas ? formatearIngreso(r.horaIngreso) : null;
        return (
          <tr
            key={r.id}
            data-reserva={r.id}
            tabIndex={0}
            aria-selected={r.id === seleccionadaId}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter") abrir(r);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                moverFoco(e, 1);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                moverFoco(e, -1);
              }
            }}
            className="align-top focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pino"
          >
            <td className="px-3 py-4">
              <CeldaTitular r={r} />
            </td>
            <td className="px-3 py-4">
              <div className="font-mono text-[13px] font-medium text-tinta">{numeros}</div>
              {detalle && <div className="mt-0.5 text-[12px] text-piedra">{detalle}</div>}
              <div className="mt-1.5">
                <ChipHabitacion chip={chip} />
              </div>
            </td>
            <td className="px-3 py-4">
              <div className="whitespace-nowrap text-[13.5px] font-medium text-tinta">
                {formatearDiaConSemana(r.fechaDesde)} → {formatearDiaConSemana(r.fechaHasta)}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-piedra">
                <span>
                  {etiquetaNoches(r)}
                  {r.plan?.nombre ? ` · ${r.plan.nombre}` : ""}
                </span>
                {r.plan?.reembolsable === false && <span className="etiqueta-plan">No reembolsable</span>}
              </div>
              {aviso && (
                <div className="mt-1.5">
                  <span className="aviso-pildora">{aviso}</span>
                </div>
              )}
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-[13px] text-tinta">{etiquetaPax(r)}</td>
            <td className="px-3 py-4">
              <CeldaGarantia r={r} ingresada={ingresadas} />
            </td>
            <td className="px-3 py-4 text-right">
              {ingresadas ? (
                <div className="flex flex-col items-end gap-1.5">
                  <Badge variante="ok" punto>
                    {ingreso ? `Ingresó ${ingreso.hora}` : "Ingresó"}
                  </Badge>
                  <Link to={`/reservas/${r.id}`} className="text-[13px] font-semibold text-pino hover:underline">
                    Ver reserva
                  </Link>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button type="button" tamano="fila" onClick={() => onSeleccionar(r)} aria-label={`Iniciar check-in de la reserva ${r.codigoConfirmacion}`}>
                    Iniciar check-in
                  </Button>
                </div>
              )}
            </td>
          </tr>
        );
      }}
    />
  );
}
