import { describe, expect, it } from "vitest";
import { yaDentroDelPlazoConCargo } from "./plazoCancelacion";

// Llegada el 10/10 a las 14:00 en Argentina = 17:00 UTC. Con 48 h de plazo, el límite es el 8/10 a las 17:00 UTC.
const ahora = (iso) => Date.parse(iso);

describe("aviso 'ya dentro del plazo con cargo' (plan flexible)", () => {
  it("con más de 48 h de anticipación no avisa", () => {
    expect(yaDentroDelPlazoConCargo("2026-10-10", 48, ahora("2026-10-08T16:59:00Z"))).toBe(false);
  });
  it("a menos de 48 h de la llegada sí avisa (cancelarla cobra la primera noche)", () => {
    expect(yaDentroDelPlazoConCargo("2026-10-10", 48, ahora("2026-10-08T17:00:00Z"))).toBe(true);
    expect(yaDentroDelPlazoConCargo("2026-10-10", 48, ahora("2026-10-09T10:00:00Z"))).toBe(true);
  });
  it("sin fecha o sin horas de plazo (no reembolsable) no avisa", () => {
    expect(yaDentroDelPlazoConCargo("", 48, ahora("2026-10-09T10:00:00Z"))).toBe(false);
    expect(yaDentroDelPlazoConCargo("2026-10-10", null, ahora("2026-10-09T10:00:00Z"))).toBe(false);
  });
});
