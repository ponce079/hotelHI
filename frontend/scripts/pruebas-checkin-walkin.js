// Pruebas de la validación de datos del huésped en Check-in walk-in
// (HU-39/HU-44). El frontend no tiene infraestructura de testing de
// componentes (no hay vitest/jsdom/RTL en el repo) — mismo criterio liviano
// que backend/scripts/pruebas-*.js: sin framework, `assert` + un runner a
// mano. Por eso `validarHuesped` vive en su propio módulo sin JSX
// (validarHuesped.js), separado de CheckInWalkIn.jsx: es lo que hace falta
// para poder importarlo acá con Node puro.
//
//   node scripts/pruebas-checkin-walkin.js

import assert from "node:assert";
import { validarHuesped } from "../src/modulos/check-in/validarHuesped.js";

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

const HUESPED_VACIO = { nombre: "", tipoDocumento: "DNI", numeroDocumento: "", contacto: "" };
const HUESPED_COMPLETO = { nombre: "Ana Pérez", tipoDocumento: "DNI", numeroDocumento: "30111222", contacto: "ana@mail.com" };

prueba("formulario vacío: bloquea los 3 campos obligatorios (nombre, documento, contacto)", () => {
  const errores = validarHuesped(HUESPED_VACIO);
  assert.ok(errores.nombre, "nombre debería tener error");
  assert.ok(errores.numeroDocumento, "numeroDocumento debería tener error");
  assert.ok(errores.contacto, "contacto debería tener error");
});

prueba("falta solo el contacto: bloquea únicamente ese campo, no los otros dos", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "" });
  assert.equal(errores.nombre, undefined);
  assert.equal(errores.numeroDocumento, undefined);
  assert.ok(errores.contacto);
});

prueba("un campo con solo espacios en blanco cuenta como vacío (no alcanza con .length > 0)", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, nombre: "   " });
  assert.ok(errores.nombre);
});

prueba("todo correcto: no bloquea nada, el formulario queda válido para avanzar", () => {
  const errores = validarHuesped(HUESPED_COMPLETO);
  assert.deepEqual(errores, {});
});

// El contacto acá es "email o teléfono" en un solo campo indistinto (no dos
// campos separados) — por eso NO hay un caso de "email mal formado": según
// el propio criterio pedido para este campo, si acepta teléfono o email
// indistinto solo se valida que no esté vacío. Forzar un regex de email acá
// rechazaría un teléfono válido, que es exactamente lo que el campo dice
// aceptar.
prueba("contacto puede ser un teléfono sin arroba: no se exige formato de email (campo indistinto)", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "1122334455" });
  assert.deepEqual(errores, {}, "un teléfono tiene que pasar la validación igual que un email");
});

console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
if (fallaron.length > 0) process.exit(1);
