# Auditoría Sprint 3 — Integrante 4 (Ricardo), Check-out (HU-48 a 52, 87) y Facturación y Pagos del Huésped (HU-53 a 56)

Fecha: 2026-09-21. Alcance: código real en `master` (`1b9ce67`, tras `git pull`), no lo que se
reportó de palabra. Nota interna — no compartida con el equipo hasta decidir cómo comunicar los
hallazgos.

**Commits auditados** (autoría verificada con `git log --format="%an"`, no asumida):
- Ricardo (`Ricardo A`): `c49e920` (consolidación de cargos, verificación, pagos y comprobantes de
  estadía), `2f125c5` (fix menú), `c5d2d39` (anular pago, IVA, estilo), `e867c28` (tarjeta
  simulada, impresión, caja diaria, habitaciones en mantenimiento — el título menciona
  "habitaciones" pero el diff real no toca ese módulo, ver Regresiones), `1ed21dc` (merge de
  master), `85a5396` (docs de columnas nuevas), mergeados vía **PR #34**.
- Dentro del mismo rango de commits aparecen `584e5ef` y `d0ed34f` ("feat(habitaciones): ...") —
  son de **GIMENA23**, no de Ricardo: es tu propio trabajo de remediación de Habitaciones/Mantenimiento
  que quedó interlineado en la misma rama. Confirmado con `git log --format="%an" d370457..d52abb2`
  antes de atribuirle nada a Ricardo que no escribió.

---

## HU-48 — Consolidación de cargos

**Estado: Cumplida.**

**Evidencia:**
- `consolidarCargos` en [checkOut.servicio.js:65-154](../backend/src/modulos/check-out/checkOut.servicio.js)
  es una función que arma un objeto agregado en cada llamada — **no hay tabla `CargoEstadia`**,
  confirmado con `grep -n "^model " backend/prisma/schema.prisma`: no existe ese modelo.
- Las 3 fuentes son reales, no mockeadas:
  1. Alojamiento: `reserva.reservaHabitaciones` × `habitacion.tarifaPorNoche` × noches (línea
     79-89), leído directo de `Reserva`/`Habitacion` (tablas de Integrante 1/2).
  2. `ConsumoServicioAdicional` (línea 91-103), tabla real de Integrante 3.
  3. `CargoVerificacionCheckout` (línea 105-116, HU-87), tabla propia.
  - Más lo ya pagado, `PagoEstadiaMedio.aggregate` sobre pagos no anulados (línea 118-121).
- Es la única fuente de verdad reusada, no reimplementada: `pagoEstadia.servicio.js:27-42`
  (`calcularSaldoReserva`) delega en `consolidarCargos` en vez de recalcular; `confirmarCheckOut`
  también la re-consulta dentro de su propia transacción (línea 240) para revalidar con datos
  frescos antes de cerrar.
- `cliente = prisma` por defecto pero acepta un `tx`, así se puede leer dentro de una transacción
  con lock — usado por `registrarVerificacion` y `confirmarCheckOut`.

Sin objeciones.

---

## HU-49 — Confirmación de cargos con el huésped

**Estado: Cumplida.**

**Evidencia:**
- El backend exige el flag explícito: `checkOut.servicio.js:229-235` — sin
  `cargosValidados: true` en el body, `confirmarCheckOut` rechaza con 400 antes de tocar nada.
- UI: checkbox en [CheckOutReservaPage.jsx:347-358](../frontend/src/modulos/check-out/CheckOutReservaPage.jsx),
  deshabilitado hasta que la verificación (HU-87) esté completa, con el total mostrado en el mismo
  texto que confirma ("confirma los cargos por un total de...").

**Precisión (no baja el estado, ver HU-87 abajo):** el servidor solo valida que el flag booleano
haya llegado en `true` — no valida que la verificación de HU-87 haya ocurrido antes. Es el mismo
nivel de confianza en la intención del cliente que ya usa el resto del proyecto (motivos de
anulación, checkboxes de confirmación en general), así que no es un patrón nuevo — pero se
combina con una brecha real en HU-87 que sí vale la pena marcar ahí.

---

## HU-50 — Registrar pago (medios combinables)

**Estado: Cumplida.**

