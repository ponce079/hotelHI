import { describe, expect, it } from "vitest";
import {
  accionesDeReserva,
  armarMovimientos,
  datosClave,
  fechaArgentina,
  filtrarMovimientos,
  lineaDeTiempo,
  puedeAjustarPrecioEn,
  totalesMovimientos,
} from "./reservaDetalle";

const noche = (id, fecha, precio, extra = {}) => ({ id, fecha: `${fecha}T00:00:00.000Z`, precioNoche: precio, ...extra });
const reservaBase = (estado, extra = {}) => ({
  id: 1,
  estado,
  fechaDesde: "2026-10-02T00:00:00.000Z",
  fechaHasta: "2026-10-05T00:00:00.000Z",
  noches: 3,
  planTarifario: { nombre: "Tarifa flexible" },
  huesped: { nombre: "Martín Gutiérrez", nombres: "Martín", apellido: "Gutiérrez", tipoDocumento: "DNI", numeroDocumento: "30512874" },
  habitaciones: [
    {
      id: 10,
      numero: "404",
      tipo: "Doble",
      piso: 4,
      capacidad: 3,
      adultos: 2,
      menores: 1,
      reservaNoches: [noche(1, "2026-10-02", 42400), noche(2, "2026-10-03", 42400), noche(3, "2026-10-04", 43200)],
    },
  ],
  ...extra,
});
const sena = { id: 7, concepto: "Seña", fecha: "2026-09-14T13:22:00.000Z", anulado: false, medios: [{ medioPago: "Tarjeta crédito", importe: "25600", referencia: "5521" }] };
const garantia = { id: 8, concepto: "Garantía", fecha: "2026-10-02T18:20:00.000Z", anulado: false, medios: [{ medioPago: "Efectivo", importe: "30000" }] };
const cena = { id: 9, tipoServicio: "Restaurante", descripcion: "Cena, 2 cubiertos", monto: "18500", fechaHora: "2026-10-02T21:40:00.000Z", registradoPor: "restaurante.prueba", habitacionNumero: "404", anulado: false };

describe("fechaArgentina", () => {
  it("es el día de Argentina, no el de UTC", () => {
    expect(fechaArgentina("2026-10-03T01:30:00.000Z")).toBe("2026-10-02");
    expect(fechaArgentina("2026-10-03T03:00:00.000Z")).toBe("2026-10-03");
  });
});

