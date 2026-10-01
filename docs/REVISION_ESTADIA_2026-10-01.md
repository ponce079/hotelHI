# Correcciones de la revisión de estadía — 1 de octubre de 2026

Rama: `feature/estadia-ocupantes`. Integra `origin/master` hasta `b2ae58d`.
Este documento reemplaza las indicaciones de garantía y despliegue de los informes
históricos de septiembre. La garantía y las penalidades quedan a cargo de Ricardo.
No se abre PR ni se integra esta rama en master por instrucción del autor.

## Integración con tarifas

- `cotizacion.servicio.js` y `precios.servicio.js` conservan la versión de master.
- Alta y modificación guardan todas las noches con `createMany`.
- Se usa `OPCIONES_TRANSACCION` de master: timeout 30 segundos, espera 15 segundos.
- La relectura del alta para responder al cliente ocurre después del commit.
- Estadía no escribe noches ni calcula adicionales por persona. Los importes de
  alojamiento salen exclusivamente de `ReservaNoche`; el promedio informativo es
  `promedioPorNoche`.
- Se conserva `docs/bug-timeout-transacciones.md` y las reglas del ajuste manual,
  planes no reembolsables y penalidades.

## Personas y titulares

`OcupanteReserva.huespedId` referencia la ficha de `Huesped`.
`persona.servicio.js` busca o crea la persona mediante una clave única normalizada
de tipo, país emisor y número de documento. Nombres y correos no son identificadores.
El país emisor se pide también al crear la reserva, junto al documento y nacimiento;
el formulario permite seis países y otro país escrito manualmente.

Los registros sin documento conservan una ficha propia con número vacío; no se
deduplican por nombre. Al completar el documento se conserva o vincula la ficha
identificada. Los campos nuevos son opcionales en el esquema para admitir datos
históricos: antes del ingreso deben completarse y verificarse los ocupantes.
La migración no fusiona personas históricas con identidad ambigua.

`esTitular` es explícito: se selecciona en la ficha de la persona y se aplica a su
habitación vigente. El check-in rechaza cero o dos titulares por habitación y exige
que el titular sea adulto. El titular de la reserva se incorpora una sola vez por
su vínculo persistente; los eventos son auditoría, no la fuente de ese vínculo.

## Ampliación durante el check-in

1. El backend compara las personas registradas para hoy con adultos y menores de
   cada habitación de la reserva; nunca pide otra declaración de cantidades.
2. Si hay más personas, sin exceder la capacidad, consulta la vista previa de
   `modificarReserva` y responde **409** con
   `AMPLIACION_OCUPACION_REQUIERE_CONFIRMACION`, total anterior, nuevo, diferencia y
   token de la cotización. No persiste la ampliación ni confirma el ingreso.
3. La pantalla muestra los importes y la advertencia sobre ajustes manuales cuando
   corresponda. El usuario debe aceptar explícitamente.
4. El backend vuelve a validar ocupación y precio. Si cambió la cotización, exige
   una nueva confirmación. Si coincide, `modificarReserva` recotiza las noches y
   continúa el check-in en la misma transacción. Un error posterior revierte ambos.

**Cambio de firma para comunicar al equipo:**
`modificarReserva(id, data, cliente = prisma)` acepta una transacción existente.
Sus llamadas anteriores con dos argumentos mantienen el comportamiento previo.
La orquestación nueva vive en `modulos/estadia/ampliacion.servicio.js`; la
sincronización de fichas y fechas, en `reservaOcupantes.js`.

## Garantía y check-out

Se retiran `liquidarGarantia`, su ruta, interfaz y pruebas específicas, y las columnas
`garantiaAplicada`, `garantiaDevuelta` y `garantiaSeparada` del esquema y SQL de esta
rama. Se mantiene el tratamiento de pagos de master hasta integrar el módulo de
Ricardo. Eso todavía incluye el depósito de check-in en los pagos de la cuenta;
esta rama no implementa la futura preautorización con tarjeta ni su liquidación.

El registro existente del depósito usa la misma conexión transaccional del ingreso,
para evitar que una segunda conexión espere el bloqueo de la propia reserva.
Esto no cambia importes ni políticas de garantía.

Se mantienen cargos y verificaciones por habitación, exclusión de consumos anulados
de la cuenta y cierre de ocupantes/asignaciones al completar el check-out. Se
conserva el comportamiento de mantenimiento y limpieza de master.

## Migración y entorno

Único ejecutor: `backend/scripts/actualizar-esquema-estadia.js`.
Único SQL de esta ampliación: `backend/prisma/estadia-ocupantes-cargos.sql`.
Incluye nacimiento, país e identidad del huésped, FK de ocupante y titular explícito,
además de las tablas de estadía y campos de cargos. No altera tablas de tarifas.

Sin `--aplicar`, muestra el plan. Con `--aplicar`, respalda las tablas existentes
afectadas en `.local/respaldos-estadia/`, agrega los elementos faltantes y comprueba
que no queden pendientes. Es reejecutable: una segunda ejecución no repite DDL.
No borra columnas antiguas de una base local que ya las tuviera.

Exige `DATABASE_URL` explícita y destino local. No lee automáticamente `backend/.env`.
La migración compartida queda para el despliegue coordinado posterior a la revisión;
esta entrega no se conecta a Clever Cloud.

Copiar `.env.estadia.example` a `.env.estadia.local` y completar las variables.
El archivo local, las bases y los respaldos están excluidos de Git. Los lanzadores
solo aceptan las bases demo/test previstas en `127.0.0.1:3308`, y desactivan correo.
El seed requiere `SEED_USUARIOS_PASSWORD`; no hay contraseña por defecto.

`setup:estadia` requiere previamente las tablas base de tarifas. Aplica únicamente
la migración aditiva y el seed local; no ejecuta `db push`. Una computadora nueva
debe preparar la base local siguiendo `despliegue-tarifas.md` antes del lanzador.

## Pruebas

Desde la raíz:

```powershell
npm.cmd test
npm.cmd run test:estadia
npm.cmd run build
```

También puede ejecutarse `npm.cmd --prefix backend run test:integracion`.
La integración requiere MariaDB local y crea datos ficticios en
`hotelhi_adaptacion_test`; nunca debe cambiarse por la conexión compartida.

Casos reales cubiertos: titular automático, menor y contacto de responsable,
capacidad, verificaciones, seña, rollback, cargos y anulaciones por habitación,
check-out y limpieza, misma persona en dos reservas, cero/dos titulares y
ampliación con advertencia y diferencia igual al motor de tarifas.

Se ejecutan además los scripts de reservas, precios, cotización, ajuste/penalidad,
check-in y los relacionados con servicios, pagos y mantenimiento. Los conteos
definitivos de la validación se registran al completar la revisión.

## Prueba manual de ampliación

Reservar una doble para un adulto, completar y verificar al titular, agregar y
verificar otro adulto sin marcarlo como titular. Confirmar check-in: debe aparecer
la nueva cotización. Aceptarla: la reserva pasa a dos adultos y el alojamiento
refleja las noches recotizadas. Una tercera persona debe rechazarse por capacidad.
En otra prueba, quitar la marca de titular o marcar a ambos: el ingreso se bloquea
con un mensaje que explica la causa.
