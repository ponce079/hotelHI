// GET /api/web/planes (etapa 2): solo planes activos y visibles en la web,
// con exactamente los campos del contrato y sin claves prohibidas.
jest.mock("../../lib/prisma", () => ({ planTarifario: { findMany: jest.fn() } }));
const prisma = require("../../lib/prisma");
const { getPlanes } = require("./ecommerce.controlador");

const CLAVES_PROHIBIDAS = ["habitacionId", "numero", "huesped", "detalle", "codigoConfirmacion"];

function clavesProhibidas(valor, ruta = "$") {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => clavesProhibidas(v, `${ruta}[${i}]`));
  if (!valor || typeof valor !== "object") return [];
  return Object.entries(valor).flatMap(([clave, v]) => [
    ...(CLAVES_PROHIBIDAS.includes(clave) ? [`${ruta}.${clave}`] : []),
    ...clavesProhibidas(v, `${ruta}.${clave}`),
  ]);
}

async function llamar() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await getPlanes({}, res);
  return res.json.mock.calls[0][0];
}

test("filtra activos y visibles en la web y devuelve exactamente los campos del contrato", async () => {
  prisma.planTarifario.findMany.mockResolvedValue([
    { id: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
    { id: 2, codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: 24, penalidadNoShow: "TOTAL_ESTADIA" },
  ]);
  const body = await llamar();
  expect(prisma.planTarifario.findMany.mock.calls[0][0].where).toEqual({ activo: true, visibleWeb: true });
  expect(body).toEqual({
    planes: [
      { planTarifarioId: 1, codigo: "BAR", nombre: "Best Available Rate", reembolsable: true, horasCancelacionSinCargo: 48, penalidadNoShow: "PRIMERA_NOCHE" },
      // horasCancelacionSinCargo es null cuando el plan no es reembolsable.
      { planTarifarioId: 2, codigo: "NRF", nombre: "No Reembolsable", reembolsable: false, horasCancelacionSinCargo: null, penalidadNoShow: "TOTAL_ESTADIA" },
    ],
  });
  expect(clavesProhibidas(body)).toEqual([]);
});
