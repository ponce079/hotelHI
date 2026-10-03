import { expect, it } from "vitest";
import { titularRegistrado } from "./titularRegistrado";
import { validarOcupante } from "./validarOcupante";

const huesped = { id: 9, tipoDocumento: "DNI", numeroDocumento: "12345678" };
const persona = {
  id: 20,
  nombre: "Ana",
  apellido: "Prueba",
  tipoDocumento: "DNI",
  numeroDocumento: "12345678",
  paisDocumento: "AR",
  email: "ana@example.com",
  estado: "Previsto",
  fechaDesde: "2026-10-01",
  fechaHasta: "2026-10-03",
  asignaciones: [{ habitacionId: 10, hasta: null }],
};
it("vincula una única persona por documento aunque los IDs de huésped y ocupante difieran", () => {
  expect(titularRegistrado([persona], huesped)).toBe(persona);
  expect(titularRegistrado([{ ...persona, numeroDocumento: "OTRO" }], huesped)).toBe(null);
});
it("no deduce identidad por nombre, correo, documento vacío ni coincidencias ambiguas", () => {
  expect(titularRegistrado([{ id: 9, nombre: "Ana" }], { id: 9, nombre: "Ana" })).toBe(null);
  expect(titularRegistrado([persona, { ...persona, id: 21, paisDocumento: "UY" }], huesped)).toBe(null);
});
it("conserva el vínculo devuelto por el backend después de corregir el documento", () => {
  const corregida = { ...persona, numeroDocumento: "87654321" };
  expect(titularRegistrado([corregida], huesped, 20)).toBe(corregida);
});
it("editar al titular excluye su propio documento, correo y plaza; un acompañante ocupa la segunda", () => {
  const reserva = {
    fechaDesde: persona.fechaDesde,
    fechaHasta: persona.fechaHasta,
    habitaciones: [{ id: 10, numero: "301", capacidad: 2 }],
  };
  const form = { ...persona, habitacionId: 10 };
  expect(validarOcupante(form, reserva, [persona], persona)).toEqual({});
  const otro = { ...form, nombre: "Luis", numeroDocumento: "87654321", email: "luis@example.com" };
  expect(validarOcupante(otro, reserva, [persona], {})).toEqual({});
  expect(validarOcupante(form, reserva, [persona], {})).toMatchObject({
    numeroDocumento: expect.any(String),
    email: expect.any(String),
  });
  expect(
    validarOcupante(
      { ...otro, numeroDocumento: "87654322", email: "otro@example.com" },
      reserva,
      [persona, { ...otro, id: 21 }],
      {},
    ),
  ).toMatchObject({ habitacionId: expect.any(String) });
});
