const { validarOcupacionIngreso, resumirErrores } = require("./ocupacionIngreso");
const { hoyComoFechaUTC } = require("../../lib/fechas");

// Nacimientos SIEMPRE relativos a hoy: "hace N años" (menos un día, para que ya los haya cumplido).
const hoy = hoyComoFechaUTC();
function haceAnios(anios, diasExtra = 1) {
  const d = new Date(hoy);
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  d.setUTCDate(d.getUTCDate() - diasExtra);
  return d.toISOString().slice(0, 10);
}

let documento = 30000000;
function persona(id, habitacionId, anios, extra = {}) {
  return {
    id,
    habitacionId,
    nombre: `Persona${id}`,
    apellido: "Prueba",
    tipoDocumento: "DNI",
    paisDocumento: "AR",
    numeroDocumento: String(documento++),
    fechaNacimiento: haceAnios(anios),
    telefono: "+54 387 555-1234",
    ...extra,
  };
}

const DOBLE = { habitacionId: 1, numero: "101", capacidad: 3, adultos: 2, menores: 1 };
const TWIN = { habitacionId: 2, numero: "102", capacidad: 2, adultos: 2, menores: 0 };

function familia() {
  return [
    persona(1, 1, 40, { esTitular: true }),
    persona(2, 1, 38),
    persona(3, 1, 11, { responsableId: 1 }),
  ];
}

const validar = (personas, habitaciones = [DOBLE], extra = {}) =>
  validarOcupacionIngreso({ habitaciones, personas, fechaIngreso: hoy, ...extra });

