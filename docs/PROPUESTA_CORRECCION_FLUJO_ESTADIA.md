> Documento historico. Para la version actual, garantia delegada a Ricardo y pruebas locales, ver [revision del 1/10/2026](REVISION_ESTADIA_2026-10-01.md).

# Revisión y propuesta de corrección del flujo de estadía

Fecha: 29/09/2026. Estado: diagnóstico y diseño; cambios funcionales todavía no implementados en esta revisión.

## 1. Conclusión

Las observaciones detectan defectos reales del formulario incorporado de ocupantes y de la fecha de consumos. Se mezclaron datos ya conocidos de la reserva, datos personales, excepciones y confirmación de ingreso en un formulario genérico. Las validaciones no son uniformes entre reservas, ocupantes y walk-in, y varias llegan demasiado tarde.

Las 187 pruebas previamente aprobadas no demuestran que estos requisitos estén cubiertos: faltaban casos de DNI inválido, fecha de consumo fuera del período, reutilización del titular y bloqueo inmediato al completar cupos. El merge debe esperar la corrección y la verificación de esos casos.

Esta revisión no modificó código de negocio, esquema ni datos. Las reproducciones se hicieron en memoria, reemplazando Prisma por un doble de prueba, sin conexión a la base.

## 2. Observaciones verificadas

| Observación | Evidencia actual | Diagnóstico |
|---|---|---|
| Tipo de documento debe ser desplegable | `PersonaFormulario` declara `tipoDocumento` como `text`. El formulario original de reserva sí tiene catálogo. | Confirmado en el formulario nuevo de ocupantes. Se debe reutilizar el catálogo existente. |
| País debe ser desplegable | País emisor y residencia son texto libre. Backend solo valida longitud. | Confirmado. Se aceptan valores ajenos a un catálogo. |
| Justificación sin documento | Campo visible siempre; cualquier texto permite superar la verificación documental. | Excepción introducida sin una política operativa definida. |
| Nacionalidad y residencia redundantes | Se piden junto con país emisor y se exigen al verificar, aunque la pantalla no los marca como obligatorios. | Son conceptos distintos, pero no se justificó exigir los tres en el flujo normal. |
| Campos obligatorios inconsistentes | El formulario marca nombre, apellido y fechas; `validarCompleto` exige otros campos después. | Confirmado. Guardar no equivale a estar listo, y la interfaz no explica adecuadamente esa diferencia. |
| Fechas repetidas | Se precargan desde la reserva pero vuelven a mostrarse como campos editables para cada persona. | Duplicación de interacción, aunque no siempre de tipeo. |
| Habitación repetida | El alta global selecciona por defecto la primera habitación y vuelve a pedir selección. | No aprovecha el contexto de la habitación; favorece errores en reservas grupales. |
| Datos cargados dos veces | Se carga el titular y luego otro formulario de ocupantes sin acción para reutilizar sus datos. | Confirmado, especialmente visible en walk-in. |
| Más personas que la capacidad | `PersonasWalkIn` agrega al arreglo local sin validación. Backend `capacidad()` sí controla el máximo al persistir. | Confirmado en el borrador de pantalla. No se demostró que el servidor actual permita guardar una sobreocupación; el rechazo llega tarde. |
| Advertencias tardías | Errores de personas se obtienen al guardar/verificar/confirmar, generalmente como mensaje global. | Confirmado. Faltan errores por campo y validación previa del grupo. |
| Errores por etapas | Backend lanza el primer error encontrado; walk-in procesa persona por persona. | Confirmado. El usuario puede corregir un dato y recién entonces descubrir otro. |
| DNI no validado | La normalización elimina espacios y convierte a mayúsculas; la verificación solo exige presencia. | Confirmado: `ABC!` superó normalización y verificación en memoria. |
| Fechas de consumo pasadas/futuras | Backend verifica que la fecha sea interpretable; frontend no define límites. | Confirmado: se aceptaron 2000 y 2099 con reserva de septiembre de 2026 en la simulación. |

