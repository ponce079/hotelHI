# Informe de trabajo de HotelHI

**Período solicitado:** desde el lunes 28 de septiembre de 2026, 11:57 AM, hasta la última revisión registrada del martes 29 de septiembre de 2026. Zona de referencia: Argentina.

## 1. Alcance y fuentes

Se interpreta “Monday 11:57 AM” como el lunes inmediatamente anterior a la fecha de esta sesión. Esa hora es el límite indicado por el usuario, no una marca de inicio verificada mediante Git. No se dispone de una hora individual para cada mensaje o edición; por eso la secuencia siguiente describe etapas, sin atribuir minutos inventados a las tareas.

El informe se basa en la conversación disponible, el código actual, los respaldos locales, los resultados de las herramientas y los documentos [MODIFICACIONES_ESTADIA.md](MODIFICACIONES_ESTADIA.md) e [INTEGRACION_ACTUALIZACIONES.md](INTEGRACION_ACTUALIZACIONES.md). Algunos antecedentes de la conversación no pueden situarse con certeza antes o después de las 11:57; se identifican como contexto y no como trabajo con fecha certificada.

La carpeta de trabajo no contiene `.git`. No puede certificarse qué archivos estaban en una revisión remota concreta ni cuáles ya subió el usuario a GitHub. “Nuevo” y “modificado” en este informe describen el trabajo realizado en esta conversación, no el estado remoto del repositorio.

La redacción de este informe no ejecutó migraciones, pruebas de escritura ni cambios de código funcional. Los resultados de pruebas citados corresponden a las ejecuciones anteriores registradas.

## 2. Objetivo del trabajo

Se amplió la operación de estadías para identificar a todas las personas alojadas y administrar consumos por habitación. Se integró esa ampliación con reservas, check-in, pagos, garantías y check-out.

Las reglas acordadas fueron:

1. El cargo corresponde a una habitación dentro de una reserva; no se elige una persona como consumidora.
2. El titular de la reserva y los ocupantes son registros distintos. El titular debe cargarse como ocupante si también se aloja.
3. Todas las personas que ingresan deben registrarse, incluidos menores.
4. El check-in requiere declarar la cantidad de personas por habitación y hacerla coincidir con los registros completos y verificados.
5. Se conserva el trabajo incorporado por los compañeros al restaurar las integraciones sobrescritas.

## 3. Secuencia de trabajo reconstruida

| Etapa | Solicitud o problema | Trabajo y resultado |
|---|---|---|
| Antecedentes sin hora certificable | Errores de conexión, carga de datos, consulta sobre horarios y comparación con el repositorio | Contexto inicial de la conversación. No se atribuye a esta etapa una solución específica del `ECONNREFUSED` ni una comparación completa con sitios externos sin evidencia disponible. |
| Implementación inicial de estadía | Cargos por habitación y datos de todas las personas | Se crearon los módulos de estadía, se amplió Prisma y se integraron las pantallas y servicios. |
| Preparación de la base | El código necesitaba tablas y columnas nuevas | Se preparó una migración aditiva, con inspección y respaldo parcial. Se aplicó sobre la conexión configurada, utilizada como base compartida. |
| Corrección del resumen de consumos | HTTP 500 al consultar `/api/consumos-servicios/hotel/resumen` | Se identificó Prisma `P2022` por falta de `descripcion`; después de completar la estructura se obtuvo HTTP 200. |
| Documentación inicial | Explicar qué se cambió y si se modificó la base compartida | Se documentaron los cambios y se aclaró que sí hubo una migración sobre esa base. |
| Ajustes de presentación | Mostrar primero habitación y debajo el tutor/titular | Se cambió la jerarquía visual y se redujo el tamaño de letra dos veces a pedido del usuario. |
| Corrección del control de ocupantes | La primera versión solo exigía uno por habitación | Se agregó la declaración independiente de cantidades y el bloqueo hasta completar todos los registros. |
| Integración del 29/09 | Se incorporó código de los compañeros y se pidió recuperar lo perdido | Se detectaron integraciones sobrescritas, se respaldó la copia recibida y se restauraron los cambios conservando el login real y otras incorporaciones. |
| Validación posterior | Ejecutar las pruebas necesarias | Se aprobaron 24 pruebas de backend, 163 de frontend, integración local, validación de Prisma y compilación. |
| Preparación para Git | Identificar carpetas nuevas y rutas modificadas | Se entregaron inventarios, se excluyó `.local/` y se aclaró que los archivos deben integrarse juntos. No se realizó un push. |
| Documentación consolidada | Documentar todo desde el lunes a las 11:57 | Se creó este informe y se corrigieron referencias desactualizadas en la documentación existente. |

