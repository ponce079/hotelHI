# Integración garantía/tarifas — para Ricardo

> Este documento es para quien reemplace la seña (HU-88) y la garantía de check-in (HU-46) por garantía con tarjeta. Describe qué le da el módulo de tarifas (Etapas 1 a 4C) para trabajar, dónde está hoy la lógica que vas a tocar, y qué cambió en esta etapa que te afecta directamente.

## 1. Qué te da tarifas

### `ReservaNoche` — única fuente de precio

Cada noche de cada habitación de una reserva tiene una fila en `ReservaNoche` (`backend/prisma/schema.prisma`), con el precio ya congelado al confirmar (HU-96):

```prisma
model ReservaNoche {
  id                  Int
  reservaHabitacionId Int
  fecha               DateTime
  temporadaId         Int?
  tarifaId            Int?
  planTarifarioId     Int
  precioNoche         Decimal   // el precio final de ESA noche, ya congelado
  origen              String    // MOTOR | MIGRACION
  precioOriginal      Decimal?  // solo si ajustada=true (HU-97)
  ajustada            Boolean
  motivoAjuste        String?
  ajustadoPor         String?
  ajustadoEn          DateTime?
}
```

**Nunca calcules un importe de alojamiento vos mismo.** El total de una reserva (o de una habitación dentro de ella) es siempre la suma de `ReservaNoche.precioNoche` — ver `consolidarCargos` en `backend/src/modulos/check-out/checkOut.servicio.js` para el patrón exacto a reusar.

### Plan de la reserva

`Reserva.planTarifarioId` (obligatorio desde la Etapa 4C) apunta a un `PlanTarifario` con los campos que te importan para cancelación/no-show:

```prisma
model PlanTarifario {
  reembolsable             Boolean  // true = BAR y similares, false = NRF y derivados
  horasCancelacionSinCargo Int?     // solo si reembolsable=true
  penalidadNoShow          String   // PRIMERA_NOCHE | TOTAL_ESTADIA
}
```

### `calcularPenalidad` — el cálculo ya está hecho

`backend/src/modulos/tarifas/penalidades.servicio.js`:

```js
const { calcularPenalidad } = require("../tarifas/penalidades.servicio");

const resultado = await calcularPenalidad({
  reservaId: 123,
  tipo: "CANCELACION", // o "NO_SHOW"
  momento: new Date(), // opcional, default ahora
});
// { aplica, monto, tipo, regla, mensaje, limiteSinCargo, detallePorHabitacion }
```

Contrato completo con ejemplos de respuesta reales: `docs/penalidades.md`. Endpoint ya expuesto: `GET /api/reservas/:id/penalidad?tipo=CANCELACION|NO_SHOW` (sin restricción de rol, de solo lectura).

**Regla importante que ya está resuelta ahí adentro**: si una noche tiene un ajuste manual de precio (HU-97, cortesía o descuento del gerente), la penalidad usa `precioOriginal` (el precio de ANTES del ajuste), no el `precioNoche` ya rebajado — una cortesía es una concesión condicionada a que la estadía ocurra, no reduce lo que corresponde cobrar si se cancela o no se presenta. No reimplementes esta regla en tu código: llamá a `calcularPenalidad` y listo.

**Lo que `calcularPenalidad` NO hace**: no cobra, no anula, no modifica nada. Es una función pura de solo lectura — armar el flujo real de cancelación/no-show con esto es tu trabajo.

## 2. Dónde está hoy la lógica que vas a reemplazar

- **Seña (HU-88)**: `crearReservaConSena` en `backend/src/modulos/reservas/reservas.servicio.js` (línea ~1025) — crea la reserva y un `PagoEstadia` con `concepto: "Seña"` en una sola transacción, delegando en `pagoEstadiaServicio.crearPagoEnTransaccion`. El monto (20% del total) lo calcula el FRONTEND en `frontend/src/modulos/reservas/ReservaWizard.jsx` (`PORCENTAJE_SENIA_RESERVA`, `reservas.constantes.js`) — el backend solo valida que no supere el saldo, no exige ningún mínimo. Es exclusiva del alta por mostrador (`origen === "RECEPCION"`), la web nunca cobra seña.
- **Cancelación (HU-37)**: `cancelarReserva`, mismo archivo (línea ~1642) — regla FIJA de 24hs: si faltan ≥24hs para `fechaDesde`, anula (`anularPago`) todos los `PagoEstadia` activos de la reserva; si no, no anula nada. **No usa `calcularPenalidad` ni lee el plan de la reserva para nada** — es el reemplazo que tenés que hacer vos, con la política real por plan.
- **`consolidarCargos`** (`checkOut.servicio.js`, línea ~71): ya suma `ReservaNoche.precioNoche` para el alojamiento; el saldo lo calcula restando `PagoEstadiaMedio` de TODOS los `PagoEstadia` no anulados, sin distinguir `concepto` (una seña y una garantía reducen el saldo exactamente igual hoy). Si tu diseño de garantía con tarjeta necesita un tratamiento distinto (por ejemplo, que la garantía NO reduzca el saldo de alojamiento sino que quede aparte hasta el check-out), es un cambio en esta función — avisá antes de tocarla, la usan check-out, comprobantes y la pantalla de Movimientos de Pago.
- **Garantía de check-in (HU-46)**: `registrarGarantia` en `backend/src/modulos/check-in/checkIn.servicio.js` (línea ~175) — monto FIJO (`MONTO_GARANTIA = 30000`, `checkIn.constantes.js`), crea un `PagoEstadia` con `concepto: "Garantía"` directo (bypasea `crearPago`, porque no es un pago contra el saldo de alojamiento). Se llama después del check-in (con o sin reserva previa) y también en walk-in.
- **Paso del wizard**: la seña se pide en el Paso 5 de `ReservaWizard.jsx` (buscar `SEÑA REQUERIDA`), solo en alta por mostrador. La garantía de check-in tiene su propio componente, `frontend/src/modulos/check-in/GarantiaFieldset.jsx`, reusado tanto por `CheckInConReserva.jsx` como por `CheckInWalkIn.jsx`.

