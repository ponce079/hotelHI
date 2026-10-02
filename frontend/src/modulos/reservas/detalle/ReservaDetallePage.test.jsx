import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { ReservaDetallePage } from "./ReservaDetallePage";
import { useSesion } from "../../../lib/sesion";
import { api } from "../../../lib/api";
import { cancelarReserva, obtenerHistorialReserva, obtenerPenalidadReserva, obtenerReserva } from "../reservas.api";
import { buscarReservaParaCheckIn } from "../../check-in/checkIn.api";
import { obtenerCuenta } from "../../check-out/checkOut.api";
import { listarPagosEstadia } from "../../pagos-estadia/pagoEstadia.api";
import { listarConsumosPorReserva } from "../../servicios-adicionales/serviciosAdicionales.api";
import { listarComprobantesReserva } from "../../comprobantes-estadia/comprobanteEstadia.api";

vi.setConfig({ testTimeout: 15000 });
vi.mock("../../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("../../../lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("../reservas.api", () => ({
  obtenerReserva: vi.fn(),
  cancelarReserva: vi.fn(),
  obtenerHistorialReserva: vi.fn(),
  obtenerPenalidadReserva: vi.fn(),
}));
vi.mock("../../check-in/checkIn.api", () => ({ buscarReservaParaCheckIn: vi.fn() }));
vi.mock("../../check-out/checkOut.api", () => ({ obtenerCuenta: vi.fn() }));
vi.mock("../../pagos-estadia/pagoEstadia.api", () => ({ listarPagosEstadia: vi.fn() }));
vi.mock("../../servicios-adicionales/serviciosAdicionales.api", () => ({ listarConsumosPorReserva: vi.fn() }));
vi.mock("../../comprobantes-estadia/comprobanteEstadia.api", () => ({ listarComprobantesReserva: vi.fn() }));
// Los modales tienen sus propios tests: acá solo importa que se abran desde donde corresponde.
vi.mock("../AjustePrecioModal", () => ({
  AjustePrecioModal: ({ nocheInicial }) => <p>AjustePrecioModal abierto (noche {nocheInicial})</p>,
}));
vi.mock("../../servicios-adicionales/ConsumoModal", () => ({ ConsumoModal: () => <p>ConsumoModal abierto</p> }));
vi.mock("../../pagos-estadia/PagoEstadiaWizard", () => ({
  PagoEstadiaWizard: ({ saldo }) => <p>PagoEstadiaWizard abierto (saldo {saldo})</p>,
}));

const RESERVA_BASE = {
  id: 5,
  codigoConfirmacion: "RS-DET01",
  estado: "Confirmada",
  motivoCancelacion: null,
  fechaDesde: "2026-09-20T00:00:00.000Z",
  fechaHasta: "2026-09-23T00:00:00.000Z",
  noches: 3,
  totalEstimadoAlojamiento: 90000,
  cantidadHabitaciones: 1,
  huesped: { nombre: "Marcos Beltrán", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "marcos@correo.test", preferencias: "" },
  planTarifario: { nombre: "Tarifa flexible", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
  habitaciones: [
    {
      id: 1,
      numero: "301",
      tipo: "Doble",
      capacidad: 2,
      piso: 3,
      estado: "libre",
      adultos: 2,
      menores: 0,
      reservaNoches: [
        { id: 101, fecha: "2026-09-20T00:00:00.000Z", precioNoche: 30000 },
        { id: 102, fecha: "2026-09-21T00:00:00.000Z", precioNoche: 30000 },
        { id: 103, fecha: "2026-09-22T00:00:00.000Z", precioNoche: 30000 },
      ],
    },
  ],
  notificaciones: [{ id: 1, canal: "Email", destinatarioArea: "marcos@correo.test", fechaEnvio: "2026-09-10T13:23:00.000Z" }],
};
const CUENTA_BASE = {
  noches: 3,
  subtotales: { alojamiento: 90000, serviciosAdicionales: 0, verificacion: 0 },
  verificaciones: [],
  totalAdeudado: 90000,
  totalPagado: 0,
  saldo: 90000,
};
const SENIA = { id: 30, concepto: "Seña", fecha: "2026-09-10T13:23:00.000Z", anulado: false, medios: [{ medioPago: "Efectivo", importe: "18000.00" }] };
const GERENTE = { rol: "gerente", usuario: "gerente.prueba", puede: (a) => a === "verReservas" || a === "ajustarPrecioReserva" };

function CheckInStub() {
  const [params] = useSearchParams();
  return <p>Check-in codigo={params.get("codigo") ?? ""}</p>;
}

function renderDetalle() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/reservas/5"]}>
        <Routes>
          <Route path="/reservas/:id" element={<ReservaDetallePage />} />
          <Route path="/check-in" element={<CheckInStub />} />
          <Route path="/check-out/:reservaId" element={<p>Pantalla de check-out</p>} />
          <Route path="/comprobantes-estadia/:id" element={<p>Detalle del comprobante</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const abrirPestana = async (nombre) => userEvent.click(await screen.findByRole("tab", { name: new RegExp(nombre) }));

let ocupantes;
beforeEach(() => {
  vi.clearAllMocks();
  ocupantes = [];
  useSesion.mockReturnValue({ rol: "recepcionista", usuario: "recepcion.prueba", puede: () => true });
  api.get.mockImplementation(async (url) => ({ data: url.endsWith("/ocupantes") ? ocupantes : [] }));
  api.post.mockResolvedValue({ data: { ok: true } });
  listarPagosEstadia.mockResolvedValue({ pagos: [], totalAdeudado: 90000, totalPagado: 0, saldo: 90000 });
  obtenerCuenta.mockResolvedValue(CUENTA_BASE);
  listarConsumosPorReserva.mockResolvedValue([]);
  obtenerHistorialReserva.mockResolvedValue([]);
  obtenerPenalidadReserva.mockRejectedValue(new Error("sin penalidad"));
  listarComprobantesReserva.mockResolvedValue([]);
  buscarReservaParaCheckIn.mockResolvedValue({ puedeIniciarCheckIn: true, motivoBloqueo: null });
});

// La misma info (puedeIniciarCheckIn/motivoBloqueo) que ya calcula validarReservaVigente en
// checkIn.servicio.js (backend) — el frontend no reimplementa la comparación de fechas.
describe("ReservaDetallePage — botón Iniciar check-in", () => {
  it("Confirmada con fecha de ingreso ya llegada: botón habilitado y lleva a Check-in con esa reserva", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);

    renderDetalle();

    const boton = await screen.findByRole("button", { name: /Iniciar check-in/ });
    await waitFor(() => expect(boton).toBeEnabled());
    await userEvent.setup().click(boton);
    expect(await screen.findByText(`Check-in codigo=${RESERVA_BASE.codigoConfirmacion}`)).toBeInTheDocument();
  });

  it("Confirmada con fecha de ingreso futura: botón deshabilitado con el motivo real del backend", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    const motivo = "El check-in habilita a partir del 25/09/2026 (fecha de ingreso de la reserva).";
    buscarReservaParaCheckIn.mockResolvedValue({ puedeIniciarCheckIn: false, motivoBloqueo: motivo });

    renderDetalle();

    const boton = await screen.findByRole("button", { name: /Iniciar check-in/ });
    expect(boton).toBeDisabled();
    expect(await screen.findByText(motivo)).toBeInTheDocument();
  });

  it('reserva "En curso": el botón no se muestra (no es un tema de fecha, es de estado)', async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });

    renderDetalle();

    await screen.findByText("Marcos Beltrán", { selector: "p" });
    expect(screen.queryByRole("button", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });

  it('reserva "Cancelada": el botón no se muestra', async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cancelada", motivoCancelacion: "El huésped se arrepintió" });

    renderDetalle();

    await screen.findByText("El huésped se arrepintió");
    expect(screen.queryByRole("button", { name: /Iniciar check-in/ })).not.toBeInTheDocument();
    expect(buscarReservaParaCheckIn).not.toHaveBeenCalled();
  });
});

