import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { MiPerfilPage } from "./MiPerfilPage";
import { useSesion } from "../../lib/sesion";
import { actualizarMiPerfil, cambiarMiContrasena, obtenerMiPerfil } from "./usuarios.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
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
    expect(await screen.findByText("Foto de perfil quitada.")).toBeInTheDocument();
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
