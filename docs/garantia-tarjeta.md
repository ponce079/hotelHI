# Garantía con tarjeta de crédito — contrato y estado

Rama `feature/garantia-tarjeta` (Ricardo). Reemplaza la seña del 20 % y la garantía fija de check-in.

## Funciones públicas (las usa el e-commerce desde un adaptador)

Ambas viven en `backend/src/modulos/garantias/`.

```js
// pasarela.servicio.js — pasarela SIMULADA
procesarTarjeta({ operacion, monto, tarjeta, referenciaPrevia, claveIdempotencia })
  // operacion: 'GARANTIA' | 'COBRO' | 'PREAUTORIZACION' | 'CAPTURA' | 'LIBERACION'
  // → { aprobado, referencia, token, marca, ultimos4, motivoRechazo }

// garantias.servicio.js
registrarGarantiaEnTransaccion(tx, { reservaId, tipo, token, marca, ultimos4, vencimiento, referencia, monto, estado })
  // tipo: TARJETA | PREPAGO | NO_GARANTIZADA · estado: Vigente | Preautorizada | Capturada | Liberada
  // vencimiento: "MM/AA"
```

### Una aclaración al contrato (a confirmar con Gimena)

Para cobrar una penalidad meses después no se tiene el número de tarjeta, solo el token. Por eso
`COBRO` y `PREAUTORIZACION` aceptan, en lugar de `tarjeta`, `referenciaPrevia` = **token** de una
`GARANTIA` anterior. `CAPTURA` y `LIBERACION` usan `referenciaPrevia` = referencia (`PRE-nnnnnn`) de
la preautorización.

### Reglas

- El número y el CVV se validan y se **descartan**: no se guardan, no se devuelven, no se loguean.
  De la tarjeta solo queda token, marca, últimos 4 y vencimiento.
- La pasarela **nunca** se llama dentro de una transacción de base de datos.
- `claveIdempotencia`: la misma clave con la misma operación devuelve el resultado ya calculado
  (un reintento no cobra dos veces). Es una caché en memoria; una pasarela real la persistiría.
- Tarjetas de prueba: terminación `0002` → fondos insuficientes · `0069` → vencida · cualquier otra
  que pase Luhn y no esté vencida → aprobada (ej. `4242 4242 4242 4242`).

## Alta de reserva: `POST /api/reservas/con-garantia`

Body: el mismo de una reserva (`fechaDesde`, `fechaHasta`, `habitaciones`, `planTarifarioId`,
`totalEsperado`, `huesped`, `canalConfirmacion`) más:

```jsonc
"garantia": { "tipo": "TARJETA", "tarjeta": { "titular", "numero", "vencimientoMes", "vencimientoAnio", "cvv" } },
// o
"garantia": { "tipo": "PREPAGO", "medios": [{ "tipo": "Transferencia|Tarjeta débito|Online", "importe": 90000, "referencia": "..." }] },
"claveIdempotencia": "uuid-por-intento"   // opcional
```

| Plan | Con tarjeta | Con prepago |
|---|---|---|
| BAR (reembolsable) | Se tokeniza, **no se cobra**. Garantía `Vigente`. | Importe > 0 y ≤ total. |
| NRF (no reembolsable) | Preautoriza el total → crea la reserva → captura (o libera si falló). Si rechaza, **no se crea la reserva**. | Solo por el **total**. |

- Si la transacción de guardado vence (base compartida lenta), responde **408** con `codigo: "RESERVA_TIEMPO_AGOTADO"`,
  igual que el alta con seña: no se creó nada, la retención de la tarjeta se libera y el wizard ofrece actualizar la
  disponibilidad y reintentar.
- La tarjeta tiene que vencer **después** de la salida (vence el último día de su mes).
- El precio nunca se calcula acá: lo valida `crearReservaEnTransaccion` contra la cotización
  (`ReservaNoche`); si cambió, 409 y se libera la preautorización.
- Si la **captura** falla después de crear la reserva, la reserva se **cancela** con motivo y se
  libera la retención: toda reserva NRF existente está paga.

## Cancelación y no-show (etapa 3)

El **monto** lo calcula siempre tarifas (`calcularPenalidad`); este módulo solo decide cómo se cobra.
Código: `garantias/cierreReserva.servicio.js`.

Reparto del dinero (en centavos enteros):

