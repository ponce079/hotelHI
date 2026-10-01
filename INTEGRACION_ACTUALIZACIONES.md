# Integración de actualizaciones del equipo — 29/09/2026

## Nacimiento desde la reserva — 01/10/2026

El formulario de reserva y el ingreso sin reserva piden nacimiento del
titular. El número de documento ya era obligatorio y conserva esa validación.
El backend exige nacimiento válido y 18 años cumplidos al ingresar en las
nuevas reservas. Se guarda `Huesped.fechaNacimiento` y se copia al ocupante
automático; el formulario de edición precarga la fecha disponible.

Se agregó una columna nullable para conservar los huéspedes anteriores sin
inventar fechas. El SQL aditivo está en `backend/prisma/nacimiento-titular.sql`;
solo se actualizó el esquema de `hotelhi_estadia_demo` y
`hotelhi_adaptacion_test`, ambas locales. No se aplicó a la base compartida.
Se adaptaron fixtures y datos ficticios de demostración al nuevo campo.
Pruebas: 66 backend, 213 frontend, integración real local y compilación
aprobadas, incluyendo la persistencia y copia de nacimiento al titular.

## Edad del titular y contacto de menores — 01/10/2026

Al completar la ficha del titular se exige fecha de nacimiento válida y
18 años cumplidos en la fecha de ingreso. El backend identifica al titular
mediante el vínculo auditado o el documento del huésped; no confía en una
marca enviada por el formulario. Las fichas automáticas pueden nacer
incompletas, pero no guardarse como completadas con un titular menor.

Para menores se ofrece «Usar correo y teléfono del adulto responsable».
Es opcional: pueden tener contacto propio o dejar ambos campos vacíos.
El servidor copia los datos disponibles del adulto de esa reserva y valida
su edad. El contacto compartido se admite entre el responsable y los menores
a su cargo; el control de correo duplicado se conserva para otras personas.
La copia se realiza al guardar, no es una sincronización permanente. No se
agregaron columnas ni se alteró la base compartida.

Pruebas agregadas: límite exacto de 18 años, fecha ausente, copia del contacto
real del responsable, contacto ausente, responsable inválido y excepción de
duplicados familiares. La integración real local también prueba el rechazo
del titular menor y el guardado de un menor con correo y teléfono del tutor.

## Pruebas adicionales del cierre y garantía

Se repitieron las suites completas: 61 pruebas backend y 211 frontend
aprobadas. Se amplió la integración real en `hotelhi_adaptacion_test`:
rechazo de liquidación sin verificación, sin confirmación o con total
desactualizado; aplicación de $8.000 y devolución de $22.000; dos solicitudes
simultáneas de liquidación (solo una se acepta, sin duplicar importes);
saldo reducido únicamente por lo aplicado; cierre bloqueado con deuda;
pago restante, cierre correcto y rechazo de liquidación posterior al cierre.
También sigue pasando el caso de devolución completa de $30.000.
No se alteraron las reservas de la base de demostración del usuario ni la
base compartida. Estas comprobaciones son automáticas, no una revisión
visual manual del navegador.

## Garantía integrada al check-out

La pantalla organiza el cierre en cinco pasos: verificación de todas las
habitaciones, confirmación de cargos, resolución de garantía, pago del saldo
y cierre. La recepción de una garantía separada ya no figura como pago de
alojamiento en esa tabla; se conserva visible en el apartado de garantía.
Los registros históricos sin marca de garantía separada mantienen su
tratamiento anterior y no se reclasifican automáticamente.

La liquidación se habilita después de verificar habitaciones y confirmar
cargos. El backend comprueba ambas condiciones y compara el total confirmado
con el total actual bajo el bloqueo de la reserva. Conserva los controles
que impiden aplicar más que el saldo o devolver/aplicar más de lo recibido.
La cuenta de estadía ofrece un enlace al check-out para resolver la garantía;
allí solo muestra el resumen, evitando un segundo flujo sin verificación.

El pago final se habilita en la pantalla cuando no queda garantía pendiente.
Si cambia el detalle de cargos, se invalida la confirmación del huésped.
Una aplicación o devolución sigue siendo explícita: el sistema no transfiere
dinero y el operador debe registrar una devolución efectivamente realizada.
El cierre conserva las validaciones de saldo, verificación y garantía resuelta.

Validación: 61 pruebas backend, 210 frontend existentes y una nueva prueba
del flujo de garantía aprobadas; integración completa en base local aprobada.
No se modificó el esquema ni la base compartida, y no se creó PR.

## Restricciones de cargos solicitadas

El alta de consumos ahora rechaza fechas anteriores al ingreso o posteriores
al día de salida, comparando días en Argentina. El día de salida se admite
mientras la reserva permanezca en curso (por ejemplo, un desayuno previo
al check-out). Una reserva cerrada devuelve un mensaje específico y HTTP
409. La validación se ejecuta con la reserva bloqueada, antes de descontar
stock, crear el consumo o auditarlo. El formulario también muestra el
aviso de fecha y evita enviar una carga fuera de la estadía.
No se alteraron consumos existentes ni se aplicó una migración de base.

## Corrección de visualización de consumos — 30/09/2026

