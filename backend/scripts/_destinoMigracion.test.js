const { exigirDestino } = require("./_destinoMigracion");

const REMOTA = "mysql://usuario:clave@bd.ejemplo-remoto.com:3306/base_compartida";
const LOCAL = "mysql://usuario:clave@127.0.0.1:3306/hotelhi_ensayo";
const nuncaPregunta = () => {
  throw new Error("no debería preguntar");
};

test("por defecto sigue bloqueando todo lo que no sea local", async () => {
  await expect(exigirDestino({ DATABASE_URL: REMOTA }, "la migración", { preguntar: nuncaPregunta })).rejects.toThrow(
    /solo admite una base local/,
  );
  expect((await exigirDestino({ DATABASE_URL: LOCAL }, "la migración", { preguntar: nuncaPregunta })).hostname).toBe(
    "127.0.0.1",
  );
});

test("con CONFIRMAR_BASE_COMPARTIDA distinta de la base de la URL, se niega sin preguntar", async () => {
  const env = { DATABASE_URL: REMOTA, CONFIRMAR_BASE_COMPARTIDA: "otra_base" };
  await expect(exigirDestino(env, "la migración", { preguntar: nuncaPregunta })).rejects.toThrow(/no coincide/);
});

test("con la variable correcta, pide escribir el nombre de la base y muestra host y base sin credenciales", async () => {
  const env = { DATABASE_URL: REMOTA, CONFIRMAR_BASE_COMPARTIDA: "base_compartida" };
  let mostrado = "";
  const url = await exigirDestino(env, "la migración", {
    preguntar: async (texto) => {
      mostrado = texto;
      return "base_compartida";
    },
  });
  expect(url.hostname).toBe("bd.ejemplo-remoto.com");
  expect(mostrado).toMatch(/"base_compartida" en bd\.ejemplo-remoto\.com/);
  expect(mostrado).not.toMatch(/usuario|clave/);
  // Otra respuesta cancela.
  await expect(exigirDestino(env, "la migración", { preguntar: async () => "si" })).rejects.toThrow(/cancelada/);
});

test("la verificación de solo lectura no pide teclado, pero exige la variable para lo remoto", async () => {
  await expect(
    exigirDestino({ DATABASE_URL: REMOTA }, "la verificación", { confirmarPorTeclado: false, preguntar: nuncaPregunta }),
  ).rejects.toThrow(/solo admite una base local/);
  const url = await exigirDestino(
    { DATABASE_URL: REMOTA, CONFIRMAR_BASE_COMPARTIDA: "base_compartida" },
    "la verificación",
    { confirmarPorTeclado: false, preguntar: nuncaPregunta },
  );
  expect(url.pathname).toBe("/base_compartida");
});
