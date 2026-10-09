import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Printer, Search } from "lucide-react";
import { api } from "../../lib/api";
import { formatearDiaSemanaMes, formatearIngreso } from "../../lib/fechas";
import { Button } from "../../componentes/Button";
import { FilterBar } from "../../componentes/FilterBar";
import { MenuAcciones } from "../../componentes/MenuAcciones";
import { PageHeader } from "../../componentes/PageHeader";
import { idPestana, Pestanas } from "../../componentes/Pestanas";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { TarjetaIndicador } from "../../componentes/TarjetaIndicador";
import { useSesion } from "../../lib/sesion";
import {
  agruparPorHabitacion,
  calcularIndicadores,
  edadDe,
  esMenor,
  filtrarPorVista,
  iniciales,
  lineaDocumento,
  notasOcupante,
  SIN_HABITACION,
  textoMismaReserva,
  TOPE_ALOJADOS,
  vistaValida,
  VISTAS,
} from "./alojados.helpers";
import { ListaImpresion } from "./AlojadosImpresion";

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const RETARDO_BUSQUEDA = 300;
const CLASE_CAMPO =
  "h-10 rounded-md border border-borde bg-white px-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-pino/40";

const consultarAlojados = (q) =>
  api.get("/estadia/alojados", { params: q ? { q } : {} }).then((r) => r.data);

// Píldora del aviso de salida: terracota clara el día de la salida, terracota oscura con texto blanco si ya venció.
function AvisoSalida({ estado }) {
  if (estado.tipo === "hoy") {
    return (
      <span className="inline-block rounded-full bg-[var(--aviso-bg)] px-2.5 py-0.5 text-xs text-[var(--aviso-texto)]">
        {estado.texto}
      </span>
    );
  }
  if (estado.tipo === "vencida") {
    return (
      <span className="inline-block rounded-full bg-[var(--aviso-texto)] px-2.5 py-0.5 text-xs text-white">
        {estado.texto}
      </span>
    );
  }
  return <span className="text-xs text-piedra">{estado.texto}</span>;
}

function EtiquetaOcupante({ children, tono = "neutro" }) {
  const clase =
    tono === "titular" ? "bg-pino-100 text-pino-700" : "bg-laton-100 text-laton-700";
  return (
    <span className={`rounded-sm px-1.5 py-px text-[10.5px] uppercase tracking-[0.06em] ${clase}`}>
      {children}
    </span>
  );
}

function Ocupante({ persona, grupo, porId }) {
  const menor = esMenor(persona);
  const notas = notasOcupante(persona, grupo);
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span
        aria-hidden="true"
        className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-borde bg-hueso text-[11.5px] text-tinta"
      >
        {iniciales(persona)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13.5px] text-tinta">
            {persona.nombre} {persona.apellido}
          </span>
          {persona.esTitular && <EtiquetaOcupante tono="titular">TITULAR</EtiquetaOcupante>}
          {menor && <EtiquetaOcupante tono="menor">MENOR · {edadDe(persona)} AÑOS</EtiquetaOcupante>}
        </div>
        <p className="m-0 text-xs text-piedra">{lineaDocumento(persona, porId)}</p>
        {notas.ingreso && <p className="m-0 text-xs text-piedra">{notas.ingreso}</p>}
        {notas.salida && <p className="m-0 text-xs text-piedra">{notas.salida}</p>}
      </div>
    </li>
  );
}

