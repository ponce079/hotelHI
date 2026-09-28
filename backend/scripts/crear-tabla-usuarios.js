// Usuarios y Seguridad — prepara la base para el login real.
//
//   1) Crea la tabla `usuarios` si todavía no existe (prisma/crear-tabla-usuarios.sql).
//   2) Crea el administrador inicial (admin / admin123) si todavía no hay
//      ningún administrador.
//
// Se puede correr las veces que sea: si la tabla o el admin ya existen, no
// toca nada. Alcanza con que lo corra UNA persona del equipo (la base es
// compartida); los demás solo necesitan `npx prisma generate`.
//
// Antes de correrlo: `npx prisma generate` (para que Prisma conozca el
// modelo Usuario).
//
//   cd backend
//   npx prisma generate
//   node scripts/crear-tabla-usuarios.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/lib/prisma");

async function main() {
  if (!prisma.usuario) {
    console.error("Prisma todavía no conoce el modelo Usuario. Corré primero: npx prisma generate");
    process.exitCode = 1;
    return;
  }

  const sql = fs
    .readFileSync(path.join(__dirname, "..", "prisma", "crear-tabla-usuarios.sql"), "utf8")
    .split(/\r?\n/)
    .filter((linea) => !linea.trim().startsWith("--"))
    .join("\n")
    .trim()
    .replace(/;$/, "");

  console.log("Creando la tabla `usuarios` (si no existe)…");
  await prisma.$executeRawUnsafe(sql);
  console.log("  ✔ Tabla lista.");

  const { asegurarAdminInicial } = require("../src/modulos/usuarios/usuarios.servicio");
  const resultado = await asegurarAdminInicial();
  if (resultado.creado) {
    console.log("  ✔ Administrador inicial creado → usuario: admin · contraseña: admin123");
    console.log("    (cambiá la contraseña desde \"Mi perfil\" después de entrar)");
  } else {
    console.log("  ✔ Ya había un administrador cargado: no se creó otro.");
  }

  const total = await prisma.usuario.count();
  console.log(`\nListo. Usuarios en la base: ${total}.`);
}

main()
  .catch((err) => {
    console.error("\nNo se pudo preparar la tabla de usuarios:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
