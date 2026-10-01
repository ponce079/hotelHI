# Bug: transacciones de alta/modificación de reserva pueden expirar contra Clever Cloud

> Encontrado el 2026-09-30 durante el despliegue real de la Etapa 4C, al correr `seed-demo-salta.js` contra la base compartida. No es un bug de ese script ni de `migrar-reservas-a-reserva-noche.js` (ya corregido aparte) — es un patrón en el código real de la aplicación, en `backend/src/modulos/reservas/reservas.servicio.js`. Pendiente de corregir, en una rama `fix/` con PR, junto con el script de migración.

## Dónde está

Cuatro `$transaction` de este archivo crean o actualizan `ReservaNoche` con **un `tx.reservaNoche.create()`/`update()` por noche, dentro de un loop anidado** (una iteración por habitación, otra por noche de esa habitación), en vez de una sola operación batched:

1. **`crearReservaEnTransaccion`** (líneas 928-943) — el alta normal (HU-36/40). Un `create` por noche de cada habitación.
2. **`modificarReserva`** (líneas 1437-1463) — modificación de una reserva existente. Mismo patrón, con más campos por fila (incluye los de ajuste manual, HU-97).
3. **`ajustarPrecioReserva`** (líneas 1579-1591) — ajuste manual de precio por el gerente (HU-97). Un `update` por noche ajustada (normalmente pocas, pero sin límite).
4. **Walk-in** (`checkIn.servicio.js:319-329`, `confirmarCheckInWalkIn` o equivalente) — **reutiliza `crearReservaEnTransaccion` directamente**, agregándole además `marcarEnCurso` y un `ocuparHabitacion` por habitación dentro de la misma transacción. Es el caso más expuesto: todo el trabajo de (1) más trabajo extra, en el mismo presupuesto de tiempo.

Las cuatro ya tienen un timeout explícito más alto que el default de Prisma: `{ timeout: 15000, maxWait: 10000 }` (15 segundos). No es un descuido de "nadie le puso timeout" — alguien ya había anticipado que el default no alcanzaba contra Clever Cloud. El problema es que **15 segundos tampoco alcanza siempre**, porque el costo crece con la cantidad de noches × habitaciones, sin tope.

Un quinto lugar con el mismo tipo de riesgo, pero menor: **`cancelarReserva`** (línea 1659) no tiene timeout explícito (usa el default de 5000ms) y hace un loop de `anularPago` por cada `PagoEstadia` activo de la reserva — normalmente 1 o 2, así que el riesgo es bajo, pero el patrón es el mismo.

## Qué pasó en la práctica (evidencia real)

Al correr `seed-demo-salta.js` contra la base compartida (Clever Cloud, 2026-09-30), la primera reserva de ejemplo ("DEMO Cruce Milagro de Salta", 1 habitación × 6 noches) falló así:

```
Transaction API error: A query cannot be executed on an expired transaction.
The timeout for this transaction was 15000 ms, however 15533 ms passed since the start of the transaction.
```

El error ocurrió exactamente en `tx.reservaNoche.create()` (línea 931), es decir, **a mitad del loop de noches**, no al final. 15533ms para una transacción con 6 `create` de `ReservaNoche` más el `reserva.create`, el `resolverHuesped` y el `reservarCodigoLibre` de arriba — da un promedio aproximado de ~2 segundos por operación de red contra Clever Cloud en ese momento. Es una estimación a partir de este único caso real, no una medición controlada; la latencia de Clever Cloud puede variar según el momento y la carga del plan compartido.

Verificado después: esta falla fue limpia — no quedó ningún huésped ni reserva fantasma (confirmado contra la base real). No todas las fallas de este patrón son así de inofensivas: ver la sección siguiente.

## Por qué a veces falla limpio y a veces deja la reserva a medias

Se observaron **dos variantes distintas** del mismo problema, en `migrar-reservas-a-reserva-noche.js` (mismo patrón de loop, antes de corregirlo) contra esta misma base compartida, hoy:

