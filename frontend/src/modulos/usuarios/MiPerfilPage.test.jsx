import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MiPerfilPage } from "./MiPerfilPage";
import { useSesion } from "../../lib/sesion";
import { actualizarMiPerfil, cambiarMiContrasena, obtenerMiPerfil } from "./usuarios.api";
import { prepararFoto } from "./fotoPerfil";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("./fotoPerfil", () => ({ prepararFoto: vi.fn() }));
vi.mock("./usuarios.api", () => ({
  actualizarMiPerfil: vi.fn(),
  cambiarMiContrasena: vi.fn(),
  obtenerMiPerfil: vi.fn(),
}));

const PERFIL = {
  id: 6,
  usuario: "gerente.prueba",
  nombre: "Prueba",
  apellido: "Gerente",
  dni: "10000006",
  email: null,
  rol: "gerente",
  foto: null,
  activo: true,
  creadoEn: "2026-09-20T15:00:00.000Z",
  ultimoIngreso: "2026-09-29T13:30:00.000Z",
};

let actualizarPerfil;

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/mi-perfil"]}>
        <MiPerfilPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actualizarPerfil = vi.fn();
  obtenerMiPerfil.mockResolvedValue(PERFIL);
  useSesion.mockReturnValue({
    perfil: PERFIL,
    usuario: "gerente.prueba",
    rolInfo: { label: "Gerente" },
    actualizarPerfil,
  });
});

