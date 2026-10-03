# Runbook de despliegue — Migración de estadía en la base compartida

Migración de esquema de `feature/estadia-ocupantes` (estadía, check-in, detalle de reserva; incluye nombres y apellido del huésped y vínculo y autorización del menor) sobre la base compartida de Clever Cloud (MySQL en París, ~387 ms por consulta). **La aplica Gimena UNA vez, inmediatamente después del merge a `master`.**

La normalización de documentos duplicados **no** forma parte de este despliegue: la resuelve Ricardo en su rama.

> **Todos los comandos son de PowerShell** y se corren desde la carpeta del repo. **La contraseña de Clever Cloud nunca se tipea, se pega ni se muestra**: cada bloque la lee de `backend\.env.compartida.bak` dentro de su propio `& { ... }` y la limpia al terminar (`finally`).
>
> **Un bloque `& { ... }` de varias líneas necesita un Enter extra al final** para ejecutarse.
>
> **Nunca redirigir `mysqldump` con `>`** ni pasar un `.sql` por el pipeline de PowerShell (`Get-Content | mysql`): PowerShell reescribe el texto en otra codificación y puede romper los acentos. El backup va con `--result-file` y la restauración con `source` (MySQL lee el archivo directamente).
>
> **Nunca `prisma db push --accept-data-loss` contra la compartida.** Esta migración no lo necesita: es un SQL aditivo que se aplica con su propio script.

## Qué cambia en la base compartida

La migración está en `backend/prisma/estadia-ocupantes-cargos.sql` y la aplica `backend/scripts/actualizar-esquema-estadia.js`. Son **32 operaciones, todas aditivas**: el script rechaza cualquier otra cosa (`DROP`, `MODIFY`, `UPDATE`…) y omite las que ya estén aplicadas.

| Tipo | Qué |
|---|---|
| Tablas nuevas (3) | `ocupantes_reserva`, `asignaciones_ocupantes`, `eventos_estadia` |
| Columnas nuevas en `huespedes` (9) | `fechaNacimiento`, `paisDocumento`, `identidadDocumento`, `nacionalidad`, `paisResidencia`, `domicilio`, `localidad`, `nombres`, `apellido` — todas `NULL` |
| Columnas nuevas en `consumos_servicio_adicional` (9) | `anulado` (`NOT NULL DEFAULT false`), `anuladoEn`, `anuladoPor`, `claveOperacion`, `descripcion`, `fechaServicio`, `incluido` (`NOT NULL DEFAULT false`), `motivoAnulacion`, `precioUnitario` |
| Columna nueva en `cargos_verificacion_checkout` (1) | `habitacionId` (`NULL`) |
| Columnas nuevas en `ocupantes_reserva` (4) | `huespedId`, `esTitular` (`DEFAULT false`), `vinculoResponsable`, `autorizacionPresentada` (`DEFAULT false`) |
| Índices únicos (3) | `huespedes.identidadDocumento`, `consumos_servicio_adicional.claveOperacion`, `ocupantes_reserva.identidadActiva` |
| Claves foráneas (4) | `ocupantes_reserva → reservas`, `ocupantes_reserva → huespedes` (`ON DELETE SET NULL`), `asignaciones_ocupantes → ocupantes_reserva`, `eventos_estadia → reservas` |

### Qué datos existentes pueden verse afectados, y cómo

- **No se modifica ni se borra ninguna fila.** No hay `UPDATE`, `DELETE`, `DROP` ni backfill.
- **Filas existentes de `huespedes`, `consumos_servicio_adicional` y `cargos_verificacion_checkout`:** reciben las columnas nuevas en `NULL`, o con su valor por defecto (`anulado = false`, `incluido = false`). Todos los consumos existentes quedan vigentes y siguen sumando igual en la cuenta.
- **Índices únicos nuevos:** se crean sobre columnas nuevas que arrancan en `NULL`, y MySQL admite varios `NULL` en un índice único, así que no chocan con datos existentes.
  - El índice sobre `huespedes.identidadDocumento` queda vacío hasta que la app lo complete al registrar fichas.
  - Los huéspedes existentes no reciben `identidadDocumento` ni `paisDocumento`: no hay backfill, y la normalización la hace Ricardo.