Además, `resumenOcupantes(..., walkIn=true)` trata todos los registros del borrador como listos sin comprobar sus datos personales. Coincidir en cantidad no asegura que se pueda confirmar el ingreso.

## 3. Flujo propuesto

### 3.1 Reserva y contexto de estadía

La reserva es la fuente de fechas y habitaciones contratadas. El alta de ocupantes muestra un resumen de solo lectura:

```text
Habitación 101 · capacidad 3 · 2 de 3 personas registradas
Entrada 29/09 · Salida 01/10
Titular: nombre ya registrado

[El titular también se aloja]   [Agregar acompañante]
```

Las fechas no se vuelven a pedir en el recorrido normal. El alta se inicia dentro de una habitación y hereda esa asignación. Si solo hay una habitación, no se muestra un selector redundante. Si hay varias, la selección se hace una vez al elegir dónde agregar a la persona.

Una estadía individual distinta o un cambio de habitación se ofrece como acción explícita separada, con validaciones y motivo cuando corresponda. No se eliminan del modelo los períodos individuales ni el historial, porque sirven para llegadas y salidas diferentes.

Los valores heredados se resuelven y comprueban también en backend. Ocultar campos no autoriza a confiar en una habitación o período manipulados en una solicitud.

### 3.2 Reutilización del titular

Preguntar si el titular se aloja. Si la respuesta es sí, ofrecer agregarlo usando los datos existentes; solicitar únicamente los faltantes. Si la respuesta es no, cargar a las personas alojadas sin convertir al titular automáticamente en una de ellas.

Evitar que repetir la acción cree dos ocupantes: si ya existe la misma identidad en la reserva, abrir ese registro. No actualizar silenciosamente los datos de otras reservas ni los del titular al editar un acompañante.

El modelo actual de titular tiene un solo campo `nombre`, mientras que ocupantes separa nombre y apellido. No dividir un nombre completo por espacios suponiendo cuál es el apellido. La implementación debe conservar el texto original y pedir confirmar una única vez la separación cuando resulte necesaria. Documento, tipo y contacto reutilizables no se vuelven a tipear. Si se adopta un vínculo explícito entre titular y ocupante, debe ser nullable y migrado de forma aditiva; no es requisito para resolver la precarga inicial.

### 3.3 Secuencia de walk-in

Propuesta: estadía y habitaciones → titular y ocupantes → revisión de faltantes → garantía y confirmación.

Actualmente la lista de ocupantes aparece en el último paso junto con la garantía. Debe adelantarse para detectar faltantes antes de autorizar/cobrar. Un cambio posterior de habitación o fechas obliga a recalcular cupos y validar los borradores, sin perder el texto ingresado ni reasignar personas silenciosamente.

La cantidad declarada por habitación se mantiene independiente de la lista: evita que “registré una persona” se convierta automáticamente en “llegó una persona”. Si hay una cantidad contractual futura, se precarga para confirmación; no se inventa a partir del número de formularios completados.

## 4. Campos y validaciones propuestos

Esta es una propuesta operativa para el proyecto, no una afirmación sobre obligaciones legales de registro hotelero.

