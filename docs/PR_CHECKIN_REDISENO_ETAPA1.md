# Rediseño del check-in — Etapa 1 (backend) · HU-115

Rama `feature/checkin-rediseno` → `feature/estadia-ocupantes` (cuando estadía entre a `master`, se redirige a `master`; sin merge ni rebase contra `master`).

El check-in con reserva y el walk-in se confirman con **una sola llamada atómica** que incluye la ocupación final de cada habitación, todas las personas y, con reserva, la habitación definitiva. Se suman los endpoints de apoyo que necesita la pantalla única de la etapa 2. **Sin migración de esquema** (la auditoría usa `EventoEstadia`) y sin migración de datos (la base local solo tiene DNI).

> **Numeración del backlog:** la historia nueva es la **HU-115**. El bloque **HU-107 a HU-114 queda reservado para Ricardo** (garantía con tarjeta).

## Contratos para la etapa 2

Errores siempre `{ error, codigo?, detalle? }`; `error` está redactado para mostrarse tal cual (sin nombres de campos ni de tablas).

### `POST /api/check-in/:id/confirmar` (body nuevo; sin `personas` se mantiene el flujo anterior)
```jsonc
{
  "operador": "recepcionista.prueba",
  "habitaciones": [{ "habitacionIdAnterior": 12, "habitacionId": 14, "adultos": 2, "menores": 1 }],
  "personas": [{
    "id": 1, "habitacionId": 14, "esTitular": true, "responsableId": null,
    "nombre": "Ana", "apellido": "Pérez", "tipoDocumento": "DNI", "paisDocumento": "AR", "numeroDocumento": "30111222",
    "fechaNacimiento": "1990-01-01", "nacionalidad": "AR", "paisResidencia": "AR", "localidad": "Salta", "domicilio": "…",
    "telefono": "+54 387 555-1234", "email": "", "motivoSinDocumento": null, "usarContactoResponsable": false
  }],
  "totalEsperado": 240000,
  "motivoTitularDistinto": "Reservó un familiar que no viaja",
  "garantiaConfirmada": true, "medioGarantia": "Efectivo", "referenciaGarantia": null
}
```
- `id` es temporal (lo arma la pantalla); `responsableId` apunta al `id` de otra persona del envío, que puede estar en otra habitación de la reserva.
- `habitacionId` de cada persona es la habitación **definitiva**. Cada habitación de la reserva tiene que figurar exactamente una vez en `habitaciones`.
- **200**: reserva formateada (como hoy), en `En curso`.
- **400** `OCUPACION_INVALIDA`: `detalle = { generales: string[], porHabitacion: [{ habitacionId, numero, errores: string[] }] }` (para la barra de faltantes).
- **400** `MOTIVO_TITULAR_REQUERIDO`: ningún titular de habitación es quien reservó y falta el motivo.
- **409** `PRECIO_CAMBIO`: `detalle = { totalAnterior (el informado), totalNuevo, diferencia, mensajeNoReembolsable }`. No se escribe nada.
- **409** `CAMBIO_HABITACION_INVALIDO`: otro tipo, no libre, ocupada en esas noches o ya incluida en la reserva.
- **409** persona ya alojada en otra estadía (con su nombre y reserva).

Ya no hay "documento presentado": la identidad sale de las personas. Las fichas **Previstas** anteriores (el titular que se incorpora al reservar y las cargadas desde la ficha de la reserva) se dan de baja lógica con el motivo "Reemplazada en el check-in". **Para la etapa 2: la pantalla debe precargar esas fichas en las filas** (`GET /api/estadia/:id/ocupantes`).

### `POST /api/check-in/walk-in` (mismo contrato, ampliado)
`{ operador, fechaHasta, habitaciones: [{ habitacionId, adultos, menores, planTarifarioId? }], planTarifarioId, totalEsperado, personas: [...], garantiaConfirmada, medioGarantia, referenciaGarantia?, huesped? }`
- Varias habitaciones, de distinto tipo, con **un solo plan**: un `planTarifarioId` por habitación distinto del general → 400; una habitación repetida → 400.
- `huesped` es **opcional**: si no viene, se arma con el titular de la primera habitación (`contacto` = correo o, si no hay, teléfono) y se vincula por identidad de documento (reutiliza y actualiza la ficha existente).
- **201** reserva formateada · **400** `OCUPACION_INVALIDA` · **409** `PRECIO_CAMBIO` (mismo `detalle`) o habitación tomada.

### `GET /api/check-in/habitaciones-libres?fechaHasta&adultos&menores&tipoHabitacionId&excluir=3,7`
Misma forma que hoy. Con `adultos`, cada plan trae el total de **esa** ocupación y `planTarifarioId`; la capacidad mínima es adultos + menores; solo habitaciones `libre`; `excluir` saca las ya elegidas para otra habitación del mismo walk-in. Sin `adultos`, el comportamiento anterior (2 + 0). El total definitivo de la reserva sale de `POST /api/reservas/cotizar` con todas las habitaciones.

### `POST /api/reservas/cotizar`
Igual que hoy, más `planes[].planTarifarioId`.