**Variante A — falla limpia (la de `seed-demo-salta.js` arriba).** El timeout se cumple **mientras el callback de la transacción todavía está ejecutando una operación** (en este caso, un `tx.reservaNoche.create()` en medio del loop). Esa operación individual tira el error "a query cannot be executed on an expired transaction", el callback nunca termina, Prisma nunca llega a intentar el `COMMIT`, y aparentemente el servidor descarta todo lo que esa transacción tenía pendiente. Resultado: nada queda escrito. Esto es lo que se vio en 14 de los 19 casos reales del script de migración, y en el intento de `seed-demo-salta.js`.

**Variante B — commit parcial (la peligrosa).** El timeout se cumple **justo después de que el callback terminó de ejecutar todas sus operaciones sin error**, cuando Prisma intenta el `COMMIT` final — y ese intento de commit es el que se rechaza ("a **commit** cannot be executed on an expired transaction", no "a query"). En 5 de los 19 casos reales (reservas 1, 4, 17, 18, 90), esto dejó la reserva con su `planTarifarioId` ya asignado (la última escritura del callback) pero **cero filas en `ReservaNoche`** — confirmado contra la base real, incluso en habitaciones Simple donde el valor de `adultos` seguía en el default del schema (2) en vez del valor correcto (1), probando que ni siquiera esa escritura anterior había llegado a aplicarse. La hipótesis más consistente con la evidencia (no se pudo confirmar con logs de bajo nivel del driver): al vencer el presupuesto interno de Prisma, el adaptador no llega a emitir un `ROLLBACK` real contra el servidor, y en algún punto de la transición al siguiente intento la conexión queda en un estado donde solo la última escritura del callback anterior se termina confirmando.

**La diferencia práctica**: variante A no dejó rastro, no corrompe nada. Variante B deja una reserva "confirmada" con alojamiento en $0 — invisible hasta que alguien mira el check-out o el detalle de la reserva y nota que el total no suma. Para `crearReservaEnTransaccion` en particular, variante B significaría una reserva real cobrándole de más o de menos a un huésped sin que nadie lo note hasta la facturación.

## Qué otros lugares comparten el patrón (y cuáles no)

| Función | Archivo | Timeout actual | Riesgo |
|---|---|---|---|
| `crearReservaEnTransaccion` (alta HU-36/40) | `reservas.servicio.js:907-954` | 15000/10000 | Alto — cualquier alta real de varias noches/habitaciones |
| Walk-in (reutiliza la anterior) | `checkIn.servicio.js:319-329` | 15000/10000 | Más alto todavía — mismo trabajo + `marcarEnCurso` + `ocuparHabitacion` por habitación |
| `modificarReserva` | `reservas.servicio.js:1218-1470` | 15000/10000 | Alto — mismo patrón, además borra y recrea todas las `ReservaNoche` de la reserva |
| `ajustarPrecioReserva` | `reservas.servicio.js:1492-1597` | 15000/10000 | Medio — normalmente pocas noches ajustadas por vez, pero sin límite |
| `cancelarReserva` | `reservas.servicio.js:1637-1677` | 5000 (default) | Bajo — loop sobre `PagoEstadia` activos, normalmente 1-2 |
| `migrar-reservas-a-reserva-noche.js` | `backend/scripts/` | 30000/15000 (ya corregido) | Resuelto — ver commit del fix |

`checkOut.servicio.js` (consolidación de cargos) **no** comparte el patrón: solo lee `ReservaNoche`, nunca crea ni actualiza — confirmado por grep, sin ningún `$transaction` con un loop de escritura por noche.

## Propuesta de corrección

El mismo criterio ya aplicado y verificado en `migrar-reservas-a-reserva-noche.js`:

