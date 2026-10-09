# Rediseño visual del listado de Reservas (`/reservas`) + genéricos de listado

Continuación de la etapa 1 de HU-117. Es un cambio visual: **no hay historias nuevas, ni migraciones, ni cambios en `schema.prisma`**.
Único cambio de backend: `GET /reservas?estado=` acepta varios estados separados por coma (soporte técnico de la vista).

Capturas: [`docs/capturas-rediseno-reservas/`](capturas-rediseno-reservas/) (Reservas a 1440 y 390 px) y
[`otras-pantallas/`](capturas-rediseno-reservas/otras-pantallas/) (cada pantalla afectada por los genéricos).

## Qué cambia

### Reservas
- Encabezado con enlaces discretos (Disponibilidad, Huéspedes en casa, Gestionar no-show si `gestionarReservas`) y "Nueva reserva".
- "OPERACIÓN DE HOY": 4 tarjetas (Llegadas hoy, Salidas hoy, En casa, Próximas confirmadas) sin endpoints nuevos. Salen del mismo hook que los badges del menú; si una llamada falla, la tarjeta muestra "—".
- Pestañas por estado con contador (`?estado=`), banda de filtros ("Estadía entre … → …", Limpiar filtros, "N reservas"), tabla y paginación "Mostrando 1–50 de N".
- **"Todas" = Confirmada + En curso + Cerrada**; con texto de búsqueda incluye todos los estados (para hallar una cancelada por código o documento; también aplica a la búsqueda del Topbar).
- Tabla: Huésped (iniciales, documento **enmascarado** + país), Estadía (día de la semana, noches, aviso Llega hoy / Llegada atrasada / Sale hoy / Salida vencida), Habitación, Pax, Plan tarifario (etiqueta NO REEMBOLSABLE), Total estimado (es-AR), Estado (chip + código). Se quitaron la columna Código, Noches y MiniPasos (que no se modificó). Cancelada y No presentada se ven atenuadas.
- Toda la fila lleva al detalle; el nombre es un `<Link>` real; el menú ⋮ conserva TODAS sus acciones y condiciones y no navega. La cancelación (ConfirmDialog + CierrePrevio, garantía de Ricardo) no se tocó.
- Skeleton mientras carga y estado vacío "Sin reservas en esta vista".
- Tras crear, modificar o cancelar una reserva se refrescan la lista y los contadores; los contadores también se refrescan al entrar a `/reservas` y cada 5 minutos.

### Backend
- `listarReservas`: `estado` admite `"Confirmada,En curso,Cerrada"`. Cada valor se valida (desconocido → 400). Un solo valor genera exactamente el mismo filtro de antes. `conteoPorEstado`, orden (`id desc`) y paginación no cambian. Test: `listarReservasPaginado.test.js`.

### Enmascarado del documento (Ley 25.326)
En el listado de Reservas solo se muestran los últimos 4 caracteres (`DNI •••• 4127`; con 4 o menos, `••••`). La búsqueda por documento completo sigue funcionando (servidor). El detalle y el resto de las pantallas muestran el documento completo. Helper: `lib/documento.js`.

### Componentes genéricos (misma API; extras opcionales)
| Componente | Cambios |
|---|---|
| `Table` | Estilo nuevo (encabezado 11 px/700/mayúsculas, divisor `#f1ece2`, hover). Props opcionales: `onRowClick`, `cargando` + `filasSkeleton`, `vacioTitulo` + `vacioDescripcion`, `claseFila`. |
| `Badge` | Variantes de siempre sin cambios. Opcionales: `tono` (confirmada, en-curso, cerrada, cancelada, no-presentada → chip con punto) y `punto`. El gris "cancelada" solo se usa en Reservas. |
| `FilterBar` | Banda `#fcfaf6`. Opcionales: `incrustada` (para ir dentro de una tarjeta), `ocultarLimpiar`. |
| `MenuAcciones` | Trazo 1.6. Opcional `grande` (36 px); por defecto sigue en 28 px. |
| `Pestanas` (nuevo) | `role="tablist"`, flechas/Inicio/Fin, contador en píldora. |
| `TarjetaIndicador` (nuevo) | Tarjeta de indicador del día. |
| `Paginacion` (nuevo) | "Mostrando a–b de N" + `‹ 1 2 … última ›`. `Pagination` (viejo) sigue disponible. |

Los estilos de tabla (`.tabla-sgh`, chips, avisos) están en `estilos/shell.css` dentro de **`@layer components`**: las utilidades de Tailwind que cada pantalla pone en sus `td`/`tr` siguen ganando (verificado en Órdenes de Compra —importes alineados a la derecha— y Usuarios). Colores nuevos en `estilos/variables.css`.

