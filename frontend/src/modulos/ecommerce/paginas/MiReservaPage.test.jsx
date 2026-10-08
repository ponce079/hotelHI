// /web/mi-reserva real (HU-104): consulta con código + email y cancelación
// online sin cargo. La API está simulada con vi.fn (el mock de desarrollo se
// prueba en ecommerce.api.test.js).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MiReservaPage } from "./MiReservaPage";
import { cancelarMiReserva, consultarMiReserva } from "../ecommerce.api";
import { HOTEL } from "../ecommerce.config";

vi.mock("../ecommerce.api", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, consultarMiReserva: vi.fn(), cancelarMiReserva: vi.fn() };
});

const CANCELABLE = {
  codigoConfirmacion: "3FA9C21B",
  estado: "Confirmada",
  fechaDesde: "2026-10-16",
  fechaHasta: "2026-10-18",
  noches: 2,
  plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
  habitaciones: [{ tipo: "Doble", adultos: 2, menores: 1 }],
  total: 50000,
  cobrado: 0,
  garantia: { tipo: "GARANTIA", marca: "VISA", ultimos4: "4242" },
  titular: "Juan P.",
  documento: "****222",
  cancelacion: {
    puedeCancelarOnline: true,
    motivo: null,
    penalidad: { aplica: false, monto: 0, limiteSinCargo: "2026-10-14T17:00:00.000Z", mensaje: "Cancelación sin cargo." },
    cargo: null,
  },
};
const TEXTO_COBRO = "Cancelar tiene un cargo de $ 25.000 (primera noche), que se cobra a tu tarjeta Visa terminada en 4242.";
const COBRO = { tipo: "COBRO", monto: 25000, concepto: "Cargo por cancelación", texto: TEXTO_COBRO };
const TEXTO_RETENIDO = "Esta tarifa no admite devolución: no se reintegra el importe pagado ($ 50.000).";
const RETENIDO = { tipo: "RETENIDO", monto: 50000, concepto: "Importe pagado no reintegrable", texto: TEXTO_RETENIDO };
const penalidadCon = (monto) => ({ aplica: true, monto, limiteSinCargo: null, mensaje: "" });
const CARGO_ONLINE = { ...CANCELABLE, cancelacion: { puedeCancelarOnline: true, motivo: null, penalidad: penalidadCon(25000), cargo: COBRO } };
const NRF_ONLINE = { ...CANCELABLE, cobrado: 50000, total: 50000, cancelacion: { puedeCancelarOnline: true, motivo: null, penalidad: penalidadCon(50000), cargo: RETENIDO } };
const MOTIVO_CARGO = "Cancelar ahora tiene un cargo de $ 25.000 (ya pasó el plazo). Para cancelar, contactá a recepción.";
const CON_CARGO = {
  ...CANCELABLE,
  cancelacion: { puedeCancelarOnline: false, motivo: MOTIVO_CARGO, penalidad: { aplica: true, monto: 25000, limiteSinCargo: null, mensaje: "" } },
};

function renderPagina(ruta = "/web/mi-reserva") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <div className="ec-raiz">
        <MiReservaPage />
      </div>
    </MemoryRouter>
  );
}

function completarYBuscar(codigo = "3fa9-c21b", email = " Demo@Hotel.com ") {
  fireEvent.change(screen.getByLabelText(/código de reserva/i), { target: { value: codigo } });
  fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /buscar/i }));
}

beforeEach(() => {
  consultarMiReserva.mockReset();
  cancelarMiReserva.mockReset();
});

