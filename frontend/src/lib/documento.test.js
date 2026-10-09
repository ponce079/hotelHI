import { describe, expect, it } from "vitest";
import { documentoEnmascarado, enmascararNumeroDocumento } from "./documento";

describe("enmascararNumeroDocumento", () => {
  it("deja solo los últimos 4 caracteres", () => {
    expect(enmascararNumeroDocumento("30124127")).toBe("•••• 4127");
    expect(enmascararNumeroDocumento("AB1234567")).toBe("•••• 4567");
  });
  it("con 4 o menos caracteres no revela nada", () => {
    expect(enmascararNumeroDocumento("4127")).toBe("••••");
    expect(enmascararNumeroDocumento("12")).toBe("••••");
  });
  it("vacío o nulo da texto vacío", () => {
    expect(enmascararNumeroDocumento(null)).toBe("");
    expect(enmascararNumeroDocumento("")).toBe("");
  });
});

describe("documentoEnmascarado", () => {
  it("antepone el tipo", () => {
    expect(documentoEnmascarado("DNI", "30124127")).toBe("DNI •••• 4127");
    expect(documentoEnmascarado(undefined, "30124127")).toBe("•••• 4127");
  });
});
