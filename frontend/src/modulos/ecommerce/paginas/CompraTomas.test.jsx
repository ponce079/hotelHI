// Pantallas de Tomás: Datos (/web/datos), Pago (/web/pago) y Confirmación
// (/web/confirmacion), contra el mock. Fechas relativas a hoy (regla del
// proyecto).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import App from "../../../App";
import { CLAVE_STORAGE } from "../ProcesoCompraContext";
import { reiniciarMock } from "../ecommerce.mock";
import { crearReserva } from "../ecommerce.api";
import { hoyEnHoraLocal } from "../../../lib/fechas";

vi.mock("../../../lib/sesion", () => ({ useSesion: () => ({ rol: null }) }));

// crearReserva real (el mock), pero espiable: así se ve qué cuerpo se mandó.
vi.mock("../ecommerce.api", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, crearReserva: vi.fn((cuerpo) => real.crearReserva(cuerpo)) };
});

function dia(desplazamiento) {
  const [a, m, d] = hoyEnHoraLocal().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + desplazamiento)).toISOString().slice(0, 10);
}
const ENTRADA = dia(20);
const SALIDA = dia(23);
const ANIO_TARJETA = String(Number(hoyEnHoraLocal().slice(2, 4)) + 4).padStart(2, "0");

const DOBLE = { tipoHabitacionId: 2, nombre: "Doble", capacidadMaxima: 4 };
const BAR = { planTarifarioId: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE", total: 75000, promedioPorNoche: 25000 };
const NRF = { planTarifarioId: 2, codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: null, penalidadNoShow: "TOTAL_ESTADIA", total: 63750, promedioPorNoche: 21250 };
const HUESPED = {
  nombres: "María José",
  apellido: "González",
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "30111222",
  fechaNacimiento: "1990-05-20",
  email: "maria@correo.com",
  telefono: "+54 9 387 555-1234",
  nacionalidad: "",
  paisResidencia: "",
};
const DATOS_OK = { huesped: HUESPED, consentimiento: { aceptaPoliticas: true, aceptaComunicaciones: false } };

function guardarProceso(estado) {
  sessionStorage.setItem(
    CLAVE_STORAGE,
    JSON.stringify({ fechaDesde: ENTRADA, fechaHasta: SALIDA, ocupacion: [{ adultos: 2, menores: 0 }], claveIdempotencia: "clave-inicial-0001", tipo: DOBLE, plan: BAR, ...estado })
  );
}
const leerProceso = () => JSON.parse(sessionStorage.getItem(CLAVE_STORAGE));

function Ubicacion() {
  const { pathname } = useLocation();
  return <output data-testid="ruta">{pathname}</output>;
}

function renderRuta(ruta) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[ruta]}>
        <App />
        <Ubicacion />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

function cargarTarjeta({ numero = "4242424242424242", vencimiento = `12${ANIO_TARJETA}`, cvv = "123", titular = "MARIA GONZALEZ" } = {}) {
  escribir(/número de tarjeta/i, numero);
  escribir(/nombre como figura/i, titular);
  escribir(/vencimiento/i, vencimiento);
  escribir(/código de seguridad/i, cvv);
}

const botonPrincipal = (nombre) => screen.getAllByRole("button", { name: nombre })[0];

beforeEach(() => {
  sessionStorage.clear();
  reiniciarMock();
  crearReserva.mockClear();
  vi.stubEnv("VITE_ECOMMERCE_MOCK", "true");
  window.scrollTo = vi.fn();
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState({}, "", "/");
});

