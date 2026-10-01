const fs = require("node:fs");
const path = require("node:path");
const { PAISES, codigoPais, nombrePais } = require("./paises");

const FILA = /\[\s*"([A-Z]{2})"\s*,\s*"([^"]+)"\s*\]/g;

function filasDelFrontend() {
  const ruta = path.resolve(__dirname, "../../../frontend/src/lib/paises.js");
  const texto = fs.readFileSync(ruta, "utf8");
  return [...texto.matchAll(FILA)].map(([, codigo, nombre]) => [codigo, nombre]);
}

test("la copia del frontend tiene los mismos códigos y nombres, en el mismo orden", () => {
  expect(filasDelFrontend()).toEqual(PAISES);
});

test("el catálogo tiene los 249 códigos ISO 3166-1 alfa-2, sin repetidos", () => {
  expect(PAISES).toHaveLength(249);
  expect(new Set(PAISES.map(([codigo]) => codigo)).size).toBe(249);
  expect(new Set(PAISES.map(([, nombre]) => nombre)).size).toBe(249);
});

test("codigoPais acepta el código o el nombre en español, sin importar tildes ni mayúsculas", () => {
  expect(codigoPais("ar")).toBe("AR");
  expect(codigoPais("Perú")).toBe("PE");
  expect(codigoPais(" estados unidos ")).toBe("US");
  expect(codigoPais("Bosnia y Herzegovina")).toBe("BA");
  expect(codigoPais("Narnia")).toBeNull();
  expect(codigoPais("")).toBeNull();
});

test("nombrePais devuelve el nombre en español", () => {
  expect(nombrePais("br")).toBe("Brasil");
  expect(nombrePais("ZZ")).toBeNull();
});
