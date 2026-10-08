// claveDocumento (identidad de Huesped = tipo + país + número NORMALIZADO).
jest.mock("../../lib/prisma", () => ({}));
const { claveDocumento, ErrorDocumento } = require("./persona.servicio");

const base = { tipoDocumento: "DNI", paisDocumento: "AR" };

describe("claveDocumento", () => {
  test("el mismo documento con otro formato da la misma identidad", () => {
    const a = claveDocumento({ ...base, numeroDocumento: "45.112.902" });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(claveDocumento({ ...base, numeroDocumento: "45112902" })).toBe(a);
    expect(claveDocumento({ ...base, numeroDocumento: " 45 112-902 " })).toBe(a);
  });

  test("distinto país o distinto número: identidades distintas", () => {
    const ar = claveDocumento({ ...base, numeroDocumento: "45112902" });
    expect(claveDocumento({ ...base, paisDocumento: "BR", numeroDocumento: "45112902" })).not.toBe(ar);
    expect(claveDocumento({ ...base, numeroDocumento: "45112903" })).not.toBe(ar);
  });

  test("un número que queda vacío al normalizar ('-', '.', '/') da un error de validación claro, nunca una identidad compartida", () => {
    for (const numero of ["-", ".", " - . ", "///"]) {
      expect(() => claveDocumento({ ...base, numeroDocumento: numero })).toThrow(ErrorDocumento);
    }
    try {
      claveDocumento({ ...base, numeroDocumento: "-" });
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("El número de documento tiene que tener letras o números.");
      expect(error.campos).toEqual({ numeroDocumento: error.message });
    }
  });

  test("sin tipo, país o número: null (sin documento no se deduce identidad)", () => {
    expect(claveDocumento({ tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "" })).toBeNull();
    expect(claveDocumento({ tipoDocumento: "DNI", paisDocumento: "", numeroDocumento: "123" })).toBeNull();
    expect(claveDocumento({ tipoDocumento: "", paisDocumento: "AR", numeroDocumento: "123" })).toBeNull();
  });
});

describe("normalizarPersona (ocupantes): documento sin letras ni números", () => {
  jest.mock("../../lib/prisma", () => ({}));
  const { normalizarPersona } = require("./estadia.servicio");
  const reserva = { fechaDesde: new Date("2026-09-20T00:00:00Z"), fechaHasta: new Date("2026-09-24T00:00:00Z") };
  const persona = (numeroDocumento) => ({ nombre: "Ana", apellido: "Prueba", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento });

  test("'-' o '.' → error de validación 400 en numeroDocumento", () => {
    for (const numero of ["-", ".", "  - "]) {
      expect(() => normalizarPersona(persona(numero), reserva)).toThrow(/letras o números/);
    }
    try {
      normalizarPersona(persona("-"), reserva);
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.campos).toEqual({ numeroDocumento: "El número de documento tiene que tener letras o números." });
    }
  });

  test("un número válido se guarda normalizado", () => {
    expect(normalizarPersona(persona("45.112.902"), reserva).numeroDocumento).toBe("45112902");
  });
});
