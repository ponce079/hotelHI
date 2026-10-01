# Runbook de despliegue — Etapa 4C (cierre de tarifas por temporada)

> Ensayado de punta a punta contra una base local (`sgh_ensayo`), restaurada desde un dump de solo lectura de la base compartida, antes de tocar Clever Cloud. Los comandos de abajo apuntan a la base compartida real.
>
> Todos los comandos están en PowerShell. **La contraseña de Clever Cloud nunca se tipea ni se pega**: cada bloque la lee de `backend\.env.compartida.bak` (parseando `DATABASE_URL`) dentro de su propio `& { ... }`, y la limpia al terminar (`finally` para archivos temporales, `Remove-Item Env:DATABASE_URL` para la variable de entorno).
>
> **Cada bloque es autocontenido — no depende de funciones ni variables definidas en un bloque anterior.** En el despliegue real, una función compartida (`Get-CredencialesCompartida`) definida al principio del documento resultó frágil en la práctica: si se abre una terminal nueva a mitad del procedimiento, la función no está cargada y el bloque falla. Cada bloque de abajo repite el parseo de `DATABASE_URL` inline — más repetitivo de leer, pero funciona sin importar en qué terminal o en qué momento se corra. Por la misma razón, cada bloque empieza con `Set-Location C:\...\hotelHI` (o la ruta del repo que corresponda) — no asumir que la terminal ya está en el lugar correcto.
>
> Un bloque `& { ... }` de varias líneas en PowerShell necesita un Enter extra al final para ejecutarse. Si un comando puede abrir un prompt interactivo (por ejemplo `prisma db push` sin `--accept-data-loss`, que pregunta "Do you want to ignore the warning(s)?"), el paso correspondiente lo avisa antes y dice qué responder.
>
> **Nunca redirigir la salida de `mysqldump` con `>`** — en Windows PowerShell reinterpreta el stream como texto y lo reescribe en otra codificación, lo que puede corromper el dump. Usar siempre `--result-file` (nativo de `mysqldump`, escribe los bytes tal cual). Mismo criterio para extraer un archivo de texto con `git show ... | Out-File`: si el contenido tiene acentos, preferir `git show ... > archivo.txt` corrido con `cmd /c` en vez del pipeline de PowerShell, que puede alterarlos.

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

### Lo propio de tarifas (Etapa 4C, aplicado en el schema final — paso 11)

- `habitaciones.tarifaPorNoche` (columna reemplazada por completo por `ReservaNoche.precioNoche`, motor de cotización).
- `habitaciones.tipo` (texto libre, reemplazado por `TipoHabitacion` + `tipoHabitacionId`, Etapa 1).

## Procedimiento paso a paso

### 1. Backup completo

