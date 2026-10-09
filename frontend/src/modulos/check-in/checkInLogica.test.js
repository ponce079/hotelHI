import { describe, expect, it } from "vitest";
import { estadoInicialReserva, estadoInicialWalkin, reducer } from "./checkInEstado";
import {
  avisosDeFila,
  faltantesParaConfirmar,
  necesitaMotivo,
  resolverCampos,
  revisarFila,
  textoHerencia,
  titularDeLaReserva,
} from "./checkInReglas";
import { cuerpoConfirmarReserva, personasParaEnviar } from "./checkInPayload";
import { hoyEnHoraLocal, sumarDiasISO } from "../../lib/fechas";

// Nacimientos relativos a hoy (dd/mm/aaaa), nunca años fijos.
const hoy = hoyEnHoraLocal();
function haceAnios(anios) {
  const [a, m, d] = sumarDiasISO(hoy, -1).split("-");
  return `${d}/${m}/${Number(a) - anios}`;
}
const iso = (ddmm) => ddmm.split("/").reverse().join("-");

const RESERVA = {
  id: 10,
  huespedId: 77,
  fechaDesde: `${hoy}T00:00:00.000Z`,
  fechaHasta: `${sumarDiasISO(hoy, 3)}T00:00:00.000Z`,
  totalEstimadoAlojamiento: 294000,
  huesped: { id: 77, nombre: "Martín Gutiérrez", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "30512874", contacto: "m@correo.com" },
  habitaciones: [
    { id: 270, numero: "270", tipo: "Doble", tipoHabitacionId: 1, capacidad: 3, piso: 2, adultos: 2, menores: 1 },
  ],
};
const CONTEXTO = { fechaDesde: RESERVA.fechaDesde, fechaHasta: RESERVA.fechaHasta, huespedReserva: RESERVA.huesped };

const fichaTitular = {
  id: 501,
  estado: "Previsto",
  huespedId: 77,
  esTitular: true,
  nombre: "Martín Gutiérrez",
  apellido: "",
  tipoDocumento: "DNI",
  paisDocumento: "AR",
  numeroDocumento: "30512874",
  fechaNacimiento: `${iso(haceAnios(42))}T00:00:00.000Z`,
  paisResidencia: "AR",
  asignaciones: [{ habitacionId: 270, hasta: null }],
};

function completar(estado, filaId, campos) {
  return Object.entries(campos).reduce((e, [campo, valor]) => reducer(e, { tipo: "campo", filaId, campo, valor }), estado);
}

function reservaCompleta() {
  let e = estadoInicialReserva(RESERVA, [fichaTitular]);
  const [titular, adulto2, menor] = e.filas;
  e = completar(e, titular.id, { nombre: "Martín", apellido: "Gutiérrez", nacionalidad: "AR", localidad: "Córdoba", domicilio: "Colón 1450", telefono: "+54 351 555-0182" });
  e = completar(e, adulto2.id, { numeroDocumento: "31784205", nombre: "Carolina", apellido: "Paz", fechaNacimiento: haceAnios(39) });
  e = completar(e, menor.id, { nombre: "Tomás", apellido: "Gutiérrez", fechaNacimiento: haceAnios(8), vinculoResponsable: "Padre o madre" });
  e = reducer(e, { tipo: "garantia", cambios: { garantiaConfirmada: true } });
  return e;
}

describe("precarga con reserva", () => {
  it("arma las filas según la ocupación (adultos primero) con quien reservó como titular", () => {
    const e = estadoInicialReserva(RESERVA, [fichaTitular]);
    expect(e.filas.map((f) => f.tipo)).toEqual(["adulto", "adulto", "menor"]);
    expect(e.filas[0]).toMatchObject({ precargada: true, esTitular: true, ocupanteId: 501 });
    expect(e.filas[0].campos.fechaNacimiento).toBe(haceAnios(42));
    expect(titularDeLaReserva(e, CONTEXTO).coincide).toBe(true);
    expect(avisosDeFila(e.filas[0])[0]).toMatch(/El nombre viene completo desde la reserva/);
  });

  it("si quien reservó no tiene ficha, se precarga desde la reserva en la primera fila adulta", () => {
    const e = estadoInicialReserva(RESERVA, []);
    expect(e.filas[0]).toMatchObject({ precargada: true, esTitular: true });
    expect(e.filas[0].campos).toMatchObject({ nombre: "Martín Gutiérrez", numeroDocumento: "30512874", email: "m@correo.com" });
  });
});

