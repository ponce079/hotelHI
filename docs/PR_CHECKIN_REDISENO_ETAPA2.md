# Rediseño del check-in — Etapa 2 (frontend) · HU-43 a HU-47 y HU-115

Rama `feature/checkin-rediseno-front` → `feature/estadia-ocupantes` (la etapa 1 ya está ahí). Sin merge ni rebase contra `master`.

Reemplaza el asistente de 5 pasos del walk-in y la pantalla con modal del check-in con reserva por **una sola pantalla** con secciones, según el boceto aprobado ([docs/boceto-checkin.html](../docs/boceto-checkin.html)).

## Capturas (1366 px, datos de demo)

| Llegadas de hoy (con una reserva abierta) | Walk-in (dos habitaciones de distinto tipo) |
|---|---|
| ![Llegadas de hoy](capturas-checkin/1-llegadas-de-hoy-1366.png) | ![Walk-in](capturas-checkin/2-walk-in-1366.png) |

## Qué hace la pantalla

- **Encabezado** con la fecha de operación (hora argentina) y pestañas **Llegadas de hoy** (con contador) y **Walk-in**. Se conservan `?codigo=` (abre esa reserva) y `?habitacion=` (abre el walk-in con esa habitación elegida si está libre).
- **Llegadas de hoy:** búsqueda con espera, tabla navegable con teclado (flechas y Enter), chip de seña tal como está guardada ("Sin garantía · tomar al ingreso" si no hay) y aviso de reservas anteriores sin ingreso.
- **Con reserva:**
  - Resumen no editable: entrada desde las 14:00, salida hasta las 10:00, noches, tarifa con sus condiciones, ocupación ("Reservado: …" si cambió) y total.
  - Tarjeta por habitación con **Cambiar habitación** (otra libre del mismo tipo, con `excluir=` de las demás) y la marca "Cambiada (era la 270)".
- **Huéspedes:**
  - Filas agrupadas por habitación según la ocupación (adultos primero), precargadas desde las fichas Previstas. Quien reservó va como titular de su habitación, con el aviso de nombre completo en un solo campo.
  - Campos por tipo de fila (adulto, titular, titular de la reserva con teléfono obligatorio, menor con responsable y "Agregar documento (recomendado)").
  - Estado por fila, avisos de edad (13 años para la ocupación, 18 para titular y responsable), **Marcar como titular** y **Motivo** cuando el titular es distinto de quien reservó.
- **Persona que vuelve:** con tipo, país y número completos (400 ms sin tipear) completa la fila y muestra "Ficha encontrada · última estadía". Avisa si la persona está alojada en otra estadía. Nunca consulta números parciales.
- **Agregar / quitar huésped:** con reserva usa la vista previa (`previa-ocupacion`), muestra la diferencia por noche y total, el aviso de no reembolsable y el de ajuste manual perdido. "Confirmar y recotizar" aplica el cambio en pantalla; "Cancelar" deja todo igual. Si se supera la capacidad, ofrece cambiar de habitación. Nada se escribe hasta confirmar.
- **Walk-in:**
  - Salida con − / + (1 a 30 noches) y ocupación por habitación; agregar y quitar habitación.
  - Tarifa única para toda la reserva.
  - Habitaciones libres por tipo con un solo precio (el total de esa ocupación), sin las ya elegidas para otra habitación.
  - El total de la barra sale de `/reservas/cotizar` con todas las habitaciones y es el `totalEsperado`. Se usa el `planTarifarioId` de la respuesta y se envía sin `huesped`.
- **Garantía para consumos:** envuelve `GarantiaFieldset` sin modificarlo, más la línea informativa de la seña. Una sola garantía por reserva.
- **Barra fija:** resumen, "Para confirmar falta" en lenguaje de recepción (hasta 3 más "y N más"; cada ítem lleva al campo y lo enfoca), botón deshabilitado mientras falte algo y durante el envío ("Confirmando…"). Un doble clic no genera dos envíos.
- **Respuestas del servidor:**

  | Respuesta | Dónde se muestra |
  |---|---|
  | 400 `OCUPACION_INVALIDA` / `MOTIVO_TITULAR_REQUERIDO` | En la barra y en el grupo de la habitación |
  | 409 `PRECIO_CAMBIO` | "El precio cambió: antes $ X, ahora $ Y" con **Confirmar con el nuevo total** |
  | 409 `CAMBIO_HABITACION_INVALIDO` | En la tarjeta de la habitación, y se recarga la disponibilidad |
  | 409 `PERSONA_ALOJADA` | En la fila de la persona |

- **Formatos:** fechas dd/mm/aaaa y "vie 02/10"; precios "$ 40.000" con `formatearPrecio` (nuevo en `lib/moneda.js`, solo en el check-in). Ningún "HU" en la interfaz.

### Herencia de residencia y nacionalidad (validarCompleto del backend no se relaja)
- Un adulto no titular hereda el país de residencia del titular de su habitación. Un menor hereda nacionalidad y país de residencia de su adulto responsable.
- La fila lo dice ("Residencia: la del titular · Nacionalidad: la del responsable") y se corrige con **Más datos**. Un valor corregido deja de heredar; los heredados siguen al titular o responsable si cambia.
- El envío lleva siempre los valores reales resueltos. Si el origen no tiene el dato, el faltante aparece en la fila de quien hereda ("Falta la residencia del titular de la Hab. 315").