describe("validarOcupacionIngreso", () => {
  test("2 adultos + 1 menor con titular y responsable: sin errores", () => {
    expect(validar(familia()).hayErrores).toBe(false);
  });

  test("un chico de 15 cuenta como adulto para la ocupación pero necesita responsable", () => {
    const personas = [persona(1, 1, 45, { esTitular: true }), persona(2, 1, 15)];
    const r = validar(personas, [{ ...DOBLE, adultos: 2, menores: 0 }]);
    expect(r.errores.porHabitacion[0].errores).toEqual([]);
    expect(r.errores.generales.join(" ")).toMatch(/Persona2 Prueba es menor de 18 años: indicá qué adulto es su responsable/);
    const conResponsable = validar([personas[0], { ...personas[1], responsableId: 1 }], [{ ...DOBLE, adultos: 2, menores: 0 }]);
    expect(conResponsable.hayErrores).toBe(false);
  });

  test("ocupación distinta de las personas cargadas: diferencia por habitación en lenguaje claro", () => {
    const r = validar(familia().slice(0, 2));
    expect(r.errores.porHabitacion[0].errores[0]).toBe(
      "Habitación 101: se indicaron 2 adultos y 1 menor, pero se cargaron 2 adultos y 0 menores (desde los 13 años cuenta como adulto).",
    );
  });

  test("0 adultos y capacidad superada", () => {
    const r = validar(familia(), [{ ...DOBLE, adultos: 0, menores: 4 }]);
    const errores = r.errores.porHabitacion[0].errores.join(" ");
    expect(errores).toMatch(/tiene que ingresar al menos un adulto/);
    expect(errores).toMatch(/entran como máximo 3 personas y se indicaron 4/);
  });

  test("dos titulares, ninguno y titular menor de 18", () => {
    const dos = familia();
    dos[1].esTitular = true;
    expect(validar(dos).errores.porHabitacion[0].errores.join(" ")).toMatch(/hay 2 titulares \(Persona1 Prueba y Persona2 Prueba\)/);
    const ninguno = familia();
    ninguno[0].esTitular = false;
    expect(validar(ninguno).errores.porHabitacion[0].errores.join(" ")).toMatch(/marcá quién es el titular/);
    const menor = [persona(1, 1, 17, { esTitular: true, responsableId: 2 }), persona(2, 1, 40)];
    expect(validar(menor, [{ ...DOBLE, adultos: 2, menores: 0 }]).errores.porHabitacion[0].errores.join(" ")).toMatch(
      /el titular \(Persona1 Prueba\) tiene que ser mayor de 18 años/,
    );
  });

  test("menor sin responsable o con responsable menor de edad", () => {
    const sin = familia();
    delete sin[2].responsableId;
    expect(validar(sin).errores.generales.join(" ")).toMatch(/Persona\d+ Prueba es menor de 18 años: indicá qué adulto es su responsable/);
    const conMenor = [persona(1, 1, 40, { esTitular: true }), persona(2, 1, 16, { responsableId: 1 }), persona(3, 1, 8, { responsableId: 2 })];
    expect(validar(conMenor).errores.generales.join(" ")).toMatch(/tiene que ser mayor de 18 años/);
  });

  test("el responsable puede estar en otra habitación de la misma reserva", () => {
    const personas = [
      persona(1, 1, 45, { esTitular: true }),
      persona(2, 1, 43),
      persona(3, 2, 16, { esTitular: false, responsableId: 1 }),
      persona(4, 2, 19, { esTitular: true, telefono: "" }),
    ];
    const r = validar(personas, [{ ...DOBLE, menores: 0 }, TWIN]);
    expect(r.hayErrores).toBe(false);
  });

  test("la misma persona repetida, en la misma o en otra habitación", () => {
    const personas = [...familia(), persona(9, 2, 30, { esTitular: true })];
    personas[3].numeroDocumento = personas[1].numeroDocumento;
    const r = validar(personas, [DOBLE, { ...TWIN, adultos: 1 }]);
    expect(r.errores.generales.join(" ")).toMatch(/tienen el mismo documento \(DNI \d+\)\. Cargá a cada persona una sola vez/);
  });

  test("solo el titular de la reserva necesita teléfono; con reserva, es quien reservó si es titular", () => {
    const personas = [persona(1, 1, 40, { esTitular: true, telefono: "" }), persona(2, 2, 35, { esTitular: true, telefono: "" })];
    const habitaciones = [{ ...DOBLE, adultos: 1, menores: 0 }, { ...TWIN, adultos: 1 }];
    // Walk-in: el de la primera habitación.
    expect(validar(personas, habitaciones).errores.generales.join(" ")).toMatch(
      /Persona1 Prueba es el titular de la reserva y necesita un teléfono/,
    );
    // Con reserva: el que coincide con quien reservó (segunda habitación).
    const reservo = { tipoDocumento: "DNI", numeroDocumento: personas[1].numeroDocumento, paisDocumento: null };
    const r = validar(personas, habitaciones, { huespedReserva: reservo });
    expect(r.titularDeLaReserva).toBe(personas[1]);
    expect(r.errores.generales.join(" ")).toMatch(/Persona2 Prueba es el titular de la reserva/);
    expect(r.titularDistinto).toBe(false);
  });

  test("titular distinto de quien reservó: exige motivo", () => {
    const reservo = { tipoDocumento: "DNI", numeroDocumento: "99999999", paisDocumento: "AR" };
    const r = validar(familia(), [DOBLE], { huespedReserva: reservo });
    expect(r.titularDistinto).toBe(true);
    expect(r.faltaMotivo).toBe(true);
    expect(validar(familia(), [DOBLE], { huespedReserva: reservo, motivoTitularDistinto: "Reservó la empresa" }).faltaMotivo).toBe(false);
  });

  test("teléfono con letras no es válido", () => {
    const personas = familia();
    personas[0].telefono = "llamar a la tarde";
    expect(validar(personas).errores.generales.join(" ")).toMatch(/necesita un teléfono de contacto válido/);
  });

  test("resumirErrores arma un único mensaje sin nombres de campos", () => {
    const mensaje = resumirErrores(validar(familia().slice(0, 2)).errores);
    expect(mensaje).toMatch(/^Habitación 101: se indicaron 2 adultos y 1 menor/);
    expect(mensaje).not.toMatch(/habitacionId|esTitular|responsableId|fechaNacimiento/);
  });
});