describe("herencia de residencia y nacionalidad", () => {
  it("el acompañante hereda la residencia del titular y el menor la nacionalidad y residencia de su responsable", () => {
    let e = reservaCompleta();
    const [titular, adulto2, menor] = e.filas;
    e = completar(e, titular.id, { paisResidencia: "CL" });
    expect(resolverCampos(e, e.filas[1]).campos.paisResidencia).toBe("CL");
    expect(textoHerencia(resolverCampos(e, e.filas[1]).heredados)).toBe("Residencia: la del titular");
    expect(resolverCampos(e, e.filas[2]).campos).toMatchObject({ nacionalidad: "AR", paisResidencia: "CL" });
    expect(textoHerencia(resolverCampos(e, e.filas[2]).heredados)).toBe("Residencia: la del responsable · Nacionalidad: la del responsable");

    // Responsable elegido: hereda del adulto 2.
    e = completar(e, adulto2.id, { nacionalidad: "UY" });
    e = reducer(e, { tipo: "responsable", filaId: menor.id, responsableId: adulto2.id });
    expect(resolverCampos(e, e.filas[2]).campos.nacionalidad).toBe("UY");

    // Corregido a mano deja de heredar, aunque cambie el responsable.
    e = completar(e, menor.id, { nacionalidad: "BR" });
    e = reducer(e, { tipo: "responsable", filaId: menor.id, responsableId: null });
    expect(resolverCampos(e, e.filas[2]).campos.nacionalidad).toBe("BR");
  });

  it("si quien hereda no tiene el dato, el faltante se informa en su fila", () => {
    let e = reservaCompleta();
    e = completar(e, e.filas[0].id, { paisResidencia: "" });
    const textos = faltantesParaConfirmar(e, CONTEXTO).map((f) => f.texto);
    expect(textos).toContain("Falta la residencia del titular de la Hab. 270");
    expect(textos).toContain("Falta el país de residencia del Adulto 1 (Hab. 270)");
  });

  it("el envío lleva los valores reales resueltos y el motivo del menor sin documento", () => {
    const e = reservaCompleta();
    const personas = personasParaEnviar(e, CONTEXTO);
    expect(personas[1]).toMatchObject({ paisResidencia: "AR", esTitular: false, responsableId: null });
    expect(personas[2]).toMatchObject({
      nacionalidad: "AR",
      paisResidencia: "AR",
      responsableId: e.filas[0].id,
      numeroDocumento: null,
      motivoSinDocumento: "Menor sin documento presentado",
      fechaNacimiento: iso(haceAnios(8)),
    });
    expect(personas.every((p) => p.paisResidencia && p.nacionalidad)).toBe(true);
  });
});

describe("faltantes y edades", () => {
  it("una reserva completa no tiene faltantes", () => {
    expect(faltantesParaConfirmar(reservaCompleta(), CONTEXTO)).toEqual([]);
  });

  it("titular sin apellido, menor de 14, titular de 16 y titular distinto sin motivo bloquean con su mensaje", () => {
    let e = reservaCompleta();
    e = completar(e, e.filas[0].id, { apellido: "" });
    expect(faltantesParaConfirmar(e, CONTEXTO)[0].texto).toBe("Falta el apellido del Adulto 1 (Hab. 270)");

    e = completar(reservaCompleta(), reservaCompleta().filas[2].id, {});
    e = completar(e, e.filas[2].id, { fechaNacimiento: haceAnios(14) });
    expect(revisarFila(e, e.filas[2], CONTEXTO).edad).toMatch(/Tiene 14 años: desde los 13 se registra como adulto/);
    expect(faltantesParaConfirmar(e, CONTEXTO).map((f) => f.texto)).toContain("Revisá la edad del Menor 1 (Hab. 270)");

    e = completar(reservaCompleta(), reservaCompleta().filas[0].id, {});
    e = completar(e, e.filas[0].id, { fechaNacimiento: haceAnios(16) });
    expect(revisarFila(e, e.filas[0], CONTEXTO).edad).toMatch(/titular de la habitación tiene que ser mayor de 18/);

    e = reservaCompleta();
    e = reducer(e, { tipo: "marcarTitular", filaId: e.filas[1].id });
    expect(necesitaMotivo(e, CONTEXTO)).toBe(true);
    expect(faltantesParaConfirmar(e, CONTEXTO).map((f) => f.texto)).toContain("Falta el motivo del titular distinto");
    e = reducer(e, { tipo: "motivo", valor: "Reservó un familiar" });
    expect(faltantesParaConfirmar(e, CONTEXTO).map((f) => f.texto)).not.toContain("Falta el motivo del titular distinto");
    expect(cuerpoConfirmarReserva(e, CONTEXTO, {}).motivoTitularDistinto).toBe("Reservó un familiar");
  });

  it("al quitar al responsable de un menor, el menor vuelve al titular de la habitación", () => {
    let e = reservaCompleta();
    const [, adulto2, menor] = e.filas;
    e = reducer(e, { tipo: "responsable", filaId: menor.id, responsableId: adulto2.id });
    e = reducer(e, { tipo: "quitarHuesped", filaId: adulto2.id, totalNuevo: 250000 });
    expect(e.filas.find((f) => f.id === menor.id).responsableId).toBeNull();
    expect(e.habitaciones[0]).toMatchObject({ adultos: 1, menores: 1 });
    expect(e.totalVigente).toBe(250000);
  });
});