### `GET /api/check-in/llegadas?q=` (sesión + rol de check-in)
```jsonc
{ "fecha": "2026-10-01", "anterioresPendientes": 3,
  "reservas": [{ "id", "codigoConfirmacion", "fechaDesde", "fechaHasta", "noches",
    "titular": { "nombre", "tipoDocumento", "numeroDocumento", "paisDocumento" },
    "habitaciones": [{ "id", "numero", "tipo", "tipoHabitacionId", "capacidad", "estado", "adultos", "menores", "totalAlojamiento" }],
    "plan": { "id", "codigo", "nombre", "reembolsable" }, "totalAlojamiento",
    "senia": { "registrada", "importe", "medios": [{ "medioPago", "importe", "referencia" }] } }] }
```
Solo Confirmadas con ingreso **hoy** (hora argentina). `q` busca por código, nombre o documento. `referencia` va tal como está guardada (no se arman datos de tarjeta).

### `POST /api/check-in/:id/previa-ocupacion` (sesión + rol de check-in, solo lectura)
Body `{ habitaciones: [{ habitacionIdAnterior?, habitacionId, adultos, menores }] }` →
`{ totalAnterior, totalNuevo, diferencia, diferenciaPorNoche: [{ fecha, anterior, nuevo, diferencia }], mensajeNoReembolsable, mensajeAjustePerdido, porHabitacion: [{ habitacionId, habitacionIdAnterior, numero, adultos, menores, totalAnterior, totalNuevo, diferencia }] }`.

### `GET /api/huespedes/por-documento?tipo=DNI&pais=AR&numero=30111222` (sesión + rol de check-in)
Coincidencia **exacta** por identidad de documento. → `{ tipoDocumento, paisDocumento, numeroDocumento, nombre, apellido, fechaNacimiento, nacionalidad, paisResidencia, localidad, domicilio, telefono, email, fechaUltimaEstadia, alojadaAhora }` · 404 si no existe · 401 sin sesión · 403 sin permiso. Nada más (Ley 25.326).

Sesión y rol: `requiereSesion` + `requiereRol("admin","recepcionista")`, equivalente a `puede("gestionarCheckIn")` del frontend. No se modificó el middleware.

## Reglas implementadas
- **Ocupación** (`check-in/ocupacionIngreso.js`, validación pura antes de abrir la transacción): al menos 1 adulto, capacidad, personas que coinciden con adultos y menores de cada habitación, un titular por habitación, responsable para todo menor de 18, persona repetida, teléfono del titular de la reserva y titular distinto.
- **Edades**: `EDAD_ADULTO_OCUPACION = 13` y `MAYORIA_EDAD = 18` en `lib/fechas.js`.

  | Uso | Constante |
  |---|---|
  | Contar adultos y menores de la habitación (`ingreso.js` `validarOcupacion`, `ampliacion.servicio.js`, `ocupacionIngreso.js`) | 13 |
  | Titular de habitación (`estadia.servicio` `guardar`, `ingreso.js`, `cargaMasiva` ×2, `contactoPersona`, `ocupacionIngreso`) | 18 |
  | Titular de la reserva (`reservas.servicio` `validarTitularAdulto`) | 18 |
  | Responsable de un menor y "el responsable conserva su condición de adulto" (`estadia.servicio`, `cargaMasiva`, `contactoPersona`, `ocupacionIngreso`) | 18 |
  | Quién necesita responsable (`estadia.servicio` `validarCompleto`, `ocupacionIngreso`) y quién puede usar el contacto del responsable (`cargaMasiva`, `contactoPersona`) | 18 |
  | Retirar a los menores antes que a su responsable (`accion` "retirar") | por `responsableId`, sin cambios |
- **Confirmación atómica** (`check-in/confirmacionAtomica.js`): bloqueo de la reserva → cambio de habitación validado (`FOR UPDATE` + `buscarConflictos`) → total recalculado y comparado **antes de escribir** → `modificarReserva` en la misma transacción (recotización noche por noche, NRF no baja, la noche recotizada pierde el ajuste manual) → reasignación de `ReservaHabitacion` con un `UPDATE … CASE` (las `ReservaNoche` cuelgan de esa fila: el precio no cambia; la habitación anterior no se toca) → baja lógica de las fichas previas → carga en lote verificada → auditoría del titular distinto → `prepararIngreso`, `marcarEnCurso` y ocupación de las habitaciones definitivas.
- **Persona que vuelve**: upsert por identidad de documento; se actualizan nombre, nacimiento, contacto y residencia en una sola sentencia. El correo manda: un correo ya guardado no se pisa con un teléfono. Una persona repetida en el envío da 400; una ya alojada en otra estadía da 409.
- **Catálogo único de documentos** (`lib/tiposDocumento.js`, backend y frontend): DNI, Pasaporte, Cédula de identidad, Libreta de Enrolamiento, Libreta Cívica. Se retiran NIE y TIE. La clave de identidad no cambia (se calcula en mayúsculas).
- **Contacto**: el huésped acepta correo o teléfono con formato (un teléfono ya no da 400). Sin correo, la confirmación de la reserva queda como aviso interno para recepción.
- **Doble envío del walk-in**: verificado con dos envíos concurrentes. El segundo espera el lock de las habitaciones y MySQL lo corta por deadlock (**P2034**); se responde **409** "Otra operación tomó la misma habitación al mismo tiempo…", y queda una sola reserva.
- **Ampliación con 409 + token**: se mantiene para el flujo anterior. **Recomendación: retirarla en la etapa 2** (`ampliacion.servicio.js`, `ConfirmarAmpliacion.jsx`, `confirmacionAmpliacion`), cuando la pantalla use `totalEsperado`.