MySQL Server 8.0 ya está instalado (`mysqldump.exe`/`mysql.exe` en `C:\Program Files\MySQL\MySQL Server 8.0\bin\`). El dump se guarda **fuera del repo** (por ejemplo `C:\Users\<usuario>\Documents\backups-sgh\`):

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

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
    $global:fechaDespliegue = Get-Date -Format "yyyyMMdd-HHmm"
    $global:archivoBackup = "$carpetaBackup\backup-antes-4c-$global:fechaDespliegue.sql"

    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" `
      --defaults-extra-file=$cnf `
      --single-transaction --routines --triggers --default-character-set=utf8mb4 `
      --set-gtid-purged=OFF --add-drop-table --column-statistics=0 --no-tablespaces `
      --result-file="$global:archivoBackup" `
      $basedatos

    Write-Host "Backup en: $global:archivoBackup"
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

`$global:archivoBackup` solo sirve para el paso 2 **dentro de la misma ventana de PowerShell**. Si se cierra o se abre una terminal nueva, hay que volver a asignarlo a mano (`$global:archivoBackup = "C:\...\backup-antes-4c-AAAAMMDD-HHmm.sql"`) antes de usarlo en pasos posteriores (la vuelta atrás, al final).

`--result-file` en vez de `>`: en Windows PowerShell, `>` reinterpreta el stream de `mysqldump` como texto y lo reescribe en otra codificación — puede corromper el dump. `--result-file` es nativo de `mysqldump` y escribe los bytes tal cual.

`--routines --triggers`: en el ensayo, esta combinación con `--single-transaction` había fallado con `Access denied; need RELOAD privilege` contra Clever Cloud. En el despliegue real corrió sin problema con `--result-file` y `--default-character-set=utf8mb4`. **Si vuelve a fallar con ese mismo error, sacar `--routines --triggers`** (no hay procedures/triggers propios de la app en este schema, así que perderlos no es crítico) y reintentar.

### 2. Verificar el backup

```powershell
Get-Item $global:archivoBackup | Select-Object Name, Length
Select-String -Path $global:archivoBackup -Pattern "^CREATE TABLE" | Measure-Object
```

Confirmar que el tamaño no es 0 y que el conteo de `CREATE TABLE` coincide con lo esperado (46, igual que en el ensayo). El archivo ya quedó fuera del repo (paso 1) y accesible para el equipo — es la vía de rollback.

### 3. Verificación de integridad de datos ANTES del push (con las tablas `bkp_*` todavía presentes)

**Este paso es SOLO de verificación — comparar y reportar, nunca modificar datos durante el despliegue.** Existe porque `bkp_huespedes`/`bkp_ocupantes`/`bkp_reservas_huesped` no son solo respaldo estructural: son la foto de los datos justo antes de que `migrar-estadia.js` los tocara. Antes de borrarlas (paso 4 las elimina), hay que confirmar que los datos actuales de `huespedes`/`reservas` no quedaron en un estado que solo entienda el código revertido.

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

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
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT h.id, h.numeroDocumento AS actual, b.numeroDocumento AS backup FROM huespedes h JOIN bkp_huespedes b ON b.id = h.id WHERE h.numeroDocumento != b.numeroDocumento;"
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT h.id FROM huespedes h LEFT JOIN reservas r ON r.huespedId = h.id WHERE r.id IS NULL;"
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

- Primera consulta: huéspedes cuyo `numeroDocumento` cambió respecto del backup.
- Segunda consulta: huéspedes sin ninguna reserva (huérfanos).

**En el ensayo contra `sgh_ensayo` esto encontró**: 2 documentos cambiados (puntuación eliminada) y 1 huésped huérfano, sin ningún otro drift (0 diferencias en `reservas.huespedId`). En el ensayo se restauraron y se borró el huérfano porque todo era dato de prueba (decisión tomada para `sgh_ensayo` específicamente). **Contra la base compartida real, NO se corrige nada acá.**

**Si esta verificación encuentra cualquier diferencia contra la base compartida, FRENAR antes de seguir al paso 4** (que borra `bkp_*` para siempre) y consultar al equipo — no decidir en el momento ni restaurar/borrar como parte del despliegue. La limpieza de datos (si hace falta) se planifica aparte, como tarea propia, antes de la entrega — no se improvisa durante esta ventana. Guardar el resultado de las dos consultas (que va a hacer falta para esa limpieza) antes de continuar.

**Resultado real del despliegue (2026-09-30)**: la verificación encontró los mismos 3 registros que ya se habían visto en el ensayo contra `sgh_ensayo` — id 24 (`PRUEBAEMAIL1790281702779` vs `PRUEBA-EMAIL-1790281702779` en el backup, un documento de prueba de integración), id 45 (`40062213` vs `40.062.213` en el backup) y el huésped huérfano id 73. **Decisión del equipo: seguir con el despliegue sin modificar estos 3 registros** — son datos de prueba (todo el contenido del sistema en esta etapa lo es), ya verificados como compatibles con el código actual durante el ensayo, y la limpieza de datos se planifica aparte, antes de la entrega, no durante esta ventana de despliegue.

**Nota para la limpieza — formato de `numeroDocumento` que usa el código actual**: revisado en `reservas.servicio.js` (`textoObligatorio`), `checkIn.servicio.js` y `frontend/src/modulos/reservas/validarHuesped.js` — en los tres, `numeroDocumento` es **texto libre**: se guarda tal cual lo tipeó quien hizo el alta, con un único `.trim()` (espacios al borde), sin sacar puntos/guiones ni forzar ningún formato. La búsqueda (alta que reutiliza huésped existente, check-in por documento) compara por **igualdad exacta de string** — nunca normaliza. Esto quiere decir que "45.112.902" y "45112902" son, para el código, dos documentos distintos que no matchean entre sí. Cualquier limpieza de formato tiene que decidir un formato único y aplicarlo consistente — el código no va a tolerar que convivan variantes del mismo documento.

### 4. Estructura intermedia (aditiva)

Extraer el schema del tag `etapa4c-schema-intermedio` sin cambiar de rama, aplicarlo, y regenerar el cliente:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

cmd /c "git show etapa4c-schema-intermedio:backend/prisma/schema.prisma > schema-intermedio.prisma"
Copy-Item backend\prisma\schema.prisma backend\prisma\schema.prisma.bak
Copy-Item schema-intermedio.prisma backend\prisma\schema.prisma

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="([^"]+)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]
  try {
    Set-Location backend
    npx prisma db push --accept-data-loss   # <- ÚNICO --accept-data-loss autorizado sobre la base compartida
    npx prisma generate
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
}
```

`cmd /c "git show ... > archivo"` en vez de `git show ... | Out-File`: el pipeline de PowerShell reinterpreta los acentos del contenido al pasar por su propia decodificación de consola — `cmd /c` con `>` captura los bytes tal cual.

**Si Prisma pide `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`**: eso es porque un agente de IA está corriendo el comando. Contra la base compartida este paso lo corre una persona directamente en su propia terminal, no un agente — no debería aparecer. Si aparece, es señal de que algo está corriendo esto de forma automatizada y hay que parar a revisar.

### 5. `migracion-tipo-habitacion.js`

Cada bloque de `node scripts/...` de acá en adelante necesita `$env:DATABASE_URL` apuntando a la base compartida en esa misma terminal (seteado en el paso 4 y no limpiado todavía) — si se abrió una terminal nueva, hay que volver a setearlo igual que en el paso 4, corriendo el `node scripts/...` **dentro** de ese mismo bloque `& { ... try { ... } finally { Remove-Item Env:DATABASE_URL } }`, no suelto.

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="([^"]+)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]
  try {
    Set-Location backend
    node scripts/migracion-tipo-habitacion.js --dry-run
    # revisar la salida — confirma qué habitaciones quedan sin tipoHabitacionId
    node scripts/migracion-tipo-habitacion.js --apply
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
}
```

