# Runbook de despliegue — E-commerce, garantía con tarjeta y normalización de documentos en la base compartida

Despliegue de `feature/ecommerce` (`969a6d3` o posterior) sobre la base compartida de Clever Cloud (MySQL en París, ~387 ms por consulta). La rama integra el motor de reservas web (Gimena y Tomás), la garantía con tarjeta, los cobros, las penalidades y la normalización de documentos (Ricardo), el cierre de la API y Mi perfil (Tomás). **Lo corre Gimena una sola vez**, con el grupo avisado.

> **Por qué es urgente:** `master` (`1960c0e`) ya tiene el trabajo de Ricardo y lee `garantias_reserva` y `garantias_estadia`. La compartida no las tiene: **hoy `master` falla contra la compartida** (Llegadas, cancelar, check-in). Hasta terminar este runbook, nadie levanta `master` contra la compartida.

> **Todos los comandos son de PowerShell** y se corren desde la carpeta del repo. **Ninguna contraseña ni secreto se tipea, se pega ni se muestra**: cada bloque los lee de `backend\.env.compartida.bak` dentro de su propio `& { ... }` y los limpia al terminar (`finally`). Cada bloque es autocontenido: se puede correr en una ventana nueva.
>
> **Un bloque `& { ... }` de varias líneas necesita un Enter extra al final** para ejecutarse.
>
> **Nunca redirigir `mysqldump` con `>`** ni pasar un `.sql` por el pipeline de PowerShell. El backup va con `--result-file` y la restauración con `source`.
>
> **Nunca `prisma db push` ni `prisma db execute` contra la compartida.** Las tablas se aplican **solo** con `scripts/actualizar-esquema-ecommerce.js`; los documentos se normalizan **solo** con `scripts/normalizar-documentos.js`.

## Qué cambia

### Esquema: cuatro tablas nuevas, solo aditivas

| Tabla | De quién | Para qué |
|---|---|---|
| `garantias_reserva` | Ricardo | Garantía de cada reserva (tarjeta tokenizada o pago anticipado), para todos los canales |
| `garantias_estadia` | Ricardo | Preautorización o depósito del check-in |
| `datos_reserva_web` | Gimena | Datos propios de una reserva web (contacto, políticas aceptadas, llegada, solicitudes, idempotencia) |
| `pasarela_operaciones` | Gimena (sobre la pasarela de Ricardo) | Registro de cada operación de la pasarela: idempotencia persistente y control de preautorizaciones |

Las cuatro dependen solo de `reservas` (las de garantía y datos web con FK `RESTRICT`/`CASCADE`; `pasarela_operaciones` sin FK). Ninguna tabla existente se modifica. Los conceptos nuevos ("Pago anticipado", "Penalidad por cancelación", "Penalidad no-show", "Devolución") y el estado "No-show" son texto: no requieren cambios de esquema.

### Datos: normalización de documentos

`claveDocumento` ahora usa el número normalizado (solo letras y dígitos, en mayúsculas): "45.112.902" y "45112902" son el mismo documento. **Las fichas guardadas con puntos, guiones o espacios dejan de reconocerse hasta correr `normalizar-documentos.js`** (si no se corre, el sistema les crea fichas duplicadas). El script:
- normaliza números y recalcula identidades;
- fusiona duplicados exactos en la ficha de menor id y redirige reservas y ocupantes;
- une fichas sin país con la ficha con país cuando hay un único país posible y el nombre coincide;
- deja en **"Revisar a mano"** las fichas con el mismo documento y nombres distintos (no las toca).

**Es el único paso que modifica datos existentes.** Por eso tiene ensayo propio y va después del backup.

### Variables de entorno (backend)

| Variable | Valor en la compartida |
|---|---|
| `PASARELA_TOKEN_SECRETO` | **Nueva y necesaria.** Secreto de al menos 32 caracteres para firmar los tokens de las tarjetas. Se genera en el paso 3 y queda solo en `backend\.env.compartida.bak`. Quien levante un backend contra la compartida tiene que usar **el mismo** (se pasa por un canal privado, nunca por el repo): con otro secreto, los cobros por token de las reservas existentes fallan |
| `WEB_PUBLIC_URL` | Sin valor (no hay URL pública) |
| `WEB_LIMITE_INTENTOS` | Ausente. `off` desactiva la protección: solo pruebas locales |
| `TRUST_PROXY` | Ausente. Nunca `true` (el backend no arranca) |
| `SMTP_*` | Las que ya tenga el archivo. El email sale en segundo plano si tarda más de 1,5 s |
| `AUTH_SECRET` | **Necesaria** (32+ caracteres; firma las sesiones). Si falta, se genera en el paso 3. Cambiarla cierra las sesiones abiertas |
| `TAREAS_AUTOMATICAS` | `off` en **todos** los backends que se conecten a la compartida, **salvo uno** (el de Gimena durante el despliegue y la prueba: ausente u `on`). Si varios backends corren el barrido de stock mínimo sobre la misma base, compiten por las conexiones y procesan lo mismo dos veces |
| `DATABASE_CONNECTION_LIMIT` | Según el cupo de la base que informa el verificador (paso 6). Por defecto 2 |
| `DATABASE_IDLE_TIMEOUT_MS` | Según el `wait_timeout` que informa el verificador (paso 6): por debajo de ese valor |

