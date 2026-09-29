import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { SesionProvider } from "../../lib/sesion";
import { CLAVE_AVISO_LOGIN, CLAVE_SESION } from "../../lib/sesionClaves";
import { iniciarSesion } from "../usuarios/usuarios.api";

vi.mock("../usuarios/usuarios.api", () => ({ iniciarSesion: vi.fn() }));

const RESPUESTA_OK = {
  token: "token-de-prueba",
  usuario: { id: 3, usuario: "ana.recepcion", nombre: "Ana", apellido: "Pérez", rol: "recepcionista", foto: null },
};

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <SesionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Panel de inicio</p>} />
        </Routes>
      </SesionProvider>
    </MemoryRouter>
  );
}

const campoUsuario = () => screen.getByPlaceholderText("usuario.sgh");
const campoContrasena = () => screen.getByPlaceholderText("••••••••");

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("LoginPage — mismo login de siempre, ahora validado de verdad", () => {
  it("sigue mostrando las tarjetas de perfil y los campos de usuario y contraseña", () => {
    renderLogin();
    for (const perfil of ["Administrador", "Recepcionista", "Housekeeping", "Encargado de Depósito", "Encargado de Compras", "Gerente"]) {
      expect(screen.getByRole("button", { name: new RegExp(perfil) })).toBeInTheDocument();
    }
    expect(campoUsuario()).toBeInTheDocument();
    expect(campoContrasena()).toHaveAttribute("type", "password");
  });

  it("pide elegir un perfil antes de consultar al backend", async () => {
    const usuario = userEvent.setup();
    renderLogin();
    await usuario.type(campoUsuario(), "ana.recepcion");
    await usuario.type(campoContrasena(), "secreta1");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(screen.getByText("Elegí un perfil para continuar.")).toBeInTheDocument();
    expect(iniciarSesion).not.toHaveBeenCalled();
  });

  it("pide usuario y contraseña antes de consultar al backend", async () => {
    const usuario = userEvent.setup();
    renderLogin();
    await usuario.click(screen.getByRole("button", { name: /Recepcionista/ }));
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(screen.getByText("Usuario y contraseña son obligatorios.")).toBeInTheDocument();
    expect(iniciarSesion).not.toHaveBeenCalled();
  });

  it("con credenciales correctas manda perfil + usuario + contraseña, guarda la sesión y entra", async () => {
    iniciarSesion.mockResolvedValue(RESPUESTA_OK);
    const usuario = userEvent.setup();
    renderLogin();

    await usuario.click(screen.getByRole("button", { name: /Recepcionista/ }));
    await usuario.type(campoUsuario(), " ana.recepcion ");
    await usuario.type(campoContrasena(), "secreta1");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Panel de inicio")).toBeInTheDocument();
    expect(iniciarSesion).toHaveBeenCalledWith("ana.recepcion", "secreta1", "recepcionista");
    const guardada = JSON.parse(sessionStorage.getItem(CLAVE_SESION));
    expect(guardada).toMatchObject({ rol: "recepcionista", usuario: "ana.recepcion", token: "token-de-prueba" });
    expect(guardada.perfil.nombre).toBe("Ana");
  });

  it("si el backend rechaza (contraseña mala o perfil equivocado), muestra su mensaje y limpia la contraseña", async () => {
    iniciarSesion.mockRejectedValue({
      response: { status: 403, data: { error: 'Tu usuario no tiene el perfil "Gerente". Elegí el perfil "Recepcionista" para entrar.' } },
    });
    const usuario = userEvent.setup();
    renderLogin();

    await usuario.click(screen.getByRole("button", { name: /Gerente/ }));
    await usuario.type(campoUsuario(), "ana.recepcion");
    await usuario.type(campoContrasena(), "secreta1");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText(/no tiene el perfil "Gerente"/)).toBeInTheDocument();
    expect(campoContrasena()).toHaveValue("");
    expect(sessionStorage.getItem(CLAVE_SESION)).toBeNull();
  });

  it("sin respuesta del servidor avisa que revise el backend", async () => {
    iniciarSesion.mockRejectedValue(new Error("Network Error"));
    const usuario = userEvent.setup();
    renderLogin();

    await usuario.click(screen.getByRole("button", { name: /Administrador/ }));
    await usuario.type(campoUsuario(), "admin");
    await usuario.type(campoContrasena(), "admin123");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
  });

  it("muestra el motivo si la sesión anterior se cerró sola (token vencido)", () => {
    sessionStorage.setItem(CLAVE_AVISO_LOGIN, "Tu sesión venció o no es válida. Volvé a iniciar sesión.");
    renderLogin();
    expect(screen.getByText("Tu sesión venció o no es válida. Volvé a iniciar sesión.")).toBeInTheDocument();
  });
});
