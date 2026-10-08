// Sin SEED_USUARIOS_PASSWORD (mínimo 10 caracteres) el seed se niega: no hay contraseña por defecto.
const CONTRASENA_SEED = require("./_contrasenaSeed").exigirContrasena("SEED_USUARIOS_PASSWORD");
// Debe invocarse mediante npm run setup:estadia. No carga .env.
const destino = new URL(process.env.DATABASE_URL || "mysql://sin-configurar");
if (destino.hostname !== "127.0.0.1" || destino.port !== "3308" || destino.pathname !== "/hotelhi_estadia_demo") {
  throw new Error("Este seed solo admite hotelhi_estadia_demo en 127.0.0.1:3308.");
}
const p = require("../src/lib/prisma");
const { hashearContrasena } = require("../src/modulos/usuarios/usuarios.seguridad");
async function main() {
  const temporada =
    (await p.temporada.findFirst({ where: { nivel: "BASE" } })) ||
    (await p.temporada.create({ data: { nombre: "Base local", nivel: "BASE" } }));
  await p.planTarifario.upsert({
    where: { codigo: "BAR" },
    update: {},
    create: {
      codigo: "BAR",
      nombre: "Tarifa flexible",
      tipo: "BASE",
      horasCancelacionSinCargo: 48,
      penalidadNoShow: "PRIMERA_NOCHE",
    },
  });
  for (const [numero, capacidad, nombre, precio] of [
    ["301", 2, "Doble", 100000],
    ["302", 3, "Triple", 130000],
    ["303", 2, "Doble", 100000],
    ["304", 3, "Triple", 130000],
  ]) {
    const tipo = await p.tipoHabitacion.upsert({
      where: { codigo: nombre.toUpperCase() },
      update: {},
      create: { codigo: nombre.toUpperCase(), nombre, ocupacionBase: 2 },
    });
    const vigenteDesde = new Date("2020-01-01");
    await p.tarifa.upsert({
      where: {
        tipoHabitacionId_temporadaId_vigenteDesde: {
          tipoHabitacionId: tipo.id,
          temporadaId: temporada.id,
          vigenteDesde,
        },
      },
      update: {},
      create: {
        tipoHabitacionId: tipo.id,
        temporadaId: temporada.id,
        vigenteDesde,
        precioBase: precio,
        adicionalAdultoExtra: 20000,
      },
    });
    await p.habitacion.upsert({
      where: { numero },
      update: {},
      create: { numero, capacidad, tipoHabitacionId: tipo.id, piso: 3 },
    });
  }
  for (let diaSemana = 0; diaSemana < 7; diaSemana++)
    await p.modificadorDiaSemana.upsert({ where: { diaSemana }, update: {}, create: { diaSemana, porcentaje: 0 } });
  const passwordHash = await hashearContrasena(CONTRASENA_SEED);
  for (const [i, rol] of ["recepcionista", "gerente", "admin"].entries()) {
    await p.usuario.upsert({
      where: { usuario: `${rol}.prueba` },
      update: {},
      create: {
        usuario: `${rol}.prueba`,
        nombre: "Prueba",
        apellido: rol,
        dni: String(11000001 + i),
        rol,
        passwordHash,
        activo: true,
      },
    });
  }
  console.log(
    "Base local preparada: habitaciones 301–304. " +
      "Usuario recepcionista.prueba / contraseña (definida en SEED_USUARIOS_PASSWORD)",
  );
  console.log("Volver a ejecutar no borra reservas, no cambia estados ni restablece contraseñas existentes.");
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