Si la base compartida ya pasó por la Etapa 1 (fue el caso en el ensayo y en el despliegue real: 0 habitaciones pendientes), este paso es un no-op esperado — no falla, solo confirma que no hay nada para migrar.

### 6. `seed-tarifas.js`

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="([^"]+)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]
  try {
    Set-Location backend
    node scripts/seed-tarifas.js
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
}
```

Idempotente: crea la temporada Base, los planes BAR/NRF y los 7 modificadores por día de semana si no existen, o confirma que ya existen.

### 7. `seed-usuarios-prueba.js` (solo si faltan)

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

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
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT usuario FROM usuarios;"
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

Si ya están los 7 usuarios `*.prueba` (uno por rol) no hace falta correr nada. Si falta alguno:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="([^"]+)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]
  try {
    Set-Location backend
    node scripts/seed-usuarios-prueba.js
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
}
```

### 8. Snapshot de importes ANTES de migrar reservas

Antes de tocar reservas existentes, registrar el total de alojamiento de cada una con la fórmula vieja (`Habitacion.tarifaPorNoche × noches`), para comparar exacto después:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

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
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT rh.reservaId, SUM(h.tarifaPorNoche * DATEDIFF(r.fechaHasta, r.fechaDesde)) AS total_antes FROM reservas_habitaciones rh JOIN habitaciones h ON h.id = rh.habitacionId JOIN reservas r ON r.id = rh.reservaId GROUP BY rh.reservaId ORDER BY rh.reservaId;" | Out-File -Encoding utf8 importes-antes.txt
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

