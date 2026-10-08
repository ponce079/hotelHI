import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UsuariosPage } from "./UsuariosPage";
import { useSesion, ROLES } from "../../lib/sesion";
import { cambiarActivoUsuario, crearUsuario, listarUsuarios, restablecerContrasenaUsuario } from "./usuarios.api";

vi.mock("../../lib/sesion", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, useSesion: vi.fn() };
});

vi.mock("./usuarios.api", () => ({
  listarUsuarios: vi.fn(),
  crearUsuario: vi.fn(),
  actualizarUsuario: vi.fn(),
  cambiarActivoUsuario: vi.fn(),
  desbloquearUsuario: vi.fn(),
  restablecerContrasenaUsuario: vi.fn(),
}));

const ADMIN = {
  id: 1,
  usuario: "admin",
  nombre: "Administrador",
  apellido: "General",
  dni: "00000000",
  email: null,
  rol: "admin",
  foto: null,
  activo: true,
  bloqueado: false,
  ultimoIngreso: "2026-09-27T12:00:00.000Z",
};

const ANA = {
  id: 2,
  usuario: "ana.recepcion",
  nombre: "Ana",
  apellido: "Pérez",
  dni: "30111222",
  email: "ana@mail.com",
  rol: "recepcionista",
  foto: null,
  activo: true,
  bloqueado: true,
  ultimoIngreso: null,
};

const LUIS = { ...ANA, id: 3, usuario: "luis.hk", nombre: "Luis", apellido: "Gómez", dni: "28999111", rol: "housekeeping", activo: false, bloqueado: false };

function sesionDe(rol) {
  return {
    rol,
    usuario: rol === "admin" ? "admin" : "ana.recepcion",
    perfil: rol === "admin" ? ADMIN : ANA,
    actualizarPerfil: vi.fn(),
    puede: (accion) => (accion === "gestionarUsuarios" ? rol === "admin" : true),
  };
}

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UsuariosPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSesion.mockReturnValue(sesionDe("admin"));
  listarUsuarios.mockResolvedValue([ADMIN, ANA, LUIS]);
});