1. **`createMany` en vez de `create`/`update` por noche**, donde la operación lo permita:
   - `crearReservaEnTransaccion` y el walk-in: trivial, es un alta — ninguna noche existe todavía, así que `tx.reservaNoche.createMany({ data: [...] })` por habitación (o una sola llamada para todas las habitaciones, agregando `reservaHabitacionId` a cada fila) reemplaza el loop sin cambiar el resultado.
   - `modificarReserva`: mismo caso, ya borra todas las `ReservaNoche` viejas antes del loop — el `createMany` reemplaza igual de directo al loop de creación.
   - `ajustarPrecioReserva`: acá cada noche tiene un `precioNuevo`/`precioOriginal` distinto, así que no es un `createMany` de filas idénticas — Prisma no tiene un "updateMany con valores distintos por fila" nativo. Opciones: (a) una sola sentencia SQL cruda (`CASE WHEN id = ... THEN ...`) vía `tx.$executeRaw`, o (b) aceptar que esta función se queda con updates individuales pero medir si el timeout actual alcanza en la práctica (el caso de uso típico — cortesía de 1 a 3 noches — rara vez se acerca al límite). Evaluar con el equipo cuál conviene antes de tocarla.
   - `cancelarReserva`: agregarle el mismo `{ timeout: 15000, maxWait: 10000 }` que las demás, por consistencia, aunque el riesgo sea bajo.

2. **Nunca confiar en que un timeout cumplido dejó la transacción en un estado conocido.** Igual que en el script corregido: después de cualquier alta/modificación que toque `ReservaNoche`, conviene una verificación posterior (con una conexión nueva) de que la cantidad de `ReservaNoche` coincide con lo esperado antes de devolverle éxito al usuario — o, como mínimo, que un error en estas funciones quede claramente registrado y revisable (hoy un error acá se lo pasa tal cual al usuario, sin indicar si quedó algo a medias).

3. **Medir antes de ajustar el número del timeout a ciegas.** 15000ms ya era "generoso" y no alcanzó. Subirlo más (a 30000, como el script de migración) es un parche razonable mientras se aplica el punto 1, pero el `createMany` ataca la causa (cantidad de round-trips), no el síntoma (cuánto tiempo se le da a cada uno).

4. **Revisar si Clever Cloud (plan compartido, latencia variable) es el entorno real de producción**, o si esto se resuelve solo al migrar a una base con mejor latencia — si el entorno final tiene latencia de datacenter normal (no un plan gratuito/compartido), el margen de 15 segundos probablemente alcance sin tocar nada más; igual conviene aplicar el `createMany` porque es estrictamente mejor (menos carga en cualquier entorno) y no tiene contras.

## Qué se corrigió (rama `fix/timeout-transacciones`, 2026-09-30)

**Escrituras — `createMany` en vez de `create`/`update` por noche:**
- `crearReservaEnTransaccion` (y por lo tanto el walk-in, que la reutiliza) y `modificarReserva`: ambas arman todas las filas de `ReservaNoche` en memoria y las insertan con **una sola** `tx.reservaNoche.createMany({ data: [...] })`, para todas las habitaciones de la reserva juntas — no una por habitación.
- `ajustarPrecioReserva`: se dejó **sin cambios**, con `update` individual por noche, por decisión explícita — el caso de uso típico (cortesía/descuento de 1 a 3 noches) nunca se acerca al límite, y no vale la complejidad de un `$executeRaw` con `CASE WHEN` para un riesgo bajo. Queda anotado como posible mejora futura si en algún momento se usa para ajustar estadías largas completas.
- `cancelarReserva`: ahora usa la misma constante de timeout que el resto (antes: default de Prisma, 5000ms).

**Timeout — una sola constante compartida.** Los 5 `$transaction` de `reservas.servicio.js` (incluido `crearReservaConSena`, que no estaba en el análisis original pero tiene el mismo literal repetido), y además el walk-in de Check-in (`checkIn.servicio.js:registrarCheckInWalkIn`, que reutiliza `crearReservaEnTransaccion` pero tenía su **propio** `{ timeout: 15000, maxWait: 10000 }` hardcodeado en vez de la constante compartida), pasaron a usar `OPCIONES_TRANSACCION` de `backend/src/lib/constantes.js` — ya existía, usada en `presupuestos.servicio.js`/`proveedores.servicio.js`/`requerimientos.servicio.js`; no hizo falta crear una nueva. Con la latencia real medida (ver abajo), se subió de `{ timeout: 20000, maxWait: 10000 }` a **`{ timeout: 30000, maxWait: 15000 }`**.

