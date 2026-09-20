// Pruebas de la validación de datos del huésped en el alta/edición de
// reservas (HU-36/HU-39/HU-42, ReservaWizard.jsx). Mismo criterio que
// pruebas-checkin-walkin.js: sin framework de componentes (no hay
// vitest/jsdom en el repo), se prueba la función de validación pura.
//
//   node scripts/pruebas-reservas-huesped.js

import assert from "node:assert";
import { validarHuesped } from "../src/modulos/reservas/validarHuesped.js";

let pasaron = 0;
const fallaron = [];

function prueba(nombre, fn) {
  try {
    fn();
    pasaron += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (err) {
    fallaron.push({ nombre, err });
    console.log(`  ✘ ${nombre}\n      ${err.message}`);
  }
}

const HUESPED_VACIO = { nombre: "", tipoDocumento: "DNI", numeroDocumento: "", contacto: "", preferencias: "" };
const HUESPED_COMPLETO = { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com", preferencias: "" };

prueba("formulario vacío: bloquea nombre y número de documento", () => {
  const errores = validarHuesped(HUESPED_VACIO);
  assert.ok(errores.nombre, "nombre debería tener error");
  assert.ok(errores.numeroDocumento, "numeroDocumento debería tener error");
});

prueba("falta solo el nombre: bloquea únicamente ese campo", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, nombre: "" });
  assert.ok(errores.nombre);
  assert.equal(errores.numeroDocumento, undefined);
});

prueba("un campo con solo espacios en blanco cuenta como vacío", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, numeroDocumento: "   " });
  assert.ok(errores.numeroDocumento);
});

prueba("todo correcto (con contacto): no bloquea nada", () => {
  const errores = validarHuesped(HUESPED_COMPLETO);
  assert.deepEqual(errores, {});
});

// A diferencia de Check-in walk-in, acá el contacto es opcional a
// propósito (ver el aviso de ReservaWizard.jsx sobre "aviso interno para
// el mostrador" cuando no hay contacto): una reserva sin contacto tiene
// que poder confirmarse igual, siempre que nombre y documento estén.
prueba("sin contacto: NO bloquea (es opcional por diseño en Reservas, a diferencia de Check-in walk-in)", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "" });
  assert.deepEqual(errores, {}, "contacto vacío no debería generar error acá");
});

console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
if (fallaron.length > 0) process.exit(1);