## 3. Lógica recomendada (no implementada, es tu diseño)

- **Garantía con tarjeta al reservar**: titular, marca, últimos 4 dígitos, vencimiento posterior a la fecha de llegada, token simulado — **nunca** el número completo ni el CVV (PCI-DSS). Mismo criterio que ya usa `frontend/src/modulos/pagos-estadia/TarjetaSimuladaPanel.jsx` para la garantía de check-in actual: terminal simulada, sin integración real con una pasarela, pero sin guardar datos sensibles ni en el front ni en el back.
- **BAR (reembolsable) sin cobro al reservar** — la garantía con tarjeta queda autorizada/tokenizada pero no se cobra nada hasta que corresponda (cancelación fuera de plazo, no-show, o el check-out normal).
- **NRF (no reembolsable) con cobro del total al confirmar** — coherente con que hoy NRF se vende sin cobro anticipado real (ver `docs/revision-estadia-ocupantes.md` y las notas de auditoría de HU-96 en el backlog: "las reservas NRF hoy se venden sin cobro anticipado... el equipo tiene que definir cómo lo resuelve" — este es exactamente ese punto).
- **Cancelación vía `calcularPenalidad`** — reemplaza la regla fija de 24hs de `cancelarReserva` por: `calcularPenalidad({reservaId, tipo:"CANCELACION"})`, cobrar `resultado.monto` de la garantía si `resultado.aplica`, liberar el resto. El prepago NRF no se devuelve (ya está cobrado el total, `calcularPenalidad` para NRF siempre da el total completo).
- **Estado No-show (nuevo)**: hoy no existe — `Reserva.estado` es `Confirmada | En curso | Cerrada | Cancelada` (`reservas.constantes.js:ESTADO_RESERVA`). Vas a necesitar sumar `"No-show"` ahí (y a la lista de estados válidos), más una pantalla/proceso que liste las llegadas de hoy no presentadas (mismo criterio que ya usa `listarLlegadasPendientes`, `reservas.api.js` del frontend, pero filtrando lo opuesto: `fechaDesde` ya pasó y la reserva sigue `Confirmada`). Al marcar una reserva como No-show: `calcularPenalidad({reservaId, tipo:"NO_SHOW"})`, cobrar de la garantía, y liberar el resto de la estadía (las noches que no se van a usar no deberían seguir bloqueando la habitación — mismo espíritu que `ESTADOS_QUE_OCUPAN` en `reservas.constantes.js`, que ya excluye `Cancelada`; No-show debería excluirse también).
- **Garantía de check-in como preautorización para consumos**: liberada si no hubo incidentes, o aplicada al saldo en el check-out si hubo cargos de verificación (daños, faltantes, HU-87) que la seña/garantía de reserva no cubre. Esto reemplaza el `registrarGarantia` actual de monto fijo por una preautorización real con la tarjeta.
- **Walk-in sin garantía de reserva, pero con preautorización**: como walk-in no pasa por `crearReservaConSena` (nunca tuvo seña), la única garantía sigue siendo la de check-in — ahí sí aplica la preautorización con tarjeta en vez del monto fijo actual.

## 4. Cambios que te afectan (Etapa 4C)

1. **`consolidarCargos` renombró `tarifaPorNoche` a `promedioPorNoche`** en la respuesta (`checkOut.servicio.js`, dentro de `habitaciones[]`) — es un promedio informativo (`subtotal / noches`), nunca fue la columna de la habitación. Lo consume `frontend/src/modulos/check-out/CheckOutReservaPage.jsx` (columna "Por noche" de la tabla de check-out). Si tu trabajo también lee esa respuesta, actualizá la clave.
2. **`Habitacion.tarifaPorNoche` ya no existe** (columna eliminada del schema y de todo el código — grep completo hecho, cero referencias fuera de un script histórico). Si tu diseño de garantía necesitaba un "precio de la habitación" independiente de la reserva, no está más — el precio siempre sale de `ReservaNoche`/el motor de cotización, nunca de la habitación en sí.
3. **El seed de demostración (`backend/scripts/seed-demo-salta.js`) no usa seña** — crea las reservas de ejemplo con `crearReserva`/`cotizarParaReserva` (alta normal), nunca con `crearReservaConSena`. Si reemplazás la seña por completo, este seed sigue funcionando sin cambios (ya no dependía de ella).
4. **Los 3 fixtures con el typo `"Tarjeta de crédito"`** (falta corregir, no se tocaron porque son tuyos): `backend/scripts/pruebas-integracion-mantenimiento-checkout.js:77`, `backend/scripts/pruebas-checkout-facturacion.js:75` y `backend/scripts/pruebas-senia-reserva.js` (~línea 221) — el valor válido es `"Tarjeta crédito"` (sin "de"), y a los tres además les falta `referenciaGarantia` (ej. `"VISA •••• 4242 - AUT123456"`), exigida por `validarGarantia` para medios con tarjeta. Corregidos, buena parte de esos scripts probablemente pasan a estar más cerca de reflejar tu propio rediseño — revisalos vos antes de tocar la garantía, capaz cambian igual.

## 5. Lo que NO se conecta todavía

Nada de esto (HU-97 ajuste manual, HU-98 penalidades) está conectado a `cancelarReserva` ni a ningún proceso de no-show — es a propósito, para no tocar tu módulo sin coordinar. Cuándo y cómo conectarlo es tu decisión de diseño.
