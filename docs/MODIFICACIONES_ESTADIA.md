> Documento historico. Para la version actual, garantia delegada a Ricardo y pruebas locales, ver [revision del 1/10/2026](REVISION_ESTADIA_2026-10-01.md).

# Cambios de estadía: ocupantes y cargos por habitación

Fecha de referencia: 28 de septiembre de 2026.

Actualización del 29 de septiembre de 2026: se restauraron las integraciones sobrescritas al incorporar cambios del equipo. Se conservaron el login real, la gestión de usuarios y los cambios de conexión. Se regeneró Prisma con ambos conjuntos de modelos. La comprobación de solo lectura de la base compartida informó **0 operaciones pendientes**; no se aplicaron migraciones ni escrituras de prueba sobre ella. Véase `INTEGRACION_ACTUALIZACIONES.md` para el detalle de esta revisión.

### Actualización: registro completo al ingresar

Los dos endpoints de check-in requieren `cantidadesOcupantes`, una lista con una entrada por habitación: `[{ "habitacionId": 1, "cantidad": 3 }]`. No se deduce la cantidad de los registros existentes. Debe ser un entero positivo, no superar la capacidad y coincidir con las personas previstas para ingresar hoy en esa habitación. El servidor valida nuevamente los datos completos y la verificación antes de registrar el ingreso. Una solicitud antigua sin esta declaración se rechaza con HTTP 400.

La pantalla muestra la cantidad declarada, los registros y las personas listas para ingresar; mantiene bloqueada la confirmación mientras no coincidan. En walk-in, confirmar valida los datos y registra su verificación en la misma transacción. El evento `Check-in: ocupantes declarados` conserva las cantidades y los identificadores de las personas ingresadas. No requiere migración de esquema; no modifica estadías ya iniciadas. Recepción debe declarar el total real de personas presentes: el sistema no puede detectar a una persona que no fue declarada ni registrada. Las llegadas posteriores mantienen el ingreso individual existente.

Validación de esta actualización: 24 pruebas de backend y 131 de frontend aprobadas; integración completa aprobada en la base local aislada. No se ejecutó esta prueba sobre la base compartida.

Documento técnico y operativo para el equipo de HotelHI. Describe los archivos locales revisados y las operaciones registradas en esta sesión. No certifica que estos cambios estén publicados o integrados en GitHub: esta carpeta no contiene historial Git.

## 1. Alcance y estado

Se extendieron reservas, check-in, servicios adicionales y check-out para registrar personas alojadas, conservar asignaciones de habitación y desglosar los cargos de una estadía.

**Regla principal: el cargo pertenece a una habitación dentro de una reserva, no a una persona.** El operador que lo registra sí se conserva para trazabilidad. Una nueva reserva de la misma habitación no hereda los cargos anteriores.

La migración se ejecutó sobre la base seleccionada por `backend/.env`, utilizada como base compartida del proyecto. La última ejecución registrada agregó 24 operaciones de estructura, después de guardar un respaldo local. No ejecutó borrados ni actualizaciones de filas existentes; las columnas nuevas tienen valores nulos o predeterminados según el SQL.

Después se comprobó esta consulta a través de Vite:

```text
GET /api/consumos-servicios/hotel/resumen?desde=2026-09-28&hasta=2026-09-28
HTTP 200 — 0 consumos para ese período
```

El error anterior era Prisma `P2022`: faltaba `consumos_servicio_adicional.descripcion` en la base consultada.

## 2. Archivos principales

