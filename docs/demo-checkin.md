# Datos de demo del check-in

Script: `backend/scripts/seed-checkin-demo.js` (`npm run seed:checkin-demo`). Deja la lista de **Llegadas de hoy** con los casos de la presentación, con fechas relativas al día en que se corre.

## La mañana de la presentación

1. Backend apuntando a la base **local** de la presentación (`backend/.env`, `DATABASE_URL` con `localhost` o `127.0.0.1`). El script se niega a correr contra cualquier otro host (misma guardia que `db:push`).
2. Si la base es nueva: `node backend/scripts/seed-tarifas.js` y `node backend/scripts/seed-demo-salta.js` (como siempre).
3. Desde `backend/`, en este orden:
   ```
   npm run seed:checkin-demo -- --limpiar
   npm run seed:checkin-demo
   ```
4. Abrir **Check-in**. Tienen que verse seis llegadas de hoy y el aviso "Hay 1 reserva de días anteriores sin ingreso".

El día es el de Argentina (`lib/fechas.js`), a cualquier hora: a las 02:43 del 03/10 dice 03/10.

### Si ensayaste antes

La misma secuencia deja todo usable, aunque en el ensayo se hayan hecho check-ins:
- `--limpiar` anula (baja lógica, motivo "Datos de demo") las reservas de demo **Confirmadas** y **cierra con el flujo real de check-out** las estadías de demo **En curso**: verificación "sin novedades" de cada habitación, pago en **efectivo** por el saldo (queda anotado en el manifiesto como pago de demo) y confirmación del check-out. Las personas quedan retiradas, sin estadía activa. Si alguna no se puede cerrar sola, la lista con el motivo, sigue con las demás y termina con código de salida distinto de 0. No borra nada y nunca toca reservas que no sean de demo.
- Después, el seed crea los casos de hoy. Antes de reutilizar o crear un caso, revisa sus personas: si alguna sigue alojada en otra estadía (por ejemplo, porque no se corrió `--limpiar`), el caso se recrea con **personas nuevas** (documentos `99…` distintos) y lo dice: `i) … — recreado con personas nuevas: las anteriores siguen alojadas en 968DD072`. Vale también para la persona que vuelve (caso f), que siempre queda sin estadía activa.
- Un error en un caso no corta el script: se informa, se sigue con los demás casos, con las habitaciones del walk-in y con la impresión final, y el código de salida es distinto de 0.

Se puede correr las veces que haga falta: si los casos de hoy ya están y sus personas están libres, no crea nada nuevo (no duplica habitaciones, huéspedes ni reservas).

`--limpiar` también devuelve a "libre" las habitaciones que el check-out de la demo dejó "en limpieza": la limpieza se da por hecha. Lo mismo hace con las habitaciones de demo de corridas anteriores que no tienen una estadía en curso. Así, cada corrida no tiene que crear habitaciones nuevas. Las habitaciones en mantenimiento no se tocan.

## Casos

| | Caso | Para probar |
|---|---|---|
| a | Martín Gutiérrez — Doble, 2 adultos + 1 menor, tarifa flexible, **seña con tarjeta** (VISA ****4242) | Check-in completo, chip de seña. Nombre y apellido llegan **cada uno en su campo**, sin aviso. El menor (Tomás) viene precargado con su responsable como **"Padre o madre"** |
| b | Sofía Ruiz Díaz — **2 habitaciones**: Doble 2 adultos + Simple 1 adulto y 1 menor, seña por transferencia | Filas por habitación, un titular por habitación. El menor (Joaquín) viene precargado a cargo de la titular de la otra habitación como **"Otro familiar"**, con la **autorización presentada**. Desmarcar la casilla bloquea la confirmación |
| c | Lucía Fernández — Doble, 2 adultos, **no reembolsable** | Tarifa no reembolsable en el resumen. Quitar a uno dice "No cambia el precio": la Doble ya incluye 2 adultos |
| d | Diego Morales — Doble de capacidad 3 con **3 adultos**, tarifa flexible | Quitar un adulto: el total baja un adicional por noche |
| e | María José Fernández Ruiz — pasaporte de Chile, **nombre completo en un solo campo** (huésped viejo: es el único caso sin nombres y apellido separados) | Aviso "El nombre viene completo desde la reserva": se separa a mano |
| h | Federico Álvarez — Doble de capacidad 3 con **3 adultos**, **no reembolsable** | Quitar un adulto: "Tarifa no reembolsable: el precio no baja" |
| f | Carolina Paz — **estadía anterior cerrada** (hace 30 días) | Persona que vuelve: DNI **99784205** (Argentina). El script lo imprime al final |
| g | Pedro Vargas — Confirmada con ingreso **ayer**, sin check-in | Aviso de posible no-show (no figura en la lista) |
| i | Valeria Ríos — **en curso desde hoy**, Doble de capacidad 3 con 2 adultos, 3 noches | Detalle de la reserva → Agregar persona (un tercer adulto): vista previa del cargo por noche, Confirmar y ver los cargos «Persona adicional» en Cargos por habitación |

Para el walk-in quedan al menos dos habitaciones libres Doble y dos Simple (el script lo garantiza y las lista).

## Cómo se reconocen los datos de demo

No hay marcas visibles en pantalla. Se reconocen por dos cosas a la vez:

- el **documento** de las personas empieza con `99`;
- el **manifiesto local** `backend/scripts/.demo-checkin.json` (ignorado por Git), con los ids de reservas, huéspedes y habitaciones creados, separados por base de datos.

`--limpiar` y la recreación diaria solo tocan reservas que están en el manifiesto **y** cuyo titular tiene documento `99…`. Nunca tocan las reservas de `seed-demo-salta.js` (documentos `9000000x`) ni datos reales.

## Habitaciones de demo

Si no alcanzan las habitaciones libres del inventario, el script crea habitaciones de los pisos 4 y 5 (401 a 420 y 501 a 512, sin repetir números existentes) con el equipamiento normal de su tipo. Quedan en el manifiesto y se reutilizan en las corridas siguientes; `--limpiar` no las borra.

## Caso f: estadía anterior sin tocar numeraciones

La estadía anterior se arma con el flujo real: alta, check-in con las personas, verificación, pago del saldo y check-out. Después se corren 30 días atrás todas sus fechas: reserva, noches, fichas, ingreso y salida, pagos, eventos y notificaciones.

- El check-out **no emite comprobantes** (se emiten aparte, desde Comprobantes), así que ninguna numeración correlativa queda fuera de orden.
- Los pagos de esa estadía se corren de fecha para que **no aparezcan en la caja de hoy**.
- La habitación vuelve a "libre" (la limpieza fue hace un mes).

## Probado

- `npm run test:seed-demo` (base local de pruebas): seed → check-in por la API de los casos a, b y d (el i ya está en curso) → `--limpiar` → seed. Las estadías de demo en curso quedan cerradas, todos los casos aparecen, ninguna persona de un caso está alojada en otra estadía y los casos a, b, c, d, e y h se confirman por la API. Además, un seed sin limpiar después de confirmarlos recrea los casos con personas nuevas sin cortarse.

- En una base recién cargada (`hotelhi_pruebas`: catálogo copiado + `seed-tarifas.js` + `seed-demo-salta.js`): dos corridas seguidas sin cambios en los conteos, `--limpiar` sin tocar las 7 reservas de `seed-demo-salta` y una nueva corrida que recrea los casos.
- En `sgh_gimena`, con el inventario casi todo ocupado: crea las habitaciones 401 a 411 una sola vez; la segunda corrida no crea ninguna.
