// Bloque "Reserva web" del detalle de reserva del mostrador (etapa 2 del
// e-commerce): se muestra solo en reservas web.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ColumnaDerecha } from "./ColumnaDerecha";
import { obtenerDatosReservaWeb, textoHoraLlegada } from "./reservaWeb.api";
import { obtenerGarantiasReserva } from "../../garantias/garantias.api";

vi.mock("../../garantias/garantias.api", () => ({ obtenerGarantiasReserva: vi.fn() }));
vi.mock("./reservaWeb.api", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, obtenerDatosReservaWeb: vi.fn() };
});

const RESERVA = {
  id: 169,
  estado: "Confirmada",
  planTarifario: null,
  notificaciones: [],
  huesped: { nombre: "María González", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "maria@correo.com" },
};

const DATOS_WEB = {
  emailContacto: "maria@correo.com",
  telefonoContacto: "+54 9 387 555-1234",
  horaEstimadaLlegada: "20-22",
  solicitudesEspeciales: null,
  tarjetaTitular: "MARIA GONZALEZ",
  aceptaPoliticasEn: "2026-10-04T17:32:00.000Z",
  versionPoliticas: "2026-10-01",
  aceptaComunicaciones: false,
};

let queryClient;

function renderColumna() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ColumnaDerecha reserva={RESERVA} cuenta={undefined} pagos={undefined} penalidad={undefined} />
    </QueryClientProvider>
  );
}

const titulos = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  obtenerDatosReservaWeb.mockReset();
  obtenerGarantiasReserva.mockReset();
  obtenerGarantiasReserva.mockResolvedValue({ reserva: null, estadia: null });
});

describe("tarjeta 'Reserva web'", () => {
  it("reserva web: después de 'Quién reservó', con contacto, llegada, solicitudes, titular de la tarjeta y consentimiento", async () => {
    obtenerDatosReservaWeb.mockResolvedValue(DATOS_WEB);
    renderColumna();
    const titulo = await screen.findByRole("heading", { level: 3, name: "Reserva web" });
    expect(titulos().slice(-2)).toEqual(["Quién reservó", "Reserva web"]);
    const tarjeta = within(titulo.closest("section"));
    expect(obtenerDatosReservaWeb).toHaveBeenCalledWith(169);
    expect(tarjeta.getByText("maria@correo.com")).toBeInTheDocument();
    expect(tarjeta.getByText("+54 9 387 555-1234")).toBeInTheDocument();
    expect(tarjeta.getByText("20 a 22 h")).toBeInTheDocument();
    expect(tarjeta.getByText("Sin solicitudes")).toBeInTheDocument();
    expect(tarjeta.getByText("MARIA GONZALEZ")).toBeInTheDocument();
    // La garantía no se repite en esta tarjeta.
    expect(tarjeta.queryByText(/Garantizada|Prepagada|••4242/)).not.toBeInTheDocument();
    // Hora argentina (UTC-3): 17:32 UTC → 14:32.
    expect(tarjeta.getByText("Aceptó términos v2026-10-01 el 04/10/2026 14:32")).toBeInTheDocument();
    expect(tarjeta.getByText("no")).toBeInTheDocument();
  });

  it("reserva del mostrador (200 con null): no aparece y el resto se ve igual", async () => {
    obtenerDatosReservaWeb.mockResolvedValue(null);
    renderColumna();
    await waitFor(() => expect(obtenerDatosReservaWeb).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Reserva web" })).not.toBeInTheDocument();
    expect(titulos()).toContain("Quién reservó");
  });

  it("si la consulta falla, no rompe el detalle", async () => {
    // Mismo formato que un error de axios (por ejemplo, un 500 del backend).
    obtenerDatosReservaWeb.mockRejectedValue({ response: { status: 500 } });
    renderColumna();
    await waitFor(() => expect(queryClient.getQueryState(["reservas-web", 169])?.status).toBe("error"));
    expect(screen.queryByRole("heading", { name: "Reserva web" })).not.toBeInTheDocument();
    expect(titulos()).toContain("Quién reservó");
  });
});

describe("garantía de la reserva: una sola vez, la de GarantiaReserva", () => {
  it("se muestra en su propia tarjeta (medio y estado) y NO se repite en 'Reserva web'", async () => {
    obtenerDatosReservaWeb.mockResolvedValue(DATOS_WEB);
    obtenerGarantiasReserva.mockResolvedValue({
      reserva: { tipo: "TARJETA", estado: "Vigente", marca: "Visa", ultimos4: "4242", monto: 0, tieneTarjeta: true },
      estadia: null,
    });
    renderColumna();
    const tarjetaGarantia = await screen.findByRole("heading", { level: 3, name: "Garantía de la reserva" });
    expect(obtenerGarantiasReserva).toHaveBeenCalledWith(169);
    const g = within(tarjetaGarantia.closest("section"));
    expect(g.getByText("Tarjeta Visa ••4242")).toBeInTheDocument();
    expect(g.getByText("Vigente · tarjeta guardada, sin cobro")).toBeInTheDocument();
    // Una sola vez: en total aparece un único "••4242" en toda la columna.
    expect(screen.getAllByText(/••4242/)).toHaveLength(1);
    const web = within((await screen.findByRole("heading", { level: 3, name: "Reserva web" })).closest("section"));
    expect(web.queryByText(/Visa|••4242|Garantizada|Prepagada/)).not.toBeInTheDocument();
  });

  it("una reserva paga por adelantado (NRF) muestra el monto y que está cobrada", async () => {
    obtenerDatosReservaWeb.mockResolvedValue(DATOS_WEB);
    obtenerGarantiasReserva.mockResolvedValue({
      reserva: { tipo: "TARJETA", estado: "Capturada", marca: "Visa", ultimos4: "4242", monto: 68000, tieneTarjeta: true },
      estadia: null,
    });
    renderColumna();
    const tarjetaGarantia = await screen.findByRole("heading", { level: 3, name: "Garantía de la reserva" });
    const g = within(tarjetaGarantia.closest("section"));
    expect(g.getByText("Capturada · cobrada")).toBeInTheDocument();
    expect(g.getByText(/68\.000/)).toBeInTheDocument();
  });

  it("sin garantía registrada (reserva anterior) o sin permiso: no aparece la tarjeta ni rompe el detalle", async () => {
    obtenerDatosReservaWeb.mockResolvedValue(null);
    obtenerGarantiasReserva.mockRejectedValue({ response: { status: 403 } });
    renderColumna();
    await waitFor(() => expect(obtenerGarantiasReserva).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Garantía de la reserva" })).not.toBeInTheDocument();
    expect(titulos()).toContain("Quién reservó");
  });
});

describe("textos del bloque", () => {
  it("hora de llegada", () => {
    expect(textoHoraLlegada("DESPUES_22")).toBe("Después de las 22 h");
    expect(textoHoraLlegada(null)).toBe("No la indicó");
  });
});