## Backend (aditivo, sin cambiar mensajes ni status)
- 409 de persona ya alojada: `codigo: "PERSONA_ALOJADA"` y `detalle.personas` con los ids temporales de las filas.
- 409 `CAMBIO_HABITACION_INVALIDO`: `detalle.habitacionIdAnterior`.
- Casos agregados a `test:checkin-rediseno`.

## Datos de demo
`npm run seed:checkin-demo`, con uso documentado en [docs/demo-checkin.md](demo-checkin.md).
- Solo corre contra una base local, con fechas relativas e idempotente.
- Lo de demo se reconoce por documentos `99…` y un manifiesto local por base (`backend/scripts/.demo-checkin.json`, ignorado por Git).
- **Secuencia de la mañana:** `npm run seed:checkin-demo -- --limpiar` y después `npm run seed:checkin-demo`. Deja todo usable aunque se haya ensayado antes:
  - `--limpiar` anula las Confirmadas de demo y **cierra con el check-out real** las estadías de demo En curso (verificación "sin novedades", pago de demo en efectivo por el saldo, anotado en el manifiesto). Si alguna no se puede cerrar, la informa con el motivo y sigue. Nunca toca reservas que no sean de demo.
  - El seed revisa las personas de cada caso antes de reutilizarlo o crearlo: si alguna sigue alojada en otra estadía, recrea el caso con personas nuevas (documentos `99…` distintos) y lo informa. Vale también para la persona que vuelve.
  - Un error en un caso no corta el script: se informa, sigue con los demás, con las habitaciones del walk-in y con la impresión final, y sale con código distinto de 0.
- **"Hoy" es el día de Argentina** (`lib/fechas.js`), a cualquier hora. Ya era así en el seed, en el endpoint de llegadas y en el encabezado de la pantalla. Se agregaron tests con instantes de madrugada: a las 02:43 del 03/10 da 03/10, y a las 23:59 del 02/10, que en UTC ya es 03/10, sigue dando 02/10.
- Casos a–g pedidos, más **h** (3 adultos en no reembolsable) e **i** (en curso desde hoy, para la persona adicional). Con 2 adultos (c) la Doble ya los incluye y quitar a uno no cambia el precio con ninguna tarifa; h es el que muestra "Tarifa no reembolsable: el precio no baja".
- **Caso f:** el check-out no emite comprobantes, así que la estadía anterior se arma con el flujo real y se corre 30 días atrás sin romper ninguna numeración. Sus pagos también se corren para no aparecer en la caja de hoy.
- **Dónde se probó:** en `hotelhi_pruebas` recién cargada (catálogo + `seed-tarifas` + `seed-demo-salta`) y en `sgh_gimena`. En las dos, dos corridas seguidas sin duplicar nada y `--limpiar` sin tocar las reservas de `seed-demo-salta`.
- **Test de la secuencia de la mañana (`npm run test:seed-demo`):** seed, check-in por la API de a, b y d, `--limpiar` y seed. Las estadías En curso de demo quedan cerradas, todos los casos aparecen y se confirman, y un seed sin limpiar recrea con personas nuevas sin cortarse.
- **En `sgh_gimena`:** `--limpiar` cerró con check-out 968DD072, 9DA1868F y E7AC5CC5, y el seed siguiente dejó todos los casos, las habitaciones del walk-in y la persona que vuelve, con código de salida 0.

## Eliminado
- `check-in/CheckInWalkIn.jsx` (asistente de 5 pasos) y `CheckInConReserva.jsx` (con el input "Documento presentado"), con sus tests.
- `PanelResumenCheckIn.jsx`, `CantidadesOcupantes.jsx` (y test), `bloqueosCheckIn.js` (y test), `validacionOcupantesIngreso.js` y `check-in/validarHuesped.js`.
- `estadia/PersonasWalkIn.jsx` (modal "Persona alojada") y `estadia/ConfirmarAmpliacion.jsx` (y test), más el caso de `EstadiaPanel.test.jsx` que solo probaba `PersonasWalkIn`.
- **Se conservan:** `EstadiaPanel` y `PersonaFormulario` (gestión de alojados), `PaisDocumentoReserva` (lo usa `ReservaWizard`) y `TituloSeccion` (lo usan `GarantiaFieldset` y `BuscarConsumoModal`).

## Pendientes
- **Retirar la ampliación cuando se retire el confirmar sin personas:** `ampliacion.servicio.js` y el parámetro `confirmacionAmpliacion` siguen porque el flujo viejo del backend los usa (se mantiene por compatibilidad).
- **Garantía (Ricardo):** la sección "Garantía para consumos" envuelve `GarantiaFieldset` tal cual; el contenido lo define su módulo.
- **Para Tomás:** `PATCH /api/reservas/:id` sigue sin exigir sesión (hallazgo de la etapa 1).
- **Numeración:** el bloque HU-107 a HU-114 sigue reservado para Ricardo.

