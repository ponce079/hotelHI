# HotelHI — desarrollo local

Estado de esta rama: [correcciones de la revision del 1/10/2026](REVISION_ESTADIA_2026-10-01.md).

Sistema de gestión hotelera con React 19, Vite y Tailwind en `frontend/`,
Express 5 y Prisma 7 en `backend/`, y una base MySQL/MariaDB.
Usar Node.js 24 LTS (la instalación local se verificó con 24.19.0).

La ampliación de ocupantes y cargos por habitación está documentada en
[MODIFICACIONES_ESTADIA.md](MODIFICACIONES_ESTADIA.md): incluye el esquema
agregado a la base compartida, la actualización del equipo, respaldos,
pruebas y limitaciones conocidas.

La revisión posterior a las actualizaciones del equipo está en
[INTEGRACION_ACTUALIZACIONES.md](INTEGRACION_ACTUALIZACIONES.md), con los cambios
restaurados, las comprobaciones y la lista de archivos modificados.

El registro detallado del período solicitado desde el lunes 28/09 a las 11:57 está en
[INFORME_TRABAJO_DESDE_2026-09-28_1157.md](INFORME_TRABAJO_DESDE_2026-09-28_1157.md).
Incluye la secuencia reconstruida, el inventario de archivos, el impacto en la base,
las pruebas y las diferencias entre lo documentado inicialmente y el estado actual.

## Iniciar en esta computadora

**Para probar `feature/estadia-ocupantes` con las tarifas nuevas**, usar el
entorno aislado preparado en esta computadora:

```powershell
npm.cmd run dev:estadia
```

Usuario `recepcionista.prueba`, contraseña local `<SEED_USUARIOS_PASSWORD>`.
Este comando usa `hotelhi_estadia_demo` en `127.0.0.1:3308`, desactiva correos
y no modifica `backend/.env`. Guía y preparación: [PRUEBAS_ESTADIA_LOCAL.md](PRUEBAS_ESTADIA_LOCAL.md).
La base compartida no tiene habilitada esta ampliación de ocupantes;
el comando genérico de abajo usa la conexión de `.env` y no prepara su esquema.

Desde la carpeta principal, en PowerShell:

```powershell
npm.cmd run dev
```

Abrir http://127.0.0.1:5173. La API escucha en http://localhost:3000;
Vite redirige `/api` al backend. Si 5173 está ocupado, consultar la URL
que imprime Vite. El acceso ahora usa el módulo real de Usuarios y Seguridad;
se necesita un usuario activo de la base seleccionada.

La configuración actual usa la base existente de Clever Cloud, con SSL.
Las credenciales están en `backend/.env`, excluido de Git. No ejecutar
`db:push` ni `db:seed` sobre esa base compartida como parte del arranque.

La MariaDB portátil alternativa de esta computadora está en `.local/`, usa el puerto
3307 y solo escucha en 127.0.0.1. `npm.cmd run dev` la inicia automáticamente
solo si `DATABASE_URL` apunta a `127.0.0.1:3307`. Los datos persisten en `.local/data`; no borrar esa carpeta.
Las credenciales locales están en `backend/.env`, excluido de Git.
SMTP es opcional: sin configurarlo no se envían correos de confirmación.

Ctrl+C detiene frontend y backend. La base queda disponible; para detenerla:

```powershell
npm.cmd run db:stop
```

## Preparar otra computadora o usar una base existente

1. Instalar Node.js 24 LTS y disponer de MySQL/MariaDB. Crear una base vacía
   (por ejemplo `CREATE DATABASE hotelhi CHARACTER SET utf8mb4;`) y un usuario
   con permisos sobre ella antes de ejecutar Prisma.
2. Copiar `backend/.env.example` a `backend/.env` y configurar `DATABASE_URL`.
   Para una base local usar `DATABASE_SSL=false`. Dejar vacías las variables
   SMTP si no se dispone de un servidor de correo.
3. Instalar dependencias y generar Prisma desde la raíz:

   ```powershell
   npm.cmd run setup
   ```

4. Solo para una **base nueva de desarrollo**, crear las tablas y los tipos
   de movimiento iniciales:

   ```powershell
   npm.cmd run db:push
   npm.cmd run db:seed
   ```

   No ejecutar `db:push` sobre una base compartida sin revisar los cambios.
   El repositorio no incluye un historial de migraciones; los SQL sueltos
   corresponden a cambios históricos y no son necesarios para una base nueva.

5. Comprobar la base e iniciar:

   ```powershell
   npm.cmd run db:check
   npm.cmd run dev
   ```

La base nueva no incluye reservas ni habitaciones de ejemplo. Las habitaciones,
depósitos y artículos se cargan desde los formularios del sistema.
La carpeta `.local/` no se versiona. La instalación portátil de esta computadora
se hizo con el [ZIP oficial de MariaDB](https://mariadb.com/docs/server/server-management/install-and-upgrade-mariadb/installing-mariadb/binary-packages/installing-mariadb-windows-zip-packages).

## Comprobaciones

```powershell
npm.cmd run build
npm.cmd test
npm.cmd --prefix frontend run lint
npm.cmd run db:check
```

En Windows se usa `npm.cmd` para evitar depender de la política de ejecución
de scripts de PowerShell. Para iniciar cada servicio por separado están
`npm.cmd run dev:backend` y `npm.cmd run dev:frontend`.
