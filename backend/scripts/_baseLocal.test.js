const { exigirBaseLocal } = require("./_baseLocal");

const con = (url) => ({ DATABASE_URL: url });

test("acepta las bases en este equipo", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    expect(exigirBaseLocal(con(`mysql://u:p@${host}:3306/hotel`)).hostname).toBe(host);
  }
});

test("se niega con un host remoto, aunque se parezca a uno local", () => {
  for (const host of ["bpgf.mysql.example.com", "localhost.example.com", "127.0.0.1.example.com", "10.0.0.5"]) {
    expect(() => exigirBaseLocal(con(`mysql://u:p@${host}:3306/hotel`))).toThrow(/solo admite una base local/);
  }
});

test("se niega si no hay DATABASE_URL y nombra la acción", () => {
  expect(() => exigirBaseLocal({}, "db push")).toThrow(/DATABASE_URL.*db push/);
});
