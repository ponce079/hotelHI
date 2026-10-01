// Diagnóstico de concurrencia exclusivamente local. No carga .env ni escribe datos.
const assert = require('node:assert/strict');
require('../../scripts/entorno-estadia.cjs').cargarEntorno('test');
process.env.DATABASE_SSL = 'false';
process.env.DATABASE_CONNECTION_LIMIT = '2';
const prisma = require('../src/lib/prisma');
async function main() {
  let liberar, avisar;
  const retenida = new Promise(resolve => { liberar = resolve; });
  const iniciada = new Promise(resolve => { avisar = resolve; });
  const transaccion = prisma.$transaction(async tx => {
    const [fila] = await tx.$queryRaw`SELECT CONNECTION_ID() AS id`;
    avisar(fila.id);
    await retenida;
  }, { timeout: 10000 });
  let temporizador;
  try {
    const id = await Promise.race([iniciada, transaccion]);
    const [otra] = await Promise.race([
      prisma.$queryRaw`SELECT CONNECTION_ID() AS id`,
      new Promise((_, reject) => { temporizador = setTimeout(() => reject(new Error('La lectura quedó esperando a la transacción.')), 3000); }),
    ]);
    assert.notEqual(String(otra.id), String(id));
    console.log('OK: lectura concurrente con una transacción retenida, usando conexiones distintas. Sin escrituras.');
  } finally {
    clearTimeout(temporizador);
    liberar();
    await transaccion;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
