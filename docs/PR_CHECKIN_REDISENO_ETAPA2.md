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
- Lo de demo se reconoce por documentos `99…` y un manifiesto local por base (`backend/scripts/.demo-checkin.json`, ignorado por Git). `--limpiar` anula con baja lógica.
- Casos a–g pedidos más **h** (3 adultos en no reembolsable). Con 2 adultos (c) la Doble ya los incluye y quitar a uno no cambia el precio con ninguna tarifa; h es el que muestra "Tarifa no reembolsable: el precio no baja".
- **Caso f:** el check-out no emite comprobantes, así que la estadía anterior se arma con el flujo real y se corre 30 días atrás sin romper ninguna numeración. Sus pagos también se corren para no aparecer en la caja de hoy.
- **Dónde se probó:** en `hotelhi_pruebas` recién cargada (catálogo + `seed-tarifas` + `seed-demo-salta`) y en `sgh_gimena`. En las dos, dos corridas seguidas sin duplicar nada y `--limpiar` sin tocar las reservas de `seed-demo-salta`.

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
- **Vitest:** 230/230 (14 casos nuevos de la pantalla + lógica pura + formatos, y 6 de las correcciones).
- **Jest:** 88/88. `pruebas-estadia-consultas.js`: 14/14. `test:checkin-rediseno`: 16 bloques OK. `test:integracion` (estadía): OK.
- **Navegador contra `sgh_gimena` con el seed de demo:**
  - 1: un solo `POST /confirmar` aun con doble clic y ningún guardado por persona.
  - 4: quitar con tarifa flexible −$ 4.400 por noche; con no reembolsable "el precio no baja"; cancelar deja todo igual.
  - 6: dos habitaciones, menor a cargo de la titular de la otra habitación, verificado en la base.
  - 8: walk-in Doble + Simple, `excluir` y total igual a `/reservas/cotizar`, 201.
  - 9: precio cambiado con la pantalla abierta, panel antes/ahora y confirmación con el nuevo total.
- **Fallo preexistente intermitente:** `EstadiaPanel.test.jsx > detecta correo repetido…` a veces vence a los 5 s bajo carga, igual que en la línea base.

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
- Las rutas `/api/estadia/*` responden sin sesión: `POST …/mover` sin token devuelve 400 por el operador, no 401. Es preexistente y lo tiene que ver Tomás (login).
- El mensaje guardado de "Confirmaciones enviadas" tiene fechas sin ceros ("2/10/2026"). Es un texto generado al confirmar la reserva y guardado así.

## Para Ricardo: el saldo descuenta la garantía (solo informado, no se tocó)

E7AC5CC5 muestra un saldo de $ 72.400: 128.000 − 25.600 de seña − **30.000 de garantía**.

- **Dónde:** `backend/src/modulos/check-out/checkOut.servicio.js`, `consolidarCargos`, líneas 162-173. El `aggregate` de `pagoEstadiaMedio` suma todos los pagos no anulados, sin filtrar por concepto.
- **Cómo llega a pantalla:** lo usa `calcularSaldoReserva` (`pagos-estadia/pagoEstadia.servicio.js:33`) y se muestra en `ReservaDetallePage.jsx:302`.
- **Propuesta:**
  1. Excluir la garantía de `totalPagado` filtrando el `aggregate` con `pagoEstadia: { reservaId: id, anulado: false, concepto: { not: CONCEPTO_GARANTIA } }` (constante de `pagoEstadia.constantes.js`).
  2. Mostrar la garantía aparte, como depósito que se devuelve o se aplica en el check-out.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
