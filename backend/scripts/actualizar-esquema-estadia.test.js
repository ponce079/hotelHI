const fs = require("node:fs");
const path = require("node:path");
const { operaciones, pendientes } = require("./actualizar-esquema-estadia");
const sql = fs.readFileSync(path.resolve(__dirname, "../prisma/estadia-ocupantes-cargos.sql"), "utf8");
test("la actualización preserva los decimales y no reintroduce precios antiguos de habitación", () => {
  const pasos = operaciones(sql);
  expect(pasos).toHaveLength(32);
  expect(pasos.filter((p) => p.tipo === "tabla")).toHaveLength(3);
  expect(pasos.some((p) => p.tabla === "reservas_habitaciones")).toBe(false);
  expect(pasos.find((p) => p.nombre === "precioUnitario").sql).toContain("DECIMAL(12, 2) NULL");
  expect(() => operaciones("DROP TABLE reservas;")).toThrow(/no aditiva/);
});
test("una base actualizada no requiere cambios y una actualización parcial solo agrega faltantes", async () => {
  const pasos = operaciones(sql);
  const tablas = [...new Set(pasos.map((p) => p.tabla))].map((nombre) => ({ nombre }));
  const filas = (tipo) => pasos.filter((p) => p.tipo === tipo).map((p) => ({ tabla: p.tabla, nombre: p.nombre }));
  let columnas = filas("columna");
  const conn = {
    query: jest.fn(async (q) =>
      q.includes("information_schema.TABLES")
        ? tablas
        : q.includes("information_schema.COLUMNS")
          ? columnas
          : q.includes("information_schema.STATISTICS")
            ? filas("indice")
            : filas("relacion"),
    ),
  };
  expect(await pendientes(conn, pasos)).toEqual([]);
  columnas = columnas.filter((c) => c.nombre !== "precioUnitario");
  expect(await pendientes(conn, pasos)).toEqual([
    expect.objectContaining({ tipo: "columna", nombre: "precioUnitario" }),
  ]);
});
test("rechaza una base sin las tablas originales del proyecto", async () => {
  await expect(pendientes({ query: async () => [] }, operaciones(sql))).rejects.toThrow(/Falta la tabla base/);
});

test("nombres y apellido del huésped y vínculo del responsable entran como columnas aditivas", () => {
  const columnas = operaciones(sql)
    .filter((p) => p.tipo === "columna")
    .map((p) => `${p.tabla}.${p.nombre}`);
  expect(columnas).toEqual(
    expect.arrayContaining([
      "huespedes.nombres",
      "huespedes.apellido",
      "ocupantes_reserva.vinculoResponsable",
      "ocupantes_reserva.autorizacionPresentada",
    ]),
  );
  expect(operaciones(sql).find((p) => p.nombre === "autorizacionPresentada").sql).toContain("NOT NULL DEFAULT false");
});