describe("/web/datos (HU-101)", () => {
  it("arranca con nacionalidad y residencia vacías y los dos consentimientos sin tildar", () => {
    guardarProceso({});
    renderRuta("/web/datos");
    expect(screen.getByLabelText(/^nacionalidad/i)).toHaveValue("");
    expect(screen.getByLabelText(/^país de residencia/i)).toHaveValue("");
    expect(screen.getByLabelText(/país que emitió/i)).toHaveValue("AR");
    expect(screen.getByLabelText(/leí y acepto/i)).not.toBeChecked();
    expect(screen.getByLabelText(/novedades y promociones/i)).not.toBeChecked();
    expect(screen.queryByText(/huésped 2|servicios adicionales|crear una cuenta/i)).not.toBeInTheDocument();
  });

  it("sin datos no avanza: marca los obligatorios y el consentimiento, y enfoca el primero", () => {
    guardarProceso({});
    renderRuta("/web/datos");
    fireEvent.click(botonPrincipal(/continuar al pago/i));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/web/datos");
    expect(screen.getByText("Ingresá tu nombre.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá tu email.")).toBeInTheDocument();
    expect(screen.getByText(/aceptá los términos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^nombre/i)).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(/revisá los datos marcados/i);
  });

  it("el titular tiene que ser mayor de 18 a la fecha de ingreso", () => {
    guardarProceso({ ...DATOS_OK, huesped: { ...HUESPED, fechaNacimiento: dia(20 - 365 * 17) } });
    renderRuta("/web/datos");
    fireEvent.click(botonPrincipal(/continuar al pago/i));
    expect(screen.getByText(/al menos 18 años en la fecha de ingreso/i)).toBeInTheDocument();
    expect(screen.getByTestId("ruta")).toHaveTextContent("/web/datos");
  });

  it("'Usar Argentina' copia el país del documento sin precargarlo", () => {
    guardarProceso({});
    renderRuta("/web/datos");
    const [usarNacionalidad] = screen.getAllByRole("button", { name: /usar argentina/i });
    fireEvent.click(usarNacionalidad);
    expect(screen.getByLabelText(/^nacionalidad/i)).toHaveValue("AR");
    expect(screen.getByLabelText(/^país de residencia/i)).toHaveValue("");
  });

  it("completo y con los términos aceptados, guarda en el contexto y pasa al pago", async () => {
    guardarProceso({});
    renderRuta("/web/datos");
    escribir(/^nombre/i, "  María   José ");
    escribir(/apellido/i, "González");
    escribir(/número de dni/i, "30111222");
    escribir(/fecha de nacimiento/i, "1990-05-20");
    escribir(/^email/i, "maria@correo.com");
    escribir(/teléfono/i, "+54 9 387 555-1234");
    escribir(/hora estimada/i, "20-22");
    escribir(/solicitudes especiales/i, "Cuna para bebé");
    fireEvent.click(screen.getByLabelText(/leí y acepto/i));
    fireEvent.click(screen.getByLabelText(/novedades y promociones/i));
    fireEvent.click(botonPrincipal(/continuar al pago/i));

    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/pago"));
    const guardado = leerProceso();
    expect(guardado.huesped).toMatchObject({ nombres: "María José", apellido: "González", email: "maria@correo.com", nacionalidad: "" });
    expect(guardado.llegada).toEqual({ horaEstimada: "20-22" });
    expect(guardado.solicitudesEspeciales).toBe("Cuna para bebé");
    expect(guardado.consentimiento).toEqual({ aceptaPoliticas: true, aceptaComunicaciones: true });
  });
});