Se reprodujo en la base local: el resumen sin fechas y el de la reserva
devolvían tres consumos por $220.000, pero el período 30/09 devolvía cero.
El filtro usaba medianoche UTC; los registros de las 23 horas argentinas
ya pertenecían al 01/10 en UTC. Ahora el rango del período se convierte
desde medianoche argentina a UTC, con extremo final exclusivo y validación
de fechas/rango. Se mantiene el criterio del reporte: fecha de registro
(`fechaHora`), no fecha de prestación ingresada manualmente.

La ficha de habitación solo mostraba reserva activa y mantenimiento.
Se agregó `CargosHabitacion.jsx`, restringido al permiso de consultar
consumos: muestra los de esa habitación en la reserva activa, identifica
anulados y los excluye del total. Reutiliza la invalidación de consultas
del alta de consumos para actualizarse.

Comprobación después del cambio: el mismo período devuelve HTTP 200,
tres cargos y $220.000. No se volvieron a cargar ni modificar esos registros.
Pruebas: 50 backend y 207 frontend aprobadas; compilación correcta. Las
regresiones cubren horario nocturno argentino, filtros inválidos, separación
por habitación, anulaciones y actualización del listado.

## Estado más reciente: adaptación local — 30/09/2026

Se integró el código de `master` `963d60c` sobre el trabajo local de
`feature/estadia-ocupantes`, conservando las correcciones del titular automático.
No se hizo commit, push ni PR. El respaldo previo está en
`.local/integracion-master-20260930/respaldo` (incluye configuración privada;
no subirlo al repositorio).

Cambios de compatibilidad realizados:

- Habitaciones usa `tipoHabitacionId` y el catálogo `TipoHabitacion` del equipo.
  Se incorporaron sus módulos, rutas y pantallas de tipos y tarifas.
- El precio de alojamiento se obtiene de `ReservaNoche.precioNoche`.
  Se retiraron `tarifaPactada`, `ocupacionIncluida`, `precioPersonaExtra` y
  `serviciosIncluidos` del esquema y de la migración aditiva de estadía.
  También se eliminaron el panel/servicio de condiciones anteriores y el
  cargo de tipo «Persona adicional»: la ocupación se cotiza con el motor.
- Check-in toma `adultos` y `menores` de `ReservaHabitacion`; se eliminó
  la segunda declaración `cantidadesOcupantes`. El backend rechaza ese
  contrato antiguo con 400 y un mensaje para actualizar la pantalla.
  Comprueba número de fichas, edades, verificación y capacidad.
- El walk-in combina selección de habitación/ocupación/plan con las fichas
  completas, sin crear otro borrador del titular. Todo el alta se revierte
  si alguna condición impide el ingreso.
- Al modificar una reserva confirmada se conservan los IDs de habitaciones
  que permanecen y las fichas existentes. Las fechas de fichas que cubrían
  toda la reserva acompañan el cambio y requieren nueva verificación.
  Quitar una habitación con ocupantes activos se rechaza para evitar
  asignaciones huérfanas. Las noches se guardan desde reservas con el motor.
- El reintento tras agotarse el tiempo de una reserva vuelve a consultar
  disponibilidad y cotización; no reutiliza la estructura antigua de IDs
  ni repite automáticamente una operación financiera incierta.
- Se conservaron cargos por habitación, anulación e idempotencia, garantía
  separada, revisión por habitación y cierre de ocupantes en check-out.
- Se actualizaron fixtures y la prueba de integración para el nuevo esquema.

Verificación: 47 pruebas Jest, 206 Vitest, 16 de cotización, 13 de precio de
reserva y 26 de ajustes/penalidades aprobadas; build del frontend correcto.
El circuito real completo pasó en `hotelhi_adaptacion_test`, una base local
en puerto 3308. No se ejecutaron estas pruebas contra la base compartida.

Para pruebas manuales se preparó **otra base local**, `hotelhi_estadia_demo`,
con habitaciones 301–304 y usuarios de prueba. `npm.cmd run dev:estadia`
levanta el proyecto contra ella y desactiva correos, sin modificar `.env`.
Frontend, habitaciones, reservas, resumen de cargos y login se comprobaron
con HTTP 200. Guía completa: [PRUEBAS_ESTADIA_LOCAL.md](PRUEBAS_ESTADIA_LOCAL.md).

**Alcance:** esta es una adaptación para pruebas locales, no una certificación
para merge. Siguen pendientes los rediseños indicados en la guía y los
defectos de validación documental/fechas de consumos de la revisión previa.
No se aplicó ninguna migración a la base compartida en esta adaptación.
Las secciones siguientes son históricas: sus cantidades declaradas,
condiciones de habitación y referencias al esquema anterior no describen
el contrato actual.

**Revisión posterior pendiente de corrección:** se verificaron defectos en validación documental, reutilización de datos, validaciones del borrador de walk-in y fechas de consumos. Las pruebas registradas abajo no cubrían todos esos requisitos. Antes del merge, aplicar y comprobar la [propuesta de corrección del flujo](PROPUESTA_CORRECCION_FLUJO_ESTADIA.md). Esa propuesta todavía no fue implementada.