describe("armarMovimientos — orden y 'a devengar'", () => {
  it("ordena por fecha: seña, noches y consumo del día, con el consumo después de la noche; sin la garantía", () => {
    const m = armarMovimientos({ reserva: reservaBase("En curso"), consumos: [cena], pagos: [garantia, sena], hoy: "2026-10-02" });
    expect(m.map((x) => x.id)).toEqual(["pago-7", "noche-1", "consumo-9", "noche-2", "noche-3"]);
    expect(m.some((x) => x.id === "pago-8")).toBe(false);
  });

  it("un consumo cargado a la noche (21:40 hora argentina) queda en su día aunque en UTC sea el siguiente", () => {
    const tarde = { ...cena, id: 11, fechaHora: "2026-10-03T01:10:00.000Z" };
    const m = armarMovimientos({ reserva: reservaBase("En curso"), consumos: [tarde], hoy: "2026-10-03" });
    expect(m.find((x) => x.id === "consumo-11").fecha).toBe("2026-10-02");
    expect(m.map((x) => x.id)).toEqual(["noche-1", "consumo-11", "noche-2", "noche-3"]);
  });

  it("En curso: solo las noches posteriores a hoy (hora argentina) quedan 'a devengar'", () => {
    const m = armarMovimientos({ reserva: reservaBase("En curso"), hoy: "2026-10-03" });
    expect(m.map((x) => [x.id, x.previsto])).toEqual([
      ["noche-1", false],
      ["noche-2", false],
      ["noche-3", true],
    ]);
  });

  it("Confirmada: todas a devengar; Cerrada: ninguna", () => {
    expect(armarMovimientos({ reserva: reservaBase("Confirmada"), hoy: "2026-10-09" }).every((x) => x.previsto)).toBe(true);
    expect(armarMovimientos({ reserva: reservaBase("Cerrada"), hoy: "2026-09-01" }).some((x) => x.previsto)).toBe(false);
  });

  it("marca las noches ajustadas con su precio anterior", () => {
    const reserva = reservaBase("Confirmada");
    reserva.habitaciones[0].reservaNoches[1] = noche(2, "2026-10-03", 39000, { ajustada: true, precioOriginal: "42400" });
    const m = armarMovimientos({ reserva, hoy: "2026-10-01" });
    expect(m.find((x) => x.id === "noche-2")).toMatchObject({ ajustada: true, precioOriginal: 42400, cargo: 39000, nocheId: 2 });
    expect(m.find((x) => x.id === "noche-1").ajustada).toBe(false);
  });

  it("los anulados se ven con su motivo pero no suman; la garantía no es un pago de la cuenta", () => {
    const anulada = { ...cena, id: 12, monto: "5000", anulado: true, motivoAnulacion: "duplicado" };
    const pagoAnulado = { ...sena, id: 13, anulado: true, motivoAnulacion: "error" };
    const m = armarMovimientos({ reserva: reservaBase("En curso"), consumos: [cena, anulada], pagos: [sena, pagoAnulado, garantia], hoy: "2026-10-02" });
    expect(m.find((x) => x.id === "consumo-12")).toMatchObject({ anulado: true, motivoAnulacion: "duplicado" });
    const t = totalesMovimientos(m);
    expect(t).toEqual({ alojamiento: 128000, consumos: 18500, total: 146500, pagos: 25600, saldo: 120900 });
  });

  it("Cancelada: las noches no se cobran y no suman", () => {
    const m = armarMovimientos({ reserva: reservaBase("Cancelada"), pagos: [sena], hoy: "2026-10-01" });
    expect(m.filter((x) => x.tipo === "aloj").every((x) => x.anulado && !x.previsto)).toBe(true);
    expect(totalesMovimientos(m)).toMatchObject({ total: 0, pagos: 25600 });
  });

  it("suma los cargos de revisión del check-out como consumos", () => {
    const m = armarMovimientos({
      reserva: reservaBase("Cerrada"),
      verificaciones: [{ id: 1, descripcion: "Toalla manchada", monto: 3000, fechaHora: "2026-10-05T12:00:00.000Z", registradoPor: "recep" }, { id: 2, descripcion: "Sin novedades", monto: 0, fechaHora: "2026-10-05T12:00:00.000Z" }],
      hoy: "2026-10-05",
    });
    expect(m.filter((x) => x.id.startsWith("revision"))).toHaveLength(1);
    expect(totalesMovimientos(m).consumos).toBe(3000);
  });

  it("filtra por tipo", () => {
    const m = armarMovimientos({ reserva: reservaBase("En curso"), consumos: [cena], pagos: [sena], hoy: "2026-10-02" });
    expect(filtrarMovimientos(m, "aloj")).toHaveLength(3);
    expect(filtrarMovimientos(m, "consumo")).toHaveLength(1);
    expect(filtrarMovimientos(m, "pago")).toHaveLength(1);
    expect(filtrarMovimientos(m, "todo")).toHaveLength(5);
  });
});

