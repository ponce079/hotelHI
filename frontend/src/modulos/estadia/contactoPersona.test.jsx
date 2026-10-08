import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PersonaFormulario } from "./PersonaFormulario";

// La identificación por documento (consulta a la API) tiene sus propias pruebas; acá no se consulta nada.
vi.mock("../../lib/identificacion/useIdentificarPersona", () => ({
  useIdentificarPersona: () => ({ estado: "inactivo", clave: "", ficha: null, otrosDocumentos: [], buscarAhora: () => {}, puedeBuscar: false }),
}));
import { validarOcupante } from "./validarOcupante";
const reserva = {
  fechaDesde: "2026-10-01",
  fechaHasta: "2026-10-03",
  habitaciones: [{ id: 1, capacidad: 3, numero: "301" }],
};
const adulto = {
  id: 1,
  nombre: "Adulto",
  apellido: "Prueba",
  fechaNacimiento: "1990-01-01",
  email: "tutor@example.test",
  telefono: "123456",
};
const menor = {
  nombre: "Menor",
  apellido: "Prueba",
  fechaNacimiento: "2015-01-01",
  fechaDesde: reserva.fechaDesde,
  fechaHasta: reserva.fechaHasta,
  habitacionId: 1,
  responsableId: 1,
  vinculoResponsable: "Padre o madre",
};
test("titular exige nacimiento y 18 cumplidos, no 17", () => {
  expect(validarOcupante(menor, reserva, [], {}, {}, false, true).fechaNacimiento).toMatch(/18 años/);
  expect(
    validarOcupante({ ...menor, fechaNacimiento: "2008-10-01" }, reserva, [], {}, {}, false, true).fechaNacimiento,
  ).toBeUndefined();
});
test("contacto del responsable es opcional y copiarlo permite guardar al menor", () => {
  const guardar = vi.fn();
  render(
    <PersonaFormulario persona={menor} reserva={reserva} personas={[adulto]} onGuardar={guardar} onClose={() => {}} />,
  );
  const opcion = screen.getByRole("checkbox", {
    name: /Usar correo y teléfono/,
  });
  expect(opcion).not.toBeChecked();
  fireEvent.click(opcion);
  expect(screen.getByLabelText("Correo electrónico (opcional)")).toHaveValue(adulto.email);
  expect(screen.getByLabelText("Teléfono (opcional)")).toHaveValue(adulto.telefono);
  fireEvent.click(screen.getByRole("button", { name: "Guardar persona" }));
  expect(guardar).toHaveBeenCalledWith(
    expect.objectContaining({
      usarContactoResponsable: true,
      email: adulto.email,
      telefono: adulto.telefono,
    }),
  );
});