## Pruebas
- **Vitest:** 249/249 (14 casos nuevos de la pantalla + lógica pura + formatos, y los de las correcciones).
- **Jest:** 97/97. `pruebas-estadia-consultas.js`: 14/14. `test:checkin-rediseno`: 24 bloques OK. `test:integracion` (estadía): OK. `test:seed-demo`: 6/6.
- **Navegador contra `sgh_gimena` con el seed de demo:**
  - 1: un solo `POST /confirmar` aun con doble clic y ningún guardado por persona.
  - 4: quitar con tarifa flexible −$ 4.400 por noche; con no reembolsable "el precio no baja"; cancelar deja todo igual.
  - 6: dos habitaciones, menor a cargo de la titular de la otra habitación, verificado en la base.
  - 8: walk-in Doble + Simple, `excluir` y total igual a `/reservas/cotizar`, 201.
  - 9: precio cambiado con la pantalla abierta, panel antes/ahora y confirmación con el nuevo total.
- **Fallo intermitente por tiempo:** `EstadiaPanel.test.jsx` (formularios largos con userEvent) a veces vencía a los 5 s con la suite completa en paralelo; ese archivo usa ahora 15 s de límite. En solitario cada caso tarda 1-2 s.

## Correcciones antes del merge

Caso que las disparó: la reserva **E7AC5CC5** (habitación 407) en `sgh_gimena` mostraba dos titulares y una ficha cancelada en la lista de personas.

**Causa.** El check-in en lote creó a Martín como titular (verificado) y a Marta Conte como acompañante. Después se editó a Marta desde "Personas de la estadía" y se tildó "Titular de esta habitación". `estadia.servicio.guardar` lo aceptó sin verificar si la habitación ya tenía titular, y como toda edición borra `verificadoEn`, Marta quedó sin verificar. El mismo hueco existía en la confirmación en lote (`cargaMasiva.validarLote`) y en el titular automático (`titular.servicio`). El panel listaba también la ficha Cancelada ("Reemplazada en el check-in").

**Qué cambió**
- **Un solo titular activo por habitación** en todos los caminos que escriben fichas (`estadia/titularHabitacion.js`, usado por alta y edición, lote y titular automático). Solo cuentan las fichas Previstas o Alojadas: las Canceladas y las Retiradas no.
  - Si ya hay otro titular, el servidor responde **409** con `codigo: "TITULAR_EXISTENTE"` y un mensaje que lo nombra.
  - Antes del check-in, el cambio exige `reemplazarTitular: true`. Con la estadía en curso exige `motivoCambioTitular`.
  - En la misma transacción desmarca al titular anterior y registra el evento "Cambio de titular de habitación" con el titular anterior, el nuevo, el motivo y el operador.
  - El titular automático ya no marca a una segunda persona.
- **Panel "Personas de la estadía".**
  - Las fichas canceladas no se listan ni generan avisos de faltantes. Aparecen en el "Historial" con su motivo ("Ficha dada de baja · … · Reemplazada en el check-in").
  - Los menores con motivo sin documento muestran "Sin documento (menor)".
  - Al marcar a otra persona como titular, el formulario avisa quién deja de serlo. Con la estadía en curso, el motivo es obligatorio.
- **Página de la reserva.** El encabezado (código, estado, "Volver") va primero y "Personas de la estadía" debajo.
- **Textos y fechas.** Se quitaron todos los textos "HU-…" visibles en las pantallas de reservas y estadía; los comentarios del código quedan. Las fechas se muestran como dd/mm/aaaa con ceros (`formatearFechaDdMmAaaa`, y el nuevo `formatearFechaHora` para fecha y hora).
- **Datos.** En `sgh_gimena`, la ficha de Marta Conte (E7AC5CC5) dejó de ser titular y queda Martín, según los eventos. Se registró el evento "Corrección de titular de habitación" con motivo "Corrección de datos de prueba". No se borró nada.
- **Pruebas nuevas.**
  - `test:checkin-rediseno`, bloque 15: 409 en alta, en lote y en el titular automático; el cambio con motivo deja un solo titular y su evento; una ficha cancelada no cuenta.
  - `test:integracion` (I2): el segundo titular ahora es 409.
  - Vitest: lista e historial sin canceladas; cambio de titular con motivo.
- **Textos HU en otras pantallas:** se resolvieron en la segunda corrección (ver abajo).

## Segunda corrección: editar ocupantes con la estadía en curso

Caso que la disparó: en E7AC5CC5, "Editar ocupante" de un adulto alojado ofrecía:
- ingreso, salida y habitación editables;
- "Justificación sin documento" aunque la persona tenía documento;
- "Adulto responsable: Sin asignar" para alguien nacido en 1984.

**Qué cambió**
- **Adulto responsable.** Solo aparece para menores de 18 años, según el nacimiento (`MAYORIA_EDAD`, se calcula al tipear), y para ellos es obligatorio. Para un mayor se envía `null`. El backend valida lo mismo: un adulto con responsable da 400, y un menor sin responsable también.
- **Estadía en solo lectura para alojados.** Muestra la habitación, el ingreso real (fecha y hora), la salida prevista (la de la reserva) y el rol: "Titular" o "Responsable de: …". El backend rechaza con 409 cualquier cambio de ingreso, salida o habitación de una ficha Alojada que llegue por "Editar". Para irse antes está "Registrar salida"; para quedarse más, se modifica la reserva.
- **Justificación sin documento.** Solo se muestra si no hay número de documento. A un menor sin documento le muestra el motivo guardado.
- **Cambio de documento.** Si en una ficha verificada cambia el tipo, el país o el número:
  - se pide un motivo;
  - se registra el evento "Cambio de documento" solo con los valores anterior y nuevo de esos tres campos;
  - la ficha vuelve a "Datos por verificar";
  - si la persona está alojada, se actualiza su identidad activa.

  Cambiar nombre, apellido o nacimiento registra "Corrección de datos personales", sin motivo. A una persona alojada, cambiar esos datos o el contacto no le quita la verificación. Una ficha Prevista sigue volviendo a verificarse con cualquier cambio, como antes.