## 4. Personas alojadas y módulo de estadía

### 4.1 Datos registrados

Se creó un registro de ocupantes por reserva con nombre, apellido, tipo y número de documento, país emisor, justificación de ausencia de documento, nacimiento, nacionalidad, domicilio, localidad, país de residencia, teléfono y correo electrónico.

También se registran responsable adulto, fechas previstas, habitación asignada, estado, quién verificó los datos y cuándo, ingreso real y salida real. No todos los campos de contacto son obligatorios. La verificación exige nacimiento, nacionalidad, residencia y documentación completa o una excepción justificada.

### 4.2 Validaciones

- La estadía prevista de la persona debe quedar dentro de la reserva.
- Se controla capacidad por habitación y períodos de ocupación que se superponen.
- Se rechazan duplicados documentales dentro de una reserva, excepto registros cancelados.
- La identidad activa documental evita que una misma identidad tenga dos ingresos activos; se libera al registrar la salida. Los registros sin documento no tienen la misma protección.
- Los menores requieren un adulto de la misma reserva. Su ingreso depende del ingreso de su responsable.
- Editar una persona invalida su verificación anterior.
- No se editan registros retirados o cancelados mediante este flujo.
- Los cambios de habitación conservan asignaciones anteriores y requieren motivo cuando corresponde.

### 4.3 Estados y pantallas

El circuito principal es `Previsto → Alojado → Retirado`; un ingreso pendiente puede cancelarse. Registrar una salida individual no cierra la reserva ni libera automáticamente la habitación.

Se agregó `/personas-alojadas`, con búsqueda por nombre, apellido o documento y un máximo de 500 resultados por consulta. El detalle de reserva incorpora las pestañas Personas, Cargos por habitación, Cuenta, Condiciones e Historial. El historial devuelve hasta 200 eventos.

## 5. Check-in: de un ocupante mínimo a todos los declarados

La primera implementación exigía al menos una persona verificada por habitación. Tras la consulta del usuario se reconoció que eso permitía omitir acompañantes y se reforzó el control.

### 5.1 Contrato actual

Tanto el check-in con reserva como el ingreso sin reserva reciben una declaración explícita:

```json
{
  "cantidadesOcupantes": [
    { "habitacionId": 101, "cantidad": 3 },
    { "habitacionId": 102, "cantidad": 1 }
  ]
}
```

Los valores `habitacionId` del ejemplo son identificadores internos ilustrativos, no necesariamente los números visibles de las habitaciones. La cantidad no se completa automáticamente a partir de las personas ya cargadas.

Se exige una entrada por habitación, sin repeticiones, con cantidad entera positiva y dentro de la capacidad. Para cada habitación debe coincidir exactamente con los ocupantes registrados que ingresan ese día. Se validan sus datos y verificaciones antes de confirmar.

**Ejemplo:** si recepción declara tres personas y solo registró una, el check-in queda bloqueado. Registrar una persona extra en otra habitación no compensa el faltante.

La interfaz muestra cantidades declaradas, personas registradas y listas para ingresar. La validación se repite en el servidor para que no dependa del botón de la pantalla.

### 5.2 Transacción y registro

El ingreso de ocupantes, el cambio de estado de la reserva, la ocupación de habitaciones y la creación de la garantía se realizan en una transacción. Si falla una parte, el conjunto se revierte.

En walk-in también se incluyen el alta de la reserva y los registros de personas. Se admite hasta 100 personas por solicitud. El historial guarda las cantidades declaradas y los identificadores de quienes ingresaron.

El servidor distingue errores de negocio: datos incompletos se comunican como HTTP 400 y conflictos de disponibilidad como HTTP 409. Durante la restauración se corrigió un caso de walk-in que convertía un conflicto de reserva en HTTP 500.

Este control no detecta físicamente personas omitidas: recepción sigue siendo responsable de declarar el total real. Las llegadas posteriores conservan su registro individual sobre una reserva en curso.

