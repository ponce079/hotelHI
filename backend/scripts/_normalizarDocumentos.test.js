jest.mock("../src/lib/prisma", () => ({}));
const { planificar } = require("./_normalizarDocumentos");
const { claveDocumento } = require("../src/modulos/estadia/persona.servicio");

const ficha = (id, numero, extra = {}) => ({
  id,
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: numero,
  identidadDocumento: claveDocumento({ tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: numero }),
  ...extra,
});

test("normaliza el número y recalcula la identidad", () => {
  const plan = planificar({ huespedes: [ficha(1, "45.112.902")], ocupantes: [] });
  expect(plan.fichasACorregir).toEqual([
    {
      id: 1,
      numeroDocumento: "45112902",
      identidadDocumento: claveDocumento({ tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "45112902" }),
    },
  ]);
  expect(plan.fusiones).toEqual([]);
});

test("unifica en la ficha de menor id las que pasan a ser el mismo documento", () => {
  const plan = planificar({
    huespedes: [ficha(9, "45112902"), ficha(3, "45.112.902"), ficha(5, "45 112 902")],
    ocupantes: [],
  });
  expect(plan.fusiones).toEqual([{ principalId: 3, duplicadosIds: [5, 9] }]);
  expect(plan.fichasACorregir.map((f) => f.id)).toEqual([3]);
});

test("una ficha ya normalizada no genera cambios", () => {
  const plan = planificar({ huespedes: [ficha(1, "45112902")], ocupantes: [] });
  expect(plan.fichasACorregir).toEqual([]);
});

test("documentos de países distintos no se unifican", () => {
  const otra = { ...ficha(2, "45112902"), paisDocumento: "BR", identidadDocumento: "x" };
  const plan = planificar({ huespedes: [ficha(1, "45112902"), otra], ocupantes: [] });
  expect(plan.fusiones).toEqual([]);
});

test("dos ocupantes alojados con el mismo documento son un conflicto y no se tocan", () => {
  const ocupante = (id, numero) => ({
    id,
    tipoDocumento: "DNI",
    paisDocumento: "AR",
    numeroDocumento: numero,
    identidadActiva: "viejo" + id,
  });
  const plan = planificar({ huespedes: [], ocupantes: [ocupante(1, "45.112.902"), ocupante(2, "45112902")] });
  expect(plan.conflictos).toHaveLength(1);
  expect(plan.ocupantesACorregir.map((o) => o.id)).toEqual([1]);
});

describe("fichas viejas sin país", () => {
  const sinPais = (id, numero, nombre) => ({
    id,
    nombre,
    tipoDocumento: "DNI",
    paisDocumento: null,
    numeroDocumento: numero,
    identidadDocumento: null,
  });

  test("dos fichas sin país, mismo tipo, número y nombre: se unifican en la de menor id y ganan país", () => {
    const plan = planificar({
      huespedes: [sinPais(6, "22222222", "Ana Pérez"), sinPais(5, "22222222", "ana  perez")],
      ocupantes: [],
    });
    expect(plan.fusiones).toEqual([{ principalId: 5, duplicadosIds: [6] }]);
    expect(plan.nombresDistintos).toEqual([]);
  });

  test("mismo documento con nombres distintos: no se unifica, se informa", () => {
    const plan = planificar({
      huespedes: [sinPais(8, "33333333", "Luis Gómez"), sinPais(9, "33333333", "Marta Díaz")],
      ocupantes: [],
    });
    expect(plan.fusiones).toEqual([]);
    expect(plan.nombresDistintos).toEqual([
      {
        documento: "33333333",
        fichas: [
          { id: 8, nombre: "Luis Gómez" },
          { id: 9, nombre: "Marta Díaz" },
        ],
      },
    ]);
  });

  test("una ficha sin país se une a la que tiene país (única) y gana su identidad", () => {
    const conPais = { ...sinPais(7, "44444444", "Eva Ruiz"), paisDocumento: "AR" };
    const plan = planificar({ huespedes: [sinPais(3, "44.444.444", "Eva Ruiz"), conPais], ocupantes: [] });
    expect(plan.fusiones).toEqual([{ principalId: 7, duplicadosIds: [3] }]);
  });

  test("con dos países posibles, la ficha sin país no se une a ninguna", () => {
    const ar = { ...sinPais(1, "55555555", "Eva Ruiz"), paisDocumento: "AR" };
    const br = { ...sinPais(2, "55555555", "Eva Ruiz"), paisDocumento: "BR" };
    const plan = planificar({ huespedes: [ar, br, sinPais(3, "55555555", "Eva Ruiz")], ocupantes: [] });
    expect(plan.fusiones).toEqual([]);
  });
});