- **Mover a otra habitación** (acción aparte, `POST /estadia/:reservaId/ocupantes/:id/mover`).
  - Solo para personas alojadas y entre habitaciones de la misma reserva.
  - Exige motivo y respeta la capacidad. Las habitaciones completas no se ofrecen.
  - Si se mueve al titular y quedan personas en la habitación que deja, hay que elegir un nuevo titular mayor de edad. Si en el destino ya hay titular, la persona movida deja de serlo.
  - Queda el evento "Cambio de habitación" con las habitaciones de origen y destino, el motivo y el nuevo titular. "Editar" ya no tiene campos de habitación para alojados.
- **Titular.** Sigue el flujo de la corrección anterior (confirmación de reemplazo y motivo obligatorio con la estadía en curso). Se verificó que sigue funcionando. A un menor no se le ofrece la casilla.
- **Formulario en tres bloques:** Identidad · Residencia y contacto · Estadía, con las acciones debajo.
- **Textos HU en otras pantallas.** Se quitaron "HU 61 a 64" de `ServiciosAdicionalesPage.jsx` y "HU 88" de `MovimientosPagoPage.jsx`. Son pantallas de otros integrantes y el cambio es **solo de texto**, sin tocar lógica.
- **Capturas** (E7AC5CC5, 1366 px):
  - `capturas-checkin/3-personas-de-la-estadia-1366.png`
  - `capturas-checkin/4-editar-adulto-alojado-1366.png`
  - `capturas-checkin/5-editar-menor-alojado-1366.png`
- **Pruebas.**
  - `test:checkin-rediseno`, bloque 16:
    - responsable solo para menores;
    - 409 al cambiar fechas o habitación de un alojado;
    - el cambio de documento con motivo deja el evento con anterior y nuevo, y la ficha vuelve a verificarse;
    - corrección de nombre auditada sin perder la verificación;
    - mover: otra reserva → 400, sin motivo → 400, titular sin reemplazo → 400, reemplazo menor de edad → 400, caso correcto con un titular por habitación y su evento, habitación completa → 409.
  - Vitest:
    - adulto, menor y el nacimiento cambiado a 15 años;
    - motivo del cambio de documento;
    - modal de mover.

### "Agregar persona" con la estadía en curso: diagnóstico y propuesta (no implementado)

**Qué hace hoy.** Crea una ficha Prevista y solo controla la capacidad de la habitación (`estadia.servicio.guardar`).
- **No cambia la ocupación** de la reserva: `ReservaHabitacion.adultos/menores` queda igual.
- **No recotiza** y **no muestra** una vista previa.
- "Registrar ingreso" (`accion: "ingresar"`) tampoco lo hace: la ampliación con recotización (`ampliacion.servicio.ampliarSiCorresponde`) solo corre dentro de la confirmación del check-in.
- Resultado: un tercer adulto agregado a una doble con la estadía en curso queda alojado al precio de dos.
- Además, la ficha nueva toma por defecto como ingreso la fecha de entrada de la reserva, que ya pasó.

**Por qué no es chica.**
- `modificarReserva` (y `previa-ocupacion`) rechaza toda reserva que no esté Confirmada (`exigirModificable`, `reservas.servicio.js:1338`).
- Además recotiza todas las noches cuya ocupación cambia. No tiene la noción de "desde esta noche": las noches ya pasadas se recotizarían.
- La ocupación es una sola por habitación para toda la estadía (`ReservaHabitacion.adultos/menores`), no por noche. Conservar el precio de las noches pasadas con la ocupación nueva deja datos inconsistentes.
- Mover a una persona entre habitaciones también cambia la ocupación de las dos habitaciones sin recotizar: es el mismo hueco.
- Tampoco existe hoy "quedarse más" con la estadía en curso, porque esa modificación de la reserva rechaza el estado "En curso".

**Propuesta.**
1. Agregar a `modificarReserva` una opción interna `desdeNoche` (hoy, en hora argentina), aceptada solo con la reserva En curso y llamada desde estadía. Las noches anteriores a `desdeNoche` conservan su precio congelado aunque cambie la ocupación; desde esa noche se recotiza con la regla de siempre, incluido el Ajuste B de las tarifas no reembolsables.
2. Reutilizar `ampliarSiCorresponde`, con su token de confirmación, en `guardar` al crear y en `accion: "ingresar"`:
   - si el adulto queda por encima de la ocupación base, el backend devuelve 409 `AMPLIACION_OCUPACION_REQUIERE_CONFIRMACION` con la vista previa (`diferenciaPorNoche` solo desde hoy);
   - el panel muestra la diferencia y reenvía con la confirmación;
   - la capacidad se sigue controlando como hoy.
3. Por defecto, el ingreso de una persona agregada con la estadía en curso es hoy.
4. Decidir con el equipo cómo registrar la ocupación por noche: un campo en `ReservaNoche` o mantener la ocupación por habitación y documentar que refleja la ocupación vigente. Esto toca el módulo de reservas compartido.

