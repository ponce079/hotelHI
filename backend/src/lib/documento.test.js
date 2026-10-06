const { normalizarNumeroDocumento, documentosCoinciden, claveNombre } = require("./documento");

test("el número de documento se compara sin puntos, guiones ni espacios", () => {
  expect(normalizarNumeroDocumento("45.112.902")).toBe("45112902");
  expect(normalizarNumeroDocumento(" 45 112-902 ")).toBe("45112902");
  expect(normalizarNumeroDocumento("ab-123")).toBe("AB123");
  expect(normalizarNumeroDocumento(null)).toBe("");
  expect(normalizarNumeroDocumento(undefined)).toBe("");
});

test("documentosCoinciden no considera iguales dos vacíos", () => {
  expect(documentosCoinciden("45.112.902", "45112902")).toBe(true);
  expect(documentosCoinciden("", "")).toBe(false);
  expect(documentosCoinciden("1", "2")).toBe(false);
});

test("claveNombre ignora tildes, mayúsculas y espacios repetidos", () => {
  expect(claveNombre("  José   PÉREZ ")).toBe(claveNombre("jose perez"));
  expect(claveNombre("Ana Gómez")).not.toBe(claveNombre("Ana Gomes"));
});
