// Migración aditiva y reanudable. Sin DROP, DELETE, UPDATE ni db push.
// Por defecto solo verifica; --aplicar guarda respaldo y agrega el esquema.
require('dotenv').config({quiet:true});
const fs=require('node:fs');
const path=require('node:path');
const mariadb=require('mariadb');
const root=path.resolve(__dirname,'../..');
async function main(){
  const u=new URL(process.env.DATABASE_URL);
  const db=u.pathname.slice(1);
  const c=await mariadb.createConnection({host:u.hostname,port:Number(u.port)||3306,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:db,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},connectTimeout:15000});
  const aplicar=process.argv.includes('--aplicar');
  try{
    const sql=fs.readFileSync(path.join(__dirname,'../prisma/estadia-ocupantes-cargos.sql'),'utf8');
    const statements=sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
    if(statements.some(s=>!(/^(ALTER TABLE `\w+` ADD (COLUMN|CONSTRAINT)|CREATE TABLE `\w+`|CREATE UNIQUE INDEX `\w+`)/.test(s))))throw new Error('La migración contiene una operación no aditiva.');
    const pendientes=[];
    for(const stmt of statements){
      let m=stmt.match(/^ALTER TABLE `(\w+)` ADD COLUMN /);
      if(m){for(const fragment of stmt.replace(/^ALTER TABLE `\w+` /,'').split(/,\s*ADD COLUMN /).map((v,i)=>i?'ADD COLUMN '+v:v)){const col=fragment.match(/^ADD COLUMN `(\w+)`/)[1];const exists=await c.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',[db,m[1],col]);if(!exists.length)pendientes.push(`ALTER TABLE \`${m[1]}\` ${fragment}`);}continue;}
      m=stmt.match(/^CREATE TABLE `(\w+)`/);if(m){const rows=await c.query('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',[db,m[1]]);if(!rows.length)pendientes.push(stmt);continue;}
      m=stmt.match(/^CREATE UNIQUE INDEX `(\w+)` ON `(\w+)`/);if(m){const rows=await c.query('SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?',[db,m[2],m[1]]);if(!rows.length)pendientes.push(stmt);continue;}
      m=stmt.match(/^ALTER TABLE `(\w+)` ADD CONSTRAINT `(\w+)`/);if(m){const rows=await c.query('SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME=?',[db,m[1],m[2]]);if(!rows.length)pendientes.push(stmt);}
    }
    console.log(`Operaciones aditivas pendientes: ${pendientes.length}. Modo: ${aplicar?'aplicar':'verificar'}.`);
    if(!aplicar||!pendientes.length)return;
    const tablas=['reservas','reservas_habitaciones','habitaciones','consumos_servicio_adicional','pagos_estadia','pagos_estadia_medio','cargos_verificacion_checkout'];
    const respaldo={fecha:new Date().toISOString(),tablas:{}};
    await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    try{for(const tabla of tablas){const ddl=await c.query(`SHOW CREATE TABLE \`${tabla}\``);const filas=await c.query(`SELECT * FROM \`${tabla}\``);respaldo.tablas[tabla]={ddl:ddl[0]['Create Table'],filas};}await c.commit();}catch(e){await c.rollback();throw e;}
    const dir=path.join(root,'.local','respaldos-estadia');fs.mkdirSync(dir,{recursive:true});
    const nombre=path.join(dir,`antes-${Date.now()}.json`);fs.writeFileSync(nombre,JSON.stringify(respaldo,(_,v)=>typeof v==='bigint'?v.toString():v));
    console.log('Respaldo guardado en .local/respaldos-estadia.');
    for(let i=0;i<pendientes.length;i++){await c.query(pendientes[i]);console.log(`Aplicada ${i+1}/${pendientes.length}.`);}
    console.log('Migración terminada. Los registros existentes se conservaron.');
  }finally{await c.end();}
}
main().catch(e=>{console.error('No se completó la migración:',e.code||e.message);process.exitCode=1;});
