import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { AdminInicio } from "./AdminInicio";
import { useSesion } from "../../lib/sesion";
import { hoyEnHoraLocal } from "../../lib/fechas";
import { buscarReservaParaCheckIn } from "../check-in/checkIn.api";
import { listarReservas } from "../reservas/reservas.api";
import { ESTADO_RESERVA } from "../reservas/reservas.constantes";
import { listarHabitaciones, listarOrdenesMantenimiento } from "../habitaciones/habitaciones.api";
import { listarArticulos } from "../articulos/articulos.api";
import { listarDepositos } from "../depositos/depositos.api";
import { listarProveedores } from "../proveedores/proveedores.api";
import { consultarStock } from "../stock/stock.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("../check-in/checkIn.api", () => ({ buscarReservaParaCheckIn: vi.fn() }));
vi.mock("../reservas/reservas.api", () => ({ listarReservas: vi.fn() }));
vi.mock("../habitaciones/habitaciones.api", () => ({
  listarHabitaciones: vi.fn(),
  listarOrdenesMantenimiento: vi.fn(),
}));
vi.mock("../articulos/articulos.api", () => ({ listarArticulos: vi.fn() }));
vi.mock("../depositos/depositos.api", () => ({ listarDepositos: vi.fn() }));
vi.mock("../proveedores/proveedores.api", () => ({ listarProveedores: vi.fn() }));
vi.mock("../stock/stock.api", () => ({ consultarStock: vi.fn() }));