describe("ReservaDetallePage — acciones del encabezado según estado y rol", () => {
  const botones = () => screen.queryAllByRole("button").map((b) => b.textContent.trim()).filter(Boolean);

  it("Confirmada (recepción): Modificar y Iniciar check-in; Cancelar reserva está en el menú ⋯", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    renderDetalle();
    await screen.findByRole("button", { name: "Iniciar check-in" });
    expect(screen.getByRole("button", { name: "Modificar reserva" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Más acciones de la reserva" }));
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
  });

  it("En curso: Agregar consumo y Hacer check-out (lleva a la pantalla de check-out); sin Modificar ni Cancelar", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    renderDetalle();
    const checkOut = await screen.findByRole("button", { name: "Hacer check-out" });
    expect(screen.getByRole("button", { name: "Agregar consumo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Modificar reserva" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Más acciones de la reserva" })).not.toBeInTheDocument();
    await userEvent.click(checkOut);
    expect(await screen.findByText("Pantalla de check-out")).toBeInTheDocument();
  });

  it("Cerrada: solo Ver comprobante, que abre el comprobante emitido", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cerrada" });
    listarComprobantesReserva.mockResolvedValue([{ id: 77, tipo: "Comprobante", anulado: false }]);
    renderDetalle();
    await userEvent.click(await screen.findByRole("button", { name: "Ver comprobante" }));
    expect(await screen.findByText("Detalle del comprobante")).toBeInTheDocument();
  });

  it("Cancelada: ninguna acción de la reserva; muestra el motivo y qué pasó con la seña", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cancelada", motivoCancelacion: "Sobreventa" });
    listarPagosEstadia.mockResolvedValue({ pagos: [{ ...SENIA, anulado: true, motivoAnulacion: "Cancelación con anticipación (24hs+)" }], saldo: 0 });
    renderDetalle();
    expect(await screen.findByText("Sobreventa")).toBeInTheDocument();
    expect(await screen.findByText(/La seña de \$ 18\.000 se devolvió \(Cancelación con anticipación \(24hs\+\)\)\./)).toBeInTheDocument();
    for (const nombre of ["Modificar reserva", "Iniciar check-in", "Hacer check-out", "Agregar consumo", "Ver comprobante"])
      expect(screen.queryByRole("button", { name: nombre })).not.toBeInTheDocument();
    expect(obtenerCuenta).not.toHaveBeenCalled();
  });

  it("Cancelada con la seña conservada: lo dice", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cancelada", motivoCancelacion: "No vino" });
    listarPagosEstadia.mockResolvedValue({ pagos: [SENIA], saldo: 0 });
    renderDetalle();
    expect(await screen.findByText(/La seña de \$ 18\.000 se conserva: no se devolvió\./)).toBeInTheDocument();
  });

  it("el gerente no ve ningún botón de acción de la reserva, en ningún estado", async () => {
    useSesion.mockReturnValue(GERENTE);
    for (const estado of ["Confirmada", "En curso", "Cerrada", "Cancelada"]) {
      obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado });
      const { unmount } = renderDetalle();
      await screen.findByRole("tab", { name: /Huéspedes/ });
      const acciones = botones().filter((t) => !["Volver"].includes(t) && !/^(Huéspedes|Cuenta|Historial)/.test(t));
      expect(acciones, estado).toEqual([]);
      unmount();
    }
  });

  it("muestra los seis datos clave, el plan y la línea de tiempo en lugar del indicador de pasos", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    renderDetalle();
    await screen.findByText("RS-DET01");
    expect(screen.getByText("Tarifa flexible", { selector: "span" })).toBeInTheDocument();
    for (const etiqueta of ["Titular", "Entrada", "Salida", "Noches", "Habitación", "Ocupación"])
      expect(screen.getByText(etiqueta, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("301 · Doble")).toBeInTheDocument();
    expect(screen.getByText("2 adultos")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Avance de la reserva" })).getAllByRole("listitem")).toHaveLength(3);
    // Las tarjetas "Huésped" y "Estadía" y el bloque "Habitaciones reservadas" ya no existen.
    expect(screen.queryByText("Habitaciones reservadas")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmaciones enviadas")).not.toBeInTheDocument();
  });
});

// HU-37 — antes de confirmar la cancelación, el diálogo tiene que avisar qué pasa con la seña según la
// política de 24hs (mismo umbral que cancelarReserva en el backend).
describe("ReservaDetallePage — aviso de la seña al cancelar", () => {
  const reservaConFechaDesde = (horas) => ({ ...RESERVA_BASE, fechaDesde: new Date(Date.now() + horas * 3600 * 1000).toISOString() });
  async function abrirDialogoCancelar() {
    await userEvent.click(await screen.findByRole("button", { name: "Más acciones de la reserva" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
  }

  it("24hs o más de anticipación: avisa que la seña se devuelve", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(48));
    listarPagosEstadia.mockResolvedValue({ pagos: [{ ...SENIA }], saldo: 72000 });
    renderDetalle();
    await abrirDialogoCancelar();
    expect(await screen.findByText(/Se cancela con más de 24hs de anticipación — la seña de \$ ?18\.000 va a devolverse\./)).toBeInTheDocument();
  });

  it("menos de 24hs de anticipación: avisa que la seña NO se devuelve", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(5));
    listarPagosEstadia.mockResolvedValue({ pagos: [{ ...SENIA }], saldo: 72000 });
    renderDetalle();
    await abrirDialogoCancelar();
    expect(await screen.findByText(/Se cancela con menos de 24hs de anticipación — la seña de \$ ?18\.000 no se devuelve\./)).toBeInTheDocument();
  });

  it("sin ninguna seña vigente, o con la seña ya anulada, no muestra ningún aviso de seña", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(48));
    listarPagosEstadia.mockResolvedValue({ pagos: [{ ...SENIA, anulado: true }], saldo: 90000 });
    renderDetalle();
    await abrirDialogoCancelar();
    expect(await screen.findByText("Motivo de la cancelación *")).toBeInTheDocument();
    expect(screen.queryByText(/la seña de/)).not.toBeInTheDocument();
  });

  it("muestra la penalidad del plan (solo informativa) y cancela con el motivo", async () => {
    obtenerReserva.mockResolvedValue(reservaConFechaDesde(5));
    obtenerPenalidadReserva.mockResolvedValue({ aplica: true, monto: 30000, mensaje: "Cancelación fuera de plazo: se cobra la primera noche.", limiteSinCargo: "2026-09-18T17:00:00.000Z" });
    cancelarReserva.mockResolvedValue({});
    renderDetalle();
    await abrirDialogoCancelar();
    expect(await screen.findByText(/Según el plan tarifario: Cancelación fuera de plazo: se cobra la primera noche\. \(\$ 30\.000\)/)).toBeInTheDocument();
    const confirmar = screen.getByRole("button", { name: "Sí, cancelar" });
    await userEvent.type(await screen.findByLabelText(/Motivo de la cancelación/), "Cambio de planes");
    await userEvent.click(confirmar);
    await waitFor(() => expect(cancelarReserva).toHaveBeenCalledWith("5", "Cambio de planes"));
  });
});

