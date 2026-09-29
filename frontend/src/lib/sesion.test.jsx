import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SesionProvider, useSesion } from "./sesion";
import { CLAVE_AVISO_LOGIN, CLAVE_SESION, EVENTO_SESION_VENCIDA } from "./sesionClaves";
import { api } from "./api";

function MostrarSesion() {
  const { rol, usuario, perfil, puede } = useSesion();
  return (
    <div>
      <span data-testid="rol">{rol ?? "sin sesión"}</span>
      <span data-testid="usuario">{usuario ?? ""}</span>
      <span data-testid="nombre">{perfil?.nombre ?? ""}</span>
      <span data-testid="usuarios">{puede("gestionarUsuarios") ? "gestiona usuarios" : "no gestiona usuarios"}</span>
    </div>
  );
}

function renderSesion() {
  return render(
    <SesionProvider>
      <MostrarSesion />
    </SesionProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe("sesion.jsx — Usuarios y Seguridad", () => {
  it("recupera una sesión guardada con token", () => {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ rol: "admin", usuario: "admin", token: "t", perfil: { nombre: "Ana" } }));
    renderSesion();
    expect(screen.getByTestId("rol")).toHaveTextContent("admin");
    expect(screen.getByTestId("nombre")).toHaveTextContent("Ana");
    expect(screen.getByTestId("usuarios")).toHaveTextContent("gestiona usuarios");
  });

  it("descarta una sesión del login simulado anterior (sin token): hay que entrar de nuevo", () => {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ rol: "admin", usuario: "tomi" }));
    renderSesion();
    expect(screen.getByTestId("rol")).toHaveTextContent("sin sesión");
  });

  it("solo el admin gestiona usuarios", () => {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ rol: "recepcionista", usuario: "ana", token: "t" }));
    renderSesion();
    expect(screen.getByTestId("usuarios")).toHaveTextContent("no gestiona usuarios");
  });

  it("si el backend avisa que la sesión venció, la cierra y deja el motivo para el login", () => {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ rol: "admin", usuario: "admin", token: "t" }));
    renderSesion();
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_SESION_VENCIDA, { detail: "Tu usuario ya no está activo." }));
    });
    expect(screen.getByTestId("rol")).toHaveTextContent("sin sesión");
    expect(sessionStorage.getItem(CLAVE_SESION)).toBeNull();
    expect(sessionStorage.getItem(CLAVE_AVISO_LOGIN)).toBe("Tu usuario ya no está activo.");
  });
});

describe("api.js — token en cada pedido", () => {
  it("agrega Authorization: Bearer <token> si hay sesión, y nada si no hay", async () => {
    const adaptadorOriginal = api.defaults.adapter;
    api.defaults.adapter = async (config) => ({
      data: config.headers.Authorization ?? null,
      status: 200,
      statusText: "OK",
      headers: {},
      config,
    });
    try {
      expect((await api.get("/algo")).data).toBeNull();
      sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ rol: "admin", usuario: "admin", token: "abc.def" }));
      expect((await api.get("/algo")).data).toBe("Bearer abc.def");
    } finally {
      api.defaults.adapter = adaptadorOriginal;
    }
  });

  it("un 401 con código SESION_INVALIDA dispara el aviso de sesión vencida", async () => {
    const adaptadorOriginal = api.defaults.adapter;
    api.defaults.adapter = async (config) =>
      Promise.reject(
        Object.assign(new Error("401"), {
          config,
          response: { status: 401, data: { error: "Tu sesión venció.", codigo: "SESION_INVALIDA" } },
        })
      );
    let recibido = null;
    const escuchar = (evento) => {
      recibido = evento.detail;
    };
    window.addEventListener(EVENTO_SESION_VENCIDA, escuchar);
    try {
      await expect(api.get("/usuarios")).rejects.toBeTruthy();
      expect(recibido).toBe("Tu sesión venció.");
    } finally {
      window.removeEventListener(EVENTO_SESION_VENCIDA, escuchar);
      api.defaults.adapter = adaptadorOriginal;
    }
  });
});