### Cambios de comportamiento que el grupo tiene que conocer

- **Toda la API exige sesión** salvo `/api/web/*` y `POST /api/auth/login` (167 de 175 rutas cerradas). Crear o modificar reservas y el check-in exigen rol admin o recepcionista.
- **La web vieja** (`/disponibilidad`, `/reservar`) redirige a `/web`.
- **Sin contraseñas por defecto:** el alta y el reseteo de usuarios exigen 10 o más caracteres; los seeds piden la contraseña por variable de entorno (`SEED_USUARIOS_PASSWORD`, `ADMIN_PASSWORD_INICIAL`).
- **Tarjetas de prueba:** 4242 aprobada; 0002 rechaza **todas** las operaciones (también la garantía de la tarifa flexible); 0069 vencida.

### Lecciones que aplican

- **Una transacción que vence no deja nada a medias.** Lo que vio Ricardo el 7/10 ("habitación ocupada" después de un time out) era un reintento de una operación que sí se había confirmado. Desde `7b236e2`, el check-in y el walk-in reconocen el reintento y devuelven lo existente, y sus transacciones hacen la misma cantidad de consultas (8 a 15) sin importar cuántas personas ingresan.
- **Latencia:** cada consulta tarda ~387 ms. Estimado contra la compartida (no medido): alta web no reembolsable ~34 s (el frontend espera hasta 60 s), transacción más larga ~14 s (límite 30 s), alta del mostrador ~20 a 24 s. La prueba de humo lo mide.
- **`IF NOT EXISTS` no corrige una tabla que ya existe con otra forma:** el runner compara contra `information_schema` y se niega si no coincide.
- **El 30/9 alguien conectó su entorno a la compartida:** se congelan escrituras y entornos durante el despliegue.
- **Los documentos se guardan normalizados:** "PRUEBA-DESPLIEGUE-WEB-1" queda como `PRUEBADESPLIEGUEWEB1`. Las consultas de limpieza buscan la forma normalizada.

---

## Procedimiento paso a paso

### 1. Aviso al grupo y congelamiento

> Voy a desplegar en la base compartida (Clever Cloud) las tablas de garantía, del e-commerce y de la pasarela, y a normalizar los documentos de huéspedes. Durante **1 hora y media**, a partir de ahora: **nadie use la app contra la compartida ni conecte su entorno a ella** (ni backend, ni seeds, ni `db push`, ni scripts). Les aviso cuando termine y qué tienen que correr en su base local.

Esperar la confirmación de todos (Ricardo, en especial: confirmar que **no** aplicó nada en la compartida).

### 2. Verificar la rama y los tests

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
git fetch origin
git checkout feature/ecommerce
git pull --ff-only origin feature/ecommerce
git log --oneline -3
git merge-base --is-ancestor 969a6d3 HEAD; if ($?) { "OK: tiene la robustez y la identificación por documento" } else { "FALTA 969a6d3: no seguir" }
git merge-base --is-ancestor origin/master HEAD; if ($?) { "OK: incluye master" } else { "master tiene commits que la rama no tiene: no seguir" }
git status --short
```

**Debería verse:** los dos "OK" y `git status` vacío. Si `master` tiene commits nuevos, **frenar** e integrarlos primero.

```powershell
Set-Location backend
npm ci
npx prisma generate
Set-Location ..\frontend
npm ci
Set-Location ..
npm test
```

**Debería verse:** backend **650 tests** y frontend **653 tests / 68 archivos** (o más), **todo en verde, sin ningún test fallando**. Si algo falla, **no seguir**.

### 3. Variables de la compartida (sin mostrar secretos)

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
Select-String -Path backend\.env.compartida.bak -Pattern '^(WEB_PUBLIC_URL|WEB_LIMITE_INTENTOS|TRUST_PROXY|TAREAS_AUTOMATICAS|DATABASE_CONNECTION_LIMIT|DATABASE_IDLE_TIMEOUT_MS)='
(Select-String -Path backend\.env.compartida.bak -Pattern '^(SMTP_[A-Z]+|PASARELA_TOKEN_SECRETO|AUTH_SECRET)=').Line | ForEach-Object { ($_ -split '=')[0] }
```

**Debería verse:** la primera línea sin resultados (o, si aparece `WEB_LIMITE_INTENTOS`, que no sea `off`; si aparece `TRUST_PROXY`, que no sea `true`). La segunda muestra solo **nombres**.

