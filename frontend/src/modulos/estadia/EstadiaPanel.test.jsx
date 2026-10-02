import { render, screen, within, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, it, expect, beforeEach } from "vitest";
import { EstadiaPanel, PersonaFormulario } from "./EstadiaPanel";
import { api } from "../../lib/api";
import { PAISES } from "../../lib/paises";
vi.mock("../../lib/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock("../../lib/sesion", () => ({
  useSesion: () => ({ usuario: "Operador prueba", puede: () => true }),
}));
const reserva = {
  id: 50,
  estado: "En curso",
  fechaDesde: "2026-09-28",
  fechaHasta: "2026-09-30",
  habitaciones: [
    { id: 10, numero: "101", capacidad: 2 },
    { id: 11, numero: "102", capacidad: 1 },
  ],
};
it("cambiar residencia actualiza localidades y limpia la anterior sin modificar el país emisor", async () => {
  const onGuardar = vi.fn();
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={{ nombre: "Ana", apellido: "Prueba" }}
      onGuardar={onGuardar}
      onClose={() => {}}
    />,
  );
  const emisor = screen.getByLabelText("País emisor");
  const residencia = screen.getByLabelText("País de residencia");
  const localidad = screen.getByLabelText("Localidad");
  expect(localidad).toBeDisabled();
  await userEvent.selectOptions(emisor, "AR");
  expect(localidad).toBeDisabled();
  await userEvent.selectOptions(residencia, "AR");
  await userEvent.selectOptions(localidad, "Rosario");
  await userEvent.selectOptions(residencia, "UY");
  expect(localidad).toHaveValue("");
  expect(within(localidad).queryByRole("option", { name: "Rosario" })).not.toBeInTheDocument();
  await userEvent.selectOptions(localidad, "Montevideo");
  expect(emisor).toHaveValue("AR");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenCalledWith(
    expect.objectContaining({
      paisDocumento: "AR",
      paisResidencia: "UY",
      localidad: "Montevideo",
    }),
  );
});
it("permite otra localidad y conserva valores históricos al editar sin reescribir la identidad", async () => {
  const onGuardar = vi.fn();
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={{
        nombre: "Ana",
        apellido: "Prueba",
        paisDocumento: "Argentina",
        paisResidencia: "Argentina",
        localidad: "Villa Allende",
      }}
      onGuardar={onGuardar}
      onClose={() => {}}
    />,
  );
  expect(screen.getByLabelText("País emisor")).toHaveValue("AR");
  expect(screen.getByLabelText("Nombre de la localidad")).toHaveValue("Villa Allende");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenLastCalledWith(
    expect.objectContaining({
      paisDocumento: "Argentina",
      paisResidencia: "Argentina",
      localidad: "Villa Allende",
    }),
  );
  await userEvent.selectOptions(screen.getByLabelText("País de residencia"), "CL");
  expect(screen.queryByLabelText("Nombre de la localidad")).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Localidad"), "__otra__");
  await userEvent.type(screen.getByLabelText("Nombre de la localidad"), "Puerto Varas");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenLastCalledWith(
    expect.objectContaining({
      paisDocumento: "Argentina",
      paisResidencia: "CL",
      localidad: "Puerto Varas",
    }),
  );
});
function setup() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <EstadiaPanel reserva={reserva} />
    </QueryClientProvider>,
  );
}
it.each([false, true])(
  "reutiliza al titular persistido (verificado=%s) sin esperar otro POST para agregar un acompañante",
  async (verificado) => {
    const titular = {
      id: 20,
      nombre: "Ana",
      apellido: "Prueba",
      tipoDocumento: "DNI",
      numeroDocumento: "12345678",
      email: "ana@example.com",
      estado: "Previsto",
      verificadoEn: verificado ? "2026-09-28T10:00:00Z" : null,
      fechaDesde: reserva.fechaDesde,
      fechaHasta: reserva.fechaHasta,
      asignaciones: [{ habitacionId: 10, hasta: null }],
    };
    api.get.mockResolvedValue({ data: [titular] });
    // Si la pantalla vuelve a intentar incorporarlo, queda esperando indefinidamente.
    api.post.mockImplementation(() => new Promise(() => {}));
    const onTitularPreparado = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EstadiaPanel
          reserva={{
            ...reserva,
            huesped: {
              id: 9,
              tipoDocumento: "DNI",
              numeroDocumento: "12345678",
            },
          }}
          soloPersonas
          onTitularPreparado={onTitularPreparado}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Agregar persona" })).toBeEnabled());
    expect(api.post).not.toHaveBeenCalled();
    expect(onTitularPreparado).toHaveBeenCalledWith(50);
    expect(screen.getAllByText("Ana Prueba")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  },
);
it("recupera titular y ocupantes tras reinicio del backend y vuelve a habilitar Agregar persona", async () => {
  let servidorDisponible = false;
  const titular = {
    id: 20,
    nombre: "Ana",
    apellido: "Prueba",
    estado: "Previsto",
    fechaDesde: reserva.fechaDesde,
    fechaHasta: reserva.fechaHasta,
    asignaciones: [{ habitacionId: 10, hasta: null }],
  };
  const corte = { response: { status: 502 }, message: "ECONNRESET" };
  api.get.mockImplementation(async () => {
    if (!servidorDisponible) throw corte;
    return { data: [titular] };
  });
  api.post.mockImplementation(async () => {
    if (!servidorDisponible) throw corte;
    return { data: { ocupanteId: 20, creado: false } };
  });
  const onTitularPreparado = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <EstadiaPanel
        reserva={{ ...reserva, huesped: { id: 9, nombre: "Ana Prueba" } }}
        soloPersonas
        onTitularPreparado={onTitularPreparado}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("button", { name: "Agregar persona" })).toBeDisabled();
  const recuperar = await screen.findByRole("button", { name: "Volver a cargar personas" }, { timeout: 7000 });
  await waitFor(() => expect(recuperar).toBeEnabled(), { timeout: 7000 });
  // No intentar un alta automática sin haber podido leer antes los ocupantes.
  expect(api.post).not.toHaveBeenCalled();
  expect(onTitularPreparado).not.toHaveBeenCalled();
  expect(screen.queryByText(/Todavía no se registraron ocupantes/)).not.toBeInTheDocument();
  servidorDisponible = true;
  await userEvent.click(recuperar);
  await waitFor(() => expect(screen.getByRole("button", { name: "Agregar persona" })).toBeEnabled());
  expect(screen.getAllByText("Ana Prueba")).toHaveLength(1);
  expect(onTitularPreparado).toHaveBeenCalledWith(50);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls.every(([url]) => url === "/estadia/50/titular")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
}, 15000);
it("incorpora al titular automáticamente y permite completar los datos copiados sin volver a agregarlo", async () => {
  const titular = {
    id: 20,
    nombre: "Ana Pérez",
    apellido: "",
    tipoDocumento: "DNI",
    numeroDocumento: "12345678",
    email: "ana@example.com",
    estado: "Previsto",
    fechaDesde: reserva.fechaDesde,
    fechaHasta: reserva.fechaHasta,
    asignaciones: [{ habitacionId: 10, hasta: null }],
  };
  let personas = [];
  api.get.mockImplementation(() => Promise.resolve({ data: personas }));
  api.post.mockImplementation(async () => {
    personas = [titular];
    return { data: { ocupanteId: 20, creado: true } };
  });
  api.put.mockResolvedValue({ data: titular });
  const onTitularPreparado = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EstadiaPanel
        reserva={{
          ...reserva,
          huesped: {
            id: 9,
            nombre: "Ana Pérez",
            tipoDocumento: "DNI",
            numeroDocumento: "12345678",
          },
        }}
        soloPersonas
        onTitularPreparado={onTitularPreparado}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Titular de la reserva")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith("/estadia/50/titular", {
    operador: "Operador prueba",
  });
  expect(onTitularPreparado).toHaveBeenCalledWith(50);
  expect(screen.getByText(/Falta completar:/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verificar datos" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Completar datos" }));
  expect(screen.getByLabelText("Nombre *")).toHaveValue("Ana Pérez");
  expect(screen.getByLabelText("Número de DNI")).toHaveValue("12345678");
  expect(screen.getByLabelText("Correo electrónico")).toHaveValue("ana@example.com");
  await userEvent.clear(screen.getByLabelText("Nombre *"));
  await userEvent.type(screen.getByLabelText("Nombre *"), "Ana");
  await userEvent.type(screen.getByLabelText("Apellido *"), "Pérez");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(api.put).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Nacimiento"), {
    target: { value: "1990-01-01" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      "/estadia/50/ocupantes/20",
      expect.objectContaining({
        nombre: "Ana",
        apellido: "Pérez",
        numeroDocumento: "12345678",
      }),
    ),
  );
  expect(api.post).toHaveBeenCalledTimes(1);
});
it("no consulta cuenta ni consumos hasta abrir la pestaña correspondiente", async () => {
  setup();
  await screen.findByText(/Todavía no se registraron ocupantes/);
  expect(api.get.mock.calls.some(([url]) => url.includes("/cuenta") || url === "/consumos-servicios")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Cuenta" }));
  await waitFor(() => expect(api.get.mock.calls.some(([url]) => url.includes("/cuenta"))).toBe(true));
  expect(api.get.mock.calls.some(([url]) => url === "/consumos-servicios")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Cargos por habitación" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/consumos-servicios", expect.any(Object)));
});
it("muestra todos los campos obligatorios faltantes y permite corregirlos sin enviar antes", async () => {
  const onGuardar = vi.fn();
  render(<PersonaFormulario reserva={reserva} onGuardar={onGuardar} onClose={() => {}} />);
  expect(screen.queryByText("Completá el nombre.")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(screen.getByText("Completá el nombre.")).toBeInTheDocument();
  expect(screen.getByText("Completá el apellido.")).toBeInTheDocument();
  expect(screen.getByLabelText("Nombre *")).toHaveFocus();
  expect(onGuardar).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText("Nombre *"), "Ana");
  await userEvent.type(screen.getByLabelText("Apellido *"), "Prueba");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Antes de verificar e ingresar/)).toBeInTheDocument();
});
it("detecta correo repetido antes de guardar y libera el formulario al corregirlo", async () => {
  const onGuardar = vi.fn();
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={{ nombre: "Ana", apellido: "Prueba" }}
      personas={[{ id: 8, email: "TEST@GMAIL.COM", estado: "Previsto" }]}
      onGuardar={onGuardar}
      onClose={() => {}}
    />,
  );
  const email = screen.getByLabelText("Correo electrónico");
  await userEvent.type(email, "test@gmail.com");
  expect(screen.getByText(/Este correo ya está registrado/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).not.toHaveBeenCalled();
  await userEvent.clear(email);
  await userEvent.type(email, "otra@gmail.com");
  expect(screen.queryByText(/Este correo ya está registrado/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ email: "otra@gmail.com" }));
});
it("editar el propio correo no se considera duplicado y los cancelados no bloquean", async () => {
  const onGuardar = vi.fn();
  const persona = {
    id: 7,
    nombre: "Ana",
    apellido: "Prueba",
    email: "test@gmail.com",
  };
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={persona}
      personas={[persona, { id: 8, email: "test@gmail.com", estado: "Cancelado" }]}
      onGuardar={onGuardar}
      onClose={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenCalled();
});
it("advierte capacidad antes del envío y permite corregir la habitación", async () => {
  const onGuardar = vi.fn();
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={{ nombre: "Ana", apellido: "Prueba", habitacionId: 11 }}
      personas={[
        {
          id: 8,
          habitacionId: 11,
          fechaDesde: reserva.fechaDesde,
          fechaHasta: reserva.fechaHasta,
        },
      ]}
      onGuardar={onGuardar}
      onClose={() => {}}
    />,
  );
  expect(screen.getByText(/supera su capacidad/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).not.toHaveBeenCalled();
  await userEvent.selectOptions(screen.getByLabelText("Habitación *"), "10");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenCalled();
});
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) =>
    Promise.resolve({
      data: url.includes("/cuenta")
        ? {
            habitaciones: [],
            garantias: [],
            totalAdeudado: 0,
            totalPagado: 0,
            saldo: 0,
          }
        : url === "/consumos-servicios"
          ? [
              {
                id: 1,
                habitacionId: 10,
                descripcion: "Lavandería",
                tipoServicio: "Lavandería",
                cantidad: 2,
                precioUnitario: 50,
                monto: 100,
                registradoPor: "Recepción",
                fechaHora: new Date().toISOString(),
              },
            ]
          : [],
    }),
  );
  api.post.mockResolvedValue({ data: { ok: true } });
});
it("agrupa cargos por habitación sin solicitar el nombre del huésped", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Cargos por habitación" }));
  expect(await screen.findByText(/Lavandería · 2/)).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Agregar cargo" })).toHaveLength(2);
  expect(screen.queryByLabelText(/huésped/i)).not.toBeInTheDocument();
});
it("exige motivo y manda operador para anular un cargo", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Cargos por habitación" }));
  await userEvent.click(await screen.findByRole("button", { name: "Anular" }));
  const confirmar = screen.getByRole("button", { name: "Confirmar anulación" });
  expect(confirmar).toBeDisabled();
  await userEvent.type(screen.getByLabelText("Motivo *"), "Carga duplicada");
  await userEvent.click(confirmar);
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith("/consumos-servicios/1/anular", {
      motivo: "Carga duplicada",
      operador: "Operador prueba",
    }),
  );
});
it("permite cargar ocupantes de distintas habitaciones y no copia al titular automáticamente", async () => {
  setup();
  await userEvent.click(screen.getByRole("button", { name: "Agregar persona" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.type(within(dialog).getByLabelText("Nombre *"), "Ana");
  await userEvent.type(within(dialog).getByLabelText("Apellido *"), "Prueba");
  await userEvent.selectOptions(within(dialog).getByLabelText("Habitación *"), "11");
  await userEvent.click(within(dialog).getByRole("button", { name: "Guardar persona" }));
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      "/estadia/50/ocupantes",
      expect.objectContaining({
        nombre: "Ana",
        apellido: "Prueba",
        habitacionId: "11",
        operador: "Operador prueba",
      }),
    ),
  );
});

const CAMPOS_DE_PAIS = ["País emisor", "Nacionalidad", "País de residencia"];
const opcionesDePais = (select) =>
  within(select)
    .getAllByRole("option")
    .filter((o) => o.value && o.value !== "__otro__");

function verificarCatalogoCompleto(select) {
  const opciones = opcionesDePais(select);
  expect(opciones).toHaveLength(PAISES.length);
  expect(opciones.map((o) => o.value).sort()).toEqual(PAISES.map(([codigo]) => codigo).sort());
  expect(opciones[0]).toHaveValue("AR");
  expect(opciones[0]).toHaveTextContent("Argentina");
  const nombres = opciones.slice(1).map((o) => o.textContent);
  expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, "es")));
  expect(within(select).getByRole("option", { name: "Japón" })).toHaveValue("JP");
  expect(within(select).getByRole("option", { name: "Otro país" })).toBeInTheDocument();
}