## 6. Cargos adicionales por habitación

### 6.1 Asociación y cálculo

Se usa `reservaId + habitacionId`. No se agregó una asociación obligatoria a nombre y apellido del consumidor. `registradoPor` identifica al operador que carga el movimiento.

El cargo incorpora descripción, cantidad, precio unitario, fecha del servicio, marca de incluido y clave de operación. El servidor calcula cantidad por precio, redondea el importe y valida los valores. Los servicios incluidos suman cero.

Solo se admite cargar consumos en reservas en curso y habitaciones pertenecientes a ellas. Reutilizar una habitación en otra reserva no arrastra cargos de la estadía anterior.

### 6.2 Reintentos, anulación y stock

La interfaz genera una clave de operación para evitar un segundo cargo al reintentar una solicitud. Los clientes que no envían esa clave no reciben esa protección.

La anulación conserva el movimiento, registra motivo, operador y fecha, y lo excluye de los totales. No devuelve automáticamente mercadería al stock.

Minibar conserva el uso del depósito configurado y del servicio existente de salida de stock. El descuento y el consumo se registran en la misma transacción.

### 6.3 Categorías y límite de la restauración

El catálogo actual contiene **Restaurante, Spa, Lavandería, Minibar, Persona adicional y Otro**. La documentación inicial también enumeraba Estacionamiento, Cama adicional y Salida tardía, pero esas tres opciones no aparecen en las constantes actuales después de la restauración. Este informe deja explícita esa diferencia; no afirma que las nueve opciones estén disponibles. Un cargo manual distinto puede describirse bajo Otro.

El reporte general sigue filtrando por la fecha de registro `fechaHora`, aunque el movimiento también conserva `fechaServicio`.

## 7. Tarifas y condiciones de habitación

Se incorporaron tarifa pactada, ocupación incluida, precio por persona extra y descripción de servicios incluidos.

Las reservas nuevas conservan el precio pactado aunque después cambie la tarifa del catálogo. Al modificar una reserva se mantienen las condiciones de las habitaciones que permanecen; se impiden cambios incompatibles con las fechas o habitaciones de los ocupantes.

Las reservas históricas sin precio pactado siguen utilizando como alternativa el precio actual. No se reconstruyó retroactivamente un precio que no estaba guardado.

Los adicionales por ocupación se calculan por noche, considerando asignaciones y salidas. Se presenta una propuesta para revisión y confirmación explícita. Se rechaza una propuesta que quedó desactualizada y se evita repetir el cargo de una misma habitación/noche. Anular uno de esos cargos no lo habilita automáticamente para generarse otra vez.

`serviciosIncluidos` es una descripción informativa. No marca consumos como gratuitos automáticamente; el operador debe indicar cuándo un consumo está incluido.

## 8. Garantías, cuenta y check-out

Las nuevas garantías se identifican con `garantiaSeparada=true`. Se registran montos aplicados a la cuenta y devueltos, con motivo y operador. Solo la parte aplicada reduce el saldo de alojamiento y consumos.

No se permite aplicar más que el saldo pendiente ni disponer de más garantía que la disponible. Una garantía aplicada o devuelta no puede anularse mediante el flujo normal de pagos.

Había quedado pendiente distinguir correctamente las garantías históricas. En la integración del 29/09 se corrigió: las anteriores sin la marca conservan su tratamiento como pago y no se presentan como nuevas garantías pendientes de liquidar. La prueba local comprobó ambos comportamientos; no se reclasificaron registros de la base compartida.

La cuenta presenta alojamiento, adicionales, revisión y total por habitación, junto con pagos y saldo global de la reserva. No se crearon cuentas o facturas independientes por persona/habitación.

Para cerrar se exige:

1. Reserva en curso.
2. Revisión registrada para cada habitación, con su identificador explícito.
3. Confirmación de cargos.
4. Saldo pendiente igual a cero.
5. Garantía separada completamente liquidada.

Al cerrar, se retiran los ocupantes alojados, se cancelan los previstos restantes y se cierran las asignaciones. Las habitaciones ocupadas pasan a limpieza. Se conserva el tratamiento de mantenimiento para no restaurar una habitación a ocupada después de que el huésped se fue.

Registrar una devolución de garantía documenta una operación realizada fuera del sistema. No ejecuta transferencias ni reembolsos bancarios.