Para la secuencia completa desde el lunes 28/09 a las 11:57, consultar
[el informe consolidado del período](INFORME_TRABAJO_DESDE_2026-09-28_1157.md).
Ese informe también registra las diferencias detectadas al contrastar la documentación inicial con el código actual.

## Resultado de la revisión

La actualización sobrescribió partes de la implementación de estadía. Los archivos nuevos de `estadia` y de cantidades de ocupantes seguían presentes, pero faltaban sus integraciones en el esquema Prisma, las rutas, los servicios y las pantallas existentes.

Se reconstruyeron esas integraciones sobre la versión recibida. No se reemplazó el proyecto por el respaldo antiguo. Esta carpeta no contiene `.git`: la revisión se basó en los archivos locales, los respaldos disponibles, la documentación y las pruebas, no en una comparación contra commits de GitHub.

## Conservado del equipo

- Login real, tokens, perfil, gestión de usuarios y modelo `Usuario`.
- Interceptores de sesión del cliente HTTP y control de acceso de las pantallas existentes.
- Límite de conexiones y registro de errores de MariaDB.
- Manejo de errores del servidor y tareas de stock; se eliminó solamente la segunda llamada duplicada al inicio del barrido de stock.
- Pantallas y pruebas incorporadas por el equipo, incluidas las de usuarios.

## Restaurado y adaptado

- Modelos de ocupantes, asignaciones, eventos y campos económicos de estadía, junto al esquema nuevo de usuarios.
- Ruta `/api/estadia` y navegación a `/personas-alojadas`.
- Registro individual, menores responsables, verificación y cantidades declaradas por habitación.
- Check-in con y sin reserva: ingreso y garantía en una misma transacción.
- Cargos por habitación/reserva: cantidad, precio unitario, descripción, fecha, servicios incluidos, idempotencia y anulación con motivo.
- Descuento real de stock de minibar mediante el servicio existente.
- Tarifa pactada y conservación de las condiciones al modificar reservas.
- Adicionales por ocupación con propuesta y confirmación.
- Cuenta desglosada por habitación, revisión de cada habitación, liquidación de garantías y cierre de ocupantes/asignaciones.
- Número de habitación destacado y titular en letra pequeña en el flujo de consumos.
- Comandos de desarrollo y generación de Prisma; opción `DATABASE_SSL=false` para pruebas locales.
- Accesibilidad del diálogo compartido y pruebas de check-in adaptadas a la exigencia de todos los ocupantes.

Se corrigió además el tratamiento de garantías históricas: únicamente `garantiaSeparada=true` entra en el circuito de devolución/aplicación. Las anteriores conservan su tratamiento como pago. Los conflictos de reserva al hacer walk-in ahora conservan su respuesta HTTP 409 y no se convierten en un error 500.

## Base compartida y respaldo

Se ejecutó `node scripts/migrar-estadia.js` en modo de verificación: **0 operaciones aditivas pendientes**. No se ejecutó `--aplicar`, `db push`, semillas ni pruebas de escritura contra la base compartida.

Se regeneró el cliente Prisma local. No es necesario volver a crear las tablas de estadía en la base compartida comprobada.

Antes de editar se guardó una copia del código recibido en `.local/antes-integracion-20260929/`. No contiene una copia del `.env`. Se agregó `.local/` al `.gitignore` para excluir respaldos, bases locales y herramientas de prueba.

## Verificación

### Corrección posterior: timeout al confirmar reserva con seña

Se recibió un error Prisma `P2028` en `tx.pagoEstadia.create()`: la transacción tenía un límite de 15.000 ms y llevaba 15.882 ms. El fallo no era específico de efectivo o transferencia ni demostraba una columna faltante.

El alta con seña reutilizaba la consolidación completa de cuenta, que consulta reserva, consumos, revisiones, pagos y garantías. Para una reserva recién insertada, esas consultas adicionales no son necesarias: todavía no hay movimientos previos. Las ampliaciones de estadía podían contribuir a la latencia, aunque el mensaje no permite atribuir todo el tiempo a una consulta concreta.

Se agregó `crearSeniaReservaNuevaEnTransaccion` en `pagoEstadia.servicio.js`: calcula el saldo inicial a partir de la reserva y tarifas pactadas recién guardadas, sin aceptar un saldo del cliente. Conserva las validaciones de importe y medios y la escritura transaccional. Los pagos de reservas existentes mantienen el cálculo fresco completo de saldo. El límite del alta con seña se amplió inicialmente a 30.000 ms y luego a 300.000 ms (5 minutos). La solicitud posterior reemplaza ese valor por **60.000 ms (1 minuto)** con recuperación guiada. `maxWait` permanece en 10.000 ms para adquirir la transacción; no se agregaron reintentos automáticos de timeout.

Pruebas posteriores a esta corrección: **29 pruebas de backend aprobadas**, sintaxis correcta e integración local de seña en efectivo y transferencia, saldo y rollback ante importe excesivo. Se agregó `backend/src/modulos/pagos-estadia/seniaReservaNueva.test.js` y se amplió `backend/scripts/pruebas-estadia-integracion.js`, deshabilitando expresamente el correo en ese script. No se realizaron escrituras ni pagos de prueba contra la base compartida; el desempeño en esa conexión requiere comprobarse con el servidor actualizado. Los resultados de frontend que siguen son de la ejecución anterior, no de una nueva ejecución para este cambio de backend.

