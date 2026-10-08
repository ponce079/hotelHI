import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CheckInPage } from "./CheckInPage";
import * as api from "./checkIn.api";
import { cotizarReserva } from "../reservas/reservas.api";
import { hoyEnHoraLocal, sumarDiasISO } from "../../lib/fechas";

// Flujos completos de pantalla (tipeo, esperas de búsqueda): más margen que el default de 5 s.
vi.setConfig({ testTimeout: 20000 });

vi.mock("../../lib/sesion", () => ({ useSesion: () => ({ usuario: "recepcionista.prueba", puede: () => true }) }));
vi.mock("./checkIn.api");
// La reserva de estas pruebas no dejó una tarjeta en garantía: el check-in pide depósito o tarjeta.
vi.mock("../garantias/garantias.api", () => ({
  obtenerGarantiasReserva: vi.fn().mockResolvedValue({ reserva: null, estadia: null }),
}));
vi.mock("../reservas/reservas.api", () => ({ cotizarReserva: vi.fn() }));
vi.mock("../pagos-estadia/TarjetaSimuladaPanel", () => ({ TarjetaSimuladaPanel: () => null }));

// Fechas y nacimientos SIEMPRE relativos a hoy.
const hoy = hoyEnHoraLocal();
const iso = (dias) => `${sumarDiasISO(hoy, dias)}T00:00:00.000Z`;
function haceAnios(anios) {
  const [a, m, d] = sumarDiasISO(hoy, -1).split("-");
  return { iso: `${Number(a) - anios}-${m}-${d}`, texto: `${d}/${m}/${Number(a) - anios}` };
}

