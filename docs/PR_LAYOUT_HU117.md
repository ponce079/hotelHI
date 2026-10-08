# HU-117 — Menú lateral agrupado, barra superior y encabezado de página (Etapa 1)

Rama: `feature/hu-117-layout` (desde `master` al día). **Revisa Tomás**, porque se reescribe el menú de HU-71.
Puro frontend: sin backend, sin base de datos, sin migraciones.

## Qué cambia

- **Sistema de diseño**: `frontend/src/estilos/variables.css` es el único archivo con colores, radios y tipografías (`:root`). El `@theme` de `index.css` pasa a apuntar a esas variables (no se duplicaron valores): `hueso`, `white/surface`, `tinta`, `borde`, `pino`/`pino-700`, `piedra`/`neutro-700`, radios 8 px (controles) y 12 px (tarjetas), y las fuentes.
- **Tipografías autoalojadas** (`@fontsource`, sin pedidos a Google en la app interna): Manrope 400/500/600/700 para toda la interfaz (cifras tabulares en `body`) y Cormorant Garamond 600 para la marca y el h1. Se agregó también `@fontsource/ibm-plex-mono` (400/500) solo para que `font-mono` siga viéndose igual ahora que `index.html` ya no la pide a Google. `ecommerce.css` no se tocó (conserva su propio `@import`).
- **Menú lateral** (`componentes/layout/Sidebar.jsx`, `MenuCuenta.jsx`): 264 px / 76 px contraído, logo de montaña, "Holiday Inn" en serif, "SALTA · SGH", grupos desplegables, ítem activo con `aria-current="page"` y barra de 3 px, nombres con ellipsis (tooltip al contraer), navegación con scroll y tarjeta de usuario fija abajo.
- **Barra superior** (`layout/Topbar.jsx`): miga "Grupo / Pantalla", buscador (Enter → `/reservas?q=`), "Hoy · jue 08/10/2026" con `lib/fechas.js` (nuevo `etiquetaHoyConDia()`), hamburguesa debajo de 900 px.
- **`PageHeader`** (`componentes/PageHeader.jsx`): h1 en serif, subtítulo opcional y acciones a la derecha.
- Definición del menú en **un solo archivo**: `componentes/menuConfig.js` (array `MENU` con grupo, ítems, ruta, ícono y `roles`).
- Preferencias en `localStorage` por usuario, con `try/catch` (`lib/preferenciasMenu.js`): menú contraído y grupos plegados.
- `Button.jsx`: los botones pasan de la serif a la sans (regla 2 del brief). Es el único cambio en un componente compartido más allá del shell.

## HU-71 (permisos) — sin cambios

No se tocó `lib/sesion.jsx` ni `puede()`. Cada ítem conserva el array `roles` que ya tenía y se filtra con `item.roles.includes(rol)`, igual que antes; un grupo sin ítems visibles no se muestra. El bloqueo por URL sigue en cada pantalla.
`menuConfig.test.js` compara, **para los 6 roles**, el conjunto de rutas visibles contra una copia congelada del menú anterior (`menuConfig.antes.js`): es idéntico, con una sola diferencia documentada: **"Disponibilidad"** (`/reservas/disponibilidad`) es un ítem nuevo que pidió el brief, con los mismos roles que Reservas (admin, recepcionista, gerente).

## Mapeo ítem → ruta

