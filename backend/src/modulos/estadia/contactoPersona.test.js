jest.mock('../../lib/prisma',()=>({}));
const {prepararContacto,comparteCorreo}=require('./contactoPersona');
const {edad,ErrorDeNegocio}=require('./estadia.servicio');
const reglas={edad,ErrorDeNegocio};
const adulto={id:2,fechaNacimiento:new Date('1990-01-01'),email:'tutor@example.test',telefono:'123456'};
const tx={eventoEstadia:{findFirst:async()=>({detalle:'{"ocupanteId":1}'})},ocupanteReserva:{findFirst:async()=>adulto}};
const persona=nacimiento=>({fechaNacimiento:new Date(nacimiento),fechaDesde:new Date('2026-10-01'),responsableId:2});
test('titular menor y nacimiento ausente se rechazan; 18 cumplidos se acepta',async()=>{
  await expect(prepararContacto(tx,{id:1},persona('2008-10-02'),{id:1},{},reglas)).rejects.toThrow(/18 años/);
  await expect(prepararContacto(tx,{id:1},{...persona('2008-10-01'),fechaNacimiento:null},{id:1},{},reglas)).rejects.toThrow(/18 años/);
  await expect(prepararContacto(tx,{id:1},persona('2008-10-01'),{id:1},{},reglas)).resolves.toBeDefined();
});
test('menor copia contacto del responsable, no valores inventados por el cliente',async()=>{
  const p={...persona('2015-01-01'),email:'otro@example.test'};
  await prepararContacto(tx,{id:1},p,null,{usarContactoResponsable:true},reglas);
  expect(p).toMatchObject({email:adulto.email,telefono:adulto.telefono});
  expect(comparteCorreo(adulto,p,null,true,adulto)).toBe(true);
  expect(comparteCorreo({id:3,responsableId:2},p,null,true,adulto)).toBe(true);
  expect(comparteCorreo({id:4},p,null,true,adulto)).toBe(false);
});
test('contactos ausentes son opcionales; rechaza compartir sin responsable adulto',async()=>{
  const p=persona('2015-01-01');
  const sinContacto={...tx,ocupanteReserva:{findFirst:async()=>({...adulto,email:null,telefono:null})}};
  await prepararContacto(sinContacto,{id:1},p,null,{usarContactoResponsable:true},reglas);
  expect(p).toMatchObject({email:null,telefono:null});
  await expect(prepararContacto(tx,{id:1},{...p,responsableId:null},null,{usarContactoResponsable:true},reglas)).rejects.toThrow(/responsable/);
});