describe("ReservaDetallePage — columna derecha", () => {
  it("el resumen sale del cálculo del check-out y la garantía NO figura entre los pagos de la cuenta", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    const garantia = { id: 31, concepto: "Garantía", fecha: "2026-09-20T18:00:00.000Z", anulado: false, medios: [{ medioPago: "Tarjeta crédito", importe: "30000", referencia: "482915" }] };
    listarPagosEstadia.mockResolvedValue({ pagos: [SENIA, garantia], saldo: 42000 });
    obtenerCuenta.mockResolvedValue({ ...CUENTA_BASE, subtotales: { alojamiento: 90000, serviciosAdicionales: 0, verificacion: 0 }, totalPagado: 48000, saldo: 42000 });
    renderDetalle();
    const resumen = (await screen.findByText("Resumen de cuenta")).closest("section");
    expect(await within(resumen).findByText("$ 42.000")).toBeInTheDocument();
    expect(within(resumen).getByText(/Incluye la garantía de \$ 30\.000: hoy el check-out la resta del saldo\./)).toBeInTheDocument();
    const caja = screen.getByText("Garantía para consumos").closest("section");
    expect(within(caja).getByText("$ 30.000")).toBeInTheDocument();
    expect(within(caja).getByText("Preautorización")).toBeInTheDocument();
    expect(within(caja).getByText("Tarjeta crédito · 482915")).toBeInTheDocument();
    await abrirPestana("Cuenta");
    const tabla = await screen.findByRole("table");
    expect(within(tabla).queryByText("Garantía")).not.toBeInTheDocument();
    expect(within(tabla).getByText("Seña")).toBeInTheDocument();
  });

  it("Confirmada sin garantía: 'Se toma al ingresar'; con la fecha límite de cancelación sin cargo del plan", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    obtenerPenalidadReserva.mockResolvedValue({ aplica: false, monto: 0, mensaje: "Cancelación sin cargo.", limiteSinCargo: "2026-09-18T17:00:00.000Z" });
    renderDetalle();
    expect(await screen.findByText("Se toma al ingresar")).toBeInTheDocument();
    expect(await screen.findByText(/Cancelación sin cargo hasta el 18\/09\/2026 14:00\. No-show: se cobra la primera noche\./)).toBeInTheDocument();
    expect(screen.getByText("Confirmación")).toBeInTheDocument();
    expect(screen.getByText("Enviada el 10/09/2026 10:23")).toBeInTheDocument();
  });

  it("sin permiso para ver pagos (gerente): no pide los pagos ni la cuenta; muestra solo el alojamiento reservado", async () => {
    useSesion.mockReturnValue(GERENTE);
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    renderDetalle();
    const resumen = (await screen.findByText("Resumen de cuenta")).closest("section");
    expect(within(resumen).getByText("$ 90.000")).toBeInTheDocument();
    expect(listarPagosEstadia).not.toHaveBeenCalled();
    expect(obtenerCuenta).not.toHaveBeenCalled();
    expect(screen.queryByText("Garantía para consumos")).not.toBeInTheDocument();
  });
});