| Archivo o carpeta | Responsabilidad |
|---|---|
| [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | Modelo actualizado de Prisma. |
| [backend/prisma/estadia-ocupantes-cargos.sql](backend/prisma/estadia-ocupantes-cargos.sql) | Definición SQL de la ampliación. |
| [backend/scripts/migrar-estadia.js](backend/scripts/migrar-estadia.js) | Inspección, respaldo parcial y aplicación aditiva. |
| [backend/src/modulos/estadia](backend/src/modulos/estadia) | Ocupantes, asignaciones, condiciones, garantías e historial. |
| [backend/src/modulos/check-in/checkIn.servicio.js](backend/src/modulos/check-in/checkIn.servicio.js) | Validación e ingreso de ocupantes junto con el check-in. |
| [backend/src/modulos/check-out/checkOut.servicio.js](backend/src/modulos/check-out/checkOut.servicio.js) | Cuenta consolidada, revisión por habitación y cierre. |
| [backend/src/modulos/servicios-adicionales/serviciosAdicionales.servicio.js](backend/src/modulos/servicios-adicionales/serviciosAdicionales.servicio.js) | Carga, anulación e identificación de cargos. |
| [backend/src/modulos/reservas/reservas.servicio.js](backend/src/modulos/reservas/reservas.servicio.js) | Tarifa pactada y controles al modificar una reserva con ocupantes. |
| [frontend/src/modulos/estadia](frontend/src/modulos/estadia) | Panel de estadía, personas alojadas, condiciones y formularios. |

También se integraron las pantallas existentes de reserva, check-in con reserva, ingreso sin reserva y check-out; se agregó la ruta `/personas-alojadas` y su entrada de menú. El componente compartido `Modal` incorpora atributos de diálogo accesible.

Se restauraron los scripts del backend `dev`, `db:generate`, `db:check`, `db:push` y `db:seed`. La conexión Prisma vuelve a respetar `DATABASE_SSL=false` para bases locales.

## 3. Estructura agregada a la base

El SQL es la referencia exacta de tipos, índices y valores predeterminados. Los importes nuevos usan `DECIMAL(12,2)`.

### 3.1 Tablas nuevas

**`ocupantes_reserva`** — personas vinculadas a una estadía.

| Grupo | Columnas |
|---|---|
| Identificación del registro | `id`, `reservaId`, `identidadActiva` |
| Persona | `nombre`, `apellido`, `fechaNacimiento`, `nacionalidad` |
| Documento | `tipoDocumento`, `numeroDocumento`, `paisDocumento`, `motivoSinDocumento` |
| Residencia y contacto | `domicilio`, `localidad`, `paisResidencia`, `telefono`, `email` |
| Menores | `responsableId` |
| Estadía prevista | `fechaDesde`, `fechaHasta` |
| Estado y verificación | `estado`, `verificadoPor`, `verificadoEn` |
| Presencia real | `ingresoReal`, `salidaReal` |

`nombre` y `apellido` son obligatorios. Los datos de identificación pueden completarse antes de verificar al ocupante. Las fechas previstas y de nacimiento son `DATE`; los momentos reales son `DATETIME(3)`.

`identidadActiva` tiene un índice único y contiene un hash de tipo de documento, país emisor y número normalizados al ingresar. Se libera al registrar la salida. Evita dos ingresos activos con la misma identidad documental; las excepciones sin documento no tienen esa protección.

**`asignaciones_ocupantes`** — historial de habitaciones de cada ocupante.

- Columnas: `id`, `ocupanteId`, `habitacionId`, `desde`, `hasta`, `motivo`.
- Una asignación con `hasta = NULL` es la asignación vigente.
- El cambio cierra la asignación anterior y crea otra; no mueve cargos anteriores.
- Los cambios disponibles se realizan entre habitaciones que ya pertenecen a la reserva.

**`eventos_estadia`** — acciones registradas por el módulo.

- Columnas: `id`, `reservaId`, `accion`, `detalle`, `operador`, `fecha`.
- `detalle` es texto con contenido JSON.
- Registra altas y cambios de ocupantes, acciones individuales, cargos y anulaciones, condiciones y liquidaciones de garantía. No representa una auditoría integral de todas las operaciones del sistema.

### 3.2 Columnas en tablas existentes

| Tabla | Columnas agregadas | Uso |
|---|---|---|
| `reservas_habitaciones` | `tarifaPactada`, `ocupacionIncluida`, `precioPersonaExtra`, `serviciosIncluidos` | Precio contratado y condiciones de cada habitación. |
| `consumos_servicio_adicional` | `descripcion`, `precioUnitario`, `fechaServicio`, `incluido` | Detalle del servicio y cálculo del cargo. |
| `consumos_servicio_adicional` | `anulado`, `motivoAnulacion`, `anuladoPor`, `anuladoEn` | Anulación sin eliminar el movimiento. |
| `consumos_servicio_adicional` | `claveOperacion` | Clave única opcional para evitar duplicaciones por reintento. |
| `pagos_estadia` | `garantiaAplicada`, `garantiaDevuelta`, `garantiaSeparada` | Registro de aplicación/devolución y marca de las nuevas garantías. |
| `cargos_verificacion_checkout` | `habitacionId` | Habitación donde se verificó el incidente. |

Valores iniciales: importes de garantía y `precioPersonaExtra` en cero; `anulado`, `incluido` y `garantiaSeparada` en falso. Los campos opcionales quedan nulos en registros anteriores.

### 3.3 Relaciones e integridad

La migración agrega estas claves foráneas, con `ON DELETE RESTRICT` y `ON UPDATE CASCADE`:

- `ocupantes_reserva.reservaId → reservas.id`.
- `asignaciones_ocupantes.ocupanteId → ocupantes_reserva.id`.
- `eventos_estadia.reservaId → reservas.id`.

**No se agregaron claves foráneas** para `responsableId`, `asignaciones_ocupantes.habitacionId` ni `cargos_verificacion_checkout.habitacionId`. Sus asociaciones se validan en los servicios; las escrituras SQL externas pueden saltarse esas validaciones.

## 4. Reglas operativas implementadas

### Personas e ingreso

1. El titular de `Huesped` sigue siendo el titular de la reserva. No se convierte automáticamente en ocupante.
2. Los ocupantes se registran por reserva; no se creó un directorio global de personas reutilizable ni una vinculación automática con `Huesped`.
3. Las fechas previstas deben estar dentro del período de la reserva y la salida debe ser posterior al ingreso.
4. Se controla la capacidad por habitación y el solapamiento de períodos previstos.
5. Se rechaza la repetición de documento, tipo y país emisor dentro de una reserva, excepto registros cancelados.
6. La verificación exige nacimiento, nacionalidad y país de residencia, junto con documento completo o justificación de ausencia de documento.
7. Una persona menor de 18 años al ingreso previsto necesita un adulto responsable de la misma reserva.
8. El check-in inicial exige declarar explícitamente la cantidad de personas que ingresan hoy por habitación, incluidos menores y el titular si se aloja. Debe coincidir exactamente con los ocupantes registrados para ese día, todos con datos completos y verificados, sin superar la capacidad. Los adultos responsables deben ingresar junto con los menores a cargo.
9. El ingreso sin reserva recibe la lista de personas y registra su verificación e ingreso dentro de la transacción del check-in; admite hasta 100 personas por solicitud.
10. Una llegada posterior se registra individualmente cuando la reserva está en curso. El responsable de un menor debe estar alojado.

Estados de ocupante: `Previsto → Alojado → Retirado`; un ingreso pendiente puede pasar de `Previsto` a `Cancelado`. Editar una persona pendiente o alojada invalida su verificación previa. Los registros retirados o cancelados no se editan mediante este flujo.

Registrar la salida de una persona no cierra la reserva ni libera automáticamente la habitación. El check-out conserva esa responsabilidad.

### Cargos por habitación

- La asociación económica es `reservaId + habitacionId`; no se incorporó un identificador de consumidor al cargo.
- Solo se cargan cargos sobre reservas en curso y habitaciones asociadas a esa reserva.
- Categorías actuales: Restaurante, Spa, Lavandería, Minibar, Persona adicional y Otro. La documentación inicial enumeraba también Estacionamiento, Cama adicional y Salida tardía; esas tres opciones no aparecen en las constantes actuales después de la restauración. Véase el informe consolidado del período para esta diferencia.
- El backend calcula cantidad por precio unitario, con hasta dos decimales. Un servicio marcado como incluido tiene importe cero.
- `fechaServicio` distingue la fecha del consumo de `fechaHora`, que corresponde al registro. El reporte general actual sigue filtrando por `fechaHora`.
- La interfaz envía una `claveOperacion` para repetir una solicitud sin crear otro cargo. Los clientes que omitan esta clave no tienen esa protección.
- Minibar continúa utilizando el depósito configurado y los servicios existentes de salida de stock, dentro de la transacción del consumo.
- Una anulación exige motivo y operador, conserva el cargo y lo excluye de los totales. **No devuelve automáticamente productos al stock.**
- Las cuentas se desglosan por habitación, pero los pagos siguen perteneciendo a la reserva. No se implementaron cuentas de cobro independientes por persona o habitación.

### Condiciones y adicionales por ocupación

La tarifa pactada se guarda al crear nuevas reservas y se conserva al modificar habitaciones que permanecen en ellas. Una reserva anterior sin tarifa pactada utiliza como alternativa la tarifa actual de la habitación; no se reconstruyó el precio histórico.

Las condiciones permiten indicar personas incluidas, precio por persona adicional y una descripción de servicios incluidos. Esta última es informativa: no es un motor que marque automáticamente los servicios como gratuitos.

El adicional de ocupación se calcula por noche, considerando los ocupantes registrados y su historial de asignaciones. Recepción revisa una propuesta y confirma los cargos. Se rechaza una propuesta desactualizada. La clave por reserva, habitación y noche evita repetir cargos generados anteriormente, incluso si luego se anularon: esos ajustes deben revisarse manualmente. Cambiar condiciones no recalcula cargos ya registrados.

### Garantías y check-out

- Las nuevas garantías del check-in se registran en la misma transacción que el ingreso y llevan `garantiaSeparada=true`.
- La interfaz permite registrar importes devueltos o aplicados a la cuenta, con motivo y operador.
- No se permite superar la garantía disponible ni aplicar más que el saldo pendiente.
- Registrar una devolución es un asiento interno de una operación realizada; no ejecuta una transferencia ni un reembolso de tarjeta.
- El check-out exige verificación de cada habitación, cargos validados, saldo cero y ninguna garantía pendiente.
- Al cerrar, los alojados pasan a retirados y los ingresos aún previstos a cancelados; se cierran sus asignaciones vigentes. Las habitaciones ocupadas pasan a limpieza, manteniendo el tratamiento existente de mantenimiento.

**Compatibilidad corregida el 29/09:** `consolidarCargos` y la liquidación separan únicamente las garantías con `garantiaSeparada=true`. Las garantías históricas sin esa marca conservan su tratamiento como pago y no aparecen como nuevas garantías a liquidar. Se verificó esta distinción en la base local de pruebas. No se reclasificaron registros históricos.

La aplicación de garantía se permite contra el saldo general; no está restringida exclusivamente a cargos por daños.

## 5. Pantallas

En el detalle de reserva se agrega el panel con las pestañas **Personas**, **Cargos por habitación**, **Cuenta**, **Condiciones** e **Historial**, según los permisos visuales existentes.

- **Personas:** alta, edición, verificación, asignación y movimientos individuales.
- **Cargos por habitación:** consulta, alta y anulación, agrupadas por habitación.
- **Cuenta:** alojamiento, adicionales, revisión y total por habitación; pagos y saldo general; garantías.
- **Condiciones:** ocupación incluida y propuesta de adicionales.
- **Historial:** últimas acciones registradas.

La ruta `/personas-alojadas` muestra hasta 500 personas con estado alojado; permite buscar por nombre, apellido o documento. El historial devuelve hasta 200 eventos por reserva.

## 6. API agregada

Prefijo común: `/api/estadia`.

| Método | Ruta relativa | Operación |
|---|---|---|
| GET | `/alojados?q=` | Consultar personas alojadas. |
| GET | `/:reservaId/ocupantes` | Listar ocupantes y asignaciones. |
| POST | `/:reservaId/ocupantes` | Registrar persona. |
| PUT | `/:reservaId/ocupantes/:id` | Editar persona o cambiar asignación. |
| POST | `/:reservaId/ocupantes/:id/accion` | `verificar`, `ingresar`, `retirar` o `cancelar`. |
| GET | `/:reservaId/condiciones` | Consultar condiciones de habitaciones. |
| PUT | `/:reservaId/condiciones/:habitacionId` | Guardar condiciones. |
| GET | `/:reservaId/adicional-ocupacion` | Obtener propuesta de cargos. |
| POST | `/:reservaId/adicional-ocupacion` | Confirmar exactamente los `items` revisados. |
| GET | `/:reservaId/historial` | Consultar eventos. |
| POST | `/:reservaId/garantia` | Registrar devolución/aplicación de garantía. |

Fuera de ese prefijo se agregó `POST /api/consumos-servicios/:id/anular`, con `motivo` y `operador`.

El alta existente `POST /api/consumos-servicios` recibe habitación, reserva, categoría, descripción, cantidad, precio unitario, operador (`registradoPor`) y opcionalmente fecha de servicio, inclusión en tarifa y clave de operación. Minibar además necesita `articuloId`. Se conserva compatibilidad con el importe `monto` cuando no se recibe precio unitario.

Las acciones de estadía reciben `operador`; la liquidación de garantía recibe `pagoId`, `devolver`, `aplicar` y `motivo`. Los cargos de verificación de salida requieren `habitacionId` explícito. La interfaz puede preseleccionar la única habitación, pero el servidor no infiere ese dato si falta en la solicitud.

## 7. Actualización de las computadoras del equipo

Actualizar juntos backend, frontend, esquema Prisma y scripts. Copiar únicamente una pantalla o el esquema puede dejar contratos de API incompatibles.

Desde la raíz:

```powershell
npm.cmd run setup
```

Esto instala dependencias y genera el cliente Prisma. No aplica la migración a la base.

Luego, comprobar la estructura desde `backend` para que dotenv use el archivo correcto:

```powershell
Set-Location backend
node scripts/migrar-estadia.js
```

Sin argumentos, el script **solo consulta** la estructura. Sobre la base ya actualizada debería indicar cero operaciones pendientes. No hace falta aplicar otra vez el SQL por cada integrante del equipo.

Si otro entorno necesita la ampliación, coordinar primero con quien administra esa base, comprobar el destino de `DATABASE_URL` y revisar el SQL. La ejecución que sí modifica la estructura es:

```powershell
node scripts/migrar-estadia.js --aplicar
```

Finalmente, regresar a la raíz e iniciar:

```powershell
Set-Location ..
npm.cmd run dev
```

No ejecutar `db:push`, `db:seed` ni opciones de pérdida de datos sobre la base compartida como parte del arranque. `npm run dev` no aplica migraciones automáticamente.

## 8. Migración, respaldo y recuperación

El ejecutor consulta `information_schema` y omite columnas, tablas, índices y restricciones que encuentra por nombre. No verifica exhaustivamente que los tipos de objetos preexistentes sean idénticos al modelo. El archivo SQL directo no es idempotente; utilizar el ejecutor para reanudar una aplicación.

Los `ALTER TABLE` se ejecutan individualmente. **La migración completa no es una transacción atómica**: una interrupción puede dejar parte de la estructura aplicada. Revisar el error y volver a consultar antes de reanudar.

Antes de aplicar cambios pendientes se guarda un JSON en `.local/respaldos-estadia/`, con `SHOW CREATE TABLE` y filas de:

- `reservas`, `reservas_habitaciones`, `habitaciones`.
- `consumos_servicio_adicional`.
- `pagos_estadia`, `pagos_estadia_medio`.
- `cargos_verificacion_checkout`.

**Es un respaldo parcial, no un volcado completo ni un restaurador automático.** No incluye, por ejemplo, `huespedes`, todas las tablas de stock ni las nuevas tablas de ocupantes en una ejecución posterior.

Respaldos encontrados localmente al documentar:

| Archivo | Contexto registrado |
|---|---|
| `antes-1790609153634.json` | Prueba de migración en una base local aislada. |
| `antes-1790609193271.json` | Aplicación anterior a la conexión configurada. |
| `antes-1790647626268.json` | Última aplicación registrada, al corregir el error de columna faltante. |

El JSON no registra host ni nombre de base. La atribución anterior procede de las ejecuciones de la sesión, no del contenido del respaldo; verificar el destino antes de usarlo para recuperar datos.

No hay un rollback SQL automatizado. Una reversión exige revisar los datos creados después de la migración y su compatibilidad con el código anterior. No eliminar las nuevas tablas ni restaurar estos JSON sobre la base compartida sin un plan de recuperación que preserve los cambios posteriores.

No publicar `.env` ni los respaldos: pueden contener información operativa y personal. El `.gitignore` raíz ahora excluye `.local/`. Este documento no incluye credenciales ni registros de huéspedes.

## 9. Pruebas y reproducción

Últimos resultados registrados en la sesión, no ejecutados nuevamente para redactar este documento:

| Comprobación | Resultado |
|---|---|
| Backend Jest | 24 pruebas aprobadas. |
| Frontend Vitest | 163 pruebas aprobadas. |
| Integración con MariaDB aislada | Flujo completo aprobado. |
| Compilación de frontend | Correcta; advertencia por tamaño del paquete JavaScript. |
| Validación Prisma | Esquema válido. |
| Lint de frontend | Sin errores; 13 advertencias. |

Desde la raíz:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd --prefix frontend run lint
```

Desde `backend`:

```powershell
node node_modules/prisma/build/index.js validate
node scripts/pruebas-estadia-integracion.js
```

La integración requiere la instancia local preparada en `127.0.0.1:3308`, base `hotelhi_estadia_test_v2`, con el esquema actualizado. El script fija esa conexión y no utiliza la base de `.env`; no es una prueba lista para ejecutar en cualquier computadora. Crea registros ficticios que permanecen en la base aislada. `npm run dev` no inicia automáticamente esa instancia de pruebas.

Cobertura relevante: duplicados, capacidad, adulto responsable, rollback de check-in incompleto, ingreso, tarifa pactada, garantía, cargos por habitación, reintentos, servicios incluidos, anulaciones, revisión por habitación, pago y cierre. Las pruebas unitarias adicionales cubren cambios de habitación, salidas anticipadas y fechas inválidas.

### Recorrido manual de aceptación

1. Crear una reserva ficticia para hoy, con dos habitaciones.
2. Registrar y verificar a los ocupantes; comprobar duplicados, capacidad y menores.
3. Declarar la cantidad que ingresa en cada habitación. Probar que con tres declaradas y solo una registrada no se permite confirmar; completar los registros y verificarlos para habilitar el ingreso. Confirmar check-in y verificar el listado de personas alojadas.
4. Cargar lavandería en una habitación y restaurante en la otra; comprobar que no se solicita consumidor.
5. Registrar un servicio incluido; debe sumar cero.
6. Anular un cargo con motivo; debe conservarse visible y salir del total.
7. Configurar ocupación incluida, revisar una propuesta y confirmar adicionales por habitación.
8. Verificar ambas habitaciones al salir, liquidar la garantía y saldar la cuenta.
9. Confirmar check-out: ocupantes retirados, reserva cerrada y habitaciones en limpieza cuando corresponda.
10. Verificar que no se admiten cargos nuevos sobre la reserva cerrada.

Realizar el recorrido en una base de desarrollo. En la compartida, una prueba manual crea registros reales; minibar además modifica stock.

## 10. Limitaciones y trabajo pendiente

- El equipo incorporó login real y gestión de usuarios. Se conservaron esos cambios. Las rutas de estadía, al igual que otros módulos operativos actuales, todavía no exigen autenticación en el servidor; `operador` procede del cliente y no prueba una identidad autenticada. No presentar este historial como auditoría de seguridad ni exponer datos personales públicamente.
- No se implementó un perfil global reutilizable de ocupantes, importación de listas, precarga por enlace ni integración con puntos de venta.
- Los cambios de ocupante se limitan a habitaciones ya asociadas a la reserva; no hay un flujo completo de sustitución de habitación fuera de ella.
- Los cargos se agrupan por habitación, pero no hay distribución de pagos ni facturas independientes por habitación o persona.
- `serviciosIncluidos` es texto informativo; el operador marca cada consumo incluido explícitamente.
- No hay horario automático de salida a las 10:00 ni recargo automático por demora. En el catálogo actual un cargo manual de este tipo puede describirse bajo Otro.
- El control de adulto responsable no reemplaza requisitos legales de registro; no se implementaron reportes a autoridades.
- Las reservas históricas no reciben ocupantes inventados ni se reconstruyen sus tarifas. Deben completarse los ocupantes para realizar nuevos check-ins con este flujo.
- Los cargos de revisión históricos sin habitación siguen sin asignación. El nuevo cierre exige revisión identificada por habitación.
- La compatibilidad de garantías históricas se corrigió el 29/09 y se comprobó en la base local; no se reclasificaron registros históricos.

## 11. Resumen para compartir con el equipo

Se ampliaron tres tablas nuevas y cuatro existentes para ocupantes, historial y cargos por habitación. La base configurada ya recibió la migración aditiva. El equipo debe actualizar el código completo y regenerar Prisma; no debe volver a crear tablas manualmente ni ejecutar `db:push` sobre la base compartida. Los cargos se imputan a habitación y reserva, mientras los ocupantes se usan para identificación, presencia y capacidad. Los pagos continúan consolidados por reserva. Revisar las limitaciones de autenticación y garantías históricas antes de considerar el flujo listo para producción.