- **Claves foráneas nuevas:** apuntan desde las tablas nuevas, que arrancan vacías. **Excepción:** si alguien ya creó esas tablas en la compartida con datos de prueba (pasó el 30/9, ver el despliegue de tarifas), la verificación previa cuenta las filas huérfanas, porque harían fallar la clave foránea.
- **Reservas En curso existentes:** no tienen fichas de ocupantes. Al abrir su detalle, la app incorpora al titular como ocupante (titular automático, ficha "Prevista"). No hace falta nada antes de migrar.
- **Huéspedes con un tipo de documento fuera del catálogo:** la migración no los toca. La app los muestra como están y pide un tipo válido al editarlos.
- **Bloqueos durante la migración:** cada `ALTER TABLE` bloquea brevemente su tabla. Por eso se congelan las escrituras (paso 1).

### Lecciones del despliegue de tarifas (30/9) que aplican acá

- **Latencia de ~387 ms por consulta:**
  - la migración tarda **minutos**, no segundos, y no hay que cortarla mientras dice "Operaciones faltantes" o no terminó;
  - la verificación previa hace pocas consultas (un conteo único para todas las tablas).
- **Transacciones de la app:** con esa latencia, las transacciones largas se pueden vencer (`Transaction API error: ... expired transaction`). La app usa `OPCIONES_TRANSACCION = { timeout: 30000, maxWait: 15000 }` (`backend/src/lib/constantes.js`), y las de estadía hacen una cantidad fija de consultas. Si en la prueba de humo aparece ese error, la operación no deja nada a medias: anotarlo, reintentar una vez y avisar (ver `docs/bug-timeout-transacciones.md`).
- **El 30/9 alguien conectó su entorno de `feature/estadia-ocupantes` a la compartida** y creó tablas de estadía con datos de prueba. Por eso se congelan escrituras y entornos, y la verificación previa revisa si esas tablas ya existen y si tienen filas huérfanas.
- **No correr seeds de demo** (`seed-demo-salta.js`, `seed:checkin-demo`) contra la compartida. Los seeds de demo se niegan solos fuera de una base local.
- **Si Prisma pide `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`:** algo está corriendo esto de forma automatizada. Este runbook no usa ningún comando de Prisma que lo pida, así que si aparece, parar.

### Guardia de la base compartida

`actualizar-esquema-estadia.js` y `verificar-previo-estadia.js` **siguen negándose a todo lo que no sea una base local** (misma guardia que `db:push`). Para la compartida hay un modo explícito (`backend/scripts/_destinoMigracion.js`):

- **`CONFIRMAR_BASE_COMPARTIDA=<nombre-de-la-base>`:** tiene que coincidir con la base de `DATABASE_URL`; si no coincide, se niega sin conectarse.
- **Confirmación por teclado (solo la migración):** muestra **host y base** (nunca usuario ni contraseña) y hay que escribir el nombre de la base. Cualquier otra respuesta cancela.
- **La verificación de solo lectura:** exige la variable pero no pregunta por teclado.

---

## Procedimiento paso a paso

### 1. Aviso al grupo y congelamiento de escrituras

Mensaje al grupo, antes de empezar:

> Voy a aplicar la migración de estadía en la base compartida (Clever Cloud), justo después del merge de `feature/estadia-ocupantes` a `master`. Durante unos 20 minutos, a partir de ahora: **nadie use la app contra la compartida ni conecte su entorno local a ella** (ni backend, ni seeds, ni `db push`). Les aviso cuando termine.

