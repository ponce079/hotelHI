jest.mock("../../lib/prisma", () => ({}));
const { claveDocumento, vincularPersona } = require("./persona.servicio");

test("la identidad incluye país y tipo, y normaliza nombres del catálogo", () => {
  const persona = {
    tipoDocumento: "Pasaporte",
    paisDocumento: "AR",
    numeroDocumento: "ab 123",
  };
  expect(claveDocumento(persona)).toBe(
    claveDocumento({
      ...persona,
      paisDocumento: "Argentina",
      numeroDocumento: "AB123",
    }),
  );
  expect(claveDocumento(persona)).not.toBe(claveDocumento({ ...persona, paisDocumento: "BR" }));
  expect(claveDocumento(persona)).not.toBe(claveDocumento({ ...persona, tipoDocumento: "DNI" }));
});

test("sin documento crea una ficha vinculable sin inventar un número", async () => {
  const tx = { huesped: { create: jest.fn().mockResolvedValue({ id: 12 }) } };
  expect(await vincularPersona(tx, {}, { nombre: "Ana", apellido: "Prueba" })).toBe(12);
  expect(tx.huesped.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ numeroDocumento: "" }),
    }),
  );
  expect(await vincularPersona(tx, {}, {}, { huespedId: 12 })).toBe(12);
  expect(tx.huesped.create).toHaveBeenCalledTimes(1);
});

test("normalizarPais reconoce cualquier país del catálogo ISO, no solo los limítrofes", () => {
  const { normalizarPais } = require("./persona.servicio");
  expect(normalizarPais("Perú")).toBe("PE");
  expect(normalizarPais("estados unidos")).toBe("US");
  expect(normalizarPais("jp")).toBe("JP");
  expect(normalizarPais("Otro país")).toBe("OTROPAIS");
  expect(claveDocumento({ tipoDocumento: "DNI", paisDocumento: "España", numeroDocumento: "1" })).toBe(
    claveDocumento({ tipoDocumento: "DNI", paisDocumento: "ES", numeroDocumento: "1" }),
  );
});

test("actualizarResidencia con la casilla de actualizar guarda los últimos datos declarados y no borra con vacíos", async () => {
  const { actualizarResidencia } = require("./persona.servicio");
  const tx = { huesped: { update: jest.fn() } };
  await actualizarResidencia(tx, 7, { nacionalidad: "AR", paisResidencia: "UY", domicilio: null, localidad: "" }, { sobrescribir: true });
  expect(tx.huesped.update).toHaveBeenCalledWith({
    where: { id: 7 },
    data: { nacionalidad: "AR", paisResidencia: "UY" },
  });
  tx.huesped.update.mockClear();
  await actualizarResidencia(tx, 7, { nacionalidad: null }, { sobrescribir: true });
  expect(tx.huesped.update).not.toHaveBeenCalled();
});

test("actualizarResidencia SIN la casilla nunca pisa un dato de la ficha: solo completa los vacíos, en una sola sentencia", async () => {
  const { actualizarResidencia } = require("./persona.servicio");
  const tx = { huesped: { update: jest.fn() }, $executeRaw: jest.fn() };
  await actualizarResidencia(tx, 7, { nacionalidad: "AR", paisResidencia: "UY", domicilio: null, localidad: "" });
  expect(tx.huesped.update).not.toHaveBeenCalled();
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  const sql = tx.$executeRaw.mock.calls[0][0].sql;
  expect(sql).toMatch(/NULLIF\(nacionalidad, ''\)/);
  expect(sql).toMatch(/NULLIF\(paisResidencia, ''\)/);
  expect(sql).not.toMatch(/domicilio|localidad/);
});

test("actualizarResidenciaEnLote usa una sola sentencia sin importar cuántas fichas haya", async () => {
  const { actualizarResidenciaEnLote } = require("./persona.servicio");
  const tx = { $executeRaw: jest.fn() };
  const filas = Array.from({ length: 25 }, (_, i) => ({ huespedId: i + 1, residencia: { nacionalidad: "AR" } }));
  await actualizarResidenciaEnLote(tx, filas);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  await actualizarResidenciaEnLote(tx, [{ huespedId: 1, residencia: { nacionalidad: null } }]);
  expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
});