### 9. `migrar-reservas-a-reserva-noche.js`

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="([^"]+)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]
  try {
    Set-Location backend
    node scripts/migrar-reservas-a-reserva-noche.js
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
}
```

Idempotente (solo toca `planTarifarioId IS NULL`), transaccional por reserva, cada reserva con su propia conexión (ver "Incidente real" más abajo). Si falla alguna, el propio script revierte lo que haya quedado a medias y la deja pendiente para reintentar — correrlo de nuevo (entero, o con `node scripts/migrar-reservas-a-reserva-noche.js --ids=1,4,5` para reintentar solo algunas) es seguro.

### 10. Verificación de importes DESPUÉS

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

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
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT rh.reservaId, SUM(rn.precioNoche) AS total_despues FROM reservas_habitaciones rh JOIN reservas_noche rn ON rn.reservaHabitacionId = rh.id GROUP BY rh.reservaId ORDER BY rh.reservaId;" | Out-File -Encoding utf8 importes-despues.txt
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

Comparar `importes-antes.txt` contra `importes-despues.txt` reserva por reserva — **tienen que coincidir exactos**. Si aparece una diferencia acá, FRENAR: no seguir al paso 11 (que borra la columna que permite recalcular) sin resolverlo.

### 11. Estructura final

Restaurar el schema real de `feature/tarifas` (el que quedó mergeado a `master` con este PR) y aplicarlo. **Antes de aplicar, correr la vista previa sin `--accept-data-loss`** (va a preguntar "Do you want to ignore the warning(s)?" — responder N) y confirmar que la lista de columnas/tablas coincide con la sección "Qué se elimina de la base compartida" de arriba — si aparece cualquier otra cosa (en particular, algo de nuestras propias tablas de tarifas), FRENAR y no seguir:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

git checkout -- backend/prisma/schema.prisma
git diff backend/prisma/schema.prisma   # no debería mostrar nada — ya es el de master

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="([^"]+)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]
  try {
    Set-Location backend
    npx prisma db push   # vista previa — va a preguntar, responder N
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
}
```