Esperar la confirmación de todos antes de seguir. Si alguien tiene un backend local apuntando a la compartida, que lo apague.

### 2. Verificar que `master` tiene el merge

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
git fetch origin
git checkout master
git pull --ff-only origin master
git log --oneline -1
git merge-base --is-ancestor origin/feature/estadia-ocupantes HEAD; if ($?) { "OK: master tiene el merge de estadía" } else { "FALTA el merge: no seguir" }
Select-String -Path backend\prisma\estadia-ocupantes-cargos.sql -Pattern "vinculoResponsable" | Select-Object -First 1
```

**Debería verse:** "OK: master tiene el merge de estadía" y una línea del SQL con `vinculoResponsable`. Después, en la carpeta `backend`:

```powershell
Set-Location backend
npm install
npx prisma generate
Set-Location ..
```

### 3. Backup completo

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^"?]+)') { throw "No se pudo parsear DATABASE_URL" }
  $usuario = $Matches[1]; $password = [System.Uri]::UnescapeDataString($Matches[2])
  $servidor = $Matches[3]; $puerto = $Matches[4]; $basedatos = $Matches[5]
  $cnf = New-TemporaryFile
  try {
    @"
[client]
user=$usuario
password=$password
host=$servidor
port=$puerto
ssl-mode=REQUIRED
"@ | Set-Content -Path $cnf -Encoding ascii

    $carpetaBackup = "$HOME\Documents\backups-sgh"
    New-Item -ItemType Directory -Force -Path $carpetaBackup | Out-Null
    $global:archivoBackup = "$carpetaBackup\backup-antes-estadia-$(Get-Date -Format 'yyyyMMdd-HHmm').sql"

    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" `
      --defaults-extra-file=$cnf `
      --single-transaction --set-gtid-purged=OFF --no-tablespaces --default-character-set=utf8mb4 `
      --result-file="$global:archivoBackup" `
      $basedatos

    Get-Item $global:archivoBackup | Select-Object Name, Length
    Write-Host "Tablas: $((Select-String -Path $global:archivoBackup -Pattern '^CREATE TABLE' | Measure-Object).Count)"
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

Son las mismas opciones del backup del ensayo (2/10), que corrió sin problemas contra Clever Cloud. `--add-drop-table` ya viene incluido por defecto, y la vuelta atrás lo necesita. Sin `--routines --triggers` no aparece el error `need RELOAD privilege` del despliegue de tarifas; no hay procedures ni triggers propios de la app.

**Debería verse:**
- el nombre del archivo, de unos **240 KB**: el del ensayo, del 2/10 a las 23:09, pesó 239.382 bytes;
- **"Tablas: 40"**: la compartida no tiene tablas de estadía antes de migrar;
- y, al final del archivo, la línea `-- Dump completed`.

```powershell
Get-Content $global:archivoBackup -Tail 1
```

- **`$global:archivoBackup` vale solo en esta misma ventana.** En una ventana nueva, asignarlo a mano: `$global:archivoBackup = "C:\Users\Gimena\Documents\backups-sgh\backup-antes-estadia-AAAAMMDD-HHmm.sql"`.
- **Si el tamaño es 0, no aparece `-- Dump completed` o el conteo de tablas no coincide, NO SEGUIR.**

### 4. Verificación previa (solo lectura)

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="(mysql://[^"]+/([^"?/]+)[^"]*)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]; $env:CONFIRMAR_BASE_COMPARTIDA = $Matches[2]
  try {
    Set-Location backend
    node scripts/verificar-previo-estadia.js
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
  }
}
```