test("una ficha con identidad provisoria se completa como una sin identidad", async () => {
  const { esProvisoria, PREFIJO_SIN_DOCUMENTO } = require("./persona.servicio");
  expect(esProvisoria({ identidadDocumento: null })).toBe(true);
  expect(esProvisoria({ identidadDocumento: `${PREFIJO_SIN_DOCUMENTO}abc` })).toBe(true);
  expect(esProvisoria({ identidadDocumento: "a".repeat(64) })).toBe(false);
  const persona = { nombre: "Ana", apellido: "P", tipoDocumento: "DNI", paisDocumento: "AR", numeroDocumento: "123" };
  const tx = {
    huesped: {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 9, identidadDocumento: `${PREFIJO_SIN_DOCUMENTO}abc` })
        .mockResolvedValueOnce(null),
      update: jest.fn(),
    },
  };
  expect(await vincularPersona(tx, {}, persona, { huespedId: 9 })).toBe(9);
  expect(tx.huesped.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ identidadDocumento: expect.any(String) }) }),
  );
});

// ---- Regla 2.3: el nombre de una ficha existente no se cambia en silencio ("Nombre Pisado") ----
describe("nombre de una ficha existente (regla 2.3)", () => {
  const { sincronizarNombres, autorizarCambioDeNombre } = require("./persona.servicio");
  const persona = { tipoDocumento: "Pasaporte", paisDocumento: "AR", numeroDocumento: "PRUEBA-DIAG-2", nombre: "Nombre", apellido: "Pisado" };
  const ficha = { id: 168, nombre: "Acompanante Diagnostico", nombres: "Acompanante", apellido: "Diagnostico", identidadDocumento: claveDocumento(persona) };

  function cliente() {
    return {
      huesped: { findUnique: jest.fn().mockResolvedValue(ficha), update: jest.fn(), create: jest.fn() },
      eventoEstadia: { create: jest.fn() },
    };
  }

  test("agregar una persona con el documento de una ficha y OTRO nombre → 409 NOMBRE_DISTINTO y la ficha no se toca", async () => {
    const tx = cliente();
    await expect(vincularPersona(tx, { huesped: null }, persona, null)).rejects.toMatchObject({ statusCode: 409, codigo: "NOMBRE_DISTINTO" });
    expect(tx.huesped.update).not.toHaveBeenCalled();
    expect(tx.huesped.create).not.toHaveBeenCalled();
  });

  test("con el MISMO nombre (aunque cambien tildes, mayúsculas o espacios) reutiliza la ficha sin escribir nada", async () => {
    const tx = cliente();
    const id = await vincularPersona(tx, { huesped: null }, { ...persona, nombre: "ACOMPAÑANTE ", apellido: "diagnostico" }, null);
    expect(id).toBe(168);
    expect(tx.huesped.update).not.toHaveBeenCalled();
  });

  test("un administrador SIN motivo → 400 con el campo; CON motivo cambia el nombre y lo deja en el log y en el historial", async () => {
    const tx = cliente();
    await expect(vincularPersona(tx, { huesped: null }, persona, null, { esAdmin: true })).rejects.toMatchObject({
      statusCode: 400,
      codigo: "MOTIVO_CAMBIO_NOMBRE",
      campos: { motivoCambioNombre: expect.any(String) },
    });
    const log = jest.spyOn(console, "info").mockImplementation(() => {});
    await vincularPersona(tx, { huesped: null }, persona, null, { esAdmin: true, motivo: "error de tipeo", usuario: "admin", reservaId: 9 });
    expect(tx.huesped.update).toHaveBeenCalledWith({ where: { id: 168 }, data: expect.objectContaining({ nombre: "Nombre Pisado" }) });
    expect(log).toHaveBeenCalledWith("[ficha] Cambio de nombre autorizado:", expect.stringContaining('"nombreAnterior":"Acompanante Diagnostico"'));
    const registro = JSON.parse(log.mock.calls[0][1]);
    expect(registro).toMatchObject({ usuario: "admin", fichaId: 168, nombreAnterior: "Acompanante Diagnostico", nombreNuevo: "Nombre Pisado", motivo: "error de tipeo", reservaId: 9 });
    expect(tx.eventoEstadia.create.mock.calls[0][0].data).toMatchObject({ reservaId: 9, accion: "Corrección de nombre de la ficha", operador: "admin" });
    log.mockRestore();
  });

  test("sin una reserva de contexto (ficha de huésped) el cambio igual queda en el log del servidor", async () => {
    const tx = cliente();
    const log = jest.spyOn(console, "info").mockImplementation(() => {});
    await sincronizarNombres(tx, 168, persona, { esAdmin: true, motivo: "corrección", usuario: "admin" });
    expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({ usuario: "admin", fichaId: 168, motivo: "corrección", reservaId: null });
    expect(tx.eventoEstadia.create).not.toHaveBeenCalled();
    log.mockRestore();
  });

  test("sincronizarNombres: nombre distinto de un recepcionista → rechazado; mismo nombre → sin escritura", async () => {
    const tx = cliente();
    await expect(sincronizarNombres(tx, 168, persona, {})).rejects.toMatchObject({ codigo: "NOMBRE_DISTINTO" });
    await sincronizarNombres(tx, 168, { nombre: "Acompanante", apellido: "Diagnostico" }, {});
    expect(tx.huesped.update).not.toHaveBeenCalled();
  });

  test("ficha creada en paralelo (P2002): se relee la existente y se usa sin pisarla", async () => {
    const tx = cliente();
    tx.huesped.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(ficha);
    tx.huesped.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const mismoNombre = { ...persona, nombre: "Acompanante", apellido: "Diagnostico" };
    await expect(vincularPersona(tx, { huesped: null }, mismoNombre, null)).resolves.toBe(168);
    expect(tx.huesped.update).not.toHaveBeenCalled();
  });

  test("autorizarCambioDeNombre: sin diferencia no hay nada que autorizar", () => {
    expect(autorizarCambioDeNombre(ficha, { nombre: "Acompanante", apellido: "Diagnostico" }, {})).toBe(false);
  });
});

