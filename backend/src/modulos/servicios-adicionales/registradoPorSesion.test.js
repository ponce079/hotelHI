// "Registrado por" de un consumo es el usuario de la sesión: lo que mande el cuerpo no puede atribuirlo a otro.
jest.mock("./serviciosAdicionales.servicio", () => {
  class ErrorDeNegocio extends Error {}
  return { registrarConsumo: jest.fn(), ErrorDeNegocio };
});
jest.mock("../../lib/erroresConexion", () => ({ responderEsperaConexion: () => false }));
const servicio = require("./serviciosAdicionales.servicio");
const { postConsumo } = require("./serviciosAdicionales.controlador");

function respuesta() {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
}

test("el autor del consumo sale de la sesión, aunque el cuerpo diga otro nombre", async () => {
  servicio.registrarConsumo.mockResolvedValue({ id: 1 });
  const res = respuesta();
  await postConsumo({ usuarioActual: { usuario: "recepcionista.prueba" }, body: { reservaId: 1, registradoPor: "Otra Persona" } }, res);
  expect(servicio.registrarConsumo).toHaveBeenCalledWith(expect.objectContaining({ registradoPor: "recepcionista.prueba", reservaId: 1 }));
  expect(res.status).toHaveBeenCalledWith(201);
});