describe("accionesDeReserva — menú según estado y rol", () => {
  const recepcion = { gestionarReservas: true, gestionarCheckIn: true, registrarConsumoServicio: true, verCheckOut: true, verComprobantesEstadia: true };
  const ids = (l) => l.map((a) => a.id);

  it("Confirmada: Modificar y Iniciar check-in; Cancelar va en el menú ⋯", () => {
    const a = accionesDeReserva("Confirmada", recepcion);
    expect(ids(a.principales)).toEqual(["modificar", "check-in"]);
    expect(a.principales.find((x) => x.id === "check-in").tipo).toBe("primaria");
    expect(ids(a.menu)).toEqual(["cancelar"]);
  });

  it("En curso: Agregar consumo y Hacer check-out; sin Modificar ni Cancelar", () => {
    const a = accionesDeReserva("En curso", recepcion);
    expect(ids(a.principales)).toEqual(["consumo", "check-out"]);
    expect(a.menu).toEqual([]);
  });

  it("Cerrada: solo Ver comprobante. Cancelada: nada", () => {
    expect(ids(accionesDeReserva("Cerrada", recepcion).principales)).toEqual(["comprobante"]);
    expect(accionesDeReserva("Cancelada", recepcion)).toEqual({ principales: [], menu: [] });
  });

  it("el gerente no tiene ninguna acción en el encabezado, en ningún estado", () => {
    for (const estado of ["Confirmada", "En curso", "Cerrada", "Cancelada"])
      expect(accionesDeReserva(estado, {})).toEqual({ principales: [], menu: [] });
  });

  it("el admin ve el check-out y el comprobante pero no opera (sin gestionarCheckIn)", () => {
    const admin = { gestionarReservas: true, gestionarCheckIn: true, registrarConsumoServicio: true, verCheckOut: true, verComprobantesEstadia: true };
    expect(ids(accionesDeReserva("En curso", { ...admin, registrarConsumoServicio: false }).principales)).toEqual(["check-out"]);
  });

  it("Ajustar precio: solo Confirmada y En curso", () => {
    expect(["Confirmada", "En curso", "Cerrada", "Cancelada"].map(puedeAjustarPrecioEn)).toEqual([true, true, false, false]);
  });
});

describe("encabezado", () => {
  it("línea de tiempo por estado", () => {
    const estados = (r) => lineaDeTiempo(r).map((p) => `${p.texto}:${p.estado}`);
    expect(estados(reservaBase("Confirmada"))).toEqual(["Confirmada:actual", "En curso:pendiente", "Cerrada:pendiente"]);
    expect(estados(reservaBase("En curso"))).toEqual(["Confirmada:hecho", "En curso:actual", "Cerrada:pendiente"]);
    expect(estados(reservaBase("Cerrada"))).toEqual(["Confirmada:hecho", "En curso:hecho", "Cerrada:actual"]);
    expect(estados(reservaBase("Cancelada"))).toEqual(["Confirmada:hecho", "Cancelada:actual"]);
    expect(lineaDeTiempo(reservaBase("Confirmada"))[1].sub).toBe("llega vie 02/10");
  });

  it("seis datos clave: titular, fechas, noches, habitación y ocupación", () => {
    const d = datosClave(reservaBase("En curso"), [{ estado: "Alojado", ingresoReal: "2026-10-02T18:19:00.000Z" }, { estado: "Alojado" }, { estado: "Cancelado" }], "2026-10-02");
    expect(d.titular).toEqual({ principal: "Martín Gutiérrez", sub: "DNI 30512874" });
    expect(d.entrada).toEqual({ principal: "vie 02/10/2026", sub: "ingresó 15:19" });
    expect(d.salida.sub).toBe("hasta las 10:00");
    expect(d.noches).toEqual({ principal: "3", sub: "noche 1 de 3" });
    expect(d.habitacion).toEqual({ principal: "404 · Doble", sub: "piso 4 · capacidad 3" });
    expect(d.ocupacion).toEqual({ principal: "2 adultos · 1 menor", sub: "2 huéspedes registrados" });
  });

  it("reserva grupal: cuenta las habitaciones y suma la ocupación", () => {
    const r = reservaBase("Confirmada");
    r.habitaciones.push({ ...r.habitaciones[0], id: 11, numero: "405", adultos: 1, menores: 0 });
    const d = datosClave(r, [], "2026-10-01");
    expect(d.habitacion).toEqual({ principal: "2 habitaciones", sub: "404 · 405" });
    expect(d.ocupacion).toEqual({ principal: "3 adultos · 1 menor", sub: "reservada" });
  });
});