### Guardado de un minuto y reintento manual

- `reservas.servicio.js`: la transacción que crea reserva y seña tiene `timeout: 60000`. Cuando Prisma informa `P2028`, operación `query` y transacción expirada, se devuelve un error de negocio HTTP 408 con código `RESERVA_TIEMPO_AGOTADO`. Se identifica específicamente este caso, sin afirmar que otros errores de conexión o commit hayan revertido las escrituras.
- `reservas.controlador.js`: conserva el código de negocio en la respuesta para que la pantalla distinga un vencimiento confirmado de una desconexión.
- `ReservaWizard.jsx`: durante el guardado bloquea controles y muestra un aviso. Al vencer conserva los datos y bloquea Confirmar hasta usar **Actualizar disponibilidad para reintentar**. Esta acción consulta nuevamente habitaciones y tarifas, sin enviar otra reserva. Si una habitación dejó de estar disponible, regresa a la selección; si falla la consulta, mantiene el bloqueo. Después se revisa nuevamente el importe y se confirma el medio de pago antes de enviar otro intento con el mismo límite de un minuto.
- No hay recarga completa del navegador ni temporizador que aborte la solicitud desde el cliente. El minuto corresponde a la transacción de base de datos; las consultas previas, espera de conexión, reversión y correo posterior pueden extender el tiempo total de respuesta. Recargar el navegador no cancela una operación ya enviada.
- Ante ausencia de respuesta, errores de servidor o un 408 sin el código específico, la pantalla informa un resultado incierto, bloquea el reenvío desde ese formulario e indica revisar reservas y pagos. Se eliminó el mensaje genérico que afirmaba que nunca se había guardado nada. Esto no incorpora idempotencia persistente entre pestañas o recargas.
- Pruebas: 33 pruebas de backend y 167 de frontend aprobadas (incluidas 15 del asistente de reservas); compilación de frontend correcta. Las pruebas simulan la expiración, no esperan un minuto real ni escriben en la base compartida. Se verifican código HTTP, ausencia de reintentos automáticos, recuperación, disponibilidad modificada, fallo al actualizar, pérdida de respuesta y controles bloqueados mientras el pedido está pendiente.

### Tipo de documento del ocupante

En `frontend/src/modulos/estadia/EstadiaPanel.jsx`, `PersonaFormulario` reemplaza el texto libre de **Tipo de documento** por un desplegable con **DNI, Pasaporte, NIE y TIE**, con selección inicial vacía. El formulario se comparte entre ocupantes de reservas y check-in sin reserva, tanto en alta como en edición. Los valores históricos distintos se muestran como registrados anteriormente y se conservan mientras no se elija otra opción. El backend ya guarda este campo como texto y admite estos valores; no se requirió modificar el esquema ni datos de la base. Este cambio no añade validaciones de formato del número ni modifica las reglas de campos obligatorios.

El campo del número también adapta su etiqueta y texto de ayuda a la selección: **Número de DNI**, **Número de pasaporte**, **Número de NIE** o **Número de TIE**. Sin selección o con un tipo histórico mantiene **Número de documento**. Cambiar el tipo no borra el número cargado; este ajuste se aplica al mismo formulario compartido de alta y edición de ocupantes.

### Países y localidades de ocupantes

`PersonaFormulario` usa desplegables independientes para **País emisor** y **País de residencia**, con Argentina, Brasil, Chile, Uruguay, Paraguay y Bolivia. La selección inicial corresponde a Argentina y sus países limítrofes como alcance del catálogo, no a un ranking estadístico de huéspedes. Las opciones nuevas guardan códigos AR, BR, CL, UY, PY y BO en los campos de texto existentes.

El catálogo está en `frontend/src/modulos/estadia/ocupantesUbicacion.js`. **Localidad** se habilita al seleccionar residencia y ofrece localidades sugeridas de ese país. No es un padrón exhaustivo: **Otra localidad** permite escribir una distinta. Al cambiar residencia se limpia la localidad anterior; cambiar emisor no modifica residencia ni localidad. Se reconocen nombres históricos de países y se conservan sus valores originales mientras no se cambien, evitando reescribir involuntariamente la identidad. Los países históricos fuera del catálogo siguen visibles al editar. No se requieren migraciones ni cambios de datos compartidos. Aplica tanto a reservas como al check-in sin reserva mediante el formulario compartido. No se modificó el campo nacionalidad ni se agregó validación geográfica al backend.

Se agregó **Otro país** a ambos desplegables: habilita un campo obligatorio para escribir el nombre. Cuando se elige en residencia, la localidad se escribe directamente y se habilita después de ingresar el país; para los seis países del catálogo se mantiene **Otra localidad**. Cambiar el país limpia la localidad previa. Los países históricos fuera del catálogo se abren en modo manual con sus datos conservados. El formulario guarda el nombre escrito, nunca el valor interno de la opción "Otro país"; no se requieren cambios en la base.

### Validaciones al guardar ocupantes