**Si `PASARELA_TOKEN_SECRETO` no aparece**, generarlo (no se muestra):

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
& {
  if (Select-String -Path backend\.env.compartida.bak -Pattern '^PASARELA_TOKEN_SECRETO=' -Quiet) { Write-Host "Ya existe: no se toca."; return }
  $bytes = New-Object byte[] 36
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secreto = [Convert]::ToBase64String($bytes)
  Add-Content -Path backend\.env.compartida.bak -Value "PASARELA_TOKEN_SECRETO=`"$secreto`""
  Write-Host "Secreto agregado ($($secreto.Length) caracteres)."
}
```

**Debería verse:** "Secreto agregado (48 caracteres)." Guardarlo también en el gestor de contraseñas del grupo (copiarlo desde el archivo, sin pegarlo en ningún chat).

**Si `AUTH_SECRET` no aparece**, el mismo bloque cambiando las dos apariciones de `PASARELA_TOKEN_SECRETO` por `AUTH_SECRET`. No hace falta compartirlo: cada backend puede tener el suyo (solo firma las sesiones de ese backend).

### 4. Backup completo

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
    $global:archivoBackup = "$carpetaBackup\backup-antes-ecommerce-$(Get-Date -Format 'yyyyMMdd-HHmm').sql"

    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" `
      --defaults-extra-file=$cnf `
      --single-transaction --set-gtid-purged=OFF --no-tablespaces --default-character-set=utf8mb4 `
      --result-file="$global:archivoBackup" `
      $basedatos

    Get-Item $global:archivoBackup | Select-Object Name, Length
    Write-Host "Tablas: $((Select-String -Path $global:archivoBackup -Pattern '^CREATE TABLE' | Measure-Object).Count)"
    foreach ($t in 'garantias_reserva','garantias_estadia','datos_reserva_web','pasarela_operaciones') {
      Write-Host "$t en el backup: $((Select-String -Path $global:archivoBackup -Pattern ('CREATE TABLE `' + $t + '`') | Measure-Object).Count)"
    }
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT VERSION() AS version;"
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
Get-Content $global:archivoBackup -Tail 1
```

**Debería verse:**
- el archivo, de algo más de 240 KB;
- **"Tablas: 43"**;
- las cuatro tablas nuevas **en 0** (si alguna da 1, alguien ya la creó: el paso 6 dirá si tiene la forma correcta);
- versión **8.0.x**;
- la última línea `-- Dump completed`.

`$global:archivoBackup` vale solo en esta ventana. En otra, asignarlo a mano: `$global:archivoBackup = "C:\Users\Gimena\Documents\backups-sgh\backup-antes-ecommerce-AAAAMMDD-HHmm.sql"`.

**Si el tamaño es 0, falta `-- Dump completed` o el conteo de tablas no es 43, NO SEGUIR** (salvo que la diferencia se explique: anotarla).

### 5. Ensayo completo sobre la copia (local, ~10 minutos) — obligatorio

Repite **todo** el despliegue (tablas y normalización) sobre una copia local del backup recién tomado, con el mismo modo explícito que se usa contra la compartida. La normalización modifica datos: **no se corre en la compartida sin haber visto antes su plan sobre la copia.**

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
$global:archivoBackup   # tiene que mostrar el backup del paso 4

& {
  $envLocal = Get-Content "backend\.env" -Raw
  if ($envLocal -notmatch 'DATABASE_URL="?mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^"?\s]+)') { throw "No se pudo parsear DATABASE_URL local" }
  $usuario = $Matches[1]; $passCruda = $Matches[2]; $password = [System.Uri]::UnescapeDataString($passCruda)
  $servidor = $Matches[3]; $puerto = $Matches[4]
  if ($servidor -notin @('localhost', '127.0.0.1')) { throw "backend\.env no apunta a una base local: NO seguir" }
  $ensayo = "hotelhi_ensayo_web"
  $mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
  $cnf = New-TemporaryFile
  try {
    @"
[client]
user=$usuario
password=$password
host=$servidor
port=$puerto
"@ | Set-Content -Path $cnf -Encoding ascii

    & $mysql --defaults-extra-file=$cnf -e "DROP DATABASE IF EXISTS $ensayo; CREATE DATABASE $ensayo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    $ruta = $global:archivoBackup -replace '\\', '/'
    & $mysql --defaults-extra-file=$cnf --default-character-set=utf8mb4 $ensayo -e "source $ruta"

    $env:DATABASE_URL = "mysql://${usuario}:${passCruda}@${servidor}:${puerto}/$ensayo"
    $env:CONFIRMAR_BASE_COMPARTIDA = $ensayo
    Set-Location backend
    Write-Host "`n=== Verificación previa ==="; node scripts/verificar-previo-ecommerce.js
    Write-Host "`n=== Plan de tablas (escribir: $ensayo) ==="; node scripts/actualizar-esquema-ecommerce.js
    Write-Host "`n=== Aplicar tablas (escribir: $ensayo) ==="; node scripts/actualizar-esquema-ecommerce.js --aplicar
    Write-Host "`n=== Segunda corrida (escribir: $ensayo) ==="; node scripts/actualizar-esquema-ecommerce.js
    Write-Host "`n=== Verificación posterior ==="; node scripts/verificar-previo-ecommerce.js --despues
    Write-Host "`n=== Normalización: plan ==="; node scripts/normalizar-documentos.js
    Write-Host "`n=== Normalización: aplicar (escribir: $ensayo) ==="; node scripts/normalizar-documentos.js --aplicar
    Write-Host "`n=== Normalización: segunda simulación ==="; node scripts/normalizar-documentos.js
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
    & $mysql --defaults-extra-file=$cnf -e "DROP DATABASE IF EXISTS hotelhi_ensayo_web;"
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

Cuando pida el nombre de la base, escribir **`hotelhi_ensayo_web`**. **Debería verse:**
- verificación previa: "Operaciones faltantes: 4 de 4", diferencia de esquema solo de las cuatro tablas, "OK para migrar.";
- aplicar: "Actualización terminada. Pendientes: 0"; segunda corrida: "Operaciones faltantes: 0 de 4";
- verificación posterior: conteos iguales, "Sin diferencias…", "OK: la migración quedó aplicada y verificada.";
- normalización, plan: "Fichas a corregir", "Documentos duplicados a unificar" (incluye las fichas viejas sin país que se unen a la del mismo tipo y número), "Revisar a mano", "Ocupantes a corregir" y "Conflictos (revisar a mano)"; aplicar sin errores ("Listo: documentos normalizados."); segunda simulación **en cero**.

**Anotar el plan de normalización** en la sección "Ensayo" (cantidades y cada ficha de "Revisar a mano"). Ese plan es exactamente lo que va a pasar en la compartida.

**Frenar y consultar con el grupo si:** alguna operación del plan de tablas no es de las cuatro tablas; la normalización fusiona fichas que no deberían ser la misma persona (mirar cada fusión); "Revisar a mano" tiene fichas de huéspedes reales que hay que resolver antes; o algo da error.

### 6. Verificación previa en la compartida (solo lectura)

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="(mysql://[^"]+/([^"?/]+)[^"]*)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]; $env:CONFIRMAR_BASE_COMPARTIDA = $Matches[2]
  try {
    Set-Location backend
    $inicio = Get-Date
    node scripts/verificar-previo-ecommerce.js
    "Duración: {0:n0} s" -f ((Get-Date) - $inicio).TotalSeconds
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
  }
}
```

**Debería verse** (entre 15 segundos y 1 minuto) lo mismo que en el ensayo: tablas base presentes, **"Operaciones faltantes: 4 de 4"**, diferencia solo de las cuatro tablas, conteos guardados en `backend\.local\` y los avisos de negocio:
- tipos vendibles con capacidad; **"← Doble con capacidad 4, corregir a 3"** si existe (se corrige en el paso 11);
- planes BAR y NRF visibles en la web; temporada BASE;
- **tarifa vigente hoy y a 60 días por tipo** (si falta, cargarla antes de la prueba de humo);
- reservas Confirmadas y En curso;
- **límites del servidor:** `max_user_connections` / `max_connections`, `wait_timeout`, `interactive_timeout` e `innodb_lock_wait_timeout`, con la **recomendación** de `DATABASE_CONNECTION_LIMIT` y `DATABASE_IDLE_TIMEOUT_MS`. Anotarlas y cargarlas en `backend\.env.compartida.bak` antes de la prueba de humo (paso 11). Con el cupo, una regla simple: la suma de `DATABASE_CONNECTION_LIMIT` de todos los backends conectados a la vez no puede pasarlo;
- **habitaciones inconsistentes:** "Ocupada" sin una reserva En curso que la ocupe, o reservas En curso sin habitación ocupada (lo que pudo dejar la prueba de Ricardo del 7/10). No frena la migración: se corrige en el paso 11.2, desde Habitaciones (estado) o desde la reserva, después de revisar cada caso.

**Resultado: `OK para migrar.`** Si dice `NO seguir`:

| Mensaje | Qué hacer |
|---|---|
| Faltan tablas base o "la base no está en el esquema de master" | **Frenar** y revisar con el grupo. No forzar nada. |
| "La tabla … ya existe con una forma distinta" | Alguien la creó antes. Mirar las diferencias y las filas. **Frenar**: no borrarla sin acordarlo. |
| Error de conexión o permisos | Reintentar una vez. Si persiste, frenar. |

### 7. Aplicar las tablas

Primero el **plan** (pide el nombre de la base por teclado):

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="(mysql://[^"]+/([^"?/]+)[^"]*)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]; $env:CONFIRMAR_BASE_COMPARTIDA = $Matches[2]
  try {
    Set-Location backend
    node scripts/actualizar-esquema-ecommerce.js
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
  }
}
```