**Debería verse** (tarda unos segundos por la latencia):
- **"Filas por tabla":** los conteos actuales, que se guardan en `backend\.local\verificacion-estadia-<base>.json` para compararlos después.
- **"Migración de estadía":** "Operaciones faltantes: 32 de 32", porque la compartida no tiene nada de estadía (así estaba en el ensayo).
- **"Índices de huespedes":** `PRIMARY` y, si existiera, cualquier índice único sobre el documento.
- **"Tipos de documento":** con la marca "← fuera del catálogo" donde corresponda.
- **"Reservas vigentes":** Confirmadas y En curso.
- **"Diferencia de esquema contra schema.prisma":** "12 sentencias de diferencia", todas de las tablas de estadía y de `huespedes`, `consumos_servicio_adicional` y `cargos_verificacion_checkout`, y la línea "Todas son de la migración de estadía". Así se vio en el ensayo.
- **"Resultado": `OK para migrar.`**

**Si dice `NO seguir`, resolver antes según el mensaje:**

| Mensaje | Qué hacer |
|---|---|
| "Faltan tablas base del sistema" o "diferencias de esquema que NO son de la migración de estadía" | La compartida no está en el esquema de `master`. **Frenar** y revisar con el equipo qué falta (probablemente un despliegue anterior que no se aplicó). No forzar con `db push`. |
| "N filas de X apuntan a un Y inexistente" | Alguien creó las tablas de estadía con datos de prueba (como el 30/9). Confirmar con el grupo de quién son. Ya están en el backup del paso 3. Borrar **solo esas filas huérfanas** (`DELETE` puntual con el `WHERE` del mensaje, corrido por una persona) y repetir este paso. |
| "Ya existe un índice huespedes_identidadDocumento_key sobre…" | Un cambio manual anterior. Frenar y revisar con Ricardo antes de seguir. |
| "No se puede calcular el plan de la migración" | Error de conexión o de permisos. Reintentar. Si persiste, frenar. |

**Avisos que NO frenan:**
- **Índice único sobre `tipoDocumento`/`numeroDocumento`:** no lo crea esta migración, pero contradice la regla de identidad. Anotarlo para Ricardo.
- **Tipos de documento fuera del catálogo.**
- **Reservas En curso sin fichas.**

### 5. Aplicar la migración

Primero el plan, sin aplicar: pide confirmación por teclado, aunque solo muestre.

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="(mysql://[^"]+/([^"?/]+)[^"]*)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]; $env:CONFIRMAR_BASE_COMPARTIDA = $Matches[2]
  try {
    Set-Location backend
    node scripts/actualizar-esquema-estadia.js
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
  }
}
```

**Va a mostrar** "Vas a ejecutar la migración de estadía sobre la base "…" en …clever-cloud.com. Escribí el nombre de la base para confirmar:". Escribir el nombre de la base y Enter. **Debería verse** "Operaciones faltantes: 32" y la lista: tablas, columnas, índices y relaciones.

Después, **aplicar**: el mismo bloque con `--aplicar`.

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="(mysql://[^"]+/([^"?/]+)[^"]*)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]; $env:CONFIRMAR_BASE_COMPARTIDA = $Matches[2]
  try {
    Set-Location backend
    $inicio = Get-Date
    node scripts/actualizar-esquema-estadia.js --aplicar
    "Duración: {0:n0} s" -f ((Get-Date) - $inicio).TotalSeconds
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
  }
}
```

**Debería verse:**
- la confirmación por teclado (escribir el nombre de la base);
- "Operaciones faltantes: 32" con la lista;
- "Respaldo de las tablas afectadas guardado en .local/respaldos-estadia.", un JSON de las tablas que se modifican, extra al backup completo;
- "Actualización terminada. Pendientes: 0".

**Tiempo esperado:**
- **En el ensayo** (copia local de la compartida): 1,8 s.
- **Contra Clever Cloud:** unas 46 idas y vueltas a ~387 ms (plan, respaldo JSON, 32 sentencias y plan final), más lo que tarde cada `ALTER TABLE` allá. Estimado: **entre 30 segundos y 3 minutos**. No cortar mientras no termine.