| Dato | Tratamiento propuesto |
|---|---|
| Nombre y apellido | Obligatorios para registrar a quien se aloja. Reutilizar lo existente y aceptar nombres válidos con espacios, tildes o guiones. |
| Tipo de documento | Selector con el catálogo del proyecto; validar pertenencia también en servidor. |
| País emisor | Selector buscable con códigos estables; no texto libre. No inferir ciudadanía o residencia de ese valor. |
| Número de documento | Obligatorio para habilitar ingreso normal; reglas según tipo y país, no una única regla universal. |
| Nacimiento | Obligatorio antes del ingreso para determinar menor/adulto. Rechazar fechas futuras en el campo y en servidor. |
| Adulto responsable | Mostrar y exigir para menores; listar únicamente adultos válidos de la misma estadía, con período compatible. |
| Nacionalidad | Retirar del formulario obligatorio inicial. Conservar el dato existente y ofrecerlo en información adicional si el equipo necesita usarlo. |
| País de residencia | También opcional en información adicional hasta que exista un requisito concreto; no copiar desde nacionalidad. |
| Domicilio y localidad | Información adicional opcional, preservando valores existentes. |
| Teléfono y correo | Reutilizar contacto conocido; no exigir datos propios a cada menor o acompañante. Si se completan, validar su formato. Mantener explícitas las reglas del contacto del titular. |
| Entrada y salida | Resumen heredado de la reserva; modificar solo en una acción de estadía individual distinta. |
| Habitación | Heredada del contexto; selección explícita únicamente cuando todavía no se eligió una habitación. |
| Justificación sin documento | Retirar como alternativa libre que habilita ingreso. Un documento pendiente puede guardarse como borrador, pero no confirmar el ingreso. |

No borrar columnas ni datos históricos para simplificar una pantalla. Actualizar frontend y backend juntos si nacionalidad/residencia dejan de ser obligatorios: ocultarlas sin cambiar `validarCompleto` mantendría el bloqueo actual.

Si el equipo necesita ingresos excepcionales sin documento, diseñar ese circuito aparte con motivo definido y autorización real de servidor. No presentarlo como un campo libre suficiente. La propuesta base no permite ese bypass ni afirma que sea jurídicamente obligatorio.

### 4.1 Documento y normalización

- Compartir reglas entre titular de reserva, ocupantes y walk-in, con los mismos mensajes y casos de prueba.
- Para DNI argentino, proponer como regla de formato del proyecto 7 u 8 dígitos, normalizando separadores de presentación. Validar esta política contra los documentos que efectivamente admite el hotel antes de fijarla; no aplicarla automáticamente a documentos extranjeros.
- Mantener el número como texto. No aceptar letras o símbolos arbitrarios en un DNI ni convertir a número perdiendo información.
- Para otros tipos/países, usar reglas explícitas compatibles con documentos alfanuméricos; no reutilizar la restricción de DNI para pasaportes.
- Usar códigos estables de país y tipo, y una normalización común para búsqueda de duplicados e identidad activa.
- Validar formato no acredita autenticidad ni titularidad: la comprobación del documento presentado sigue siendo una acción explícita de recepción.
- No renormalizar masivamente identidades activas existentes durante la primera entrega. Revisar colisiones y compatibilidad antes de una migración de datos.

## 5. Cupos y validación inmediata

En cada habitación mostrar `registradas / declaradas / capacidad`. Antes de agregar una persona al arreglo de walk-in, verificar cupo, documento, duplicados y datos requeridos. No basta un atributo HTML `max` ni deshabilitar solo el botón final.

Al completar capacidad o cantidad declarada, deshabilitar Agregar con una explicación. Para aumentar personas por encima de lo declarado, primero corregir la declaración sin superar capacidad. Al editar, excluir a la propia persona del cómputo; al eliminar o cambiar una asignación, actualizar el cupo.

Considerar las fechas de cada ocupante y los intervalos superpuestos, no la cantidad histórica total de nombres. Las llegadas posteriores y salidas individuales requieren un control coherente con sus períodos reales y previstos.

El servidor conserva la validación dentro de la transacción y serializa escrituras que compiten por el cupo. Probar dos solicitudes simultáneas por la última plaza: como máximo una debe persistirse. La respuesta de conflicto debe actualizar la información de cupo en pantalla y conservar el formulario.

## 6. Errores y estados del formulario

Estados visibles: borrador/incompleto, completo pendiente de verificación y verificado. En walk-in, “listo para ingresar” exige la validación completa y la comprobación documental correspondiente, no solo contar una fila.

Validar al salir de un campo y reevaluar al corregirlo. No mostrar todos los campos en rojo al abrir un formulario vacío. Al intentar avanzar o guardar como completo, mostrar todos los problemas conocidos, enfocar el primero y mantener los datos.

