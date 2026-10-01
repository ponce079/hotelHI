# Revisión de estadía/ocupantes — requisitos para el PR

Los 32 commits del 29/9/2026 (`91a9426..a8e4401`, autor `agusfar45`) se
mergearon a `master` sin revisión. Se revirtieron de `master` y el trabajo
completo, intacto, quedó en la rama `feature/estadia-ocupantes` (`a8e4401`).
Este documento lista lo que hay que cumplir para reintegrarlo por Pull
Request, y el contrato con el módulo de tarifas por temporada
(`feature/tarifas`, Etapas 1 a 4B).

Cada requisito es verificable: indica qué mirar o qué prueba lo demuestra.

## 1. Qué se conserva

Se acepta el diseño base de ocupantes y garantías; no hay que reescribirlo:

- `OcupanteReserva`, `AsignacionOcupanteHabitacion` (historial de habitación
  por persona) y `EventoEstadia` (auditoría).
- Identidad activa única por documento (`identidadActiva @unique`).
- Transacciones con `SELECT ... FOR UPDATE` sobre la reserva.
- Ficha con nombre, apellido, tipo y número de documento, nacionalidad y fecha
  de nacimiento (`validarCompleto`).
- Garantía separada del pago del alojamiento y liquidación (devolver/aplicar).
- Migración aditiva con respaldo (`migrar-estadia.js`).

## 2. Contrato de integración con tarifas

Estas cinco reglas son el criterio de aceptación del PR. Si alguna no se
cumple, no se mergea.

1. **`ReservaNoche` es la única fuente de precio.** Todo importe de
   alojamiento (check-out, cuenta, detalle de reserva, garantía) se lee de
   `ReservaNoche.precioNoche`. `ReservaHabitacion.tarifaPactada` y
   `Habitacion.tarifaPorNoche` no se usan para calcular ningún importe.
2. **La cantidad de personas sale de `ReservaHabitacion.adultos` y
   `ReservaHabitacion.menores`.** El sistema no guarda ni pide otra cantidad.
3. **La diferencia por ocupación la calcula `cotizarReserva`**
   (`backend/src/modulos/tarifas/cotizacion.servicio.js`). Si ingresan más
   personas que las reservadas, se recotiza con la nueva ocupación
   (`adultos`/`menores`) y la diferencia sale de comparar contra lo congelado.
   No existe cálculo de adicional por persona fuera del motor.
4. **Las penalidades y la aplicación de garantías usan `calcularPenalidad`**
   (`backend/src/modulos/tarifas/penalidades.servicio.js`). No se reimplementa
   la regla. Recordar que una noche con ajuste manual penaliza por
   `precioOriginal`, no por `precioNoche`.
5. **Un solo lugar escribe `ReservaNoche`:** el alta y la modificación de
   reservas (`crearReservaEnTransaccion`, `modificarReserva`) y el ajuste
   manual (`ajustarPrecioReserva`). El módulo de estadía no crea ni modifica
   noches.

## 3. Cambios requeridos (criterios de aceptación)

### Crítico

**C1. Eliminar el segundo mecanismo de precio congelado.**
- Sin `tarifaPactada`, `ocupacionIncluida` ni `precioPersonaExtra` en
  `ReservaHabitacion` (schema y SQL).
- Verificable: `grep -rn "tarifaPactada\|precioPersonaExtra\|ocupacionIncluida" backend/src frontend/src`
  no devuelve resultados. `consolidarCargos` suma `ReservaNoche.precioNoche`.

**C2. Eliminar el cálculo del adicional por persona fuera del motor.**
- Se elimina `condiciones.servicio.js` y su ruta `adicional-ocupacion`, y el
  tipo de consumo "Persona adicional" generado por ocupación.
- Verificable: ninguna escritura a `ConsumoServicioAdicional` calcula precio por
  ocupación; el adicional de adulto extra existe una sola vez, en
  `Tarifa.adicionalAdultoExtra` vía `cotizarReserva`.

**C3. No pedir la cantidad de personas en el check-in.**
- Se elimina `cantidadesOcupantes` (frontend y backend). El check-in valida
  que las identidades registradas por habitación sean **exactamente**
  `adultos + menores` de esa `ReservaHabitacion`.
- Verificable: el endpoint de check-in no acepta `cantidadesOcupantes`; test
  que falla si se registran menos o más identidades que `adultos + menores`
  sin pasar por el flujo de ampliación (C6).

### Importante

**I1. Persona única, sin fichas duplicadas.**
- Cada ocupante se vincula a `Huesped` (o a un modelo `Persona` único) por
  tipo + país + número de documento. Una persona que vuelve o aparece en dos
  reservas usa la misma ficha.
- Verificable: test que registra el mismo documento en dos reservas y comprueba
  una única ficha de persona con dos estadías.

**I2. Un titular por habitación.**
- Campo explícito de titular por habitación ocupada (no inferido de
  `responsableId`). Exactamente un titular por `ReservaHabitacion` en
  check-in.
- Verificable: el check-in falla si una habitación tiene 0 o 2 titulares;
  test de ambos casos.

**I3. `modificarReserva` conserva la coherencia con tarifas.**
- Al conservar filas de `ReservaHabitacion`, se actualizan `adultos`/`menores`
  y se recotiza y reescriben las `ReservaNoche` de esa habitación con
  `cotizarReserva`. Se respeta la regla de plan no reembolsable y el ajuste
  manual vigente.
- Verificable: test que modifica ocupación de una habitación conservada y
  comprueba noches recotizadas; test que comprueba que el ajuste manual se
  conserva si el precio no cambia.