**Si se corta a mitad** (pérdida de conexión, error `socket timeout` o cierre de la ventana):
- **Qué queda aplicado:** MySQL confirma cada sentencia por separado (DDL), así que queda aplicado lo que se llegó a ejecutar y nada a medias dentro de una sentencia.
- **Qué hacer:** **volver a correr el mismo bloque con `--aplicar`**. El script recalcula qué falta y aplica solo eso.
- **Si un paso falla siempre igual:** frenar, anotar el mensaje y evaluar la vuelta atrás.

### 6. Segunda corrida: 0 pendientes

El primer bloque del paso 5 (sin `--aplicar`). **Debería verse "Operaciones faltantes: 0"** y nada más.

### 7. Verificación posterior (solo lectura)

El bloque del paso 4, con `--despues`:

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="(mysql://[^"]+/([^"?/]+)[^"]*)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]; $env:CONFIRMAR_BASE_COMPARTIDA = $Matches[2]
  try {
    Set-Location backend
    node scripts/verificar-previo-estadia.js --despues
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
  }
}
```

**Debería verse:**
- "0 operaciones pendientes y las columnas nuevas están";
- "Conteos antes / después" con **los mismos números** en todas las tablas (ninguna marcada "← CAMBIÓ");
- "Sin diferencias: la base coincide con schema.prisma";
- y **`OK: la migración quedó aplicada y verificada.`**

**Si algún conteo cambió:** alguien escribió durante el despliegue. Revisar quién y qué antes de dar por cerrado.

### 8. Prueba de humo (con la app apuntando a la compartida)

**Ojo:** este paso **sí escribe** en la compartida. Usar los datos identificables de abajo, que **no se borran en el despliegue**: quedan para la limpieza de datos de prueba del **jueves 8/10**.

1. Backend local con la compartida: copiar `backend\.env.compartida.bak` a `backend\.env`, guardando antes el `.env` local, y levantar backend y frontend como siempre.
2. **Login** con un usuario recepcionista existente.
3. **Check-in → Llegadas de hoy:** la lista carga sin error, aunque esté vacía.
4. **Reservas → abrir el detalle de una reserva existente:** se ven el encabezado, las pestañas Huéspedes, Cuenta e Historial y la columna de resumen. Si es una reserva En curso, el titular aparece como ficha "Prevista" (titular automático).
5. **Walk-in de prueba** (Check-in → Walk-in), con datos identificables:
   - 1 habitación Simple, 1 adulto, 1 noche;
   - titular: tipo **Pasaporte**, país Argentina, número **`PRUEBA-DESPLIEGUE-1`**, nombres **Prueba**, apellido **Despliegue**, nacimiento 01/01/1990, nacionalidad y residencia Argentina, localidad Salta, domicilio "Prueba", teléfono +54 387 000-0000;
   - garantía en efectivo;
   - **Confirmar check-in.** Anotar el código de la reserva.
6. **Check-out de esa reserva:** Check-out → la reserva → verificación "Sin novedades" → registrar el pago del saldo (efectivo) → confirmar el check-out. La reserva queda **Cerrada**.
7. **Volver** a dejar `backend\.env` con la base local.

**Si algo falla:**
- **`expired transaction`:** reintentar una vez y anotarlo (ver las lecciones de arriba).
- **Un error de columna o tabla inexistente:** algo de la migración no quedó. Volver al paso 6.
- **Cualquier otro error:** anotarlo con la hora y evaluar si alcanza para la vuelta atrás.

**Código de la reserva de prueba, para la limpieza del 8/10** (solo lectura; lista lo que quedó con el prefijo):

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^"?]+)') { throw "No se pudo parsear DATABASE_URL" }
  $usuario = $Matches[1]; $password = [System.Uri]::UnescapeDataString($Matches[2])
  $servidor = $Matches[3]; $puerto = $Matches[4]; $basedatos = $Matches[5]
  $cnf = New-TemporaryFile
  try {
    @"
[client]
user=$usuario
password=$password
host=$servidor
port=$puerto
ssl-mode=REQUIRED
"@ | Set-Content -Path $cnf -Encoding ascii
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT r.id, r.codigoConfirmacion, r.estado, h.numeroDocumento FROM reservas r JOIN huespedes h ON h.id = r.huespedId WHERE h.numeroDocumento LIKE 'PRUEBA-DESPLIEGUE%';"
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

**Debería verse** una fila con el código, estado `Cerrada` y `PRUEBA-DESPLIEGUE-1`. **Anotarlo al final de este documento** ("Datos de prueba a limpiar").

### 9. Aviso al grupo

> Listo: la migración de estadía quedó aplicada en la compartida (verificada: 0 pendientes, esquema igual a `master`, conteos sin cambios). Ya pueden volver a usarla. Quedó una reserva de prueba (`PRUEBA-DESPLIEGUE-1`, código XXXXXXXX), cerrada, que se borra en la limpieza del jueves 8/10.

### 10. Actualizar la base local de cada integrante

Cada uno, con su `backend\.env` apuntando a **su base local**:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI
git checkout master
git pull --ff-only origin master
Set-Location backend
npm install
npx prisma generate
node scripts/actualizar-esquema-estadia.js            # plan: muestra qué le falta a tu base local
node scripts/actualizar-esquema-estadia.js --aplicar  # aplica solo lo que falta (aditivo, reejecutable)
```