describe("/web/pago (HU-102)", () => {
  it("valida la tarjeta antes de mandar nada", () => {
    guardarProceso(DATOS_OK);
    renderRuta("/web/pago");
    cargarTarjeta({ numero: "4242424242424241", vencimiento: "0120" });
    fireEvent.click(botonPrincipal(/confirmar reserva/i));
    expect(screen.getByText("Revisá el número de la tarjeta.")).toBeInTheDocument();
    expect(screen.getByText("La tarjeta está vencida.")).toBeInTheDocument();
    expect(screen.getByLabelText(/número de tarjeta/i)).toHaveFocus();
    expect(crearReserva).not.toHaveBeenCalled();
  });

  it("avisa si la tarjeta vence antes de la salida", () => {
    guardarProceso({ ...DATOS_OK, fechaDesde: dia(400), fechaHasta: dia(403) });
    renderRuta("/web/pago");
    const salida = dia(403);
    const mesAnterior = new Date(Date.UTC(Number(salida.slice(0, 4)), Number(salida.slice(5, 7)) - 2, 1)).toISOString();
    cargarTarjeta({ vencimiento: `${mesAnterior.slice(5, 7)}${mesAnterior.slice(2, 4)}` });
    fireEvent.click(botonPrincipal(/confirmar reserva/i));
    expect(screen.getByText(/vence antes de tu fecha de salida/i)).toBeInTheDocument();
    expect(crearReserva).not.toHaveBeenCalled();
  });

  it("manda el cuerpo del contrato una sola vez (doble clic) y nunca guarda la tarjeta", async () => {
    guardarProceso(DATOS_OK);
    renderRuta("/web/pago");
    cargarTarjeta();
    const boton = botonPrincipal(/confirmar reserva/i);
    fireEvent.click(boton);
    fireEvent.click(boton);

    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/confirmacion"));
    expect(crearReserva).toHaveBeenCalledTimes(1);
    const cuerpo = crearReserva.mock.calls[0][0];
    expect(cuerpo).toMatchObject({
      claveIdempotencia: "clave-inicial-0001",
      totalEsperado: 75000,
      huesped: { nombres: "María José", numeroDocumento: "30111222" },
      consentimiento: { aceptaPoliticas: true, versionPoliticas: "2026-10-01", aceptaComunicaciones: false },
      tarjeta: { titular: "MARIA GONZALEZ", numero: "4242424242424242", vencimientoMes: 12, vencimientoAnio: 2000 + Number(ANIO_TARJETA), cvv: "123" },
    });
    expect(sessionStorage.getItem(CLAVE_STORAGE)).not.toMatch(/4242424242424242|"cvv"|"tarjeta"/);
  });

  it("PAGO_RECHAZADO (0069): muestra el motivo, borra la tarjeta y genera clave nueva", async () => {
    guardarProceso(DATOS_OK);
    renderRuta("/web/pago");
    cargarTarjeta({ numero: "4000000000000069" });
    fireEvent.click(botonPrincipal(/confirmar reserva/i));

    expect(await screen.findByText(/la tarjeta fue rechazada \(tarjeta vencida\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de tarjeta/i)).toHaveValue("");
    expect(screen.getByLabelText(/código de seguridad/i)).toHaveValue("");
    expect(screen.getByLabelText(/nombre como figura/i)).toHaveValue("MARIA GONZALEZ");
    expect(screen.getByText(/volvé a ingresarlos/i)).toBeInTheDocument();
    await waitFor(() => expect(leerProceso().claveIdempotencia).not.toBe("clave-inicial-0001"));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/web/pago");
  });

  it("no reembolsable: 'Pagar $ X' y la 0002 se rechaza por fondos insuficientes", async () => {
    guardarProceso({ ...DATOS_OK, plan: NRF });
    renderRuta("/web/pago");
    expect(screen.getByText(/se cobra el total ahora/i)).toHaveTextContent("$ 63.750");
    cargarTarjeta({ numero: "4000000000000002" });
    fireEvent.click(botonPrincipal(/pagar \$ 63\.750/i));
    expect(await screen.findByText(/fondos insuficientes/i)).toBeInTheDocument();
  });

  it("PRECIO_CAMBIADO: muestra el total nuevo, actualiza el botón y al confirmar de nuevo reserva", async () => {
    window.history.replaceState({}, "", "/?mockEscenario=PRECIO_CAMBIADO");
    guardarProceso({ ...DATOS_OK, plan: NRF });
    renderRuta("/web/pago");
    cargarTarjeta();
    fireEvent.click(botonPrincipal(/pagar \$ 63\.750/i));
    expect(await screen.findByText(/el total nuevo es \$ 70\.125/i)).toBeInTheDocument();
    expect(botonPrincipal(/pagar \$ 70\.125/i)).toBeInTheDocument();

    cargarTarjeta();
    fireEvent.click(botonPrincipal(/pagar \$ 70\.125/i));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/confirmacion"));
    expect(crearReserva.mock.calls[1][0].totalEsperado).toBe(70125);
    expect(crearReserva.mock.calls[1][0].claveIdempotencia).not.toBe(crearReserva.mock.calls[0][0].claveIdempotencia);
  });

  it("SIN_DISPONIBILIDAD: ofrece volver a resultados con la búsqueda", async () => {
    window.history.replaceState({}, "", "/?mockEscenario=SIN_DISPONIBILIDAD");
    guardarProceso(DATOS_OK);
    renderRuta("/web/pago");
    cargarTarjeta();
    fireEvent.click(botonPrincipal(/confirmar reserva/i));
    expect(await screen.findByText(/ya no queda disponibilidad/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver otras habitaciones/i })).toHaveAttribute(
      "href",
      `/web/resultados?entrada=${ENTRADA}&salida=${SALIDA}&adultos=2&menores=0`
    );
  });

  it("mientras procesa: botón 'Procesando…' deshabilitado y mensaje de espera con role=status; desaparece con la respuesta", async () => {
    guardarProceso(DATOS_OK);
    renderRuta("/web/pago");
    cargarTarjeta();
    const MENSAJE = "Estamos confirmando tu reserva, no cierres ni recargues esta ventana.";
    expect(screen.queryByText(MENSAJE)).not.toBeInTheDocument();
    let responder;
    crearReserva.mockImplementationOnce(() => new Promise((resolver, rechazar) => (responder = rechazar)));
    fireEvent.click(botonPrincipal(/confirmar reserva/i));

    const aviso = await screen.findByText(MENSAJE);
    expect(aviso.closest("[role='status']")).toHaveAttribute("aria-live", "polite");
    expect(botonPrincipal(/procesando/i)).toBeDisabled();

    await act(async () => responder({ codigo: "ERROR_INTERNO", mensaje: "x", status: 500 }));
    await waitFor(() => expect(screen.queryByText(MENSAJE)).not.toBeInTheDocument());
    expect(screen.getByText(/tuvimos un problema/i)).toBeInTheDocument();
  });

  it("ERROR_INTERNO: mensaje genérico y conserva la MISMA clave para el reintento", async () => {
    window.history.replaceState({}, "", "/?mockEscenario=ERROR_INTERNO");
    guardarProceso(DATOS_OK);
    renderRuta("/web/pago");
    cargarTarjeta();
    fireEvent.click(botonPrincipal(/confirmar reserva/i));
    expect(await screen.findByText(/tuvimos un problema/i)).toBeInTheDocument();
    expect(leerProceso().claveIdempotencia).toBe("clave-inicial-0001");
  });

  it("DATOS_INVALIDOS de un dato del titular vuelve a /web/datos con el campo marcado", async () => {
    // Un dato que el servidor rechaza aunque pasó la validación del navegador.
    crearReserva.mockRejectedValueOnce({ codigo: "DATOS_INVALIDOS", mensaje: "Ingresá un email válido.", campo: "huesped.email", status: 400 });
    guardarProceso(DATOS_OK);
    renderRuta("/web/pago");
    cargarTarjeta();
    fireEvent.click(botonPrincipal(/confirmar reserva/i));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/web/datos"));
    expect(screen.getByText("Ingresá un email válido.")).toBeInTheDocument();
    // El foco se pone en un efecto de la pantalla de datos, que React corre después de que la ruta ya cambió: se
    // espera (antes se afirmaba en el acto y fallaba de vez en cuando bajo carga).
    await waitFor(() => expect(screen.getByLabelText(/^email/i)).toHaveFocus());
  });
});