**Debería verse** "Operaciones faltantes: 4 de 4" y las cuatro sentencias `CREATE TABLE IF NOT EXISTS`.

Después, **aplicar**: el mismo bloque cambiando la línea por `node scripts/actualizar-esquema-ecommerce.js --aplicar` (y, si querés, midiendo con `$inicio = Get-Date` como en el paso 6).

**Debería verse:** la confirmación por teclado, la aclaración de que no hace respaldo JSON (no modifica tablas existentes) y **"Actualización terminada. Pendientes: 0"**. **Tiempo esperado:** entre 10 y 40 segundos. No cortar.

**Si se corta a mitad:** cada `CREATE TABLE` es una sentencia DDL completa. Volver a correr el bloque: aplica solo las que falten.

### 8. Segunda corrida

El bloque del plan del paso 7. **Debería verse "Operaciones faltantes: 0 de 4"**.

### 9. Verificación posterior de las tablas (solo lectura)

El bloque del paso 6 con `node scripts/verificar-previo-ecommerce.js --despues` (necesita el JSON del paso 6, en esta computadora). **Debería verse:** 0 pendientes; las cuatro tablas con la forma esperada; conteos antes/después **iguales**; **"Sin diferencias: la base coincide con schema.prisma."**; **`OK: la migración quedó aplicada y verificada.`**