describe("ReservaDetallePage — pestaña Cuenta", () => {
  it("no consulta consumos ni historial hasta abrir la pestaña correspondiente", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    renderDetalle();
    await screen.findByRole("tab", { name: /Cuenta/ });
    await waitFor(() => expect(obtenerCuenta).toHaveBeenCalled());
    expect(listarConsumosPorReserva).not.toHaveBeenCalled();
    expect(obtenerHistorialReserva).not.toHaveBeenCalled();
    await abrirPestana("Cuenta");
    await waitFor(() => expect(listarConsumosPorReserva).toHaveBeenCalledWith("5"));
    expect(obtenerHistorialReserva).not.toHaveBeenCalled();
    await abrirPestana("Historial");
    await waitFor(() => expect(obtenerHistorialReserva).toHaveBeenCalledWith("5"));
  });

  it("ordena por fecha, marca las noches 'a devengar', filtra y suma los totales", async () => {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
    const dia = (n) => new Date(Date.parse(`${hoy}T00:00:00Z`) + n * 86400000).toISOString();
    const reserva = {
      ...RESERVA_BASE,
      estado: "En curso",
      fechaDesde: dia(0),
      fechaHasta: dia(3),
      habitaciones: [{ ...RESERVA_BASE.habitaciones[0], reservaNoches: [0, 1, 2].map((n) => ({ id: 200 + n, fecha: dia(n), precioNoche: 30000 })) }],
    };
    obtenerReserva.mockResolvedValue(reserva);
    listarPagosEstadia.mockResolvedValue({ pagos: [{ ...SENIA, fecha: dia(-5) }], saldo: 0 });
    listarConsumosPorReserva.mockResolvedValue([{ id: 9, tipoServicio: "Restaurante", descripcion: "Cena, 2 cubiertos", monto: 18500, fechaHora: new Date().toISOString(), registradoPor: "restaurante.prueba", habitacionNumero: "301", anulado: false }]);
    renderDetalle();
    await abrirPestana("Cuenta");
    const tabla = await screen.findByRole("table");
    await within(tabla).findByText("Restaurante");
    const conceptos = within(tabla).getAllByRole("row").slice(1).map((f) => f.cells[1].textContent);
    expect(conceptos[0]).toMatch(/^Seña/);
    expect(conceptos[1]).toMatch(/^Alojamiento · noche 1 de 3/);
    expect(conceptos[2]).toMatch(/^Restaurante/);
    expect(conceptos[3]).toMatch(/^Alojamiento · noche 2 de 3.*a devengar/);
    expect(within(tabla).getAllByText("a devengar")).toHaveLength(2);
    const totales = within(tabla).getByText("Totales").closest("tr");
    expect(totales.cells[2]).toHaveTextContent("$ 108.500");
    expect(totales.cells[3]).toHaveTextContent("$ 18.000");
    await userEvent.click(screen.getByRole("button", { name: "Consumos" }));
    expect(within(tabla).getAllByRole("row")).toHaveLength(2);
    expect(within(tabla).queryByText("Totales")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pagos" }));
    expect(within(tabla).getByText("Seña")).toBeInTheDocument();
    expect(within(tabla).queryByText("Restaurante")).not.toBeInTheDocument();
  });

  it("agrupa los consumos por habitación sin pedir el nombre del huésped", async () => {
    const dos = { ...RESERVA_BASE, estado: "En curso", habitaciones: [RESERVA_BASE.habitaciones[0], { ...RESERVA_BASE.habitaciones[0], id: 2, numero: "302", reservaNoches: [] }] };
    obtenerReserva.mockResolvedValue(dos);
    listarConsumosPorReserva.mockResolvedValue([{ id: 1, habitacionId: 1, habitacionNumero: "301", tipoServicio: "Lavandería", descripcion: "Lavandería", cantidad: 2, monto: 100, fechaHora: "2026-09-21T15:00:00.000Z", registradoPor: "Recepción", anulado: false }]);
    renderDetalle();
    await abrirPestana("Cuenta");
    expect(await screen.findByText(/Lavandería · Hab\. 301 · cargado por Recepción/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/huésped/i)).not.toBeInTheDocument();
    // El botón está en el encabezado y en la pestaña Cuenta: los dos abren el mismo modal.
    await userEvent.click(screen.getAllByRole("button", { name: "Agregar consumo" }).at(-1));
    expect(await screen.findByText("ConsumoModal abierto")).toBeInTheDocument();
  });

  it("exige motivo y manda el operador para anular un cargo; el anulado se ve tachado con su motivo", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    listarConsumosPorReserva.mockResolvedValue([
      { id: 1, habitacionId: 1, tipoServicio: "Lavandería", descripcion: "Lavandería", monto: 100, fechaHora: "2026-09-21T15:00:00.000Z", registradoPor: "Recepción", anulado: false },
      { id: 2, habitacionId: 1, tipoServicio: "Spa", descripcion: "Masaje", monto: 500, fechaHora: "2026-09-21T16:00:00.000Z", registradoPor: "Recepción", anulado: true, motivoAnulacion: "Duplicado" },
    ]);
    renderDetalle();
    await abrirPestana("Cuenta");
    expect(await screen.findByText("Motivo: Duplicado")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Anular / })).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Anular Lavandería" }));
    const confirmar = screen.getByRole("button", { name: "Confirmar anulación" });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Motivo *"), "Carga duplicada");
    await userEvent.click(confirmar);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/consumos-servicios/1/anular", { motivo: "Carga duplicada", operador: "recepcion.prueba" }),
    );
  });

  it("Registrar pago abre el asistente de pago con el saldo de la cuenta; no aparece con saldo cero", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    renderDetalle();
    await abrirPestana("Cuenta");
    await userEvent.click(await screen.findByRole("button", { name: "Registrar pago" }));
    expect(await screen.findByText("PagoEstadiaWizard abierto (saldo 90000)")).toBeInTheDocument();
  });

  it("sin saldo por cobrar no ofrece Registrar pago", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    obtenerCuenta.mockResolvedValue({ ...CUENTA_BASE, saldo: 0, totalPagado: 90000 });
    renderDetalle();
    await abrirPestana("Cuenta");
    await screen.findByText("✓ $ 0");
    expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
  });
});

