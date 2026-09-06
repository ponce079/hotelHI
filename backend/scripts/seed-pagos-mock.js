// scripts/seed-pagos-mock.js
// Mock personal de Gimena para poder probar el modulo de Pagos
// (HU-76/77) sin esperar a que Comprobantes (HU-72 a 75, Tomás/Agustín)
// este construido. Crea 2 facturas de prueba sobre los proveedores de
// seed-proveedores.js. BORRAR este script (o dejar de correrlo) una vez
// que el modulo real de Comprobantes este mergeado a master.
// Correr con: node scripts/seed-pagos-mock.js

require("dotenv").config();
const prisma = require("../src/lib/prisma");

async function main() {
  const norte = await prisma.proveedor.findUnique({ where: { cuit: "30-71234567-9" } });
  const andes = await prisma.proveedor.findUnique({ where: { cuit: "33-70112233-8" } });
  if (!norte || !andes) {
    throw new Error("Corré primero: node scripts/seed-proveedores.js");
  }

  const FACTURAS = [
    { proveedorId: norte.id, tipo: "Factura", numero: "FC-A 0001-00012345", importeTotal: 121000 },
    { proveedorId: andes.id, tipo: "Factura", numero: "FC-A 0002-00009988", importeTotal: 54450 },
  ];

  for (const f of FACTURAS) {
    const factura = await prisma.comprobanteProveedor.upsert({
      where: { proveedorId_tipo_numero: { proveedorId: f.proveedorId, tipo: f.tipo, numero: f.numero } },
      update: {},
      create: f,
    });
    console.log("OK:", factura.numero, "total:", factura.importeTotal.toString());
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
