import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import {
  BedDouble,
  Building2,
  CalendarCheck,
  DoorClosed,
  LogIn,
  Package,
  Search,
  TriangleAlert,
  Warehouse,
} from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { formatearFechaSinHora, hoyEnHoraLocal } from "../../lib/fechas";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA, ESTADO_RESERVA_BADGE } from "../reservas/reservas.constantes";
import { listarHabitaciones, listarOrdenesMantenimiento } from "../habitaciones/habitaciones.api";
import { ESTADO_HABITACION_COLOR } from "../habitaciones/habitaciones.constantes";
import { listarArticulos } from "../articulos/articulos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { listarProveedores } from "../proveedores/proveedores.api";
import { consultarStock } from "../stock/stock.api";

const ZONA_ARGENTINA = "America/Argentina/Buenos_Aires";

function saludoActual() {
  const hora = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_ARGENTINA, hour: "2-digit", hour12: false }).format(new Date())
  );
  if (hora < 12) return "Buenos días";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

function fechaCompletaHoy() {
  const texto = new Date().toLocaleDateString("es-AR", {
    timeZone: ZONA_ARGENTINA,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function sumarDias(fechaYMD, dias) {
  const fecha = new Date(`${fechaYMD}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

// Orden y abreviaturas de leyenda del gráfico de habitaciones — distinto
// del orden de ESTADOS_HABITACION (libre/ocupada/mantenimiento/bloqueada/
// en limpieza) porque acá "en limpieza" va antes que mantenimiento/
// bloqueada, mismo criterio visual que el mockup de referencia.
const ESTADOS_GRAFICO = [
  { valor: "libre", abrev: "Libre" },
  { valor: "ocupada", abrev: "Ocup." },
  { valor: "en limpieza", abrev: "Limp." },
  { valor: "mantenimiento", abrev: "Mant." },
  { valor: "bloqueada", abrev: "Bloq." },
];

function TarjetaMetrica({ label, value, hint, hintClassName, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer flex-col items-center gap-0.5 rounded-[18.4px] bg-white p-[15px] text-center shadow-[0_1px_2px_rgba(46,43,37,0.14)] transition-colors hover:bg-hueso"
    >
      <div className="flex items-center gap-1.5 font-body text-[10px] uppercase tracking-[0.1em] text-pino">
        {Icon && <Icon size={12} />} {label}
      </div>
      <Cifra tamano={34}>{value}</Cifra>
      {hint && <div className={`font-body text-[11.5px] text-tinta/55 ${hintClassName ?? ""}`}>{hint}</div>}
    </button>
  );
}

// Cada alerta es su propia categoría (nunca itemizada acá — para el detalle
// se navega a la pantalla correspondiente); una alerta en cero directamente
// no se lista, mismo criterio que ya se usa para "proveedores sin rubro" en
// el resto del sistema (no tiene sentido mostrar una fila vacía).
function FilaAlerta({ tono, titulo, detalle, etiquetaAccion, to }) {
  const tonos = {
    error: "bg-error-suave",
    alerta: "bg-laton-100",
  };
  return (
    <Link
      to={to}
      className={`flex items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-left hover:opacity-90 ${tonos[tono]}`}
    >
      <div>
        <p className="text-[13.5px] font-semibold text-tinta">{titulo}</p>
        <p className="text-[12px] text-tinta/60">{detalle}</p>
      </div>
      <span className="shrink-0 text-[12.5px] font-semibold text-pino">{etiquetaAccion} →</span>
    </Link>
  );
}

export function AdminInicio() {
  const navigate = useNavigate();
  const { usuario, rolInfo } = useSesion();
  const [busqueda, setBusqueda] = useState("");
  const { toast, mostrarToast } = useToast();
  const hoy = hoyEnHoraLocal();
  const manana = sumarDias(hoy, 1);

  const confirmadasQuery = useQuery({
    queryKey: ["reservas", "confirmada"],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.CONFIRMADA }),
  });
  const enCursoQuery = useQuery({
    queryKey: ["reservas", "en-curso"],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO }),
  });
  // Sin filtro de estado: trae cualquier reserva, para "Últimas reservas
  // cargadas" — se ordena por id descendente más abajo (ver nota en esa
  // sección, Reserva no tiene ningún campo de fecha de creación).
  const todasQuery = useQuery({ queryKey: ["reservas", "todas"], queryFn: () => listarReservas({}) });
  // activo="todos": a diferencia del resto de las pantallas, acá interesa
  // el total real del catálogo (incluidas de baja) para la tarjeta de
  // Habitaciones, no solo las operativas.
  const habitacionesQuery = useQuery({
    queryKey: ["habitaciones", "todas"],
    queryFn: () => listarHabitaciones({ activo: "todos" }),
  });
  const ordenesQuery = useQuery({ queryKey: ["ordenes-mantenimiento"], queryFn: () => listarOrdenesMantenimiento() });
  const articulosQuery = useQuery({
    queryKey: ["articulos", { estado: "activo", pageSize: 1000 }],
    queryFn: () => listarArticulos({ estado: "activo", pageSize: 1000 }),
  });
  const depositosQuery = useQuery({ queryKey: ["depositos"], queryFn: listarDepositos });
  const stockQuery = useQuery({ queryKey: ["stock", {}], queryFn: () => consultarStock({}) });
  const proveedoresActivosQuery = useQuery({
    queryKey: ["proveedores", { estado: "activo", pageSize: 1 }],
    queryFn: () => listarProveedores({ estado: "activo", pageSize: 1 }),
  });
  const proveedoresTodosQuery = useQuery({
    queryKey: ["proveedores", { estado: "todos", pageSize: 1 }],
    queryFn: () => listarProveedores({ estado: "todos", pageSize: 1 }),
  });

  // Buscador único del header: mismo comportamiento exacto que ya usa
  // RecepcionistaInicio.jsx (primero prueba como reserva por código o
  // documento, y si no matchea nada cae a número de habitación exacto).
  const busquedaMutation = useMutation({
    mutationFn: async (termino) => {
      try {
        const resultado = await buscarReservaParaCheckIn({ codigo: termino });
        return { tipo: "reserva", id: resultado.reserva.id };
      } catch (error) {
        if (error?.response?.status !== 404) throw error;
      }
      const habitaciones = await listarHabitaciones({ q: termino, activo: "true" });
      const habitacion = habitaciones.find((h) => h.numero === termino);
      if (!habitacion) throw new Error(`No se encontró ninguna reserva ni habitación para "${termino}".`);
      return { tipo: "habitacion", id: habitacion.id };
    },
    onSuccess: (resultado) => {
      navigate(resultado.tipo === "reserva" ? `/reservas/${resultado.id}` : `/habitaciones/${resultado.id}`);
    },
    onError: (error) => mostrarToast(error?.response?.data?.error ?? error.message ?? "No se pudo completar la búsqueda."),
  });

  function manejarBusqueda(e) {
    e.preventDefault();
    const termino = busqueda.trim();
    if (termino) busquedaMutation.mutate(termino);
  }

  const confirmadas = confirmadasQuery.data ?? [];
  const enCurso = enCursoQuery.data ?? [];
  const todas = todasQuery.data ?? [];
  const todasHabitaciones = habitacionesQuery.data ?? [];
  const habitacionesActivas = todasHabitaciones.filter((h) => h.activo);
  const habitacionesInactivas = todasHabitaciones.length - habitacionesActivas.length;
  const ordenes = ordenesQuery.data ?? [];
  const articulosResp = articulosQuery.data;
  const articulosActivos = articulosResp?.items ?? [];
  const depositos = depositosQuery.data ?? [];
  const stock = stockQuery.data ?? [];

  // Pulso operativo
  const reservasActivas = confirmadas.length + enCurso.length;
  const checkinsPendientesHoy = confirmadas.filter((r) => r.fechaDesde.slice(0, 10) === hoy);
  const checkinsRealizadosHoy = enCurso.filter((r) => r.fechaDesde.slice(0, 10) === hoy);
  const checkoutsHoy = enCurso.filter((r) => r.fechaHasta.slice(0, 10) === hoy);
  const checkoutsVencidos = enCurso.filter((r) => r.fechaHasta.slice(0, 10) < hoy);
  const habitacionesLibres = habitacionesActivas.filter((h) => h.estado === "libre").length;

  // Catálogos maestros
  const totalArticulosActivos = articulosResp?.total ?? articulosActivos.length;
  const articulosSinCentral = articulosActivos.filter((a) => a.depositoCentralId == null);
  const centrales = depositos.filter((d) => d.esCentral);
  const perifericos = depositos.length - centrales.length;
  const proveedoresActivosTotal = proveedoresActivosQuery.data?.total ?? 0;
  const proveedoresTodosTotal = proveedoresTodosQuery.data?.total ?? 0;
  const proveedoresInactivos = proveedoresTodosTotal - proveedoresActivosTotal;

  // Mantenimiento urgente sin resolver
  const ordenesUrgentesPendientes = ordenes.filter((o) => o.estado === "Pendiente" && o.urgente);

  // Cobertura de stock por depósito central — % de artículos habilitados
  // por encima de su mínimo, calculado por separado para cada uno de los
  // 2 centrales (no un promedio combinado).
  const coberturaPorCentral = centrales.map((central) => {
    const filas = stock.filter((s) => s.activo && s.depositoId === central.id);
    const porEncima = filas.filter((s) => Number(s.stockActual) > Number(s.stockMinimo)).length;
    const bajoMinimo = filas.length - porEncima;
    return {
      id: central.id,
      nombre: central.nombre,
      total: filas.length,
      bajoMinimo,
      pct: filas.length ? Math.round((porEncima / filas.length) * 100) : null,
    };
  });
  const totalBajoMinimoCentral = coberturaPorCentral.reduce((acc, c) => acc + c.bajoMinimo, 0);
  // Para el link de la alerta: al depósito central puntual que tiene
  // artículos críticos (mismo destino que ya usa "Ver depósito" en
  // AlertasPage.jsx — DepositoDetallePage soporta ?criticos=1). Si ninguno
  // en particular está identificado, cae al listado general.
  const centralConCriticos = coberturaPorCentral.find((c) => c.bajoMinimo > 0);

  // Habitaciones por estado, para el gráfico de barra apilada.
  const porEstado = Object.fromEntries(
    ESTADOS_GRAFICO.map(({ valor }) => [valor, habitacionesActivas.filter((h) => h.estado === valor).length])
  );

  // Últimas reservas cargadas: sin campo de fecha de creación en Reserva
  // (ver conversación de re-auditoría), se ordena por id descendente como
  // proxy del orden de carga real (los ids son autoincrementales) — por
  // eso el título de la sección no dice "recientes" ni sugiere que es por
  // fecha real.
  const ultimasReservas = [...todas].sort((a, b) => b.id - a.id).slice(0, 6);

  // Próximas llegadas: reservas Confirmada con fechaDesde de hoy en
  // adelante, ordenadas por fecha ascendente.
  const proximasLlegadas = confirmadas
    .filter((r) => r.fechaDesde.slice(0, 10) >= hoy)
    .sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde))
    .slice(0, 5);

  function etiquetaFechaRelativa(fechaISO) {
    const dia = fechaISO.slice(0, 10);
    if (dia === hoy) return "hoy";
    if (dia === manana) return "mañana";
    return formatearFechaSinHora(fechaISO);
  }

  const ALERTAS = [
    {
      tono: "error",
      cantidad: checkoutsVencidos.length,
      titulo: `${checkoutsVencidos.length} check-out${checkoutsVencidos.length === 1 ? "" : "s"} vencido${checkoutsVencidos.length === 1 ? "" : "s"}`,
      detalle: "Huéspedes que ya deberían haberse ido",
      etiquetaAccion: "Ver",
      to: "/check-out",
    },
    {
      tono: "error",
      cantidad: ordenesUrgentesPendientes.length,
      titulo: "Mantenimiento urgente sin resolver",
      detalle: ordenesUrgentesPendientes.map((o) => `Hab. ${o.habitacion?.numero}`).join(" · "),
      etiquetaAccion: "Ver",
      to: "/historial-mantenimiento",
    },
    {
      tono: "alerta",
      cantidad: articulosSinCentral.length,
      titulo: `${articulosSinCentral.length} artículo${articulosSinCentral.length === 1 ? "" : "s"} sin depósito central asignado`,
      detalle: "No pueden pedirse por transferencia",
      etiquetaAccion: "Revisar",
      to: "/articulos",
    },
    {
      tono: "alerta",
      cantidad: totalBajoMinimoCentral,
      titulo: `${totalBajoMinimoCentral} artículo${totalBajoMinimoCentral === 1 ? "" : "s"} bajo el mínimo en depósito central`,
      detalle: centralConCriticos?.nombre ?? "",
      etiquetaAccion: "Ver depósito",
      to: centralConCriticos ? `/depositos/${centralConCriticos.id}?criticos=1` : "/depositos",
    },
  ].filter((a) => a.cantidad > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-pino px-6 py-5 text-hueso">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">
            {saludoActual()}, {usuario ?? rolInfo?.label}
          </h1>
          <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
            {rolInfo?.label} · {fechaCompletaHoy()}
          </p>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
          <form onSubmit={manejarBusqueda} className="relative w-full max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-piedra" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código, documento o N° de habitación…"
              className="w-full rounded-md border border-borde bg-white py-2.5 pl-9 pr-3 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino-300"
            />
          </form>
          {/* Selector de período — todavía no filtra ningún dato (no hay
              todavía a qué aplicarlo en esta pantalla), se deja visible a
              pedido para cuando el dashboard sume métricas por rango. */}
          <select
            aria-label="Período"
            defaultValue="7"
            className="cursor-pointer rounded-md border border-hueso/30 bg-hueso/10 px-3 py-2 text-[13px] text-hueso focus:outline-none"
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="hoy">Hoy</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <TarjetaMetrica
          label="Reservas activas"
          icon={CalendarCheck}
          value={reservasActivas}
          onClick={() => navigate("/reservas")}
        />
        <TarjetaMetrica
          label="Check-ins de hoy"
          icon={LogIn}
          value={checkinsPendientesHoy.length + checkinsRealizadosHoy.length}
          hint={`${checkinsPendientesHoy.length} pendiente${checkinsPendientesHoy.length === 1 ? "" : "s"} · ${checkinsRealizadosHoy.length} ya ingresado${checkinsRealizadosHoy.length === 1 ? "" : "s"}`}
          onClick={() => navigate("/check-in")}
        />
        <TarjetaMetrica
          label="Check-outs de hoy"
          icon={DoorClosed}
          value={checkoutsHoy.length}
          hint={checkoutsVencidos.length > 0 ? `${checkoutsVencidos.length} vencido${checkoutsVencidos.length === 1 ? "" : "s"}` : "sin vencidos"}
          hintClassName={checkoutsVencidos.length > 0 ? "font-semibold text-error-texto" : ""}
          onClick={() => navigate("/check-out")}
        />
        <TarjetaMetrica
          label="Habitaciones disponibles"
          icon={BedDouble}
          value={habitacionesLibres}
          hint={`de ${habitacionesActivas.length} totales`}
          onClick={() => navigate("/habitaciones?estado=libre")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <TarjetaMetrica
          label="Artículos"
          icon={Package}
          value={totalArticulosActivos}
          hint="activos en catálogo"
          onClick={() => navigate("/articulos")}
        />
        <TarjetaMetrica
          label="Depósitos"
          icon={Warehouse}
          value={depositos.length}
          hint={`${centrales.length} centrales · ${perifericos} periféricos`}
          onClick={() => navigate("/depositos")}
        />
        <TarjetaMetrica
          label="Proveedores"
          icon={Building2}
          value={proveedoresActivosTotal}
          hint={proveedoresInactivos > 0 ? `activos (${proveedoresInactivos} inactivo${proveedoresInactivos === 1 ? "" : "s"})` : "todos activos"}
          onClick={() => navigate("/proveedores")}
        />
        <TarjetaMetrica
          label="Habitaciones"
          icon={BedDouble}
          value={todasHabitaciones.length}
          hint={habitacionesInactivas > 0 ? `${habitacionesInactivas} de baja` : "todas activas"}
          onClick={() => navigate("/habitaciones")}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-borde bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 font-heading text-[16px] font-semibold">
                <TriangleAlert size={15} className="text-error" /> Alertas
              </h2>
              <span className="text-[11.5px] text-piedra">Operativas y de configuración</span>
            </div>
            {ALERTAS.length === 0 ? (
              <p className="text-sm text-piedra">Sin alertas activas por el momento.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {ALERTAS.map((a) => (
                  <FilaAlerta key={a.titulo} {...a} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-borde bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-heading text-[16px] font-semibold">Últimas reservas cargadas</h2>
              <Link to="/reservas" className="shrink-0 text-[12.5px] font-semibold text-pino hover:underline">
                Ver todas →
              </Link>
            </div>
            <Table
              columnas={["Huésped", "Habitación", "Estadía", "Estado"]}
              filas={ultimasReservas}
              vacio="Todavía no hay reservas cargadas."
              renderFila={(r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/reservas/${r.id}`)}
                  className="h-12 cursor-pointer border-b border-borde last:border-0 hover:bg-hueso"
                >
                  <td className="px-3 py-2.5">
                    <NombreClave>{r.huesped?.nombre}</NombreClave>
                    <CodigoClave className="mt-0.5 block text-[10.5px]">{r.codigoConfirmacion}</CodigoClave>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12.5px]">{r.habitaciones?.map((h) => h.numero).join(", ")}</td>
                  <td className="px-3 py-2.5 text-[12.5px]">
                    {formatearFechaSinHora(r.fechaDesde)} → {formatearFechaSinHora(r.fechaHasta)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variante={ESTADO_RESERVA_BADGE[r.estado] ?? "neutro"}>{r.estado}</Badge>
                  </td>
                </tr>
              )}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-borde bg-white p-5">
            <h2 className="mb-3 font-heading text-[16px] font-semibold">Habitaciones por estado</h2>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutro-200">
              {ESTADOS_GRAFICO.filter(({ valor }) => porEstado[valor] > 0).map(({ valor }) => (
                <div
                  key={valor}
                  style={{
                    width: `${(porEstado[valor] / (habitacionesActivas.length || 1)) * 100}%`,
                    backgroundColor: ESTADO_HABITACION_COLOR[valor].texto,
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-tinta/70">
              {ESTADOS_GRAFICO.map(({ valor, abrev }) => (
                <span key={valor} className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: ESTADO_HABITACION_COLOR[valor].texto }}
                  />
                  {abrev} ({porEstado[valor]})
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-borde bg-white p-5">
            <h2 className="mb-3 font-heading text-[16px] font-semibold">Cobertura de stock central</h2>
            {coberturaPorCentral.length === 0 ? (
              <p className="text-sm text-piedra">No hay depósitos centrales configurados.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {coberturaPorCentral.map((c) => (
                  <div key={c.id}>
                    <div className="mb-1 flex items-center justify-between text-[12.5px]">
                      <span className="font-medium">{c.nombre}</span>
                      <span className="font-mono text-tinta/60">{c.pct ?? "—"}%</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutro-200">
                      <div
                        className={`h-full rounded-full ${
                          c.pct == null ? "" : c.pct >= 90 ? "bg-pino" : c.pct >= 70 ? "bg-laton-500" : "bg-error"
                        }`}
                        style={{ width: `${c.pct ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-borde bg-white p-5">
            <h2 className="mb-3 font-heading text-[16px] font-semibold">Próximas llegadas</h2>
            {proximasLlegadas.length === 0 ? (
              <p className="text-sm text-piedra">No hay llegadas próximas confirmadas.</p>
            ) : (
              <div className="flex flex-col divide-y divide-borde">
                {proximasLlegadas.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <NombreClave className="block">{r.huesped?.nombre}</NombreClave>
                      <p className="text-[12px] text-piedra">Hab. {r.habitaciones?.map((h) => h.numero).join(", ")}</p>
                    </div>
                    <span className="shrink-0 text-[12px] font-semibold text-piedra">{etiquetaFechaRelativa(r.fechaDesde)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Toast mensaje={toast} />
    </div>
  );
}
