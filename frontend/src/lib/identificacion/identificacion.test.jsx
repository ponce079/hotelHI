import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useIdentificarPersona } from "./useIdentificarPersona";
import { EstadoIdentificacion } from "./EstadoIdentificacion";
import { ActualizarFicha } from "./ActualizarFicha";
import { camposCambiados, fichaDesdeRespuesta, textoOtrosDocumentos, textoRegistrada, valoresDeLaFicha } from "./ficha";
import { buscarHuespedPorDocumento } from "../../modulos/check-in/checkIn.api";

vi.mock("../../modulos/check-in/checkIn.api", () => ({ buscarHuespedPorDocumento: vi.fn() }));

const RESPUESTA = {
  tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30111222",
  nombre: "Marcela", apellido: "Diagnostico", nombreRegistrado: { nombres: "Marcela", apellido: "Diagnostico" },
  fechaNacimiento: "1985-03-12", nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", domicilio: "Calle Falsa 123",
  telefono: "3875550100", email: "marcela@correo.com", fechaUltimaEstadia: "2026-09-20", alojadaAhora: false,
};

// Un solo QueryClient por test (si el envoltorio lo creara en cada render, la caché se perdería y se consultaría sin fin).
function crearEnvoltorio() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  buscarHuespedPorDocumento.mockReset();
});

describe("ficha: funciones puras", () => {
  const ficha = fichaDesdeRespuesta(RESPUESTA);

  it("trae TODOS los datos de la ficha (contacto, nacionalidad, residencia, localidad, domicilio, teléfono, nacimiento)", () => {
    expect(valoresDeLaFicha(ficha)).toEqual({
      fechaNacimiento: "12/03/1985", nacionalidad: "AR", paisResidencia: "AR", localidad: "Salta", domicilio: "Calle Falsa 123", telefono: "3875550100", email: "marcela@correo.com",
    });
    expect(ficha.nombreCompleto).toBe("Marcela Diagnostico");
  });

  it("marca los datos que cambian respecto de la ficha; un dato que la ficha no tenía no es un cambio", () => {
    const valores = { ...valoresDeLaFicha(ficha), telefono: "3875559999", domicilio: "  calle falsa 123 " };
    expect(camposCambiados(valores, ficha)).toEqual(["telefono"]);
    expect(camposCambiados({ ...valores, fechaNacimiento: "01/01/1990" }, ficha)).toEqual(["fechaNacimiento", "telefono"]);
    const fichaIncompleta = fichaDesdeRespuesta({ ...RESPUESTA, telefono: null, localidad: null });
    expect(camposCambiados({ ...valoresDeLaFicha(fichaIncompleta), telefono: "3875559999", localidad: "Cerrillos" }, fichaIncompleta)).toEqual([]);
    expect(camposCambiados({}, ficha)).toEqual([]);
    expect(camposCambiados(valores, null)).toEqual([]);
  });

  it("contacto: un correo nuevo sobre una ficha que solo tenía teléfono se marca como cambio (no se descarta en silencio)", () => {
    const soloTelefono = fichaDesdeRespuesta({ ...RESPUESTA, email: null });
    expect(camposCambiados({ ...valoresDeLaFicha(soloTelefono), email: "nuevo@correo.com" }, soloTelefono)).toEqual(["contacto"]);
    // Mismo contacto que la ficha: no es un cambio.
    expect(camposCambiados(valoresDeLaFicha(ficha), ficha)).toEqual([]);
    // Si ya se marcó el teléfono o el correo, no se duplica con "contacto".
    expect(camposCambiados({ ...valoresDeLaFicha(ficha), telefono: "3875559999" }, ficha)).toEqual(["telefono"]);
  });

  it("textos: registrada con la última estadía, y otros documentos con las iniciales", () => {
    expect(textoRegistrada(ficha)).toBe("Huésped registrado · última estadía: 20/09/2026");
    expect(textoRegistrada({ ...ficha, fechaUltimaEstadia: null })).toBe("Huésped registrado");
    expect(textoOtrosDocumentos([{ tipoDocumento: "Pasaporte", paisDocumento: "BR", iniciales: "M. J. G." }])).toMatch(/mismo número y otro tipo\/país de documento: Pasaporte, BR, M\. J\. G\./);
    expect(textoOtrosDocumentos([])).toBe("");
  });
});

