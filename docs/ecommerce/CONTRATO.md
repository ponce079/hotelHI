# Contrato de la API del e-commerce (`/api/web`)

> **Contrato v2 (etapa 1B-1, alineado con la ficha Huesped de master). Cambios al contrato: solo Gimena.**

### Estado de cada endpoint

| Endpoint | Estado |
|---|---|
| `GET /api/web/tipos` | **Real** (etapa 1B-1) |
| `GET /api/web/disponibilidad` | **Real** (etapa 1B-1) |
| `POST /api/web/cotizar` | **Real** (etapa 1B-1) |
| `POST /api/web/reservas` | Mock — el alta real llega en la etapa 1B-2 |
| `POST /api/web/mi-reserva` y `/mi-reserva/cancelar` | Mock — etapa 4 |

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

Respuesta real de la base local (4 de octubre de 2026):

```json
{
  "tipos": [
    { "tipoHabitacionId": 1, "nombre": "Doble", "capacidadMaxima": 4 },
    { "tipoHabitacionId": 2, "nombre": "Simple", "capacidadMaxima": 2 }
  ]
}
```

- Tipos **activos** con al menos una habitación **activa**, ordenados por nombre.
- `capacidadMaxima`: `TipoHabitacion` no tiene ese campo; se calcula como el
  máximo de `Habitacion.capacidad` entre las habitaciones activas del tipo.
- Los ids son los de la base: el frontend nunca los asume fijos.

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
      "capacidadMaxima": 4,
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

Mismas fechas con `adultos=4` (respuesta real, recortada): la única Doble de
capacidad 4 está ocupada en esas fechas y la Simple admite 2.