La validación de formato y requeridos devuelve un mapa por campo. Antes de la transacción de confirmación, validar el conjunto de personas para informar todos los faltantes predecibles. Mantener dentro de la transacción los controles de estado, disponibilidad y concurrencia; estos pueden cambiar después de la validación previa.

Contrato propuesto, conservando `error` para clientes existentes:

```json
{
  "error": "Revisá los datos de los ocupantes.",
  "errores": {
    "personas[0].numeroDocumento": "Ingresá un DNI con formato válido.",
    "personas[1].fechaNacimiento": "Completá la fecha de nacimiento."
  },
  "conflictos": []
}
```

Separar mensajes de datos inválidos, falta de cupo y fallos de conexión. Un error de servidor no debe representarse como un campo documental inválido.

## 7. Fechas de cargos adicionales

Propuesta base para atender el problema reportado: en el alta normal, el cargo se registra ahora y la fecha/hora se asigna en el servidor. Mostrarla como información, sin selector libre de fecha pasada o futura. La habitación se conserva como destino económico y el titular como referencia secundaria.

No aceptar silenciosamente una fecha arbitraria enviada por API. Los clientes actuales que todavía manden una fecha manual deben recibir un mensaje claro si no cumplen la política nueva; actualizar el contrato y las pruebas junto con la pantalla.

Si el negocio necesita cargar un consumo de ayer, tratarlo como registro tardío explícito: dentro del período efectivo de la estadía, nunca futuro, con motivo y permisos validados en servidor. Esa excepción no forma parte del formulario normal ni queda habilitada por defecto en esta propuesta.

Hay una dependencia que debe resolverse: el modelo actual tiene ingreso real por persona, pero no una marca única de check-in real de la reserva. Si se necesita acotar consumos por instante real, agregar un dato confiable de inicio de estadía para nuevas reservas. No deducirlo únicamente del pago o inventarlo para reservas históricas. Mientras tanto, el alta normal usa el estado en curso y el reloj del servidor; los registros tardíos permanecen fuera del alcance base.

El cierre previsto vencido tampoco habilita ignorar una estadía vencida: exigir revisar/extender la reserva antes de registrar cargos nuevos fuera de su período, usando la zona horaria del hotel. Definir el límite del día de salida sin inventar un checkout automático a las 10:00.

`fechaHora` conserva el momento de registro. `fechaServicio` solo difiere si se implementa la excepción controlada. El adicional por ocupación calculado por noche debe distinguir fecha de la noche y fecha del asiento; no confundir un importe de alojamiento previsto con un consumo ya realizado ni permitir que ese camino eluda los límites de fechas.

## 8. Orden de implementación propuesto

1. **Contrato de datos y validadores:** catálogo de documentos/países, reglas de formato, campos requeridos y respuesta agregada de errores. Adaptar los tres flujos juntos.
2. **Formulario contextual:** separar `PersonaFormulario` de `EstadiaPanel`, heredar fechas/habitación y ofrecer reutilización del titular. Evitar un formulario genérico con todos los campos siempre visibles.
3. **Walk-in y cupos:** mover personas antes de garantía, validar cada alta/edición del borrador y corregir el indicador de listo para ingresar.
4. **Servidor:** aplicar reglas completas al registro que se presenta como completo, mantener borrador explícito si se permite, y reforzar confirmación transaccional y concurrencia.
5. **Fecha de consumos:** quitar el selector libre normal y validar el contrato de fecha también en servidor. Resolver períodos vencidos y adicionales por noche.
6. **Regresión, recorrido manual y documentación:** ejecutar los casos de la sección siguiente, mostrar evidencia de los errores corregidos y actualizar los documentos que hoy dan por suficiente la validación.

No ejecutar migraciones compartidas como consecuencia automática de este plan. Las correcciones de formulario y validación no requieren borrar tablas; cualquier dato nuevo de ingreso real o vínculo explícito debe proponerse mediante migración aditiva y probarse primero localmente.