Si algún conteo cambió, alguien escribió durante el despliegue: averiguar antes de seguir.

### 10. Normalización de documentos

Primero el **plan** (no modifica nada):

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="(mysql://[^"]+/([^"?/]+)[^"]*)"') { throw "No se pudo parsear DATABASE_URL" }
  $env:DATABASE_URL = $Matches[1]; $env:CONFIRMAR_BASE_COMPARTIDA = $Matches[2]
  try {
    Set-Location backend
    node scripts/normalizar-documentos.js
  } finally {
    Remove-Item Env:DATABASE_URL, Env:CONFIRMAR_BASE_COMPARTIDA -ErrorAction SilentlyContinue
    Set-Location C:\Users\Gimena\Documents\hotelHI
  }
}
```

**Comparar con el plan del ensayo (paso 5):** tienen que coincidir. Si difieren, alguien escribió fichas después del backup: **frenar** y averiguar.

Si coincide, **aplicar**: el mismo bloque con `node scripts/normalizar-documentos.js --aplicar` (pide el nombre de la base por teclado). Después, el plan otra vez: **tiene que dar cero**.

Anotar las fichas de **"Revisar a mano"**: se resuelven en la pantalla de huéspedes, con el grupo, no en este despliegue.

**Si la normalización falla a mitad:** el script trabaja en una transacción; si aborta, no deja cambios. Si el resultado es incorrecto (fusionó fichas que no debía), la única vuelta atrás es **restaurar el backup completo** (ver "Vuelta atrás").

### 11. Prueba de humo (con la app apuntando a la compartida)

**Este paso escribe en la compartida.** Los datos llevan documentos identificables y se borran el jueves.

**Preparación:**

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
Copy-Item backend\.env backend\.env.local.bak -Force
Copy-Item backend\.env.compartida.bak backend\.env -Force
npm.cmd run dev
```

Antes de levantar, confirmar que `backend\.env.compartida.bak` tenga los valores de `DATABASE_CONNECTION_LIMIT` y `DATABASE_IDLE_TIMEOUT_MS` recomendados en el paso 6 y **no** tenga `TAREAS_AUTOMATICAS=off` (este es el único backend con tareas). Nadie más conectado a la compartida.

**11.1 API cerrada.** En el navegador, sin iniciar sesión: `http://localhost:3000/api/reservas` → **401** (JSON con `SESION_INVALIDA`). `http://localhost:3000/api/web/tipos` → **200**. `http://localhost:5173/reservar` → redirige a `/web`.

**11.2 Mostrador.** Login como recepcionista (si la contraseña por defecto ya no funciona, ver paso 12).
1. **Check-in → Llegadas de hoy:** carga sin error (prueba `garantias_reserva` y `datos_reserva_web`).
   - **Si el paso 6 informó habitaciones inconsistentes:** revisar cada una y corregirla (Habitaciones → estado, o la reserva). Anotarlas.
2. **Reservas → detalle de una reserva existente:** carga sin error.
3. **Si el paso 6 marcó una Doble de capacidad 4:** Habitaciones → editarla a capacidad **3**. Anotar el número.
4. **Alta del mostrador con garantía:** reserva nueva a 30 días o más. En el titular, **primero** tipo Pasaporte, país AR y número **`PRUEBA-DESPLIEGUE-MOST-1`** ("No hay un huésped registrado con ese documento"), después nombre **Prueba Despliegue Mostrador**, tarifa flexible, tarjeta 4242 4242 4242 4242, 12/28, 123. **Medir** el tiempo hasta la confirmación. En el detalle: tarjeta "Garantía de la reserva" con "Tarjeta Visa ••4242".
5. **Check-in y check-out de un walk-in** (el circuito que falló el 7/10): Check-in → walk-in de hoy, 2 adultos, titular Pasaporte AR **`PRUEBA-DESPLIEGUE-WALK-1`**, acompañante **`PRUEBA-DESPLIEGUE-WALK-2`**, garantía en efectivo. **Medir** (esperado: 15 a 25 s). Después, check-out con comprobante. Si da el mensaje "El sistema está tardando más de lo normal…", **no reintentar a ciegas**: buscarlo en Llegadas o en Reservas (debería haberse registrado) y anotar el tiempo.
6. **Cancelar la reserva del punto 4 desde el mostrador** (con más de 48 h: sin cargo). La garantía queda Liberada.