it("la ficha de ocupante ofrece el catálogo completo de países, con Argentina primero y el resto por nombre", () => {
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={{ nombre: "Ana", apellido: "Prueba" }}
      onGuardar={() => {}}
      onClose={() => {}}
    />,
  );
  for (const etiqueta of CAMPOS_DE_PAIS) verificarCatalogoCompleto(screen.getByLabelText(etiqueta));
});

it("guarda la nacionalidad elegida y pide escribir la localidad cuando el país no tiene sugerencias", async () => {
  const onGuardar = vi.fn();
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={{ nombre: "Ana", apellido: "Prueba" }}
      onGuardar={onGuardar}
      onClose={() => {}}
    />,
  );
  await userEvent.selectOptions(screen.getByLabelText("Nacionalidad"), "JP");
  await userEvent.selectOptions(screen.getByLabelText("País de residencia"), "JP");
  expect(screen.queryByLabelText("Localidad")).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Nombre de la localidad"), "Kioto");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenCalledWith(
    expect.objectContaining({ nacionalidad: "JP", paisResidencia: "JP", localidad: "Kioto" }),
  );
});

it("conserva una nacionalidad histórica escrita a mano que no figura en el catálogo", () => {
  render(
    <PersonaFormulario
      reserva={reserva}
      persona={{ nombre: "Ana", apellido: "Prueba", nacionalidad: "Atlántida" }}
      onGuardar={() => {}}
      onClose={() => {}}
    />,
  );
  expect(screen.getByLabelText("Nombre del país de la nacionalidad")).toHaveValue("Atlántida");
});