## 9. Presentación de consumos e identificación de habitaciones

Se aclaró que las habitaciones ya tenían `id` interno y `numero` único. No se creó un código nuevo por habitación.

Por solicitud del usuario, la lista de reservas para consumo, el resultado de búsqueda y el formulario destacan la habitación; debajo aparece el titular en menor tamaño. “Tutor” se interpretó aquí como el titular visible de la reserva, no como el adulto responsable de un menor.

Después de dos ajustes de tamaño, el código actual usa `text-lg` para habitación en la lista y búsqueda, `text-xl` en el formulario y `text-xs` para el titular. El encabezado del formulario cambia al seleccionar otra habitación.

El componente compartido `Modal` recibió `role="dialog"`, `aria-modal` y un nombre accesible. Esto también permite identificar los formularios en las pruebas de interfaz.

## 10. Base de datos: lo que sí se modificó

### 10.1 Estructura

| Tabla | Cambio |
|---|---|
| `ocupantes_reserva` | Nueva: identidad, datos personales, responsable, fechas, estado y verificación. |
| `asignaciones_ocupantes` | Nueva: historial de asignación a habitaciones. |
| `eventos_estadia` | Nueva: acciones, detalle JSON, operador y fecha. |
| `reservas_habitaciones` | `tarifaPactada`, `ocupacionIncluida`, `precioPersonaExtra`, `serviciosIncluidos`. |
| `consumos_servicio_adicional` | Descripción, precio unitario, fecha de servicio, incluido, anulación, motivo, operador/fecha de anulación y clave de operación. |
| `pagos_estadia` | Garantía aplicada, devuelta y marca de separación. |
| `cargos_verificacion_checkout` | Identificador de habitación. |

Se agregaron claves foráneas de ocupante a reserva, asignación a ocupante y evento a reserva. Responsable adulto y algunas referencias a habitación se controlan en los servicios, sin nuevas claves foráneas para esos campos.

### 10.2 Aplicaciones y comprobación posterior

La migración inicial sí se aplicó a la base indicada en `backend/.env`, usada como base compartida. La última aplicación registrada informó 24 operaciones aditivas. No se ejecutaron borrados de filas; las nuevas columnas incorporaron valores predeterminados o nulos.

Durante la integración del martes se hizo exclusivamente una verificación de estructura: **0 operaciones pendientes**. No se aplicó nuevamente la migración. Las pruebas posteriores de escritura se ejecutaron en la base local aislada.

El error 500 del resumen de consumos se relacionó con Prisma `P2022`, por la columna `descripcion` faltante. Tras completar la estructura se verificó HTTP 200 para el período del 28/09, con cero consumos en esa respuesta.

### 10.3 Respaldos y evidencia temporal

El script guarda un respaldo parcial antes de aplicar cambios. Los archivos encontrados muestran estas horas de modificación locales:

| Archivo en `.local/respaldos-estadia/` | Marca local observada |
|---|---|
| `antes-1790609153634.json` | 28/09/2026 12:25:53 |
| `antes-1790609193271.json` | 28/09/2026 12:26:33 |
| `antes-1790647626268.json` | 28/09/2026 23:07:06 |

Las marcas corresponden a archivos, no certifican la hora exacta de cada cambio SQL. Los JSON no identifican el host de destino. La atribución de cada ejecución procede de la sesión y no debe inferirse solo del nombre del archivo.

El respaldo abarca reservas, habitaciones, su tabla de relación, consumos, pagos, medios de pago y revisión de checkout. No es un volcado completo. No existe restauración automática ni una transacción única que englobe toda la migración DDL.

## 11. Integración con las actualizaciones de los compañeros

Se detectó que los archivos nuevos seguían presentes, pero el código recibido había sobrescrito el esquema de estadía, el montaje de rutas, controles de ingreso y varias integraciones visuales y económicas.

Antes de editar se guardó el código recibido en `.local/antes-integracion-20260929/`, sin copiar `.env`. Se reconstruyeron las integraciones sobre la versión recibida en lugar de reemplazar todo por el respaldo antiguo.

Se conservaron el login real, tokens, gestión de usuarios, perfil, modelo `Usuario`, interceptores del cliente HTTP, límite de conexiones y registro de errores de MariaDB. Esos cambios pertenecen al trabajo incorporado del equipo; no se presentan como una nueva implementación propia de estadía.

