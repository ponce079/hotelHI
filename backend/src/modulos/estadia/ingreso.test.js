jest.mock('../../lib/prisma', () => ({}));
const { validarCantidades, prepararIngreso } = require('./ingreso');
const habitaciones = [{ id: 1, numero: '101', capacidad: 3 }, { id: 2, numero: '102', capacidad: 2 }];
const persona = habitacionId => ({ asignaciones: [{ habitacionId, hasta: null }] });
const personas = [persona(1), persona(1), persona(2)];
const cantidades = [{ habitacionId: 1, cantidad: 2 }, { habitacionId: 2, cantidad: 1 }];

function transaccion(personas) {
  return {habitacion:{findMany:jest.fn().mockResolvedValue([habitaciones[0]])},ocupanteReserva:{findMany:jest.fn().mockResolvedValue(personas),update:jest.fn()},eventoEstadia:{create:jest.fn()}};
}
const adulto = {...persona(1),id:1,nombre:'Ana',apellido:'Prueba',fechaDesde:new Date('2020-01-01'),fechaHasta:new Date('2099-01-01'),fechaNacimiento:new Date('1990-01-01'),nacionalidad:'AR',paisResidencia:'AR',tipoDocumento:'DNI',numeroDocumento:'123',paisDocumento:'AR',verificadoEn:new Date()};
test('aunque coincida la cantidad, bloquea datos sin verificar o incompletos', async () => {
  for (const cambio of [{verificadoEn:null},{nacionalidad:null}]) {
    const tx = transaccion([{...adulto,...cambio}]);
    await expect(prepararIngreso(tx,1,[1],[{habitacionId:1,cantidad:1}])).rejects.toThrow();
    expect(tx.ocupanteReserva.update).not.toHaveBeenCalled();
    expect(tx.eventoEstadia.create).not.toHaveBeenCalled();
  }
});
test('ingresa a todos y registra cantidades y personas en el historial', async () => {
  const tx = transaccion([adulto]);
  await prepararIngreso(tx,1,[1],[{habitacionId:1,cantidad:1}],'Recepcionista');
  expect(tx.ocupanteReserva.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({estado:'Alojado'})}));
  const evento = tx.eventoEstadia.create.mock.calls[0][0].data;
  expect(JSON.parse(evento.detalle)).toEqual({cantidades:[{habitacionId:1,cantidad:1}],ocupanteIds:[1]});
  expect(evento.operador).toBe('Recepcionista');
});

test('acepta todas las personas declaradas por habitación', () => {
  expect(() => validarCantidades(habitaciones, personas, cantidades)).not.toThrow();
});
test.each([undefined, [], [{habitacionId:1,cantidad:2}], [{habitacionId:1,cantidad:2},{habitacionId:1,cantidad:1}], [{habitacionId:9,cantidad:2},{habitacionId:2,cantidad:1}], [{habitacionId:1,cantidad:1.5},{habitacionId:2,cantidad:1}], [{habitacionId:1,cantidad:0},{habitacionId:2,cantidad:1}]])('rechaza declaraciones incompletas o inválidas: %j', datos => {
  expect(() => validarCantidades(habitaciones, personas, datos)).toThrow();
});
test('bloquea personas faltantes, sobrantes y cantidades mayores a la capacidad', () => {
  for (const cantidad of [1, 3, 4]) expect(() => validarCantidades(habitaciones, personas, [{habitacionId:1,cantidad},cantidades[1]])).toThrow();
});
test('no compensa una persona faltante con una de otra habitación', () => {
  expect(() => validarCantidades(habitaciones, [persona(1),persona(2),persona(2)], cantidades)).toThrow(/101/);
});
test('un ocupante futuro no cubre a alguien que ingresa hoy y no se escribe al fallar', async () => {
  const tx = { habitacion: {findMany: jest.fn().mockResolvedValue([habitaciones[0]])}, ocupanteReserva: {
    findMany: jest.fn().mockResolvedValue([{...persona(1),fechaDesde:new Date('2099-01-01'),fechaHasta:new Date('2099-01-02')}]),
    update: jest.fn(),
  }};
  await expect(prepararIngreso(tx, 1, [1], [{habitacionId:1,cantidad:1}])).rejects.toThrow(/0 registradas/);
  expect(tx.ocupanteReserva.update).not.toHaveBeenCalled();
});