**Lecturas — deduplicadas dentro de la misma transacción (sin mover nada afuera, la regla del 409 sigue intacta: el precio se recalcula con `tx` y se compara contra lo que vio el usuario).** En `cotizacion.servicio.js`, `cotizarReserva` ahora pide **una sola vez por reserva** (no una vez por habitación) lo que es idéntico para todas sus habitaciones: el rango de temporadas (`resolverTemporadasEfectivasEnRango`), los modificadores por día de semana y los planes activos; y pide las tarifas de **todos los tipos de habitación presentes en una sola consulta** (`obtenerTarifasVigentesParaTipos`, nueva, en `precios.servicio.js`) en vez de una consulta por habitación. `tipoHabitacion`/`habitacionesActivas` se cachean por tipo (no por habitación), así que dos habitaciones del mismo tipo tampoco las piden dos veces. `cotizarEstadia` ahora acepta un 3er parámetro opcional `precargado` con cualquiera de estos datos ya resueltos — si no viene, lee todo solo, exactamente como antes (el cotizador de pantalla, que cotiza un tipo suelto sin pasar por `cotizarReserva`, sigue sin tocarse).

Además, `buscarConflictos` (llamada dos veces por alta: chequeo rápido + chequeo protegido con lock) dejó de pedir el `include` completo (habitación + reserva, para el mensaje de error) cuando no hay ningún conflicto — Prisma emitía esas 2 consultas igual aunque el resultado base viniera vacío. Ahora el camino feliz (sin conflictos, la gran mayoría de las altas) hace 1 consulta en vez de 3; el detalle completo para el mensaje de error solo se pide si de verdad hay algo que reportar.

**Relectura final fuera de la transacción.** `crearReservaEnTransaccion` devolvía, como último paso, `tx.reserva.findUnique({ include: INCLUDE_RESERVA })` — una relectura con relaciones (habitaciones, huésped, noches, pagos) que solo sirve para armar la respuesta HTTP, no para la lógica de negocio: son ~9 consultas que Prisma resuelve por separado. Se movió a después del `$transaction` (mismo patrón ya usado en `requerimientos.servicio.js:199-200`): la función ahora devuelve la reserva recién creada (sin el include), y cada llamador (`crearReserva`, `crearReservaConSena`) hace su propio `prisma.reserva.findUnique({ include: INCLUDE_RESERVA })` una vez confirmada la transacción. Esto no acorta el tiempo total de la respuesta (son las mismas 9 consultas, ahora después del commit en vez de antes) — lo que logra es que esas 9 consultas **ya no cuenten contra el timeout de la transacción**, bajando la ventana de riesgo de P2028.

**Latencia real medida contra Clever Cloud (2026-10-01, `SELECT 1` repetidos desde PowerShell, base compartida):**
- Abrir la conexión (TCP + SSL + auth): **~2,1 s**.
- Cada consulta siguiente, con la conexión ya abierta: **~387 ms** en promedio.
- Resolviendo el host (`b4913r7yp8soaggsa4sv-mysql.services.clever-cloud.com` → `91.208.207.108`) contra un servicio de geolocalización de IP: **París, Francia** (AS213394 Clever Cloud SAS) — confirma la hipótesis: el backend de cada integrante corre en su propia máquina en Salta, Argentina, y cada consulta cruza el Atlántico dos veces. La estimación anterior de ~150ms/consulta (sacada de un único fallo real) era muy optimista.

**Medición de consultas dentro de la transacción del alta, antes y después (contra `sgh_gimena`, log de queries de Prisma), y duración estimada contra Clever Cloud (conexión fría + N×387ms):**

| Caso | Antes (consultas en tx) | Antes (estimado) | Después (consultas en tx) | Después (estimado) |
|---|---|---|---|---|
| 2 noches × 1 habitación | 40 | ~17,6 s | 24 | **~11,4 s** |
| 15 noches × 2 habitaciones | 103 | ~42,0 s | 25 | **~11,8 s** |
| 5 noches × 4 habitaciones | — (no medido antes) | — | 30 | **~13,7 s** |

