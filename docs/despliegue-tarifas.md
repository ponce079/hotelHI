# Runbook de despliegue — Etapa 4C (cierre de tarifas por temporada)

> Ensayado de punta a punta contra una base local (`sgh_ensayo`), restaurada desde un dump de solo lectura de la base compartida, antes de tocar Clever Cloud. Los comandos de abajo apuntan a la base compartida real — son los mismos que se usaron en el ensayo, cambiando el `DATABASE_URL`.
>
> Todos los comandos están en PowerShell. Donde aparece `***` hay que poner la contraseña real a mano — nunca la escribas en un comando que quede en el historial de PowerShell ni la commitees. Usá siempre un archivo de opciones (`--defaults-extra-file`) para `mysql`/`mysqldump`, como se muestra abajo.

## Antes de empezar

1. **Avisar al grupo con anticipación** el día y la hora exactos del despliegue.
2. **Confirmar que nadie tiene el backend ni ningún script conectado a Clever Cloud** durante la ventana de despliegue. El adapter de Prisma usa `connectionLimit: 1` contra esa base — una segunda conexión activa (un backend corriendo, otro script) puede competir por esa única conexión o pisar cambios a mitad de camino.
3. **Avisar a Agustín** qué se elimina de la base compartida (lista completa en la sección siguiente), que su trabajo sigue intacto en `feature/estadia-ocupantes` y que su propia migración (`migrar-estadia.js`) vuelve a crear esas tablas/columnas cuando se integre su PR — no hay que recrearlas a mano.
4. **Backup completo con `mysqldump`** (paso 1 de abajo) — verificar que el archivo se generó y tiene contenido antes de seguir.

**Este runbook es el ÚNICO caso autorizado de `--accept-data-loss` sobre la base compartida, y lo ejecuta la persona responsable del despliegue, con el equipo avisado de antemano.** No es una acción para automatizar sin supervisión.

## Qué se elimina de la base compartida

Confirmado columna por columna contra un dump real de la base compartida (`mysqldump` del ensayo, 46 tablas). Dos categorías:

### Tablas y columnas del trabajo revertido de estadía/ocupantes (rama `feature/estadia-ocupantes`, revertido en `master`)

Estas **vuelven a aparecer solas** cuando se integre el PR de Agustín — su migración las recrea. No hay que avisarle para que las recree a mano, solo que existieron y se van a ir.

- Tablas completas: `asignaciones_ocupantes`, `ocupantes_reserva`, `eventos_estadia`.
- Tablas `bkp_*` (backups internos que generó `migrar-estadia.js` al correr, no tablas de negocio): `bkp_huespedes`, `bkp_ocupantes`, `bkp_reservas_huesped`.
- Tabla `ocupantes_habitacion`: diseño más viejo y abandonado, anterior al split `ocupantes_reserva`/`asignaciones_ocupantes` — sin referencias en ningún commit, se elimina igual.
- Columna `cargos_verificacion_checkout.habitacionId`.
- `consumos_servicio_adicional`: `anulado`, `anuladoEn`, `anuladoPor`, `claveOperacion`, `descripcion`, `fechaServicio`, `incluido`, `precioUnitario`, `motivoAnulacion` (9 columnas).
- `pagos_estadia`: `garantiaAplicada`, `garantiaDevuelta`, `garantiaSeparada` (3 columnas — la garantía actual vive en un `PagoEstadia` con `concepto: "Garantía"`, no en columnas propias).
- `reservas_habitaciones`: `ocupacionIncluida`, `precioPersonaExtra`, `serviciosIncluidos`, `tarifaPactada` (4 columnas).

