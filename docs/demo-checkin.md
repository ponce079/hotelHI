# Datos de demo del check-in

Script: `backend/scripts/seed-checkin-demo.js` (`npm run seed:checkin-demo`). Deja la lista de **Llegadas de hoy** con los casos de la presentación, con fechas relativas al día en que se corre.

## La mañana de la presentación

1. Backend apuntando a la base **local** de la presentación (`backend/.env`, `DATABASE_URL` con `localhost` o `127.0.0.1`). El script se niega a correr contra cualquier otro host (misma guardia que `db:push`).
2. Si la base es nueva: `node backend/scripts/seed-tarifas.js` y `node backend/scripts/seed-demo-salta.js` (como siempre).
3. `npm run seed:checkin-demo`
4. Abrir **Check-in**. Tienen que verse cinco llegadas de hoy y el aviso "Hay 1 reserva de días anteriores sin ingreso".

Se puede correr las veces que haga falta: si los casos de hoy ya están, no crea nada nuevo (no duplica habitaciones, huéspedes ni reservas). Si se corre otro día, anula los casos del día anterior que quedaron Confirmados y crea los de hoy.

Para dejar todo como antes: `npm run seed:checkin-demo -- --limpiar`. Anula con baja lógica (motivo "Datos de demo") las reservas de demo Confirmadas y lista las que quedaron **En curso**, que hay que cerrar con check-out desde la pantalla. No borra nada.

## Casos

| | Caso | Para probar |
|---|---|---|
| a | Martín Gutiérrez — Doble, 2 adultos + 1 menor, tarifa flexible, **seña con tarjeta** (VISA ****4242) | Check-in completo, chip de seña, menor con responsable |
| b | Sofía Ruiz Díaz — **2 habitaciones**: Doble 2 adultos + Simple 1 adulto y 1 menor, seña por transferencia | Filas por habitación, un titular por habitación, menor con responsable de la otra habitación |
| c | Lucía Fernández — Doble, 2 adultos, **no reembolsable** | Quitar a alguien: "Tarifa no reembolsable: el precio no baja" |
| d | Diego Morales — Doble de capacidad 3 con **3 adultos**, tarifa flexible | Quitar un adulto: el total baja un adicional por noche |
| e | María José Fernández Ruiz — pasaporte de Chile, **nombre completo en un solo campo** | Aviso "El nombre viene completo desde la reserva" |
| f | Carolina Paz — **estadía anterior cerrada** (hace 30 días) | Persona que vuelve: DNI **99784205** (Argentina). El script lo imprime al final |
| g | Pedro Vargas — Confirmada con ingreso **ayer**, sin check-in | Aviso de posible no-show (no figura en la lista) |

Para el walk-in quedan al menos dos habitaciones libres Doble y dos Simple (el script lo garantiza y las lista).

## Cómo se reconocen los datos de demo

No hay marcas visibles en pantalla. Se reconocen por dos cosas a la vez:

- el **documento** de las personas empieza con `99`;
- el **manifiesto local** `backend/scripts/.demo-checkin.json` (ignorado por Git), con los ids de reservas, huéspedes y habitaciones creados, separados por base de datos.

`--limpiar` y la recreación diaria solo tocan reservas que están en el manifiesto **y** cuyo titular tiene documento `99…`. Nunca tocan las reservas de `seed-demo-salta.js` (documentos `9000000x`) ni datos reales.

## Habitaciones de demo

Si no alcanzan las habitaciones libres del inventario, el script crea habitaciones del piso 4 (401 a 412, sin repetir números existentes) con el equipamiento normal de su tipo. Quedan en el manifiesto y se reutilizan en las corridas siguientes; `--limpiar` no las borra.

## Caso f: estadía anterior sin tocar numeraciones

La estadía anterior se arma con el flujo real: alta, check-in con las personas, verificación, pago del saldo y check-out. Después se corren 30 días atrás todas sus fechas: reserva, noches, fichas, ingreso y salida, pagos, eventos y notificaciones.

- El check-out **no emite comprobantes** (se emiten aparte, desde Comprobantes), así que ninguna numeración correlativa queda fuera de orden.
- Los pagos de esa estadía se corren de fecha para que **no aparezcan en la caja de hoy**.
- La habitación vuelve a "libre" (la limpieza fue hace un mes).

## Probado

- En una base recién cargada (`hotelhi_pruebas`: catálogo copiado + `seed-tarifas.js` + `seed-demo-salta.js`): dos corridas seguidas sin cambios en los conteos, `--limpiar` sin tocar las 7 reservas de `seed-demo-salta` y una nueva corrida que recrea los casos.
- En `sgh_gimena`, con el inventario casi todo ocupado: crea las habitaciones 401 a 411 una sola vez; la segunda corrida no crea ninguna.