describe("useIdentificarPersona", () => {
  const props = (numero) => ({ tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: numero });

  it("mientras se tipea espera 400 ms desde el número completo; busca por coincidencia exacta con el número normalizado", async () => {
    buscarHuespedPorDocumento.mockResolvedValue(RESPUESTA);
    const { result, rerender } = renderHook((p) => useIdentificarPersona(p), { wrapper: crearEnvoltorio(), initialProps: props("3011") });
    rerender(props("30.111.222"));
    expect(result.current.estado).toBe("buscando");
    expect(buscarHuespedPorDocumento).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.estado).toBe("registrada"), { timeout: 2000 });
    expect(buscarHuespedPorDocumento).toHaveBeenCalledWith({ tipo: "DNI", pais: "AR", numero: "30111222" });
    expect(result.current.ficha.nombreCompleto).toBe("Marcela Diagnostico");
  });

  it("nunca consulta un número parcial ni sin tipo o país", async () => {
    const { result, rerender } = renderHook((p) => useIdentificarPersona(p), { wrapper: crearEnvoltorio(), initialProps: props("3011") });
    await act(async () => new Promise((r) => setTimeout(r, 600)));
    expect(result.current.estado).toBe("inactivo");
    rerender({ tipoDocumento: "", paisDocumento: "AR", numeroDocumento: "30111222" });
    await act(async () => new Promise((r) => setTimeout(r, 600)));
    expect(buscarHuespedPorDocumento).not.toHaveBeenCalled();
  });

  it("el botón Buscar (buscarAhora) busca al instante, sin esperar los 400 ms", async () => {
    buscarHuespedPorDocumento.mockResolvedValue(RESPUESTA);
    const { result } = renderHook(() => useIdentificarPersona(props("30111222")), { wrapper: crearEnvoltorio() });
    act(() => result.current.buscarAhora());
    await waitFor(() => expect(buscarHuespedPorDocumento).toHaveBeenCalledTimes(1), { timeout: 300 });
  });

  it("404: estado 'nueva' con el aviso de otros tipos o países del mismo número", async () => {
    buscarHuespedPorDocumento.mockRejectedValue({ response: { status: 404, data: { error: "No hay", otrosDocumentos: [{ tipoDocumento: "DNI", paisDocumento: "BR", iniciales: "M. G." }] } } });
    const { result } = renderHook(() => useIdentificarPersona(props("30111222")), { wrapper: crearEnvoltorio() });
    await waitFor(() => expect(result.current.estado).toBe("nueva"), { timeout: 2000 });
    expect(result.current.otrosDocumentos).toEqual([{ tipoDocumento: "DNI", paisDocumento: "BR", iniciales: "M. G." }]);
  });

  it("un error de red no bloquea nada: estado 'error'", async () => {
    buscarHuespedPorDocumento.mockRejectedValue({ response: { status: 500 } });
    const { result } = renderHook(() => useIdentificarPersona(props("30111222")), { wrapper: crearEnvoltorio() });
    await waitFor(() => expect(result.current.estado).toBe("error"), { timeout: 2000 });
  });
});

describe("EstadoIdentificacion y ActualizarFicha", () => {
  it("muestra 'No hay un huésped registrado con ese documento' y el aviso de otro tipo/país", () => {
    render(<EstadoIdentificacion identificacion={{ estado: "nueva", ficha: null, otrosDocumentos: [{ tipoDocumento: "Pasaporte", paisDocumento: "BR", iniciales: "L. P." }] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("No hay un huésped registrado con ese documento");
    expect(screen.getByRole("status")).toHaveTextContent("Pasaporte, BR, L. P.");
  });

  it("muestra 'Huésped registrado · última estadía: …' y avisa si está alojada en otra estadía", () => {
    render(<EstadoIdentificacion identificacion={{ estado: "registrada", ficha: { ...fichaDesdeRespuesta(RESPUESTA), alojadaAhora: true }, otrosDocumentos: [] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Huésped registrado · última estadía: 20/09/2026");
    expect(screen.getByRole("status")).toHaveTextContent("alojada ahora en otra estadía");
  });

  it("la casilla 'Actualizar la ficha del huésped con estos datos' aparece solo con cambios y empieza sin tildar", () => {
    function Caja() {
      const [marcada, setMarcada] = useState(false);
      return <ActualizarFicha cambiados={["telefono", "domicilio"]} marcada={marcada} onCambiar={setMarcada} id="x" />;
    }
    const { rerender } = render(<Caja />);
    expect(screen.getByText(/Cambiaste datos respecto de la ficha del huésped: teléfono, domicilio\./)).toBeInTheDocument();
    const casilla = screen.getByRole("checkbox", { name: "Actualizar la ficha del huésped con estos datos" });
    expect(casilla).not.toBeChecked();
    fireEvent.click(casilla);
    expect(casilla).toBeChecked();
    rerender(<ActualizarFicha cambiados={[]} marcada={false} onCambiar={() => {}} id="x" />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