**Otros hallazgos (no tocados)**
- Las rutas `/api/estadia/*` respondían sin sesión. **Resuelto en la tercera corrección** (sesión y rol en el router de estadía, sin tocar el middleware).
- El mensaje guardado de "Confirmaciones enviadas" tiene fechas sin ceros ("2/10/2026"). Es un texto generado al confirmar la reserva y guardado así.

## Tercera corrección

### 1. Persona adicional con la estadía en curso (cargo en la cuenta, sin recotizar la reserva)

Primero se frenó porque el servicio de cargos no se podía usar dentro de una transacción. Se aprobó la propuesta: se agregaron dos funciones al servicio (ver "Para Agustín" abajo) y se completó el punto.

**Cuándo aplica.** En "Agregar persona" y en "Registrar ingreso" de una ficha Prevista, con la estadía En curso, cuando con esa persona la habitación supera su ocupación registrada (`ReservaHabitacion.adultos + menores`). Lógica en `estadia/personaAdicional.js`.

**Flujo**
- **Controles previos.** Primero se controlan la capacidad (adultos + menores ≤ `Habitacion.capacidad`; si se supera, 409 "La habitación … supera su capacidad", antes de cualquier vista previa), el titular único, el responsable de los menores y los datos completos.
- **Vista previa obligatoria.** El backend responde 409 `PERSONA_ADICIONAL_REQUIERE_CONFIRMACION` con la vista previa y un token. El panel la muestra con "Confirmar" y "Cancelar":
  - **Adulto (13 años o más):** por cada noche desde hoy hasta la anterior a la salida, se calcula el precio con ocupación + 1 menos el precio con la ocupación registrada. Usa el plan de la reserva y las tarifas vigentes hoy, con el motor de cotización (`tarifas/cotizacion.servicio.cotizarReserva`, sin modificarlo).
    - Si todas las noches valen lo mismo, la pantalla muestra "+$ X por noche × N noches = $ Y. Se carga en la cuenta de la habitación como «Persona adicional»".
    - Si cambian, muestra el total y el detalle por noche.
    - Si la diferencia es 0, muestra "Dentro de la ocupación base: no se genera cargo".
  - **Menor (0 a 12):** "Menor sin cargo".
- **Al confirmar, en una sola transacción:**
  - ficha **Alojada** con ingreso real = ahora;
  - un cargo por noche con un solo `createMany` (tipo "Otro", descripción "Persona adicional — Nombre Apellido", fecha de cada noche, `claveOperacion = "persona-adicional:<ocupanteId>:<fecha>"`, montos con `Prisma.Decimal`);
  - ocupación registrada + 1;
  - eventos con el operador de la sesión.

  `ReservaNoche` **no se recotiza**: el precio congelado queda intacto.
- **Salida anticipada.** "Registrar salida" anula, en la misma transacción y como baja lógica, los cargos "Persona adicional" de esa persona desde la noche de hoy, con motivo "Salida anticipada". Las noches ya usadas quedan. La ocupación registrada se ajusta según la regla de la cuarta corrección.
- **Ingreso por defecto.** Con la estadía en curso, quien se agrega tiene como ingreso hoy, y el backend lo fuerza.
- **Restricciones de venta.** La estadía mínima y el cierre a llegadas no aplican a este cálculo (cuarta corrección): siempre se puede registrar a quien se aloja.

**Criterios verificados**
- `test:checkin-rediseno`, 5 bloques nuevos:
  1. 3 cargos, ficha Alojada y `ReservaNoche` sin cambios;
  2. un día después (fechas corridas en la base de pruebas), 2 cargos;
  3. un menor no genera cargos y suma un menor a la ocupación;
  4. en la salida anticipada al día siguiente, la noche usada queda y las otras dos se anulan con su motivo;
  5. con la capacidad superada, 409.

  Cubren además "Registrar ingreso" y las dos funciones nuevas del servicio de cargos.
- **Vitest:** la vista previa en sus cuatro variantes y el flujo de confirmación con el token.
- **Navegador** (caso de demo `i`, reserva 968DD072, Doble con 2 adultos y 3 noches desde hoy). Se agregó un tercer adulto, se vio la vista previa con el detalle por noche (+$ 4.400, +$ 4.400, +$ 4.000 = $ 12.800) y se confirmó. Quedaron 3 cargos en "Cargos por habitación", la ocupación en 3 + 0 y las noches de la reserva sin cambios. Capturas: `capturas-checkin/6-persona-adicional-vista-previa.jpg` y `capturas-checkin/7-persona-adicional-cargos.jpg`.

### Para Agustín (servicios adicionales): qué se agregó en tu módulo

En `backend/src/modulos/servicios-adicionales/serviciosAdicionales.servicio.js` **solo se agregaron** dos funciones exportadas. Las líneas existentes no cambiaron: `registrarConsumo`, `anularConsumo`, las consultas y las constantes (incluida `TIPOS_SERVICIO`) siguen igual.
- **`registrarCargosEnTransaccion(tx, { reservaId, habitacionId, tipoServicio, registradoPor, cargos: [{ fechaServicio, precioUnitario, cantidad?, descripcion?, claveOperacion? }] })`**
  - Tiene las mismas validaciones que `registrarConsumo`: tipo del catálogo (Minibar no, porque descuenta stock y va de a uno), precio y cantidad válidos, monto máximo, reserva En curso, habitación de la reserva y fecha dentro de la estadía.
  - Hace un solo `createMany` y registra un evento "Agregar cargos".
  - No abre transacción ni vuelve a bloquear la reserva: la bloquea quien llama.
  - Es idempotente por `claveOperacion`: un reintento no duplica ni registra otro evento. Una clave usada en otra habitación da 409.
