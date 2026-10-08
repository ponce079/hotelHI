jest.mock("../src/lib/prisma", () => ({}));
const { planificar, describirRevisarAMano } = require("./_normalizarDocumentos");
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

// Simula lo que hace la transacción de normalizar-documentos.js con el plan (fusiones y luego correcciones)
// y devuelve las identidades finales. Si dos fichas terminaran con la misma identidad, la base real
// abortaría toda la transacción por P2002 (índice único de identidadDocumento).
function identidadesTrasAplicar(huespedes, plan) {
  const borradas = new Set(plan.fusiones.flatMap((f) => f.duplicadosIds));
  const finales = new Map(huespedes.filter((h) => !borradas.has(h.id)).map((h) => [h.id, h.identidadDocumento ?? null]));
  for (const c of plan.fichasACorregir) finales.set(c.id, c.identidadDocumento);
  return finales;
}

function repetidas(finales) {
  const vistas = new Map();
  const dobles = [];
  for (const [id, identidad] of finales) {
    if (!identidad) continue;
    if (vistas.has(identidad)) dobles.push([vistas.get(identidad), id]);
    else vistas.set(identidad, id);
  }
  return dobles;
}

describe("nombres distintos: la transacción nunca aborta por P2002", () => {
  // Como estaban en la base antes de la normalización: la identidad se calculó con el número TAL CUAL
  // (con puntos o guiones), así que dos formatos del mismo documento tienen identidades distintas.
  const identidadVieja = (numero) =>
    require("node:crypto").createHash("sha256").update(["DNI", "AR", numero.toUpperCase().replace(/\s/g, "")].join("|")).digest("hex");
  const conNombre = (id, numero, nombre, extra = {}) => ({ ...ficha(id, numero), identidadDocumento: identidadVieja(numero), nombre, ...extra });

  test("mismo país, números con distinto formato y nombres distintos: no se corrige ni se fusiona ninguna, solo se informa", () => {
    const huespedes = [conNombre(1, "45112902", "Ana Pérez"), conNombre(2, "45.112.902", "Luis Gómez")];
    const plan = planificar({ huespedes, ocupantes: [] });
    expect(plan.fusiones).toEqual([]);
    expect(plan.fichasACorregir).toEqual([]);
    expect(plan.nombresDistintos).toEqual([
      {
        documento: "45112902",
        fichas: [
          { id: 1, nombre: "Ana Pérez" },
          { id: 2, nombre: "Luis Gómez" },
        ],
      },
    ]);
    expect(repetidas(identidadesTrasAplicar(huespedes, plan))).toEqual([]);
  });

  test("ficha sin país + ficha con país (único), mismo documento y nombres distintos: ninguna se corrige", () => {
    const sinPais = { id: 3, nombre: "Eva Ruiz", tipoDocumento: "DNI", paisDocumento: null, numeroDocumento: "44.444.444", identidadDocumento: null };
    const conPais = conNombre(7, "44444444", "Marta Díaz");
    const huespedes = [sinPais, conPais];
    const plan = planificar({ huespedes, ocupantes: [] });
    expect(plan.fichasACorregir).toEqual([]);
    expect(plan.fusiones).toEqual([]);
    expect(plan.nombresDistintos).toHaveLength(1);
    expect(repetidas(identidadesTrasAplicar(huespedes, plan))).toEqual([]);
  });

  test("un grupo con nombres distintos no arrastra a las demás fichas: el resto se corrige normalmente", () => {
    const huespedes = [conNombre(1, "45112902", "Ana Pérez"), conNombre(2, "45.112.902", "Luis Gómez"), conNombre(9, "30.111.222", "Rosa Vega")];
    const plan = planificar({ huespedes, ocupantes: [] });
    expect(plan.fichasACorregir.map((f) => f.id)).toEqual([9]);
    expect(repetidas(identidadesTrasAplicar(huespedes, plan))).toEqual([]);
  });

  test("con los mismos nombres sí se unifican (regla de siempre) y tampoco hay identidades repetidas", () => {
    const huespedes = [conNombre(1, "45112902", "Ana Pérez"), conNombre(2, "45.112.902", "ana  perez")];
    const plan = planificar({ huespedes, ocupantes: [] });
    expect(plan.fusiones).toEqual([{ principalId: 1, duplicadosIds: [2] }]);
    expect(repetidas(identidadesTrasAplicar(huespedes, plan))).toEqual([]);
  });

  test("'Revisar a mano' muestra ids, iniciales y el documento enmascarado, nunca el nombre ni el número completos", () => {
    const lineas = describirRevisarAMano([
      { documento: "45112902", fichas: [{ id: 1, nombre: "Ana Pérez" }, { id: 2, nombre: "Luis Gómez Ruiz" }] },
    ]);
    expect(lineas).toEqual(["documento ****902: ficha 1 (A. P.) | ficha 2 (L. G. R.)"]);
    const texto = lineas.join(" ");
    expect(texto).not.toMatch(/45112902|Pérez|Gómez/);
  });
});