## 9. Archivos principales afectados por la futura corrección

| Área | Archivos |
|---|---|
| Personas | `frontend/src/modulos/estadia/EstadiaPanel.jsx`, `PersonasWalkIn.jsx`; extraer el formulario y su validador. |
| Cantidades | `frontend/src/modulos/check-in/CantidadesOcupantes.jsx`, `validacionOcupantesIngreso.js`. |
| Flujo de ingreso | `frontend/src/modulos/check-in/CheckInConReserva.jsx`, `CheckInWalkIn.jsx`. |
| Reutilización y documentos | `frontend/src/modulos/reservas/ReservaWizard.jsx`, validadores de huésped de reservas/check-in y catálogos compartidos por contrato. |
| Reglas de servidor | `backend/src/modulos/estadia/estadia.servicio.js`, `ingreso.js`, `estadia.routes.js`, servicios/controlador de check-in y validación documental de reservas. |
| Consumos | `frontend/src/modulos/servicios-adicionales/ConsumoModal.jsx`, `backend/src/modulos/servicios-adicionales/serviciosAdicionales.servicio.js`. |
| Cargos por noche | `backend/src/modulos/estadia/condiciones.servicio.js`: revisar semántica y períodos. |
| Persistencia opcional | `backend/prisma/schema.prisma`, solo si se agrega fecha real de reserva o vínculo explícito con titular. |

## 10. Condiciones para habilitar el merge

| Caso | Resultado esperado |
|---|---|
| Agregar titular alojado | Documento, tipo y datos conocidos precargados; una segunda acción no duplica a la persona. |
| Titular que no se aloja | No ocupa plaza automáticamente. |
| Una habitación y fechas ya elegidas | No se vuelven a pedir como formulario obligatorio. |
| Reserva con varias habitaciones | Alta contextual correcta, sin asignación silenciosa a la primera. |
| DNI `ABC!`, vacío o con longitud no admitida | Error junto al campo antes de confirmar; API también lo rechaza. |
| Documento válido con separadores | Se normaliza de forma consistente; no permite un duplicado por diferencias de presentación. |
| Pasaporte/documento extranjero | No se aplican indiscriminadamente las reglas del DNI argentino. |
| País fuera del catálogo enviado por API | Rechazo, aunque se haya manipulado el cliente. |
| Menor sin adulto o responsable menor | Error previo al ingreso; selector solo ofrece responsables válidos. |
| Dos campos incompletos en dos personas | Ambos errores aparecen juntos, conservando el contenido del formulario. |
| Tres personas para habitación de capacidad dos | No se agrega la tercera al borrador; API tampoco persiste una sobreocupación. |
| Editar persona con habitación llena | No se cuenta dos veces a la persona editada. |
| Dos altas concurrentes por último cupo | Solo una persiste; la otra recibe conflicto claro. |
| Persona contada pero incompleta en walk-in | No aparece lista ni permite pasar a garantía/confirmación. |
| Fecha pasada o futura en consumo normal | No hay selección libre y el servidor rechaza un intento de eludir la regla. |
| Cambio de día y zona horaria | Comparación consistente con Argentina y reloj del servidor. |
| Consumo en reserva cerrada o fuera del período permitido | Rechazo sin registrar cargo ni descontar stock. |
| Falla al confirmar un grupo | Sin reserva, garantía ni ocupantes parcialmente confirmados. |
| Regresión de funciones existentes | Cargos por habitación, stock, garantías, pagos, login y checkout siguen funcionando. |

Verificación necesaria: pruebas de validadores, integración de API y concurrencia, pruebas de interacción de formulario y un recorrido manual con reserva simple, grupal, walk-in y menor. No aprobar solo por conservar el número de tests anteriores.

## 11. Decisiones recomendadas para la primera entrega

Implementar primero el flujo normal: documento obligatorio para ingresar, países mediante catálogo, información adicional opcional, reutilización del titular, contexto heredado, validación temprana, cupos inmediatos y fecha de consumo asignada por servidor.