1. Se descuenta lo que el huésped **ya pagó** (prepago, NRF capturado): la penalidad se retiene de ahí y se devuelve el resto.
2. NRF ya pagado: se retiene todo, no se cobra nada más y **no se devuelve** nada.
3. Lo que falte se cobra a la **tarjeta de la garantía** (`COBRO` por token, sin el número).
4. Sin tarjeta, o si la tarjeta rechaza: la reserva **se cancela igual** y la deuda queda marcada
   (`GarantiaReserva.estado = "Cobro pendiente"` / `"Cobro rechazado"`). El huésped tiene derecho a cancelar.

Orden (la pasarela nunca va dentro de una transacción):
1) tx corta: cancelar con guarda de estado + devolución + garantía en "Cobro pendiente" → 2) cobro en la pasarela →
3) tx corta: registrar el cargo y la garantía "Capturada". Una caída entre pasos deja la reserva cancelada y la
deuda visible, nunca un cobro sin registro.

Convención de la **devolución**: `PagoEstadia` con concepto `Devolución` e importe **negativo**. `consolidarCargos`
suma todos los medios sin mirar el concepto, así el "total pagado" de una reserva cancelada es exactamente lo que
el hotel se quedó (pagado − devuelto). La devolución es un asiento: el dinero se acredita aparte, a mano.

| Endpoint | Para qué | Quién |
|---|---|---|
| `POST /api/reservas/:id/cancelar` | Cancela y cobra la penalidad. Devuelve la reserva + `penalidad` | admin, recepcionista (**ahora exige sesión**) |
| `GET /api/reservas/:id/cierre-previo?tipo=CANCELACION\|NO_SHOW` | Vista previa (misma liquidación, no escribe) | admin, recepcionista |
| `GET /api/reservas/no-show-pendientes` | Confirmadas con llegada anterior a hoy | admin, recepcionista |
| `POST /api/reservas/:id/no-show` | Marca No-show y cobra la penalidad | admin, recepcionista |

Estado nuevo **No-show**: no está en `ESTADOS_QUE_OCUPAN`, así que libera las habitaciones igual que Cancelada.
Frontend: `/reservas/no-show` (Llegadas no presentadas) y el aviso de penalidad en los diálogos de cancelación.

## Garantía del check-in (etapa 4)

**Qué cambia.** Antes, al confirmar el check-in se registraba un pago "Garantía" de $30.000. `consolidarCargos`
suma todos los pagos, así que esos $30.000 se restaban del saldo como si el huésped los hubiera pagado, y nunca se
liberaban ni se devolvían. Ahora la garantía **no es un pago**: vive en su propia tabla (`garantias_estadia`) y no
cuenta en lo pagado.

| Medio | Qué es | Detalle |
|---|---|---|
| Tarjeta de crédito | **Preautorización** (retiene, no cobra) | Si la reserva dejó una tarjeta en garantía, se preautoriza **por token**, sin volver a pedirla. Sin tarjeta guardada (walk-in o prepago) se piden los datos una vez. |
| Efectivo | **Depósito** en custodia | No toca la pasarela. |

Débito y transferencia **ya no se ofrecen**: con débito el dinero sale de la cuenta del huésped y no se puede retener, y la
transferencia no está entre los medios previstos. El monto es fijo (`MONTO_PREAUTORIZACION_CHECKIN`, $30.000, server-side).

Orden: la pasarela se llama **antes** del check-in (si la tarjeta se rechaza, no hay check-in; 402) y nunca dentro de
una transacción. Si el check-in falla después de preautorizar, se libera la retención; si no se puede guardar la
garantía, también. Estados de `GarantiaEstadia`: Pendiente → (Capturada | Liberada | Aplicada | Devuelta) en el check-out.

Endpoint nuevo: `GET /api/reservas/:id/garantia` (admin, recepcionista) → `{ reserva, estadia }` sin token. Lo usa el
check-in para saber si hay tarjeta guardada.

Qué pasa con ella en el check-out: ver la sección siguiente (etapa 5).

## Garantía en el check-out (etapa 5)

Código: `garantias/garantiaEstadiaCheckOut.servicio.js`. Pantalla: tarjeta "Garantía del check-in" en el paso 3 del
check-out (`GarantiaCheckOut.jsx`).

- **Usarla para cubrir saldo** (`POST /api/reservas/:id/garantia/aplicar`): preautorización → se **captura solo el saldo**
  (captura parcial: lo que sobra de la retención se libera solo) y se registra como pago final con tarjeta; depósito
  en efectivo → se **aplica** como pago final en efectivo. Una sola vez (guarda de estado + clave de idempotencia).
  Si el saldo supera la garantía, se usa entera y el resto se paga con otro medio (el pago mixto ya existía).
