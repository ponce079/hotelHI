# Contrato de la API del e-commerce (`/api/web`)

> **Contrato v1 — la implementación real llega en la etapa 1B. Cambios al contrato: solo Gimena.**

Este documento es la fuente de verdad entre el frontend del motor de reservas
web (`frontend/src/modulos/ecommerce/`) y el backend que se construye en la
etapa 1B. Mientras la 1B no exista, el frontend trabaja contra un mock
(`ecommerce.mock.js`) que responde con **exactamente** estas formas.

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
  de habitaciones libres.

### Plan (forma común)

Cada vez que aparece un plan, tiene estos campos:

```json
{
  "planTarifarioId": 1,
  "codigo": "BAR",
  "nombre": "Tarifa estándar",
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
- El texto de condiciones **lo arma el frontend** (`formato.js →
  textoCondicionesPlan`), no viene del backend:
  - reembolsable: "Tarifa flexible · Cancelación sin cargo hasta X h antes de la llegada";
  - no reembolsable: "No reembolsable · Se cobra el total al reservar · Sin devolución".

---

## GET `/api/web/tipos`

Catálogo de tipos vendibles en la web (activos, con al menos una habitación).
No trae precios: el precio aparece recién después de buscar fechas.

**Response 200**

```json
{
  "tipos": [
    { "tipoHabitacionId": 1, "nombre": "Simple", "capacidadMaxima": 2 },
    { "tipoHabitacionId": 2, "nombre": "Doble", "capacidadMaxima": 4 }
  ]
}
```

- `capacidadMaxima`: `TipoHabitacion` no tiene ese campo; la 1B lo calcula
  como el máximo de `Habitacion.capacidad` entre las habitaciones activas del tipo.

---

## GET `/api/web/disponibilidad?fechaDesde&fechaHasta&adultos&menores`

Ejemplo: `GET /api/web/disponibilidad?fechaDesde=2026-10-16&fechaHasta=2026-10-18&adultos=2&menores=0`

`adultos` y `menores` son la ocupación **de una habitación**. (Cuando la UI
maneje varias habitaciones —etapa 2— se consulta una vez por línea o se
extiende este endpoint; el cambio lo define Gimena.)

**Response 200**

```json
{
  "fechaDesde": "2026-10-16",
  "fechaHasta": "2026-10-18",
  "noches": 2,
  "tipos": [
    {
      "tipoHabitacionId": 1,
      "nombre": "Simple",
      "capacidadMaxima": 2,
      "ultimasDisponibles": false,
      "desdePorNoche": 17000,
      "planes": [
        {
          "planTarifarioId": 1, "codigo": "BAR", "nombre": "Tarifa estándar",
          "reembolsable": true, "horasCancelacionSinCargo": 48,
          "penalidadNoShow": "PRIMERA_NOCHE", "total": 40000, "promedioPorNoche": 20000
        },
        {
          "planTarifarioId": 2, "codigo": "NRF", "nombre": "Tarifa no reembolsable",
          "reembolsable": false, "horasCancelacionSinCargo": null,
          "penalidadNoShow": "TOTAL_ESTADIA", "total": 34000, "promedioPorNoche": 17000
        }
      ],
      "motivoNoDisponible": null
    },
    {
      "tipoHabitacionId": 2,
      "nombre": "Doble",
      "capacidadMaxima": 4,
      "ultimasDisponibles": true,
      "desdePorNoche": null,
      "planes": [],
      "motivoNoDisponible": "Sin disponibilidad para estas fechas"
    }
  ]
}
```

Reglas:

- **Todos los tipos vendibles aparecen siempre.** Un tipo que no se puede
  reservar aparece con `planes: []`, `desdePorNoche: null` y un
  `motivoNoDisponible` para el huésped. La tarjeta del tipo se muestra
  deshabilitada con ese texto. Motivos:
  - sin habitaciones libres: `"Sin disponibilidad para estas fechas"`;
  - la ocupación supera la capacidad: `"Admite hasta N personas"` (N = `capacidadMaxima`);
  - restricciones tarifarias (estadía mínima, cierre a llegadas): texto
    descriptivo, por ejemplo `"Estadía mínima de 3 noches"` o
    `"No se aceptan llegadas en esta fecha"`.
- `ultimasDisponibles` es **booleano**: `true` si quedan 2 o menos
  habitaciones libres del tipo. Nunca se informa la cantidad.
- `desdePorNoche`: el menor `promedioPorNoche` entre los planes del tipo
  (`null` si `planes` está vacío).
- Sin números ni ids de habitación.

---

## POST `/api/web/cotizar`

Recotiza una selección concreta (por ejemplo, antes de pagar).

**Request**

```json
{
  "fechaDesde": "2026-10-16",
  "fechaHasta": "2026-10-18",
  "planTarifarioId": 2,
  "habitaciones": [{ "tipoHabitacionId": 2, "adultos": 2, "menores": 0 }]
}
```

**Response 200**

```json
{
  "total": 42500,
  "promedioPorNoche": 21250,
  "noches": 2,
  "plan": {
    "planTarifarioId": 2, "codigo": "NRF", "nombre": "Tarifa no reembolsable",
    "reembolsable": false, "horasCancelacionSinCargo": null,
    "penalidadNoShow": "TOTAL_ESTADIA", "total": 42500, "promedioPorNoche": 21250
  },
  "habitaciones": [{ "tipo": "Doble", "adultos": 2, "menores": 0, "subtotal": 42500 }]
}
```

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
    "nombre": "María",
    "apellido": "González",
    "tipoDocumento": "DNI",
    "numeroDocumento": "30111222",
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
- `huesped`: todos obligatorios. `email` con formato válido. `telefono` obligatorio.
- `llegada.horaEstimada`: `NO_SABE` | `14-16` | `16-18` | `18-20` | `20-22` | `DESPUES_22`.
- `solicitudesEspeciales`: opcional, máx. 500 caracteres (`""` o `null` si no hay).
- `consentimiento.aceptaPoliticas` tiene que ser `true`, y `versionPoliticas`
  la vigente (`"2026-10-01"`). `aceptaComunicaciones` es opcional (default `false`).
- `tarjeta`: Luhn válido, vencimiento posterior a `fechaHasta`, CVV de 3 o 4 dígitos.

**Response 201** (o **200** si la clave ya existía con los mismos datos)

```json
{
  "codigoConfirmacion": "HI7K2Q9M",
  "estado": "Confirmada",
  "fechaDesde": "2026-10-16",
  "fechaHasta": "2026-10-18",
  "noches": 2,
  "plan": { "codigo": "BAR", "nombre": "Tarifa estándar", "reembolsable": true, "horasCancelacionSinCargo": 48 },
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
- Sin número de habitación. El código es el que devuelve la API.

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
{ "codigo": "DEMO1234", "email": "demo@hotel.com" }
```

**Response 200**

```json
{
  "codigoConfirmacion": "DEMO1234",
  "estado": "Confirmada",
  "fechaDesde": "2026-11-20",
  "fechaHasta": "2026-11-23",
  "noches": 3,
  "plan": { "codigo": "BAR", "nombre": "Tarifa estándar", "reembolsable": true, "horasCancelacionSinCargo": 48 },
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
- Código o email incorrectos → `404 NO_ENCONTRADA`, **siempre con el mismo
  mensaje**: no se revela si el código existe.

## POST `/api/web/mi-reserva/cancelar`

**Request**

```json
{ "codigo": "DEMO1234", "email": "demo@hotel.com", "montoPenalidadAceptado": 25000 }
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
| `SIN_DISPONIBILIDAD` | 409 | — | Vuelve a resultados. |
| `CLAVE_REUTILIZADA` | 409 | — | Genera una clave nueva y reintenta. |
| `PENALIDAD_CAMBIO` | 409 | `montoNuevo` | Muestra el monto nuevo y pide aceptar de nuevo. |
| `PAGO_RECHAZADO` | 402 | `motivo` | Pide otra tarjeta. |
| `TARJETA_VENCE_ANTES` | 422 | — | Pide otra tarjeta. |
| `DEMASIADOS_INTENTOS` | 429 | — | Pide que espere unos minutos. |
| `ERROR_INTERNO` | 500 | — | Mensaje genérico. |
| `ERROR_RED` | — | — | **Solo del frontend**: no hubo respuesta (sin conexión o timeout). Mensaje genérico; se reintenta con la misma clave. |

---

## Valores de documento, nacionalidad y país

- **Tipo de documento**: los mismos valores que la ficha de huésped del
  sistema, `TIPOS_DOCUMENTO` en
  `frontend/src/modulos/reservas/reservas.constantes.js` (DNI, Pasaporte,
  Cédula de identidad, Libreta cívica, Libreta de enrolamiento). El
  e-commerce los importa de ahí, no los copia.
- **Nacionalidad y país de residencia**: códigos **ISO 3166-1 alfa-2**
  (`"AR"`, `"BR"`, `"CL"`…), lista `PAISES` en
  `frontend/src/modulos/ecommerce/ecommerce.constantes.js` — **a confirmar
  con Agustín**. Es el mismo formato que usa su rama
  `feature/estadia-ocupantes` (`PAISES_OCUPANTES` en
  `frontend/src/modulos/estadia/ocupantesUbicacion.js`).
- Son datos de la persona. Propuesta: columnas en `Huesped`, coordinado con
  Agustín (su rama los tiene en `OcupanteReserva`). Hasta que estén en
  master, la 1B guarda lo declarado en `DatosReservaWeb`. La web no pisa una
  ficha existente.

---

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

## Reservas web = reservas normales

Se crean como `Reserva` con origen WEB y sus `ReservaNoche` (las ven el
mostrador, el check-in y el check-out). Los datos propios de la web (email,
teléfono, llegada estimada, solicitudes, consentimiento, nacionalidad y país
declarados) van en una tabla complementaria 1 a 1 (`DatosReservaWeb`), que se
crea en la 1B.

**Canal de la reserva**: lo decide la 1B: columna explícita en `Reserva`
(`RECEPCION` | `WEB` | `WALK_IN`, aditiva, con default `RECEPCION`) para
reportes, o deducirlo de `DatosReservaWeb`. En esta etapa no se toca el backend.

La habitación concreta se asigna automáticamente dentro de la misma
transacción que crea la reserva (HU-100); el huésped nunca la ve.

---

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

   y reiniciá `npm run dev`. Para forzar errores, agregá a la URL de la página
   `?mockEscenario=...` y recargá (el proceso de compra sobrevive al F5):

   | Escenario | Efecto en el mock |
   |---|---|
   | `PRECIO_CAMBIADO` | `crearReserva` → 409 con `totalNuevo` (+10 %), hasta que se reintenta con `totalEsperado = totalNuevo` |
   | `SIN_DISPONIBILIDAD` | En resultados, Simple aparece "Sin disponibilidad para estas fechas"; `crearReserva` → 409 |
   | `CLAVE_REUTILIZADA` | `crearReserva` → 409 con la primera clave; con una clave nueva funciona |
   | `ERROR_INTERNO` | Todas las llamadas de esa página → 500 |
   | `DEMASIADOS_INTENTOS` | Todas las llamadas de esa página → 429 |

   Mi reserva en el mock: código `DEMO1234` + email `demo@hotel.com` →
   reserva de ejemplo cancelable con penalidad; cualquier otra combinación →
   `NO_ENCONTRADA`.

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