Las 17 columnas de esta lista (más las tablas/columnas de arriba) se confirmaron **todas** contra `git show feature/estadia-ocupantes:backend/prisma/schema.prisma` — están en su schema, letra por letra. No son drift viejo sin relación (una categoría que se manejó como tal en un borrador anterior de este documento y era un error): son parte de su rediseño y su propia migración las recrea al integrarse. `docs/integracion-garantia-tarifas.md` ya documenta que las columnas de garantía en `pagos_estadia` (`garantiaAplicada`/`garantiaDevuelta`/`garantiaSeparada`) fueron reemplazadas por el `concepto` en `PagoEstadia` — si el rediseño de garantía con tarjeta las necesita de nuevo, es una decisión de Ricardo, no algo para reintroducir a ciegas.

### Lo propio de tarifas (Etapa 4C, aplicado en el schema final — paso 8)

- `habitaciones.tarifaPorNoche` (columna reemplazada por completo por `ReservaNoche.precioNoche`, motor de cotización).
- `habitaciones.tipo` (texto libre, reemplazado por `TipoHabitacion` + `tipoHabitacionId`, Etapa 1).

## Procedimiento paso a paso

### 1. Backup completo

MySQL Server 8.0 ya está instalado (`mysqldump.exe`/`mysql.exe` en `C:\Program Files\MySQL\MySQL Server 8.0\bin\`). Credenciales SOLO en un archivo de opciones temporal, fuera del repo:

```powershell
$cnf = New-TemporaryFile
@"
[client]
user=USUARIO_CLEVER_CLOUD
password=***
host=HOST_CLEVER_CLOUD.services.clever-cloud.com
port=3306
ssl-mode=REQUIRED
"@ | Set-Content -Path $cnf -Encoding ascii

$fecha = Get-Date -Format "yyyyMMdd-HHmm"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" `
  --defaults-extra-file=$cnf `
  --single-transaction --set-gtid-purged=OFF --add-drop-table `
  --column-statistics=0 --no-tablespaces `
  NOMBRE_BASE_COMPARTIDA > "backup-antes-4c-$fecha.sql"
```

`--routines --triggers` NO se usan: el usuario de la app no tiene privilegio `RELOAD` en Clever Cloud y el dump falla con `Access denied` si se piden.

### 2. Verificar el backup

```powershell
Get-Item "backup-antes-4c-$fecha.sql" | Select-Object Name, Length
Select-String -Path "backup-antes-4c-$fecha.sql" -Pattern "^CREATE TABLE" | Measure-Object
```

Confirmar que el tamaño no es 0 y que el conteo de `CREATE TABLE` coincide con lo esperado (46 en el ensayo). Guardar este archivo fuera del repo, en un lugar accesible para el equipo — es la vía de rollback.

### 3. Verificación de integridad de datos ANTES del push (con las tablas `bkp_*` todavía presentes)

**Este paso es SOLO de verificación — comparar y reportar, nunca modificar datos durante el despliegue.** Existe porque `bkp_huespedes`/`bkp_ocupantes`/`bkp_reservas_huesped` no son solo respaldo estructural: son la foto de los datos justo antes de que `migrar-estadia.js` los tocara. Antes de borrarlas (paso 4 las elimina), hay que confirmar que los datos actuales de `huespedes`/`reservas` no quedaron en un estado que solo entienda el código revertido.

```powershell
$cnfLocal = New-TemporaryFile
@"
[client]
user=root
password=***
host=localhost
port=3306
"@ | Set-Content -Path $cnfLocal -Encoding ascii

& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnfLocal NOMBRE_BASE -e `
  "SELECT h.id, h.numeroDocumento AS actual, b.numeroDocumento AS backup FROM huespedes h JOIN bkp_huespedes b ON b.id = h.id WHERE h.numeroDocumento != b.numeroDocumento;"

& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnfLocal NOMBRE_BASE -e `
  "SELECT h.id FROM huespedes h LEFT JOIN reservas r ON r.huespedId = h.id WHERE r.id IS NULL;"
```

- Primera consulta: huéspedes cuyo `numeroDocumento` cambió respecto del backup.
- Segunda consulta: huéspedes sin ninguna reserva (huérfanos).

**En el ensayo contra `sgh_ensayo` esto encontró**: 2 documentos cambiados (puntuación eliminada) y 1 huésped huérfano, sin ningún otro drift (0 diferencias en `reservas.huespedId`). En el ensayo se restauraron y se borró el huérfano porque todo era dato de prueba (decisión tomada para `sgh_ensayo` específicamente). **Contra la base compartida real, NO se corrige nada acá.**

**Si esta verificación encuentra cualquier diferencia contra la base compartida, FRENAR antes de seguir al paso 4** (que borra `bkp_*` para siempre) y consultar al equipo — no decidir en el momento ni restaurar/borrar como parte del despliegue. La limpieza de datos (si hace falta) se planifica aparte, como tarea propia, antes de la entrega — no se improvisa durante esta ventana. Guardar el resultado de las dos consultas (que va a hacer falta para esa limpieza) antes de continuar.

**Nota para la limpieza — formato de `numeroDocumento` que usa el código actual**: revisado en `reservas.servicio.js` (`textoObligatorio`), `checkIn.servicio.js` y `frontend/src/modulos/reservas/validarHuesped.js` — en los tres, `numeroDocumento` es **texto libre**: se guarda tal cual lo tipeó quien hizo el alta, con un único `.trim()` (espacios al borde), sin sacar puntos/guiones ni forzar ningún formato. La búsqueda (alta que reutiliza huésped existente, check-in por documento) compara por **igualdad exacta de string** — nunca normaliza. Esto quiere decir que "45.112.902" y "45112902" son, para el código, dos documentos distintos que no matchean entre sí. Cualquier limpieza de formato tiene que decidir un formato único y aplicarlo consistente — el código no va a tolerar que convivan variantes del mismo documento.

### 4. Estructura intermedia (aditiva)

Extraer el schema del tag `etapa4c-schema-intermedio` sin cambiar de rama, aplicarlo, y regenerar el cliente:

```powershell
git show etapa4c-schema-intermedio:backend/prisma/schema.prisma | Out-File -Encoding utf8 schema-intermedio.prisma
Copy-Item backend\prisma\schema.prisma backend\prisma\schema.prisma.bak
Copy-Item schema-intermedio.prisma backend\prisma\schema.prisma

$env:DATABASE_URL = "mysql://USUARIO:***@HOST_CLEVER_CLOUD.services.clever-cloud.com:3306/NOMBRE_BASE?ssl-mode=REQUIRED"
cd backend
npx prisma db push --accept-data-loss   # <- ÚNICO --accept-data-loss autorizado sobre la base compartida
npx prisma generate
```

**Si Prisma pide `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`**: eso es porque un agente de IA está corriendo el comando. Contra la base compartida este paso lo corre una persona directamente en su propia terminal, no un agente — no debería aparecer. Si aparece, es señal de que algo está corriendo esto de forma automatizada y hay que parar a revisar.

### 5. `migracion-tipo-habitacion.js`

```powershell
node scripts/migracion-tipo-habitacion.js --dry-run
# revisar la salida — confirma qué habitaciones quedan sin tipoHabitacionId
node scripts/migracion-tipo-habitacion.js --apply
```

Si la base compartida ya pasó por la Etapa 1 (fue el caso en el ensayo: 0 habitaciones pendientes), este paso es un no-op esperado — no falla, solo confirma que no hay nada para migrar.

### 6. `seed-tarifas.js`

```powershell
node scripts/seed-tarifas.js
```

Idempotente: crea la temporada Base, los planes BAR/NRF y los 7 modificadores por día de semana si no existen, o confirma que ya existen.

### 7. `seed-usuarios-prueba.js` (solo si faltan)

```powershell
$env:DATABASE_URL = "mysql://USUARIO:***@HOST_CLEVER_CLOUD.services.clever-cloud.com:3306/NOMBRE_BASE?ssl-mode=REQUIRED"
mysql --defaults-extra-file=$cnf NOMBRE_BASE -e "SELECT usuario FROM usuarios;"
```

Si ya están los 7 usuarios `*.prueba` (uno por rol) no hace falta correr nada. Si falta alguno:

```powershell
node scripts/seed-usuarios-prueba.js
```

### 8. Snapshot de importes ANTES de migrar reservas

Antes de tocar reservas existentes, registrar el total de alojamiento de cada una con la fórmula vieja (`Habitacion.tarifaPorNoche × noches`), para comparar exacto después:

```powershell
mysql --defaults-extra-file=$cnf NOMBRE_BASE -e `
  "SELECT rh.reservaId, SUM(h.tarifaPorNoche * DATEDIFF(r.fechaHasta, r.fechaDesde)) AS total_antes FROM reservas_habitaciones rh JOIN habitaciones h ON h.id = rh.habitacionId JOIN reservas r ON r.id = rh.reservaId GROUP BY rh.reservaId ORDER BY rh.reservaId;" `
  > importes-antes.txt
```

### 9. `migrar-reservas-a-reserva-noche.js`

```powershell
node scripts/migrar-reservas-a-reserva-noche.js
```

Idempotente (solo toca `planTarifarioId IS NULL`), transaccional por reserva.

### 10. Verificación de importes DESPUÉS

```powershell
mysql --defaults-extra-file=$cnf NOMBRE_BASE -e `
  "SELECT rh.reservaId, SUM(rn.precioNoche) AS total_despues FROM reservas_habitaciones rh JOIN reservas_noche rn ON rn.reservaHabitacionId = rh.id GROUP BY rh.reservaId ORDER BY rh.reservaId;" `
  > importes-despues.txt
```

Comparar `importes-antes.txt` contra `importes-despues.txt` reserva por reserva — **tienen que coincidir exactos**. En el ensayo, 42/42 reservas coincidieron sin ninguna diferencia. Si aparece una diferencia acá, FRENAR: no seguir al paso 11 (que borra la columna que permite recalcular) sin resolverlo.

### 11. Estructura final

Restaurar el schema real de `feature/tarifas` (el que quedó mergeado a `master` con este PR) y aplicarlo:

```powershell
Copy-Item backend\prisma\schema.prisma.bak backend\prisma\schema.prisma
npx prisma db push --accept-data-loss   # dropea tarifaPorNoche y tipo — ver sección anterior
npx prisma generate
Remove-Item backend\prisma\schema.prisma.bak
```

Esto sí puede pedir `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` de la misma manera si se corre con un agente — de nuevo, contra la base compartida este paso lo corre una persona.

### 12. Cerrar

- Borrar el archivo de credenciales temporal (`$cnf`, `$cnfLocal`) y `schema-intermedio.prisma`.
- **NO correr `seed-demo-salta.js` contra la base compartida** — el script se niega solo si `NODE_ENV=production`, pero además no tiene sentido cargar reservas de ejemplo en el entorno que usa todo el equipo. `seed-demo-salta.js` es para la base local de cada uno (ver debajo).
- Avisar al grupo que el despliegue terminó.
- **Cada uno, en su propia base local**: `git pull`, `npx prisma generate`, `npx prisma db push` (o migración equivalente) contra su `sgh_<nombre>`, y opcionalmente `node scripts/seed-demo-salta.js` para tener datos de demostración.

## Vuelta atrás

Si algo falla a mitad de camino (antes del paso 11 incluido) y no se puede seguir:

```powershell
mysql --defaults-extra-file=$cnf -e "DROP DATABASE NOMBRE_BASE; CREATE DATABASE NOMBRE_BASE;"
mysql --defaults-extra-file=$cnf NOMBRE_BASE < "backup-antes-4c-$fecha.sql"
```

Después, restaurar `backend/prisma/schema.prisma` al estado de `master` antes de este PR (`git checkout origin/master -- backend/prisma/schema.prisma` o el equivalente) y `npx prisma generate`, para que el cliente vuelva a coincidir con la base restaurada.
