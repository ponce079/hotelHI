import { describe, expect, it } from "vitest";
import { lineasDeCierre } from "./CierrePrevio";

const base = { regla: "SIN_CARGO", monto: 0, retenido: 0, devuelto: 0, aCobrarATarjeta: 0, sinCobrar: 0, tarjeta: null, estadoCobro: "SIN_CARGO" };

describe("lineasDeCierre", () => {
  it("sin cargo y sin devolución", () => {
    expect(lineasDeCierre(base)).toEqual(["Sin cargo: no se cobra ni se devuelve nada."]);
  });
  it("sin cargo con prepago: devuelve todo", () => {
    expect(lineasDeCierre({ ...base, devuelto: 30000 })[0]).toMatch(/Se devuelven \$\s?30\.000 de lo ya pagado\./);
  });
  it("cobro a la tarjeta guardada", () => {
    const l = lineasDeCierre({
      ...base,
      regla: "PRIMERA_NOCHE",
      monto: 50000,
      aCobrarATarjeta: 50000,
      estadoCobro: "COBRADO",
      tarjeta: { marca: "Visa", ultimos4: "4242" },
    });
    expect(l.join(" ")).toMatch(/primera noche.*Se cobran \$\s?50\.000 a Visa \*\*\*\*4242/);
  });
  it("nunca menciona un número de tarjeta completo (solo marca y últimos 4)", () => {
    const l = lineasDeCierre({ ...base, monto: 1000, aCobrarATarjeta: 1000, estadoCobro: "COBRADO", tarjeta: { marca: "Visa", ultimos4: "4242" } });
    expect(l.join(" ")).not.toMatch(/\d{5,}/);
  });
});