```json
{
  "tipos": [
    { "tipoHabitacionId": 1, "nombre": "Doble", "capacidadMaxima": 4, "ultimasDisponibles": false,
      "desdePorNoche": null, "planes": [], "motivoNoDisponible": "Sin disponibilidad para estas fechas" },
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

Validaciones (la 1B las repite todas; el frontend las anticipa):

- `claveIdempotencia`: string de 8 a 64 caracteres (el frontend usa un UUID).
- `habitaciones`: 1 a 3 líneas; cada una dentro de la capacidad de su tipo.
- `totalEsperado`: el total que el huésped vio. Si el precio real difiere → `PRECIO_CAMBIADO`.
- `huesped`: el titular, con los campos de la ficha `Huesped` del sistema;
  todos obligatorios. Ver la sección **Huésped (titular)**.
- `llegada.horaEstimada`: `NO_SABE` | `14-16` | `16-18` | `18-20` | `20-22` | `DESPUES_22`.
- `solicitudesEspeciales`: opcional, máx. 500 caracteres (`""` o `null` si no hay).
- `consentimiento.aceptaPoliticas` tiene que ser `true`, y `versionPoliticas`
  la vigente (`"2026-10-01"`). `aceptaComunicaciones` es opcional (default `false`).
- `tarjeta`: Luhn válido, vencimiento posterior a `fechaHasta`, CVV de 3 o 4 dígitos.

**Response 201** (o **200** si la clave ya existía con los mismos datos)

```json
{
  "codigoConfirmacion": "3FA9C21B",
  "estado": "Confirmada",
  "fechaDesde": "2026-10-16",
  "fechaHasta": "2026-10-18",
  "noches": 2,
  "plan": { "codigo": "BAR", "nombre": "Best Available Rate", "reembolsable": true, "horasCancelacionSinCargo": 48 },
  "total": 50000,
  "cobradoAhora": 0,
  "garantia": { "tipo": "GARANTIA", "marca": "VISA", "ultimos4": "4242" },
  "habitaciones": [{ "tipo": "Doble", "adultos": 2, "menores": 0 }],
  "email": { "enviado": true }
}
```

- Plan reembolsable: `cobradoAhora = 0`, `garantia.tipo = "GARANTIA"`. La
  pantalla muestra "Confirmada · garantizada con tarjeta".
- Plan no reembolsable: `cobradoAhora = total`, `garantia.tipo = "PREPAGO"`. La
  pantalla muestra "Pagada".
- En la respuesta repetida por idempotencia (200), `garantia` puede ser `null`.
- Sin número de habitación. El código es el **código de confirmación del
  sistema** (el mismo que ve el mostrador): 8 caracteres hexadecimales en
  mayúsculas, por ejemplo `3FA9C21B`.

### Idempotencia

La clave de idempotencia evita que un doble clic, un F5 o un reintento creen
**dos reservas y dos cobros**.

1. **La clave se consume solo cuando la reserva se crea.** Un pedido que
   termina en error no "gasta" la clave en el servidor.
2. **"Mismos datos" se compara sin la tarjeta.** Se comparan fechas, plan,
   `totalEsperado`, habitaciones, huésped, llegada, solicitudes y
   consentimiento. Los datos de la tarjeta no se guardan, así que no pueden
   compararse.
3. **Misma clave + mismos datos** → `200` con la misma reserva (sin volver a
   cobrar; `garantia` puede venir `null`).
4. **Misma clave + datos distintos** → `409 CLAVE_REUTILIZADA`.

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

Consulta de una reserva con código + email. No hay cuentas de huésped.

**Request**

```json
{ "codigo": "3FA9C21B", "email": "demo@hotel.com" }
```

**Response 200**

```json
{
  "codigoConfirmacion": "3FA9C21B",
  "estado": "Confirmada",
  "fechaDesde": "2026-11-20",
  "fechaHasta": "2026-11-23",
  "noches": 3,
  "plan": { "codigo": "BAR", "nombre": "Best Available Rate", "reembolsable": true, "horasCancelacionSinCargo": 48 },
  "total": 75000,
  "cobrado": 0,
  "habitaciones": [{ "tipo": "Doble", "adultos": 2, "menores": 1 }],
  "titular": "Juan P.",
  "documento": "****222",
  "puedeCancelar": true,
  "penalidadCancelacion": {
    "aplica": true,
    "monto": 25000,
    "mensaje": "Ya pasó el plazo de cancelación sin cargo: se cobra la primera noche.",
    "limiteSinCargo": "2026-11-18T17:00:00.000Z"
  }
}
```

- `titular` y `documento` vienen enmascarados.
- `penalidadCancelacion` es `null` si `puedeCancelar` es `false`.
- El código no distingue mayúsculas. El email se compara (sin distinguir
  mayúsculas) con:
  - en una reserva **web**: `DatosReservaWeb.emailContacto`;
  - en una reserva **del mostrador**: `Huesped.contacto`, **solo si es un
    email**.
- Código o email incorrectos, o una reserva del mostrador cuyo contacto es un
  teléfono (no hay email con qué comparar) → `404 NO_ENCONTRADA`, **siempre
  con el mismo mensaje**: no se revela si el código existe.

## POST `/api/web/mi-reserva/cancelar`

**Request**

```json
{ "codigo": "3FA9C21B", "email": "demo@hotel.com", "montoPenalidadAceptado": 25000 }
```

**Response 200**

```json
{ "estado": "Cancelada", "penalidadCobrada": 25000 }
```

- `montoPenalidadAceptado` es el monto que el huésped vio y aceptó. Si al
  cancelar la penalidad es otra (por ejemplo, venció el plazo mientras
  miraba) → `409 PENALIDAD_CAMBIO` con `montoNuevo`.

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
| `NO_ENCONTRADA` | 404 | — | Mensaje genérico, sin revelar si el código existe. |
| `PRECIO_CAMBIADO` | 409 | `totalNuevo` | Muestra el total nuevo y pide confirmar de nuevo. |
| `SIN_DISPONIBILIDAD` | 409 | — | Solo cuando **no hay habitación libre** para la selección. Vuelve a resultados. |
| `CLAVE_REUTILIZADA` | 409 | — | Genera una clave nueva y reintenta. |
| `PENALIDAD_CAMBIO` | 409 | `montoNuevo` | Muestra el monto nuevo y pide aceptar de nuevo. |
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
`POST /api/web/reservas`, **todos obligatorios**:

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
| `nacionalidad` | ISO 3166-1 alfa-2 | código de `PAISES` |
| `paisResidencia` | ISO 3166-1 alfa-2 | código de `PAISES` |

- El frontend importa los catálogos de `frontend/src/lib/` (vía
  `ecommerce.constantes.js`); no hay listas propias del e-commerce.
- **Nacionalidad y país de residencia empiezan vacíos** en el formulario. Son
  datos de la ficha de registro de pasajeros y la residencia define la posible
  exención de IVA: un extranjero que no los toca no puede quedar como
  argentino residente. `paisDocumento` sí empieza en `AR`.
- La identidad de la persona es **tipo + país + número** del documento, con la
  misma normalización que el sistema (`persona.servicio.js → claveDocumento`).

## Cómo se procesa el pago (lo implementa la etapa 1B)

- **Plan reembolsable**: validación de la tarjeta con monto 0 y token
  (operación `GARANTIA`). No se cobra nada. El no-show se cobra después con el
  token.
- **Plan no reembolsable**: `PREAUTORIZACION` por el total → se crea la reserva
  → `CAPTURA`.
  - Si la reserva falla: `LIBERACION`.
  - Si la captura falla después de crear la reserva: se cancela la reserva con
    motivo "Pago no capturado" y se libera.
- La llamada a la pasarela va **fuera de la transacción de la base**.
- La **garantía** de un plan reembolsable **no es un pago**: no se registra en
  `PagoEstadia` (`consolidarCargos` la restaría del saldo en el check-out).
  Sus datos van en `DatosReservaWeb` (ver "Cómo funciona por dentro").
- Pasarela simulada con la firma de `procesarTarjeta` de la guía de Ricardo;
  cuando él la termine, se reemplaza.

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
| `4000000000000002` | Rechazada — fondos insuficientes |
| `4000000000000069` | Rechazada — tarjeta vencida |

### Tarjetas: aclaración importante

En un e-commerce real los datos de la tarjeta **no pasan por el servidor del
hotel**: los toma la pasarela (campos alojados en su dominio) y devuelve un
token. Acá pasan por el backend porque la pasarela es simulada. Aun así:

- el número y el CVV **nunca se guardan, nunca se loguean y nunca se devuelven**;
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
con qué comparar → `NO_ENCONTRADA` con el mensaje genérico. (Real en la
etapa 4; hoy, en el mock.)

---

## Para Tomás: qué cambió en Datos

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
   | `3FA9C21B` | `demo@hotel.com` | reserva **web** de ejemplo, cancelable con penalidad |
   | `B81D90E4` | `mostrador@hotel.com` | reserva **del mostrador** cuyo contacto es un email |
   | `7C04E5A2` | cualquiera | reserva del mostrador con **teléfono** como único contacto → siempre `NO_ENCONTRADA` |

   Cualquier otra combinación → `NO_ENCONTRADA` con el mismo mensaje.

5. **Tarjetas de prueba**: `4242424242424242` aprobada; terminadas en `0002`
   (`4000000000000002`) y `0069` (`4000000000000069`) rechazadas; un número que
   no pasa Luhn → `DATOS_INVALIDOS` (`campo: "tarjeta.numero"`); vencimiento
   anterior a la salida → `TARJETA_VENCE_ANTES`.
6. **Estilos**: solo clases `ec-` y variables de `.ec-raiz` (definidas en
   `ecommerce.css`). Nada de selectores de etiqueta sueltos ni `:root`. No
   reutilices los componentes de `frontend/src/componentes/` ni los de la web
   vieja.
7. **Prohibido commitear credenciales** (el repositorio es público). `.env.local`
   no se sube.
8. **No toques archivos fuera de `frontend/src/modulos/ecommerce/`** sin acordarlo.

---

## Limitaciones conocidas

- Pago simulado (no hay pasarela real).
- Sin servicios adicionales, facturación ni check-in online.
- Sin modificación web de la reserva (HU-105 postergada): el huésped cancela y
  vuelve a reservar, o contacta a recepción.
- La UI de esta entrega maneja una habitación por reserva web (los grupos
  reservan por recepción); el contrato ya acepta hasta 3 (selector de varias
  habitaciones: etapa 2).
- La web vieja (`/disponibilidad` y `/reservar`) se reemplaza en el cierre del
  proyecto, no ahora.