| Grupo | Ítem | Ruta | Roles (sin cambios) |
|---|---|---|---|
| (sin título) | Panel del día | `/` | todos |
| Recepción | Reservas | `/reservas` | admin, recepcionista, gerente |
| | Disponibilidad (nuevo) | `/reservas/disponibilidad` | admin, recepcionista, gerente |
| | Check-in | `/check-in` | admin, recepcionista |
| | Check-out | `/check-out` | admin, recepcionista |
| | Huéspedes en casa (antes "Personas alojadas") | `/personas-alojadas` | admin, recepcionista |
| Caja y facturación | Caja diaria | `/reporte-caja-diaria` | gerente |
| | Comprobantes de huésped | `/comprobantes-estadia` | admin, recepcionista |
| | Movimientos de pago | `/movimientos-pago` | admin, recepcionista |
| Habitaciones | Estado de habitaciones | `/habitaciones` | admin, recepcionista, housekeeping |
| | Mantenimiento (antes "Historial de Mantenimiento"; conserva el badge de pendientes) | `/historial-mantenimiento` | admin, recepcionista, housekeeping |
| | Tipos de habitación | `/tipos-habitacion` | admin, recepcionista, gerente |
| Comercial | Tarifas | `/tarifas` | admin, recepcionista, gerente |
| | Servicios adicionales | `/servicios-adicionales` | admin, recepcionista |
| Stock | Stock y depósitos | `/depositos` | todos |
| | Artículos | `/articulos` | admin, deposito |
| | Movimientos de stock | `/movimientos` | admin, deposito |
| | Recepciones | `/recepciones` | deposito, admin, compras, gerente |
| | Alertas de stock | `/alertas` | compras, gerente |
| | Stock mín. / máx. | `/stock/minmax` | compras, admin |
| | Reporte de consumo | `/reporte` | gerente |
| | Tipos de movimiento | `/tipos-movimiento` | admin |
| Compras | Proveedores | `/proveedores` | compras, admin |
| | Requerimientos | `/requerimientos` | compras, deposito |
| | Presupuestos | `/presupuestos` | compras, gerente |
| | Órdenes de compra | `/ordenes-compra` | compras, gerente, deposito |
| | Comprobantes | `/comprobantes` | compras |
| | Pagos | `/pagos` | compras, gerente |
| Administración (arranca cerrado) | Usuarios y roles | `/usuarios` | admin |

### Omitidos / ubicados con criterio

- **No-show**: hoy no tiene entrada de menú (se llega desde el botón de Reservas); no se agregó. Queda con miga "Recepción / Llegadas no presentadas".
- **Cuenta corriente**: no tiene entrada de menú; es una pestaña dentro de Pagos (cuenta de **proveedores**, así que iría en Compras). No se agregó.
- **Ventas web**: no existe pantalla interna (`/web` es el motor público). No se agregó (ya estaba excluido en el brief al aprobar).
- **Kardex** y **Control de stock** (`/stock`): tampoco tenían menú, siguen por URL.
- **Tipos de habitación** va en Habitaciones, después de Mantenimiento, con los mismos roles de siempre. Administración queda solo con Usuarios y roles, así que únicamente el administrador ve ese grupo.
- **Caja diaria** va en Caja y facturación (solo gerente) y **Reporte de consumo** en Stock, como indicó el brief.

### Menú de cuenta — omitido

- **"Cambiar contraseña"**: omitido a pedido (duplicaría "Mi perfil", donde ya está).
- Quedan: nombre, email (si el perfil lo tiene), rol, "Mi perfil" → `/mi-perfil` y "Cerrar sesión" (rojo, separado) con `cerrarSesion`. Se cierra con Escape, click afuera y al elegir una opción.

## Barra superior: decisión a revisar

El buscador **no se muestra si el rol no tiene `puede("verReservas")`** (hoy housekeeping, depósito y compras): a ellos `/reservas` les mostraría "sin permiso". Se usa `puede()` solo para leer, no se cambia nada.

## Pantallas migradas a `PageHeader` (5)

- `ReservasPage` (banner → `PageHeader`; se saca el `font-mono` del subtítulo).
- `PreciosPage` (Tarifas).
- `CheckInPage` (subtítulo = fecha · Recepción).
- `AlojadosPage` (título ahora "Huéspedes en casa", igual que el menú).
- `ReservaDetallePage`: no tenía el banner verde sino su propio encabezado; `EncabezadoReserva.jsx` ahora usa `PageHeader` (título "Reserva", código y badges como subtítulo, acciones a la derecha).

## Pantallas que **siguen con el banner viejo** (verde, subtítulo `font-mono`), por dueño

Dueño = quien más commits tiene en el archivo (`git log`); el historial está muy concentrado en Gimena, así que conviene que cada integrante confirme cuáles son suyas.