- `frontend/src/modulos/estadia/validarOcupante.js` centraliza las validaciones del formulario: nombre y apellido, fechas válidas dentro de la reserva, nacimiento no futuro, formato de correo, correo y documento repetidos, nombres escritos para otro país/localidad, selección y capacidad por períodos de habitación, adulto responsable seleccionado y motivo de cambio de habitación.
- `PersonaFormulario` muestra los errores junto al campo. Los obligatorios vacíos se señalan al salir del campo o al intentar guardar; correo, documento repetido y capacidad se advierten durante la carga. Al guardar se muestran todos los errores detectados juntos, se enfoca el primero y no se envía la solicitud hasta corregirlos. Los datos cargados se conservan. Las respuestas de error por campo del backend también se muestran en el formulario.
- El correo sigue siendo **opcional** y acepta cualquier dominio válido, no solo Gmail. Si se informa, no puede repetirse en otro ocupante no cancelado de **la misma reserva**, ignorando mayúsculas y espacios en los extremos. Se excluye al propio ocupante al editar. No se compara con el titular ni con otras reservas, ni se eliminan registros históricos. Los ocupantes retirados siguen contando para esta regla dentro de su reserva.
- `backend/src/modulos/estadia/estadia.servicio.js` comprueba el correo bajo el bloqueo transaccional de la reserva antes de escribir, para cubrir cargas simultáneas. `estadia.routes.js` devuelve el error por campo; correo duplicado responde 409 y formato inválido responde 400. No se agregó un índice único global ni una migración.
- Guardar un ocupante previsto sigue permitiendo datos pendientes para su posterior verificación. Un aviso separado enumera nacimiento, nacionalidad, residencia, documentación y adulto responsable pendientes para ingresar, según corresponda. Este cambio no obliga a tener correo ni equivale a verificar al ocupante o autorizar su ingreso; esas validaciones del backend permanecen activas.
- Comprobaciones: 36 pruebas de backend y 173 de frontend aprobadas (incluidas 9 del formulario de estadía); compilación correcta. Se verificaron corrección de campos faltantes, correo repetido, edición del propio correo, exclusión de cancelados y capacidad antes del envío. Se usaron pruebas con datos simulados, sin escrituras contra la base compartida.

### Saturación del pool al consultar consumos y guardar ocupantes

El error informado mostraba `P2039`, espera de 30.001 ms y `active=1 idle=0 limit=1`; además, un `P2028` indicaba que la transacción de estadía no pudo comenzar. Esto confirma falta de conexión disponible en el pool del proceso, pero no identifica qué operación retenía la conexión ni demuestra por sí solo que el cupo del proveedor estuviera agotado.

- `backend/src/lib/prisma.js`: límite predeterminado de **2 conexiones por proceso**, configurable con `DATABASE_CONNECTION_LIMIT` (entero entre 1 y 10), documentado en `.env.example`. Se mantiene `minimumIdle: 1`, compatible con el driver MariaDB 3.4.5 incluido dentro del adapter; con esta versión el mínimo cero impedía crear conexiones durante la comprobación local. Las conexiones ociosas por encima del mínimo pueden liberarse tras 60 segundos. La espera predeterminada para iniciar una transacción pasa a 10 segundos; los límites explícitos de cada operación se conservan, incluido el minuto de reserva con seña.
- `EstadiaPanel.jsx`: cuenta y consumos se consultan solo al abrir su pestaña. El error `BASE_OCUPADA` no dispara reintentos automáticos de lectura; se muestra el mensaje del backend con **Volver a cargar**. Agregar persona queda bloqueado si no se pudo consultar el listado, evitando validar duplicados/capacidad con una lista incompleta.
- `backend/src/lib/erroresConexion.js`, rutas de estadía y controlador de servicios adicionales: los errores específicos de espera de conexión se responden con HTTP 503, código `BASE_OCUPADA` y `Retry-After: 3`. Otros errores y las transacciones expiradas durante su ejecución no se reclasifican. No se agregaron reintentos automáticos de escritura.
- `backend/scripts/pruebas-pool-local.js`: prueba de solo lectura en la base aislada de puerto 3308. Mantiene una transacción abierta y comprueba que otra consulta responde con un identificador de conexión distinto antes de liberarla. Resultado aprobado, sin escrituras ni consultas contra la base compartida.

El cupo de conexiones se suma entre todos los procesos y compañeros. Dos conexiones reducen la contención local, pero no eliminan una caída de red, una consulta bloqueada o el límite global del proveedor. Debe reiniciarse el backend para aplicar la configuración; el desempeño remoto sigue pendiente de comprobar.

Verificación del cambio: **46 pruebas de backend**, **10 del formulario de estadía**, compilación de frontend y prueba real de concurrencia local aprobadas. La base aislada se inició para la prueba y se detuvo al finalizar; no se modificó la base compartida.

### Incorporación automática del titular como ocupante

La reserva guarda nombre completo, tipo y número de documento y contacto; no contiene todos los datos exigidos para verificar el ingreso. Ahora el titular se incorpora automáticamente como **Previsto**, reutilizando lo disponible y dejando visibles los faltantes.