// Etapa 4B (HU-97) — "Ajustar precio" es exclusivo del gerente (ajustarPrecioReserva) y, ahora, vive en
// las filas de alojamiento de la pestaña Cuenta, en los mismos estados de antes: Confirmada y En curso.
describe("ReservaDetallePage — Ajustar precio (HU-97, exclusivo gerente)", () => {
  it("gerente con una reserva Confirmada: ve el botón en cada noche y abre el ajuste con esa noche elegida", async () => {
    useSesion.mockReturnValue(GERENTE);
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    renderDetalle();
    await abrirPestana("Cuenta");
    const botones = await screen.findAllByRole("button", { name: /^Ajustar precio de Alojamiento/ });
    expect(botones).toHaveLength(3);
    await userEvent.click(botones[1]);
    expect(await screen.findByText("AjustePrecioModal abierto (noche 102)")).toBeInTheDocument();
  });

  it("recepcionista (sin el permiso ajustarPrecioReserva): no ve el botón", async () => {
    useSesion.mockReturnValue({ rol: "recepcionista", usuario: "r", puede: (a) => a !== "ajustarPrecioReserva" });
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    renderDetalle();
    await abrirPestana("Cuenta");
    await screen.findByText("Totales");
    expect(screen.queryByRole("button", { name: /Ajustar precio/ })).not.toBeInTheDocument();
  });

  it('gerente con una reserva "Cerrada": el permiso está pero el botón no se muestra (estado no lo admite)', async () => {
    useSesion.mockReturnValue(GERENTE);
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cerrada" });
    renderDetalle();
    await abrirPestana("Cuenta");
    await screen.findByText("Totales");
    expect(screen.queryByRole("button", { name: /Ajustar precio/ })).not.toBeInTheDocument();
  });

  it('gerente con una reserva "En curso": el botón SÍ se muestra (a diferencia de Modificar/Cancelar)', async () => {
    useSesion.mockReturnValue(GERENTE);
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    renderDetalle();
    await abrirPestana("Cuenta");
    expect((await screen.findAllByRole("button", { name: /^Ajustar precio de/ })).length).toBeGreaterThan(0);
  });

  it("las noches ajustadas se marcan con el precio anterior y el total refleja el precio vigente", async () => {
    useSesion.mockReturnValue(GERENTE);
    const reserva = JSON.parse(JSON.stringify(RESERVA_BASE));
    reserva.habitaciones[0].reservaNoches[1] = { id: 102, fecha: "2026-09-21T00:00:00.000Z", precioNoche: 25000, ajustada: true, precioOriginal: 30000 };
    obtenerReserva.mockResolvedValue(reserva);
    renderDetalle();
    await abrirPestana("Cuenta");
    expect(await screen.findByText("Ajustado · antes $ 30.000")).toBeInTheDocument();
    expect(within(screen.getByText("Totales").closest("tr")).getAllByRole("cell")[2]).toHaveTextContent("$ 85.000");
  });
});

