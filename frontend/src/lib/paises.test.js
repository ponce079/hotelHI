import { describe, expect, it } from "vitest";
import { PAISES, codigoPais, nombrePais } from "./paises";

describe("catálogo de países", () => {
  it("tiene los 249 códigos ISO 3166-1 alfa-2, sin repetidos", () => {
    expect(PAISES).toHaveLength(249);
    expect(new Set(PAISES.map(([codigo]) => codigo)).size).toBe(249);
  });

  it("resuelve códigos y nombres en español", () => {
    expect(codigoPais("ar")).toBe("AR");
    expect(codigoPais("Perú")).toBe("PE");
    expect(codigoPais("Narnia")).toBeNull();
    expect(nombrePais("br")).toBe("Brasil");
  });
});