**I4. Advertencia al superar lo reservado.**
- Si se intenta ingresar más personas que `adultos + menores`, el backend
  responde con una advertencia explícita (código y mensaje) y exige
  confirmación; al confirmar, aplica la ampliación recotizando con `cotizarReserva` (regla 3 del
  contrato) y deja la diferencia en `ReservaNoche`.
- Nunca se supera `Habitacion.capacidad`.
- Verificable: test de ingreso de una persona extra: sin confirmación → 409
  con advertencia; con confirmación → nuevas `ReservaNoche` y diferencia
  igual a `cotizarReserva`.

**I5. Garantía consistente con penalidades.**
- La aplicación de garantía a la cuenta usa `calcularPenalidad`
  cuando corresponde por cancelación o no-show; `consolidarCargos`
  (`totalPagado`, `garantiaPendiente`) no altera el total de alojamiento.
- Verificable: test que combina noche ajustada + garantía aplicada + no-show y
  comprueba que la penalidad usa `precioOriginal`.

**I6. Tests de integración.**
- Al menos un test de flujo completo contra base de pruebas:
  reserva con plan → check-in con identidades → ampliación de ocupación →
  check-out → cuenta con garantía. Los mocks actuales (`jest.mock(prisma)`)
  no alcanzan para el criterio.

### Menor

- **M1.** Reformatear el código a estilo del proyecto (sin líneas con
  múltiples sentencias). Verificable: pasa el linter/formato del repo.
- **M2.** Los datos de personas no van en texto libre ni JSON:
  `EventoEstadia.detalle` solo referencia IDs; `serviciosIncluidos` sale del
  plan tarifario (no texto libre); tipo de documento y nacionalidad usan
  catálogos o enums validados en backend.
- **M3.** Un solo `module.exports` por archivo (hoy duplicado en
  `checkOut.servicio.js` y `checkIn.controlador.js`).
- **M4.** El PR se abre desde `feature/estadia-ocupantes` con descripción, lista
  de tablas/columnas nuevas y script de migración aditiva.

## 4. Conflictos de merge conocidos con `feature/tarifas`

Simulado con `git merge-tree` (sin aplicar). Seis archivos conflictúan:

| Archivo | Resolución esperada |
|---|---|
| `backend/prisma/schema.prisma` | Conservar ambos bloques de modelos. |
| `backend/src/modulos/reservas/reservas.servicio.js` | Precio y noches de tarifas; validaciones de ocupantes de estadía. |
| `backend/src/modulos/check-out/checkOut.servicio.js` | Subtotal por `reservaNoches`; garantía de estadía. |
| `frontend/src/modulos/check-in/CheckInWalkIn.jsx` | Estado de tarifas (`habitaciones[{adultos,menores}]`, plan) + registro de personas. |
| `frontend/src/modulos/reservas/ReservaDetallePage.jsx` | Unir imports. |
| `frontend/src/modulos/check-in/CheckInConReserva.test.jsx` | Unir datos de prueba. |

Orden sugerido: primero se integra `feature/tarifas`; luego se rebasa
`feature/estadia-ocupantes` sobre `master` y se resuelven estos conflictos
aplicando el contrato de la sección 2.

## 5. Base de datos

**Actualizado 30/9/2026, tras el despliegue de la Etapa 4C de tarifas — cambia lo que este documento asumía:**

- **Ya NO es cierto que las tablas y columnas de estadía puedan quedar en la base compartida hasta que el PR se integre.** El despliegue de la Etapa 4C (`docs/despliegue-tarifas.md`) las elimina de la base compartida como parte de su propio paso de "estructura intermedia", antes de que este PR se reintegre — no después. Se eliminan: `OcupanteReserva`, `AsignacionOcupanteHabitacion`, `EventoEstadia`, las tablas de respaldo internas de `migrar-estadia.js` (`bkp_huespedes`, `bkp_ocupantes`, `bkp_reservas_huesped`), `cargos_verificacion_checkout.habitacionId`, y las columnas `tarifaPactada`/`ocupacionIncluida`/`precioPersonaExtra`/`serviciosIncluidos` de `ReservaHabitacion`, `garantiaAplicada`/`garantiaDevuelta`/`garantiaSeparada` de `PagoEstadia`, y 9 columnas de `ConsumoServicioAdicional` (`anulado`, `anuladoEn`, `anuladoPor`, `claveOperacion`, `descripcion`, `fechaServicio`, `incluido`, `motivoAnulacion`, `precioUnitario`). Lista completa y verificada columna por columna en `docs/despliegue-tarifas.md`.
- **El trabajo en `feature/estadia-ocupantes` sigue intacto** — nada de esto toca esa rama ni su código. La migración `migrar-estadia.js`, siendo aditiva, vuelve a crear todo esto al integrarse el PR sin cambios de tu parte.
- Las columnas `tarifaPactada`, `ocupacionIncluida` y `precioPersonaExtra` (C1/C2) **no hace falta retirarlas en una migración posterior "después de verificar que ningún dato en producción las use"** como decía la versión anterior de este párrafo: para cuando este PR se integre, ya no van a existir en la base compartida — no vas a encontrarlas ahí. Si tu diseño todavía necesita un mecanismo de precio pactado por habitación, coordinalo de nuevo con tarifas antes de reintroducirlo: la única fuente de precio hoy es `ReservaNoche.precioNoche` (ver sección 2, regla 1).
- **`Habitacion.tarifaPorNoche` no quedó "sin uso": se ELIMINÓ del schema y de todo el código** (Etapa 4C, ver `docs/integracion-garantia-tarifas.md` sección 4). No es una columna que puedas leer aunque no la necesites — no existe.
