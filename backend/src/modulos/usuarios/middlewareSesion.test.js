// Con la API cerrada, el token se verifica y el usuario se lee UNA sola vez por pedido (cada consulta cuesta
// cientos de milisegundos contra la base remota).
jest.mock("./usuarios.servicio", () => ({ obtenerUsuarioParaSesion: jest.fn() }));
jest.mock("./usuarios.seguridad", () => ({ verificarToken: jest.fn() }));
const servicio = require("./usuarios.servicio");
const seguridad = require("./usuarios.seguridad");
const { requiereSesion } = require("./usuarios.middleware");

function respuesta() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

test("la segunda comprobación de sesión del mismo pedido no vuelve a leer al usuario", async () => {
  seguridad.verificarToken.mockReturnValue({ id: 3 });
  servicio.obtenerUsuarioParaSesion.mockResolvedValue({ id: 3, usuario: "recepcionista.prueba", rol: "recepcionista" });
  const req = { headers: { authorization: "Bearer abc" } };
  const siguiente = jest.fn();
  await requiereSesion(req, respuesta(), siguiente); // la API cerrada
  await requiereSesion(req, respuesta(), siguiente); // el router de la ruta
  expect(servicio.obtenerUsuarioParaSesion).toHaveBeenCalledTimes(1);
  expect(siguiente).toHaveBeenCalledTimes(2);
  expect(req.usuarioActual.rol).toBe("recepcionista");
});

test("un pedido nuevo sin sesión previa sigue verificando el token y el usuario", async () => {
  seguridad.verificarToken.mockReturnValue(null);
  const res = respuesta();
  const siguiente = jest.fn();
  await requiereSesion({ headers: {} }, res, siguiente);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(siguiente).not.toHaveBeenCalled();
});