const PLAN_BAR = { id: 1, codigo: "BAR", nombre: "Tarifa flexible", reembolsable: true, horasCancelacionSinCargo: 48 };
const PLAN_NRF = { id: 2, codigo: "NRF", nombre: "No reembolsable", reembolsable: false };
const HUESPED = { id: 77, nombre: "Martín Gutiérrez", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30512874", contacto: "m@correo.com" };

function reservaDe({ id = 10, codigo = "C43B1F20", habitaciones, plan = PLAN_BAR, total = 294000, huesped = HUESPED }) {
  return {
    id,
    codigoConfirmacion: codigo,
    estado: "Confirmada",
    fechaDesde: iso(0),
    fechaHasta: iso(3),
    noches: 3,
    huespedId: huesped.id,
    huesped,
    planTarifario: plan,
    cantidadHabitaciones: habitaciones.length,
    totalEstimadoAlojamiento: total,
    habitaciones,
  };
}
const HAB_270 = { id: 270, numero: "270", tipo: "Doble", tipoHabitacionId: 1, capacidad: 3, piso: 2, adultos: 2, menores: 1 };

function fichaTitular(habitacionId = 270) {
  return {
    id: 501,
    estado: "Previsto",
    huespedId: 77,
    esTitular: true,
    nombre: "Martín Gutiérrez",
    apellido: "",
    tipoDocumento: "DNI",
    paisDocumento: "AR",
    numeroDocumento: "30512874",
    fechaNacimiento: `${haceAnios(42).iso}T00:00:00.000Z`,
    nacionalidad: "AR",
    paisResidencia: "AR",
    localidad: "Córdoba",
    domicilio: "Av. Colón 1450",
    telefono: "+54 351 555-0182",
    email: "m@correo.com",
    asignaciones: [{ habitacionId, hasta: null }],
  };
}

function llegadaDe(reserva, senia = { registrada: false, importe: 0, medios: [] }) {
  return {
    id: reserva.id,
    codigoConfirmacion: reserva.codigoConfirmacion,
    fechaDesde: reserva.fechaDesde,
    fechaHasta: reserva.fechaHasta,
    noches: reserva.noches,
    titular: { nombre: reserva.huesped.nombre },
    habitaciones: reserva.habitaciones.map((h) => ({ ...h })),
    plan: reserva.planTarifario,
    totalAlojamiento: reserva.totalEstimadoAlojamiento,
    senia,
  };
}

function prepararReserva(reserva, ocupantes, { senia, anteriores = 0 } = {}) {
  api.listarLlegadas.mockResolvedValue({ fecha: hoy, anterioresPendientes: anteriores, reservas: [llegadaDe(reserva, senia)] });
  api.buscarReservaParaCheckIn.mockResolvedValue({ reserva, puedeIniciarCheckIn: true, motivoBloqueo: null });
  api.listarOcupantes.mockResolvedValue(ocupantes);
}

function renderizar(ruta = "/check-in") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>
        <CheckInPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const filas = () => [...document.querySelectorAll('[id^="ci-fila-"]')];
// Rótulo con o sin el asterisco de obligatorio, pegado ("Nombres" o "Nombres*"), o "(opcional)".
const rotulo = (texto) => new RegExp(`^${texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\*| \\(opcional\\))?$`);
const cambiar = (fila, etiqueta, valor) =>
  fireEvent.change(within(fila).getByLabelText(typeof etiqueta === "string" ? rotulo(etiqueta) : etiqueta), { target: { value: valor } });
const botonConfirmar = () => screen.getByRole("button", { name: /Confirmar check-in|Procesando/ });

async function abrirReserva(codigo = "C43B1F20") {
  const fila = await screen.findByText(codigo);
  fireEvent.click(fila.closest("tr"));
  await waitFor(() => expect(filas().length).toBeGreaterThan(0));
}

// Completa la reserva de 2 adultos + 1 menor (titular precargado).
async function completarFamilia() {
  const [titular, adulto2, menor] = filas();
  cambiar(titular, "Nombres", "Martín");
  cambiar(titular, "Apellido", "Gutiérrez");
  cambiar(adulto2, "Número", "31784205");
  cambiar(adulto2, "Nombres", "Carolina");
  cambiar(adulto2, "Apellido", "Paz");
  cambiar(adulto2, "Nacimiento", haceAnios(39).texto.replace(/\//g, ""));
  cambiar(menor, "Nombres", "Tomás");
  cambiar(menor, "Apellido", "Gutiérrez");
  cambiar(menor, "Nacimiento", haceAnios(8).texto.replace(/\//g, ""));
  cambiar(menor, "Vínculo", "Padre o madre");
  // La sección de garantía aparece cuando termina la consulta de la tarjeta guardada.
  fireEvent.click(await screen.findByLabelText(/Confirmo que recibí/));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.buscarHuespedPorDocumento.mockRejectedValue({ response: { status: 404 } });
});

describe("Llegadas de hoy", () => {
  it("muestra la tabla con seña tal cual, sin seña, el aviso de anteriores y formatos de pantalla", async () => {
    const reserva = reservaDe({ habitaciones: [HAB_270] });
    prepararReserva(reserva, [fichaTitular()], {
      senia: { registrada: true, importe: 58800, medios: [{ medioPago: "Tarjeta crédito", importe: 58800, referencia: "VISA ****4242 · aut. 5521" }] },
      anteriores: 2,
    });
    renderizar();
    expect(await screen.findByText("VISA ****4242 · aut. 5521")).toBeInTheDocument();
    expect(screen.getByText("Hay 2 reservas de días anteriores sin ingreso (posible no-show). Se gestiona desde Reservas.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Llegadas de hoy/ })).toHaveTextContent("1");
    expect(screen.getByText(/→ .* · 3 noches/)).toHaveTextContent(/^[a-zñáéíóú]{3} \d{2}\/\d{2} → [a-zñáéíóú]{3} \d{2}\/\d{2} · 3 noches$/);
    expect(document.body.textContent).not.toMatch(/\bHU\b|HU-\d|\d{4}-\d{2}-\d{2}/);
  });

  it("Enter sobre una fila abre el check-in debajo", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    renderizar();
    const celda = await screen.findByText("C43B1F20");
    fireEvent.keyDown(celda.closest("tr"), { key: "Enter" });
    expect(await screen.findByText("Reserva C43B1F20")).toBeInTheDocument();
    expect(api.buscarReservaParaCheckIn).toHaveBeenCalledWith({ id: 10 });
  });
});

describe("Check-in con reserva", () => {
  it("precarga las fichas Previstas en sus filas, con quien reservó como titular y el aviso del nombre completo", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    const [titular, adulto2, menor] = filas();
    expect(within(titular).getByLabelText(rotulo("Nombres"))).toHaveValue("Martín Gutiérrez");
    expect(within(titular).getByLabelText(rotulo("Nacimiento"))).toHaveValue(haceAnios(42).texto);
    expect(within(titular).getByText("Titular de la reserva")).toBeInTheDocument();
    expect(within(titular).getByText(/El nombre viene completo desde la reserva/)).toBeInTheDocument();
    expect(within(adulto2).getByText("Adulto 2")).toBeInTheDocument();
    expect(within(menor).getByText("Menor 1")).toBeInTheDocument();
    expect(screen.getAllByText("$ 294.000").length).toBeGreaterThan(0);
  });

  it("reserva con nombres y apellido separados: el titular se precarga cada uno en su campo, sin aviso", async () => {
    const huesped = { ...HUESPED, nombre: "Martín Gutiérrez", nombres: "Martín", apellido: "Gutiérrez" };
    prepararReserva(reservaDe({ habitaciones: [HAB_270], huesped }), []);
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    const [titular] = filas();
    expect(within(titular).getByLabelText(rotulo("Nombres"))).toHaveValue("Martín");
    expect(within(titular).getByLabelText(rotulo("Apellido"))).toHaveValue("Gutiérrez");
    expect(within(titular).queryByText(/El nombre viene completo desde la reserva/)).not.toBeInTheDocument();
  });

  it("asteriscos según la fila, leyenda y mayúscula inicial al salir del campo", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    const [titular, adulto2, menor] = filas();
    expect(screen.getByText("* obligatorio")).toBeInTheDocument();
    // Teléfono: obligatorio solo para el titular de la reserva.
    expect(within(titular).getByLabelText("Teléfono*")).toBeInTheDocument();
    for (const etiqueta of ["Nombres*", "Apellido*", "Nacimiento*", "Número*", "País emisor*"])
      expect(within(adulto2).getByLabelText(etiqueta)).toBeInTheDocument();
    expect(within(adulto2).queryByLabelText(/^Vínculo/)).not.toBeInTheDocument();
    // Menor: responsable y vínculo obligatorios; el documento es opcional.
    expect(within(menor).getByLabelText("Adulto responsable*")).toBeInTheDocument();
    expect(within(menor).getByLabelText("Vínculo*")).toBeInTheDocument();
    // Mayúscula inicial al salir del campo, con partículas en minúscula.
    cambiar(adulto2, "Apellido", "juan de la vega");
    fireEvent.blur(within(adulto2).getByLabelText("Apellido*"));
    expect(within(adulto2).getByLabelText("Apellido*")).toHaveValue("Juan de la Vega");
  });

  it("menor con «Otro adulto a cargo»: sin la autorización no deja confirmar; con la autorización confirma y la envía", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    api.confirmarCheckInConReserva.mockResolvedValue({ ...reservaDe({ habitaciones: [HAB_270] }), estado: "En curso" });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    await completarFamilia();
    const menor = filas()[2];
    cambiar(menor, "Vínculo", "Otro adulto a cargo");
    expect(within(menor).getByText("Pedí la autorización de los padres o tutores.")).toBeInTheDocument();
    expect(botonConfirmar()).toBeDisabled();
    expect(screen.getByRole("button", { name: /la autorización de los padres o tutores/ })).toBeInTheDocument();
    fireEvent.click(within(menor).getByLabelText("Autorización presentada*"));
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    fireEvent.click(botonConfirmar());
    await waitFor(() => expect(api.confirmarCheckInConReserva).toHaveBeenCalledTimes(1));
    const cuerpo = api.confirmarCheckInConReserva.mock.calls[0][1];
    expect(cuerpo.personas[2]).toMatchObject({ vinculoResponsable: "Otro adulto a cargo", autorizacionPresentada: true });
  });

  it("un solo envío con habitaciones, personas y totalEsperado; sin guardados por persona y sin doble envío", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    let resolver;
    api.confirmarCheckInConReserva.mockImplementation(() => new Promise((r) => (resolver = r)));
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    expect(botonConfirmar()).toBeDisabled();
    await completarFamilia();
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    fireEvent.click(botonConfirmar());
    fireEvent.click(botonConfirmar());
    await waitFor(() => expect(botonConfirmar()).toBeDisabled());
    expect(screen.getByText("Procesando…")).toBeInTheDocument();
    expect(api.confirmarCheckInConReserva).toHaveBeenCalledTimes(1);
    const [id, cuerpo] = api.confirmarCheckInConReserva.mock.calls[0];
    expect(id).toBe(10);
    expect(cuerpo.habitaciones).toEqual([{ habitacionIdAnterior: 270, habitacionId: 270, adultos: 2, menores: 1 }]);
    expect(cuerpo.totalEsperado).toBe(294000);
    expect(cuerpo.personas).toHaveLength(3);
    expect(cuerpo.personas[2]).toMatchObject({ motivoSinDocumento: "Menor sin documento presentado", nacionalidad: "AR", paisResidencia: "AR", responsableId: cuerpo.personas[0].id, vinculoResponsable: "Padre o madre", autorizacionPresentada: false });
    expect(cuerpo.personas[0]).toMatchObject({ vinculoResponsable: null, autorizacionPresentada: false });
    expect(cuerpo.motivoTitularDistinto).toBeUndefined();
    await act(async () => resolver({ ...reservaDe({ habitaciones: [HAB_270] }), estado: "En curso" }));
    expect(await screen.findByText("Check-in confirmado · Habitación 270")).toBeInTheDocument();
  });

  it("persona que vuelve: con tipo, país y número completos completa la fila; con un número parcial no consulta", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    api.buscarHuespedPorDocumento.mockResolvedValue({
      tipoDocumento: "DNI",
      paisDocumento: "AR",
      numeroDocumento: "31784205",
      nombre: "Carolina",
      apellido: "Paz",
      fechaNacimiento: haceAnios(39).iso,
      nacionalidad: "AR",
      paisResidencia: "AR",
      fechaUltimaEstadia: "2025-07-12",
      alojadaAhora: true,
    });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    const adulto2 = filas()[1];
    cambiar(adulto2, "Número", "317");
    await new Promise((r) => setTimeout(r, 600));
    // (El titular precargado también se consulta, solo como referencia para comparar lo que cambie; acá importa el número parcial.)
    expect(api.buscarHuespedPorDocumento).not.toHaveBeenCalledWith(expect.objectContaining({ numero: "317" }));
    cambiar(adulto2, "Número", "31784205");
    expect(await within(adulto2).findByText("Huésped registrado · última estadía: 12/07/2025", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(within(adulto2).getByText(/Ficha de/)).toHaveTextContent("Ficha de Carolina Paz: se completaron todos sus datos");
    expect(api.buscarHuespedPorDocumento).toHaveBeenCalledWith({ tipo: "DNI", pais: "AR", numero: "31784205" });
    expect(within(adulto2).getByLabelText(rotulo("Apellido"))).toHaveValue("Paz");
    // El nombre de una ficha existente no se cambia desde el check-in.
    expect(within(adulto2).getByLabelText(rotulo("Apellido"))).toBeDisabled();
    expect(within(adulto2).getByLabelText(rotulo("Nombres"))).toBeDisabled();
    expect(within(adulto2).getByText("Esta persona figura alojada en otra estadía.")).toBeInTheDocument();
    expect(within(adulto2).getByText("Esta persona figura alojada ahora en otra estadía.")).toBeInTheDocument();
  });

  it("persona que vuelve: el botón Buscar consulta al instante, sin esperar; y sin ficha avisa que no hay un huésped registrado", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    api.buscarHuespedPorDocumento.mockRejectedValue({ response: { status: 404, data: { error: "No hay", otrosDocumentos: [{ tipoDocumento: "Pasaporte", paisDocumento: "BR", iniciales: "C. P." }] } } });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    const adulto2 = filas()[1];
    cambiar(adulto2, "Número", "31784205");
    fireEvent.click(within(adulto2).getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(api.buscarHuespedPorDocumento.mock.calls.filter(([q]) => q.numero === "31784205")).toHaveLength(1), { timeout: 300 });
    expect(await within(adulto2).findByText("No hay un huésped registrado con ese documento")).toBeInTheDocument();
    expect(within(adulto2).getByText(/mismo número y otro tipo\/país de documento: Pasaporte, BR, C\. P\./)).toBeInTheDocument();
    // El formulario sigue vacío y editable.
    expect(within(adulto2).getByLabelText(rotulo("Apellido"))).toHaveValue("");
    expect(within(adulto2).getByLabelText(rotulo("Apellido"))).not.toBeDisabled();
  });

  it("persona que vuelve: un dato cambiado respecto de la ficha se marca y la casilla 'Actualizar la ficha' empieza sin tildar", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    api.buscarHuespedPorDocumento.mockResolvedValue({
      tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "31784205", nombre: "Carolina", apellido: "Paz",
      fechaNacimiento: haceAnios(39).iso, nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", telefono: "3875550100",
      fechaUltimaEstadia: "2025-07-12", alojadaAhora: false,
    });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    const adulto2 = filas()[1];
    cambiar(adulto2, "Número", "31784205");
    await within(adulto2).findByText(/Ficha de/, {}, { timeout: 2000 });
    expect(within(adulto2).queryByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" })).not.toBeInTheDocument();
    fireEvent.click(within(adulto2).getByRole("button", { name: "Más datos" }));
    cambiar(adulto2, "Teléfono", "3875559999");
    const casilla = await within(adulto2).findByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" });
    expect(casilla).not.toBeChecked();
    expect(within(adulto2).getByText(/Cambiaste datos respecto de la ficha del huésped: teléfono\./)).toBeInTheDocument();
  });

  // Regla 2.2: la ficha ya tiene un teléfono y la recepción carga OTRO. Se muestra la diferencia y la ficha solo se actualiza
  // si se tilda la casilla; el envío lleva el dato nuevo para esta estadía en cualquier caso.
  async function checkInConTelefonoCambiado(tildar) {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    api.buscarHuespedPorDocumento.mockResolvedValue({
      tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "31784205", nombre: "Carolina", apellido: "Paz",
      fechaNacimiento: haceAnios(39).iso, nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", telefono: "3875550100",
      fechaUltimaEstadia: "2025-07-12", alojadaAhora: false,
    });
    api.confirmarCheckInConReserva.mockImplementation(() => new Promise(() => {}));
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    const [titular, adulto2, menor] = filas();
    cambiar(titular, "Nombres", "Martín");
    cambiar(titular, "Apellido", "Gutiérrez");
    cambiar(adulto2, "Número", "31784205");
    await within(adulto2).findByText(/Ficha de/, {}, { timeout: 2000 });
    fireEvent.click(within(adulto2).getByRole("button", { name: "Más datos" }));
    cambiar(adulto2, "Teléfono", "3875559999");
    const casilla = await within(adulto2).findByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" });
    expect(within(adulto2).getByText(/Cambiaste datos respecto de la ficha del huésped: teléfono\./)).toBeInTheDocument();
    if (tildar) fireEvent.click(casilla);
    cambiar(menor, "Nombres", "Tomás");
    cambiar(menor, "Apellido", "Gutiérrez");
    cambiar(menor, "Nacimiento", haceAnios(8).texto.replace(/\//g, ""));
    cambiar(menor, "Vínculo", "Padre o madre");
    fireEvent.click(await screen.findByLabelText(/Confirmo que recibí/));
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    fireEvent.click(botonConfirmar());
    await waitFor(() => expect(api.confirmarCheckInConReserva).toHaveBeenCalledTimes(1));
    return api.confirmarCheckInConReserva.mock.calls[0][1].personas;
  }

  it("regla 2.2: con un teléfono distinto del de la ficha y SIN tildar la casilla, no se pide actualizar la ficha", async () => {
    const personas = await checkInConTelefonoCambiado(false);
    expect(personas[1]).toMatchObject({ telefono: "3875559999", actualizarFicha: false });
  });

  it("regla 2.2: con la casilla tildada se pide actualizar la ficha con el teléfono nuevo", async () => {
    const personas = await checkInConTelefonoCambiado(true);
    expect(personas[1]).toMatchObject({ telefono: "3875559999", actualizarFicha: true });
  });

  it("quitar muestra la diferencia de la vista previa; cancelar deja todo como estaba; confirmar recotiza", async () => {
    const reserva = reservaDe({ habitaciones: [{ ...HAB_270, adultos: 3, menores: 0 }], total: 300000 });
    prepararReserva(reserva, [fichaTitular()]);
    api.previaOcupacion.mockResolvedValue({
      totalAnterior: 300000,
      totalNuevo: 234000,
      diferencia: -66000,
      diferenciaPorNoche: [-22000, -22000, -22000].map((d, i) => ({ fecha: sumarDiasISO(hoy, i), anterior: 100000, nuevo: 78000, diferencia: d })),
      mensajeNoReembolsable: null,
      mensajeAjustePerdido: null,
      porHabitacion: [],
    });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    fireEvent.click(within(filas()[1]).getByRole("button", { name: "Quitar" }));
    expect(await screen.findByText(/Se quita a Adulto 2: −\$ 22\.000 por noche \(−\$ 66\.000 en total\)\./)).toBeInTheDocument();
    expect(api.previaOcupacion).toHaveBeenCalledWith(10, [{ habitacionIdAnterior: 270, habitacionId: 270, adultos: 2, menores: 0 }]);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(filas()).toHaveLength(3);
    expect(screen.getAllByText("$ 300.000").length).toBeGreaterThan(0);

    fireEvent.click(within(filas()[1]).getByRole("button", { name: "Quitar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y recotizar" }));
    expect(filas()).toHaveLength(2);
    expect(screen.getAllByText("$ 234.000").length).toBeGreaterThan(0);
    expect(screen.getByText("Reservado: 3 adultos")).toBeInTheDocument();
    expect(api.confirmarCheckInConReserva).not.toHaveBeenCalled();
  });

  it("con tarifa no reembolsable, quitar avisa que el precio no baja", async () => {
    prepararReserva(reservaDe({ habitaciones: [{ ...HAB_270, adultos: 3, menores: 0 }], plan: PLAN_NRF }), [fichaTitular()]);
    api.previaOcupacion.mockResolvedValue({
      totalAnterior: 294000,
      totalNuevo: 294000,
      diferencia: 0,
      diferenciaPorNoche: [],
      mensajeNoReembolsable: "Tarifa no reembolsable: la reducción de ocupación no modifica el precio.",
      porHabitacion: [],
    });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    fireEvent.click(within(filas()[2]).getByRole("button", { name: "Quitar" }));
    expect(await screen.findByText(/Tarifa no reembolsable: el precio no baja\./)).toBeInTheDocument();
  });

  it("agregar más personas que la capacidad lo avisa y no deja confirmar el cambio", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "＋ Agregar huésped" }));
    fireEvent.click(screen.getByRole("button", { name: "Adulto (13 años o más)" }));
    expect(screen.getByText(/admite hasta 3 personas\. Para sumar a alguien más, cambiá de habitación/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar y recotizar" })).not.toBeInTheDocument();
    expect(api.previaOcupacion).not.toHaveBeenCalled();
  });

  it("titular sin apellido, menor de 14, titular de 16 y titular distinto sin motivo bloquean con su mensaje", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    await completarFamilia();
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());

    cambiar(filas()[0], "Apellido", "");
    expect(screen.getByRole("button", { name: "Falta el apellido del Adulto 1 (Hab. 270)" })).toBeInTheDocument();
    expect(botonConfirmar()).toBeDisabled();
    cambiar(filas()[0], "Apellido", "Gutiérrez");

    cambiar(filas()[2], "Nacimiento", haceAnios(14).texto);
    expect(screen.getByRole("button", { name: "Revisá la edad del Menor 1 (Hab. 270)" })).toBeInTheDocument();
    expect(within(filas()[2]).getByText(/Tiene 14 años: desde los 13 se registra como adulto/)).toBeInTheDocument();
    cambiar(filas()[2], "Nacimiento", haceAnios(8).texto);

    cambiar(filas()[0], "Nacimiento", haceAnios(16).texto);
    expect(within(filas()[0]).getByText(/Tiene 16 años: el titular de la habitación tiene que ser mayor de 18/)).toBeInTheDocument();
    expect(botonConfirmar()).toBeDisabled();
    cambiar(filas()[0], "Nacimiento", haceAnios(42).texto);
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());

    fireEvent.click(within(filas()[1]).getByRole("button", { name: "Marcar como titular" }));
    expect(screen.getByText("El titular es distinto de quien reservó (Martín Gutiérrez)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Falta el motivo del titular distinto" })).toBeInTheDocument();
    expect(botonConfirmar()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: "Reservó un familiar que no viaja" } });
    // La titular nueva necesita residencia y teléfono propios (titular de la reserva).
    const nueva = filas()[1];
    cambiar(nueva, "Localidad", "Salta");
    cambiar(nueva, "Domicilio", "Belgrano 845");
    cambiar(nueva, "Teléfono", "+54 387 555-0101");
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    api.confirmarCheckInConReserva.mockResolvedValue(reservaDe({ habitaciones: [HAB_270] }));
    fireEvent.click(botonConfirmar());
    await waitFor(() => expect(api.confirmarCheckInConReserva).toHaveBeenCalled());
    expect(api.confirmarCheckInConReserva.mock.calls[0][1].motivoTitularDistinto).toBe("Reservó un familiar que no viaja");
  });

  it("reserva de 2 habitaciones: filas agrupadas, un titular por habitación y responsable de otra habitación", async () => {
    const habitaciones = [
      { ...HAB_270, adultos: 2, menores: 0 },
      { id: 208, numero: "208", tipo: "Twin", tipoHabitacionId: 2, capacidad: 2, piso: 2, adultos: 1, menores: 1 },
    ];
    prepararReserva(reservaDe({ habitaciones }), [fichaTitular()]);
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(4));
    const g270 = screen.getByRole("region", { name: "Huéspedes de la Hab. 270" });
    const g208 = screen.getByRole("region", { name: "Huéspedes de la Hab. 208" });
    const chipsTitular = (g) => within(g).getAllByText(/^Titular de la (reserva|habitación)$/, { selector: "span" });
    expect(chipsTitular(g270)).toHaveLength(1);
    expect(chipsTitular(g208)).toHaveLength(1);
    const menor = within(g208).getByText("Menor 1").closest('[id^="ci-fila-"]');
    const select = within(menor).getByLabelText(rotulo("Adulto responsable"));
    const opcion = within(select).getByRole("option", { name: "Martín Gutiérrez · Hab. 270" });
    fireEvent.change(select, { target: { value: opcion.value } });
    expect(select).toHaveValue(opcion.value);
  });

  it("cambio de habitación del mismo tipo: viaja en el confirmar y se marca como cambiada", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    api.listarHabitacionesLibresAhora.mockResolvedValue({ habitaciones: [{ id: 315, numero: "315", tipo: "Doble", tipoHabitacionId: 1, capacidad: 3, piso: 3, estado: "libre", planes: [] }] });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar habitación" }));
    fireEvent.click(await screen.findByRole("button", { name: /315/ }));
    expect(api.listarHabitacionesLibresAhora).toHaveBeenCalledWith(expect.objectContaining({ tipoHabitacionId: 1, adultos: 2, menores: 1, excluir: "270" }));
    expect(screen.getByText("Cambiada (era la 270)")).toBeInTheDocument();
    await completarFamilia();
    api.confirmarCheckInConReserva.mockResolvedValue({ ...reservaDe({ habitaciones: [{ ...HAB_270, id: 315, numero: "315" }] }), estado: "En curso" });
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    fireEvent.click(botonConfirmar());
    expect(await screen.findByText("Check-in confirmado · Habitación 315")).toBeInTheDocument();
    const cuerpo = api.confirmarCheckInConReserva.mock.calls[0][1];
    expect(cuerpo.habitaciones[0]).toMatchObject({ habitacionIdAnterior: 270, habitacionId: 315 });
    expect(cuerpo.personas.every((p) => p.habitacionId === 315)).toBe(true);
  });

  it("409 PRECIO_CAMBIO: muestra antes y ahora y 'Confirmar con el nuevo total' reenvía con ese total", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    api.confirmarCheckInConReserva
      .mockRejectedValueOnce({
        response: { status: 409, data: { codigo: "PRECIO_CAMBIO", error: "El total cambió", detalle: { totalAnterior: 294000, totalNuevo: 300000, diferencia: 6000, mensajeNoReembolsable: null } } },
      })
      .mockResolvedValueOnce({ ...reservaDe({ habitaciones: [HAB_270] }), estado: "En curso" });
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    await completarFamilia();
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    fireEvent.click(botonConfirmar());
    expect(await screen.findByText("El precio cambió: antes $ 294.000, ahora $ 300.000.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar con el nuevo total" }));
    expect(await screen.findByText("Check-in confirmado · Habitación 270")).toBeInTheDocument();
    expect(api.confirmarCheckInConReserva.mock.calls[1][1].totalEsperado).toBe(300000);
  });

  it("409 PERSONA_ALOJADA y 400 OCUPACION_INVALIDA se muestran en la fila y en la barra", async () => {
    prepararReserva(reservaDe({ habitaciones: [HAB_270] }), [fichaTitular()]);
    renderizar("/check-in?codigo=C43B1F20");
    await waitFor(() => expect(filas()).toHaveLength(3));
    await completarFamilia();
    const idAdulto2 = Number(filas()[1].id.replace("ci-fila-", ""));
    api.confirmarCheckInConReserva.mockRejectedValueOnce({
      response: { status: 409, data: { codigo: "PERSONA_ALOJADA", error: "Ya figura alojada en otra estadía: Carolina Paz (reserva X1).", detalle: { personas: [idAdulto2] } } },
    });
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    fireEvent.click(botonConfirmar());
    expect(await within(filas()[1]).findByRole("alert")).toHaveTextContent("Ya figura alojada en otra estadía");

    api.confirmarCheckInConReserva.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { codigo: "OCUPACION_INVALIDA", error: "x", detalle: { generales: ["Falta la fecha de nacimiento de Tomás."], porHabitacion: [{ habitacionId: 270, numero: "270", errores: ["Habitación 270: marcá quién es el titular."] }] } },
      },
    });
    fireEvent.click(botonConfirmar());
    expect(await screen.findByText("El servidor no aceptó la carga:")).toBeInTheDocument();
    expect(screen.getAllByText("Habitación 270: marcá quién es el titular.").length).toBe(2);
  });
});

