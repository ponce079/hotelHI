// Regresión (encontrada midiendo con la base real): fechaNacimiento es una columna DATE y compararla con '' da el error
// 1292 "Incorrect date value" en MariaDB. Un check-in de una persona que VUELVE (ficha existente) fallaba con 500.
jest.mock("../../lib/prisma", () => ({}));
const { actualizarFichasEnLote } = require("./persona.servicio");

function ejecutar(filas) {
  const sentencias = [];
  const tx = { $executeRaw: jest.fn(async (sql) => { sentencias.push(sql); return filas.length; }) };
  return actualizarFichasEnLote(tx, filas).then(() => sentencias[0]);
}

test("el nacimiento se completa solo si la ficha no lo tiene, sin comparar la fecha con texto vacío", async () => {
  const sql = await ejecutar([{ huespedId: 7, datos: { fechaNacimiento: "1985-06-01", contacto: "a@b.com" } }]);
  const texto = sql.sql ?? sql.strings.join("?");
  const trozoFecha = texto.split("fechaNacimiento = CASE")[1].split("contacto = CASE")[0];
  expect(trozoFecha).toMatch(/COALESCE\(\s*fechaNacimiento\s*,/);
  expect(trozoFecha).not.toMatch(/NULLIF/);
  // El contacto (texto) sí puede estar vacío y se completa.
  expect(texto.split("contacto = CASE")[1]).toMatch(/NULLIF\(\s*contacto\s*,\s*''\s*\)/);
});

test("sin datos para completar no ejecuta nada", async () => {
  const tx = { $executeRaw: jest.fn() };
  await actualizarFichasEnLote(tx, [{ huespedId: 7, datos: {} }]);
  expect(tx.$executeRaw).not.toHaveBeenCalled();
});