**11.3 Web: tarifa flexible.** En `http://localhost:5173/web`, con F12 → Red abierta:
1. Buscar entrada **a 30 días o más**, 2 noches, 1 adulto. Ver Doble y Simple con precio y el **desglose por noche** en el resumen.
2. Simple → Tarifa flexible. Datos: **Prueba Despliegue Web**, Pasaporte AR **`PRUEBA-DESPLIEGUE-WEB-1`**, nacimiento 01/01/1990, email **hotelhi.notificaciones@gmail.com**, teléfono +54 387 421-0000. Aceptar términos.
3. Pago: 4242, 12/28, 123 → Confirmar. **Medir** el POST `reservas` (esperado: 15 a 35 s). Debería verse el mensaje "Estamos confirmando tu reserva…" mientras procesa.
4. Confirmación: código (anotarlo), "Garantizada con tarjeta Visa terminada en 4242", aviso del email (enviado o "Te estamos enviando…").
5. Mostrador → detalle de esa reserva: "Garantía de la reserva" ("Tarjeta Visa ••4242") y "Reserva web" (contacto, políticas, llegada), **sin** repetir la tarjeta.
6. `/web/mi-reserva` → código + email → consulta; **Cancelar** (sin cargo) → Cancelada.

**11.4 Web: no reembolsable.**
1. Otra búsqueda (entrada a 35 días) → Simple → No reembolsable, documento **`PRUEBA-DESPLIEGUE-WEB-2`**, tarjeta 4242. **Medir.** Debería verse "Pagada" y "Cobrado $ X…".
2. Mi reserva: ofrece **"Cancelar"** con el texto "no se reintegra el importe pagado" y la casilla de aceptación. Cancelar aceptando → Cancelada, importe **retenido**, sin cobro nuevo. La habitación queda libre.

**11.5 (Opcional) Rechazo:** una flexible con 4000 0000 0000 0002 → "Fondos insuficientes". No más de dos rechazos (el límite bloquea el alta 30 minutos).

**Si algo falla:**
- **Error de red o timeout en un alta:** no cambiar datos; "Reintentar" (misma clave, no duplica). Buscar en el mostrador si la reserva quedó creada. Anotar el tiempo: si pasa de 50 s, avisar antes de la demo.
- **`expired transaction`:** no deja nada a medias; reintentar una vez y anotarlo.
- **Error de tabla inexistente:** volver al paso 8.
- **401 en el mostrador con sesión iniciada:** cerrar sesión, entrar de nuevo; si persiste, frenar (problema del cierre de API).
- **"Token inválido" al cancelar con cargo:** el backend no está usando el `PASARELA_TOKEN_SECRETO` del paso 3.
- **429:** reiniciar el backend.

**Cierre de la prueba:**

```powershell
# Ctrl+C para cortar npm run dev y después:
Set-Location C:\Users\Gimena\Documents\hotelHI
Copy-Item backend\.env.local.bak backend\.env -Force
Remove-Item backend\.env.local.bak
Select-String -Path backend\.env -Pattern '^DATABASE_URL=' | ForEach-Object { if ($_.Line -match '@(localhost|127\.0\.0\.1)') { "OK: .env apunta a la base local" } else { "ATENCIÓN: .env NO apunta a la base local" } }
```

**Datos de prueba que quedaron** (solo lectura):

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
    & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --defaults-extra-file=$cnf $basedatos -e "SELECT r.id, r.codigoConfirmacion, r.estado, h.numeroDocumento, (d.id IS NOT NULL) AS web, g.estado AS garantia FROM reservas r JOIN huespedes h ON h.id = r.huespedId LEFT JOIN datos_reserva_web d ON d.reservaId = r.id LEFT JOIN garantias_reserva g ON g.reservaId = r.id WHERE h.numeroDocumento LIKE 'PRUEBADESPLIEGUE%';"
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

**Debería verse** cuatro filas: `PRUEBADESPLIEGUEMOST1` (Cancelada, web 0), el walk-in de `PRUEBADESPLIEGUEWALK1` (**Cerrada**, web 0), `PRUEBADESPLIEGUEWEB1` y `PRUEBADESPLIEGUEWEB2` (Canceladas, web 1). Anotarlas al final.

