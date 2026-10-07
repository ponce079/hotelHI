# Robustez contra la base remota (latencia ~400 ms por consulta)

La base compartida está en otro país: cada consulta de Prisma cuesta ~2,3 viajes de red. Con ~387 ms de ida y vuelta,
**una consulta ≈ 0,9 s**; una transacción con 40 consultas tarda ~35 s y vence (P2028). Esta página resume cómo se
resolvió y qué variables de entorno hay que conocer. Las mediciones se hicieron en una base **local** con un proxy que
agrega demora (nunca contra la compartida).

## Variables de entorno (backend/.env)

| Variable | Obligatoria | Qué hace |
|---|---|---|
| `DATABASE_CONNECTION_LIMIT` | no (por defecto 2) | Conexiones del pool. La base compartida limita `max_user_connections` por usuario y lo comparten todos los integrantes: el verificador (`scripts/verificar-previo-ecommerce.js`) lo lee y recomienda un valor. |
| `DATABASE_IDLE_TIMEOUT_MS` | no (por defecto 30000) | Cierra las conexiones ociosas **antes** que `wait_timeout` del servidor. Sin esto, una conexión cortada por el servidor hace fallar el primer pedido después de un rato de calma. |
| `TAREAS_AUTOMATICAS` | no (activas por defecto) | `off` apaga las tareas de fondo (alertas de stock mínimo). Quien desarrolla contra la base compartida debería arrancar con `off` para no competir por las conexiones; las corridas no se superponen y no dejan promesas sin atrapar. |
| `AUTH_SECRET` | **sí en producción** (≥ 32 caracteres) | Firma las sesiones. En desarrollo, si falta, se deriva de `DATABASE_URL` y se avisa **una sola vez** por consola. En producción el backend no arranca sin él. Generalo con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. Cambiarlo cierra todas las sesiones. |

Agregar `AUTH_SECRET` al despliegue es parte del runbook (`docs/despliegue-estadia.md`, paso de variables de entorno).

## Qué se hizo con las transacciones

- **Adentro solo lo que tiene que ser atómico**: `updateMany` condicionales (estado de la reserva y de las habitaciones),
  `createMany` y una relectura. Las lecturas y validaciones salieron antes. La **preautorización de la tarjeta sigue fuera**
  de la transacción (la pasarela nunca se llama adentro de una).
- **Conflictos de fechas** (walk-in y cambios de habitación): `SELECT … FOR UPDATE` + `buscarConflictos` **dentro** de la
  transacción.
- **"Persona ya alojada en otra estadía"**: la garantiza la base con el índice único `identidadActiva`; un `P2002` se
  traduce a 409.
- **Fichas creadas en paralelo**: ante `P2002` se relee la ficha y no se pisa.
- **Cantidad de consultas constante**: la transacción no crece con la cantidad de personas ni de habitaciones (ver
  mediciones).
- **Reintentos idempotentes**: un check-in que ya está En curso con las mismas habitaciones y personas devuelve 200 con lo
  existente; un walk-in con el mismo titular, habitación y fechas en menos de 5 minutos devuelve la misma reserva (sin
  "habitación ocupada"). Una habitación realmente ocupada por otra estadía sigue siendo 409.
- **`OPCIONES_TRANSACCION_LARGA`** (45 s / 15 s): red de seguridad **solo** para check-in, walk-in y check-out. El tiempo
  general (`OPCIONES_TRANSACCION`) no se tocó.

## Frontend

- Timeout por defecto 45 s; 60 s para check-in, walk-in, check-out y alta del mostrador. Si vence, el mensaje es
  "El sistema está tardando más de lo normal. Revisá en Llegadas o en la reserva si la operación quedó registrada antes
  de reintentar." **Nunca se reintenta una escritura sola.**
- `QueryClient`: sin refetch al volver a la ventana, 1 reintento solo en lecturas, `staleTime` 30 s, mutaciones sin reintento.
- Los botones de confirmar se bloquean en el mismo instante del clic (guarda síncrona) y dicen "Procesando…".

## Verificador previo

`node scripts/verificar-previo-ecommerce.js` ahora lee `max_user_connections`, `max_connections`, `wait_timeout`,
`interactive_timeout` e `innodb_lock_wait_timeout` y recomienda valores; además **avisa sin frenar** si hay habitaciones
`ocupada` sin reserva En curso (o reservas En curso sin habitación ocupada), mostrando solo cantidades y números de
habitación.
