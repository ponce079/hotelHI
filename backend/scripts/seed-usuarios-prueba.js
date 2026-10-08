// scripts/seed-usuarios-prueba.js
//
// Un usuario de prueba por cada rol válido del sistema, para que todo el
// equipo pueda loguearse mientras prueba su parte sin tener que pedirle al
// admin que le dé de alta un usuario a mano. Reusa TAL CUAL el módulo de
// Usuarios y Seguridad de Tomás (ROLES_USUARIO, ETIQUETAS_ROL, LIMITES_USUARIO
// y hashearContrasena de usuarios.seguridad.js) — no reimplementa ninguna
// validación ni ningún hash propio.
//
// Idempotente: corrido de nuevo, actualiza (contraseña, activo=true,
// intentosFallidos=0, sin bloqueo) en vez de duplicar. Nunca se toca el
// admin real que ya haya creado el equipo — solo los `*.prueba`.
//
// Contraseña: SEED_USUARIOS_PASSWORD (terminal o .env), OBLIGATORIA, mínimo 10 caracteres: no hay una por
// defecto. Es la misma para los 6 usuarios y nunca se imprime. Nunca se guarda en texto plano: se hashea con la
// misma función que usa el login real.
//
//   node scripts/seed-usuarios-prueba.js

require("dotenv").config();
// Sin SEED_USUARIOS_PASSWORD (o con menos de 10 caracteres) el script se niega, con un mensaje claro.
let CONTRASENA;
try {
  CONTRASENA = require("./_contrasenaSeed").exigirContrasena("SEED_USUARIOS_PASSWORD");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (process.env.NODE_ENV === "production") {
  console.error(
    "seed-usuarios-prueba.js crea usuarios con una contraseña conocida por todo el equipo: " +
      "nunca se corre con NODE_ENV=production. Abortado."
  );
  process.exit(1);
}

const prisma = require("../src/lib/prisma");
const { hashearContrasena } = require("../src/modulos/usuarios/usuarios.seguridad");
const { ROLES_USUARIO, ETIQUETAS_ROL } = require("../src/modulos/usuarios/usuarios.constantes");


// DNIs de prueba, uno por rol — 7/8 dígitos (REGEX_DNI), @unique en el
// modelo. Rango 100000001+ para que nunca choque con un DNI real cargado a
// mano ni con el admin inicial ("00000000", ver ADMIN_INICIAL en
// usuarios.constantes.js).
const DNI_POR_ROL = Object.fromEntries(ROLES_USUARIO.map((rol, i) => [rol, String(10000001 + i)]));

async function main() {
  console.log("Contraseña de los usuarios de prueba: la de SEED_USUARIOS_PASSWORD (no se muestra).\n");

  const passwordHash = await hashearContrasena(CONTRASENA);
  const filas = [];

  for (const rol of ROLES_USUARIO) {
    const usuario = `${rol}.prueba`;
    const etiquetaRol = ETIQUETAS_ROL[rol] ?? rol;
    // "Nombre visible: Prueba <Rol>" — nombre/apellido son campos separados
    // en el modelo (mismo criterio que ADMIN_INICIAL: nombre="Administrador",
    // apellido="General"), así que "Prueba" va de nombre y la etiqueta del
    // rol de apellido.
    const datosPersonales = { nombre: "Prueba", apellido: etiquetaRol, dni: DNI_POR_ROL[rol], email: null };

    const resultado = await prisma.usuario.upsert({
      where: { usuario },
      update: {
        ...datosPersonales,
        rol,
        passwordHash,
        activo: true,
        intentosFallidos: 0,
        bloqueadoHasta: null,
      },
      create: {
        usuario,
        ...datosPersonales,
        rol,
        passwordHash,
        activo: true,
      },
    });

    filas.push({ usuario: resultado.usuario, rol: resultado.rol });
  }

  const anchoUsuario = Math.max(...filas.map((f) => f.usuario.length), "usuario".length);
  const anchoRol = Math.max(...filas.map((f) => f.rol.length), "rol".length);
  console.log(`${"usuario".padEnd(anchoUsuario)} | ${"rol".padEnd(anchoRol)} | contraseña`);
  console.log(`${"-".repeat(anchoUsuario)} | ${"-".repeat(anchoRol)} | ${"-".repeat(CONTRASENA.length)}`);
  for (const f of filas) {
    console.log(`${f.usuario.padEnd(anchoUsuario)} | ${f.rol.padEnd(anchoRol)} | ${CONTRASENA}`);
  }
  console.log(`\nListo. ${filas.length} usuarios de prueba (uno por rol), activos y sin bloqueo.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