describe("UsuariosPage — gestión de usuarios (solo admin)", () => {
  it("un rol que no es admin ve 'sin permiso' y no se consulta la lista", () => {
    useSesion.mockReturnValue(sesionDe("recepcionista"));
    renderPagina();
    expect(screen.getByText("No tenés permiso para ver esta pantalla")).toBeInTheDocument();
    expect(listarUsuarios).not.toHaveBeenCalled();
  });

  it("lista los usuarios con su rol, estado y DNI formateado", async () => {
    renderPagina();
    const filaAna = (await screen.findByText("Ana Pérez")).closest("tr");
    expect(within(filaAna).getByText("Recepcionista")).toBeInTheDocument();
    expect(within(filaAna).getByText("Bloqueado")).toBeInTheDocument();
    expect(within(filaAna).getByText("30.111.222")).toBeInTheDocument();
    const filaLuis = screen.getByText("Luis Gómez").closest("tr");
    expect(within(filaLuis).getByText("Inactivo")).toBeInTheDocument();
    expect(within(screen.getByText("Administrador General").closest("tr")).getByText("(vos)")).toBeInTheDocument();
  });

  it("busca por nombre, usuario o DNI", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    await screen.findByText("Ana Pérez");
    await usuario.type(screen.getByLabelText("Buscar usuarios"), "28999");
    expect(screen.getByText("Luis Gómez")).toBeInTheDocument();
    expect(screen.queryByText("Ana Pérez")).not.toBeInTheDocument();
  });

  it("las tarjetas filtran por estado (bloqueados)", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    await screen.findByText("Ana Pérez");
    await usuario.click(screen.getByRole("button", { name: /Bloqueados/ }));
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Luis Gómez")).not.toBeInTheDocument();
  });

  it("el alta valida antes de mandar: rol obligatorio y contraseñas iguales", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    await screen.findByText("Ana Pérez");
    await usuario.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await usuario.type(screen.getByLabelText("Usuario (para iniciar sesión) *"), "tomi");
    await usuario.type(screen.getByLabelText("Nombre *"), "Tomás");
    await usuario.type(screen.getByLabelText("Apellido *"), "Gudiño");
    await usuario.type(screen.getByLabelText("DNI *"), "40123456");
    await usuario.type(screen.getByLabelText("Contraseña *"), "secreta-prueba-01");
    await usuario.type(screen.getByLabelText("Repetir contraseña *"), "otra");
    await usuario.click(screen.getByRole("button", { name: "Crear usuario" }));
    expect(screen.getByText("Elegí el rol del usuario.")).toBeInTheDocument();
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeInTheDocument();
    expect(crearUsuario).not.toHaveBeenCalled();
  });

  it("el rol se elige de un desplegable con los roles del sistema y el alta manda los datos limpios", async () => {
    crearUsuario.mockResolvedValue({ ...ANA, id: 9, usuario: "tomi.recepcion" });
    const usuario = userEvent.setup();
    renderPagina();
    await screen.findByText("Ana Pérez");
    await usuario.click(screen.getByRole("button", { name: "Nuevo usuario" }));

    const desplegable = screen.getByLabelText("Rol *");
    expect(within(desplegable).getAllByRole("option").map((o) => o.value)).toEqual(["", ...Object.keys(ROLES)]);

    await usuario.type(screen.getByLabelText("Usuario (para iniciar sesión) *"), "Tomi Recepcion");
    await usuario.selectOptions(desplegable, "recepcionista");
    await usuario.type(screen.getByLabelText("Nombre *"), " Tomás ");
    await usuario.type(screen.getByLabelText("Apellido *"), "Gudiño");
    await usuario.type(screen.getByLabelText("DNI *"), "40.123.456");
    await usuario.type(screen.getByLabelText("Contraseña *"), "secreta-prueba-01");
    await usuario.type(screen.getByLabelText("Repetir contraseña *"), "secreta-prueba-01");
    await usuario.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(crearUsuario).toHaveBeenCalledWith({
      usuario: "tomirecepcion",
      nombre: "Tomás",
      apellido: "Gudiño",
      dni: "40123456",
      email: "",
      rol: "recepcionista",
      contrasena: "secreta-prueba-01",
    });
    expect(await screen.findByText(/creado\. Ya puede iniciar sesión/)).toBeInTheDocument();
  });

  it("un usuario duplicado muestra el error del backend en el campo", async () => {
    crearUsuario.mockRejectedValue({ response: { status: 409, data: { error: "Ese nombre de usuario ya está en uso." } } });
    const usuario = userEvent.setup();
    renderPagina();
    await screen.findByText("Ana Pérez");
    await usuario.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await usuario.type(screen.getByLabelText("Usuario (para iniciar sesión) *"), "admin");
    await usuario.selectOptions(screen.getByLabelText("Rol *"), "gerente");
    await usuario.type(screen.getByLabelText("Nombre *"), "Otro");
    await usuario.type(screen.getByLabelText("Apellido *"), "Admin");
    await usuario.type(screen.getByLabelText("DNI *"), "12345678");
    await usuario.type(screen.getByLabelText("Contraseña *"), "secreta-prueba-01");
    await usuario.type(screen.getByLabelText("Repetir contraseña *"), "secreta-prueba-01");
    await usuario.click(screen.getByRole("button", { name: "Crear usuario" }));
    expect(await screen.findByText("Ese nombre de usuario ya está en uso.")).toBeInTheDocument();
  });

  it("al editarse a sí mismo, el admin no puede cambiar su propio rol", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    const filaAdmin = (await screen.findByText("Administrador General")).closest("tr");
    await usuario.click(within(filaAdmin).getByRole("button", { name: "Editar" }));
    expect(screen.getByLabelText("Rol *")).toBeDisabled();
    expect(screen.getByLabelText("Usuario (para iniciar sesión) *")).toBeDisabled();
  });

  it("no se ofrece desactivar al propio usuario; sí a los demás, con confirmación", async () => {
    cambiarActivoUsuario.mockResolvedValue({ ...ANA, activo: false });
    const usuario = userEvent.setup();
    renderPagina();

    const filaAdmin = (await screen.findByText("Administrador General")).closest("tr");
    await usuario.click(within(filaAdmin).getByRole("button", { name: "Más acciones" }));
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
    await usuario.click(within(filaAdmin).getByRole("button", { name: "Más acciones" }));

    const filaAna = screen.getByText("Ana Pérez").closest("tr");
    await usuario.click(within(filaAna).getByRole("button", { name: "Más acciones" }));
    await usuario.click(screen.getByRole("button", { name: "Desactivar" }));
    await usuario.click(screen.getByRole("button", { name: "Sí, desactivar" }));
    expect(cambiarActivoUsuario).toHaveBeenCalledWith(2, false);
    expect(await screen.findByText("ana.recepcion desactivado.")).toBeInTheDocument();
  });

  it("restablecer contraseña pide la nueva dos veces", async () => {
    restablecerContrasenaUsuario.mockResolvedValue({ ...ANA, bloqueado: false });
    const usuario = userEvent.setup();
    renderPagina();
    const filaAna = (await screen.findByText("Ana Pérez")).closest("tr");
    await usuario.click(within(filaAna).getByRole("button", { name: "Más acciones" }));
    await usuario.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
    await usuario.type(screen.getByLabelText("Nueva contraseña *"), "nueva-prueba-0123");
    await usuario.type(screen.getByLabelText("Repetir contraseña *"), "nueva-prueba-0123");
    await usuario.click(screen.getByRole("button", { name: "Restablecer" }));
    expect(restablecerContrasenaUsuario).toHaveBeenCalledWith(2, "nueva-prueba-0123");
    expect(await screen.findByText("Contraseña de ana.recepcion restablecida.")).toBeInTheDocument();
  });
});