function mananaISO(hoy) {
  const fecha = new Date(`${hoy}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + 1);
  return fecha.toISOString().slice(0, 10);
}
function sumarDiasISO(hoy, dias) {
  const fecha = new Date(`${hoy}T00:00:00.000Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

const hoy = hoyEnHoraLocal();
const maniana = mananaISO(hoy);
const enCincoDias = sumarDiasISO(hoy, 5);
const ayer = sumarDiasISO(hoy, -1);

// --- Reservas ---------------------------------------------------------
const CERRADA_VIEJA = {
  id: 0,
  codigoConfirmacion: "RS-VIEJA",
  estado: ESTADO_RESERVA.CERRADA,
  fechaDesde: `${ayer}T00:00:00.000Z`,
  fechaHasta: `${hoy}T00:00:00.000Z`,
  huesped: { nombre: "Vieja Test" },
  habitaciones: [{ numero: "999" }],
};
const CONF_HOY = {
  id: 1,
  codigoConfirmacion: "RS-CONF-HOY",
  estado: ESTADO_RESERVA.CONFIRMADA,
  fechaDesde: `${hoy}T00:00:00.000Z`,
  fechaHasta: `${maniana}T00:00:00.000Z`,
  huesped: { nombre: "Ana Llega Hoy" },
  habitaciones: [{ numero: "101" }],
};
const CONF_MANIANA = {
  id: 2,
  codigoConfirmacion: "RS-CONF-MAN",
  estado: ESTADO_RESERVA.CONFIRMADA,
  fechaDesde: `${maniana}T00:00:00.000Z`,
  fechaHasta: `${enCincoDias}T00:00:00.000Z`,
  huesped: { nombre: "Julia Paz" },
  habitaciones: [{ numero: "205" }],
};
const CONF_FUTURA = {
  id: 3,
  codigoConfirmacion: "RS-CONF-FUT",
  estado: ESTADO_RESERVA.CONFIRMADA,
  fechaDesde: `${enCincoDias}T00:00:00.000Z`,
  fechaHasta: `${enCincoDias}T00:00:00.000Z`,
  huesped: { nombre: "Bruno Fecha" },
  habitaciones: [{ numero: "300" }],
};
const ENCURSO_SALE_HOY = {
  id: 10,
  codigoConfirmacion: "RS-SALE-HOY",
  estado: ESTADO_RESERVA.EN_CURSO,
  fechaDesde: `${ayer}T00:00:00.000Z`,
  fechaHasta: `${hoy}T00:00:00.000Z`,
  huesped: { nombre: "Laura Ríos" },
  habitaciones: [{ numero: "202" }],
};
const ENCURSO_LLEGO_HOY = {
  id: 11,
  codigoConfirmacion: "RS-LLEGO-HOY",
  estado: ESTADO_RESERVA.EN_CURSO,
  fechaDesde: `${hoy}T00:00:00.000Z`,
  fechaHasta: `${enCincoDias}T00:00:00.000Z`,
  huesped: { nombre: "Nadia Cruz" },
  habitaciones: [{ numero: "304" }],
};
const ENCURSO_VENCIDA = {
  id: 12,
  codigoConfirmacion: "RS-VENCIDA",
  estado: ESTADO_RESERVA.EN_CURSO,
  fechaDesde: `${ayer}T00:00:00.000Z`,
  fechaHasta: `${ayer}T00:00:00.000Z`,
  huesped: { nombre: "Mario Vencido" },
  habitaciones: [{ numero: "410" }],
};

const CONFIRMADAS = [CONF_HOY, CONF_MANIANA, CONF_FUTURA];
const EN_CURSO = [ENCURSO_SALE_HOY, ENCURSO_LLEGO_HOY, ENCURSO_VENCIDA];
const TODAS_RESERVAS = [CERRADA_VIEJA, ...CONFIRMADAS, ...EN_CURSO];

// --- Habitaciones -------------------------------------------------------
const HABITACIONES_TODAS = [
  { id: 1, numero: "101", estado: "libre", activo: true },
  { id: 2, numero: "102", estado: "libre", activo: true },
  { id: 3, numero: "103", estado: "ocupada", activo: true },
  { id: 4, numero: "104", estado: "mantenimiento", activo: true },
  { id: 5, numero: "105", estado: "en limpieza", activo: true },
  { id: 6, numero: "106", estado: "bloqueada", activo: false },
];

const ORDENES = [
  { id: 1, estado: "Pendiente", urgente: true, tipoTarea: "Aire acondicionado", habitacion: { numero: "104" } },
  { id: 2, estado: "Pendiente", urgente: false, tipoTarea: "Preventivo", habitacion: { numero: "101" } },
  { id: 3, estado: "Resuelta", urgente: true, tipoTarea: "Pintura", habitacion: { numero: "50" } },
];

// --- Catálogos maestros --------------------------------------------------
const ARTICULOS_RESP = {
  items: [
    { id: 1, depositoCentralId: 100 },
    { id: 2, depositoCentralId: 101 },
    { id: 3, depositoCentralId: 100 },
    { id: 4, depositoCentralId: null },
    { id: 5, depositoCentralId: null },
  ],
  total: 5,
};

const DEPOSITOS = [
  { id: 100, nombre: "Central Secos/Insumos", esCentral: true, activo: true },
  { id: 101, nombre: "Central Perecederos", esCentral: true, activo: true },
  { id: 102, nombre: "Cocina", esCentral: false, activo: true },
];

const STOCK = [
  { activo: true, depositoId: 100, stockActual: 10, stockMinimo: 5 }, // por encima
  { activo: true, depositoId: 100, stockActual: 2, stockMinimo: 5 }, // bajo mínimo
  { activo: true, depositoId: 101, stockActual: 8, stockMinimo: 4 }, // por encima
  { activo: true, depositoId: 102, stockActual: 0, stockMinimo: 5 }, // periférico, no cuenta
];

function DetalleReservaStub() {
  const { id } = useParams();
  return <p>Detalle de la reserva {id}</p>;
}
function DetalleDepositoStub() {
  const { id } = useParams();
  return <p>Detalle del depósito {id}</p>;
}
function ArticulosStub() {
  return <p>Panel de Artículos</p>;
}
function CheckOutStub() {
  return <p>Panel de Check-out</p>;
}
function HistorialMantenimientoStub() {
  return <p>Historial de Mantenimiento completo</p>;
}
function HabitacionDetalleStub() {
  const { id } = useParams();
  return <p>Detalle de la habitación {id}</p>;
}

function renderInicio() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<AdminInicio />} />
          <Route path="/reservas/:id" element={<DetalleReservaStub />} />
          <Route path="/depositos/:id" element={<DetalleDepositoStub />} />
          <Route path="/habitaciones/:id" element={<HabitacionDetalleStub />} />
          <Route path="/articulos" element={<ArticulosStub />} />
          <Route path="/check-out" element={<CheckOutStub />} />
          <Route path="/historial-mantenimiento" element={<HistorialMantenimientoStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue({ rol: "admin", rolInfo: { label: "Administrador" }, usuario: "gimena" });
  listarReservas.mockImplementation(({ estado } = {}) => {
    if (estado === ESTADO_RESERVA.CONFIRMADA) return Promise.resolve(CONFIRMADAS);
    if (estado === ESTADO_RESERVA.EN_CURSO) return Promise.resolve(EN_CURSO);
    return Promise.resolve(TODAS_RESERVAS);
  });
  listarHabitaciones.mockImplementation(({ q } = {}) => {
    if (q) return Promise.resolve(HABITACIONES_TODAS.filter((h) => h.numero === q));
    return Promise.resolve(HABITACIONES_TODAS);
  });
  listarOrdenesMantenimiento.mockResolvedValue(ORDENES);
  listarArticulos.mockResolvedValue(ARTICULOS_RESP);
  listarDepositos.mockResolvedValue(DEPOSITOS);
  consultarStock.mockResolvedValue(STOCK);
  listarProveedores.mockImplementation(({ estado } = {}) => {
    if (estado === "activo") return Promise.resolve({ total: 4 });
    return Promise.resolve({ total: 5 });
  });
  buscarReservaParaCheckIn.mockRejectedValue({ response: { status: 404 } });
});