- `backend/src/modulos/estadia/titular.servicio.js`: copia documento, nombre completo, correo válido o contacto telefónico y fechas de la reserva. No infiere país emisor, nacionalidad, nacimiento ni residencia. El nombre completo se conserva en nombre y el apellido queda pendiente: el operador debe revisar la separación de nombres/apellidos, sin una división automática potencialmente incorrecta. El ocupante no queda verificado ni alojado automáticamente.
- `reservas.servicio.js`: el alta normal de reserva, con o sin seña, incluye al titular en la misma transacción. Si falla el pago o la reserva, se revierten también el ocupante, su asignación y su evento.
- Para reservas existentes, `POST /api/estadia/:reservaId/titular` se ejecuta automáticamente al abrir el panel con permisos de edición. La reserva se bloquea durante la operación. Se reutiliza un ocupante con el mismo tipo y número de documento; si hay coincidencias ambiguas se solicita revisión. Un evento de estadía enlaza al ocupante incorporado para evitar duplicaciones en recargas o peticiones simultáneas, incluso después de editar su documento. Los cancelados o retirados no se recrean automáticamente.
- Se asigna una plaza de una habitación de la reserva con capacidad durante todo el período. En reservas grupales se elige la primera habitación con plaza, ordenada por identificador; la asignación puede cambiarse desde edición. Si no hay plaza, aparece un aviso y deben corregirse las asignaciones existentes. Si otro ocupante utiliza el correo del titular, se conserva ese registro y se muestra un aviso para revisar el contacto del titular.
- `EstadiaPanel.jsx`: etiqueta **Titular de la reserva**, lista **Falta completar** y botón **Completar datos**. La verificación queda deshabilitada mientras falten datos. Agregar acompañantes espera a que termine la incorporación del titular. Los datos ya completados de un titular registrado no se sobrescriben.
- `CheckInConReserva.jsx`: espera a que se complete la incorporación y se actualice el listado antes de habilitar la confirmación. Mantiene los controles de cantidad declarada, capacidad, datos verificados, fechas, documento y garantía. `validarCompleto` ahora exige también nombre y apellido.
- El check-in sin reserva conserva su carga explícita de personas completas dentro de su transacción; no añade un segundo borrador automático sobre esa lista. No se realiza sincronización destructiva de ocupantes cuando se modifica posteriormente el titular de una reserva: esos cambios deben revisarse en la ficha de personas.
- No se cambió el esquema ni se ejecutó una migración en la base compartida. El alta de un titular de una reserva anterior ocurre al abrir su panel, no mediante una actualización masiva.

Verificación: **51 pruebas de backend**, **175 de frontend** y compilación aprobadas. La integración sobre base local aislada verificó el caso real de habitación triple con dos acompañantes: dos solicitudes simultáneas incorporan un único titular; no se permite verificarlo incompleto; al completar y verificar las tres personas, el check-in aloja a las tres. También se comprobaron los flujos existentes de seña, rollback, cargos y check-out. No se enviaron correos ni se escribieron datos de prueba en la base compartida.

### Motivos visibles cuando Confirmar check-in está deshabilitado

Se verificó en `sesion.jsx` que Recepcionista tiene permisos `gestionarReservas` y `gestionarCheckIn`. El dato "3 personas registradas" por sí solo no confirma que estén verificadas ni que se hayan completado documento, garantía y cantidad declarada. No se consultó la reserva compartida del usuario, por lo que no se atribuye su bloqueo concreto a una condición sin evidencia.

`frontend/src/modulos/check-in/bloqueosCheckIn.js` centraliza las condiciones que habilitan el botón y sus explicaciones. `PanelResumenCheckIn.jsx` muestra **Para habilitar el check-in** junto a la confirmación: estado de la reserva, incorporación pendiente del titular, error o carga de ocupantes, cantidad por habitación, capacidad, diferencia con los registrados para hoy, personas sin verificar, documento presentado y garantía. Al resolver una condición, su aviso desaparece. La identificación de reserva preparada acepta el mismo ID como texto o número. Se mantienen las validaciones del backend y no se marca verificado a nadie automáticamente.

Se agregó una prueba de pantalla con habitación triple: con tres registrados y uno sin verificar se muestra el motivo y se bloquea Confirmar; tras pulsar Verificar datos y actualizar el listado, se habilita si los demás requisitos están completos. También se prueban los mensajes de cantidades, incorporación y conexión. La compilación de frontend pasó.

### Recuperación de personas después de un corte o reinicio del backend

El corte `ECONNRESET` del proxy puede interrumpir tanto `POST /estadia/:id/titular` como la lectura de ocupantes. El panel mantenía bloqueado **Agregar persona** hasta que ambas operaciones se completaran, y recuperar solo la lectura no resolvía un POST del titular fallido.

