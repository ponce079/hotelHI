const fs = require("node:fs");
const path = require("node:path");
const { HOTEL } = require("./ecommerce.hotel");

// Se lee el archivo del frontend como TEXTO (no se importa el módulo: es ESM).
const config = fs.readFileSync(path.resolve(__dirname, "../../../../frontend/src/modulos/ecommerce/ecommerce.config.js"), "utf8");
const valorDe = (clave) => config.match(new RegExp(`${clave}: *"([^"]*)"`))?.[1];

test("los datos de contacto del backend coinciden con los de ecommerce.config.js del frontend", () => {
  for (const clave of ["nombre", "direccion", "telefono", "email", "checkIn", "checkOut"]) {
    expect(valorDe(clave)).toBeDefined();
    expect(HOTEL[clave]).toBe(valorDe(clave));
  }
});

test("no queda ningún dato sin completar", () => {
  expect(JSON.stringify(HOTEL)).not.toMatch(/COMPLETAR/);
  expect(config).not.toMatch(/\[COMPLETAR\]/);
});