// ---- Fichas viejas: el nombre completo en un solo campo, sin nombres ni apellido ----
describe("ficha vieja con el nombre sin separar", () => {
  const { sincronizarNombres, separacionDeNombre } = require("./persona.servicio");
  const vieja = { id: 77, nombre: "Ricardo Ponce", nombres: null, apellido: null };

  test("la separación según el documento (mismo nombre completo) se guarda sin pedir administrador", async () => {
    const tx = { huesped: { findUnique: jest.fn().mockResolvedValue(vieja), update: jest.fn() }, eventoEstadia: { create: jest.fn() } };
    await sincronizarNombres(tx, 77, { nombre: "Ricardo", apellido: "Ponce" }, {});
    expect(tx.huesped.update).toHaveBeenCalledWith({ where: { id: 77 }, data: { nombre: "Ricardo Ponce", nombres: "Ricardo", apellido: "Ponce" } });
    expect(tx.eventoEstadia.create).not.toHaveBeenCalled();
  });

  test("nombres compuestos: se respeta la separación que eligió la recepción", () => {
    const ficha = { nombre: "María José De la Cruz", nombres: "", apellido: "" };
    expect(separacionDeNombre(ficha, { nombre: "María José", apellido: "De la Cruz" })).toEqual({
      nombre: "María José De la Cruz", nombres: "María José", apellido: "De la Cruz",
    });
  });

  test("otro nombre completo sigue siendo un cambio de nombre (regla 2.3): no es una separación", async () => {
    expect(separacionDeNombre(vieja, { nombre: "Ricardo", apellido: "Pérez" })).toBeNull();
    const tx = { huesped: { findUnique: jest.fn().mockResolvedValue(vieja), update: jest.fn() } };
    await expect(sincronizarNombres(tx, 77, { nombre: "Ricardo", apellido: "Pérez" }, {})).rejects.toMatchObject({ codigo: "NOMBRE_DISTINTO" });
    expect(tx.huesped.update).not.toHaveBeenCalled();
  });

  test("una ficha ya separada o una persona sin apellido no producen separación", () => {
    expect(separacionDeNombre({ nombre: "Ricardo Ponce", nombres: "Ricardo", apellido: "Ponce" }, { nombre: "Ricardo", apellido: "Ponce" })).toBeNull();
    expect(separacionDeNombre(vieja, { nombre: "Ricardo Ponce", apellido: "" })).toBeNull();
  });
});
