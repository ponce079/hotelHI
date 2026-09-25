// Pruebas de la validación de datos del huésped en el alta/edición de
// reservas (HU-36/HU-39/HU-42, ReservaWizard.jsx). Se prueba la función
// pura sin montar componentes para mantener este chequeo rápido.
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

const HUESPED_VACIO = {
  nombre: "",
  tipoDocumento: "DNI",
  numeroDocumento: "",
  contacto: "",
  preferencias: "",
};

const HUESPED_COMPLETO = {
  nombre: "Ana Pérez",
  tipoDocumento: "DNI",
  numeroDocumento: "30111222",
  contacto: "ana@mail.com",
  preferencias: "",
};

prueba("formulario vacío: bloquea nombre, documento y correo", () => {
  const errores = validarHuesped(HUESPED_VACIO);
  assert.ok(errores.nombre, "nombre debería tener error");
  assert.ok(errores.numeroDocumento, "numeroDocumento debería tener error");
  assert.ok(errores.contacto, "contacto debería tener error");
});

prueba("falta solo el nombre: bloquea únicamente ese campo", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, nombre: "" });
  assert.ok(errores.nombre);
  assert.equal(errores.numeroDocumento, undefined);
  assert.equal(errores.contacto, undefined);
});

prueba("un documento con solo espacios en blanco cuenta como vacío", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, numeroDocumento: "   " });
  assert.ok(errores.numeroDocumento);
});

prueba("todo correcto: no bloquea ningún campo", () => {
  assert.deepEqual(validarHuesped(HUESPED_COMPLETO), {});
});

prueba("sin correo: bloquea la reserva porque no se puede enviar la confirmación", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "" });
  assert.ok(errores.contacto);
});

prueba("correo con solo espacios: cuenta como vacío", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "   " });
  assert.ok(errores.contacto);
});

prueba("correo sin arroba: bloquea la reserva", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "correo-invalido.com" });
  assert.ok(errores.contacto);
});

prueba("correo sin dominio completo: bloquea la reserva", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "ana@localhost" });
  assert.ok(errores.contacto);
});

prueba("acepta direcciones de distintos proveedores", () => {
  for (const contacto of ["persona@gmail.com", "persona@outlook.com", "reservas@hotel.com.ar"]) {
    assert.deepEqual(validarHuesped({ ...HUESPED_COMPLETO, contacto }), {});
  }
});

prueba("ignora espacios exteriores en un correo válido", () => {
  assert.deepEqual(validarHuesped({ ...HUESPED_COMPLETO, contacto: "  ana@mail.com  " }), {});
});

console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
if (fallaron.length > 0) process.exit(1);