### 12. Contraseñas por defecto

El código ya no tiene contraseñas por defecto, pero **las bases sí**: `admin` se creó con `admin123` en cada base donde se corrió `crear-tabla-usuarios.js`, y los usuarios `*.prueba` con la contraseña del seed. Las viejas siguen en el historial público del repo.

Con la app todavía apuntando a la compartida (o repitiendo la preparación del paso 11):
1. Login como `admin` (o `admin.prueba`).
2. **Usuarios → resetear contraseña** de `admin`, `admin.prueba`, `gerente.prueba`, `recepcionista.prueba`, `housekeeping.prueba`, `deposito.prueba` y `compras.prueba`: contraseñas nuevas de **10 o más caracteres**.
3. Guardarlas en el gestor de contraseñas del grupo y compartirlas por canal privado. **Nunca** en el repo ni en un chat con Claude.
4. Cerrar sesión y entrar con una de las nuevas para confirmar.

Repetir el reseteo en la base local de demo antes del jueves.

### 13. Aviso al grupo

> Listo: la compartida tiene las tablas de garantía, del e-commerce y de la pasarela (verificadas) y los documentos normalizados (N fichas corregidas, N fusionadas; para revisar a mano: …). La prueba de humo pasó. **Las contraseñas de los usuarios cambiaron**: se las paso por privado. Si van a levantar un backend contra la compartida, les paso también `PASARELA_TOKEN_SECRETO` (tiene que ser el mismo). Ahora abro el PR `feature/ecommerce` → `master`: cuando les avise que entró, sigan el paso 15 **antes** de levantar el backend. **Si alguna vez conectan su backend a la compartida, pongan `TAREAS_AUTOMATICAS=off` y `DATABASE_CONNECTION_LIMIT=1`** en su `.env` (las tareas automáticas corren solo en un backend).

### 14. Merge a `master`

1. PR `feature/ecommerce` → `master` con la descripción preparada (`pr-ecommerce-master.md`).
2. **Revisión de otro integrante** (Tomás o Ricardo) y merge.
3. Verificación:

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI
git fetch origin
git checkout master
git pull --ff-only origin master
git merge-base --is-ancestor origin/feature/ecommerce HEAD; if ($?) { "OK: master tiene la integración" } else { "FALTA el merge" }
```

No hay pasos de base después del merge: la compartida ya está lista.

### 15. Actualizar la base local de cada integrante

**Cada uno, después de traer `master` y ANTES de levantar el backend**, con su `backend\.env` apuntando a **su base local**:

```powershell
Set-Location C:\Users\<usuario>\Documents\hotelHI
git checkout master
git pull --ff-only origin master
Set-Location backend
npm ci
npx prisma generate
Set-Location ..\frontend
npm ci
Set-Location ..\backend
$env:DATABASE_URL = ((Get-Content .env | Select-String '^DATABASE_URL=').Line -replace '^DATABASE_URL="?([^"]*)"?$', '$1')
node scripts/actualizar-esquema-ecommerce.js            # plan: cuántas de las 4 tablas faltan
node scripts/actualizar-esquema-ecommerce.js --aplicar  # "Actualización terminada. Pendientes: 0"
node scripts/normalizar-documentos.js                   # plan: leerlo
node scripts/normalizar-documentos.js --aplicar         # aplicar
node scripts/normalizar-documentos.js                   # tiene que dar cero
Remove-Item Env:DATABASE_URL
```

- Con una base local no pide confirmación. Si alguna vez pidiera "Escribí el nombre de la base", `DATABASE_URL` apunta a otro lado: cancelar.
- Si el plan de tablas dice "forma distinta" para una tabla de garantía (Ricardo la creó con su SQL anterior), avisar a Gimena antes de seguir.
- En desarrollo, `PASARELA_TOKEN_SECRETO` y `AUTH_SECRET` son opcionales (usan valores de desarrollo con una advertencia).
- Contra la compartida: `TAREAS_AUTOMATICAS=off` y `DATABASE_CONNECTION_LIMIT=1`.
- Para recrear usuarios de prueba: `SEED_USUARIOS_PASSWORD` con 10 o más caracteres.

---

## Vuelta atrás

### Antes del merge a `master`

- **Tablas:** `master` ya necesita `garantias_reserva` y `garantias_estadia`: **no se borran**. Si hiciera falta, se pueden borrar `datos_reserva_web` y `pasarela_operaciones` (solo las usa `feature/ecommerce`), con el bloque de abajo.
- **Normalización:** no tiene vuelta atrás parcial. Si quedó mal, **restaurar el backup completo** (descarta todo lo escrito después del paso 4, incluida la prueba de humo).

```powershell
Set-Location C:\Users\Gimena\Documents\hotelHI