- **`anularCargosEnTransaccion(tx, { reservaId, ids? | claveOperacionPrefijo?, fechaServicioDesde?, motivo, operador })`**
  - Hace la baja lógica con motivo, `anuladoPor` y `anuladoEn`, con un solo `updateMany`, y registra un evento "Anular cargos".
  - Sin coincidencias no escribe nada.
- **Pruebas:** bloque "cargos en lote" de `test:checkin-rediseno`. Cubre el lote y el reintento sin duplicar, las validaciones y la anulación por prefijo y fecha con su motivo.
- **Pendiente:** reclasificar "Persona adicional" como **ingreso de alojamiento**. Hoy usa el tipo "Otro" con descripción; no se agregó un tipo nuevo a `TIPOS_SERVICIO`.

### 2. Mover entre habitaciones de la misma reserva
Sin cambios de precio (limitación documentada). La confirmación muestra "El precio de la estadía no se recalcula por este cambio".

### 3. Sesión en las rutas de estadía

Todas las rutas `/api/estadia/*` usan `requiereSesion` + `requiereRol` (middleware sin cambios). Sin token devuelven 401 y un rol sin permiso, 403. En las rutas que escriben, el operador de los eventos sale de la sesión (`req.usuarioActual.usuario`) aunque el cuerpo mande otro.

| Ruta | Pantallas que la usan | Roles |
|---|---|---|
| `GET /alojados` | Personas alojadas (menú: admin, recepcionista) | admin, recepcionista |
| `GET /:reservaId/ocupantes` | Personas de la estadía (detalle de reserva, también el gerente con `verReservas`), check-in (precarga de fichas) | admin, recepcionista, gerente |
| `GET /:reservaId/historial` | Pestaña Historial del detalle de reserva | admin, recepcionista, gerente |
| `POST /:reservaId/titular` | Personas de la estadía (titular automático, solo si puede editar) | admin, recepcionista |
| `POST /:reservaId/ocupantes` | Agregar persona | admin, recepcionista |
| `PUT /:reservaId/ocupantes/:id` | Editar ocupante | admin, recepcionista |
| `POST /:reservaId/ocupantes/:id/accion` | Verificar, ingresar, cancelar, registrar salida | admin, recepcionista |
| `POST /:reservaId/ocupantes/:id/mover` | Mover a otra habitación | admin, recepcionista |

- **Fuera de estas rutas:** housekeeping y check-out no llaman a `/api/estadia`. Check-out usa `/api/check-out` y `/api/pagos-estadia`.
- **Token:** el frontend lo manda en todas estas llamadas, porque todas pasan por `lib/api.js`.
- **Prueba automática (`test:integracion`):** 401 sin token y 403 para housekeeping en las 8 rutas. El gerente lee fichas e historial, pero recibe 403 en alojados y en las escrituras. Además verifica que el operador sale de la sesión.
- **Navegador, con sesión de recepcionista:** respondieron 200 check-in (`/estadia/127/ocupantes`), Personas de la estadía (ocupantes e historial), Personas alojadas (`/estadia/alojados`) y check-out.

### 4. Pendientes (sin implementar)
- **Ocupación por noche y recotización "desde esta noche"** en reservas. Es una decisión de equipo y toca el módulo compartido de reservas (`modificarReserva` solo acepta reservas Confirmadas y la ocupación es una por habitación para toda la estadía).
- **Extender la estadía con la reserva En curso:** hoy no se puede, porque `exigirModificable` la rechaza.
- **Recotizar al mover personas entre habitaciones:** hoy el precio no cambia, y se avisa en la confirmación.
- **Persona adicional:** reclasificar el cargo como ingreso de alojamiento (hoy tipo "Otro").
- **Para Tomás:** `PATCH /api/reservas/:id` sigue sin exigir sesión.

## Cuarta corrección

### 1. Persona adicional y restricciones de venta

La estadía mínima y el cierre a llegadas son restricciones de **venta**: no aplican al precio de una persona adicional en una estadía ya vendida y En curso. Antes, una temporada con estadía mínima mayor que las noches restantes impedía registrar a la persona. Ahora se puede: registrar a quien se aloja es obligatorio.

- **Motor de cotización** (`tarifas/cotizacion.servicio.js`; Gimena, responsable de tarifas, autorizó el cambio):
  - `cotizarEstadia(data, cliente, precargado, opciones)` y `cotizarReserva(datos, cliente, opciones)` aceptan la opción `{ ignorarRestriccionesVenta: true }`, que omite **solo** la estadía mínima y el cierre a llegadas.
  - El precio por noche, el plan, la temporada, el adicional por adulto, los menores sin cargo y el modificador por día de la semana se calculan igual.
  - **Sin la opción, el comportamiento no cambia.**
