# Cálculo de penalidades (HU-98) — contrato para el equipo de garantía y cancelaciones

> **Nota (2026-09-29):** este archivo vive en `docs/`, que está en `.gitignore` (ver el header de `docs/decisiones.md`) — es decir, **no se commitea ni lo ve el resto del equipo por git**. Si esta documentación tiene que llegarle al equipo de garantía de verdad, avisen y lo movemos a una carpeta trackeada (o lo pegamos en el canal/wiki que usen) — lo dejo acá por ahora porque el enunciado de la HU-98 lo pidió textualmente en esta ruta.

## Qué hace

`calcularPenalidad` (`backend/src/modulos/tarifas/penalidades.servicio.js`) calcula cuánto correspondería cobrar de penalidad por cancelar una reserva o por no-show, según su plan tarifario — **sin cobrar ni modificar nada**. Es de solo lectura.

**No está conectada a `cancelarReserva`** (`backend/src/modulos/reservas/reservas.servicio.js`): esa función sigue con su regla fija de 24hs (anula o no la seña completa), sin cambios. Conectar esta función ahí — o al proceso de no-show, que todavía no existe — es una decisión del equipo de garantía, no de esta etapa.

## Función

```js
const { calcularPenalidad } = require("./modulos/tarifas/penalidades.servicio");

const resultado = await calcularPenalidad({
  reservaId: 123,
  tipo: "CANCELACION", // o "NO_SHOW"
  momento: new Date(), // opcional, default: ahora
});
```

- `reservaId`: entero, obligatorio.
- `tipo`: `"CANCELACION"` o `"NO_SHOW"`.
- `momento`: instante de la cancelación/no-show. Default: `new Date()`. Para simular "qué hubiera pasado si canceló hace 2 días", pasar esa fecha.
- `cliente` (segundo argumento posicional, opcional): cliente/tx de Prisma, default el `prisma` global — para usarla dentro de una transacción ya abierta (mismo patrón que el resto del proyecto).

**Solo funciona para reservas en estado `Confirmada`.** Para `En curso`, `Cerrada` o `Cancelada` tira un `ErrorDeNegocio` (ver más abajo) — una vez que hubo check-in, la reserva ya no está en la ventana de "cancelación/no-show pendiente".

### Respuesta

```ts
{
  aplica: boolean,       // false solo en "sin cargo"
  monto: number,
  tipo: "CANCELACION" | "NO_SHOW",
  regla: "SIN_CARGO" | "PRIMERA_NOCHE" | "TOTAL_NO_REEMBOLSABLE" | "TOTAL_ESTADIA",
  mensaje: string,       // texto listo para mostrar
  limiteSinCargo: Date | null, // solo tiene valor en CANCELACION + plan reembolsable
  detallePorHabitacion: [{ habitacionId, numero, primeraNoche }],
}
```

`monto` sale siempre de las noches YA CONGELADAS. **Corrección de negocio (2026-09-30):** un ajuste manual de precio (HU-97 — cortesía o descuento) es una concesión condicionada a que la estadía ocurra de verdad; no reduce lo que correspondería cobrar si el huésped cancela fuera de plazo o no se presenta. Por eso, para cada noche, el cálculo usa `precioOriginal` (el precio de ANTES del ajuste manual) si la noche está `ajustada`, y `precioNoche` tal cual si no lo está — ver `montoPenalizable()` en `penalidades.servicio.js`, el único punto que lee el precio de una noche para este cálculo. Aplica igual a la primera noche (`detallePorHabitacion[].primeraNoche`) que al total de la estadía.

### Errores (`ErrorDeNegocio`, `statusCode` incluido)

- Reserva inexistente → 404.
- Reserva sin plan tarifario (no debería pasar después de la migración de la Etapa 4A) → 400.
- Reserva que no está `Confirmada` → 400, mensaje nombra el estado actual.
- `tipo` inválido → 400.

## Reglas aplicadas