Se restauraron comandos `dev`, `db:generate`, `db:check`, `db:push` y `db:seed`, y el soporte `DATABASE_SSL=false` para la conexión local. Se eliminó una segunda invocación duplicada al proceso de stock mínimo. En `index.js` puede permanecer el comentario repetido sin llamada; no inicia otro proceso.

Se validó el esquema combinado y se regeneró Prisma. Se añadió `.local/` al `.gitignore`.

## 12. Inventario de archivos

### 12.1 Archivos nuevos del módulo

| Archivo | Responsabilidad |
|---|---|
| [backend/src/modulos/estadia/estadia.servicio.js](backend/src/modulos/estadia/estadia.servicio.js) | Personas, validaciones, acciones, historial y liquidación de garantías. |
| [backend/src/modulos/estadia/estadia.routes.js](backend/src/modulos/estadia/estadia.routes.js) | API de estadía. |
| [backend/src/modulos/estadia/ingreso.js](backend/src/modulos/estadia/ingreso.js) | Preparación del ingreso y cantidades declaradas. |
| [backend/src/modulos/estadia/condiciones.servicio.js](backend/src/modulos/estadia/condiciones.servicio.js) | Condiciones y adicionales por ocupación. |
| [backend/src/modulos/estadia/estadia.test.js](backend/src/modulos/estadia/estadia.test.js) | Pruebas de fechas, menores y asignaciones. |
| [backend/src/modulos/estadia/ingreso.test.js](backend/src/modulos/estadia/ingreso.test.js) | Pruebas de cantidades, verificaciones e ingreso. |
| [frontend/src/modulos/estadia/EstadiaPanel.jsx](frontend/src/modulos/estadia/EstadiaPanel.jsx) | Panel integrado, formulario de personas y garantías. |
| [frontend/src/modulos/estadia/AlojadosPage.jsx](frontend/src/modulos/estadia/AlojadosPage.jsx) | Listado de personas alojadas. |
| [frontend/src/modulos/estadia/CondicionesHabitaciones.jsx](frontend/src/modulos/estadia/CondicionesHabitaciones.jsx) | Edición de condiciones y propuesta de adicionales. |
| [frontend/src/modulos/estadia/PersonasWalkIn.jsx](frontend/src/modulos/estadia/PersonasWalkIn.jsx) | Personas del ingreso sin reserva. |
| [frontend/src/modulos/estadia/EstadiaPanel.test.jsx](frontend/src/modulos/estadia/EstadiaPanel.test.jsx) | Pruebas del panel. |
| [frontend/src/modulos/check-in/CantidadesOcupantes.jsx](frontend/src/modulos/check-in/CantidadesOcupantes.jsx) | Declaración por habitación. |
| [frontend/src/modulos/check-in/validacionOcupantesIngreso.js](frontend/src/modulos/check-in/validacionOcupantesIngreso.js) | Cómputo de registros listos y payload. |
| [frontend/src/modulos/check-in/CantidadesOcupantes.test.jsx](frontend/src/modulos/check-in/CantidadesOcupantes.test.jsx) | Pruebas del control de cantidades. |

### 12.2 SQL, herramientas y documentos agregados

| Archivo | Uso |
|---|---|
| [backend/prisma/estadia-ocupantes-cargos.sql](backend/prisma/estadia-ocupantes-cargos.sql) | Cambios aditivos de estructura. |
| [backend/scripts/migrar-estadia.js](backend/scripts/migrar-estadia.js) | Inspección; respaldo y aplicación con opción explícita. |
| [backend/scripts/pruebas-estadia-integracion.js](backend/scripts/pruebas-estadia-integracion.js) | Integración contra la base local aislada. |
| [MODIFICACIONES_ESTADIA.md](MODIFICACIONES_ESTADIA.md) | Referencia técnica y operativa. |
| [INTEGRACION_ACTUALIZACIONES.md](INTEGRACION_ACTUALIZACIONES.md) | Restauración posterior a los cambios del equipo. |
| Este informe | Registro consolidado del período solicitado. |

Los scripts auxiliares y respaldos dentro de `.local/` no son entregables para Git. No se atribuye a este período la creación de herramientas raíz preexistentes de desarrollo sin evidencia temporal suficiente.

### 12.3 Archivos existentes modificados