export function AlojadosPage() {
  const { puede } = useSesion();
  const autorizado = puede("verReservas");
  const puedeCheckOut = puede("verCheckOut");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const vista = vistaValida(searchParams.get("vista") ?? "");
  const q = searchParams.get("q") ?? "";
  const [texto, setTexto] = useState(q);
  const [qPrevio, setQPrevio] = useState(q);

  // Si la URL cambia desde afuera (atrás, un enlace), el campo la sigue. Se ajusta durante el render, no en un efecto.
  if (q !== qPrevio) {
    setQPrevio(q);
    if (texto.trim() !== q) setTexto(q);
  }
  // La URL es la fuente de verdad (?vista=&q=). El texto del campo llega a la URL 300 ms después de la última tecla.
  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === q) return undefined;
    const espera = setTimeout(() => {
      setSearchParams(
        (previos) => {
          const params = new URLSearchParams(previos);
          if (limpio) params.set("q", limpio);
          else params.delete("q");
          return params;
        },
        { replace: true },
      );
    }, RETARDO_BUSQUEDA);
    return () => clearTimeout(espera);
  }, [texto, q, setSearchParams]);

  // Lista completa (sin búsqueda): indicadores, contadores de pestañas e impresión. Caché propia.
  const completa = useQuery({
    queryKey: ["alojados", "completa"],
    queryFn: () => consultarAlojados(""),
    enabled: autorizado,
    refetchInterval: 30000,
  });
  const busqueda = useQuery({
    queryKey: ["alojados", "busqueda", q],
    queryFn: () => consultarAlojados(q),
    enabled: autorizado && Boolean(q),
    placeholderData: keepPreviousData,
  });
  const consulta = q ? busqueda : completa;
  const personas = consulta.data;

  const indicadores = useMemo(() => (completa.data ? calcularIndicadores(completa.data) : null), [completa.data]);
  const gruposCompletos = useMemo(() => (completa.data ? agruparPorHabitacion(completa.data) : null), [completa.data]);
  const grupos = useMemo(
    () => (personas ? filtrarPorVista(agruparPorHabitacion(personas), vista) : []),
    [personas, vista],
  );
  const porId = useMemo(() => new Map((personas ?? []).map((p) => [p.id, p])), [personas]);

  if (!autorizado) return <SinPermiso />;

  function irAVista(nueva) {
    const params = new URLSearchParams(searchParams);
    if (nueva) params.set("vista", nueva);
    else params.delete("vista");
    setSearchParams(params);
  }
  const enlaceVista = (nueva) => {
    const params = new URLSearchParams(searchParams);
    params.set("vista", nueva);
    return `/personas-alojadas?${params.toString()}`;
  };

  const pestanas = [
    { valor: VISTAS.TODAS, etiqueta: "Todas", cantidad: indicadores?.habitaciones },
    { valor: VISTAS.HOY, etiqueta: "Salen hoy", cantidad: indicadores?.salenHoy.habitaciones },
    { valor: VISTAS.VENCIDAS, etiqueta: "Vencidas", cantidad: indicadores?.vencidas.habitaciones },
  ];
  const habitacionesMostradas = grupos.filter((g) => g.numero !== null).length;
  const huespedesMostrados = grupos.reduce((n, g) => n + g.ocupantes.length, 0);
  const llegoAlTope = Array.isArray(personas) && personas.length >= TOPE_ALOJADOS;

  return (
    <div className="space-y-5">
      <div className="print:hidden space-y-5">
        <PageHeader
          titulo="Huéspedes en casa"
          subtitulo="Personas con ingreso registrado y sin salida, agrupadas por habitación."
          acciones={
            <Button
              variante="secundario"
              icono={Printer}
              disabled={!completa.data}
              onClick={() => window.print()}
            >
              Imprimir lista
            </Button>
          }
        />

        <div className="grilla-indicadores">
          <TarjetaIndicador
            color="var(--primary)"
            etiqueta="Habitaciones ocupadas"
            valor={indicadores?.habitaciones}
            secundaria={indicadores ? `de ${plural(indicadores.reservas, "reserva", "reservas")} en curso` : ""}
          />
          <TarjetaIndicador
            color="var(--accent)"
            etiqueta="Huéspedes"
            valor={indicadores?.huespedes}
            secundaria={
              indicadores
                ? `${plural(indicadores.adultos, "adulto", "adultos")} · ${plural(indicadores.menores, "menor", "menores")}`
                : ""
            }
          />
          <TarjetaIndicador
            color="var(--terracota)"
            etiqueta="Salen hoy"
            valor={indicadores?.salenHoy.habitaciones}
            enlace={{ texto: "Ver →", to: enlaceVista(VISTAS.HOY) }}
            secundaria={indicadores ? plural(indicadores.salenHoy.huespedes, "huésped", "huéspedes") : ""}
          />
          <TarjetaIndicador
            color="var(--aviso-texto)"
            etiqueta="Salidas vencidas"
            valor={indicadores?.vencidas.habitaciones}
            enlace={{ texto: "Ver →", to: enlaceVista(VISTAS.VENCIDAS) }}
            secundaria="check-out pendiente"
          />
        </div>

        <div className="min-w-0 overflow-hidden rounded-lg border border-borde bg-white">
          <Pestanas
            etiqueta="Vista de huéspedes en casa"
            idBase="alojados"
            pestanas={pestanas}
            activa={vista}
            onCambiar={irAVista}
          />
          <FilterBar incrustada>
            <div className="relative min-w-[240px] flex-1">
              <Search
                size={15}
                strokeWidth={1.6}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-piedra"
              />
              <input
                type="search"
                aria-label="Buscar huéspedes en casa"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Nombre, documento, habitación o código de reserva"
                className={`${CLASE_CAMPO} w-full pl-8`}
              />
            </div>
            <span className="ml-auto text-[13px] font-semibold text-piedra" aria-live="polite">
              {personas
                ? `${plural(habitacionesMostradas, "habitación", "habitaciones")} · ${plural(huespedesMostrados, "huésped", "huéspedes")}`
                : ""}
            </span>
          </FilterBar>

          <div role="tabpanel" id="alojados-panel" aria-labelledby={idPestana("alojados", vista)}>
            {consulta.isError ? (
              <div role="alert" className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                <p className="m-0 text-sm text-error-texto">
                  No se pudo cargar la lista de huéspedes en casa. Revisá la conexión e intentá de nuevo.
                </p>
                <Button variante="secundario" onClick={() => consulta.refetch()}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <div className={`transition-opacity ${consulta.isPlaceholderData ? "opacity-60" : ""}`}>
                <Table
                  cargando={consulta.isLoading}
                  columnas={["Habitación", "Huéspedes", "Ingreso", "Salida", "Reserva", ""]}
                  columnasDerecha={[""]}
                  filas={grupos}
                  vacioTitulo={
                    q
                      ? `Sin resultados para «${q}»`
                      : vista
                        ? "Sin habitaciones en esta vista"
                        : "No hay huéspedes en casa"
                  }
                  vacioDescripcion={
                    q ? "Probá con otro nombre, documento, número de habitación o código de reserva." : undefined
                  }
                  onRowClick={(g) => navigate(`/reservas/${g.reservaId}`)}
                  claseFila={(g) => (g.estadoSalida.tipo === "vencida" ? "bg-[#fdf8f5]" : "")}
                  renderFila={(g) => {
                    const acciones = [{ label: "Ver reserva", onClick: () => navigate(`/reservas/${g.reservaId}`) }];
                    if (puedeCheckOut) {
                      acciones.push({ label: "Ir al check-out", onClick: () => navigate(`/check-out/${g.reservaId}`) });
                    }
                    const ingreso = formatearIngreso(g.ingreso);
                    const sinHabitacion = g.numero === null;
                    return (
                      <tr key={g.clave}>
                        <td className="px-3 py-3.5 align-top">
                          {sinHabitacion ? (
                            <span className="text-[13.5px] text-tinta">{SIN_HABITACION}</span>
                          ) : (
                            <>
                              <div className="font-mono text-[22px] leading-none text-tinta">
                                {g.numero}
                              </div>
                              {g.tipo && <div className="mt-1 text-xs text-piedra">{g.tipo}</div>}
                            </>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <ul className="m-0 list-none p-0">
                            {g.ocupantes.map((p) => (
                              <Ocupante key={p.id} persona={p} grupo={g} porId={porId} />
                            ))}
                          </ul>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top">
                          {ingreso ? (
                            <>
                              <div className="text-[13.5px] text-tinta">{ingreso.dia}</div>
                              <div className="text-xs text-piedra">{ingreso.hora}</div>
                            </>
                          ) : (
                            <span className="text-piedra">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3.5 align-top">
                          <div className="mb-1 text-[13.5px] text-tinta">
                            {formatearDiaSemanaMes(g.salida) || "—"}
                          </div>
                          <AvisoSalida estado={g.estadoSalida} />
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          <Link
                            to={`/reservas/${g.reservaId}`}
                            className="font-mono text-[13px] text-pino hover:underline"
                          >
                            {g.codigo}
                          </Link>
                          {g.mismaReserva.length > 0 && (
                            <div className="mt-1 text-xs text-piedra">{textoMismaReserva(g.mismaReserva)}</div>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right align-top">
                          <MenuAcciones
                            grande
                            etiqueta={`Acciones de ${sinHabitacion ? SIN_HABITACION : `habitación ${g.numero}`}`}
                            acciones={acciones}
                          />
                        </td>
                      </tr>
                    );
                  }}
                />
                {llegoAlTope && (
                  <p className="m-0 border-t border-[var(--divisor-fila)] px-5 py-3 text-[13px] text-piedra">
                    Se muestran los primeros {TOPE_ALOJADOS} huéspedes. Refiná la búsqueda.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {gruposCompletos && indicadores && <ListaImpresion grupos={gruposCompletos} indicadores={indicadores} />}
    </div>
  );
}