Si la lista coincide, aplicar de verdad:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="([^"]+)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]
  try {
    Set-Location backend
    npx prisma db push --accept-data-loss   # dropea tarifaPorNoche y tipo — ver sección anterior
    npx prisma generate
    Set-Location ..
  } finally {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }
}
```

Esto sí puede pedir `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` de la misma manera si se corre con un agente — de nuevo, contra la base compartida este paso lo corre una persona.

**Nota real (2026-09-30)**: en el despliegue real, entre la estructura intermedia (paso 4) y este paso, alguien conectó su propio entorno de `feature/estadia-ocupantes` contra esta misma base y volvió a crear `asignaciones_ocupantes`/`eventos_estadia`/`ocupantes_reserva` con datos de prueba. La vista previa de este paso los mostró de nuevo en la lista de cosas a borrar — exactamente donde ya estaban antes de la estructura intermedia. Ver "Incidente real" al final de este documento.

### 12. Cerrar

- Verificar que `schema-intermedio.prisma` y `backend/prisma/schema.prisma.bak` ya no existen (`Remove-Item` si quedó alguno) y que `git status` no muestra ningún cambio en `backend/prisma/schema.prisma` (tiene que ser idéntico al de `master`).
- **NO correr `seed-demo-salta.js` contra la base compartida** — el script se niega solo si `NODE_ENV=production`, pero además no tiene sentido cargar reservas de ejemplo en el entorno que usa todo el equipo, y (ver "Incidente real" al final) el motor de alta de reservas tiene un bug de timeout contra la latencia de Clever Cloud que todavía no está corregido en el código de la app — correrlo ahí es más riesgo que valor. `seed-demo-salta.js` es para la base local de cada uno, una vez corregido ese bug (ver `docs/bug-timeout-transacciones.md`).
- Verificación funcional de solo lectura contra la base compartida (login, grilla de tarifas, cotizador, detalle de una reserva existente) — sin crear ni confirmar nada — antes de avisar que terminó.
- Avisar al grupo que el despliegue terminó.
- **Cada uno, en su propia base local**: `git pull`, `npx prisma generate`, `npx prisma db push` (o migración equivalente) contra su `sgh_<nombre>`, y opcionalmente `node scripts/seed-demo-salta.js` para tener datos de demostración.

## Incidente real del despliegue (2026-09-30)

Durante la ventana de despliegue, con el equipo avisado de no conectarse, se detectó que **otra conexión (IP distinta a la de quien ejecutaba el despliegue) escribió en la base compartida**: la vista previa del paso 11 mostró de nuevo `asignaciones_ocupantes` (1 fila), `eventos_estadia` (4 filas) y `ocupantes_reserva` (1 fila) — tablas que el paso 4 ya había eliminado — además de las columnas de garantía/consumos de `feature/estadia-ocupantes`, con los mismos conteos que tenían originalmente. Las 4 filas de `eventos_estadia` estaban firmadas por el usuario `recepcionista.prueba` (uno de los usuarios de prueba compartidos) sobre la reserva 98, entre las 20:47 y las 20:51. La lectura más probable: alguien tenía corriendo un backend con el código y el schema de `feature/estadia-ocupantes` apuntando por error a la base compartida (en vez de a su base local), y usó una función real de check-in/ocupantes.

Verificado antes de seguir:
- **Ninguna conexión activa** en el momento de la verificación (`SHOW PROCESSLIST` solo mostraba la propia).
- **Los datos de tarifas estaban intactos**: 43/43 reservas con plan asignado, `ReservaNoche` completas, importes exactos contra el snapshot tomado antes de la migración (suma total $5.100.000, verificada dos veces). Ninguna reserva, huésped ni pago nuevo respecto del snapshot original.
- El paso 11 (estructura final) eliminó de nuevo esas 3 tablas y las columnas asociadas sin problema — quedaron fuera de la base, como corresponde.

**Decisión tomada**: seguir con el despliegue sin esperar a coordinar con esa persona (dato de prueba, sin impacto en tarifas), y avisar al equipo del incidente al cerrar. Si esto vuelve a pasar en un despliegue futuro, parar y confirmar con el equipo antes de aplicar la estructura final — esta vez se decidió seguir porque los datos de tarifas ya estaban verificados como intactos y la causa (otro entorno de desarrollo mal apuntado) no afecta la integridad de lo que se está desplegando.

Separado de esto: al intentar `seed-demo-salta.js` (para tener datos de demostración), la creación de una de las reservas de ejemplo falló con el mismo tipo de error que ya se había corregido en `migrar-reservas-a-reserva-noche.js` (`Transaction API error: ... expired transaction`), esta vez en el código real de alta de reservas (`reservas.servicio.js:crearReservaEnTransaccion`), que crea una `ReservaNoche` por noche en vez de usar `createMany`. Este fallo fue limpio (sin datos parciales, confirmado), pero el mismo patrón está en más de un lugar del código real de la aplicación — ver análisis completo en `docs/bug-timeout-transacciones.md`. Por eso se decidió saltear `seed-demo-salta.js` en la base compartida en este despliegue.

## Vuelta atrás

Si algo falla a mitad de camino (antes del paso 11 incluido) y no se puede seguir:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI

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
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf -e "DROP DATABASE $basedatos; CREATE DATABASE $basedatos;"
    Get-Content $global:archivoBackup -Raw | & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

`$global:archivoBackup` tiene que apuntar al backup del paso 1 (ver nota en ese paso si es una terminal nueva).

Después, restaurar `backend/prisma/schema.prisma` al estado de `master` antes de este PR (`git checkout origin/master -- backend/prisma/schema.prisma` o el equivalente) y `npx prisma generate`, para que el cliente vuelva a coincidir con la base restaurada.
