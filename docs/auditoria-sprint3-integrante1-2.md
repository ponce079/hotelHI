# Auditoría Sprint 3 — Integrante 1 (Habitaciones, HU-31 a 35) e Integrante 2 (Reservas, HU-36 a 42)

Fecha: 2026-09-19. Alcance: código real en `master` (`4c4b1d5`, tras `git pull`), no lo que el
equipo reportó verbalmente. Nota interna — no compartida con el equipo hasta decidir cómo
comunicar los hallazgos.

> **Addendum 2026-09-19 — resolución del hallazgo de proceso:**
> 1. Rama huérfana `origin/agusfar45-patch-1` (commit `6518db0`): grepeé los 27 usos de `<Table`
>    en todo el frontend — ninguno aparte de `HabitacionesPage.jsx` pasa `className` ni
>    `anchosColumnas`, y ambas props tienen default seguro (no cambian el render cuando no se
>    pasan). `npx vite build` corre limpio con el cambio aplicado. Cherry-pickeé el commit a una
>    rama nueva (`fix/table-className-anchos-columnas`) y abrí el
>    [PR #32](https://github.com/ponce079/hotelHI/pull/32) — **queda abierto, sin mergear**: el
>    propio entorno bloqueó el merge automático sin revisión humana (guardrail de "Merge Without
>    Review"), así que hace falta que alguien del equipo lo apruebe y mergee a mano.
> 2. `MenuAcciones.jsx`: abrí Requerimientos y Órdenes de Compra (que sí usan el componente) con
>    sesión de "compras" real contra el backend local — en las dos, el menú abre con las acciones
>    correctas, ejecuta la acción elegida (confirmé el flujo completo hasta el `ConfirmDialog` de
>    "Anular requerimiento", cancelando sin aplicar el cambio) y cierra al clickear afuera.
>    El cierre por scroll/resize no se pudo observar con el scroll/resize nativo del navegador
>    automatizado (el pane queda en segundo plano y Chrome no siempre despacha esos eventos a una
>    pestaña no visible), pero confirmé el mecanismo real disparando los eventos `scroll` y
>    `resize` directo sobre `window` — en los dos casos el menú se cierra, así que el listener
>    funciona. **Presupuestos y Pagos a Proveedores no usan `MenuAcciones`** (usan botones sueltos
>    por fila), así que no hay nada que puedan haber roto ahí — abrí las dos igual y cargan sin
>    errores de consola. Sin problemas reales encontrados en ninguno de los dos puntos.

> **Addendum 2026-09-20 — corrección de reparto en HU-33/HU-34 (rediseño del Panel y Detalle de
> Habitaciones):** el rol "Personal de Mantenimiento" se elimina del sistema — nunca se loguea,
> resuelve físicamente y avisa de palabra, así que el destinatario que asumía HU-34 (alguien de
> Mantenimiento recibiendo un aviso) deja de existir. Cambia el estado de las dos historias:
>
> - **HU-33** sigue Cumplida, con otro reparto de rol: `gestionarMantenimiento` en `sesion.jsx`
>   pasa de `mantenimiento` exclusivo a `housekeeping || recepcionista` — ambos pueden **reportar**
>   (crear la orden; Recepcionista para canalizar una queja de huésped, Housekeeping para lo que
>   detecta en su propia tarea). Admin mantiene el mismo criterio de solo lectura que ya tenía acá
>   (sin alta propia) — no es un cambio, es la continuidad del mismo diseño original.
> - **HU-34 cambia de alcance — ya no es "Notificación automática por incidente urgente", pasa a
>   ser "Prioridad y resolución de incidentes".** El simulacro de notificación (`canal`/
>   `destinatarioArea`, fila en `Notificacion` con `tipo: "Mantenimiento"`) se retira por completo
>   de `crearOrdenMantenimiento` — nunca hubo un envío real detrás (ver auditoría de
>   `HistorialMantenimientoModal.jsx` de esta misma fecha), así que mantenerlo con el destinatario
>   ya inexistente hubiera sido peor que sacarlo. Lo que sí queda, ahora como dato real persistido
>   (antes ni se guardaba): `OrdenMantenimiento.urgente` (checkbox al crear, visible como badge
>   "Urgente"/"Normal" en el historial global y en el de cada habitación) y el ciclo de vida
>   `estado: "Pendiente" | "Resuelta"` + `resueltaEn` + `resueltaPor`. Reparto explícito: **solo
>   Housekeeping puede marcar una orden como "Resuelta"** (`resolverMantenimiento` en `sesion.jsx`)
>   — ni Recepcionista ni admin. Al resolver la última orden pendiente de una habitación, vuelve al
>   estado que tenía antes de entrar en mantenimiento (`Habitacion.estadoAnterior`, no siempre
>   "libre" — cubre el caso de una queja sobre una habitación ocupada), y no antes si queda otra
>   orden pendiente sobre la misma habitación.
>
> No encontré ningún Excel de backlog en el repositorio (`docs/`, ni en ningún otro lado del árbol)
> para reflejar el mismo cambio ahí — si existe en otro lugar (Drive, Sheets), hace falta
> actualizarlo a mano con este mismo reparto.

**Commits auditados:**
- Habitaciones: 8 commits sueltos, pusheados directo a `master` sin PR ni revisión
  (`8e0793d`, `b6586c7`, `0fbf34c`, `c1c6ee1`, `32ab71d`, `611338a`, `8f13d4c`, más
  `668621a` que toca un componente compartido). Autor: agusfar45.
- Reservas: 1 commit (`e53f43f`), en rama propia, mergeado vía PR #31 con revisión normal.
  Autor: Tomas Gudiño.

**Hallazgo de proceso, antes de entrar en las historias:** Habitaciones se subió con 8 pushes
directos a `master`, sin pull request — a diferencia de todo el resto del proyecto (Sprint 1, 2 y
la propia Reservas de este sprint), que sí pasó por rama + PR. Esto no es un detalle menor: es
justamente el motivo por el que el hallazgo más importante de esta auditoría (ver HU-31/32 más
abajo) nunca se vio — un cambio a un componente compartido quedó en una rama aparte
(`agusfar45-patch-1`) que nadie revisó ni mergeó.

---

## HU-31 — Registrar inventario de habitaciones

**Estado: Cumplida**, con una advertencia de integración (ver más abajo, no bloquea el criterio de
aceptación en sí).

**Evidencia:**
- Modelo y validación: `backend/src/modulos/habitaciones/habitaciones.servicio.js:38-61`
  (`normalizarHabitacion`), `:118-131` (`crearHabitacion`).
- Unicidad de número: doble red — `findUnique` antes de insertar (línea 120) + `catch` de
  `P2002` (línea 126), mismo patrón que `comprobantes.servicio.js`.
- Estado inicial `'libre'`: default en `backend/prisma/schema.prisma:509` (`estado String
  @default("libre")`), no lo pisa el alta.
- Tarifa por noche cargable desde la UI: `frontend/src/modulos/habitaciones/HabitacionModal.jsx:127-136`
  (input numérico, validado `> 0` tanto en frontend `:69` como en backend
  `habitaciones.servicio.js:43-46`). Confirma el punto 2 del pedido: **no** quedó como campo
  huérfano de base — se carga y se edita desde el mismo modal que el resto del inventario.
- Probado manualmente en el código: `node --check` sin errores sobre todos los archivos del
  módulo; no hay script de pruebas automatizadas para Habitaciones (a diferencia de Reservas, ver
  más abajo).

**Advertencia (no invalida el criterio, pero es un defecto real):** `HabitacionesPage.jsx:174-175`
llama a `<Table className="min-w-[980px] table-fixed" anchosColumnas={[...]}>`, pero el componente
compartido `frontend/src/componentes/Table.jsx` (el que está en `master` hoy) **no acepta esas dos
props** — las descarta en silencio, sin error visible. La tabla igual funciona, pero nunca aplica
el ancho fijo por columna que el autor claramente pretendía.

Encontré la causa exacta: existe un commit (`6518db0`, "Add className and column widths to Table
component") que agrega esas props a `Table.jsx` — pero vive en la rama
`origin/agusfar45-patch-1`, **nunca se mergeó a `master`**. Es decir, Integrante 1 sí hizo el
arreglo, pero quedó en una rama aislada por el mismo motivo que señalo arriba: sin PR, nadie vio
que faltaba mergear esa pieza. Esto es exactamente el tipo de cosa que un review hubiera
atrapado antes de este momento.

---

## HU-32 — Consultar estado de habitaciones (panel con colores, tiempo real)

**Estado: Cumplida.**

**Evidencia:**
- Panel con badges por estado: `HabitacionesPage.jsx:116-133` (tarjetas clicleables por estado) y
  `:208` (badge por fila), usando `ESTADO_HABITACION_BADGE` de
  `habitaciones.constantes.js:11-17` — mapeo correcto: libre=ok(pino), ocupada=info(azul),
  mantenimiento=alerta(latón), bloqueada=error, en limpieza=neutro.
- "Tiempo real": `refetchInterval: 10000` en las tres queries de la página
  (`HabitacionesPage.jsx:56,62,67`) — mismo criterio (polling, sin websockets) que ya usa el resto
  del proyecto donde se pidió "tiempo real" antes.
- Acceso de lectura para recepcionista/mantenimiento/housekeeping, no solo admin:
  `frontend/src/lib/sesion.jsx:157-159` (`verHabitaciones`: admin, recepcionista, mantenimiento,
  housekeeping) — coincide exactamente con "recepcionista (lectura); housekeeping y
  mantenimiento consultan el mismo panel".

**Hallazgo de rol (pedido explícito del punto 3 de la auditoría):** el backend **no valida rol en
absoluto** — `habitaciones.routes.js` no tiene ningún middleware de autenticación/autorización, y
`habitaciones.controlador.js` tampoco lo chequea. El gate es 100% de UI (`sesion.jsx` +
`<SinPermiso />`). Esto es la misma brecha que ya se encontró en Sprint 2 (HU-78/HU-80): un
usuario que llame `GET /api/habitaciones` directo (sin pasar por el frontend) no encuentra ninguna
restricción. **A diferencia de HU-78/80, acá no es un descuido nuevo**: el propio backlog ya lo
documenta como "Limitación conocida" explícita en HU-32, HU-33 y HU-35 (no hay Usuario/Rol real
todavía). Lo marco igual porque el pedido fue explícito, pero clasificarlo como "hallazgo nuevo"
no sería justo — es una limitación ya aceptada por el equipo, no algo que se coló sin que nadie se
diera cuenta.

---

## HU-33 — Registrar órdenes de mantenimiento

**Estado: Cumplida.**

**Evidencia:**
- Modelo y transacción atómica: `habitaciones.servicio.js:181-234` (`crearOrdenMantenimiento`).
  Crea la orden (línea 205) y cambia `Habitacion.estado` a `"mantenimiento"` (línea 209) **dentro
  del mismo `prisma.$transaction`** (línea 198) — cumple literal "en la misma transacción".
- Tipo de tarea y responsable obligatorios: `normalizarTipoTarea` (línea 171-179) y
  `textoObligatorio` (línea 184).
- Rol: `gestionarMantenimiento` en `sesion.jsx:161` = solo `mantenimiento` — **correctamente
  excluye a admin de la alta**, coincidiendo con el matiz exacto del backlog ("recepcionista/
  administrador con acceso de lectura", no de escritura). Buen detalle de lectura del backlog.
- Misma limitación de rol solo-UI que HU-32 (documentada en el propio backlog).

**Observación menor (no baja el estado):** el endpoint genérico `PATCH /:id/estado` permite fijar
`estado="mantenimiento"` a mano, sin pasar por `crearOrdenMantenimiento` — así una habitación
puede quedar en "mantenimiento" sin ninguna fila en `OrdenMantenimiento` que lo respalde. El
criterio de aceptación no exige impedir esto, así que no baja el estado de la historia, pero es un
hueco de integridad de datos a tener en cuenta si más adelante alguien reporta "por qué esta
habitación dice mantenimiento sin orden".

---

## HU-34 — Notificación automática por incidente urgente

**Estado: Cumplida.**

**Evidencia:**
- Notificación condicionada a `urgente=true`, creada en la misma transacción que la orden:
  `habitaciones.servicio.js:211-225`.
- Historial de notificaciones: `HistorialMantenimientoModal.jsx:55-78` — lista completa vía
  `GET /habitaciones/notificaciones` (`habitaciones.routes.js:8`).
- Usa la tabla `Notificacion` polimórfica tal como quedó decidido en el modelo de datos (no
  `NotificacionMantenimiento` aparte) — `tipo: "Mantenimiento"` en
  `habitaciones.servicio.js:215`.
- Canal/mensaje configurables, con mensaje automático si se deja vacío (línea 220-222).

Sin objeciones.

---

## HU-35 — Actualizar estado desde housekeeping

**Estado: Cumplida.**

**Evidencia:**
- Endpoint genérico de cambio de estado: `habitaciones.servicio.js:154-161`
  (`cambiarEstadoHabitacion`), expuesto en `PATCH /:id/estado`.
- Restricción de las opciones disponibles para housekeeping en la UI:
  `EstadoHabitacionModal.jsx:11` (`soloHousekeeping ? ["en limpieza", "libre"] : ESTADOS_HABITACION`)
  — coincide exactamente con el ejemplo del backlog ("en limpieza → libre").
- Propagación inmediata al panel: mismo `refetchInterval` de HU-32 + `invalidateQueries` al
  confirmar (`EstadoHabitacionModal.jsx:20`).
- Rol de escritura: `actualizarEstadoHabitacion` en `sesion.jsx:162` = admin o housekeeping —
  correctamente excluye a recepcionista y mantenimiento de la escritura (solo lectura, como pide
  la historia).

**Mismo hallazgo de rol que HU-32/33:** el backend no impide que cualquiera (sin importar el rol)
pegue directo al `PATCH /:id/estado` con cualquier valor de estado — la restricción a
"en limpieza"/"libre" para housekeeping es solo del modal, no del servicio. Documentado como
limitación conocida del propio backlog, igual que arriba.

---

## Resumen de contrato — Habitaciones → Reservas (punto 1 del pedido)

Verifiqué específicamente si lo que Integrante 1 expone coincide con lo que Integrante 2 consume.
Resultado: **no hay ninguna divergencia, pero tampoco hay acoplamiento real vía HTTP.**

- `reservas.servicio.js` (`consultarDisponibilidad`, línea 301-358) **no llama a
  `GET /api/habitaciones`** en ningún momento — hace `prisma.habitacion.findMany(...)` directo
  (línea 310), leyendo los campos `tipo`, `capacidad`, `piso`, `equipamiento`, `estado`,
  `tarifaPorNoche`, `activo` — los mismos siete campos, con los mismos nombres, que definió
  Integrante 1 en el schema (`backend/prisma/schema.prisma:500-519`).
- El frontend de Reservas tampoco importa `habitaciones.api.js` en ningún componente (verificado
  con grep sobre los 6 archivos `.jsx` del módulo): toda la información de habitaciones que
  muestra Reservas sale de su propio endpoint `/api/reservas/disponibilidad`, que ya viene
  enriquecido (con tarifa y total de estadía calculados).
- Conclusión: el endpoint `GET /api/habitaciones` que documentamos como "contrato" quedó sin uso
  por parte de Reservas — Integrante 2 tomó el atajo (correcto, documentado en la sección 0 de su
  propia guía) de leer la tabla directo en vez de pasar por el HTTP de otro módulo. No es un
  incumplimiento de contrato: es que el contrato real terminó siendo el *schema*, no el endpoint,
  y ahí no hay ninguna divergencia de nombres, tipos ni formato de fecha.
- La tabla `Notificacion` (compartida, definida por Integrante 1) también se usa sin fricción
  desde Reservas: mismos nombres de campo (`tipo`, `habitacionId`, `reservaId`, `destinatarioArea`,
  `canal`, `mensaje`, `fechaEnvio`) en `reservas.servicio.js:411-430`
  (`armarNotificacionConfirmacion`) que en `habitaciones.servicio.js:211-225`. Sin choques.

---

## HU-36 — Alta de reserva individual o grupal

**Estado: Cumplida.**

**Evidencia:**
- Modelo `Reserva` + `ReservaHabitacion` (1:N habitaciones): `reservas.servicio.js:452-505`
  (`crearReservaEnTransaccion`).
- Validación de disponibilidad ANTES de confirmar, sin solapamiento: `condicionSolapamiento`
  (línea 256-263) + `buscarConflictos` (línea 265-276), con protección real contra condiciones de
  carrera vía `SELECT ... FOR UPDATE` (línea 473-475) — mejor que lo mínimo pedido.
- Estado inicial `'Confirmada'`: línea 488.
- Reserva grupal (varias habitaciones): `normalizarIdsHabitacion` acepta un array (línea
  135-147), probado explícitamente en `pruebas-reservas.js`.
- Test automatizado: 65 pruebas pasan (`node backend/scripts/pruebas-reservas.js`, corridas por
  mí, ver sección de regresiones).

---

## HU-37 — Modificar o cancelar reserva

**Estado: Cumplida.**

**Evidencia:**
- Modificación: `modificarReserva` (línea 623-694) — re-valida disponibilidad excluyendo la
  propia reserva (línea 663-669), reemplaza habitaciones, permite tocar huésped/fechas.
- Solo modificable en estado `Confirmada` (línea 615-621, `exigirModificable`) — bloquea editar
  una reserva ya iniciada o cerrada, criterio razonable no exigido explícitamente pero consistente
  con el resto del ciclo de vida.
- Cancelación: `cancelarReserva` (línea 699-724) — motivo obligatorio (línea 701-705), libera el
  período automáticamente porque `ESTADOS_QUE_OCUPAN` excluye `Cancelada`
  (`reservas.constantes.js:30`).
- Probado: "al cancelar, el período vuelve a estar disponible" y "no se puede cancelar una reserva
  con el huésped ya alojado" pasan en `pruebas-reservas.js`.

---

## HU-38 — Consultar disponibilidad en tiempo real

**Estado: Cumplida**, con una precisión sobre "tiempo real".

**Evidencia:**
- Consulta pública: `GET /api/reservas/disponibilidad`, sin sesión (`App.jsx:53`, fuera de
  `<RequireSesion>`).
- Recalcula siempre contra la base (no cachea entre búsquedas):
  `DisponibilidadPublicaPage.jsx:54` (`staleTime: 0`).
- Resumen por tipo con libres/total y tarifa desde: `reservas.servicio.js:345-355`.

**Precisión:** "se actualiza automáticamente ante cada nueva reserva o cancelación" se cumple en
el sentido de que **cada búsqueda nueva** trae datos frescos de la base (nunca una respuesta
vieja cacheada) — pero la pantalla no tiene `refetchInterval` como sí tiene el panel de
Habitaciones (HU-32): si un huésped deja la pantalla de resultados abierta y otra persona reserva
la misma habitación mientras tanto, no se entera hasta volver a buscar. Es una interpretación más
débil que la de HU-32, aunque razonable (ningún módulo del proyecto usa websockets) y no diría que
incumple el criterio — lo marco como precisión, no como falla.

---

## HU-39 — Registrar datos del huésped

**Estado: Cumplida.**

**Evidencia:**
- Modelo `Huesped`, validación de obligatorios antes de confirmar: `normalizarHuesped`
  (`reservas.servicio.js:151-166`), llamada desde `normalizarAltaReserva` (línea 432-447) — corre
  ANTES de tocar la base, no después.
- Reutilización de ficha existente por documento (evita duplicar al mismo huésped):
  `resolverHuesped` (línea 387-403).
- Frontend: paso 3 del wizard exige nombre y documento antes de habilitar "Confirmar reserva"
  (`ReservaWizard.jsx:176-183`).

---

## HU-40 — Reserva desde el sitio web (autoservicio)

**Estado: Cumplida.**

**Evidencia:**
- `ReservaWebPage.jsx` reutiliza el **mismo** componente `<ReservaWizard origen="WEB">`
  (línea 113-118) que usa la carga asistida — mismo endpoint (`POST /reservas`), misma validación
  de disponibilidad, sin ninguna lógica duplicada. Cumple literal "reutilizando el mismo modelo...
  sin duplicar lógica".
- Vive fuera de `<RequireSesion>` (`App.jsx:54`), con su propio `LayoutPublico.jsx` sin menú de
  staff.
- Probado: "el canal web usa el mismo alta y la misma validación de disponibilidad" pasa en
  `pruebas-reservas.js`.

---

## HU-41 — Confirmación automática por email/SMS

**Estado: Cumplida**, dentro del alcance reducido que el propio backlog ya anticipa.

**Evidencia:**
- Notificación creada en la misma transacción del alta: `crearReservaEnTransaccion` línea
  494-502, usando `armarNotificacionConfirmacion` (línea 411-430).
- Sin proveedor real de email/SMS (no hay integración — coincide con la "limitación conocida" que
  ya señala el propio backlog para HU-46 de Check-in): el "envío" es el registro en `Notificacion`
  que exige el criterio de aceptación ("queda un registro del envío"), con fallback a canal
  "Interno" si el huésped no dejó contacto (línea 412-413) — así no se "miente" un envío que no
  pasó.
- Visible en la ficha de la reserva: `ReservaDetallePage.jsx:196-219`, con la aclaración de
  alcance explícita en pantalla (línea 200-203) — buena práctica de transparencia con el usuario
  final del sistema.

---

## HU-42 — Código único de confirmación

**Estado: Cumplida.**

**Evidencia:**
- Generación alfanumérica no correlativa: `generarCodigoConfirmacion` (línea 364-366), 4 bytes en
  hex (8 caracteres).
- Unicidad con reintento: `reservarCodigoLibre` (línea 371-378, hasta 5 intentos) +
  reintento de la transacción completa ante colisión real de constraint (línea 527-545) — mejor
  que lo mínimo pedido (doble protección: pre-chequeo y manejo de la carrera real).
- Incluido en la confirmación: `armarNotificacionConfirmacion` línea 416-419.
- Correctamente identificado como **no apto** para `crearConNumeroSecuencial` (el helper de
  Sprint 2) porque ese genera correlativos, no aleatorios — comentario explícito en línea
  368-370 mostrando que se evaluó y descartó a propósito, no por desconocerlo.

---

## Regresiones (punto 4 del pedido)

- **Diff aislado de Habitaciones** (`70fbf0d..8f13d4c`): toca únicamente el módulo nuevo,
  `backend/index.js` (+7, solo la línea de ruta), `App.jsx` (+3), `menuConfig.js` (+12),
  `sesion.jsx` (+20), `LoginPage.jsx` (chips/roles) y `MenuAcciones.jsx` (fix de posicionamiento
  del menú desplegable, ver abajo). **Cero archivos de Stock/Depósitos o Compras/Gastos
  tocados.**
- **Diff de Reservas** (`e53f43f`): además del módulo nuevo, solo `backend/index.js` (+1 línea) y
  los `package-lock.json` (ruido de metadata de npm — flags `peer` que van y vienen entre
  instalaciones, no dependencias nuevas; confirmado revisando el diff línea por línea). **Cero
  archivos de Stock/Depósitos o Compras/Gastos tocados.**
- `MenuAcciones.jsx` (componente compartido, usado en Requerimientos/Presupuestos/OC/etc. desde
  Sprint 2) sí se modificó dentro de la tanda de Habitaciones (`668621a`): cambia el
  posicionamiento del menú desplegable a `createPortal` con posición calculada, en vez de
  `absolute` relativo al botón. La interfaz (`prop acciones`) no cambió, así que no debería
  romper ningún uso existente — no encontré evidencia de que rompa algo, pero es un cambio a un
  componente compartido que se coló dentro de commits "de Habitaciones" sin mención en ningún
  mensaje de commit de que tocaba algo más allá del módulo nuevo. Otro síntoma del mismo problema
  de proceso (sin PR, sin que nadie lo señale en una revisión).
- Sin suite de tests para Sprint 1/2 que correr (el proyecto no tiene `npm test` configurado, solo
  scripts sueltos en `backend/scripts/`; no hay ninguno equivalente a `pruebas-reservas.js` para
  Stock o Compras contra el cual comparar). Verificación hecha por inspección de diff, no por
  suite automatizada preexistente.
- `node --check` sin errores de sintaxis en los 11 archivos backend de ambos módulos.
- `node scripts/pruebas-reservas.js`: **65 pruebas OK, 0 con error** (corridas por mí, no
  reportadas de palabra) — cubren explícitamente el contrato con Check-in/Check-out
  (`obtenerReserva`, `marcarEnCurso`, `marcarCerrada`, `crearReservaEnTransaccion` reusable) que
  Integrante 3 y 4 van a necesitar.

---

## Diseño (punto 5 del pedido)

**Reservas:** alineado de punta a punta. Usa `Badge` con la rampa pino/latón/info/cerrado/error
correctamente mapeada (`ESTADO_RESERVA_BADGE`), `Cifra` (Fraunces) para números destacados,
`CodigoClave`/`NombreClave`, `MiniPasos`/`PasoAPaso` para el ciclo de vida, `Modal`,
`ConfirmDialog` con variante `destructivo` solo para cancelar. El wizard replica fielmente el
patrón de píldoras de paso de `OrdenPagoWizard.jsx` (no el componente genérico `PasoAPaso`, pero
porque ese tampoco lo usa el propio `OrdenPagoWizard` — es el patrón real establecido, no una
desviación).

**Habitaciones:** también alineado (mismos componentes, mismos tokens de color). Dos
observaciones menores, ninguna grave:
1. El defecto de `Table` ya descripto en HU-31 (props sin efecto por el commit no mergeado).
2. `HabitacionModal.jsx` usa un `<Input type="number">` común para `tarifaPorNoche` en vez del
   componente `MoneyInput` (formato "$ 1.234,56" es-AR) que el proyecto ya tiene para justamente
   este caso — funciona, pero es inconsistente con cómo se cargan importes en Comprobantes/Pagos
   de Sprint 2.
3. Tanto Habitaciones como Reservas definen su propio `FORMATO_MONEDA` con
   `Intl.NumberFormat(..., { style: "currency" })` en vez de reusar `formatearMonto` de
   `frontend/src/lib/moneda.js` — no es un error (el resultado se ve bien y es consistente entre
   ambos módulos nuevos entre sí), pero es un tercer patrón de formateo de moneda conviviendo con
   los otros dos que ya tiene el proyecto. Vale la pena unificar en algún momento, no es urgente.

---

## Resumen ejecutivo

| Historia | Estado |
|---|---|
| HU-31 | Cumplida (con defecto de integración en `Table`, ver abajo) |
| HU-32 | Cumplida |
| HU-33 | Cumplida |
| HU-34 | Cumplida |
| HU-35 | Cumplida |
| HU-36 | Cumplida |
| HU-37 | Cumplida |
| HU-38 | Cumplida |
| HU-39 | Cumplida |
| HU-40 | Cumplida |
| HU-41 | Cumplida |
| HU-42 | Cumplida |

**12 de 12 Cumplidas. 0 Parciales. 0 No implementadas.**

Esto es un resultado notablemente mejor que las auditorías de Sprint 1/2 (que sí encontraron
historias parciales y brechas de rol no documentadas). La diferencia principal entre los dos
integrantes: Reservas (Integrante 2) viene con 65 pruebas automatizadas que verifican
explícitamente el contrato con Check-in/Check-out; Habitaciones (Integrante 1) no tiene ninguna
prueba automatizada — su verificación acá es 100% por lectura de código.

**El problema más urgente a resolver antes de que Integrante 3 y 4 empiecen a depender de este
trabajo no es ninguna historia incumplida — es de proceso:** Habitaciones se pusheó 8 veces
directo a `master` sin PR ni revisión, y como consecuencia una pieza real del trabajo (el fix de
`Table.jsx` para anchos de columna) quedó huérfana en una rama que nadie mergeó
(`origin/agusfar45-patch-1`, commit `6518db0`). Ninguna historia de Habitaciones depende de ese
fix para cumplir su criterio de aceptación, así que no baja el estado de HU-31 — pero es la prueba
concreta de que sin revisión, cosas se pierden en el camino sin que nadie se entere hasta que
alguien audita a mano. Si Integrante 3 o 4 llegan a necesitar tocar `Table.jsx` para su propia
pantalla, van a pisar ese mismo problema (o peor, van a reimplementar el fix por su cuenta sin
saber que ya existe). Recomendación concreta: mergear (o descartar conscientemente)
`agusfar45-patch-1` antes de que arranque el resto del sprint, y pedirle a Integrante 1 que las
próximas entregas pasen por rama + PR como el resto del equipo — no por desconfianza en el código
en sí (que auditado a mano está bien), sino porque el proceso sin revisión ya demostró que pierde
piezas.
