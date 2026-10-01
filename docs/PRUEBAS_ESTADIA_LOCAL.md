> Documento historico. Para la version actual, garantia delegada a Ricardo y pruebas locales, ver [revision del 1/10/2026](REVISION_ESTADIA_2026-10-01.md).

# Pruebas locales de estadía y tarifas — 30/09/2026

## Entorno

Trabajo local en `feature/estadia-ocupantes`, adaptado al código de `master`
`963d60c`. No se hizo commit, push ni PR durante esta adaptación.

Para probar en esta computadora, desde la raíz:

```powershell
npm.cmd run dev:estadia
```

Abrir http://127.0.0.1:5173 e iniciar sesión con
`recepcionista.prueba` / `<SEED_USUARIOS_PASSWORD>`. También están disponibles
`gerente.prueba` y `admin.prueba` con esa contraseña inicial.

Si los servidores ya están levantados, usar directamente esa dirección.
No iniciar otra copia del backend. Para volver a iniciarlos desde una terminal,
detener primero la instancia anterior.

La base de demostración es `hotelhi_estadia_demo`, en MariaDB local puerto
3308. No usa los datos de Clever Cloud y no envía correos. `backend/.env`
se conserva. Las habitaciones iniciales son 301/303 dobles y 302/304 triples.
Las tarifas y usuarios son ficticios para pruebas.

`npm.cmd run setup:estadia` prepara este esquema y los datos iniciales. Ya se
ejecutó. Su repetición no elimina reservas, no libera habitaciones usadas ni
restablece contraseñas existentes. No emplea `--accept-data-loss`.

Estos comandos dependen de la instalación portátil existente en
`.local/mariadb-11.4.12-winx64` y su configuración
`.local/test-estadia-data/my.ini`, con escucha local en 3308. Esos archivos
no se suben a Git. En otra computadora hay que preparar esa instancia o
definir un entorno local equivalente antes de usar el lanzador; este no
descarga ni instala MariaDB. Nunca reemplazar la conexión por la compartida
para ejecutar estas pruebas.

## Recorrido manual

1. Crear una reserva para hoy y salida en dos días. Elegir una habitación
   doble, **2 adultos y 0 menores**, y un plan tarifario. La capacidad 2 no
   significa que se hayan reservado automáticamente dos personas.
2. Completar el titular y confirmar la seña con efectivo. Revisar código,
   ocupación y precio total de la reserva.
3. Abrir las personas de la reserva. Debe existir **una sola ficha del
   titular**. Editarla para completar apellido, nacimiento, documento/país
   emisor, nacionalidad y residencia. No volver a darlo de alta.
4. Agregar al acompañante, completar sus datos y verificar ambas fichas.
   Un documento o correo duplicado debe advertirse. Una tercera persona no
   puede superar la capacidad de la doble.
5. Abrir check-in y buscar el código. El resumen debe mostrar 2 personas
   reservadas, 2 registradas y 2 verificadas. No hay un segundo campo para
   volver a declarar la cantidad. Completar documento y garantía, confirmar.
6. Cargar un consumo de lavandería a **esa habitación**. Comprobar cantidad,
   precio e importe; el nombre del titular es una referencia secundaria.
   Revisar que el cargo figure en la cuenta de esa habitación. Probar su
   anulación con motivo y comprobar el ajuste del saldo.
7. Revisar la habitación para check-out, resolver la garantía (devolverla o
   aplicarla al saldo), cobrar lo pendiente y confirmar la salida. Las
   personas quedan retiradas y la habitación pasa a limpieza.

Casos adicionales:

- Reservar una triple con 2 adultos y 1 menor. Registrar al menor con un
  responsable adulto. Con dos fichas, sin verificación o con edades que no
  coinciden con la ocupación reservada, el check-in debe explicar el bloqueo.
- Antes del check-in, modificar la ocupación de 1 a 2 adultos mediante
  **Modificar reserva** y revisar la nueva cotización. Registrar una ficha
  adicional no cambia por sí solo la ocupación ni el precio vendido.
- Modificar la salida antes del ingreso: comprobar la nueva cotización y
  las fechas de las fichas que abarcaban toda la reserva; se deben verificar
  otra vez. No se reemplaza ni duplica la ficha del titular.
- Probar el ingreso sin reserva con todas las personas cargadas. Si falta
  una, la operación completa se revierte.
- Cambiar una tarifa del catálogo desde gerencia y comprobar que una reserva
  ya confirmada conserva sus precios por noche, salvo modificación explícita.

## Comprobaciones automatizadas realizadas

- Backend Jest: 47 pruebas aprobadas (11 suites).
- Frontend Vitest: 206 pruebas aprobadas.
- Motor de cotización: 16 pruebas aprobadas.
- Precio/modificación de reserva: 13 pruebas aprobadas.
- Ajustes y penalidades: 26 pruebas aprobadas.
- Compilación de producción del frontend correcta; Vite mantiene un aviso
  de tamaño del paquete JavaScript.
- Integración real en **otra base local**, `hotelhi_adaptacion_test`: alta,
  titular, duplicados, menores, capacidad, verificación, rollback, ingreso,
  noches congeladas, cargos/anulación, garantía, pago, salida, walk-in,
  señas efectivo/transferencia, incorporación concurrente, modificación y HTTP.
- Aplicación levantada: frontend, habitaciones, reservas, resumen de cargos
  y login recepcionista respondieron HTTP 200.

Para repetir la integración, con MariaDB de pruebas disponible y ese esquema
preparado: `npm.cmd run test:estadia`. El script fuerza su destino local y
agrega registros propios; no borra los resultados anteriores. No usa la base
de demostración ni la base compartida.

## Alcance y pendientes de integración futura

Esta adaptación permite probar ocupantes y cargos con los tipos y tarifas
actualizados. No equivale a aprobar los criterios de un futuro merge:
la identidad canónica compartida entre huésped y ocupante, titular explícito
por habitación, extensiones con la estadía ya en curso y el nuevo diseño de
garantías con tarjeta/cancelación requieren su trabajo y coordinación aparte.
La edición general de reservas conserva la restricción del equipo: solo
reservas confirmadas. El cálculo de penalidades del equipo se conserva;
no se convirtió en un cobro automático.

Las pruebas HTTP y de componentes no sustituyen la revisión visual completa
en navegador ni una prueba de despliegue sobre la infraestructura compartida.