- **Dónde se usa:** solo en la vista previa y el cálculo de cargos de la persona adicional (`estadia/personaAdicional.js`).
- **Tests nuevos:**
  - `pruebas-cotizacion.js`: con la opción, 1 noche de un evento con mínima 3 se cotiza al mismo precio por noche que dentro de una estadía que cumple la mínima; sin la opción se sigue rechazando. Lo mismo con el cierre a llegadas.
  - `test:checkin-rediseno`: temporada con estadía mínima 3 y estadía En curso con 1 noche restante. Se agrega un adulto con 1 cargo correcto (el adicional por adulto del evento) y, sin la opción, la cotización sigue exigiendo la mínima.
- **Tests de tarifas y reservas corridos** (todos OK):
  - tarifas: `pruebas-cotizacion` 18/18 (16 previas + 2 nuevas), `pruebas-temporadas` 15/15, `pruebas-planes-tarifarios` 11/11, `pruebas-ajuste-penalidad` 26/26;
  - reservas y estadía: `pruebas-reserva-precio` 13/13, `pruebas-reservas` 76/76, `pruebas-senia-reserva` 10/10, `pruebas-checkin` 32/32, `pruebas-checkout-facturacion` 18/18, `pruebas-servicios-adicionales` 24/24, `pruebas-integracion-mantenimiento-checkout` 6/6.

### 2. Ocupación después de una salida anticipada (regla)

- **Si la persona entró como persona adicional** (la registra el evento "Persona adicional"; así también se reconoce a un menor o a un adulto sin cargo), "Registrar salida" antes de la salida prevista hace, en la misma transacción:
  - anular sus cargos de las noches no usadas;
  - bajar en 1 la ocupación registrada de la habitación en la que se sumó (adulto o menor, según cómo entró);
  - registrar el evento "Ocupación ajustada", con la ocupación anterior y la nueva y el motivo "Salida anticipada de una persona adicional".
- **Si la persona era de la reserva original,** la ocupación registrada **no cambia**: el precio congelado de la reserva no se reintegra.
- **Confirmación en pantalla:** "Registrar salida" pide confirmación. Para una persona de la reserva original muestra "La tarifa de la reserva no cambia por esta salida."; para una persona adicional, que se anulan sus cargos de las noches que no usa y que baja la ocupación.
- **Tests:**
  - backend: el adulto adicional pasa de 3 + 0 a 2 + 0, con evento; la salida de alguien de la reserva original no cambia la ocupación; el menor adicional pasa de 2 + 1 a 2 + 0;
  - Vitest: los dos mensajes de la confirmación.
- **Navegador** (caso de demo `i`, 968DD072):
  - se agregó un tercer adulto (3 cargos) y se simuló "el día siguiente" corriendo un día hacia atrás las fechas de esa reserva de demo en `sgh_gimena`;
  - se registró su salida desde el panel;
  - resultado: ocupación 2 + 0, la noche usada quedó vigente ($ 4.400), las otras dos se anularon con "Salida anticipada" y quedó el evento "Ocupación ajustada";
  - en otra persona de la reserva original, la confirmación muestra "La tarifa de la reserva no cambia por esta salida." (se canceló sin registrar la salida).

  Captura: `capturas-checkin/8-salida-persona-adicional.jpg`.

## Quinta corrección

### 1. Nombres y apellido separados desde la reserva

- **Huesped:** columnas nuevas `nombres` y `apellido` (aditivas, en la misma migración de estadía). `Huesped.nombre` sigue siendo el nombre completo y se arma como "nombres apellido" cuando están los dos, así que comprobantes, búsquedas y confirmaciones no cambian.
- **Alta de reserva de mostrador:** `ReservaWizard` pide **Nombres \*** y **Apellido \*** por separado. `normalizarHuesped` y `resolverHuesped` guardan los dos.
  - Quien manda solo `nombre` sigue funcionando como antes.
  - La reserva y las llegadas exponen `nombres` y `apellido`.
- **Walk-in:** el huésped armado desde el titular guarda los dos.
- **Titular automático** (`titular.servicio.js`): toma nombres y apellido del huésped cuando los tiene. Un huésped viejo, con el nombre completo en un solo campo, sigue como siempre: todo en `nombre`, apellido vacío y el aviso.
- **Check-in y ficha de ocupante:** precargan cada uno en su campo. El aviso "separá nombre y apellido" queda solo para huéspedes viejos. **Nunca se parte un nombre viejo automáticamente.**
- **Sincronización:** todo camino que actualiza el Huesped desde una ficha guarda nombres y apellido y recalcula `nombre`. Eso incluye el upsert de `vincularPersona`, la carga en lote (`resolverHuespedes` / `actualizarFichasEnLote`), la edición de una ficha, el alta de reserva y el walk-in.
- **`GET /api/huespedes/por-documento`:** sin ficha previa, devuelve nombres y apellido del Huesped. El nombre completo, solo si el huésped no los tiene separados.
- **Para el e-commerce** (rama `feature/ecommerce`, no se tocó): **debe enviar `nombres` y `apellido` por separado** en el huésped del alta. Hoy manda solo `nombre`, que sigue aceptándose, pero deja al huésped sin los campos separados.

### 2. Mayúscula inicial

`formatearNombrePropio` (`frontend/src/lib/nombres.js`, con tests) se aplica al salir del campo en el check-in, la ficha de ocupante y el alta de reserva:
- pone mayúscula inicial en cada palabra, sin agregar ni quitar tildes ("maria cruz" → "Maria Cruz");
- deja las partículas (de, del, la, las, los, y, da, di, van, von) en minúscula, salvo al inicio ("juan de la vega" → "Juan de la Vega");
- solo actúa en el frontend; el backend no reescribe nombres.