describe("UsuariosPage — contraseña inicial (sin contraseñas por defecto)", () => {
  it("el alta no precarga ninguna contraseña y exige al menos 10 caracteres", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    await screen.findByText("Ana Pérez");
    await usuario.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    expect(screen.getByLabelText("Contraseña *")).toHaveValue("");
    expect(screen.getByLabelText("Contraseña *")).toHaveAttribute("placeholder", "Mínimo 10 caracteres");
    await usuario.type(screen.getByLabelText("Usuario (para iniciar sesión) *"), "tomi");
    await usuario.type(screen.getByLabelText("Nombre *"), "Tomás");
    await usuario.type(screen.getByLabelText("Apellido *"), "Gudiño");
    await usuario.type(screen.getByLabelText("DNI *"), "40123456");
    await usuario.type(screen.getByLabelText("Contraseña *"), "corta1234");
    await usuario.type(screen.getByLabelText("Repetir contraseña *"), "corta1234");
    await usuario.click(screen.getByRole("button", { name: "Crear usuario" }));
    expect(await screen.findByText("Mínimo 10 caracteres.")).toBeInTheDocument();
    expect(crearUsuario).not.toHaveBeenCalled();
  });

  it("restablecer tampoco precarga ninguna y pide al menos 10 caracteres", async () => {
    const usuario = userEvent.setup();
    renderPagina();
    const filaAna = (await screen.findByText("Ana Pérez")).closest("tr");
    await usuario.click(within(filaAna).getByRole("button", { name: "Más acciones" }));
    await usuario.click(screen.getByRole("button", { name: "Restablecer contraseña" }));
    expect(screen.getByLabelText("Nueva contraseña *")).toHaveValue("");
    await usuario.type(screen.getByLabelText("Nueva contraseña *"), "nueva123");
    await usuario.type(screen.getByLabelText("Repetir contraseña *"), "nueva123");
    await usuario.click(screen.getByRole("button", { name: "Restablecer" }));
    expect(await screen.findByText("Mínimo 10 caracteres.")).toBeInTheDocument();
    expect(restablecerContrasenaUsuario).not.toHaveBeenCalled();
  });
});
