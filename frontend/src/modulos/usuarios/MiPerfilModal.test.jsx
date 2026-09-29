import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MiPerfilModal } from "./MiPerfilModal";
import { useSesion } from "../../lib/sesion";
import { actualizarMiPerfil, cambiarMiContrasena } from "./usuarios.api";

vi.mock("../../lib/sesion", () => ({ useSesion: vi.fn() }));
vi.mock("./usuarios.api", () => ({ actualizarMiPerfil: vi.fn(), cambiarMiContrasena: vi.fn() }));

const PERFIL = {
  id: 2,
  usuario: "ana.recepcion",
  nombre: "Ana",
  apellido: "Pérez",
  dni: "30111222",
  email: "ana@mail.com",
  rol: "recepcionista",
  foto: null,
};

let actualizarPerfil;

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MiPerfilModal onClose={vi.fn()} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actualizarPerfil = vi.fn();
  useSesion.mockReturnValue({
    perfil: PERFIL,
    usuario: "ana.recepcion",
    rolInfo: { label: "Recepcionista" },
    actualizarPerfil,
  });
});

describe("MiPerfilModal — autogestión del perfil", () => {
  it("muestra usuario y rol como datos fijos (no editables)", () => {
    renderModal();
    expect(screen.getByText("ana.recepcion")).toBeInTheDocument();
    expect(screen.getByText(/Recepcionista/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Rol/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre *")).toHaveValue("Ana");
    expect(screen.getByLabelText("DNI *")).toHaveValue("30111222");
  });

  it("guarda nombre, apellido, DNI y email y refresca la sesión", async () => {
    actualizarMiPerfil.mockResolvedValue({ ...PERFIL, nombre: "Ana María" });
    const usuario = userEvent.setup();
    renderModal();
    const nombre = screen.getByLabelText("Nombre *");
    await usuario.clear(nombre);
    await usuario.type(nombre, "Ana María");
    await usuario.click(screen.getByRole("button", { name: "Guardar mis datos" }));

    expect(actualizarMiPerfil).toHaveBeenCalledWith({
      nombre: "Ana María",
      apellido: "Pérez",
      dni: "30111222",
      email: "ana@mail.com",
      foto: null,
    });
    expect(await screen.findByText("Tus datos se guardaron correctamente.")).toBeInTheDocument();
    expect(actualizarPerfil).toHaveBeenCalledWith({ ...PERFIL, nombre: "Ana María" });
  });

  it("valida el DNI antes de mandar", async () => {
    const usuario = userEvent.setup();
    renderModal();
    const dni = screen.getByLabelText("DNI *");
    await usuario.clear(dni);
    await usuario.type(dni, "12ab");
    await usuario.click(screen.getByRole("button", { name: "Guardar mis datos" }));
    expect(screen.getByText("El DNI debe tener 7 u 8 números.")).toBeInTheDocument();
    expect(actualizarMiPerfil).not.toHaveBeenCalled();
  });

  it("rechaza una foto que no es JPG/PNG sin mandar nada", async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    renderModal();
    const archivo = new File(["GIF89a"], "animada.gif", { type: "image/gif" });
    await usuario.upload(screen.getByLabelText("Elegir foto de perfil"), archivo);
    expect(await screen.findByText("La foto tiene que ser JPG o PNG.")).toBeInTheDocument();
    expect(actualizarMiPerfil).not.toHaveBeenCalled();
  });

  it("cambiar contraseña pide la actual y que la nueva coincida", async () => {
    const usuario = userEvent.setup();
    renderModal();
    await usuario.type(screen.getByLabelText("Nueva contraseña"), "nueva123");
    await usuario.type(screen.getByLabelText("Repetir nueva"), "otra123");
    await usuario.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(screen.getByText("Ingresá tu contraseña actual.")).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(cambiarMiContrasena).not.toHaveBeenCalled();
  });

  it("cambia la contraseña y muestra el error del backend si la actual es incorrecta", async () => {
    cambiarMiContrasena.mockRejectedValueOnce({ response: { status: 400, data: { error: "La contraseña actual no es correcta." } } });
    cambiarMiContrasena.mockResolvedValueOnce({ ok: true });
    const usuario = userEvent.setup();
    renderModal();

    await usuario.type(screen.getByLabelText("Contraseña actual"), "mal");
    await usuario.type(screen.getByLabelText("Nueva contraseña"), "nueva123");
    await usuario.type(screen.getByLabelText("Repetir nueva"), "nueva123");
    await usuario.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(await screen.findByText("La contraseña actual no es correcta.")).toBeInTheDocument();

    // El error queda adentro del mismo label, por eso el regex.
    const actual = screen.getByLabelText(/^Contraseña actual/);
    await usuario.clear(actual);
    await usuario.type(actual, "secreta1");
    // La nueva y su repetición quedaron cargadas del intento anterior.
    await usuario.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
    expect(cambiarMiContrasena).toHaveBeenLastCalledWith("secreta1", "nueva123");
    expect(await screen.findByText(/Contraseña actualizada/)).toBeInTheDocument();
  });
});