describe("MiReservaPage", () => {
  it("título de la pestaña y código precargado desde ?codigo= (el email nunca viene en la URL)", () => {
    renderPagina("/web/mi-reserva?codigo=3fa9c21b&email=demo@hotel.com");
    expect(document.title).toBe("Mi reserva · Holiday Inn Salta");
    expect(screen.getByLabelText(/código de reserva/i)).toHaveValue("3FA9C21B");
    expect(screen.getByLabelText(/^email/i)).toHaveValue("");
    expect(screen.queryByRole("button", { name: /modificar/i })).not.toBeInTheDocument();
  });

  it("errores de formato junto a cada campo, sin llamar a la API", () => {
    renderPagina();
    completarYBuscar("ABC", "no-es-email");
    expect(screen.getByText(/el código tiene 8 caracteres/i)).toBeInTheDocument();
    expect(screen.getByText("Ingresá un email válido.")).toBeInTheDocument();
    expect(screen.getByLabelText(/código de reserva/i)).toHaveAttribute("aria-invalid", "true");
    expect(consultarMiReserva).not.toHaveBeenCalled();
  });

  it("404: mensaje general único", async () => {
    consultarMiReserva.mockRejectedValue({ codigo: "NO_ENCONTRADA", status: 404, mensaje: "x" });
    renderPagina();
    completarYBuscar();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No encontramos una reserva con esos datos. Revisá el código y el email, o contactá a recepción."
    );
  });

  it("muestra la tarjeta con datos normalizados y el link para cancelar", async () => {
    consultarMiReserva.mockResolvedValue(CANCELABLE);
    renderPagina();
    completarYBuscar();
    expect(await screen.findByRole("heading", { name: "Reserva 3FA9C21B" })).toBeInTheDocument();
    expect(consultarMiReserva).toHaveBeenCalledWith({ codigo: "3FA9C21B", email: "demo@hotel.com" });
    expect(screen.getByText("Confirmada")).toHaveClass("ec-insignia--verde");
    expect(screen.getByText(/Vie 16 oct → Dom 18 oct 2026/)).toBeInTheDocument();
    expect(screen.getByText("Doble · 2 adultos · 1 menor")).toBeInTheDocument();
    expect(screen.getByText("Tarifa flexible")).toBeInTheDocument();
    expect(screen.getByText("$ 50.000")).toBeInTheDocument();
    expect(screen.getByText("Garantizada con VISA ••4242")).toBeInTheDocument();
    expect(screen.getByText(/Juan P\. · Documento \*\*\*\*222/)).toBeInTheDocument();
    expect(screen.getByText(/sin cargo hasta el Mié 14 oct 2026 a las 14:00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
  });

  it("no cancelable: el motivo con el teléfono de recepción y sin botón", async () => {
    consultarMiReserva.mockResolvedValue(CON_CARGO);
    renderPagina();
    completarYBuscar();
    expect(await screen.findByText(MOTIVO_CARGO)).toBeInTheDocument();
    expect(screen.getByText(`Teléfono de recepción: ${HOTEL.telefono}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it.each([
    ["En curso", "ec-insignia--verde"],
    ["Cerrada", "ec-insignia--neutro"],
    ["Cancelada", "ec-insignia--rojo"],
  ])("insignia %s → %s", async (estado, clase) => {
    consultarMiReserva.mockResolvedValue({ ...CANCELABLE, estado, cancelacion: { puedeCancelarOnline: false, motivo: null, penalidad: null } });
    renderPagina();
    completarYBuscar();
    expect(await screen.findByText(estado)).toHaveClass(clase);
  });

  it("cancelar: diálogo accesible, Esc lo cierra y devuelve el foco", async () => {
    consultarMiReserva.mockResolvedValue(CANCELABLE);
    renderPagina();
    completarYBuscar();
    const link = await screen.findByRole("button", { name: "Cancelar reserva" });
    link.focus();
    fireEvent.click(link);
    const dialogo = screen.getByRole("dialog", { name: "Cancelar reserva" });
    expect(dialogo).toHaveAttribute("aria-modal", "true");
    expect(dialogo).toHaveAccessibleDescription(/Vas a cancelar tu reserva 3FA9C21B\. No se realiza ningún cargo\. ¿Confirmás\?/);
    expect(within(dialogo).getByRole("button", { name: "Volver" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(link).toHaveFocus();
    expect(cancelarMiReserva).not.toHaveBeenCalled();
  });

  it("confirmar: POST con monto 0, botón deshabilitado mientras envía y estado actualizado en el lugar", async () => {
    consultarMiReserva.mockResolvedValue(CANCELABLE);
    let resolver;
    cancelarMiReserva.mockReturnValue(new Promise((r) => (resolver = r)));
    renderPagina();
    completarYBuscar();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    expect(cancelarMiReserva).toHaveBeenCalledWith({ codigo: "3FA9C21B", email: "demo@hotel.com", montoAceptado: "0.00" });
    expect(screen.getByRole("button", { name: "Cancelando…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelando…" }));
    expect(cancelarMiReserva).toHaveBeenCalledTimes(1);

    resolver({ estado: "Cancelada", penalidadCobrada: 0, cargo: { estado: "SIN_CARGO", monto: 0, texto: "No se realizó ningún cargo." }, email: { enviado: true } });
    expect(await screen.findByText("Reserva cancelada. No se realizó ningún cargo.")).toBeInTheDocument();
    expect(screen.getByText("Te enviamos la confirmación por email.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Cancelada")).toHaveClass("ec-insignia--rojo");
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("409 PENALIDAD_CAMBIO: vuelve a consultar y muestra el motivo nuevo", async () => {
    consultarMiReserva.mockResolvedValueOnce(CANCELABLE).mockResolvedValueOnce(CON_CARGO);
    cancelarMiReserva.mockRejectedValue({ codigo: "PENALIDAD_CAMBIO", status: 409, montoNuevo: 25000, motivo: MOTIVO_CARGO });
    renderPagina();
    completarYBuscar();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    expect(await screen.findByText(MOTIVO_CARGO)).toBeInTheDocument();
    expect(consultarMiReserva).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("email en segundo plano (enCamino): dice que se lo están enviando", async () => {
    consultarMiReserva.mockResolvedValue(CANCELABLE);
    cancelarMiReserva.mockResolvedValue({ estado: "Cancelada", penalidadCobrada: 0, cargo: { estado: "SIN_CARGO", monto: 0 }, email: { enviado: null, enCamino: true } });
    renderPagina();
    completarYBuscar();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    expect(await screen.findByText("Te estamos enviando la confirmación por email.")).toBeInTheDocument();
  });

  describe("cancelar con cargo (v9)", () => {
    async function abrirDialogoConCargo(reserva = CARGO_ONLINE) {
      consultarMiReserva.mockResolvedValue(reserva);
      renderPagina();
      completarYBuscar();
      expect(await screen.findByText(reserva.cancelacion.cargo.texto)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar con cargo" }));
      return screen.getByRole("dialog", { name: "Cancelar reserva" });
    }

    it("flexible con cargo: el botón dice 'Cancelar con cargo', el diálogo repite el texto y pide la casilla (sin tildar) para confirmar", async () => {
      const dialogo = await abrirDialogoConCargo();
      expect(within(dialogo).getByText(TEXTO_COBRO)).toBeInTheDocument();
      const casilla = within(dialogo).getByRole("checkbox", { name: "Entiendo y acepto el cargo de cancelación" });
      expect(casilla).not.toBeChecked();
      const confirmar = within(dialogo).getByRole("button", { name: "Sí, cancelar con cargo" });
      expect(confirmar).toBeDisabled();
      fireEvent.click(confirmar);
      expect(cancelarMiReserva).not.toHaveBeenCalled();
      fireEvent.click(casilla);
      expect(confirmar).toBeEnabled();
    });

    it("al confirmar manda aceptaCargo y el monto como texto; muestra lo cobrado a la tarjeta", async () => {
      cancelarMiReserva.mockResolvedValue({
        estado: "Cancelada",
        penalidadCobrada: 25000,
        cargo: { estado: "COBRADO", monto: 25000, tarjeta: { marca: "VISA", ultimos4: "4242" }, texto: "Se cobró $ 25.000 con tu tarjeta Visa terminada en 4242 (cargo por cancelación)." },
        email: { enviado: true },
      });
      const dialogo = await abrirDialogoConCargo();
      fireEvent.click(within(dialogo).getByRole("checkbox"));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, cancelar con cargo" }));
      expect(cancelarMiReserva).toHaveBeenCalledWith({ codigo: "3FA9C21B", email: "demo@hotel.com", aceptaCargo: true, montoAceptado: "25000.00" });
      expect(await screen.findByText(/Se cobró \$ 25\.000 con tu tarjeta Visa terminada en 4242/)).toBeInTheDocument();
      expect(screen.getByText("Cancelada")).toHaveClass("ec-insignia--rojo");
    });

    it("no reembolsable pagada: la casilla dice que no se reintegra el importe; el resultado, que queda retenido", async () => {
      cancelarMiReserva.mockResolvedValue({ estado: "Cancelada", penalidadCobrada: 0, cargo: { estado: "RETENIDO", monto: 50000, texto: "No se reintegra el importe pagado ($ 50.000)." }, email: { enviado: true } });
      const dialogo = await abrirDialogoConCargo(NRF_ONLINE);
      fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Entiendo que no se reintegra el importe pagado" }));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, cancelar con cargo" }));
      expect(cancelarMiReserva).toHaveBeenCalledWith({ codigo: "3FA9C21B", email: "demo@hotel.com", aceptaCargo: true, montoAceptado: "50000.00" });
      expect(await screen.findByText(/No se reintegra el importe pagado \(\$ 50\.000\)\./)).toBeInTheDocument();
    });

    it("cobro rechazado: se informa que el cargo quedó pendiente y que recepción se comunica", async () => {
      cancelarMiReserva.mockResolvedValue({ estado: "Cancelada", penalidadCobrada: 0, cargo: { estado: "PENDIENTE", monto: 25000, texto: "No pudimos cobrar el cargo. Recepción se va a comunicar con vos." }, email: { enviado: true } });
      const dialogo = await abrirDialogoConCargo();
      fireEvent.click(within(dialogo).getByRole("checkbox"));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, cancelar con cargo" }));
      expect(await screen.findByText(/No pudimos cobrar el cargo\. Recepción se va a comunicar con vos\./)).toBeInTheDocument();
    });

    it("409 con monto nuevo: queda en el diálogo, muestra el importe nuevo y pide aceptar otra vez (casilla destildada)", async () => {
      const NUEVO = { tipo: "COBRO", monto: 40000, concepto: "Cargo por cancelación", texto: "Cancelar tiene un cargo de $ 40.000 (primera noche), que se cobra a tu tarjeta Visa terminada en 4242." };
      cancelarMiReserva.mockRejectedValueOnce({ codigo: "PENALIDAD_CAMBIO", status: 409, montoNuevo: 40000, motivo: null, cargo: NUEVO });
      cancelarMiReserva.mockResolvedValueOnce({ estado: "Cancelada", penalidadCobrada: 40000, cargo: { estado: "COBRADO", monto: 40000, texto: "Se cobró $ 40.000." }, email: { enviado: true } });
      const dialogo = await abrirDialogoConCargo();
      fireEvent.click(within(dialogo).getByRole("checkbox"));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, cancelar con cargo" }));
      expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/El cargo cambió: ahora es de \$ 40\.000/);
      expect(within(dialogo).getByText(NUEVO.texto)).toBeInTheDocument();
      expect(consultarMiReserva).toHaveBeenCalledTimes(1);
      expect(within(dialogo).getByRole("checkbox")).not.toBeChecked();
      expect(within(dialogo).getByRole("button", { name: "Sí, cancelar con cargo" })).toBeDisabled();

      fireEvent.click(within(dialogo).getByRole("checkbox"));
      fireEvent.click(within(dialogo).getByRole("button", { name: "Sí, cancelar con cargo" }));
      await screen.findByText(/Se cobró \$ 40\.000\./);
      expect(cancelarMiReserva).toHaveBeenLastCalledWith({ codigo: "3FA9C21B", email: "demo@hotel.com", aceptaCargo: true, montoAceptado: "40000.00" });
    });
  });

  it("otro error al cancelar: queda en el diálogo para reintentar", async () => {
    consultarMiReserva.mockResolvedValue(CANCELABLE);
    cancelarMiReserva.mockRejectedValue({ codigo: "ERROR_RED", status: 0 });
    renderPagina();
    completarYBuscar();
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar" }));
    const dialogo = screen.getByRole("dialog");
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/no pudimos comunicarnos/i);
    expect(within(dialogo).getByRole("button", { name: "Sí, cancelar" })).toBeEnabled();
  });
});