**Evidencia:**
- `crearPago` en [pagoEstadia.servicio.js:66-131](../backend/src/modulos/pagos-estadia/pagoEstadia.servicio.js):
  valida cada medio (tipo, importe > 0, largo de referencia), sin Cheque (a diferencia de Pagos a
  Proveedores, correcto según el propio comentario de `pagoEstadia.constantes.js:1-3` — HU-50 solo
  pide 5 medios).
- Protección de carrera real: chequeo rápido fuera de transacción (línea 89-95) + `SELECT ... FOR
  UPDATE` sobre la reserva dentro de la transacción (línea 102) + recálculo de saldo fresco (línea
  103-110) — mismo patrón que `crearOrdenPago` de Sprint 2.
- Estado `Pagado`/`Parcial` según cubra o no el saldo total (línea 112).
- **Tarjeta simulada (HU-50, explícitamente pedida):**
  [TarjetaSimuladaPanel.jsx](../frontend/src/modulos/pagos-estadia/TarjetaSimuladaPanel.jsx) —
  rotulada sin ambigüedad como simulación ("Terminal de pago simulada", "Simulación: no se cobra
  nada de verdad", línea 76-81). Solo sale `referencia` (marca + últimos 4 + código de
  autorización) hacia afuera — el número completo y el código de seguridad nunca salen del
  componente ni se persisten (buena práctica, evita un problema de seguridad real de guardar
  datos de tarjeta). Validación Luhn + vencimiento + terminación `0002` simula un rechazo.
- **5 tests automatizados de frontend, corridos por mí, todos verdes**
  (`PagoEstadiaWizard.test.jsx`): no confirma sin autorizar con tarjeta, rechazo por terminación
  0002, número inválido no llega al procesador, efectivo directo sin pedir tarjeta, pago mixto
  (efectivo + tarjeta) con referencia solo en el medio con tarjeta.

Sin objeciones.

---

## HU-51 — Liberación de habitación

**Estado: Cumplida** (re-verificado hoy, no re-auditado desde cero — como pediste).

**Evidencia:** corrí `node scripts/pruebas-integracion-mantenimiento-checkout.js` — **6 pruebas
OK, 0 con error**:
- Con una orden de mantenimiento sin resolver: el check-out se completa igual, la habitación
  queda en `"mantenimiento"` (no se pisa) y `estadoAnterior` se reescribe a `"en limpieza"` (no
  queda en el `"ocupada"` original) — así que al resolver la orden después, cae en `"en limpieza"`
  y no vuelve a `"ocupada"` con el huésped ya afuera.
- Caso simple (sin mantenimiento de por medio): la habitación pasa de `"ocupada"` a `"en
  limpieza"` con normalidad.
- Caso de control (orden resuelta ANTES del check-out): la habitación vuelve a `"ocupada"` al
  resolver y el check-out la deja en `"en limpieza"`, sin romper nada.

Lógica en [checkOut.servicio.js:260-329](../backend/src/modulos/check-out/checkOut.servicio.js),
con `FOR UPDATE` sobre cada habitación antes de leer su estado (línea 283) para que lo que se lee
sea lo que se escribe.

---

## HU-52 — Notificación a Housekeeping

**Estado: Cumplida, con la misma advertencia de texto que ya se corrigió en Mantenimiento.**

**Evidencia:**
- Usa la tabla `Notificacion` unificada, tal como quedó definido:
  `checkOut.servicio.js:316-327`, `tipo: "Housekeeping"`, `destinatarioArea: "Housekeeping"`,
  `canal: "Interno"` (constantes en `checkOut.constantes.js:14-17`).
- Se crea dentro de la misma transacción que el cierre (línea 237-341) — si algo falla, no queda
  a medias.

**El "envío" es un registro, no una entrega — y acá es peor que en Mantenimiento, no solo igual:**
grepeé `prisma.notificacion.find` en todo `backend/src` — **cero resultados**. La tabla
`Notificacion` se escribe desde tres lugares (`reservas.servicio.js`, `habitaciones.servicio.js`,
`checkOut.servicio.js`) pero **nunca se lee/lista desde ningún lado**. El endpoint
`GET /habitaciones/notificaciones` que la auditoría anterior documentó para Mantenimiento ya no
existe (confirmé contra `habitaciones.routes.js` actual) — se retiró en el rediseño de HU-33/34 del
19-20/09. Es decir: hoy **no hay ninguna pantalla, para ningún rol, donde Housekeeping pueda ver
estos avisos** — ni el de mantenimiento ni el de check-out.