- `recuperacionEstadia.js`: hasta dos reintentos adicionales, con esperas de 1 y 2 segundos, exclusivamente para la incorporación idempotente del titular ante errores de red o HTTP 500/502/503/504. No se reintentan automáticamente conflictos de negocio, permisos, rutas inexistentes ni `BASE_OCUPADA`. No se aplica esta política a crear ocupantes, pagos ni confirmar check-in.
- `EstadiaPanel.jsx`: muestra la recuperación en curso y, si persiste el error, un único botón **Volver a cargar personas**. Este recupera primero al titular si es necesario y luego actualiza el listado mediante la invalidación de la consulta. Si solo falló la lectura, vuelve a consultarla. Agregar se habilita después de una carga correcta; no se presenta una lista fallida como si estuviera vacía.
- `CheckInConReserva.jsx`: comparte la política de reintentos de lectura con el panel, ya que ambos observan la misma consulta de ocupantes.
- Verificación: 24 pruebas de frontend relevantes aprobadas y compilación correcta. La regresión simula la caída de ambas solicitudes, agotamiento de reintentos, recuperación manual y habilitación de Agregar persona conservando un único titular. También se hicieron consultas de diagnóstico de solo lectura a la aplicación en ejecución; no se crearon ni modificaron reservas ni ocupantes reales.

### Resultados de la revisión anterior

- Prisma: esquema validado y cliente regenerado.
- Backend: 24 pruebas unitarias aprobadas.
- Frontend: 163 pruebas aprobadas, incluidas las del equipo.
- Integración contra base local aislada: ocupantes, duplicados, capacidad, menores, check-in, rollback, cargos, anulaciones, garantías, pagos y check-out.
- Integración ampliada: walk-in incompleto sin altas parciales, walk-in completo, condiciones de ocupación, garantías históricas y rutas HTTP de estadía/consumos/check-in.
- Compilación frontend correcta. Persiste el aviso de tamaño del paquete JavaScript.
- Lint: sin errores, con 13 advertencias existentes en componentes y hooks.

La prueba `backend/scripts/pruebas-estadia-integracion.js` utiliza expresamente la base local de prueba en el puerto 3308 y deja registros identificables de prueba allí. No utiliza la base de `.env`.

## Para iniciar y versionar

Reiniciar el servidor de desarrollo para que tome la ruta restaurada y el cliente Prisma regenerado. El comando de desarrollo del proyecto es `npm run dev` (en PowerShell puede usarse `npm.cmd run dev`).

Versionar el código, los archivos Prisma/SQL, los scripts de migración/pruebas y la documentación. Excluir `.env`, `.local/`, `node_modules`, `dist` y archivos generados. Revisar el diff en la copia que tenga el repositorio Git antes del commit.

## Límites conservados

El login es real, pero las rutas operativas de estadía todavía no aplican autenticación de servidor, como otros módulos operativos del proyecto. Los permisos de interfaz no sustituyen ese control. No se implementó un horario automático de salida a las 10:00 ni se publicaron cambios en GitHub en esta revisión.

## Archivos modificados respecto de la copia recibida

```text
.gitignore
backend/index.js
backend/package.json
backend/prisma/schema.prisma
backend/scripts/pruebas-estadia-integracion.js
backend/src/lib/prisma.js
backend/src/modulos/check-in/checkIn.controlador.js
backend/src/modulos/check-in/checkIn.servicio.js
backend/src/modulos/check-out/checkOut.servicio.js
backend/src/modulos/estadia/estadia.servicio.js
backend/src/modulos/pagos-estadia/pagoEstadia.servicio.js
backend/src/modulos/reservas/reservas.servicio.js
backend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js
backend/src/modulos/servicios-adicionales/serviciosAdicionales.routes.js
backend/src/modulos/servicios-adicionales/serviciosAdicionales.servicio.js
frontend/src/App.jsx
frontend/src/componentes/menuConfig.js
frontend/src/componentes/Modal.jsx
frontend/src/modulos/check-in/CheckInConReserva.jsx
frontend/src/modulos/check-in/CheckInConReserva.test.jsx
frontend/src/modulos/check-in/CheckInWalkIn.jsx
frontend/src/modulos/check-out/CargoVerificacionCheckoutModal.jsx
frontend/src/modulos/check-out/CheckOutReservaPage.jsx
frontend/src/modulos/reservas/ReservaDetallePage.jsx
frontend/src/modulos/reservas/ReservasPage.jsx
frontend/src/modulos/servicios-adicionales/BuscarConsumoModal.jsx
frontend/src/modulos/servicios-adicionales/ConsumoModal.jsx
frontend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js
MODIFICACIONES_ESTADIA.md
README.md
```

También se agregó este informe. Los archivos nuevos de estadía que ya estaban presentes deben acompañar estos cambios en Git.

## Corrección del bloqueo de «Agregar persona» — 30/09/2026