Mantener fuera de esa entrega las excepciones sin documento y la carga tardía de consumos hasta definir sus reglas. Preservar los datos existentes y el historial. Esta propuesta establece qué debe corregirse y cómo comprobarlo; no constituye una afirmación de que esos cambios ya estén aplicados.

## 12. Calidad visual y facilidad de uso

Requisito añadido por el usuario: la corrección también debe ofrecer una presentación cuidada. La revisión visual forma parte de los criterios de aceptación antes del merge, junto con las validaciones funcionales. Esta sección define el diseño propuesto; no implica que las pantallas ya hayan sido rediseñadas.

### Coherencia con el proyecto

- Reutilizar la paleta, tipografías y componentes existentes: verde pino, fondos claros, bordes suaves, `Button`, `Input`, `Select`, `Badge`, `Modal` y encabezados como `TituloSeccion`.
- Reservar el color principal para la acción principal y la selección. Evitar múltiples botones destacados compitiendo dentro de una misma sección.
- Mantener tamaño de letra, espaciado y alineación uniformes. Respetar el tamaño moderado que el usuario pidió para el número de habitación.
- Utilizar iconos existentes como apoyo, acompañados de texto o nombre accesible. Ningún estado se comunica únicamente mediante color.

### Distribución por pantalla

| Pantalla | Presentación propuesta |
|---|---|
| Reserva y ocupantes | Resumen compacto de fechas y titular; una tarjeta por habitación con cupos visibles y su lista de personas. Acciones Agregar titular y Agregar acompañante contextualizadas. |
| Formulario de persona | Identificación primero, responsable solo cuando corresponde y sección plegable para información adicional. Datos heredados visibles como resumen de solo lectura. Dos columnas cuando haya espacio; una en pantallas pequeñas. |
| Walk-in | Pasos claros y breves, con resumen de habitación y cantidad disponible. Completar personas antes de garantía. Conservar datos al volver atrás. |
| Cargar consumo | Habitación destacada y titular debajo; servicio, cantidad y precio agrupados. Importe total visible y actualizado; fecha informativa asignada por servidor. |
| Cuenta y check-out | Importes alineados, desglose por habitación, saldo destacado y pendientes de revisión/garantía explicados antes de la acción de cierre. |

### Mensajes y estados

- Mostrar ayuda breve donde se toma la decisión, sin comentarios técnicos ni códigos internos en el recorrido habitual.
- Colocar el error junto al campo, vincularlo con `aria-describedby` y marcar `aria-invalid`. Al intentar avanzar, mostrar además un resumen que permita llegar a los campos pendientes.
- Cuando una acción esté bloqueada, explicar por qué: por ejemplo, “Falta verificar a una persona” o “Habitación completa: 2 de 2 plazas”.
- Diferenciar estados vacíos, carga, fallo de consulta y guardado correcto. No mostrar un fallo de red como si no hubiera personas registradas.
- Durante el envío, indicar progreso y prevenir dobles acciones. Al fallar, conservar los datos ingresados.
- En los diálogos, gestionar foco, navegación por teclado y retorno del foco al botón de origen al cerrarlos. El desplazamiento debe permitir alcanzar los campos y las acciones sin que se tapen.

### Comprobación visual antes del merge

Revisar en navegador a 360 px, 768 px y 1366 px de ancho, y con zoom al 200 %. Incluir nombres largos, documentos extensos, múltiples habitaciones y mensajes de error largos. No debe haber controles cortados, superposición de botones ni desplazamiento horizontal de toda la página. Las tablas que lo requieran pueden tener desplazamiento propio.

Verificar contraste, foco visible, etiquetas de campos, lectura de errores y operación por teclado. Revisar capturas de los estados normal, incompleto, completo, habitación llena y fallo de servidor, además del recorrido interactivo. Las pruebas automáticas y la compilación no sustituyen esta comprobación visual.