Texto en pantalla, [CheckOutReservaPage.jsx:227-230](../frontend/src/modulos/check-out/CheckOutReservaPage.jsx):

```
Se notificó a Housekeeping (N aviso(s) registrado(s)).
```

El paréntesis "registrado(s)" atenúa la frase, pero la cláusula principal ("Se notificó a
Housekeeping") sigue afirmando una entrega que no ocurre — mismo problema de fondo que
"Notificaciones urgentes enviadas" de Mantenimiento (ya corregido ahí, retirando el mecanismo
entero). Acá el mecanismo no se retiró, así que la corrección más simple es de texto: algo como
"Housekeeping tiene un registro pendiente de la habitación X" en vez de "se notificó" — o,
si se quiere que sea una notificación real, construir alguna pantalla que Housekeeping pueda
consultar (hoy tienen que inferirlo mirando el Panel de Habitaciones filtrado por "en limpieza",
que funciona pero no usa esta tabla para nada).

---

## HU-87 — Verificación de la habitación al check-out

**Estado: Cumplida el mecanismo de carga; brecha real en la exigencia del orden.**

**Punto 3 de tu pedido — confirmado:**
- `CargoVerificacionCheckout` es tabla separada de `ConsumoServicioAdicional`
  (`schema.prisma:713-726`), no fusionada — decisión respetada.
- El alta no pidió backend adicional más allá de lo migrado: `registrarVerificacion`
  (`checkOut.servicio.js:165-204`) vive enteramente en el módulo de check-out, reusa
  `consolidarCargos` para devolver la cuenta recalculada, sin tocar ningún otro módulo.

**Evidencia adicional (transacción):** lock explícito sobre la reserva (`FOR UPDATE`, línea 187)
+ exige `reserva.estado === 'En curso'` (línea 190-194) antes de aceptar un cargo — bien.

**Brecha real, encontrada leyendo el código (no es un "hallazgo ya conocido" del backlog, es
nuevo):** `confirmarCheckOut` (`checkOut.servicio.js:229-235`) **no exige que haya habido
ninguna verificación** — solo chequea `cargosValidados === true`. El orden "48 → 87 → 49" que
describe el propio comentario del código (línea 213-228) lo impone **únicamente la pantalla**:
el botón "Confirmar check-out" está `disabled` hasta que `verificacionCompleta` sea `true`
(`CheckOutReservaPage.jsx:166`). Pero nada en el servidor lo revisa — un `POST
/api/check-out/:reservaId/confirmar` directo, sin pasar nunca por
`POST /verificaciones`, cierra la reserva igual.

Además, el caso "verificación sin novedades" (cuando el recepcionista revisa y no encuentra nada)
**no se persiste en ningún lado** — es puro estado de React
(`CheckOutReservaPage.jsx:77`, `verificacionMarcada`), documentado así en el propio comentario del
archivo (línea 73-76: *"El backend no guarda 'verificación sin novedades'..."*). Si la página se
recarga a mitad de camino, se pierde — no porque se pierda un dato (nunca hubo dato), sino porque
no queda ningún rastro de que alguien haya revisado la habitación cuando no hay nada para cobrar.
No hay `registradoPor`/`fechaHora` para ese caso, a diferencia de cuando sí se encuentra algo.

Esto no es un defecto que impida usar la función (el camino feliz por pantalla funciona
perfecto), pero si el criterio de aceptación de HU-87 exige que la verificación sea un paso
obligatorio antes de poder cerrar — no solo una opción disponible — hoy eso **no está
garantizado por el sistema**, solo por la buena voluntad de quien usa la pantalla.

---

## HU-53 — Emisión de comprobante de estadía

**Estado: Cumplida.**

**Punto 2 de tu pedido — confirmado en detalle:**
- Sigue el patrón de `ComprobanteProveedor` **al pie de la letra**: campo `tipo` (`"Comprobante"` |
  `"Nota de Crédito"`) + `comprobanteRelacionadoId` auto-referenciado
  (`schema.prisma:662-689`) — **no existe** `NotaCreditoEstadia`.
- Diferencia a propósito y documentada (`comprobanteEstadia.servicio.js:50-58`): sin
  `PATRON_NUMERO_COMPROBANTE` (acá el número lo genera el sistema, correlativo interno vía
  `crearConNumeroSecuencial(tx, 'comprobanteEstadia', { prefijo: 'CE', ... })`,
  [lib/numeracion.js](../backend/src/lib/numeracion.js) — genera `CE-00001`, no formato AFIP).
- **Grep de todo el proyecto** (`afip|wsfe|\bcae\b|factura fiscal|numeración normada`, backend +
  frontend): las únicas coincidencias de "AFIP" están en `comprobantes.constantes.js` de
  **Proveedores** (Sprint 2, facturas que llegan de terceros — un caso legítimamente distinto,
  donde el número SÍ lo emite el proveedor externo). **Cero rastro de AFIP/WSFE/CAE en
  check-out, comprobantes-estadia o pagos-estadia**, ni en código ni en textos de UI.
- Disclaimer explícito en la vista imprimible:
  [ComprobanteEstadiaDetallePage.jsx:249-251](../frontend/src/modulos/comprobantes-estadia/ComprobanteEstadiaDetallePage.jsx):
  *"Comprobante interno del sistema de gestión hotelera — sin validez fiscal."* — y el propio
  schema lo documenta igual (`schema.prisma:667`, comentario sobre el campo `numero`).
- Un solo comprobante vigente por reserva (`comprobanteEstadia.servicio.js:87-96`), IVA calculado
  una sola vez al crear (nunca en el frontend ni recalculado en cada lectura).

Sin objeciones.

---

## HU-54 — Caja diaria

**Estado: Cumplida.**

**Evidencia:**
- `reporteCajaDiaria` (`comprobanteEstadia.servicio.js:308-356`): cobrado por medio de pago +
  cargos por tipo de servicio + notas de crédito del día descontadas del neto.
- Límites de día en hora argentina explícita (`-03:00`), no medianoche UTC — evita la clase de bug
  de zona horaria que ya se encontró y corrigió en Sprint 1 (documentado en memoria del proyecto).
- Rol: `verCajaDiaria` = solo `gerente` (`sesion.jsx:200`), coincide con el ítem de menú
  ([menuConfig.js:136](../frontend/src/componentes/menuConfig.js)).
- Botones "Exportar Excel"/"Exportar PDF" están rotulados explícitamente **"(simulado)"** en el
  propio toast (`ReporteCajaDiariaPage.jsx:57,60`) — a diferencia de HU-52, acá el texto sí es
  honesto sobre lo que realmente pasa.

Sin objeciones.

---

## HU-55 — Facturación a nombre de un tercero (corporativa)

**Estado: Cumplida.**

**Evidencia:**
- Validación "los dos o ninguno" para `razonSocialTercero`/`cuitTercero`, server y cliente
  (`comprobanteEstadia.servicio.js:64-73`, `EmitirComprobanteModal.jsx:62-64`).
- CUIT: mismo regex y helper `normalizarCuit` **reusados** de `proveedores.constantes.js`
  (`comprobanteEstadia.servicio.js:6`), no reimplementados.

Sin objeciones.

---

## HU-56 — Nota de crédito

**Estado: Cumplida.**

**Evidencia:**
- `crearNotaCredito` (`comprobanteEstadia.servicio.js:145-194`): mismo mecanismo
  tipo + `comprobanteRelacionadoId` que HU-53 confirma arriba.
- Tope real contra lo ya acreditado (línea 160-172): no deja acreditar más de lo que factura el
  comprobante original.
- Se descuenta del reporte de caja diaria (HU-54, confirmado arriba).
- Bloquea anular un comprobante con notas de crédito vigentes (`anularComprobante`, línea
  279-295) — consistente con el mismo criterio de Sprint 2.

Sin objeciones.

---

## Roles (punto 6 de tu pedido)

**Evidencia — `sesion.jsx:196-200`:**
```js
if (accion === "gestionarCheckOut") return rol === "admin" || rol === "recepcionista";
if (accion === "gestionarComprobantesEstadia") return rol === "admin" || rol === "recepcionista";
if (accion === "verCajaDiaria") return rol === "gerente";
```
Y `menuConfig.js:88-99` coincide: Check-out y Comprobantes de Huésped visibles para
`["admin", "recepcionista"]`.

**No es lo que pediste confirmar — importante decirlo tal cual:** acá **admin NO es de solo
lectura**, tiene el mismo acceso de escritura que Recepcionista (puede registrar cargos, cobrar,
anular pagos, emitir comprobantes y notas de crédito, cerrar el check-out). Esto **no** sigue el
criterio de Habitaciones/Mantenimiento (donde `gestionarMantenimiento` excluye a admin
explícitamente).

Dicho eso, tampoco es un descuido aislado de Ricardo: es exactamente el mismo criterio que ya
tienen, **dentro del mismo sprint**, Reservas (`gestionarReservas`) y Check-in
(`gestionarCheckIn`) — ambas también admin + recepcionista sin matices, con el mismo comentario
explícito en el código ("admin entra por ser quien administra la operación completa",
`sesion.jsx:178-181`). O sea: dentro de Sprint 3 conviven **dos criterios de rol distintos y
ambos deliberados** — Habitaciones/Mantenimiento (admin lectura) vs. Reservas/Check-in/Servicios
Adicionales/Check-out (admin escritura plena) — no uno correcto y otro con error. Si querés que
Check-out sea consistente con Habitaciones en vez de con Reservas, es un cambio de una línea en
`sesion.jsx`, pero hoy el código está donde está por diseño, no por omisión.

**Sin RBAC de backend**, igual que en todo el resto del proyecto (grep de middlewares de
auth/rol en `check-out`, `comprobantes-estadia` y `pagos-estadia`: cero resultados) — mismo
"Limitación conocida" que ya se documentó para Habitaciones, no es un hallazgo nuevo.

---

## Diseño (punto 7 de tu pedido)

**Alineado con el sistema real**, sin estilos genéricos sueltos:
- Paleta pino/latón: `bg-pino-100`/`text-pino-700` (botón "ok"), `bg-laton-100`/`text-laton-700`
  (terminal simulada, badges "alerta"), confirmado también en `Badge.jsx:12-16` (`ok`, `alerta`,
  `error`, `neutro`, `info` — los 5 con el patrón pastel `bg-*-100 text-*-700`, ninguno una
  píldora de color sólido).
- Fraunces vía `font-heading` en títulos, `Cifra` para los números destacados (total de la
  cuenta, saldo, totales de caja diaria).
- Componentes compartidos reusados sin reinventar: `CodigoClave`, `MoneyInput`, `PasoAPaso`
  (pasos del check-out), `ConfirmDialog` (anular pago, anular comprobante, confirmar cierre),
  `Modal`, `Table`, `FilterBar`.
- Vista de impresión del comprobante replica el mismo mecanismo que Órdenes de Compra (mismo
  comentario en el código lo dice explícitamente) — encabezado oculto en pantalla, visible solo
  al imprimir.

Sin objeciones.

---

## Regresiones (punto 8 de tu pedido)

**Diff aislado de los commits de Ricardo** (`git diff --stat` por commit, no por el merge
completo — el merge completo mezclaba tus propios commits de Habitaciones):
- `c49e920`, `c5d2d39`, `e867c28` (sus 3 commits de feature) tocan **exclusivamente**
  `check-out/`, `comprobantes-estadia/`, `pagos-estadia/`, más wiring mínimo esperado:
  `backend/index.js` (+3 líneas, solo el montaje de las 3 rutas nuevas),
  `backend/prisma/schema.prisma` (+6 líneas en 2 commits: `fecha` en `ComprobanteEstadia`,
  `referencia` en `PagoEstadiaMedio`, `motivo` en `ComprobanteEstadia` — todos campos nuevos,
  ningún campo existente tocado), `frontend/src/App.jsx`, `menuConfig.js`, `sesion.jsx` (rutas y
  permisos nuevos, nada modificado de lo existente).
- **Cero archivos de Stock/Depósitos o Compras/Gastos tocados por Ricardo.**
- Los cambios de Habitaciones visibles en el diff del merge completo (584e5ef, d0ed34f) son
  **tuyos**, no de Ricardo — verificado por autoría de commit, no asumido. El título de `e867c28`
  ("...y habitaciones en mantenimiento") es engañoso si se lee solo el título: el diff real de
  ese commit no toca ningún archivo de `habitaciones/`.

**Suite completa corrida por mí, todo verde:**
- **Backend — 135 pruebas OK, 0 con error** (no hay `npm test`, son scripts sueltos en
  `backend/scripts/`, corridos uno por uno):
  - `pruebas-reservas.js`: 67 OK
  - `pruebas-checkin.js`: 25 OK
  - `pruebas-habitaciones.js`: 13 OK
  - `pruebas-servicios-adicionales.js`: 24 OK
  - `pruebas-integracion-mantenimiento-checkout.js`: 6 OK
- **Frontend — 35 pruebas OK, 0 con error** (`npx vitest run`, 6 archivos), incluidas las 5 de
  `PagoEstadiaWizard.test.jsx`.

**El hueco real de esta auditoría — más que cualquier historia puntual:** no existe **ningún**
test automatizado (backend o frontend) para la lógica financiera del check-out. El único script
que toca el módulo (`pruebas-integracion-mantenimiento-checkout.js`) siembra las habitaciones con
`tarifaPorNoche = 0` **a propósito**, documentado en su propio comentario, justamente para no
tener que ejercitar la plata — solo prueba la interacción de estados
`Habitacion.estado`/`estadoAnterior`. Es decir: **`consolidarCargos` (HU-48), `crearComprobante`/
`crearNotaCredito`/`anularComprobante`/`reporteCajaDiaria` (HU-53/54/55/56) y `crearPago`/
`anularPago` con su lock contra condiciones de carrera (HU-50) no tienen ni una sola prueba
automatizada** — a diferencia de Reservas (67 pruebas) y Check-in (25), que sí verifican su
lógica de negocio de punta a punta. Todo lo financiero de este módulo está verificado hoy
únicamente por lectura de código, la mía y la que hiciste vos al revisarlo de palabra con
Ricardo.

---

## Resumen ejecutivo

| Historia | Estado |
|---|---|
| HU-48 | Cumplida |
| HU-49 | Cumplida |
| HU-50 | Cumplida |
| HU-51 | Cumplida (re-verificada) |
| HU-52 | Cumplida, con advertencia de texto ("se notificó" sin entrega real ni pantalla de lectura) |
| HU-87 | Cumplida el mecanismo; brecha real: el backend no exige la verificación antes de cerrar |
| HU-53 | Cumplida |
| HU-54 | Cumplida |
| HU-55 | Cumplida |
| HU-56 | Cumplida |

**10 de 10 Cumplidas. 0 Parciales. 0 No implementadas** — con 2 advertencias puntuales (HU-52,
HU-87) que no bajan el estado porque el camino feliz funciona completo y correcto, pero que sí
son brechas reales de robustez/honestidad de UI, no cosmética.

**Comparado con la auditoría anterior (Habitaciones/Reservas, también 12/12 Cumplidas):** el
patrón se repite — el código en sí está sólido, bien pensado (locks, transacciones, reuso
deliberado de patrones de Sprint 2, decisiones documentadas en el propio código con el
"por qué"), y las brechas que aparecen son las mismas dos categorías de siempre en este
proyecto: (1) el backend confía en que el frontend hizo cumplir el orden de los pasos, sin
revalidar todo server-side, y (2) las "notificaciones" son registros, no entregas.

**El problema más urgente a resolver no es ninguna historia incumplida — son dos cosas
distintas, en orden de impacto:**

1. **Cero cobertura de test automatizado sobre la plata.** Reservas y Check-in tienen sus
   contratos verificados por script; el módulo que mueve dinero real de la operación (cobros,
   comprobantes, notas de crédito, IVA) no tiene ninguno. Si alguien toca `redondear`,
   `consolidarCargos` o el cálculo de IVA sin querer, hoy nada lo va a agarrar hasta que alguien
   lo note a mano en producción (o en la próxima auditoría).
2. **HU-87 es saltable por API directa.** Bajo impacto real hoy (solo personal con acceso al
   sistema, ya de por sí dentro de la operación), pero es la clase de brecha que si mañana hay
   autenticación real y algún rol con menos confianza que Recepcionista, se vuelve explotable de
   verdad.

Ninguna de las dos bloquea el uso normal del sistema tal como está hoy — pero valen la pena
resolver antes de que el sprint se dé por cerrado, en ese orden.