// Las tarjetas ya existen desde el primer render (con "0" mientras cargan
// las queries) — esperar solo la etiqueta con findByText resuelve antes de
// que los datos lleguen. Se busca la etiqueta (síncrono, siempre presente)
// y se espera con waitFor a que el valor real aparezca en esa misma tarjeta.
async function tarjetaConValor(label, contenidoEsperado) {
  const tarjeta = screen.getByText(label).closest("button");
  await waitFor(() => expect(tarjeta).toHaveTextContent(contenidoEsperado));
  return tarjeta;
}

describe("AdminInicio — pulso operativo", () => {
  it("reservas activas suma Confirmada + En curso, sin ningún hint de 'creadas hoy'", async () => {
    renderInicio();

    const tarjeta = await tarjetaConValor("Reservas activas", "6");
    expect(tarjeta).not.toHaveTextContent(/nueva/i);
  });

  it("check-ins de hoy distingue pendientes de ya ingresados", async () => {
    renderInicio();

    expect(await screen.findByText("1 pendiente · 1 ya ingresado")).toBeInTheDocument();
  });

  it("check-outs de hoy avisa cuántos están vencidos", async () => {
    renderInicio();

    const tarjeta = await tarjetaConValor("Check-outs de hoy", "1"); // ENCURSO_SALE_HOY
    expect(tarjeta).toHaveTextContent("1 vencido"); // ENCURSO_VENCIDA
  });

  it("habitaciones disponibles cuenta solo las activas en estado libre, sobre el total activo", async () => {
    renderInicio();

    const tarjeta = await tarjetaConValor("Habitaciones disponibles", "de 5 totales");
    expect(tarjeta).toHaveTextContent("2");
  });
});

describe("AdminInicio — catálogos maestros", () => {
  it("muestra los 4 catálogos con sus conteos reales y navega al ABM correspondiente", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    await tarjetaConValor("Artículos", "5");
    await tarjetaConValor("Depósitos", "2 centrales · 1 periféricos");
    await tarjetaConValor("Proveedores", "activos (1 inactivo)");
    await tarjetaConValor("Habitaciones", "1 de baja"); // total = 6, incluida la de baja

    await usuario.click(screen.getByText("Artículos").closest("button"));
    expect(await screen.findByText("Panel de Artículos")).toBeInTheDocument();
  });
});

describe("AdminInicio — alertas", () => {
  it("muestra check-outs vencidos, sin depósito central y bajo mínimo, cada una con su link", async () => {
    renderInicio();

    expect(await screen.findByText("1 check-out vencido")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1 check-out vencido/ })).toHaveAttribute("href", "/check-out");

    expect(screen.getByText("2 artículos sin depósito central asignado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sin depósito central/ })).toHaveAttribute("href", "/articulos");

    expect(screen.getByText("1 artículo bajo el mínimo en depósito central")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /bajo el mínimo/ })).toHaveAttribute("href", "/depositos/100?criticos=1");
  });

  it("una categoría en cero no se lista (mantenimiento urgente sin resolver)", async () => {
    listarOrdenesMantenimiento.mockResolvedValue([{ id: 1, estado: "Resuelta", urgente: true, habitacion: { numero: "1" } }]);
    renderInicio();

    await screen.findByText("1 check-out vencido"); // espera a que termine de cargar
    expect(screen.queryByText(/mantenimiento urgente/i)).not.toBeInTheDocument();
  });

  it("cuando SÍ hay mantenimiento urgente pendiente, aparece con el link a Historial de Mantenimiento", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    const link = await screen.findByRole("link", { name: /mantenimiento urgente/i });
    expect(link).toHaveAttribute("href", "/historial-mantenimiento");
    await usuario.click(link);
    expect(await screen.findByText("Historial de Mantenimiento completo")).toBeInTheDocument();
  });

  it("sin ninguna alerta activa, muestra el estado vacío en vez de una lista en blanco", async () => {
    listarReservas.mockImplementation(({ estado } = {}) => {
      if (estado) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    listarOrdenesMantenimiento.mockResolvedValue([]);
    listarArticulos.mockResolvedValue({ items: [{ id: 1, depositoCentralId: 100 }], total: 1 });
    consultarStock.mockResolvedValue([{ activo: true, depositoId: 100, stockActual: 10, stockMinimo: 5 }]);

    renderInicio();

    expect(await screen.findByText("Sin alertas activas por el momento.")).toBeInTheDocument();
  });
});