- **Tomás Gudiño** (usuarios / paneles de inicio): `MiPerfilPage`, `AdminInicio`, `HousekeepingInicio`, `RecepcionistaInicio` (dashboard, Panel del día).
- **Ricardo A.** (garantía, penalidades, pagos de estadía): `NoShowPage`, `MovimientosPagoPage`.
- **Agustín Farfán** (habitaciones): `HabitacionesPage`, `HabitacionDetallePage`, `HistorialMantenimientoPage`.
- **Gimena** (autora principal del resto; se dejaron para una etapa 2 porque el brief pidió solo las 5 pantallas de arriba): `CheckOutPage`, `ComprobantesEstadiaPage`, `ServiciosAdicionalesPage`, `DisponibilidadPage`, `PagosPage` y `CuentaCorrientePage` (estas dos con una tarjeta verde propia, no banner de página).
- Las demás pantallas (Stock, Compras, etc.) no tenían banner verde: solo un h1 propio.

## Cambios que afectan a otros integrantes

- **`Button.jsx`**: pasa de serif a sans (Manrope) en **todas** las pantallas, no solo en las migradas.
- **Ítem nuevo "Disponibilidad"** (`/reservas/disponibilidad`) con los roles de Reservas (admin, recepcionista, gerente). Revisado en el diff: **la ruta no tiene control de roles propio ni en el router** (`App.jsx` no gatea rutas por rol), **ni en `DisponibilidadPage`** (sin `puede()`/`SinPermiso`); el backend solo pide sesión para `GET /api/reservas/disponibilidad`. Es el estado de siempre (antes se llegaba por el botón "Ver disponibilidad" y por URL, sin control de rol). Esta rama solo agrega el ítem de menú; los roles del ítem se ocultan en el menú pero **la pantalla sigue accesible por URL para cualquier usuario con sesión**. No se tocó por ser lógica de permisos (HU-71, Tomás): queda como observación para su revisión.
- **Fuentes autoalojadas**: después del merge hay que correr `npm install` en `frontend/` (nuevas dependencias `@fontsource/manrope`, `@fontsource/cormorant-garamond` y `@fontsource/ibm-plex-mono`).
- **Variables de diseño**: `index.css` migra tokens existentes (fondo, superficie `#fff`, bordes, verde `#1F4A3A`, texto secundario, radios 8/12 px y tipografías) a `variables.css`; el contenido de todas las pantallas cambia levemente de tono y de fuente (Manrope en vez de Sora, Cormorant en vez de Fraunces).
- **Pantallas que siguen con el banner viejo, por dueño** (se migran en su propio PR): ver la sección "Pantallas que siguen con el banner viejo" de arriba (Tomás, Ricardo, Agustín y Gimena).

## Lo que NO se tocó

`lib/sesion.jsx`/`puede()`, pantallas de usuarios, e-commerce (`ecommerce.css`, `LayoutEcommerce`), garantías/penalidades, contenido interno de cada pantalla, backend, base de datos.

## Verificación

- `npm run build`: OK, sin errores. La advertencia de chunk > 500 kB ya existía (una sola entrada con todas las pantallas).
- `vitest` completo, **3 corridas seguidas** sobre el estado final de la rama: 70 archivos / 686 tests en verde las tres veces, 0 fallos.
- Test inestable: `src/modulos/habitaciones/HabitacionesPage.test.jsx`, caso "navega a /habitaciones/:id al hacer click en la tarjeta de una habitación". Falló una sola vez con `Unable to find role="button" and name /55/` (el `findBy` venció a los ~2,4 s) en una corrida que compartía CPU con Chrome sacando capturas. No pasó en las 3 corridas finales ni aislado. Esta rama no modifica nada de `modulos/habitaciones/` (diff vacío contra master) y los tests de habitaciones, reservas y check-in también pasan en un worktree limpio de `master`. **No pude reproducirlo en master**, así que no lo registro como problema previo confirmado: es una sensibilidad a carga (timeout) de ese test, no relacionada con esta rama. No se arregló acá.
- `lib/fechas.js`: solo se **agregó** `etiquetaHoyConDia()`; ninguna función existente cambió. No había un test propio de `fechas.js` (lo ejercitan indirectamente los tests de check-in, dashboard, reservas, habitaciones y e-commerce que lo importan); se agregó `lib/fechas.test.js` para la función nueva (día y fecha en hora argentina, incluso después de las 21 hs).
- `oxlint`: los archivos nuevos/modificados no suman advertencias (los avisos y el error de `PreciosPage` —`useQuery` condicional, línea 25— son anteriores).
- Contraste (calculado): texto del menú 10,0:1, rótulos de grupo 6,7:1, ítem activo 9,2:1, secundario 5,0–5,6:1; la burbuja del badge usa terracota 10 % más oscuro para llegar a 4,5:1 con texto blanco de 11 px.
- Recorrido manual con Chrome contra el backend de prueba en 3001 (base local `sgh_gimena`; no se escribió ninguna base remota) con **Recepcionista** (`recepcionista.prueba`) y **Administrador**, sesiones minteadas con `firmarToken`:
  - 1366×768: admin y recepcionista, ítems de 40 px, sin ningún nombre partido en dos líneas (0 de 19), la zona de navegación scrollea y la tarjeta de usuario queda fija abajo; "Check-out" visible sin scroll; al final del scroll se alcanza "Usuarios y roles".
  - 1920×1080: mismo resultado (el administrador, con 19 ítems, igual scrollea la zona de navegación por unas decenas de píxeles; todo es alcanzable).
  - Entrada directa a `/usuarios` (admin): "Usuarios y roles" activo y Administración abierto aunque por defecto arranque cerrado.
  - Menú de cuenta abierto, menú contraído (76 px, tooltips) y 390 px con panel lateral y hamburguesa.
  - Fuentes computadas: marca y h1 en Cormorant Garamond; menú, barra superior y botones en Manrope; `body` 14 px.