// ---------------------------------------------------------------- correcciones de la etapa 2
const ocupante = (datos) => ({
  apellido: "",
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  nacionalidad: "AR",
  paisResidencia: "AR",
  fechaDesde: "2026-09-28",
  fechaHasta: "2026-09-30",
  verificadoEn: "2026-09-28T14:00:00.000Z",
  asignaciones: [{ habitacionId: 10, hasta: null }],
  ...datos,
});

it("las fichas canceladas no se listan ni muestran faltantes; quedan en el Historial con su motivo", async () => {
  const fichas = [
    ocupante({ id: 26, nombre: "Martín Gutiérrez", numeroDocumento: "30512874", estado: "Cancelado", esTitular: true, verificadoEn: null, asignaciones: [{ habitacionId: 10, hasta: "2026-09-28T14:03:51.000Z" }] }),
    ocupante({ id: 38, nombre: "Martín", apellido: "Gutiérrez", numeroDocumento: "30512874", estado: "Alojado", esTitular: true, fechaNacimiento: "1984-10-01" }),
    ocupante({ id: 40, nombre: "María", apellido: "Gutiérrez", numeroDocumento: null, tipoDocumento: null, paisDocumento: null, motivoSinDocumento: "Menor sin documento presentado", estado: "Alojado", fechaNacimiento: "2018-03-14", responsableId: 38 }),
  ];
  const historial = [{ id: 60, fecha: "2026-09-28T14:03:51.000Z", accion: "cancelar", operador: "recepcionista.prueba", detalle: JSON.stringify({ ocupanteId: 26, motivo: "Reemplazada en el check-in" }) }];
  api.get.mockImplementation(async (url) => ({ data: url.endsWith("/historial") ? historial : url.endsWith("/ocupantes") ? fichas : [] }));
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <EstadiaPanel reserva={reserva} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("María Gutiérrez")).toBeInTheDocument();
  expect(screen.getAllByText(/Martín/)).toHaveLength(1);
  expect(screen.queryByText(/Cancelado/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Falta completar/)).not.toBeInTheDocument();
  expect(screen.getByText(/Sin documento \(menor\) · Alojado/)).toBeInTheDocument();
  expect(screen.queryByText(/Documento pendiente/)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Historial" }));
  expect(await screen.findByText(/28\/09\/2026 \d{2}:\d{2} · Ficha dada de baja · recepcionista\.prueba/)).toBeInTheDocument();
  expect(screen.getByText("Martín Gutiérrez · Reemplazada en el check-in")).toBeInTheDocument();
});