## Excepción documentada: cantidad de consultas
Todo lo nuevo usa una cantidad fija de consultas (`createMany`, `updateMany` y `UPDATE … CASE`; `modificarReserva` pasó de un `updateMany` por par de ocupación a una sola sentencia). **La excepción aprobada es el motor de tarifas**: `cotizacion.servicio.js` (`cotizarReserva`) hace `habitacion.findUnique` una vez por habitación (tope: 20 habitaciones por reserva). No se modificó en esta rama. El test de conteo (`pruebas-estadia-consultas.js`) excluye esa clave de forma explícita y comentada, y comprueba que crezca solo por habitación.

## Para Ricardo: qué se tocó en `checkIn.servicio.js`
- `confirmarCheckInConReserva`: acepta además `habitaciones`, `personas`, `totalEsperado` y `motivoTitularDistinto`. Con `personas` se saltea la comparación del documento presentado y delega la transacción en `confirmacionAtomica.js`. **`validarGarantia` se sigue llamando en el mismo lugar (antes de la transacción) y `registrarGarantia` después, sin cambios.** Sin `personas`, el cuerpo es el de siempre.
- `registrarCheckInWalkIn`: validación de ocupación y plan único antes de la transacción, `huesped` armado desde el titular, transacción envuelta en `conConcurrenciaComo409`. `validarGarantia` y `registrarGarantia`, en el mismo lugar y sin cambios.
- `listarHabitacionesLibresAhora`: `adultos`, `menores` y `excluir`.
- Nuevos exports: `ocuparHabitaciones` y `conConcurrenciaComo409`. Nueva función `conConcurrenciaComo409`.
- `checkIn.constantes.js`: solo se agrega `ROLES_CHECK_IN`.
- **No se tocaron**: `registrarGarantia`, `validarGarantia`, `MONTO_GARANTIA`, constantes de garantía, `GarantiaFieldset`, `TarjetaSimuladaPanel` ni `consolidarCargos`.

## Pruebas
- `npm run test:checkin-rediseno` (nuevo, base local `hotelhi_pruebas` con la guardia de host; fechas relativas): **13 bloques OK**, criterios 1 a 12 más el doble envío. Incluye los conteos antes y después del 409, el contrato HTTP del 409 y 401/403/200 de la búsqueda por documento (el usuario de prueba se crea y se borra solo en la base de pruebas).
- `npm run test:estadia`: **OK** (fixtures con teléfono del titular, nacimientos relativos y mensajes nuevos).
- `node backend/scripts/pruebas-estadia-consultas.js`: **14/14** (dos casos nuevos: confirmar y walk-in completos).
- Scripts con doble de Prisma (16): **todos OK**.
- Jest backend: **88/88** (12 nuevos de `ocupacionIngreso`).
- Vitest frontend: **219/219**.
- Prueba manual con PowerShell contra el backend local sobre `sgh_gimena`:
  - Criterio 1: 200, `En curso`, 3 alojados verificados, una garantía de $30.000.
  - Criterio 4: 409 sin escribir nada; con el total correcto, 200.
  - Criterio 8: 200, 404, 404, 401.
  - Criterio 9: 201, 2 habitaciones de distinto tipo, total igual al cotizado, titular solo con teléfono.
  - El criterio 3 no se pudo reproducir con el inventario libre de esa base (no quedaba una Doble de capacidad 3 libre y la Simple no tiene adicional en la temporada actual). Queda cubierto por la prueba automática: BAR −$20.000 y NRF sin baja.
  - Las reservas de prueba quedaron en `sgh_gimena`: 60E6B852, 470AB2B6, 692D85A7 y 348460B3.

### Fallos preexistentes (por separado)
- En `feature/estadia-ocupantes` (`de022c6`), todo verde: jest 76/76, los 16 scripts con doble OK y `test:estadia` OK.
- Vitest: `EstadiaPanel.test.jsx > detecta correo repetido…` venció por tiempo (5 s) una vez en la línea base y pasó en las corridas siguientes. Es intermitente y no lo causa esta rama.
- El único fallo aparecido en la rama (`pruebas-reservas.js`, que esperaba la palabra "tipoDocumento" en el mensaje) es consecuencia del ajuste de mensajes en lenguaje de recepción y ya está actualizado.

## Hallazgo para Tomás
`PATCH /api/reservas/:id` (modificar reserva, incluida la ocupación y el precio) **no exige sesión**. No se corrigió en esta rama (login y usuarios son de Tomás).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