describe("MiPerfilPage — 'Mi perfil' como página (no modal)", () => {
  it("muestra el encabezado con nombre, rol, usuario y DNI, y la tarjeta 'Tu cuenta'", async () => {
    renderPagina();
    expect(screen.getByRole("heading", { level: 1, name: "Mi perfil" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Prueba Gerente" })).toBeInTheDocument();
    expect(screen.getByText("DNI 10.000.006")).toBeInTheDocument();
    expect(screen.getByText("Tu cuenta")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("20/09/2026")).toBeInTheDocument();
    expect(screen.getByText(/El usuario y el rol los asigna un administrador/)).toBeInTheDocument();
    // Ni usuario ni rol son editables desde acá.
    expect(screen.queryByLabelText(/Rol/)).not.toBeInTheDocument();
    await waitFor(() => expect(obtenerMiPerfil).toHaveBeenCalled());
  });

  it("'Guardar cambios' y 'Descartar cambios' arrancan deshabilitados hasta que se edita algo", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    const guardar = screen.getByRole("button", { name: "Guardar cambios" });
    const descartar = screen.getByRole("button", { name: "Descartar cambios" });
    expect(guardar).toBeDisabled();
    expect(descartar).toBeDisabled();

    const nombre = screen.getByLabelText("Nombre *");
    await usuario.clear(nombre);
    await usuario.type(nombre, "Otro");
    expect(guardar).toBeEnabled();

    await usuario.click(descartar);
    expect(nombre).toHaveValue("Prueba");
    expect(guardar).toBeDisabled();
  });

  it("guarda los datos personales y refresca la sesión", async () => {
    actualizarMiPerfil.mockResolvedValue({ ...PERFIL, nombre: "Ana", email: "ana@hotel.com" });
    const usuario = userEvent.setup();
    renderPagina();

    const nombre = screen.getByLabelText("Nombre *");
    await usuario.clear(nombre);
    await usuario.type(nombre, "Ana");
    await usuario.type(screen.getByLabelText("Email"), "ana@hotel.com");
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(actualizarMiPerfil).toHaveBeenCalledWith({
      nombre: "Ana",
      apellido: "Gerente",
      dni: "10000006",
      email: "ana@hotel.com",
    });
    expect(await screen.findByText("Tus datos se guardaron correctamente.")).toBeInTheDocument();
    expect(actualizarPerfil).toHaveBeenCalledWith({ ...PERFIL, nombre: "Ana", email: "ana@hotel.com" });
  });

  it("valida el DNI antes de mandar", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    const dni = screen.getByLabelText("DNI *");
    await usuario.clear(dni);
    await usuario.type(dni, "12ab");
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(screen.getByText("El DNI debe tener 7 u 8 números.")).toBeInTheDocument();
    expect(actualizarMiPerfil).not.toHaveBeenCalled();
  });

  it("rechaza una foto que no es JPG/PNG sin mandar nada", async () => {
    prepararFoto.mockRejectedValue(new Error("La foto tiene que ser JPG o PNG."));
    const usuario = userEvent.setup({ applyAccept: false });
    renderPagina();
    const archivo = new File(["GIF89a"], "animada.gif", { type: "image/gif" });
    await usuario.upload(screen.getByLabelText("Elegir foto de perfil"), archivo);
    expect(await screen.findByText("La foto tiene que ser JPG o PNG.")).toBeInTheDocument();
    expect(actualizarMiPerfil).not.toHaveBeenCalled();
  });

  it("quitar la foto guarda en el momento con los datos ya guardados", async () => {
    useSesion.mockReturnValue({
      perfil: { ...PERFIL, foto: "data:image/png;base64,AAAA" },
      usuario: "gerente.prueba",
      rolInfo: { label: "Gerente" },
      actualizarPerfil,
    });
    obtenerMiPerfil.mockResolvedValue({ ...PERFIL, foto: "data:image/png;base64,AAAA" });
    actualizarMiPerfil.mockResolvedValue(PERFIL);
    const usuario = userEvent.setup();
    renderPagina();

    await usuario.click(await screen.findByRole("button", { name: /Quitar foto/ }));
    expect(actualizarMiPerfil).toHaveBeenCalledWith({
      nombre: "Prueba",
      apellido: "Gerente",
      dni: "10000006",
      email: "",
      foto: null,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Foto eliminada");
  });

  it("los requisitos de la contraseña se marcan en vivo", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    const requisito = (texto) => screen.getByText(texto).querySelector("span");
    expect(requisito("Al menos 6 caracteres")).toHaveClass("text-transparent");

    await usuario.type(screen.getByLabelText("Contraseña actual"), "vieja1");
    await usuario.type(screen.getByLabelText("Nueva contraseña"), "nueva123");
    await usuario.type(screen.getByLabelText("Repetir nueva contraseña"), "nueva123");

    expect(requisito("Al menos 6 caracteres")).toHaveClass("text-pino");
    expect(requisito("Distinta a la actual")).toHaveClass("text-pino");
    expect(requisito("Ambas coinciden")).toHaveClass("text-pino");
  });

  it("cambiar contraseña pide la actual y que la nueva coincida", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    await usuario.type(screen.getByLabelText("Nueva contraseña"), "nueva123");
    await usuario.type(screen.getByLabelText("Repetir nueva contraseña"), "otra123");
    await usuario.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
    expect(screen.getByText("Ingresá tu contraseña actual.")).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(cambiarMiContrasena).not.toHaveBeenCalled();
  });

  it("cambia la contraseña y muestra el error del backend si la actual es incorrecta", async () => {
    cambiarMiContrasena.mockRejectedValueOnce({ response: { status: 400, data: { error: "La contraseña actual no es correcta." } } });
    cambiarMiContrasena.mockResolvedValueOnce({ ok: true });
    const usuario = userEvent.setup();
    renderPagina();

    await usuario.type(screen.getByLabelText("Contraseña actual"), "mal");
    await usuario.type(screen.getByLabelText("Nueva contraseña"), "nueva123");
    await usuario.type(screen.getByLabelText("Repetir nueva contraseña"), "nueva123");
    await usuario.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
    expect(await screen.findByText("La contraseña actual no es correcta.")).toBeInTheDocument();

    // El error queda adentro del mismo label, por eso el regex.
    const actual = screen.getByLabelText(/^Contraseña actual/);
    await usuario.clear(actual);
    await usuario.type(actual, "secreta1");
    await usuario.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
    expect(cambiarMiContrasena).toHaveBeenLastCalledWith("secreta1", "nueva123");
    expect(await screen.findByText(/Contraseña actualizada/)).toBeInTheDocument();
  });
});

describe("MiPerfilPage — foto y refresco del formulario", () => {
  it("al elegir una foto manda SOLO los datos ya guardados (no lo escrito sin guardar), confirma y conserva los cambios del formulario", async () => {
    prepararFoto.mockResolvedValue("data:image/jpeg;base64,BBBB");
    actualizarMiPerfil.mockResolvedValue({ ...PERFIL, foto: "data:image/jpeg;base64,BBBB" });
    const usuario = userEvent.setup();
    renderPagina();

    const nombre = screen.getByLabelText("Nombre *");
    await usuario.clear(nombre);
    await usuario.type(nombre, "Cambio sin guardar");

    const archivo = new File(["x"], "foto.png", { type: "image/png" });
    await usuario.upload(screen.getByLabelText("Elegir foto de perfil"), archivo);

    expect(actualizarMiPerfil).toHaveBeenCalledTimes(1);
    expect(actualizarMiPerfil).toHaveBeenCalledWith({
      nombre: "Prueba",
      apellido: "Gerente",
      dni: "10000006",
      email: "",
      foto: "data:image/jpeg;base64,BBBB",
    });
    expect(await screen.findByText("Foto actualizada")).toBeInTheDocument();
    // El cambio sin guardar sigue en pantalla y el botón de guardar sigue habilitado.
    expect(screen.getByLabelText("Nombre *")).toHaveValue("Cambio sin guardar");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("quitar la foto con cambios sin guardar: tampoco los manda, los conserva y confirma 'Foto eliminada'", async () => {
    useSesion.mockReturnValue({
      perfil: { ...PERFIL, foto: "data:image/png;base64,AAAA" },
      usuario: "gerente.prueba",
      rolInfo: { label: "Gerente" },
      actualizarPerfil,
    });
    obtenerMiPerfil.mockResolvedValue({ ...PERFIL, foto: "data:image/png;base64,AAAA" });
    actualizarMiPerfil.mockResolvedValue(PERFIL);
    const usuario = userEvent.setup();
    renderPagina();

    await waitFor(() => expect(obtenerMiPerfil).toHaveBeenCalled());
    const apellido = screen.getByLabelText("Apellido *");
    await usuario.clear(apellido);
    await usuario.type(apellido, "Editado");
    await usuario.click(await screen.findByRole("button", { name: /Quitar foto/ }));

    expect(actualizarMiPerfil).toHaveBeenCalledWith(expect.objectContaining({ apellido: "Gerente", foto: null }));
    expect(await screen.findByText("Foto eliminada")).toBeInTheDocument();
    expect(screen.getByLabelText("Apellido *")).toHaveValue("Editado");
  });

  it("cuando llegan los datos del servidor y no se editó nada, el formulario se refresca", async () => {
    obtenerMiPerfil.mockResolvedValue({ ...PERFIL, nombre: "Del servidor" });
    renderPagina();
    await waitFor(() => expect(screen.getByLabelText("Nombre *")).toHaveValue("Del servidor"));
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("si se empezó a editar antes de que lleguen los datos del servidor, lo escrito se conserva", async () => {
    let resolver;
    obtenerMiPerfil.mockReturnValue(new Promise((r) => (resolver = r)));
    const usuario = userEvent.setup();
    renderPagina();
    const nombre = screen.getByLabelText("Nombre *");
    await usuario.clear(nombre);
    await usuario.type(nombre, "Escribiendo");
    resolver({ ...PERFIL, nombre: "Del servidor" });
    await waitFor(() => expect(obtenerMiPerfil).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled());
    expect(screen.getByLabelText("Nombre *")).toHaveValue("Escribiendo");
  });

  it("no actualiza estado mientras renderiza (sin advertencias de React)", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    renderPagina();
    await waitFor(() => expect(obtenerMiPerfil).toHaveBeenCalled());
    await screen.findByRole("heading", { name: "Prueba Gerente" });
    const advertencias = consola.mock.calls.map((c) => String(c[0])).filter((m) => /while rendering|Cannot update/i.test(m));
    expect(advertencias).toEqual([]);
    consola.mockRestore();
  });
});