& {
  $envContent = Get-Content "backend\.env.compartida.bak" -Raw
  if ($envContent -notmatch 'DATABASE_URL="mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^"?]+)') { throw "No se pudo parsear DATABASE_URL" }
  $usuario = $Matches[1]; $password = [System.Uri]::UnescapeDataString($Matches[2])
  $servidor = $Matches[3]; $puerto = $Matches[4]; $basedatos = $Matches[5]
  $confirmacion = Read-Host "Vas a BORRAR datos_reserva_web y pasarela_operaciones de '$basedatos' en $servidor. Escribí el nombre de la base para confirmar"
  if ($confirmacion -ne $basedatos) { Write-Host "Cancelado."; return }
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
    & $mysql --defaults-extra-file=$cnf $basedatos -e "SELECT (SELECT COUNT(*) FROM datos_reserva_web) AS datos_web, (SELECT COUNT(*) FROM pasarela_operaciones) AS operaciones;"
    & $mysql --defaults-extra-file=$cnf $basedatos -e "DROP TABLE IF EXISTS datos_reserva_web; DROP TABLE IF EXISTS pasarela_operaciones;"
    Write-Host "Tablas borradas."
  } finally {
    Remove-Item $cnf -Force -ErrorAction SilentlyContinue
  }
}
```

### Después del merge a `master`

1. **Primero revertir el merge en `master`** (PR de revert, coordinado). Con el código nuevo en `master`, borrar tablas rompe Llegadas para todos.
2. Después, lo que corresponda de arriba.

### Restaurar el backup completo (daño mayor)

Mismo procedimiento que en `despliegue-estadia.md`: borrar las cuatro tablas nuevas (`DROP TABLE IF EXISTS datos_reserva_web, pasarela_operaciones, garantias_estadia, garantias_reserva;`) y restaurar con `source` el backup del paso 4. **Descarta todo lo escrito después del backup** (incluida la normalización y la prueba de humo). Avisar al grupo antes.

---

## Limitaciones conocidas al desplegar

- **Pasarela simulada:** no hay proveedor real. Las tarjetas de prueba son las únicas que funcionan.
- **Límite de intentos por IP y en memoria:** se reinicia con el backend. En la demo, no más de dos rechazos seguidos.
- **Fichas con nombres distintos para el mismo documento:** quedan en "Revisar a mano"; se corrigen desde la pantalla de huéspedes.
- **Cancelación online con cargo:** si la penalidad se reparte entre un pago previo y la tarjeta, o hay algo para devolver, se deriva a recepción (los reintegros son manuales).
- **Email:** si tarda más de 1,5 s se envía en segundo plano; un fallo queda en el log (sin reenvío desde el mostrador hasta después de la entrega).

---

## Ensayo (completar el día del despliegue)

| Paso | Tiempo | Resultado |
|---|---|---|
| Restaurar el backup en `hotelhi_ensayo_web` | | |
| Verificación previa | | |
| Plan / aplicar / segunda corrida de tablas | | |
| Verificación posterior | | |
| Normalización: plan (cantidades) | | |
| Normalización: "Revisar a mano" | | |
| Normalización: aplicar y segunda simulación | | |
| Borrar `hotelhi_ensayo_web` | | |

## Registro del despliegue (completar)

| Dato | Valor |
|---|---|
| Fecha y hora | |
| Commit de `feature/ecommerce` desplegado | |
| Backup | `backup-antes-ecommerce-…sql` (… bytes, … tablas) |
| Versión de MySQL de la compartida | |
| Duración de la migración de tablas | |
| Normalización (corregidas / fusionadas / unidas / a revisar) | |
| Duración del alta del mostrador (11.2) | |
| Duración del walk-in (11.2) | |
| Límites del servidor (paso 6) y valores elegidos de pool e inactividad | |
| Habitaciones inconsistentes corregidas | |
| Duración del alta web BAR (11.3) | |
| Duración del alta web NRF (11.4) | |
| Doble de capacidad 4 corregida | sí / no existía (habitación …) |
| Contraseñas reseteadas | sí (… usuarios) |
| PR a `master` | # … (revisó …) |

## Datos de prueba a limpiar (jueves 8/10)

| Qué | Documento (como queda guardado) | Código | Estado |
|---|---|---|---|
| Alta del mostrador | `PRUEBADESPLIEGUEMOST1` | _(anotar)_ | Cancelada |
| Walk-in con check-out | `PRUEBADESPLIEGUEWALK1` (titular) y `PRUEBADESPLIEGUEWALK2` | _(anotar)_ | Cerrada, con comprobante |
| Web, tarifa flexible | `PRUEBADESPLIEGUEWEB1` | _(anotar)_ | Cancelada |
| Web, no reembolsable | `PRUEBADESPLIEGUEWEB2` | _(anotar)_ | Cancelada (importe retenido) |

Orden de borrado: `datos_reserva_web` y `garantias_reserva` / `garantias_estadia` (FK `RESTRICT`), después pagos, noches, ocupantes, notificaciones y la reserva. Las filas de `pasarela_operaciones` no tienen FK: borrarlas por referencia.