describe("Walk-in", () => {
  const libre = (id, numero, tipo, tipoHabitacionId, capacidad, totales) => ({
    id,
    numero,
    tipo,
    tipoHabitacionId,
    capacidad,
    piso: Number(numero[0]),
    estado: "libre",
    planes: [
      { codigo: "BAR", nombre: "Tarifa flexible", reembolsable: true, horasCancelacionSinCargo: 48, total: totales[0], planTarifarioId: 1 },
      { codigo: "NRF", nombre: "No reembolsable", reembolsable: false, total: totales[1], planTarifarioId: 2 },
    ],
  });

  it("2 habitaciones de distinto tipo con una tarifa: excluir, ocupación hasta la capacidad, total del cotizador y 201", async () => {
    api.listarLlegadas.mockResolvedValue({ fecha: hoy, anterioresPendientes: 0, reservas: [] });
    const D315 = libre(315, "315", "Doble", 1, 3, [98000, 83300]);
    const T204 = libre(204, "204", "Twin", 2, 2, [92000, 78200]);
    api.listarHabitacionesLibresAhora.mockImplementation(async ({ excluir }) => {
      const excluidas = String(excluir ?? "").split(",").filter(Boolean).map(Number);
      return { habitaciones: [D315, T204].filter((h) => !excluidas.includes(h.id)) };
    });
    cotizarReserva.mockResolvedValue({ planes: [{ codigo: "BAR", planTarifarioId: 1, total: 190000 }, { codigo: "NRF", planTarifarioId: 2, total: 161500 }] });
    api.registrarCheckInWalkIn.mockResolvedValue({ id: 99, fechaHasta: iso(1), habitaciones: [{ numero: "315" }, { numero: "204" }] });
    renderizar();
    fireEvent.click(screen.getByRole("tab", { name: "Walk-in" }));
    fireEvent.click(await screen.findByRole("button", { name: "＋ Agregar habitación" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elegir la habitación 315 para la habitación 1" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Elegir la habitación 315 para la habitación 2" })).not.toBeInTheDocument());
    expect(api.listarHabitacionesLibresAhora).toHaveBeenCalledWith(expect.objectContaining({ adultos: 1, menores: 0, excluir: "315" }));
    fireEvent.click(await screen.findByRole("button", { name: "Elegir la habitación 204 para la habitación 2" }));
    expect(await screen.findByText("$ 190.000")).toBeInTheDocument();

    // Personas: titular de la primera habitación solo con teléfono.
    const completar = (fila, datos) => Object.entries(datos).forEach(([k, v]) => cambiar(fila, k, v));
    // Cada habitación elegida se completa hasta su capacidad: 315 → 3 adultos, 204 → 2.
    await waitFor(() => expect(filas()).toHaveLength(5));
    const [a1, a2, a3, b1, b2] = filas();
    completar(a1, { "Número": "27093318", Nombres: "Raúl", Apellido: "Ibarra", Nacimiento: haceAnios(46).texto, Localidad: "Jujuy", Domicilio: "Belgrano 845", Teléfono: "+54 388 555-0147" });
    completar(a2, { "Número": "27093319", Nombres: "Ana", Apellido: "Ibarra", Nacimiento: haceAnios(44).texto });
    completar(a3, { "Número": "27093321", Nombres: "Lucía", Apellido: "Ibarra", Nacimiento: haceAnios(20).texto });
    completar(b1, { "Número": "27093320", Nombres: "Tomás", Apellido: "Ibarra", Nacimiento: haceAnios(24).texto, Localidad: "Jujuy", Domicilio: "Belgrano 845" });
    completar(b2, { "Número": "27093322", Nombres: "Sofía", Apellido: "Ibarra", Nacimiento: haceAnios(22).texto });
    fireEvent.click(await screen.findByLabelText(/Confirmo que recibí/));
    await waitFor(() => expect(botonConfirmar()).toBeEnabled());
    fireEvent.click(botonConfirmar());
    expect(await screen.findByText("Check-in confirmado · Habitaciones 315 y 204")).toBeInTheDocument();
    const cuerpo = api.registrarCheckInWalkIn.mock.calls[0][0];
    expect(cuerpo).toMatchObject({ planTarifarioId: 1, totalEsperado: 190000, fechaHasta: sumarDiasISO(hoy, 1) });
    expect(cuerpo.huesped).toBeUndefined();
    expect(cuerpo.habitaciones).toEqual([
      { habitacionId: 315, adultos: 3, menores: 0 },
      { habitacionId: 204, adultos: 2, menores: 0 },
    ]);
    expect(cuerpo.personas[0]).toMatchObject({ esTitular: true, telefono: "+54 388 555-0147", email: null });
    expect(cuerpo.personas[1]).toMatchObject({ esTitular: false, paisResidencia: "AR" });
  });
});