describe("walk-in", () => {
  it("si la ocupación ya no entra en la habitación elegida, se deselecciona con aviso", () => {
    let e = estadoInicialWalkin();
    const clave = e.habitaciones[0].clave;
    e = reducer(e, { tipo: "elegirHabitacion", clave, habitacion: { id: 9, numero: "204", tipo: "Twin", tipoHabitacionId: 2, capacidad: 2, piso: 2 } });
    e = reducer(e, { tipo: "ocupacion", clave, adultos: 2, menores: 1 });
    expect(e.habitaciones[0].habitacionId).toBeNull();
    expect(e.aviso).toBe("La 204 no admite 3 personas: elegí otra para la habitación 1.");
    expect(e.filas.map((f) => f.tipo)).toEqual(["adulto", "adulto", "menor"]);
  });

  it("al elegir una habitación, se completa con adultos hasta su capacidad", () => {
    let e = estadoInicialWalkin();
    const clave = e.habitaciones[0].clave;
    e = reducer(e, { tipo: "elegirHabitacion", clave, habitacion: { id: 30, numero: "301", tipo: "Cuádruple", tipoHabitacionId: 3, capacidad: 4, piso: 3 } });
    expect(e.habitaciones[0]).toMatchObject({ adultos: 4, menores: 0 });
    expect(e.filas.map((f) => f.tipo)).toEqual(["adulto", "adulto", "adulto", "adulto"]);
  });

  it("los menores cargados se mantienen y los adultos completan la capacidad", () => {
    let e = estadoInicialWalkin();
    const clave = e.habitaciones[0].clave;
    e = reducer(e, { tipo: "ocupacion", clave, adultos: 1, menores: 1 });
    e = reducer(e, { tipo: "elegirHabitacion", clave, habitacion: { id: 30, numero: "301", tipo: "Cuádruple", tipoHabitacionId: 3, capacidad: 4, piso: 3 } });
    expect(e.habitaciones[0]).toMatchObject({ adultos: 3, menores: 1 });
    expect(e.filas.map((f) => f.tipo)).toEqual(["adulto", "adulto", "adulto", "menor"]);
  });

  it("al cambiar la habitación vuelve la ocupación de antes de elegirla", () => {
    let e = estadoInicialWalkin();
    const clave = e.habitaciones[0].clave;
    e = reducer(e, { tipo: "elegirHabitacion", clave, habitacion: { id: 30, numero: "301", tipo: "Cuádruple", tipoHabitacionId: 3, capacidad: 4, piso: 3 } });
    e = reducer(e, { tipo: "elegirHabitacion", clave, habitacion: null });
    expect(e.habitaciones[0]).toMatchObject({ habitacionId: null, adultos: 2, menores: 0 });
    expect(e.filas).toHaveLength(2);
  });

  it("si la ocupación se tocó a mano después de elegir, al cambiar la habitación se mantiene", () => {
    let e = estadoInicialWalkin();
    const clave = e.habitaciones[0].clave;
    e = reducer(e, { tipo: "elegirHabitacion", clave, habitacion: { id: 30, numero: "301", tipo: "Cuádruple", tipoHabitacionId: 3, capacidad: 4, piso: 3 } });
    e = reducer(e, { tipo: "ocupacion", clave, adultos: 3, menores: 0 });
    e = reducer(e, { tipo: "elegirHabitacion", clave, habitacion: null });
    expect(e.habitaciones[0]).toMatchObject({ adultos: 3, menores: 0 });
  });
});