- **Al confirmar el check-out**, ya con la cuenta cerrada y **fuera de la transacción**: la preautorización sin usar se
  **libera**; el depósito sin usar (o lo que sobre de él) se marca para **devolver**. No puede hacer fallar un check-out
  ya hecho: si la pasarela falla, la garantía queda "Pendiente" (visible) y se avisa en pantalla.
- **Saldo a favor** (lo pagado supera lo adeudado, ej. descuento del gerente sobre una tarifa no reembolsable ya
  pagada): `consolidarCargos` ahora devuelve `saldoAFavor` (antes se truncaba en 0 sin que nadie lo viera) y el
  check-out lo **devuelve** con un asiento `Devolución` negativo, por el mismo medio del primer pago. Esto también
  corrige las reservas viejas cuyo pago "Garantía" de $30.000 contaba como pagado y nunca se devolvía.
- El depósito en efectivo **no genera asiento al devolverlo**: nunca se registró como pago al recibirlo. En la cuenta
  solo entra lo que se APLICA al saldo.

## Limpieza de la seña (etapa 6)

Se retiraron la **seña del 20 %** (HU-88) y la **regla fija de 24 hs** de cancelación:

- Backend: `crearReservaConSena`, `POST /api/reservas/con-sena` y sus tests. `cancelarReserva` ya no anula pagos: calcula la
  penalidad con tarifas y registra una devolución. Se conservó la cobertura del vencimiento del guardado
  (`reservaGarantiaTimeout.test.js`, ahora sobre el alta con garantía).
- Frontend: `crearReservaConSena`, `PORCENTAJE_SENIA_RESERVA` y el paso "Seña" del wizard (reemplazado por "Garantía").
- Se **conserva** el concepto histórico `Seña` (en listas, filtros y rótulos) para que las reservas anteriores se sigan
  viendo; no se crean filas nuevas con ese concepto.
- La tabla de llegadas del check-in muestra la **tarjeta en garantía** (marca y últimos 4) y/o el **pago anticipado**
  (nuevo o seña histórica), y "Sin garantía · tomar al ingreso" solo cuando no hay ninguno.
- Scripts de prueba manuales (`scripts/pruebas-*.js`): el doble en memoria conoce las dos tablas nuevas, se reescribieron las
  pruebas de la garantía del check-in y se eliminó `pruebas-senia-reserva.js`. Quedan **4 fallas que ya existían en master**
  (`pruebas-checkin-rediseno`, `pruebas-estadia-integracion`, `pruebas-pool-local`, `pruebas-seed-demo`), ajenas a este cambio.
- La web vieja (HU-40) **no se tocó**: la reemplaza el e-commerce, que usa `procesarTarjeta` y `registrarGarantiaEnTransaccion`.

## Base de datos

Un solo script aditivo e idempotente: `backend/prisma/garantia-tarjeta.sql` (tabla nueva
`garantias_reserva`). Se prueba en una base **local**; en la compartida se aplica una sola vez, en un
despliegue coordinado, después de aprobado el PR. Esta rama no toca columnas existentes.

## Limitaciones conocidas

- En un sistema real, el cobro de una penalidad lleva **comprobante** (no se emite en este alcance).
- La caché de idempotencia de la pasarela simulada es en memoria.
- La devolución es solo un asiento: el reintegro real al huésped se hace a mano (transferencia, etc.).
- Si la tarjeta rechaza el cobro de la penalidad, no hay reintento automático ni pantalla de cobranza
  todavía: queda la marca "Cobro rechazado" en la garantía.
- Una caída del proceso entre el paso 1 y el 3 del cierre deja la garantía en "Cobro pendiente" (visible), sin
  reintento automático.
- Reserva no garantizada (hasta las 18 h): no implementada; se rechaza con un mensaje claro.
- Preautorización del check-in: monto fijo (`MONTO_PREAUTORIZACION_CHECKIN`) como constante con
  nombre; calcular "alojamiento pendiente + consumos por noche" queda como **mejora**.
- Reservas anteriores a esta función conservan su pago "Garantía" histórico: sigue contando como pagado.
- En el check-in, el código de seguridad de una tarjeta nueva queda en la memoria de la pantalla hasta que se confirma
  o se sale (no se guarda en ningún lado). Si la pasarela rechaza, no se borra solo como en el paso de la reserva.
