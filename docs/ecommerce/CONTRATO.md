# Contrato de la API del e-commerce (`/api/web`)

> **Contrato v6 (integración de Datos, Pago y Confirmación de Tomás; email definitivo y límite de intentos). Cambios al contrato: solo Gimena.**
>
> Estado de las pantallas: **Datos, Pago y Confirmación reales** (integradas el 2026-10-06 en `feature/ecommerce`), junto con Inicio, Resultados, Detalle y Mi reserva. El proceso de compra completo funciona contra la API real.

### Estado de cada endpoint

| Endpoint | Estado |
|---|---|
| `GET /api/web/tipos` | **Real** (etapa 1B-1) |
| `GET /api/web/planes` | **Real** (etapa 2) |
| `GET /api/web/disponibilidad` | **Real** (etapa 1B-1) |
| `POST /api/web/cotizar` | **Real** (etapa 1B-1) |
| `POST /api/web/reservas` | **Real** (etapa 1B-2), con la pasarela simulada del backend |
| `POST /api/web/mi-reserva` y `/mi-reserva/cancelar` | **Real** (etapa 4) |
| `GET /api/reservas-web/:reservaId` | **Real** (etapa 2) — **interno del mostrador**, con sesión; no es parte de `/api/web` |

El mock (`ecommerce.mock.js`) **solo funciona en desarrollo** (`npm run dev`
con `VITE_ECOMMERCE_MOCK=true`). Un build de producción nunca lo usa: ni
siquiera entra al bundle.

Este documento es la fuente de verdad entre el frontend del motor de reservas
web (`frontend/src/modulos/ecommerce/`) y el backend que se construye en la
etapa 1B. Los endpoints que todavía no son reales los responde un mock
(`ecommerce.mock.js`) con **exactamente** estas formas.

Historias: HU-99, HU-100, HU-101, HU-102, HU-103, HU-104 y HU-106 (HU-105,
modificación web, está postergada).

Referencia visual: `docs/ecommerce/mockups-web.pdf` (páginas 1 a 9 y 15). Las
decisiones de diseño de la etapa 1A mandan sobre el mockup: se vende por
**tipo** de habitación (nunca número, piso ni "N libres"), precio final con IVA
incluido, solo tarjeta de crédito, sin cuentas de huésped.

---

## Convenciones generales

- Base: `/api/web`. Todas las rutas son públicas (sin sesión de staff).
- Fechas "solo día" en formato `YYYY-MM-DD` (hora de Argentina). `fechaHasta`
  es el día de salida (no se cuenta como noche).
- Montos en pesos argentinos, **precio final con IVA incluido**, como número
  JSON con hasta 2 decimales (`50000`, `42500.5`). No existe una línea
  "Impuestos y tasas".
- Ocupación por habitación: `adultos` (>= 1) y `menores` (>= 0).
- `habitaciones` es siempre una **lista** de 1 a 3 líneas
  (`MAX_HABITACIONES_WEB = 3`). La UI de esta entrega maneja una sola
  habitación; el contrato ya acepta hasta 3 para ampliarlo sin romper nada.
- Ninguna respuesta incluye número, piso ni id de habitación, ni la cantidad
  de habitaciones libres, ni datos de otros huéspedes, ni códigos de otras
  reservas (las claves `habitacionId`, `numero`, `huesped`, `detalle` y
  `codigoConfirmacion` no aparecen en tipos, disponibilidad ni cotización;
  hay un test recursivo que lo verifica).
- Canal `WEB` en todo `/api/web`: solo planes con `visibleWeb`, precio
  final con IVA incluido.
- Parámetros inválidos → `400 DATOS_INVALIDOS` con `campo`: fechas
  `AAAA-MM-DD` válidas; la entrada no puede ser anterior a **hoy en hora
  argentina** (entrar hoy está permitido); la salida tiene que ser posterior a
  la entrada; como máximo 30 noches; `adultos` entero >= 1; `menores` entero
  >= 0.

### Plan (forma común)

Cada vez que aparece un plan, tiene estos campos:

```json
{
  "planTarifarioId": 1,
  "codigo": "BAR",
  "nombre": "Best Available Rate",
  "reembolsable": true,
  "horasCancelacionSinCargo": 48,
  "penalidadNoShow": "PRIMERA_NOCHE",
  "total": 50000,
  "promedioPorNoche": 25000
}
```

- `horasCancelacionSinCargo` es `null` cuando `reembolsable` es `false`.
- `penalidadNoShow`: `PRIMERA_NOCHE` | `TOTAL_ESTADIA` (mismos valores que
  `PlanTarifario.penalidadNoShow`).
- `nombre` es el nombre interno del plan en la base (lo ve el mostrador). Al
  huésped se le muestra el **nombre comercial** que arma el frontend
  (`formato.js → nombreComercialPlan`): **"Tarifa flexible"** si
  `reembolsable`, **"No reembolsable"** si no. La base no cambia.
- El texto de condiciones **lo arma el frontend** (`formato.js →
  textoCondicionesPlan`), no viene del backend:
  - reembolsable: "Tarifa flexible · Cancelación sin cargo hasta X h antes de la llegada";
  - no reembolsable: "No reembolsable · Se cobra el total al reservar · Sin devolución".

---

## GET `/api/web/tipos`

Catálogo de tipos vendibles en la web (activos, con al menos una habitación).
No trae precios: el precio aparece recién después de buscar fechas.

**Response 200**

Respuesta real de la base local (6 de octubre de 2026):

```json
{
  "tipos": [
    { "tipoHabitacionId": 1, "nombre": "Doble", "capacidadMaxima": 3 },
    { "tipoHabitacionId": 2, "nombre": "Simple", "capacidadMaxima": 2 }
  ]
}
```

- Tipos **activos** con al menos una habitación **activa**, ordenados por nombre.
- `capacidadMaxima`: `TipoHabitacion` no tiene ese campo; se calcula como el
  máximo de `Habitacion.capacidad` entre las habitaciones activas del tipo.
- Los ids son los de la base: el frontend nunca los asume fijos.

---

## GET `/api/web/planes`

Planes **activos y visibles en la web**, con sus condiciones de cancelación y
no-show. Lo usa el detalle del tipo para las políticas, sin necesidad de
fechas. Respuesta real de la base local:

```json
{
  "planes": [
    { "planTarifarioId": 1, "codigo": "BAR", "nombre": "Best Available Rate", "reembolsable": true, "horasCancelacionSinCargo": 48, "penalidadNoShow": "PRIMERA_NOCHE" },
    { "planTarifarioId": 2, "codigo": "NRF", "nombre": "No Reembolsable", "reembolsable": false, "horasCancelacionSinCargo": null, "penalidadNoShow": "TOTAL_ESTADIA" }
  ]
}
```

- Exactamente esos seis campos (sin precios: el precio depende de las fechas).
- `horasCancelacionSinCargo` es `null` cuando el plan no es reembolsable.
- El test recursivo de claves prohibidas también cubre esta respuesta.

---

## GET `/api/web/disponibilidad?fechaDesde&fechaHasta&adultos&menores`

Ejemplo: `GET /api/web/disponibilidad?fechaDesde=2026-10-16&fechaHasta=2026-10-18&adultos=2&menores=0`

`adultos` y `menores` son la ocupación **de una habitación**. (Cuando la UI
maneje varias habitaciones —etapa 2— se consulta una vez por línea o se
extiende este endpoint; el cambio lo define Gimena.)

**Response 200** — respuesta real de la base local,
`?fechaDesde=2026-10-12&fechaHasta=2026-10-14&adultos=2&menores=0`:

```json
{
  "fechaDesde": "2026-10-12",
  "fechaHasta": "2026-10-14",
  "noches": 2,
  "tipos": [
    {
      "tipoHabitacionId": 1,
      "nombre": "Doble",
      "capacidadMaxima": 3,
      "ultimasDisponibles": false,
      "desdePorNoche": 37400,
      "planes": [
        {
          "planTarifarioId": 1, "codigo": "BAR", "nombre": "Best Available Rate",
          "reembolsable": true, "horasCancelacionSinCargo": 48,
          "penalidadNoShow": "PRIMERA_NOCHE", "total": 88000, "promedioPorNoche": 44000
        },
        {
          "planTarifarioId": 2, "codigo": "NRF", "nombre": "No Reembolsable",
          "reembolsable": false, "horasCancelacionSinCargo": null,
          "penalidadNoShow": "TOTAL_ESTADIA", "total": 74800, "promedioPorNoche": 37400
        }
      ],
      "motivoNoDisponible": null
    },
    {
      "tipoHabitacionId": 2,
      "nombre": "Simple",
      "capacidadMaxima": 2,
      "ultimasDisponibles": false,
      "desdePorNoche": 28050,
      "planes": [
        { "planTarifarioId": 1, "codigo": "BAR", "nombre": "Best Available Rate", "reembolsable": true, "horasCancelacionSinCargo": 48, "penalidadNoShow": "PRIMERA_NOCHE", "total": 66000, "promedioPorNoche": 33000 },
        { "planTarifarioId": 2, "codigo": "NRF", "nombre": "No Reembolsable", "reembolsable": false, "horasCancelacionSinCargo": null, "penalidadNoShow": "TOTAL_ESTADIA", "total": 56100, "promedioPorNoche": 28050 }
      ],
      "motivoNoDisponible": null
    }
  ]
}
```

Mismas fechas con `adultos=4` (respuesta real, recortada): la capacidad máxima
de la Doble es 3 y la de la Simple es 2, así que ninguna admite 4 personas.

```json
{
  "tipos": [
    { "tipoHabitacionId": 1, "nombre": "Doble", "capacidadMaxima": 3, "ultimasDisponibles": false,
      "desdePorNoche": null, "planes": [], "motivoNoDisponible": "Admite hasta 3 personas" },
    { "tipoHabitacionId": 2, "nombre": "Simple", "capacidadMaxima": 2, "ultimasDisponibles": false,
      "desdePorNoche": null, "planes": [], "motivoNoDisponible": "Admite hasta 2 personas" }
  ]
}
```

Reglas:

- **Todos los tipos vendibles aparecen siempre** (los mismos de `GET /tipos`).
  Un tipo que no se puede reservar aparece con `planes: []`,
  `desdePorNoche: null`, `ultimasDisponibles: false` y un
  `motivoNoDisponible` para el huésped. La tarjeta del tipo se muestra
  deshabilitada con ese texto.
- `motivoNoDisponible`, **en este orden** (personas = adultos + menores):
  1. personas > `capacidadMaxima` → `"Admite hasta N personas"`;
  2. ninguna habitación libre del tipo con capacidad >= personas →
     `"Sin disponibilidad para estas fechas"`;
  3. sin planes vendibles para esas fechas → el motivo del motor de tarifas
     (estadía mínima, cierre a llegadas) si es un **mensaje seguro** (ver
     "Mensajes del motor" en Errores); si no, `"Sin tarifas disponibles para
     estas fechas"`;
  4. `null` si se puede reservar.
- `ultimasDisponibles` es **booleano**: `true` si quedan 1 o 2 habitaciones
  libres del tipo **con capacidad suficiente** para la ocupación buscada.
  Nunca se informa la cantidad.
- `desdePorNoche`: el menor `promedioPorNoche` entre los planes del tipo.
- Los totales son los del sistema: iguales a `POST /api/reservas/cotizar` con
  canal `WEB` para el mismo tipo y ocupación.

---

## POST `/api/web/cotizar`

Recotiza una selección concreta (por ejemplo, antes de pagar).

**Request**

```json
{
  "fechaDesde": "2026-10-12",
  "fechaHasta": "2026-10-14",
  "planTarifarioId": 2,
  "habitaciones": [
    { "tipoHabitacionId": 1, "adultos": 2, "menores": 0 },
    { "tipoHabitacionId": 1, "adultos": 3, "menores": 0 }
  ]
}
```

**Response 200** — respuesta real de la base local:

```json
{
  "total": 157100,
  "promedioPorNoche": 78550,
  "noches": 2,
  "plan": {
    "planTarifarioId": 2, "codigo": "NRF", "nombre": "No Reembolsable",
    "reembolsable": false, "horasCancelacionSinCargo": null,
    "penalidadNoShow": "TOTAL_ESTADIA", "total": 157100, "promedioPorNoche": 78550
  },
  "habitaciones": [
    { "tipo": "Doble", "adultos": 2, "menores": 0, "subtotal": 74800 },
    { "tipo": "Doble", "adultos": 3, "menores": 0, "subtotal": 82300 }
  ]
}
```

- 1 a 3 líneas. `planTarifarioId` tiene que ser un plan activo y visible en la
  web (si no → `400 DATOS_INVALIDOS`, `campo: "planTarifarioId"`); cada
  `tipoHabitacionId`, un tipo vendible (`campo: "habitaciones[i].tipoHabitacionId"`).