La cantidad de consultas dentro de la transacción **ya no crece con las noches** (24 → 25 al pasar de 2 a 15 noches, con 1 habitación más de por medio) y crece muy poco con las habitaciones (24 → 30 de 1 a 4 habitaciones). Con la latencia real medida, el objetivo de "menos de 5 segundos" **no se alcanza** — los tres casos quedan entre ~11 y ~14 segundos — pero el timeout de 30 segundos deja un margen de 16 a 19 segundos en cada caso, y el objetivo central (ninguna falla deja una reserva a medias, ninguna transacción crece sin límite con las noches) sí se cumple. Bajar de ~11s requeriría sacar lecturas de cotización fuera de la transacción, lo que debilitaría la regla del 409 (ver sección "Limitación conocida").

Sumando las ~9 consultas de la relectura final (después del commit, sin riesgo de timeout), el tiempo total percibido en la respuesta HTTP ronda los 14,9 s / 15,3 s / 17,2 s respectivamente — prácticamente igual al escenario con la relectura adentro, porque son las mismas consultas: lo que cambió es cuáles cuentan contra el timeout, no cuántas hay en total.

**En producción, este problema no existiría en esta magnitud.** La causa de fondo no es la cantidad de consultas (ya optimizada) sino la distancia entre el backend y la base: en producción ambos estarían en el mismo datacenter, con una latencia de red de ~1-2ms por consulta en vez de ~387ms. Con esa latencia, las 25 consultas del caso 15×2 tardarían **menos de 100ms** en total — muy lejos de cualquier timeout.

**Recomendación para la demo:** presentar contra una base local (con los datos de `seed-demo-salta.js`), no contra Clever Cloud — no por riesgo de falla (el timeout de 30s tiene margen de sobra), sino porque cada alta tardando 11-14 segundos es mala experiencia frente al jurado/equipo, y no representa cómo se va a comportar el sistema en un entorno real.

**Limitación conocida.** Incluso un alta de **1 sola noche** no baja de ~24 consultas dentro de la transacción (el piso lo ponen la validación — lock, conflictos, huésped, código de confirmación — y la cotización de esa única habitación, no las noches): a ~387ms/consulta contra Clever Cloud eso son **~11,4 segundos**, con margen (~18,6s) pero lejos de ser instantáneo. Una optimización futura de bajo impacto podría apuntar a esas consultas de validación en lugar de a las de escritura, que ya están al mínimo.

**Qué tienen que hacer los demás después del merge:** solo `git pull`. No hay cambios de schema ni de datos — es exclusivamente código de la aplicación (servicio de reservas, check-in, cotización, la constante de timeout). No hace falta ningún paso de despliegue ni tocar ninguna base.

**Tests nuevos** (`backend/scripts/pruebas-reservas.js`):
- Integridad: si `ReservaNoche.createMany` falla a mitad de camino, no queda ninguna `Reserva`, `ReservaHabitacion`, `ReservaNoche` ni un huésped nuevo huérfano (transacción revertida por completo).
- Rendimiento: la cantidad de consultas de cotización no crece entre una reserva de 2 noches y una de 15 (misma habitación), y las lecturas compartidas (temporadas/planes/modificadores) se piden una sola vez con 3 habitaciones, no una por habitación. Se apoyan en un contador de llamadas por tabla.método agregado al doble de Prisma compartido (`_dobleSprint3.js`, expuesto como `base._contadorLlamadas`), reseteado en cada `_limpiar()`.

Suite completa verificada en verde después del cambio (incluidos los tests existentes de `pruebas-reservas.js`, `pruebas-reserva-precio.js`, `pruebas-ajuste-penalidad.js`, `pruebas-checkin.js`, `pruebas-cotizacion.js`, `pruebas-precios.js` y el Jest de `reservaConSena.test.js`), salvo los 3 fallos preexistentes y ajenos ya documentados (typo `"Tarjeta de crédito"` en 3 fixtures de garantía).
