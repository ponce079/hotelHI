require("dotenv").config();

async function main() {
  const prisma = require("../src/lib/prisma");
  try {
    await prisma.$queryRaw`SELECT 1`;
    const habitaciones = await prisma.habitacion.count();
    console.log(`Base conectada y tabla de habitaciones disponible (${habitaciones} habitaciones).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("No se pudo validar la base:", error.message);
  process.exitCode = 1;
});
