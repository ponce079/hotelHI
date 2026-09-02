// scripts/seed-proveedores.js
// Carga un padrón chico de proveedores de ejemplo para poder probar
// Requerimientos, Presupuestos, Órdenes de Compra, Comprobantes y Pagos
// sin esperar a que exista la pantalla de alta de Proveedores (HU-18).
// Correr con: node scripts/seed-proveedores.js

require("dotenv").config();
const prisma = require("../src/lib/prisma");

const PROVEEDORES = [
  {
    razonSocial: "Distribuidora Norte S.A.",
    cuit: "30-71234567-9",
    contacto: "Marcela Ávila",
    email: "ventas@distnorte.com.ar",
    telefono: "11 4732-8890",
    direccion: "Av. San Martín 2450, CABA",
    condicionComercial: "30 días cta. cte.",
    rubros: ["Alimentos", "Bebidas"],
  },
  {
    razonSocial: "Química Andes S.A.",
    cuit: "33-70112233-8",
    contacto: "Lucía Ferreyra",
    email: "lferreyra@qandes.com",
    telefono: "351 428-7712",
    direccion: "Parque Industrial Córdoba",
    condicionComercial: "Contado",
    rubros: ["Limpieza"],
  },
  {
    razonSocial: "Insumos Hoteleros Pampa S.R.L.",
    cuit: "30-71555888-2",
    contacto: "Diego Sanmartino",
    email: "ventas@pampains.com.ar",
    telefono: "11 4011-6620",
    direccion: "Colectora Oeste 1180, Vicente López",
    condicionComercial: "30 días cta. cte.",
    rubros: ["Amenities", "Limpieza"],
  },
];

async function main() {
  for (const { rubros, ...datos } of PROVEEDORES) {
    const proveedor = await prisma.proveedor.upsert({
      where: { cuit: datos.cuit },
      update: {},
      create: datos,
    });
    for (const rubro of rubros) {
      await prisma.proveedorRubro.upsert({
        where: { proveedorId_rubro: { proveedorId: proveedor.id, rubro } },
        update: {},
        create: { proveedorId: proveedor.id, rubro },
      });
    }
    console.log("OK:", proveedor.razonSocial, "id:", proveedor.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
