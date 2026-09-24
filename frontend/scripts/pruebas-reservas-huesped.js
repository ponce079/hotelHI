// Pruebas de la validaciÃ³n de datos del huÃ©sped en el alta/ediciÃ³n de
// reservas (HU-36/HU-39/HU-42, ReservaWizard.jsx). Se prueba la funciÃ³n
// pura sin montar componentes para mantener este chequeo rÃ¡pido.
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
    console.log(`  âœ” ${nombre}`);
  } catch (err) {
    fallaron.push({ nombre, err });
    console.log(`  âœ˜ ${nombre}\n      ${err.message}`);
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
  nombre: "Ana PÃ©rez",
  tipoDocumento: "DNI",
  numeroDocumento: "30111222",
  contacto: "ana@mail.com",
  preferencias: "",
};

prueba("formulario vacÃ­o: bloquea nombre, documento y correo", () => {
  const errores = validarHuesped(HUESPED_VACIO);
  assert.ok(errores.nombre, "nombre deberÃ­a tener error");
  assert.ok(errores.numeroDocumento, "numeroDocumento deberÃ­a tener error");
  assert.ok(errores.contacto, "contacto deberÃ­a tener error");
});

prueba("falta solo el nombre: bloquea Ãºnicamente ese campo", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, nombre: "" });
  assert.ok(errores.nombre);
  assert.equal(errores.numeroDocumento, undefined);
  assert.equal(errores.contacto, undefined);
});

prueba("un documento con solo espacios en blanco cuenta como vacÃ­o", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, numeroDocumento: "   " });
  assert.ok(errores.numeroDocumento);
});

prueba("todo correcto: no bloquea ningÃºn campo", () => {
  assert.deepEqual(validarHuesped(HUESPED_COMPLETO), {});
});

prueba("sin correo: bloquea la reserva porque no se puede enviar la confirmaciÃ³n", () => {
  const errores = validarHuesped({ ...HUESPED_COMPLETO, contacto: "" });
  assert.ok(errores.contacto);
});

prueba("correo con solo espacios: cuenta como vacÃ­o", () => {
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

prueba("ignora espacios exteriores en un correo vÃ¡lido", () => {
  assert.deepEqual(validarHuesped({ ...HUESPED_COMPLETO, contacto: "  ana@mail.com  " }), {});
});

console.log(`\n${pasaron} pruebas OK, ${fallaron.length} con error.`);
if (fallaron.length > 0) process.exit(1);