it("marcar a otra persona como titular con la estadía en curso pide el motivo y reemplaza al titular actual", async () => {
  const onGuardar = vi.fn();
  const titular = ocupante({ id: 38, nombre: "Martín", apellido: "Gutiérrez", numeroDocumento: "30512874", estado: "Alojado", esTitular: true, fechaNacimiento: "1984-10-01" });
  const marta = ocupante({ id: 39, nombre: "Marta", apellido: "Conte", numeroDocumento: "40236523", estado: "Alojado", esTitular: false, fechaNacimiento: "1990-05-05", nacionalidad: "AR", paisResidencia: "AR" });
  render(<PersonaFormulario reserva={reserva} persona={marta} personas={[titular, marta]} onGuardar={onGuardar} onClose={() => {}} />);
  expect(screen.queryByText(/Hoy el titular de esta habitación/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("Titular de esta habitación"));
  expect(screen.getByText(/Hoy el titular de esta habitación es Martín Gutiérrez\. Al guardar deja de serlo/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).not.toHaveBeenCalled();
  expect(screen.getByText("Indicá el motivo del cambio de titular.")).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/Motivo del cambio de titular \*/), "El titular se retira antes");
  await userEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(onGuardar).toHaveBeenCalledWith(
    expect.objectContaining({ esTitular: true, reemplazarTitular: true, motivoCambioTitular: "El titular se retira antes" }),
  );
});
