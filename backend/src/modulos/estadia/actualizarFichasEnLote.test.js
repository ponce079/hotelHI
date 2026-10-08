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

describe("regla 2.2: un dato distinto del que ya tiene la ficha", () => {
  const trozo = (sql, campo) => (sql.sql ?? "").split(`${campo} = CASE`)[1].split(" END")[0];

  test("sin la casilla (sobrescribir=false) el domicilio guardado se conserva: solo se completa si estaba vacío", async () => {
    const sql = await ejecutar([{ huespedId: 7, sobrescribir: false, datos: { domicilio: "Calle Nueva 456" } }]);
    // COALESCE(NULLIF(domicilio,''), nuevo, domicilio): primero lo que ya hay.
    expect(trozo(sql, "domicilio")).toMatch(/COALESCE\(NULLIF\(\s*domicilio\s*,\s*''\s*\)\s*,\s*\?\s*,\s*domicilio\s*\)/);
  });

  test("con la casilla (sobrescribir=true) el dato nuevo reemplaza al guardado", async () => {
    const sql = await ejecutar([{ huespedId: 7, sobrescribir: true, datos: { domicilio: "Calle Nueva 456" } }]);
    // COALESCE(nuevo, domicilio): primero lo nuevo.
    expect(trozo(sql, "domicilio")).toMatch(/COALESCE\(\s*\?\s*,\s*domicilio\s*\)/);
    expect(sql.values).toContain("Calle Nueva 456");
  });
});
