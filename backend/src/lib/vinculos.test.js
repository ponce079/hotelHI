const fs = require("node:fs");
const path = require("node:path");
const { VINCULOS_RESPONSABLE, VINCULOS_CON_AUTORIZACION, normalizarVinculo, requiereAutorizacion } = require("./vinculos");

// Lista de un `export const NOMBRE = [...]` del archivo del frontend.
function listaDelFrontend(nombre) {
  const texto = fs.readFileSync(path.resolve(__dirname, "../../../frontend/src/lib/vinculos.js"), "utf8");
  const inicio = texto.indexOf(`export const ${nombre} = [`);
  const bloque = texto.slice(inicio, texto.indexOf("]", inicio));
  return [...bloque.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("el catálogo de vínculos es el mismo en el backend y en el frontend", () => {
  expect(listaDelFrontend("VINCULOS_RESPONSABLE")).toEqual(VINCULOS_RESPONSABLE);
  expect(listaDelFrontend("VINCULOS_CON_AUTORIZACION")).toEqual(VINCULOS_CON_AUTORIZACION);
});

test("normaliza al valor del catálogo y rechaza lo que no está", () => {
  expect(normalizarVinculo("  padre o MADRE ")).toBe("Padre o madre");
  expect(normalizarVinculo("Abuelo")).toBeNull();
  expect(normalizarVinculo("")).toBeNull();
  expect(requiereAutorizacion("Otro familiar")).toBe(true);
  expect(requiereAutorizacion("Tutor legal")).toBe(false);
});
