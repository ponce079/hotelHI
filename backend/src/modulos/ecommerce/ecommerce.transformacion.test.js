jest.mock("../../lib/prisma", () => ({}));
const {
  MOTIVO_SIN_DISPONIBILIDAD,
  MOTIVO_SIN_TARIFAS,
  planLimpio,
  armarTiposWeb,
  armarDisponibilidadWeb,
  elegirRepresentantes,
  armarCotizacionWeb,
} = require("./ecommerce.transformacion");

// Plan tal como lo devuelve el motor (con claves internas que no pueden salir).
function planMotor(codigo, total, extra = {}) {
  return {
    codigo,
    nombre: codigo === "BAR" ? "Best Available Rate" : "No Reembolsable",
    tipo: "BASE",
    reembolsable: codigo === "BAR",
    horasCancelacionSinCargo: codigo === "BAR" ? 48 : null,
    penalidadNoShow: codigo === "BAR" ? "PRIMERA_NOCHE" : "TOTAL_ESTADIA",
    visibleWeb: true,
    detalle: [{ fecha: "2026-10-12", precioNoche: total / 2 }],
    total,
    promedioPorNoche: total / 2,
    planTarifarioId: codigo === "BAR" ? 1 : 2,
    ...extra,
  };
}

const TIPOS = [
  { tipoHabitacionId: 1, nombre: "Doble", capacidadMaxima: 4 },
  { tipoHabitacionId: 2, nombre: "Simple", capacidadMaxima: 2 },
];

function disponibilidad({ libres, resumen }) {
  return { noches: 2, habitaciones: libres, resumenPorTipo: resumen };
}

const RESUMEN_OK = [
  { tipoHabitacionId: 1, planes: [planMotor("BAR", 88000), planMotor("NRF", 74800)], motivoNoDisponible: null },
  { tipoHabitacionId: 2, planes: [planMotor("BAR", 66000), planMotor("NRF", 56100)], motivoNoDisponible: null },
];

const hab = (id, tipoHabitacionId, capacidad) => ({ id, numero: `${100 + id}`, tipoHabitacionId, capacidad });

function armar(personas, libres, resumen = RESUMEN_OK) {
  return armarDisponibilidadWeb({
    tipos: TIPOS,
    disponibilidad: disponibilidad({ libres, resumen }),
    adultos: personas.adultos,
    menores: personas.menores ?? 0,
    fechaDesde: "2026-10-12",
    fechaHasta: "2026-10-14",
  });
}

const tipoDe = (respuesta, id) => respuesta.tipos.find((t) => t.tipoHabitacionId === id);

describe("planLimpio", () => {
  test("deja solo las 8 claves del contrato", () => {
    expect(Object.keys(planLimpio(planMotor("BAR", 100))).sort()).toEqual(
      [
        "codigo",
        "horasCancelacionSinCargo",
        "nombre",
        "penalidadNoShow",
        "planTarifarioId",
        "promedioPorNoche",
        "reembolsable",
        "total",
      ].sort()
    );
  });
});