describe("AdminInicio — habitaciones por estado", () => {
  it("no renderiza un segmento para un estado en cero (bloqueada)", async () => {
    const { container } = renderInicio();

    await screen.findByText("Libre (2)");
    expect(screen.getByText("Ocup. (1)")).toBeInTheDocument();
    expect(screen.getByText("Limp. (1)")).toBeInTheDocument();
    expect(screen.getByText("Mant. (1)")).toBeInTheDocument();
    expect(screen.getByText("Bloq. (0)")).toBeInTheDocument(); // la leyenda sí lo lista

    const barra = container.querySelector(".rounded-full.bg-neutro-200");
    expect(barra.children).toHaveLength(4); // libre, ocupada, en limpieza, mantenimiento — no bloqueada
  });
});

describe("AdminInicio — últimas reservas cargadas", () => {
  it("se ordenan por id descendente (proxy de orden de carga) y no dicen 'recientes'", async () => {
    renderInicio();

    await screen.findByText("Mario Vencido"); // id 12 — espera a que la tabla termine de cargar
    expect(screen.queryByText(/reservas recientes/i)).not.toBeInTheDocument();

    const filas = screen.getAllByRole("row").slice(1); // sin el header
    expect(filas).toHaveLength(6); // 7 reservas totales, corta en 6
    expect(filas[0]).toHaveTextContent("Mario Vencido"); // id 12, el más alto
    expect(screen.queryByText("Vieja Test")).not.toBeInTheDocument(); // id 0, queda afuera del corte
  });

  it("click en una fila navega al Detalle de esa reserva", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    const fila = (await screen.findByText("Mario Vencido")).closest("tr");
    await usuario.click(fila);

    expect(await screen.findByText("Detalle de la reserva 12")).toBeInTheDocument();
  });
});

describe("AdminInicio — próximas llegadas", () => {
  it("muestra fecha relativa: hoy, mañana, o la fecha si es más lejos", async () => {
    renderInicio();

    const seccion = (await screen.findByText("Próximas llegadas")).closest("div");
    const filaHoy = (await within(seccion).findByText("Ana Llega Hoy")).closest("div").parentElement;
    expect(filaHoy).toHaveTextContent("hoy");

    const filaManiana = within(seccion).getByText("Julia Paz").closest("div").parentElement;
    expect(filaManiana).toHaveTextContent("mañana");

    expect(within(seccion).getByText("Bruno Fecha")).toBeInTheDocument();
  });
});

describe("AdminInicio — buscador único del header (mismo comportamiento que RecepcionistaInicio)", () => {
  it("código de confirmación: matchea por buscarReservaParaCheckIn y va al Detalle de la reserva", async () => {
    buscarReservaParaCheckIn.mockResolvedValueOnce({ reserva: { id: 99 }, puedeIniciarCheckIn: true, motivoBloqueo: null });
    const usuario = userEvent.setup();
    renderInicio();

    const input = await screen.findByPlaceholderText(/Buscar por código, documento o N° de habitación/);
    await usuario.type(input, "RS-8F2K91");
    await usuario.keyboard("{Enter}");

    expect(buscarReservaParaCheckIn).toHaveBeenCalledWith({ codigo: "RS-8F2K91" });
    expect(await screen.findByText("Detalle de la reserva 99")).toBeInTheDocument();
  });

  it("número de habitación: si no matchea ninguna reserva, resuelve por habitación exacta", async () => {
    const usuario = userEvent.setup();
    renderInicio();

    const input = await screen.findByPlaceholderText(/Buscar por código, documento o N° de habitación/);
    await usuario.type(input, "103");
    await usuario.keyboard("{Enter}");

    expect(await screen.findByText("Detalle de la habitación 3")).toBeInTheDocument();
  });
});

describe("AdminInicio — sin datos de ingresos ni facturación", () => {
  it("no muestra ningún monto, ingreso o dato de facturación en ningún lado de la pantalla", async () => {
    renderInicio();

    await screen.findByText("Últimas reservas cargadas"); // espera a que termine de cargar todo

    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/facturaci[oó]n/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ingreso/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recaudad/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/caja diaria/i)).not.toBeInTheDocument();
  });
});