### 3. Campos obligatorios

- **Check-in:** `camposObligatorios` usa las mismas reglas que `revisarFila`, que es lo que bloquea "Confirmar check-in":
  - el documento según la fila;
  - la residencia propia, salvo que se herede;
  - localidad y domicilio del titular de la habitación;
  - el **teléfono solo del titular de la reserva**;
  - el **responsable y su vínculo solo de menores de 18**;
  - la autorización según el vínculo.

  Cada rótulo obligatorio lleva asterisco y la sección muestra "* obligatorio". El motivo del titular distinto también lleva asterisco.
- **Ficha de ocupante:** "* obligatorio" en Identidad y Estadía; domicilio, teléfono y correo "(opcional)".
- **Alta de reserva:** "* obligatorio"; preferencias y canal de confirmación "(opcional)".

### 4. Vínculo del responsable con el menor

- **Catálogo único** en `lib/vinculos.js`, en el backend y en el frontend, con un test de igualdad: "Padre o madre", "Tutor legal", "Otro familiar", "Otro adulto a cargo". El backend rechaza valores fuera del catálogo.
- **Obligatorio para todo menor de 18** (`MAYORIA_EDAD`), incluidos los de 13 a 17 que cuentan como adultos para la ocupación.
- Con "Otro familiar" u "Otro adulto a cargo", la pantalla muestra "Pedí la autorización de los padres o tutores" y la casilla obligatoria "Autorización presentada" (`autorizacionPresentada = true`).
- Columnas nuevas `vinculoResponsable` y `autorizacionPresentada` en `OcupanteReserva`, en la misma migración.
- **Validación:**
  - en la confirmación del check-in (`ocupacionIngreso`), en la carga en lote y al guardar una ficha;
  - en `validarCompleto`, para verificar o ingresar;
  - y en el frontend.

  El vínculo queda en la ficha del menor y en el evento "Check-in: ocupantes registrados" (`menores: [{ ocupanteId, responsableId, vinculo, autorizacionPresentada }]`).
- **Personas de la estadía** muestra "Responsable: Martín Gutiérrez · Padre o madre" y, si corresponde, "· Autorización presentada".

### 5. "Marcar documento verificado"

El botón "Verificar datos" se llama ahora **"Marcar documento verificado"** y solo aparece en fichas con "Datos por verificar".

### Migración

`prisma/estadia-ocupantes-cargos.sql` suma 4 columnas aditivas, con el mismo script y runbook (`actualizar-esquema-estadia.js`). Probada de las dos formas:
- **desde cero:** base local temporal `hotelhi_migracion_prueba` con el esquema de master. Aplicó 32 operaciones, `prisma migrate diff` contra `schema.prisma` de la rama dio vacío, la segunda corrida aplicó 0 y la base se borró al terminar;
- **sobre `hotelhi_pruebas`**, que ya tenía la migración anterior: aplicó solo las 4 columnas y la segunda corrida aplicó 0.

También se aplicó en `sgh_gimena` (local).

### Demo

- **Casos:** nombres y apellido separados en todos, salvo **e** (el huésped viejo). El menor del caso **a** viene con "Padre o madre"; el de **b**, con "Otro familiar" y autorización presentada.
- **`--limpiar`:** ahora también libera las habitaciones que el check-out de la demo deja "en limpieza".
- **Capturas:**
  - `9-checkin-nombres-separados-y-vinculo-1366.png`
  - `10-checkin-otro-familiar-con-autorizacion-1366.png`
  - `11-checkin-huesped-viejo-aviso-1366.png`
  - `12-personas-de-la-estadia-vinculo-1366.png`

### Pruebas

- **Backend:**
  - `test:checkin-rediseno`, 24 bloques. Cubren nombres y apellido (alta, titular automático, edición sincronizada, persona que vuelve) y el vínculo (sin autorización 400; con autorización confirma, se guarda y queda en el evento; un valor fuera del catálogo 400; un adulto no lleva vínculo).
  - Jest 97/97: catálogo de vínculos, migración y validación de ocupación.
  - `test:seed-demo` 6/6, con nombres separados y menores con su vínculo.
- **Vitest 249/249:** nombres, check-in (precarga separada sin aviso, asteriscos por fila, autorización que bloquea y se envía), ficha de ocupante y alta de reserva.

## Para Ricardo: el saldo descuenta la garantía (solo informado, no se tocó)

E7AC5CC5 muestra un saldo de $ 72.400: 128.000 − 25.600 de seña − **30.000 de garantía**.

- **Dónde:** `backend/src/modulos/check-out/checkOut.servicio.js`, `consolidarCargos`, líneas 162-173. El `aggregate` de `pagoEstadiaMedio` suma todos los pagos no anulados, sin filtrar por concepto.
- **Cómo llega a pantalla:** lo usa `calcularSaldoReserva` (`pagos-estadia/pagoEstadia.servicio.js:33`) y se muestra en `ReservaDetallePage.jsx:302`.
- **Propuesta:**
  1. Excluir la garantía de `totalPagado` filtrando el `aggregate` con `pagoEstadia: { reservaId: id, anulado: false, concepto: { not: CONCEPTO_GARANTIA } }` (constante de `pagoEstadia.constantes.js`).
  2. Mostrar la garantía aparte, como depósito que se devuelve o se aplica en el check-out.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