- Caso comprobado: reserva 98, habitación 301, capacidad 2. El botón dependía de que terminara `POST /api/estadia/98/titular`; esa operación y el historial devolvían 500. No era un bloqueo por capacidad ni por el rol recepcionista.
- La inspección de la base configurada encontró pendiente la actualización `backend/prisma/estadia-ocupantes-cargos.sql`: faltaban 3 tablas (`ocupantes_reserva`, `asignaciones_ocupantes`, `eventos_estadia`), 17 columnas, 1 índice y 3 claves foráneas. Se verificó la coincidencia del código de reserva y habitación antes de aplicar cambios.
- Se agregó `backend/scripts/actualizar-esquema-estadia.js`. Inspecciona las estructuras existentes y prepara únicamente las adiciones pendientes de ese SQL. Sin argumentos muestra el plan; `node scripts/actualizar-esquema-estadia.js --aplicar`, desde backend, aplica las adiciones. No elimina tablas, no reemplaza registros ni ejecuta un `db push` global. No corrige tipos de columnas ya existentes. El DDL se confirma por sentencia; una ejecución interrumpida se puede reanudar porque vuelve a inspeccionar los faltantes.
- **Se aplicaron estas 24 adiciones a la base compartida configurada en `backend/.env`**, con resultado final de cero operaciones pendientes. Se conservaron las reservas y los registros existentes. No se modificó `.env`.
- El controlador de estadía ahora traduce los errores Prisma P2021/P2022 en HTTP 503 con código `ESQUEMA_ESTADIA_INCOMPLETO` y un aviso explícito. El frontend no reintenta automáticamente ese caso: un reintento no crea las estructuras faltantes. Los cortes transitorios conservan su recuperación limitada.
- Verificación real a través de Vite: incorporación del titular, lectura de ocupantes, historial y consulta de reserva devolvieron HTTP 200. El titular se incorporó desde los datos disponibles en la reserva, sin duplicar una persona existente, y quedó sin verificar. La verificación que mostraba previamente la pantalla no estaba persistida en las tablas de la base inspeccionada; no se reconstruyeron datos personales desconocidos ni se certificó su identidad automáticamente.
- Pruebas: 8 de backend (plan aditivo, reejecución, rechazo de base incompleta e incorporación del titular) y 25 de frontend (recuperación, formularios y check-in), todas aprobadas. No se efectuó un check-in ni se registraron pagos de prueba en la base compartida.
- Para retomar: actualizar la pantalla o usar «Volver a cargar personas», completar y verificar los datos pendientes del titular, agregar al acompañante y declarar 2 personas para la habitación si ingresan ambos. Registrar un ocupante y declarar la cantidad son pasos distintos; las cantidades deben coincidir antes de confirmar el check-in.

## Revisión de la lógica del titular automático — 30/09/2026

La corrección de esquema anterior resolvió errores HTTP observados, pero comprobar HTTP 200 no demostraba que el botón quedara correctamente habilitado en todos los estados de la pantalla. Esta revisión aisló un defecto adicional del frontend, introducido por la incorporación automática.

### Causa reproducida

`EstadiaPanel` ejecutaba `POST /titular` en cada montaje, incluso si el listado ya contenía al titular. `preparandoTitular` dependía exclusivamente de `titular.isSuccess`, y bloqueaba «Agregar persona». Por eso podían verse simultáneamente una ficha registrada/verificada y «Incorporando los datos del titular…». Un POST lento o fallido bloqueaba la carga de acompañantes sin relación con la capacidad disponible. Además, el alta automática empezaba antes de conocer los ocupantes actuales.

Se agregaron dos pruebas que dejaban ese POST sin respuesta, con un titular persistido pendiente o verificado. Ambas fallaron antes de la corrección porque el botón quedaba deshabilitado.

### Identidad y capacidad

- En la consulta de diagnóstico de la reserva 98 se encontró un solo ocupante, una sola coincidencia con el documento del titular y una asignación activa, para una habitación de capacidad 2. No se encontró un duplicado persistido en esa reserva. Este resultado no permite reconstruir estados anteriores de la base.
- El huésped titular y su ocupante son registros de entidades distintas que representan a la misma persona. Sus IDs no tienen por qué coincidir. La capacidad se calcula con los ocupantes y sus asignaciones; no se suma una plaza aparte por tener un huésped titular.
- Al editar un ocupante, los controles de correo, documento y capacidad excluyen su propio ID. Volver a ingresarlo desde «Agregar persona» constituye un alta diferente: la forma correcta de completar el titular es editar la ficha existente.

### Corrección aplicada

- Primero se obtiene el listado. Si existe una única coincidencia de tipo y número de documento no vacíos, se reutiliza esa ficha y no se envía otro POST de incorporación. No se decide por nombre, correo ni igualdad de IDs entre entidades.
- Se mantiene el ID devuelto por el backend cuando se necesita incorporar o recuperar el vínculo, incluyendo documentos corregidos. Ante coincidencias ambiguas, se deja la resolución al backend; no se selecciona una persona arbitrariamente.
- La incorporación automática se solicita solo después de una lectura correcta que no permite identificar al titular. Si falla la lectura, se recupera el listado antes de intentar el alta automática.
- Completar/verificar al titular es independiente de habilitar el registro de acompañantes. El check-in conserva los controles de verificación, cantidad declarada, capacidad y garantía.
- Archivos: `frontend/src/modulos/estadia/EstadiaPanel.jsx`, `titularRegistrado.js` y sus pruebas. En esta revisión no se modificaron registros ni el esquema de la base compartida.
- Validación: 35 pruebas de frontend aprobadas, incluidas las dos regresiones que fallaban antes, edición del propio titular, segunda plaza disponible, rechazo de una tercera persona y recuperación tras cortes. La prueba del botón se realizó con el componente renderizado en el entorno de pruebas; no se confirmó un check-in real.
