jest.mock('@prisma/client',()=>({PrismaClient:jest.fn()}));
jest.mock('@prisma/adapter-mariadb',()=>({PrismaMariaDb:jest.fn()}));
const originalUrl=process.env.DATABASE_URL;
const originalLimit=process.env.DATABASE_CONNECTION_LIMIT;
beforeEach(()=>{jest.resetModules();jest.clearAllMocks();process.env.DATABASE_URL='mysql://prueba:prueba@127.0.0.1:3308/prueba';delete process.env.DATABASE_CONNECTION_LIMIT;});
afterAll(()=>{for(const [key,value] of Object.entries({DATABASE_URL:originalUrl,DATABASE_CONNECTION_LIMIT:originalLimit})){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
test.each([undefined,'1','3'])('pool configurable (%s) con mínimo compatible con el driver incluido',valor=>{
  if(valor)process.env.DATABASE_CONNECTION_LIMIT=valor;
  require('./prisma');
  expect(require('@prisma/adapter-mariadb').PrismaMariaDb).toHaveBeenCalledWith(expect.objectContaining({connectionLimit:valor?Number(valor):2,minimumIdle:1,idleTimeout:60}),expect.any(Object));
  expect(require('@prisma/client').PrismaClient).toHaveBeenCalledWith(expect.objectContaining({transactionOptions:{maxWait:10000}}));
});
test.each(['0','-1','1.5','sin-limite','11'])('rechaza límite de pool inválido: %s',valor=>{
  process.env.DATABASE_CONNECTION_LIMIT=valor;
  expect(()=>require('./prisma')).toThrow(/DATABASE_CONNECTION_LIMIT/);
});