describe("armarTiposWeb", () => {
  test("tipos activos con capacidadMaxima = la mayor capacidad entre sus habitaciones activas", () => {
    const tipos = armarTiposWeb([
      { capacidad: 2, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
      { capacidad: 4, tipoHabitacionId: 1, tipoHabitacion: { nombre: "Doble", activo: true } },
      { capacidad: 1, tipoHabitacionId: 2, tipoHabitacion: { nombre: "Simple", activo: true } },
      { capacidad: 6, tipoHabitacionId: 3, tipoHabitacion: { nombre: "Suite", activo: false } },
    ]);
    expect(tipos).toEqual([
      { tipoHabitacionId: 1, nombre: "Doble", capacidadMaxima: 4 },
      { tipoHabitacionId: 2, nombre: "Simple", capacidadMaxima: 1 },
    ]);
  });
});

describe("armarDisponibilidadWeb", () => {
  const libresVarias = [hab(1, 1, 2), hab(2, 1, 3), hab(3, 1, 4), hab(4, 1, 2), hab(5, 2, 2), hab(6, 2, 2), hab(7, 2, 1)];

  test("todos los tipos aparecen, con planes limpios y desdePorNoche = menor promedio", () => {
    const r = armar({ adultos: 2 }, libresVarias);
    expect(r).toMatchObject({ fechaDesde: "2026-10-12", fechaHasta: "2026-10-14", noches: 2 });
    expect(r.tipos.map((t) => t.tipoHabitacionId)).toEqual([1, 2]);
    const doble = tipoDe(r, 1);
    expect(doble.motivoNoDisponible).toBeNull();
    expect(doble.desdePorNoche).toBe(37400);
    expect(doble.planes.map((p) => p.total)).toEqual([88000, 74800]);
    expect(doble.planes[0]).not.toHaveProperty("detalle");
  });

  test("(a) más personas que la capacidad del tipo → 'Admite hasta N personas', aunque tampoco haya libres", () => {
    const r = armar({ adultos: 3 }, []);
    const simple = tipoDe(r, 2);
    expect(simple).toMatchObject({
      motivoNoDisponible: "Admite hasta 2 personas",
      planes: [],
      desdePorNoche: null,
      ultimasDisponibles: false,
    });
  });

  test("con 5 personas, todos los tipos de menor capacidad quedan con su motivo y planes: []", () => {
    const r = armar({ adultos: 4, menores: 1 }, libresVarias);
    expect(tipoDe(r, 1)).toMatchObject({ motivoNoDisponible: "Admite hasta 4 personas", planes: [] });
    expect(tipoDe(r, 2)).toMatchObject({ motivoNoDisponible: "Admite hasta 2 personas", planes: [] });
  });

  test("(b) ninguna habitación libre con capacidad suficiente → 'Sin disponibilidad para estas fechas'", () => {
    // Doble admite 4, pero la única libre que alcanza para 4 no está: solo quedan de 2 y 3.
    const r = armar({ adultos: 4 }, [hab(1, 1, 2), hab(2, 1, 3)]);
    expect(tipoDe(r, 1)).toMatchObject({
      motivoNoDisponible: MOTIVO_SIN_DISPONIBILIDAD,
      planes: [],
      desdePorNoche: null,
      ultimasDisponibles: false,
    });
  });

  test("(b) un tipo sin ninguna habitación libre", () => {
    const r = armar({ adultos: 2 }, [hab(1, 1, 2)]);
    expect(tipoDe(r, 2).motivoNoDisponible).toBe(MOTIVO_SIN_DISPONIBILIDAD);
    expect(tipoDe(r, 1).motivoNoDisponible).toBeNull();
  });

  test("(c) sin planes → motivo del motor si es seguro", () => {
    const resumen = [
      { tipoHabitacionId: 1, planes: [], motivoNoDisponible: 'La temporada "Alta" exige una estadía mínima de 3 noches.' },
      RESUMEN_OK[1],
    ];
    const r = armar({ adultos: 2 }, libresVarias, resumen);
    expect(tipoDe(r, 1).motivoNoDisponible).toBe('La temporada "Alta" exige una estadía mínima de 3 noches.');
  });

  test("(c) sin planes y motivo con un número de habitación (o ninguno) → genérico", () => {
    const resumen = [
      { tipoHabitacionId: 1, planes: [], motivoNoDisponible: "La ocupación de la habitación 204 supera su capacidad." },
      { tipoHabitacionId: 2, planes: [], motivoNoDisponible: null },
    ];
    const r = armar({ adultos: 1 }, libresVarias, resumen);
    expect(tipoDe(r, 1).motivoNoDisponible).toBe(MOTIVO_SIN_TARIFAS);
    expect(tipoDe(r, 2).motivoNoDisponible).toBe(MOTIVO_SIN_TARIFAS);
  });

  test("ultimasDisponibles solo con 1 o 2 libres que alcancen", () => {
    expect(tipoDe(armar({ adultos: 2 }, libresVarias), 2).ultimasDisponibles).toBe(true); // 2 de capacidad 2
    expect(tipoDe(armar({ adultos: 1 }, libresVarias), 2).ultimasDisponibles).toBe(false); // 3 libres
    expect(tipoDe(armar({ adultos: 4 }, libresVarias), 1).ultimasDisponibles).toBe(true); // 1 de capacidad 4
  });
});

describe("elegirRepresentantes", () => {
  test("dos líneas del mismo tipo usan dos habitaciones distintas", () => {
    const libres = [hab(10, 1, 2), hab(11, 1, 2)];
    const ids = elegirRepresentantes(libres, [
      { tipoHabitacionId: 1, adultos: 2, menores: 0 },
      { tipoHabitacionId: 1, adultos: 2, menores: 0 },
    ]);
    expect(ids).toEqual([10, 11]);
  });

  test("la más chica que alcanza, con las líneas de mayor a menor (una línea chica no se queda con la grande)", () => {
    const libres = [hab(5, 1, 4), hab(6, 1, 3), hab(7, 1, 2)];
    // Orden original: primero la de 2 personas, después la de 4.
    const ids = elegirRepresentantes(libres, [
      { tipoHabitacionId: 1, adultos: 2, menores: 0 },
      { tipoHabitacionId: 1, adultos: 3, menores: 1 },
    ]);
    expect(ids).toEqual([7, 5]);
  });

  test("desempate por id", () => {
    const ids = elegirRepresentantes([hab(9, 2, 2), hab(3, 2, 2)], [{ tipoHabitacionId: 2, adultos: 1, menores: 0 }]);
    expect(ids).toEqual([3]);
  });

  test("si alguna línea no tiene habitación → null", () => {
    expect(
      elegirRepresentantes(
        [hab(10, 1, 2)],
        [
          { tipoHabitacionId: 1, adultos: 2, menores: 0 },
          { tipoHabitacionId: 1, adultos: 1, menores: 0 },
        ]
      )
    ).toBeNull();
    expect(elegirRepresentantes([hab(10, 1, 2)], [{ tipoHabitacionId: 2, adultos: 1, menores: 0 }])).toBeNull();
  });
});

describe("armarCotizacionWeb", () => {
  test("total y subtotales del plan, sin ids de habitación", () => {
    const plan = {
      ...planMotor("NRF", 157100),
      promedioPorNoche: 78550,
      habitaciones: [
        { habitacionId: 7, numero: "107", adultos: 2, menores: 0, detalle: [], total: 74800 },
        { habitacionId: 18, numero: "118", adultos: 3, menores: 0, detalle: [], total: 82300 },
      ],
    };
    const r = armarCotizacionWeb({
      cotizacion: { noches: 2, planes: [plan] },
      lineas: [
        { tipoHabitacionId: 1, adultos: 2, menores: 0 },
        { tipoHabitacionId: 1, adultos: 3, menores: 0 },
      ],
      representantes: [7, 18],
      nombrePorTipo: new Map([[1, "Doble"]]),
    });
    expect(r).toEqual({
      total: 157100,
      promedioPorNoche: 78550,
      noches: 2,
      plan: planLimpio(plan),
      habitaciones: [
        { tipo: "Doble", adultos: 2, menores: 0, subtotal: 74800 },
        { tipo: "Doble", adultos: 3, menores: 0, subtotal: 82300 },
      ],
    });
  });
});