### Hook `useContadoresRecepcion`
Además de `llegadas`, `salidas` y `vencidas` (lo que usa el menú, sin cambios: mismo número y mismo tono), expone `llegadasHoy`, `llegadasAnteriores`, `salidasHoy`, `salidasVencidas` y `enCasa` (habitaciones y huéspedes). Opción `puedeVerReservas` para que el gerente (que ve Reservas pero no Check-out) también obtenga la lista de En curso.

## Decisiones a revisar
- **Contraste:** el gris `#7a857e` del mockup da 3.8:1 sobre blanco en texto de 11 px. Se usó `#66726b` (5:1) para encabezados y códigos (`--text-3`), para cumplir 4.5:1.
- El sobretítulo "OPERACIÓN DE HOY" es un `<p>` y no un `<h2>`: la regla global `h1…h6` de `index.css` (sin capa) le pisaría el peso y el espaciado.
- `fechaDesde`/`fechaHasta` se comparan como texto `YYYY-MM-DD` y se formatean en UTC; "hoy" es `hoyEnHoraLocal()` (hora argentina). Hay test con `2026-10-08T00:00:00.000Z` → "jue 8 oct" y "Llega hoy" con reloj simulado.

## Pantallas afectadas por los genéricos (regla 15)
No se editó ningún archivo de esas pantallas. Se recorrieron con el sistema levantado (roles admin, gerente y compras), sin scroll horizontal de página y sin errores de consola.

**Cambios a la vista en todas las tablas:** encabezados más chicos y más espaciados, en gris más oscuro que antes, divisor de fila entre filas (`#f1ece2`) y leve tinte al pasar el mouse; trazo más fino en el ícono ⋮; `FilterBar` con fondo `#fcfaf6`.

Pantallas con `Table`: Panel del día, Historial de mantenimiento, Habitación (detalle), Check-in, Check-out y Check-out de la reserva, Órdenes de compra (lista y detalle), Pagos, Presupuestos (lista y detalle), Requerimientos (lista y detalle), Proveedores (lista y detalle), Stock, Stock mín./máx., Artículos, Depósito (detalle), Movimientos, Tipos de movimiento, Usuarios, Cuenta corriente, Comprobantes de proveedores, Comprobantes de huésped (lista y detalle), Movimientos de pago, Reporte de caja diaria, Tipos de habitación, Tarifas (precios, temporadas, planes, actualizaciones), Llegadas no presentadas, Detalle de reserva y los modales/wizards que muestran tablas.

Pantallas con `FilterBar`: Check-out, Comprobantes de huésped, Cuenta corriente, Habitaciones, Movimientos de pago, Pagos, Stock, Usuarios.

Pantallas con `Badge`: las anteriores más Alertas, Kardex, Recepciones y los dashboards (sin cambios visibles: las variantes se conservaron).

**Algo roto:** no se encontró nada roto funcionalmente. Se detectó y corrigió una regresión propia: un ⋮ de 36 px partía en dos líneas el estado ("EN LIMPIEZA") en las tarjetas de Habitaciones; por eso el 36 px es opt-in (`grande`).

**Sin baseline `antes`:** las capturas son del estado nuevo; las diferencias de arriba se describen por lo que cambió en el código de los genéricos.

## Pendiente de migrar al nuevo estilo (etapa 3)
Usar `Pestanas`, `TarjetaIndicador`, `Paginacion` y las props nuevas de `Table`/`FilterBar`/`Badge`/`MenuAcciones` en: Check-out, Comprobantes de huésped, Movimientos de pago, Huéspedes en casa, Llegadas no presentadas, Habitaciones, Órdenes de compra, Pagos, Presupuestos, Requerimientos, Proveedores, Stock y Usuarios. `Pagination` (viejo) se puede retirar cuando ninguna lo use.

## Verificación
- Backend: `npx jest src/modulos/reservas` → 9 suites, 64 tests.
- Frontend: `npm run build` sin errores; `vitest` → 74 archivos, 744 tests; `oxlint` sin hallazgos en archivos tocados (hay 3 errores `rules-of-hooks` previos en `TemporadasPage.jsx` y `ActualizacionesPage.jsx`, que no se tocaron).
- Recorrido manual (local, `sgh_gimena` vía backend de prueba en 3001): CA1 (203 = 84 + 15 + 104), CA2, CA3 (`En curso` → 15 como antes; `Confirmada,Cerrada` → 188; `Foo` y `Confirmada,Foo` → 400), CA5 (Llegada atrasada, Salida vencida), CA6, CA7 (4 habitaciones, `4 × Doble`, 10 adultos), CA8, CA10, CA11 (390/390 px; la tabla scrollea dentro de su tarjeta: 983 > 356).
- No se verificó con datos reales: "Llega hoy" ni "Sale hoy" (hoy no hay reservas con esa fecha; cubiertos por test con reloj simulado) ni la confirmación de una cancelación (se abrió el diálogo, no se confirmó para no modificar datos; el flujo no cambió).