- Por cada línea se elige una **habitación representante** libre (ver "Cómo
  funciona por dentro → Habitación representante") y se cotiza con el mismo
  cálculo que hará el alta (`cotizarParaReserva`, canal `WEB`): el `total`
  es el `totalEsperado` que después manda `POST /reservas`.
- Si alguna línea no tiene habitación libre que alcance (por ejemplo, dos
  líneas del mismo tipo y queda una sola) → `409 SIN_DISPONIBILIDAD`.
- La pantalla de resultados llama a este endpoint al tocar **Elegir**; el
  total que se ve en Datos y Pago es el de esta respuesta.

---

## POST `/api/web/reservas`

Crea la reserva (y garantiza o cobra con la tarjeta, según el plan).

**Request**

```json
{
  "claveIdempotencia": "6f1c2a9e-3b7d-4c55-9a51-2f0e8d7c1b44",
  "fechaDesde": "2026-10-16",
  "fechaHasta": "2026-10-18",
  "planTarifarioId": 1,
  "totalEsperado": 50000,
  "habitaciones": [{ "tipoHabitacionId": 2, "adultos": 2, "menores": 0 }],
  "huesped": {
    "nombres": "María José",
    "apellido": "González",
    "tipoDocumento": "DNI",
    "paisDocumento": "AR",
    "numeroDocumento": "30111222",
    "fechaNacimiento": "1990-05-20",
    "email": "maria@correo.com",
    "telefono": "+54 9 387 555-1234",
    "nacionalidad": "AR",
    "paisResidencia": "AR"
  },
  "llegada": { "horaEstimada": "18-20" },
  "solicitudesEspeciales": "Cuna para bebé, si es posible.",
  "consentimiento": {
    "aceptaPoliticas": true,
    "versionPoliticas": "2026-10-01",
    "aceptaComunicaciones": false
  },
  "tarjeta": {
    "titular": "MARIA GONZALEZ",
    "numero": "4242424242424242",
    "vencimientoMes": 12,
    "vencimientoAnio": 2028,
    "cvv": "123"
  }
}
```

Validaciones (el backend las hace **todas antes** de tocar la base o la
pasarela; el frontend las anticipa). Cualquier falla → `400 DATOS_INVALIDOS`
con `campo`, salvo el vencimiento de la tarjeta:

- `claveIdempotencia`: 8 a 64 caracteres `[A-Za-z0-9-]` (el frontend usa un UUID).
- Fechas, noches, `adultos` y `menores`: las mismas reglas que `/cotizar`
  (entrada >= hoy en hora argentina, máximo 30 noches). `habitaciones`: 1 a 3 líneas.
- `planTarifarioId`: activo y visible en la web. `totalEsperado`: número > 0;
  es el total que el huésped vio (si el precio real difiere → `409
  PRECIO_CAMBIADO` con `totalNuevo`).
- `huesped`: ver **Huésped (titular)**. Nombres y apellido (hasta 80
  caracteres cada uno), tipo y país del documento de los catálogos, número,
  fecha de nacimiento (mayor de 18 a la fecha de ingreso), `email` válido,
  `telefono` de 7 a 40 caracteres (dígitos, espacios, `+`, `-`, paréntesis).
  `nacionalidad` y `paisResidencia` son **opcionales**, pero si vienen tienen
  que ser ISO-2 válidos.
- `llegada.horaEstimada`: `NO_SABE` | `14-16` | `16-18` | `18-20` | `20-22` | `DESPUES_22` (o ausente).
- `solicitudesEspeciales`: opcional, máx. 500 caracteres.
- `consentimiento.aceptaPoliticas` tiene que ser `true` y `versionPoliticas`
  la vigente (`"2026-10-01"`). `aceptaComunicaciones`: booleano (default `false`).
- `tarjeta`: `titular` no vacío; `numero` solo dígitos (13 a 19) y válido por
  Luhn; `vencimientoMes` 1–12; `vencimientoAnio` de 4 dígitos; `cvv` de 3 o 4 dígitos.
- **Vencimiento**: la tarjeta vale hasta el último día de su mes.
  - Ya vencida hoy → `402 PAGO_RECHAZADO` con `motivo: "Tarjeta vencida"`.
  - Vence antes de la fecha de **salida** → `422 TARJETA_VENCE_ANTES`.
  - Vence el mismo mes de la salida → aceptada.

Orden del backend: validación → idempotencia → habitaciones libres y
precio (`409 SIN_DISPONIBILIDAD` / `409 PRECIO_CAMBIADO`, **sin** tocar la
pasarela) → pasarela (`402 PAGO_RECHAZADO` con `motivo`) → una transacción
→ captura (solo no reembolsable) → email.

**Response 201** (o **200** si la clave ya existía con los mismos datos) —
respuesta real de la base local (tarifa no reembolsable):

```json
{
  "codigoConfirmacion": "F2AAF1C6",
  "estado": "Confirmada",
  "fechaDesde": "2026-10-23",
  "fechaHasta": "2026-10-25",
  "noches": 2,
  "plan": { "codigo": "NRF", "nombre": "No Reembolsable", "reembolsable": false, "horasCancelacionSinCargo": null },
  "total": 74800,
  "cobradoAhora": 74800,
  "garantia": { "tipo": "PREPAGO", "marca": "VISA", "ultimos4": "4242" },
  "habitaciones": [{ "tipo": "Doble", "adultos": 2, "menores": 0 }],
  "email": { "enviado": true }
}
```

- Plan reembolsable: `cobradoAhora = 0`, `garantia.tipo = "GARANTIA"`. La
  pantalla muestra "Confirmada · garantizada con tarjeta".
- Plan no reembolsable: `cobradoAhora = total`, `garantia.tipo = "PREPAGO"`. La
  pantalla muestra "Pagada".
- `email.enviado`:
  - `true` → se envió la confirmación al email del titular;
  - `false` → no se pudo enviar (la reserva **sí** quedó creada);
  - `null` → **desconocido**: solo en la repetición idempotente (200), que no
    vuelve a mandar el email.
- En la repetición idempotente (200), `garantia` sale de lo guardado
  (`DatosReservaWeb`): nunca es `null`.
- Sin ids ni números de habitación. El código es el **código de confirmación
  del sistema** (el mismo que ve el mostrador): 8 caracteres hexadecimales en
  mayúsculas.

### Idempotencia

La clave de idempotencia evita que un doble clic, un F5 o un reintento creen
**dos reservas y dos cobros**.

1. **La clave se consume solo cuando la reserva se crea.** Un pedido que
   termina en error no "gasta" la clave en el servidor.
2. **"Mismos datos" se compara sin la tarjeta.** Se comparan `fechaDesde`,
   `fechaHasta`, `planTarifarioId`, las líneas como multiconjunto de
   `{ tipoHabitacionId, adultos, menores }` (el orden no importa) y la
   identidad del titular (tipo + país + número del documento, normalizados).
   Los datos de la tarjeta no se guardan, así que no pueden compararse.
3. **Misma clave + mismos datos** → `200` con la misma reserva, sin volver a
   pasar por la pasarela ni a mandar el email (`email.enviado: null`).
4. **Misma clave + datos distintos** → `409 CLAVE_REUTILIZADA`.
5. **Dos pedidos con la misma clave al mismo tiempo**: el índice único de
   `DatosReservaWeb.claveIdempotencia` deja pasar uno solo; el otro se
   revierte (libera su preautorización) y responde según las reglas 3 y 4.

Qué hace el frontend después de un error (`ecommerce.constantes.js →
CODIGOS_REGENERAN_CLAVE`, `ProcesoCompraContext → tratarErrorReserva`):

| Grupo | Códigos | Clave para el reintento | Por qué |
|---|---|---|---|
| Respuesta **definitiva** del servidor | `DATOS_INVALIDOS`, `PRECIO_CAMBIADO`, `SIN_DISPONIBILIDAD`, `PAGO_RECHAZADO`, `TARJETA_VENCE_ANTES`, `CLAVE_REUTILIZADA` | **Nueva** | El servidor contestó que la reserva **no** se creó. El reintento lleva datos distintos (otra tarjeta, el total nuevo, otro campo) y con la misma clave daría `CLAVE_REUTILIZADA`. |
| **Sin** respuesta definitiva | `ERROR_RED` (sin respuesta o timeout), `ERROR_INTERNO`, `DEMASIADOS_INTENTOS` | **La misma** | El pedido pudo haberse procesado (por ejemplo, se cortó la conexión después de crear la reserva y cobrar). Si se reintenta con la misma clave y la reserva existe, el servidor devuelve la misma reserva (200) sin volver a cobrar. **Una clave nueva crearía una segunda reserva y un segundo cobro.** |

Además, el contexto regenera la clave cuando cambian las fechas, la ocupación,
el tipo o el plan, y la borra al llegar a la confirmación.

---

## POST `/api/web/mi-reserva`

Consulta de una reserva con código + email (HU-104). No hay cuentas de huésped.

**Request**

```json
{ "codigo": "3FA9C21B", "email": "juan@correo.com" }
```

**Response 200**

```json
{
  "codigoConfirmacion": "3FA9C21B",
  "estado": "Confirmada",
  "fechaDesde": "2026-11-20",
  "fechaHasta": "2026-11-23",
  "noches": 3,
  "plan": {
    "codigo": "BAR",
    "nombre": "Best Available Rate",
    "reembolsable": true,
    "horasCancelacionSinCargo": 48,
    "penalidadNoShow": "PRIMERA_NOCHE"
  },
  "habitaciones": [{ "tipo": "Doble", "adultos": 2, "menores": 1 }],
  "total": 75000,
  "cobrado": 0,
  "garantia": { "tipo": "GARANTIA", "marca": "VISA", "ultimos4": "4242" },
  "titular": "Juan P.",
  "documento": "****222",
  "cancelacion": {
    "puedeCancelarOnline": true,
    "motivo": null,
    "penalidad": {
      "aplica": false,
      "monto": 0,
      "limiteSinCargo": "2026-11-18T17:00:00.000Z",
      "mensaje": "Cancelación sin cargo."
    }
  }
}
```

- **Normalización**: el código se pasa a mayúsculas y se le sacan espacios y
  guiones (`3fa9-c21b` = `3FA9C21B`); el email, a minúsculas y sin espacios.
  Un código que no son 8 hexadecimales o un email mal formado dan **el mismo
  404** que una reserva inexistente.
- **Qué email vale** (decisión 6): en una reserva **web**,
  `DatosReservaWeb.emailContacto`; en una **del mostrador**,
  `Huesped.contacto`, **solo si es un email**.
- **404 `NO_ENCONTRADA`**, siempre con el mismo mensaje ("No encontramos una
  reserva con esos datos. Revisá el código y el email, o contactá a
  recepción."): código inexistente, email que no coincide, formato inválido o
  reserva del mostrador sin email. No se revela si el código existe: la base
  se consulta igual en todos los casos, el email se compara en tiempo
  constante y **toda respuesta (200 o 404) tarda al menos 400 ms**.
- **Datos que nunca salen**: ids, números de habitación o piso, documento
  completo (solo `****` + los últimos 3), email, nombre completo (`titular`:
  primer nombre + inicial del apellido) ni datos de otros huéspedes.
- `habitaciones`: tipo y ocupación de cada habitación, en el orden en que se
  cargaron. `total`: suma de las noches; `cobrado`: suma de los pagos no
  anulados (seña, prepago, etc.).
- `garantia`: la tarjeta de una reserva web (`"GARANTIA"` en la tarifa
  flexible, `"PREPAGO"` en la no reembolsable); `null` en una del mostrador.
- `plan.horasCancelacionSinCargo` es `null` si el plan no es reembolsable.

### `cancelacion` (decisión 14: online solo **sin cargo**)

`puedeCancelarOnline` es `true` solo si **todo** esto se cumple, evaluado en
este orden (el primero que falla da el `motivo`):

| # | Regla | `motivo` si falla |
|---|---|---|
| 1 | Estado `Confirmada` | `Cancelada` → "Esta reserva ya fue cancelada."; `En curso` / `Cerrada` → `null` |
| 2 | Antes de las 14 h (hora argentina) del día de llegada | "Tu llegada es hoy. Para cualquier cambio, contactá a recepción." (si el día ya pasó: "La fecha de llegada ya pasó. Para cualquier cambio, contactá a recepción.") |
| 3 | Sin pagos activos (`PagoEstadia` no anulado; el **prepago** de la tarifa no reembolsable no cuenta acá: lo cubre la regla 4) | "Tu reserva tiene un pago registrado. Para cancelarla, contactá a recepción." |
| 4 | Plan reembolsable | "Esta tarifa no admite reintegro. Si necesitás cancelar, contactá a recepción." |
| 5 | Penalidad 0 según `calcularPenalidad` (motor de tarifas, sin cambios) | "Cancelar ahora tiene un cargo de $ X (<explicación del motor>). Para cancelar, contactá a recepción." |

- `penalidad`: `{ aplica, monto, limiteSinCargo, mensaje }` de
  `calcularPenalidad` (solo se calcula si la reserva está `Confirmada`);
  `null` en los demás estados.
- La cancelación **con cargo** no se hace online: se deriva a recepción hasta
  que se integre el cobro de penalidades (Ricardo).

## POST `/api/web/mi-reserva/cancelar`

**Request**

```json
{ "codigo": "3FA9C21B", "email": "juan@correo.com", "montoPenalidadAceptado": 0 }
```

**Response 200**

```json
{ "estado": "Cancelada", "penalidadCobrada": 0, "email": { "enviado": true } }
```

- Busca la reserva igual que la consulta: mismos casos de **404
  `NO_ENCONTRADA`** y mismo piso de 400 ms.
- **Ya cancelada** → `200 { "estado": "Cancelada", "penalidadCobrada": 0 }`
  (sin `email`): es idempotente, no cancela de nuevo ni manda otro email.
- Recalcula todo en el servidor. Si ya no se puede cancelar online (pasó el
  plazo, hay un pago, etc.) → **`409 PENALIDAD_CAMBIO`** con `montoNuevo` (la
  penalidad actual, o 0) y `motivo` (el mismo texto de la tabla); `error` trae
  ese mismo motivo.
- `montoPenalidadAceptado` tiene que ser **0** (online solo se cancela sin
  cargo); cualquier otro valor (o vacío) → `409 PENALIDAD_CAMBIO` con
  `montoNuevo: 0` y `motivo: null`.
- Si se puede: `cancelarReserva(id, { motivoCancelacion: "Cancelada por el
  huésped desde la web" })` del módulo de reservas (sin cambios: estado
  `Cancelada` y la habitación queda libre; una reserva cancelable online no
  tiene pagos que anular) y el **email de cancelación** al email de la
  reserva ("Tu reserva <código> fue cancelada", con fechas, tipo, tarifa y "No
  se realizó ningún cargo"). `email.enviado` es `false` si el SMTP falla; la
  cancelación queda hecha igual.

---

## GET `/api/reservas-web/:reservaId` (interno del mostrador)

No es parte de la API pública: lo usa el detalle de reserva del mostrador para
el bloque "Reserva web". Exige **sesión** (`requiereSesion`) y el permiso de
ver reservas (`requiereRol("admin", "recepcionista", "gerente")`, el mismo
criterio que `verReservas` del frontend). `GET /api/reservas/:id` sigue sin
sesión y **no** se le agregaron estos datos.

**Response 200**

```json
{
  "emailContacto": "maria@correo.com",
  "telefonoContacto": "+54 9 387 555-1234",
  "horaEstimadaLlegada": "20-22",
  "solicitudesEspeciales": "Cuna para bebé, si es posible.",
  "tarjeta": { "titular": "MARIA GONZALEZ", "marca": "VISA", "ultimos4": "4242", "vencimiento": "08/2028" },
  "tipoGarantia": "GARANTIA",
  "aceptaPoliticasEn": "2026-10-04T17:32:00.000Z",
  "versionPoliticas": "2026-10-01",
  "aceptaComunicaciones": false
}
```

- `tipoGarantia`: `"GARANTIA"` (tarifa flexible) | `"PREPAGO"` (no reembolsable).
- **Nunca** devuelve `garantiaToken` ni `pasarelaReferencia` (ni siquiera los lee).
- **`200` con `null`** si la reserva no tiene datos web (reserva del mostrador
  o inexistente; antes era un 404, etapa 4); `401` sin sesión; `403` con un rol que no ve reservas; `400` con un id inválido.

En el detalle (`frontend/src/modulos/reservas/detalle/ColumnaDerecha.jsx`) la
tarjeta "Reserva web" va después de "Quién reservó", solo si el endpoint
devuelve datos (`null` o un error no muestran nada): contacto, "Llegada
estimada: 20 a 22 h", solicitudes (o "Sin solicitudes"), "Garantizada con VISA
••4242 · vence 08/2028" o "Prepagada con VISA ••4242", "Aceptó términos
v2026-10-01 el 04/10/2026 14:32" (hora argentina) y "Acepta comunicaciones:
sí/no".

---

## Errores

Forma única:

```json
{ "error": "Mensaje legible para el huésped.", "codigo": "PRECIO_CAMBIADO", "totalNuevo": 52000 }
```

El frontend los normaliza a `{ codigo, mensaje, status, ...extra }`
(`ecommerce.api.js`) y los traduce a texto con `componentes/MensajeError.jsx`.

| Código | HTTP | Extra | Qué hace la pantalla |
|---|---|---|---|
| `DATOS_INVALIDOS` | 400 | `campo` (ej. `"huesped.email"`, `"tarjeta.numero"`) | Marca el campo con el error. |
| `NO_ENCONTRADA` | 404 | — | Mensaje general único ("No encontramos una reserva con esos datos. Revisá el código y el email, o contactá a recepción."), sin revelar si el código existe. |
| `PRECIO_CAMBIADO` | 409 | `totalNuevo` | Muestra el total nuevo y pide confirmar de nuevo. |
| `SIN_DISPONIBILIDAD` | 409 | — | Solo cuando **no hay habitación libre** para la selección. Vuelve a resultados. |
| `CLAVE_REUTILIZADA` | 409 | — | Genera una clave nueva y reintenta. |
| `PENALIDAD_CAMBIO` | 409 | `montoNuevo`, `motivo` | Mi reserva vuelve a consultar y muestra el motivo nuevo (sin botón de cancelar). |
| `PAGO_RECHAZADO` | 402 | `motivo` | Pide otra tarjeta. |
| `TARJETA_VENCE_ANTES` | 422 | — | Pide otra tarjeta. |
| `DEMASIADOS_INTENTOS` | 429 | — | Pide que espere unos minutos. |
| `ERROR_INTERNO` | 500 (503 con `reintentarEn` si la base está ocupada) | — | Mensaje genérico. |
| `ERROR_RED` | — | — | **Solo del frontend**: no hubo respuesta (sin conexión o timeout). Mensaje genérico; se reintenta con la misma clave. |

### Mensajes del motor

Los errores de negocio del sistema (`ErrorDeNegocio` de reservas y del motor
de tarifas) se traducen en `backend/src/modulos/ecommerce/ecommerce.errores.js`:

- Un error de negocio 4xx (incluido un 409 del motor por estadía mínima o
  cierre a llegadas) → `400 DATOS_INVALIDOS` **con su mensaje**, si es seguro.
  `SIN_DISPONIBILIDAD` queda solo para "no hay habitación libre".
- **Mensaje seguro**: no contiene un dato concreto de otra persona. Se
  reemplaza por el genérico del código si contiene un **número de
  habitación** ("habitación 204", "hab. 050": 2 a 4 dígitos junto a
  "habitación" o "hab.") o un **código de reserva** (8 hexadecimales). Las
  palabras "habitación" o "reserva" solas no se filtran: "La estadía mínima
  para esta reserva es de 3 noches" pasa tal cual.
- `traducirError(err, { origen })` ya recibe el contexto: en la 1B-2, el 409 de
  `crearReservaEnTransaccion` (el precio cambió) va a ser `PRECIO_CAMBIADO`.
- Un error inesperado se loguea en el servidor (mensaje y stack, nunca el body)
  y responde `ERROR_INTERNO`.

---

## Huésped (titular)

El titular de una reserva web **es la ficha `Huesped` del sistema** (la misma
que usan el mostrador y el check-in). Campos de `huesped` en
`POST /api/web/reservas`: **obligatorios todos salvo `nacionalidad` y
`paisResidencia`**, que son **opcionales** (si vienen, tienen que ser ISO-2
válidos):

| Campo | Formato | Validación |
|---|---|---|
| `nombres` | texto | no vacío |
| `apellido` | texto | no vacío |
| `tipoDocumento` | texto | del catálogo único `TIPOS_DOCUMENTO` (`frontend/src/lib/tiposDocumento.js` = `backend/src/lib/tiposDocumento.js`): `DNI`, `Pasaporte`, `Cédula de identidad`, `Libreta de Enrolamiento`, `Libreta Cívica` |
| `paisDocumento` | ISO 3166-1 alfa-2 | país emisor del documento; código de `PAISES` (`frontend/src/lib/paises.js` = `backend/src/lib/paises.js`) |
| `numeroDocumento` | texto | no vacío |
| `fechaNacimiento` | `AAAA-MM-DD` | el titular tiene que tener **al menos 18 años a la fecha de ingreso** (`fechaDesde`), igual que `normalizarAltaReserva` |
| `email` | email | formato válido; es el email de contacto de la reserva |
| `telefono` | texto | no vacío |
| `nacionalidad` | ISO 3166-1 alfa-2 | **opcional**; si viene, código de `PAISES` |
| `paisResidencia` | ISO 3166-1 alfa-2 | **opcional**; si viene, código de `PAISES` |

- El frontend importa los catálogos de `frontend/src/lib/` (vía
  `ecommerce.constantes.js`); no hay listas propias del e-commerce.
- **Nacionalidad y país de residencia empiezan vacíos** en el formulario. Son
  datos de la ficha de registro de pasajeros y la residencia define la posible
  exención de IVA: un extranjero que no los toca no puede quedar como
  argentino residente. `paisDocumento` sí empieza en `AR`. Si el huésped no los
  completa, se piden en el check-in.
- **El consentimiento se acepta en la pantalla Datos** (`/web/datos`): una
  casilla obligatoria (términos, política de cancelación y privacidad, Ley
  25.326) y otra opcional de comunicaciones, ambas sin tildar. Pago redirige a
  Datos si falta la aceptación. El backend registra la fecha, la hora y la
  versión (`"2026-10-01"`) en `DatosReservaWeb`.
- La identidad de la persona es **tipo + país + número** del documento, con la
  misma normalización que el sistema (`persona.servicio.js → claveDocumento`).

## Cómo se procesa el pago (etapa 1B-2)

- **Plan reembolsable** (tarifa flexible): `GARANTIA` con monto 0 — valida la
  tarjeta y devuelve un token. **No se cobra nada y no es un pago**: no se
  registra en `PagoEstadia` (`consolidarCargos` la restaría del saldo del
  check-out). Marca, últimos 4, vencimiento, token y referencia van en
  `DatosReservaWeb`. El no-show se cobrará después con el token.
- **Plan no reembolsable**: `PREAUTORIZACION` por el total → se crea la
  reserva **y** un `PagoEstadia` con concepto **"Prepago"**
  (`CONCEPTO_PREPAGO`), medio "Tarjeta crédito" y la referencia de la
  preautorización, en la misma transacción → `CAPTURA`.
  - Si la transacción falla (cualquier error): `LIBERACION` y se responde el
    error.
  - Si la **captura** falla después de crear la reserva, se compensa con las
    funciones del sistema: se anula el prepago con motivo "Pago no capturado"
    (`anularPago`), se cancela la reserva con ese mismo motivo
    (`cancelarReserva`, que no aplica penalidades ni manda emails), se libera
    la preautorización y se responde `402 PAGO_RECHAZADO`: "No pudimos
    confirmar el pago. No se realizó ningún cargo."
- La llamada a la pasarela va **fuera de la transacción de la base**.
- En el check-out, el saldo de alojamiento de una reserva no reembolsable es 0
  (el prepago se descuenta); en una flexible es el total (la garantía no).
- La pasarela es **simulada**, propia del módulo
  (`backend/src/modulos/ecommerce/pasarelaSimulada.js`), con la firma de
  abajo. Es el único punto que se reemplaza por el módulo de garantías de
  Ricardo.

### Firma de la pasarela — *propuesta enviada a Ricardo, a confirmar*

La guía de Ricardo no está en el repositorio; la firma sale de ella.

```js
procesarTarjeta({ operacion, monto, tarjeta, referenciaPrevia, claveIdempotencia })
//   operacion: 'GARANTIA' | 'COBRO' | 'PREAUTORIZACION' | 'CAPTURA' | 'LIBERACION'
//   monto: Prisma.Decimal (0 para GARANTIA)
//   tarjeta: { titular, numero, vencimientoMes, vencimientoAnio, cvv }  (se valida y NO se guarda)
//   referenciaPrevia: para CAPTURA y LIBERACION
// → { aprobado, referencia, token, marca, ultimos4, motivoRechazo }
```

Y para registrar dentro de la transacción, **sin** llamar a la pasarela:

```js
registrarGarantiaEnTransaccion(tx, { reservaId, tipo, token, marca, ultimos4, vencimiento, referencia, monto, estado })
```

Tarjetas de prueba de la pasarela simulada:

| Número | Resultado |
|---|---|
| `4242424242424242` | Aprobada |
| `4000000000000002` | Tarifa **flexible**: aceptada (la garantía de monto 0 no mira el saldo). Tarifa **no reembolsable**: rechazada — fondos insuficientes |
| `4000000000000069` | Rechazada en cualquier tarifa — tarjeta vencida |

Marca por prefijo: VISA `4`; MASTERCARD `51`–`55` y `2221`–`2720`; AMEX `34` y
`37`; cualquier otra, `OTRA`. La pasarela es idempotente en memoria por
(clave, operación) y lleva el estado de cada preautorización (pendiente,
capturada, liberada).

### Tarjetas: aclaración importante

En un e-commerce real los datos de la tarjeta **no pasan por el servidor del
hotel**: los toma la pasarela (campos alojados en su dominio) y devuelve un
token. Acá pasan por el backend porque la pasarela es simulada. Aun así:

- el número y el CVV **nunca se guardan, nunca se loguean y nunca se devuelven**
  (el controlador separa `tarjeta` del body apenas llega y solo se la pasa al
  servicio);
- en el frontend no van al contexto ni a ningún storage: viven en el estado
  local de `PagoPage`, que los pasa directo a `crearReserva` y los limpia
  después de la respuesta.

---

## Cómo funciona por dentro

### Reservas web = reservas normales

Se crean como `Reserva` con sus `ReservaNoche` (las ven el mostrador, el
check-in y el check-out), con el mismo alta del sistema
(`crearReservaEnTransaccion`). Lo propio de la web va en la tabla
complementaria 1 a 1 **`DatosReservaWeb`** (`datos_reserva_web`, creada en la
etapa 1B-1 con `backend/prisma/agregar-datos-reserva-web.sql`):

| Columna | Qué guarda |
|---|---|
| `reservaId` (único) | la reserva |
| `claveIdempotencia` (única) | la clave del alta |
| `emailContacto`, `telefonoContacto` | el contacto declarado en la web |
| `horaEstimadaLlegada`, `solicitudesEspeciales` | llegada y pedidos |
| `aceptaPoliticasEn`, `versionPoliticas`, `aceptaComunicaciones` | consentimiento |
| `tarjetaTitular`, `tarjetaMarca`, `tarjetaUltimos4`, `tarjetaVencimiento` | la tarjeta de la garantía, **sin número completo ni CVV** |
| `garantiaToken`, `pasarelaReferencia` | lo que devuelve la pasarela |
| `creadoEn` | alta |

### Canal de la reserva

Se **deduce** de la existencia de `DatosReservaWeb`: si la reserva tiene esa
fila, es web. No se agrega una columna a `Reserva`.

### Email y teléfono

`Huesped` tiene un solo campo `contacto`. El email y el teléfono que declara
la web se guardan en `DatosReservaWeb` (`emailContacto`,
`telefonoContacto`). Si la persona es **nueva**, su `Huesped.contacto` queda
con el email. (Se implementa en la 1B-2.)

### Ficha existente: la web no la pisa

En la 1B-2, el alta web busca la ficha por identidad (tipo + país + número,
misma normalización que el sistema). Si **existe**, la reserva usa esa ficha y
la web solo **completa los campos vacíos**: nunca reemplaza un dato que ya
cargó el mostrador o el check-in. No se modifica `resolverHuesped`.

### Garantía con tarjeta

En un plan reembolsable la tarjeta **garantiza** la reserva: no se cobra y no
es un pago, así que **no** va a `PagoEstadia` (`consolidarCargos` la restaría
del saldo). Sus datos, sin número ni CVV, van en `DatosReservaWeb`.

En las **llegadas del check-in**, la columna "Garantía" muestra cómo está
asegurada cada reserva, en este orden: "Prepagada · $ X" (prepago), "Garantizada
con tarjeta · MARCA ••1234" (reserva web flexible), la seña como siempre o "Sin
garantía · tomar al ingreso". El paso de garantía para consumos del check-in
no cambia: se pide a todos, incluso a quien prepagó.

### Habitación representante

La web vende por tipo; el sistema reserva habitaciones concretas. Para cotizar
(`POST /cotizar`) y para la **asignación real del alta en la 1B-2** (HU-100)
se usa **la misma función**, `elegirRepresentantes`
(`backend/src/modulos/ecommerce/ecommerce.transformacion.js`):

1. las líneas se atienden de **mayor a menor cantidad de personas** (así una
   línea chica no se queda con la única habitación grande);
2. a cada una, la habitación **libre** de su tipo, todavía no usada, con la
   **menor capacidad que alcance**;
3. desempate por id; dos líneas del mismo tipo nunca comparten habitación.

"Libre" es el mismo criterio del sistema (`consultarDisponibilidad`,
incluida la regla de entrada hoy). La habitación concreta nunca se muestra al
huésped.

### Mi reserva

El email se compara con `DatosReservaWeb.emailContacto` en las reservas web y
con `Huesped.contacto` (solo si es un email) en las del mostrador. Sin email
con qué comparar → `NO_ENCONTRADA` con el mensaje genérico.

La cancelación online usa `cancelarReserva` y `calcularPenalidad` tal cual
(no se modificaron). El historial de la reserva queda con el estado
`Cancelada` y el motivo "Cancelada por el huésped desde la web"; no se escribe
un evento aparte (ver **Limitaciones**). Código:
`backend/src/modulos/ecommerce/miReserva.js` (reglas puras),
`miReserva.servicio.js` (consulta) y `miReserva.cancelacion.js`.

---

## Para Tomás: qué cambió en Datos *(histórico — integrado el 2026-10-06)*

El formulario de `/web/datos` (`DatosHuespedPage.jsx`) tiene que cargar el
titular con la forma nueva (sección **Huésped (titular)**). Respecto de la 1A:

- **Nombres y apellido separados**: el campo `nombre` ahora es `nombres`
  (más `apellido`, como antes).
- **País del documento** (`paisDocumento`, nuevo): selector con `PAISES` de
  `frontend/src/lib/paises.js` (pares `[codigo, nombre]`); empieza en `AR`.
- **Fecha de nacimiento** (`fechaNacimiento`, nueva): `AAAA-MM-DD`; el titular
  tiene que tener 18 años o más a la fecha de ingreso
  (`EDAD_MINIMA_TITULAR`).
- **Tipo de documento**: `TIPOS_DOCUMENTO` (y `ETIQUETAS_NUMERO_DOCUMENTO`
  para la etiqueta del número) de `frontend/src/lib/tiposDocumento.js`.
- **Nacionalidad y país de residencia**: también `PAISES` de
  `frontend/src/lib/paises.js`; ya **no** existe el `PAISES` propio de
  `ecommerce.constantes.js` (de 22 países). Empiezan **vacíos**: el
  formulario puede ofrecer "igual que el país del documento", pero **sin
  precargarlo**.
- Todo se importa desde `ecommerce.constantes.js`, que reexporta los
  catálogos únicos.
- `ConfirmacionPage.jsx` todavía muestra `plan.nombre`; tiene que mostrar
  `nombreComercialPlan(plan)` de `formato.js` ("Tarifa flexible" / "No
  reembolsable"), como resultados, el resumen y Mi reserva.

### Para Tomás: Pago y Confirmación (etapa 1B-2) *(histórico — integrado el 2026-10-06)*

`POST /api/web/reservas` ya es real. Lo que tienen que mostrar las pantallas:

- **Pago** (`PagoPage.jsx`):
  - según el plan elegido: "Tu tarjeta solo garantiza la reserva: no se cobra
    nada ahora" (flexible) o "Se cobra el total ahora" (no reembolsable);
  - los errores, con `MensajeError`: `PAGO_RECHAZADO` (con `motivo`: "Tarjeta
    vencida", "Fondos insuficientes" o "No pudimos confirmar el pago…"),
    `TARJETA_VENCE_ANTES`, `PRECIO_CAMBIADO` (mostrar `totalNuevo` y pedir
    confirmar de nuevo), `SIN_DISPONIBILIDAD` (volver a resultados);
  - la tarjeta vive solo en el estado local de la página y se limpia después
    de la respuesta.
- **Confirmación** (`ConfirmacionPage.jsx`):
  - el **código** de la reserva, siempre;
  - `email.enviado === true` → "Enviamos el comprobante a {email}";
  - `email.enviado === false` → aviso de que **no se pudo enviar** el email y
    que **guarde el código** (lo necesita para Mi reserva);
  - `email.enviado === null` (repetición idempotente) → solo el código, sin
    mensaje sobre el email;
  - garantía: "Garantizada con tarjeta {marca} terminada en {ultimos4}" o
    "Cobrado {cobradoAhora} con tarjeta {marca} terminada en {ultimos4}";
  - el plan con `nombreComercialPlan(plan)` y `textoCondicionesPlan(plan)`
    (las condiciones ya no repiten el nombre: "Tarifa flexible" / "No
    reembolsable" va aparte).

---

## Cambios de la etapa 2

Todos los cambios en archivos compartidos son **solo agregados**: no se
renombró, borró ni cambió la firma o el comportamiento de nada que ya
existiera.

### Pantallas terminadas (de Gimena)

- **Inicio** (`/web`), **Resultados** (`/web/resultados`) y **Detalle del
  tipo** (`/web/habitacion/:tipoHabitacionId`), con el diseño del mockup (págs.
  1 a 3, y móvil). Títulos de pestaña "<página> · Holiday Inn Salta".
- **Búsqueda en la URL** de resultados y del detalle:
  `?entrada=AAAA-MM-DD&salida=AAAA-MM-DD&adultos=N&menores=N`. Un F5 o un link
  compartido repiten la búsqueda; si la URL no la trae, se completa con la del
  contexto. Los links de la etapa 1 (`?desde&hasta`) se siguen aceptando.
  Parámetros inválidos → aviso y buscador, sin consultar la API.
- **Buscador web**: menores rotulados "Menores (0 a 12 años)" con la ayuda
  "Desde los 13 años cuentan como adultos" (el motor cobra adulto desde los 13);
  adultos de 1 a la **capacidad máxima entre los tipos** (de `/api/web/tipos`,
  nunca un número fijo); adultos + menores no la superan ("Para más de N
  personas, contactá a recepción"); entrada desde hoy, salida posterior, hasta
  30 noches y **hasta 365 días** desde hoy. Las fechas se muestran "Vie 16 oct
  2026" (texto superpuesto `aria-hidden` sobre el input nativo, que conserva
  su label y su valor).
- **Resultados**: cada tipo con su descripción, capacidad, "Desde $ X por
  noche" y, por plan, condiciones de cancelación y de no-show (criterios de
  HU-99); disponibles primero por `desdePorNoche`, no disponibles al
  final (atenuados, con su motivo y sin botones); "Ahorrás $ X" del no
  reembolsable = diferencia real de totales contra la tarifa flexible del mismo
  tipo; esqueletos de carga; "Reintentar" en errores de red; estado vacío con
  el motivo más relevante y el teléfono de recepción. "Elegir" muestra
  "Cotizando…" y bloquea los botones (sin doble envío); `SIN_DISPONIBILIDAD`
  refresca los resultados y avisa "Ese tipo se agotó para tus fechas".
- **Detalle del tipo**: galería 1 + 4 con "Ver las 5 fotos" (visor accesible:
  foco, flechas, Esc) y "1/5" en móvil; políticas con check-in 14 h, check-out
  10 h y la cancelación y el no-show **de cada plan** (`GET /api/web/planes`);
  panel con los planes de ese tipo y "Reservar" (mismo flujo que "Elegir") o
  "Elegí tus fechas para ver precios"; barra fija en móvil.
- **Check-out**: `ecommerce.config.js → HOTEL.checkOut = "10 h"` (antes
  "[COMPLETAR]"). Se ve en "Cómo llegar", en las políticas del detalle y en el
  resumen (`ResumenReserva` ya lo mostraba).

### Agregados en archivos compartidos

| Archivo | Agregado |
|---|---|
| `componentes/BuscadorEstadia.jsx` | Props opcionales `capacidadMaxima`, `ventanaVentaDias`, `menoresConEdad`, `fechasLegibles`, `compacto` y `erroresExternos`; exporta `validarBusquedaWeb` y `sumarDias`. **Sin esas props el buscador es exactamente el de antes** (`validarBusqueda` no cambió). |
| `componentes/CampoFecha.jsx` (nuevo) | Campo de fecha con el valor legible superpuesto. |
| `componentes/TarjetaTipoResultado.jsx` (nuevo) | `TarjetaTipoResultado` y `FilaPlanResultado` (fila de plan con ahorro; el botón se llama "Elegir/Reservar <plan> por $ X"). |
| `componentes/GaleriaTipo.jsx` (nuevo) | Galería con visor accesible. |
| `componentes/ErrorConReintento.jsx` (nuevo) | `MensajeError` + "Reintentar"; `esReintentable(error)`. |
| `componentes/Esqueleto.jsx` (nuevo) | `EsqueletoTarjetaTipo` y `CargandoTarjetas` (con `role="status"`). |
| `busquedaWeb.js` (nuevo) | Funciones puras: `leerBusquedaDeUrl`, `busquedaComoQueryWeb`, `ordenarTipos`, `hayDisponibles`, `ahorroContraFlexible`, `motivoMasRelevante`, `textoResumenBusqueda`, `capacidadMaximaDeTipos`, `textoNoShow` y `VENTANA_VENTA_DIAS`. |
| `useElegirPlan.js` (nuevo) | Hook de "Elegir"/"Reservar": cotiza, guarda y sigue a `/web/datos`. |
| `useTituloPagina.js` (nuevo) | `useTituloPagina(nombre)` → "<nombre> · Holiday Inn Salta". |
| `ecommerce.api.js` | `obtenerPlanes()`. |
| `ecommerce.mock.js` | `mockObtenerPlanes()`, con la forma real. |
| `ecommerce.css` | Solo clases nuevas `ec-` (campo de fecha, buscador web y compacto, esqueletos, error con reintento, `ec-solo-lector`, `ec-solo-escritorio`, ahorro, estado vacío, detalle del tipo, galería y visor). Ninguna regla existente cambió. |
| `formato.js` y `ProcesoCompraContext.jsx` | **Sin cambios.** |

### Para Tomás (etapa 2) *(histórico — integrado el 2026-10-06)*

- Tus páginas pueden usar `useTituloPagina("Tus datos")`, `useTituloPagina("Pago")`
  y `useTituloPagina("Confirmación")` para el título de la pestaña.
- `ErrorConReintento` sirve para un error reintentable (`ERROR_RED`,
  `ERROR_INTERNO`, `DEMASIADOS_INTENTOS`) con su botón "Reintentar".
- El check-out a las 10 h ya aparece en `ResumenReserva`; en
  `ConfirmacionPage` sale de `HOTEL.checkOut`, así que tampoco hay que tocar
  nada.
- Para volver a resultados desde tus pantallas, usá
  `/web/resultados?${busquedaComoQueryWeb(busqueda)}` (o simplemente
  `/web/resultados`: si la URL no trae búsqueda, se completa con la del contexto).
- Los tests de rutas usan fechas relativas a hoy (regla del proyecto).

## Cambios de la etapa 4

Mi reserva real (HU-104). Los cambios en archivos compartidos son **solo
agregados**, salvo los que se detallan acá (la forma de Mi reserva y el 404
del endpoint interno).

- **Endpoints**: `POST /api/web/mi-reserva` y `/mi-reserva/cancelar` pasan a
  ser reales. **Cambió la forma de la respuesta** respecto del mock de la
  etapa 1: `puedeCancelar` y `penalidadCancelacion` se reemplazan por
  `cancelacion: { puedeCancelarOnline, motivo, penalidad }`; se agregan
  `garantia` y `plan.penalidadNoShow`. La cancelación online es **solo sin
  cargo** (`montoPenalidadAceptado: 0`, `penalidadCobrada: 0`).
- **Página** `/web/mi-reserva` terminada: código precargado desde `?codigo=`
  (el email nunca va en la URL); campos "Código de reserva" y "Email" con los
  errores de formato junto a cada uno; botón "Buscar"; el 404 como mensaje
  general; tarjeta con estado, fechas, noches, habitaciones, tarifa y
  condiciones, total, cobrado o garantía, y titular y documento enmascarados.
  Si se puede cancelar: link "Cancelar reserva" → diálogo de confirmación
  accesible → "Reserva cancelada. Te enviamos la confirmación por email." en
  el lugar. Si no: el motivo con el teléfono de recepción. Sin "Modificar".
  Insignia: `Confirmada` y `En curso` en verde, `Cerrada` en gris, `Cancelada`
  en rojo.
- **Emails**: el de confirmación ahora trae el link
  `<WEB_PUBLIC_URL>/web/mi-reserva?codigo=<código>`; sin la variable, dice
  "Ingresá a Mi reserva en nuestra web con tu código y tu email.". Nuevo email
  de cancelación.
- **Variable de entorno nueva (opcional)** en `backend/.env`: `WEB_PUBLIC_URL`
  = URL pública del sitio, sin barra final (por ejemplo
  `https://hotel.example.com`). Solo se usa para el link del email; si no
  empieza con `http://` o `https://`, se ignora.
- **Endpoint interno** `GET /api/reservas-web/:reservaId`: una reserva sin
  datos web responde `200 null` en vez de 404 (así el detalle del mostrador no
  deja un error en la consola). `401` y `403` no cambian.

| Archivo | Cambio |
|---|---|
| `componentes/DialogoConfirmacion.jsx` (nuevo) | Diálogo modal accesible (foco inicial en "Volver", Tab encerrado, Esc, devuelve el foco). |
| `componentes/MensajeError.jsx` | Texto nuevo de `NO_ENCONTRADA`; `PENALIDAD_CAMBIO` muestra `motivo` si viene. |
| `formato.js` | Agregado `formatearInstanteHotel(iso)` → "Mié 18 nov 2026 a las 14:00" (hora de Salta). |
| `ecommerce.mock.js` | Mi reserva con la forma nueva y más demos (ver "Mi reserva en el mock"). |
| `ecommerce.css` | Solo clases nuevas `ec-` (tarjeta de Mi reserva, diálogo, botón y link de peligro). |
| `reservas/detalle/reservaWeb.api.js` | Ya no depende del 404: `null` → sin bloque. |

## Cómo trabajar sobre esta base

1. **Ramas**: creá tu rama desde `feature/ecommerce` (por ejemplo,
   `feature/ecommerce-tomas`) y abrí el PR hacia `feature/ecommerce`. Gimena
   revisa y mergea. Nadie abre PR a `master` desde acá.
2. **Quién es dueño de qué**:

   | Archivo / página | Ruta | Responsable |
   |---|---|---|
   | `paginas/InicioPage.jsx` | `/web` | Gimena |
   | `paginas/ResultadosPage.jsx` | `/web/resultados` | Gimena |
   | `paginas/DetalleTipoPage.jsx` | `/web/habitacion/:tipoHabitacionId` | Gimena |
   | `paginas/DatosHuespedPage.jsx` | `/web/datos` | Tomás |
   | `paginas/PagoPage.jsx` | `/web/pago` | Tomás |
   | `paginas/ConfirmacionPage.jsx` | `/web/confirmacion` | Tomás |
   | `paginas/MiReservaPage.jsx` | `/web/mi-reserva` | Gimena |
   | Backend `/api/web` (etapa 1B) | — | Gimena |

3. **Archivos compartidos que cambia solo Gimena**: `ecommerce.api.js`,
   `ecommerce.mock.js`, `ProcesoCompraContext.jsx`, `ecommerce.css` (tokens),
   `componentes/` y este `CONTRATO.md`. Si necesitás un cambio, pedilo.
4. **Modo simulado**: creá `frontend/.env.local` (ya está ignorado por git) con

   ```
   VITE_ECOMMERCE_MOCK=true
   ```

   y reiniciá `npm run dev` (el mock funciona **solo** en desarrollo; con
   `npm run build` nunca se usa). Para forzar errores, agregá a la URL de la página
   `?mockEscenario=...` y recargá (el proceso de compra sobrevive al F5):

   | Escenario | Efecto en el mock |
   |---|---|
   | `PRECIO_CAMBIADO` | `crearReserva` → 409 con `totalNuevo` (+10 %), hasta que se reintenta con `totalEsperado = totalNuevo` |
   | `SIN_DISPONIBILIDAD` | En resultados, Simple aparece "Sin disponibilidad para estas fechas" (salvo que la ocupación supere su capacidad: ahí manda "Admite hasta 2 personas"); `crearReserva` → 409 |
   | `CLAVE_REUTILIZADA` | `crearReserva` → 409 con la primera clave; con una clave nueva funciona |
   | `ERROR_INTERNO` | Todas las llamadas de esa página → 500 |
   | `DEMASIADOS_INTENTOS` | Todas las llamadas de esa página → 429 |

   Mi reserva en el mock:

   | Código | Email | Resultado |
   |---|---|---|
   | `3FA9C21B` | `demo@hotel.com` | reserva **web** flexible, en plazo: se cancela sin cargo |
   | `B81D90E4` | `mostrador@hotel.com` | reserva **del mostrador** cuyo contacto es un email, flexible y en plazo: se cancela |
   | `7C04E5A2` | cualquiera | reserva del mostrador con **teléfono** como único contacto → siempre `NO_ENCONTRADA` |
   | `5D21A7F0` | `nrf@hotel.com` | reserva web **no reembolsable** (prepagada): no se cancela online |
   | `9E4B0C37` | `plazo@hotel.com` | reserva web flexible **fuera de plazo** (con cargo): no se cancela online |
   | `A6E3F218` | `sena@hotel.com` | reserva del mostrador **con seña**: no se cancela online |

   Cualquier otra combinación → `NO_ENCONTRADA` con el mismo mensaje. Una
   reserva cancelada en el mock queda así hasta recargar la página.

5. **Tarjetas de prueba** (iguales en el mock y en el backend real):
   `4242424242424242` aprobada; `4000000000000069` rechazada en cualquier
   tarifa (tarjeta vencida); `4000000000000002` aceptada en la tarifa flexible
   y rechazada en la no reembolsable (fondos insuficientes); un número que no
   pasa Luhn → `DATOS_INVALIDOS` (`campo: "tarjeta.numero"`); ya vencida →
   `402 PAGO_RECHAZADO`; vence antes de la salida → `TARJETA_VENCE_ANTES`.
6. **Estilos**: solo clases `ec-` y variables de `.ec-raiz` (definidas en
   `ecommerce.css`). Nada de selectores de etiqueta sueltos ni `:root`. No
   reutilices los componentes de `frontend/src/componentes/` ni los de la web
   vieja.
7. **Prohibido commitear credenciales** (el repositorio es público). `.env.local`
   no se sube.
8. **No toques archivos fuera de `frontend/src/modulos/ecommerce/`** sin acordarlo.

---

## Límite de intentos (HU-106, parcial)

Protección del canal público: cada ruta de `/api/web` pasa primero por un
límite de intentos **por IP** (`backend/src/modulos/ecommerce/limiteIntentos.js`).
Ventanas deslizantes, con dos límites por grupo:

| Grupo | Rutas | Pedidos | Fallos que cuentan |
|---|---|---|---|
| `consulta` | `GET /tipos`, `/planes`, `/disponibilidad` | 120 por minuto | — |
| `cotizar` | `POST /cotizar` | 30 por minuto | — |
| `reserva` | `POST /reservas` | 10 cada 10 minutos | 5 en 30 minutos: tarjeta rechazada (402), vence antes de la salida (422) o número inválido (400 con `campo` `tarjeta.*`). Frena el "card testing". |
| `miReserva` | `POST /mi-reserva` y `/mi-reserva/cancelar` | 20 cada 15 minutos | 8 en 15 minutos: respuestas 404 (probar códigos al azar) |

- Al superarlo: `429` `DEMASIADOS_INTENTOS` con la forma de error común más
  `reintentarEn` (segundos) y el header `Retry-After`:
  `{ "error": "Hiciste demasiados intentos seguidos…", "codigo": "DEMASIADOS_INTENTOS", "reintentarEn": 120 }`.
  Para el frontend es una respuesta sin definitiva: reintenta con la misma
  clave de idempotencia.
- El estado vive **en memoria del proceso**: se reinicia con el backend y no se
  comparte entre instancias.
- `WEB_LIMITE_INTENTOS=off` (en `backend/.env`) lo desactiva; **solo para
  pruebas de carga locales**.
- **`TRUST_PROXY` (opcional)**: detrás de un proxy inverso (Clever Cloud),
  `req.ip` es la IP del proxy y todos los visitantes compartirían un mismo
  contador. Con `TRUST_PROXY=1` (cantidad de proxies delante; también acepta una
  lista de IPs o subredes separadas por comas) el límite usa la IP real de
  `X-Forwarded-For`. Ausente, vacío o `false`: no se confía en ningún proxy.
  `true` y cualquier valor inválido **se rechazan al arrancar** (`true`
  permitiría falsificar la IP para saltear el límite). Código:
  `backend/src/lib/trustProxy.js`.

## Email definitivo (HU-103)

`emailWeb.servicio.js` envía la confirmación (texto plano y HTML para clientes
de correo: tablas, estilos en línea, ancho máximo 600 px, sin imágenes ni
scripts) y el aviso de cancelación. La confirmación incluye: saludo con el
nombre del titular, código, estado, entrada y salida con check-in 14 h y
check-out 10 h, noches, tipo(s) de habitación y ocupación, tarifa (nombre
comercial y condiciones), penalidad de no-show, total con IVA incluido, cómo se
pagó o se garantizó (marca y últimos 4), llegada estimada y solicitudes
especiales (si las hay), el link a Mi reserva (con `WEB_PUBLIC_URL`, o el texto
alternativo) y "Antes de llegar". **Nunca** lleva números de habitación, ids ni
datos de la tarjeta más allá de la marca y los últimos 4, y el email del
huésped nunca viaja en un link. **Todo dato variable se escapa**
(`escaparHTML`) en el HTML. El límite de cancelación sin cargo se informa como
"hasta N h antes de la llegada", sin fecha ni hora exactas (Mi reserva sí las
muestra).

## Limitaciones conocidas

- Pago simulado (no hay pasarela real). El estado de la pasarela simulada
  (idempotencia y preautorizaciones) vive en memoria del proceso: se pierde al
  reiniciar el backend. Se reemplaza por el módulo de garantías de Ricardo.
- Si falla el envío del email, la reserva igual queda confirmada y la
  Confirmación avisa al huésped que guarde el código; el fallo solo se registra
  en el log del backend (no queda guardado para reintentar ni hay reenvío desde
  el mostrador): pendiente.
- El límite de intentos es **por IP y en memoria** (se reinicia con el backend y
  no se comparte entre instancias).
- HU-106: el **cierre de los endpoints de `/api`** (middleware de sesión con
  lista blanca) está **pendiente** (Tomás).
- **Cancelar desde el mostrador una reserva web no reembolsable** (con prepago)
  con 24 h o más de anticipación **anula el prepago en el sistema sin devolver
  el cobro** en la pasarela: `cancelarReserva` (de Ricardo) anula todos los
  pagos activos sin distinguir el concepto "Prepago". Pendiente.
- El resumen "Tu reserva" del proceso de compra no muestra el detalle por noche
  (criterio de HU-101): pendiente.
- Sin servicios adicionales, facturación ni check-in online.
- Sin modificación web de la reserva (HU-105 postergada): el huésped cancela y
  vuelve a reservar, o contacta a recepción.
- Mi reserva cancela online **solo sin cargo**. Con penalidad, con un pago
  registrado o con tarifa no reembolsable, se deriva a recepción hasta
  integrar el cobro de penalidades (Ricardo).
- El historial de la reserva **no registra la fecha de ninguna cancelación**
  (ni web ni del mostrador): queda el estado `Cancelada` y el motivo, sin un
  evento con fecha y hora. Mejora pendiente.
- La UI de esta entrega maneja una habitación por reserva web (los grupos
  reservan por recepción); el contrato ya acepta hasta 3 (selector de varias
  habitaciones: etapa 2).
- La web vieja (`/disponibilidad` y `/reservar`) se reemplaza en el cierre del
  proyecto, no ahora.