describe("/web/confirmacion (HU-103)", () => {
  const RESULTADO = {
    codigoConfirmacion: "F2AAF1C6",
    estado: "Confirmada",
    fechaDesde: ENTRADA,
    fechaHasta: SALIDA,
    noches: 3,
    plan: { codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: null },
    total: 63750,
    cobradoAhora: 63750,
    garantia: { tipo: "PREPAGO", marca: "VISA", ultimos4: "4242" },
    habitaciones: [{ tipo: "Doble", adultos: 2, menores: 0 }],
    email: { enviado: true },
  };

  it("email en segundo plano (enCamino): dice que se está enviando, sin aviso de error", () => {
    guardarProceso({ ...DATOS_OK, claveIdempotencia: null, resultado: { ...RESULTADO, email: { enviado: null, enCamino: true } } });
    renderRuta("/web/confirmacion");
    expect(screen.getByText(/Te estamos enviando el comprobante a/)).toBeInTheDocument();
    expect(screen.queryByText(/No pudimos enviarte el email/)).not.toBeInTheDocument();
  });

  it("no reembolsable: código, 'Pagada', nombre comercial y lo cobrado", () => {
    guardarProceso({ ...DATOS_OK, claveIdempotencia: null, resultado: RESULTADO });
    renderRuta("/web/confirmacion");
    expect(screen.getByText("F2AAF1C6")).toBeInTheDocument();
    expect(screen.getByText("Pagada")).toBeInTheDocument();
    expect(screen.getByText("No reembolsable")).toBeInTheDocument();
    expect(screen.queryByText("No Reembolsable")).not.toBeInTheDocument();
    expect(screen.getByText("Cobrado $ 63.750 con tarjeta Visa terminada en 4242")).toBeInTheDocument();
    expect(screen.getByText(/enviamos el comprobante a/i)).toHaveTextContent("maria@correo.com");
    expect(screen.getByRole("link", { name: /ver mi reserva/i })).toHaveAttribute("href", "/web/mi-reserva?codigo=F2AAF1C6");
    expect(document.title).toBe("Confirmación · Holiday Inn Salta");
  });

  it("flexible: garantizada con tarjeta, sin cobro", () => {
    guardarProceso({
      ...DATOS_OK,
      claveIdempotencia: null,
      resultado: {
        ...RESULTADO,
        plan: { codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48 },
        cobradoAhora: 0,
        garantia: { tipo: "GARANTIA", marca: "MASTERCARD", ultimos4: "4444" },
      },
    });
    renderRuta("/web/confirmacion");
    expect(screen.getByText("Confirmada · garantizada con tarjeta")).toBeInTheDocument();
    expect(screen.getByText("Tarifa flexible")).toBeInTheDocument();
    expect(screen.getByText("Garantizada con tarjeta Mastercard terminada en 4444")).toBeInTheDocument();
    expect(screen.getByText(/podés cancelar sin cargo desde mi reserva hasta 48 h/i)).toBeInTheDocument();
  });

  it("email no enviado: avisa y pide guardar el código", () => {
    guardarProceso({ ...DATOS_OK, claveIdempotencia: null, resultado: { ...RESULTADO, email: { enviado: false } } });
    renderRuta("/web/confirmacion");
    expect(screen.getByText(/no pudimos enviarte el email/i)).toBeInTheDocument();
    expect(screen.getByText(/guardá este código/i)).toBeInTheDocument();
    expect(screen.queryByText(/enviamos el comprobante/i)).not.toBeInTheDocument();
  });

  it("repetición idempotente (email null): solo el código, sin mensaje del email", () => {
    guardarProceso({ ...DATOS_OK, claveIdempotencia: null, resultado: { ...RESULTADO, email: { enviado: null } } });
    renderRuta("/web/confirmacion");
    expect(screen.getByText("F2AAF1C6")).toBeInTheDocument();
    expect(screen.queryByText(/enviamos el comprobante|no pudimos enviarte/i)).not.toBeInTheDocument();
  });

  it("copia el código y 'Volver al inicio' reinicia el proceso", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    guardarProceso({ ...DATOS_OK, claveIdempotencia: null, resultado: RESULTADO });
    renderRuta("/web/confirmacion");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /copiar el código/i })));
    expect(writeText).toHaveBeenCalledWith("F2AAF1C6");
    expect(within(screen.getByRole("button", { name: /copiar el código/i })).getByText(/copiado/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /volver al inicio/i }));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/web$/));
    await waitFor(() => expect(leerProceso().resultado).toBeNull());
    expect(leerProceso().huesped.nombres).toBe("");
  });
});