| Archivo o grupo | Modificación |
|---|---|
| `backend/index.js` | Montaje de estadía y eliminación del inicio duplicado del barrido de stock. |
| `backend/package.json` | Restauración de comandos del entorno. |
| `backend/src/lib/prisma.js` | SSL configurable, conservando las mejoras de conexión. |
| `backend/prisma/schema.prisma` | Modelos y campos de estadía, compatibles con Usuario. |
| `backend/src/modulos/check-in/checkIn.servicio.js` | Cantidades, personas y garantía dentro del ingreso transaccional. |
| `backend/src/modulos/check-in/checkIn.controlador.js` | Respuestas de errores de negocio y duplicados. |
| `backend/src/modulos/check-out/checkOut.servicio.js` | Cuenta, garantías, revisión por habitación y cierre de ocupantes. |
| `backend/src/modulos/reservas/reservas.servicio.js` | Tarifa pactada y conservación de condiciones/ocupantes. |
| `backend/src/modulos/pagos-estadia/pagoEstadia.servicio.js` | Impedir anular garantías ya liquidadas. |
| `backend/src/modulos/servicios-adicionales/serviciosAdicionales.servicio.js` | Cálculos, registro, anulación, stock y totales. |
| `backend/src/modulos/servicios-adicionales/serviciosAdicionales.routes.js` | Ruta de anulación. |
| `backend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js` | Categorías de servicio. |
| `frontend/src/App.jsx` | Ruta de personas alojadas. |
| `frontend/src/componentes/menuConfig.js` | Acceso desde el menú. |
| `frontend/src/componentes/Modal.jsx` | Atributos de diálogo accesible. |
| `frontend/src/modulos/check-in/CheckInConReserva.jsx` | Personas, declaración y bloqueo de confirmación. |
| `frontend/src/modulos/check-in/CheckInConReserva.test.jsx` | Contrato y pruebas actualizados. |
| `frontend/src/modulos/check-in/CheckInWalkIn.jsx` | Listado de personas y cantidades antes de confirmar. |
| `frontend/src/modulos/check-out/CargoVerificacionCheckoutModal.jsx` | Selección de habitación revisada. |
| `frontend/src/modulos/check-out/CheckOutReservaPage.jsx` | Garantías, revisión por habitación y condiciones de cierre. |
| `frontend/src/modulos/reservas/ReservaDetallePage.jsx` | Panel integrado de estadía. |
| `frontend/src/modulos/reservas/ReservasPage.jsx` | Acceso al listado de personas alojadas. |
| `frontend/src/modulos/servicios-adicionales/ConsumoModal.jsx` | Nuevos campos y habitación destacada. |
| `frontend/src/modulos/servicios-adicionales/BuscarConsumoModal.jsx` | Habitación primero y titular debajo. |
| `frontend/src/modulos/servicios-adicionales/serviciosAdicionales.constantes.js` | Catálogo sincronizado con backend. |
| `README.md` | Arranque y enlaces a documentación. |
| `.gitignore` | Exclusión de `.local/`. |