- **Limitación a 390 px**: el shell se adapta, pero el contenido interno de pantallas como Reservas (barra de filtros y tablas) todavía desborda horizontalmente (scrollWidth 768); es contenido de cada pantalla, fuera del alcance de esta etapa.

## Capturas para la revisión de Tomás (`docs/capturas-layout-hu117/`)

| | Antes | Después |
|---|---|---|
| Recepcionista 1366×768 | `antes-recepcionista-1366.png` | `despues-recepcionista-1366.png` |
| Administrador 1366×768 | `antes-admin-1366.png` | `despues-admin-1366.png` |
| Administrador 1920×1080 | — | `despues-admin-1920.png` |
| Admin, final del menú (Usuarios y roles activo) | — | `despues-admin-1366-final-del-menu.png` |
| Recepcionista, menú de cuenta abierto | — | `despues-recepcionista-cuenta-1366.png` |
| Recepcionista, menú contraído | — | `despues-recepcionista-contraido-1366.png` |
| Recepcionista 390 px y panel lateral | — | `despues-recepcionista-390.png`, `despues-recepcionista-390-menu.png` |

## Backlog (no se tocó la planilla)

`Product_Backlog_sprint123_Holiday_Inn.xlsx` no está en el repo, así que no se editó. Fila para que la cargue Gimena:

| N° | Épica | Historia | Criterios de Aceptación | Prioridad | SP | Sprint | RF |
|---|---|---|---|---|---|---|---|
| 117 | Interfaz y Navegación | Como usuario interno del SGH (recepcionista, gerente o administrador), necesito un menú lateral agrupado según el flujo operativo del hotel, desplegable y contraíble, con una barra superior de búsqueda y un encabezado de página compacto, para encontrar rápido cada función y operar con una interfaz consistente con la identidad del hotel. | 1. El menú se agrupa en Recepción, Caja y facturación, Habitaciones (con Mantenimiento y Tipos de habitación), Comercial, Stock, Compras y Administración (solo Usuarios y roles), y respeta los permisos del rol (HU-71). 2. Los grupos se despliegan y el menú se contrae, y ambos estados se recuerdan por usuario. 3. El ítem activo se resalta y ningún nombre se corta en dos líneas. 4. La tarjeta de usuario abre un menú con perfil y cierre de sesión. 5. La barra superior tiene buscador y fecha del día. 6. El encabezado de página es compacto y la tipografía usa una sans para la interfaz y serif solo para marca y títulos. | Media | 5 | El actual (la carpeta del backlog es SPRINT4) | (vacío: no hay RF de interfaz) |

Cambios respecto del texto original: se quitó el criterio 4 (contadores de Check-in/Check-out, que queda para una historia aparte), con la frase "ver de un vistazo las llegadas y salidas pendientes del día" de la historia, y el criterio 1 refleja los grupos definitivos del menú (con Tipos de habitación dentro de Habitaciones).