`actualizar-esquema-estadia.js` no lee `.env`: usa la variable `DATABASE_URL` de la terminal. Si no está definida, se niega. Para tomarla del `.env`:

```powershell
$env:DATABASE_URL = ((Get-Content .env | Select-String '^DATABASE_URL=').Line -replace '^DATABASE_URL="?([^"]*)"?$', '$1')
node scripts/actualizar-esquema-estadia.js --aplicar
Remove-Item Env:DATABASE_URL
```

Con una base local **no pide confirmación** (la guardia acepta `localhost` y `127.0.0.1`). Si alguna vez pidiera "Escribí el nombre de la base", es que `DATABASE_URL` apunta a otro lado: cancelar.

---

## Vuelta atrás (restaurar el backup)

Solo si algo salió mal y no se puede seguir. El backup del paso 3 tiene `DROP TABLE` y `CREATE TABLE` de cada tabla que existía, pero **no tiene las 3 tablas nuevas** (no existían). Por eso primero se borran esas 3 y después se restaura el backup **con `source`**: no hace falta `DROP DATABASE`, que en Clever Cloud puede no estar permitido.

**Atención:** la vuelta atrás **descarta todo lo que se haya escrito después del backup**. Por eso se congelan las escrituras.

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
$global:archivoBackup   # tiene que mostrar el backup del paso 3; si no, asignarlo a mano (ver paso 3)

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^"?]+)') { throw "No se pudo parsear DATABASE_URL" }
  $usuario = $Matches[1]; $password = [System.Uri]::UnescapeDataString($Matches[2])
  $servidor = $Matches[3]; $puerto = $Matches[4]; $basedatos = $Matches[5]
  $cnf = New-TemporaryFile
  try {
    @"
[client]
user=$usuario
password=$password
host=$servidor
port=$puerto
ssl-mode=REQUIRED
"@ | Set-Content -Path $cnf -Encoding ascii
    $mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
    # 1) Las tres tablas que creó la migración (no están en el backup).
    & $mysql --defaults-extra-file=$cnf $basedatos -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE IF EXISTS asignaciones_ocupantes, eventos_estadia, ocupantes_reserva; SET FOREIGN_KEY_CHECKS=1;"
    # 2) Restaurar el backup: MySQL lee el archivo directamente (sin pasar por PowerShell).
    $ruta = $global:archivoBackup -replace '\\', '/'
    & $mysql --defaults-extra-file=$cnf --default-character-set=utf8mb4 $basedatos -e "source $ruta"
    Write-Host "Restauración terminada."
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

**Tiempo esperado:** varios minutos contra Clever Cloud. No cortar.

Después:
1. **Verificar:** la verificación previa (paso 4) tiene que volver a decir "Operaciones faltantes: 32 de 32" y los mismos conteos del paso 4 original.
2. **Volver `master` a la versión anterior** (revertir el merge de estadía, coordinado con el grupo). Si no, la app desplegada espera las columnas nuevas.
3. **Avisar al grupo:** qué pasó, que la base volvió al estado del backup y qué se perdió (lo escrito después del backup, que debería ser nada, por el congelamiento).

---

## Ensayo (2/10/2026, copia local de la compartida)

**Datos:** backup real de la compartida generado por Gimena el 2/10 a las 23:09 con las opciones del paso 3 (`backup-compartida-ensayo-20261002-2309.sql`: 239.382 bytes, 40 tablas, `-- Dump completed`, sin `USE` ni `DEFINER`, 40 `DROP TABLE IF EXISTS`).

**Destino:** base local nueva `hotelhi_ensayo`. Se usó el **modo explícito** (`CONFIRMAR_BASE_COMPARTIDA=hotelhi_ensayo` y la confirmación por teclado), con los mismos scripts que el despliegue. Claude Code no se conectó a la compartida.

| Paso | Tiempo (local) | Resultado |
|---|---|---|
| Restaurar el backup con `source` | ~4 s | 40 tablas; 43 reservas, 38 huéspedes |
| Verificación previa | 5,4 s | Faltantes **32 de 32**; `huespedes` solo con `PRIMARY`; tipos de documento: 38 DNI (todos en el catálogo); 4 reservas En curso sin fichas y 1 Confirmada (aviso, no frena); **12 sentencias de diferencia, todas de la migración**; **OK para migrar** |
| Plan (sin `--aplicar`) | < 1 s | Pidió escribir el nombre de la base; listó las 32 operaciones |
| Migración (`--aplicar`) | **1,8 s** | Respaldo JSON de las tablas afectadas; "Actualización terminada. Pendientes: 0" |
| Segunda corrida | 0,4 s | **"Operaciones faltantes: 0"** |
| Verificación posterior | 3,8 s | 0 pendientes y columnas nuevas presentes; **conteos idénticos** en las 11 tablas; `prisma migrate diff` **sin diferencias**; "OK: la migración quedó aplicada y verificada" |
| Vuelta atrás: borrar las 3 tablas nuevas | 0,2 s | Sin errores |
| Vuelta atrás: restaurar con `source` | 3,6 s | Sin errores; la verificación previa volvió a dar **32 de 32** y los mismos conteos; acentos intactos ("Gudiño") |
| Borrar `hotelhi_ensayo` | — | Borrada. También se borraron los archivos temporales y la copia JSON local de los datos |

**Problemas encontrados:**
- **Ninguno en la migración ni en la vuelta atrás.**
- **Una falsa alarma al verificar los acentos:** en MySQL, con la intercalación `utf8mb4_unicode_ci`, `LIKE '%Ã%'` también encuentra nombres con "A", porque no distingue acentos. Para buscar texto mal codificado hay que comparar en binario: `WHERE BINARY nombre LIKE BINARY '%Ã%'`, que dio 0.

**Diferencias esperables en el despliegue real:**
- **Tiempos:** son locales; contra Clever Cloud se multiplican por la latencia (ver el paso 5).
- **Estado de la compartida:** puede haber cambiado entre el 2/10 y el despliegue. La verificación previa del paso 4 es la que manda.

## Datos de prueba a limpiar (jueves 8/10)

| Qué | Identificación | Código |
|---|---|---|
| Reserva walk-in de la prueba de humo (cerrada), con su huésped, ficha, pagos y eventos | documento `PRUEBA-DESPLIEGUE-1` | _(anotar en el despliegue)_ |