describe("ReservaDetallePage — pestañas Huéspedes e Historial", () => {
  it("Cerrada: las personas solo tienen 'Ver ficha' (solo lectura), sin editar ni registrar salida", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "Cerrada" });
    ocupantes = [
      { id: 1, nombre: "Marcos", apellido: "Beltrán", tipoDocumento: "DNI", numeroDocumento: "30111222", estado: "Retirado", esTitular: true, fechaNacimiento: "1985-01-01", nacionalidad: "AR", paisResidencia: "AR", localidad: "Córdoba", ingresoReal: "2026-09-20T18:00:00.000Z", salidaReal: "2026-09-23T12:00:00.000Z", verificadoEn: "2026-09-20T18:00:00.000Z", fechaDesde: "2026-09-20", fechaHasta: "2026-09-23", asignaciones: [{ habitacionId: 1, hasta: null }] },
    ];
    renderDetalle();
    expect(await screen.findByText("Argentina · reside en Córdoba, Argentina")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Acciones de Marcos Beltrán" }));
    expect(screen.getAllByRole("button").filter((b) => ["Editar ficha", "Registrar salida", "Completar datos"].includes(b.textContent))).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Ver ficha" }));
    const ficha = await screen.findByRole("dialog", { name: "Ficha del huésped" });
    expect(within(ficha).getByText("DNI 30111222")).toBeInTheDocument();
    expect(within(ficha).queryByRole("button", { name: /Guardar/ })).not.toBeInTheDocument();
  });

  it("Confirmada con una sola persona de varias: avisa que el resto se registra en el check-in", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, habitaciones: [{ ...RESERVA_BASE.habitaciones[0], adultos: 2, menores: 1 }] });
    ocupantes = [
      { id: 1, nombre: "Marcos", apellido: "Beltrán", tipoDocumento: "DNI", numeroDocumento: "30111222", estado: "Previsto", esTitular: true, fechaDesde: "2026-09-20", fechaHasta: "2026-09-23", asignaciones: [{ habitacionId: 1, hasta: null }] },
    ];
    renderDetalle();
    expect(await screen.findByText("2 personas más se registran en el check-in, con su documento.")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Huéspedes/ })).toHaveTextContent("1 de 3");
  });

  it("Historial: lista del más reciente al más antiguo, con quién lo hizo, y refleja una ficha dada de baja con su motivo", async () => {
    obtenerReserva.mockResolvedValue({ ...RESERVA_BASE, estado: "En curso" });
    obtenerHistorialReserva.mockResolvedValue([
      { id: "pago-7", fecha: "2026-09-28T14:10:00.000Z", tipo: "pago", titulo: "Seña registrada", detalle: "$ 18.000 · Efectivo", operador: null },
      { id: "ficha-1", fecha: "2026-09-28T14:03:51.000Z", tipo: "ficha", titulo: "Ficha dada de baja", detalle: "Martín Gutiérrez · Reemplazada en el check-in", operador: "recepcionista.prueba" },
    ]);
    renderDetalle();
    await abrirPestana("Historial");
    expect(await screen.findByText("28/09/2026 11:03")).toBeInTheDocument();
    expect(screen.getByText("Ficha dada de baja")).toBeInTheDocument();
    expect(screen.getByText("Martín Gutiérrez · Reemplazada en el check-in")).toBeInTheDocument();
    expect(screen.getByText("por recepcionista.prueba")).toBeInTheDocument();
    const titulos = screen.getAllByRole("listitem").map((li) => li.querySelector("b")?.textContent);
    expect(titulos.slice(-2)).toEqual(["Seña registrada", "Ficha dada de baja"]);
  });

  it("Historial: si falla la carga, ofrece volver a cargar", async () => {
    obtenerReserva.mockResolvedValue(RESERVA_BASE);
    obtenerHistorialReserva.mockRejectedValueOnce({ response: { data: { error: "Sin conexión" } } }).mockResolvedValue([]);
    renderDetalle();
    await abrirPestana("Historial");
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Volver a cargar" }));
    expect(await screen.findByText("Todavía no hay movimientos registrados.")).toBeInTheDocument();
  });
});
