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

## Para la rama `fix/`

Alcance sugerido: puntos 1 (createMany en los 3 lugares que lo permiten) y 3 (timeout en `cancelarReserva`) del listado de arriba, más los tests existentes de `pruebas-reservas.js`/`pruebas-reserva-precio.js` corridos de nuevo para confirmar que no cambia ningún resultado (el `createMany` no debería alterar el contenido de las filas creadas, solo cómo se envían). El punto 2 (verificación posterior) y la decisión sobre `ajustarPrecioReserva` quedan a criterio del equipo — no son correcciones de una línea.
