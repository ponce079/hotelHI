import { describe, expect, it } from "vitest";
import { formatearNombrePropio } from "./nombres";

describe("formatearNombrePropio", () => {
  it.each([
    ["maria cruz", "Maria Cruz"],
    ["juan de la vega", "Juan de la Vega"],
    ["  JUAN   DE   LOS  SANTOS ", "Juan de los Santos"],
    ["de la vega", "De la Vega"],
    ["maría josé", "María José"],
    ["ludwig van beethoven", "Ludwig van Beethoven"],
    ["ana y pedro", "Ana y Pedro"],
    ["maria-jose o'connor", "Maria-Jose O'Connor"],
    ["", ""],
  ])("%s → %s", (entrada, esperado) => {
    expect(formatearNombrePropio(entrada)).toBe(esperado);
  });
});