| Tipo | Plan | Condición | Resultado |
|---|---|---|---|
| CANCELACION | Reembolsable | `momento` ≤ `limiteSinCargo` | Sin cargo (`monto: 0`) |
| CANCELACION | Reembolsable | `momento` > `limiteSinCargo` | Primera noche |
| CANCELACION | No reembolsable | cualquier momento | Total de la estadía |
| NO_SHOW | cualquiera | `plan.penalidadNoShow === "PRIMERA_NOCHE"` | Primera noche |
| NO_SHOW | cualquiera | `plan.penalidadNoShow === "TOTAL_ESTADIA"` | Total de la estadía |

`limiteSinCargo` = fecha de llegada a la hora de check-in (`HORA_CHECKIN`, `tarifas.constantes.js`, hoy 14:00 hora Argentina) **menos** `plan.horasCancelacionSinCargo`.

**Primera noche** de una reserva de varias habitaciones = la suma de la primera noche (fecha más temprana) de CADA habitación, no solo de una.

## Endpoint

```
GET /api/reservas/:id/penalidad?tipo=CANCELACION|NO_SHOW
```

`momento` siempre es "ahora" desde el endpoint (no se puede pasar por query). Visible para recepcionista, gerente y admin — sin restricción de rol en el backend (es de solo lectura, no cobra ni modifica nada).

## Ejemplos de respuesta (verificados en `sgh_gimena`, 2026-09-30, con la corrección de `precioOriginal`)

`GET /api/reservas/96/penalidad?tipo=CANCELACION` — reserva BAR (54FFB3CC), "ahora" muy anterior al límite:

```json
{
  "aplica": false,
  "monto": 0,
  "tipo": "CANCELACION",
  "regla": "SIN_CARGO",
  "mensaje": "Cancelación sin cargo.",
  "limiteSinCargo": "2027-09-08T17:00:00.000Z",
  "detallePorHabitacion": [{ "habitacionId": 12, "numero": "270", "primeraNoche": 60500 }]
}
```

`GET /api/reservas/96/penalidad?tipo=NO_SHOW` — misma reserva BAR:

```json
{
  "aplica": true,
  "monto": 60500,
  "tipo": "NO_SHOW",
  "regla": "PRIMERA_NOCHE",
  "mensaje": "No-show: se cobra la primera noche.",
  "limiteSinCargo": null,
  "detallePorHabitacion": [{ "habitacionId": 12, "numero": "270", "primeraNoche": 60500 }]
}
```

La primera noche de esta reserva (10/9) tiene un ajuste manual de HU-97 (cortesía, quedó en `precioNoche: 0`) — el `monto`/`primeraNoche` de la penalidad da **$60.500**, el `precioOriginal` de antes del ajuste, no el `precioNoche` ya rebajado (antes de esta corrección daba `0`, que era incorrecto: dejaba sin efecto una penalidad real por aprovechar una cortesía condicionada a la estadía). La NO_SHOW y la CANCELACION fuera de plazo de una reserva BAR usan la misma regla de "primera noche", por eso dan el mismo monto acá.

`GET /api/reservas/93/penalidad?tipo=CANCELACION` — reserva NRF (EB084BE6, no reembolsable, $365.600, sin ningún ajuste manual — sin cambios respecto de antes de la corrección):

```json
{
  "aplica": true,
  "monto": 365600,
  "tipo": "CANCELACION",
  "regla": "TOTAL_NO_REEMBOLSABLE",
  "mensaje": "Tarifa no reembolsable.",
  "limiteSinCargo": null,
  "detallePorHabitacion": [{ "habitacionId": 16, "numero": "180", "primeraNoche": 46800 }]
}
```

`GET /api/reservas/93/penalidad?tipo=NO_SHOW` — misma reserva NRF (`penalidadNoShow: "TOTAL_ESTADIA"`):

```json
{
  "aplica": true,
  "monto": 365600,
  "tipo": "NO_SHOW",
  "regla": "TOTAL_ESTADIA",
  "mensaje": "No-show: se cobra la estadía completa.",
  "limiteSinCargo": null,
  "detallePorHabitacion": [{ "habitacionId": 16, "numero": "180", "primeraNoche": 46800 }]
}
```