## 13. API y contratos

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/estadia/alojados` | Buscar alojados. |
| GET / POST | `/api/estadia/:reservaId/ocupantes` | Consultar o registrar ocupantes. |
| PUT | `/api/estadia/:reservaId/ocupantes/:id` | Editar ocupante/asignación. |
| POST | `/api/estadia/:reservaId/ocupantes/:id/accion` | Verificar, ingresar, retirar o cancelar. |
| GET | `/api/estadia/:reservaId/condiciones` | Consultar condiciones. |
| PUT | `/api/estadia/:reservaId/condiciones/:habitacionId` | Guardar condiciones. |
| GET / POST | `/api/estadia/:reservaId/adicional-ocupacion` | Proponer o confirmar adicionales. |
| GET | `/api/estadia/:reservaId/historial` | Consultar eventos. |
| POST | `/api/estadia/:reservaId/garantia` | Aplicar o devolver garantía. |
| POST | `/api/consumos-servicios/:id/anular` | Anular con motivo y operador. |

Se ampliaron los contratos existentes de alta de consumos, confirmación de check-in, walk-in y revisión de salida. Frontend y backend deben actualizarse juntos: una versión anterior que no envía cantidades o habitación revisada puede ser rechazada por las validaciones nuevas.

## 14. Pruebas realizadas

### 14.1 Evolución y última ejecución

En etapas anteriores se registraron 140 pruebas y, después del control de cantidades, 155. Tras integrar las nuevas pruebas del equipo, el total pasó a **187**. Son conteos de distintos momentos, no ejecuciones que deban sumarse entre sí.

La última ejecución solicitada antes de este informe dio:

| Comprobación | Resultado |
|---|---|
| Jest backend | 24 pruebas aprobadas; 4 suites. |
| Vitest frontend | 163 pruebas aprobadas; 22 archivos. |
| Prisma validate | Esquema válido. |
| `node --check backend/index.js` | Sintaxis correcta. |
| Vite build | Compilación correcta; aviso por paquete de aproximadamente 940 kB sin comprimir. |
| Oxlint | Sin errores; 13 advertencias. |
| Integración local | Flujo completo y pruebas HTTP aprobadas. |

Las advertencias de lint afectan hooks, exportaciones para recarga en desarrollo y una importación no utilizada. No se corrigieron todas como parte del trabajo de estadía.

### 14.2 Casos comprobados en integración

- Duplicación documental, capacidad y responsables de menores.
- Declaración incompleta, cantidades que no coinciden y datos sin verificar.
- Reversión del check-in incompleto sin altas parciales.
- Ingreso con reserva y walk-in completo.
- Conservación del precio pactado frente a cambios de tarifa.
- Consumos por habitación, reintentos y servicios incluidos sin cargo.
- Anulación y exclusión de los totales.
- Revisión obligatoria de todas las habitaciones.
- Garantías nuevas e históricas, liquidación y saldo.
- Pago, check-out, salida de ocupantes y estado de limpieza.
- Rechazo de nuevos consumos tras cerrar la reserva.
- Condiciones de ocupación y prevención de cargos repetidos.
- Respuestas HTTP de ocupantes, historial, resumen y errores de check-in.

Las pruebas usan la instancia local en `127.0.0.1:3308`, base `hotelhi_estadia_test_v2`. El script fija ese destino, deja registros ficticios y no usa la base configurada en `.env`. No es un script portable a cualquier computadora sin preparar esa base.

Estas pruebas no equivalen a una revisión manual exhaustiva de todas las pantallas en navegador ni a una certificación de producción.

## 15. Entrega, ejecución y Git

Para iniciar desde la raíz se usa `npm run dev`; en PowerShell, `npm.cmd run dev` evita el bloqueo de ejecución de `npm.ps1`. El arranque no aplica migraciones automáticamente.

Al actualizar otra computadora deben copiarse juntos los módulos nuevos, las modificaciones de módulos existentes, el esquema y las pruebas. Se debe generar el cliente Prisma. El SQL no se ejecuta por subirlo a Git y no debe aplicarse otra vez por cada integrante que comparte la misma base ya actualizada.

Versionar código, SQL, scripts y documentación. Excluir `.env`, `.local/`, dependencias, compilados y archivos generados. No se realizó un commit ni un push en estas intervenciones; el usuario informó que incorporó actualizaciones de sus compañeros, pero eso no acredita el estado remoto de nuestras modificaciones.

## 16. Límites y pendientes al cierre

- El login real fue incorporado por el equipo. Las rutas operativas de estadía aún no verifican sesión en el servidor; el operador enviado por el cliente no constituye una identidad autenticada para auditoría.
- La diferencia de tres categorías entre la documentación inicial y el catálogo actual está identificada en la sección 6.3.
- No hay horario automático de salida a las 10:00 ni cobro automático por retraso.
- No hay directorio global reutilizable de personas, importación masiva, registro mediante enlace ni integración de puntos de venta.
- No hay pagos/facturas independientes por habitación ni por persona.
- Las devoluciones de garantía y correcciones de stock no se ejecutan en servicios bancarios o externos.
- Las referencias sin clave foránea dependen de validaciones de aplicación.
- No se inventaron ocupantes ni tarifas históricas para completar datos anteriores.
- El historial del módulo no es una auditoría integral e inalterable de todo el sistema.
- Los límites de listados, las advertencias de lint y el tamaño del JavaScript permanecen como se describen en este informe.

El código implementado y restaurado, el impacto sobre la base compartida y los resultados comprobados quedan diferenciados de estas limitaciones y de cualquier acción de publicación pendiente.
