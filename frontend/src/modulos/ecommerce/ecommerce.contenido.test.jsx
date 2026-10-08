// Contenido y datos del hotel del sitio web (proyecto académico: datos ficticios).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../../App";
import { HOTEL } from "./ecommerce.config";
import { CONTENIDO_TIPOS, contenidoDeTipo } from "./ecommerce.contenido";

vi.mock("../../lib/sesion", () => ({ useSesion: () => ({ rol: null }) }));

describe("contenido de los tipos y datos del hotel", () => {
  it("ningún texto queda sin completar", () => {
    expect(JSON.stringify(HOTEL)).not.toMatch(/COMPLETAR/);
    for (const nombre of [...Object.keys(CONTENIDO_TIPOS), "Otro tipo sin contenido"]) {
      const { descripcion, descripcionAmpliada } = contenidoDeTipo(nombre);
      expect(`${descripcion} ${descripcionAmpliada}`).not.toMatch(/COMPLETAR/);
    }
  });

  it("la Doble dice que admite hasta 3 personas y no menciona escritorio", () => {
    const { descripcion, descripcionAmpliada, comodidades } = CONTENIDO_TIPOS.Doble;
    expect(descripcion).toContain("hasta 3 personas");
    expect(descripcionAmpliada).toContain("hasta tres personas");
    expect(descripcionAmpliada).not.toMatch(/escritorio|cuatro/i);
    expect(comodidades.map((c) => c.nombre)).not.toContain("Escritorio");
  });

  it("el pie del sitio muestra los datos de contacto y la leyenda de sitio de demostración", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/web"]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText("Sitio de demostración · Proyecto académico de Sistemas III. Los datos de contacto son ficticios.")).toBeInTheDocument();
    expect(screen.getAllByText(HOTEL.direccion).length).toBeGreaterThan(0);
    expect(screen.getAllByText(HOTEL.telefono).length).toBeGreaterThan(0);
    expect(screen.getAllByText(HOTEL.email).length).toBeGreaterThan(0);
  });
});
