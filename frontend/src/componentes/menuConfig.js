import {
  Home,
  Package,
  Warehouse,
  Truck,
  SlidersHorizontal,
  TriangleAlert,
  PackageCheck,
  BarChart3,
  Wallet,
  ShoppingCart,
  Building2,
  ClipboardList,
  FileText,
  Tag,
  BedDouble,
  CalendarCheck,
  DoorOpen,
  Utensils,
  DoorClosed,
  Receipt,
  Wrench,
  ArrowLeftRight,
  DollarSign,
  Users,
} from "lucide-react";

// Menu por rol, calcado de MENUS del prototipo (y de lo que dice cada
// tarjeta de rol en el login): admin ve articulos+depositos+movs, deposito
// suma recepciones, compras ve depositos+minmax+alertas, gerente ve
// depositos+alertas+reporte. Kardex y el viejo "Control de Stock" (HU-6,
// la consulta plana) no son items de menu en el prototipo — Kardex se
// entra desde una fila del detalle de deposito, y "depositos" ya cubre
// esa consulta fusionada con stock. Sus rutas siguen andando por URL
// directa, solo se sacaron del sidebar.
//
// "Inicio" va suelto (fuera de cualquier grupo, siempre visible, sin
// acordeon). El resto esta agrupado en categorias colapsables — cada
// grupo se filtra por rol en Layout.jsx antes de renderizar, asi que un
// grupo con 0 items visibles para el rol logueado directamente no
// aparece (ver el .filter en Layout.jsx).
export const MENU_ITEM_SUELTO = { to: "/", label: "Inicio", icon: Home, end: true };

export const MENU_GRUPOS = [
  {
    grupo: "Operación Hotelera",
    items: [
      {
        to: "/habitaciones",
        label: "Habitaciones",
        icon: BedDouble,
        roles: ["admin", "recepcionista", "housekeeping"],
      },
      // HU-33/34 (corrección): antes era el botón "Historial" en el header
      // del Panel de Habitaciones, abría un modal — ahora es su propia
      // pantalla y entrada de menú. Mismos roles que "Habitaciones"
      // (verHabitaciones): admin de solo lectura, Housekeeping y
      // Recepcionista reportan/resuelven desde ahí.
      {
        to: "/historial-mantenimiento",
        label: "Historial de Mantenimiento",
        icon: Wrench,
        roles: ["admin", "recepcionista", "housekeeping"],
      },
      // HU-89 — Catálogo de Tipos de Habitación (Etapa 1 de tarifas por
      // temporada). Mismos roles que verTiposHabitacion (sesion.jsx):
      // admin gestiona, recepcionista y gerente ven de solo lectura.
      {
        to: "/tipos-habitacion",
        label: "Tipos de Habitación",
        icon: Tag,
        roles: ["admin", "recepcionista", "gerente"],
      },
      // Etapa 2 de tarifas por temporada (HU-90 a HU-93). Mismos roles que
      // verTarifas (sesion.jsx): admin y recepcionista consultan, gerente
      // además gestiona (verTarifas alcanza para mostrar el ítem; el botón
      // de escritura de cada pantalla ya se gatea con gestionarTarifas).
      {
        to: "/tarifas",
        label: "Tarifas",
        icon: DollarSign,
        roles: ["admin", "recepcionista", "gerente"],
      },
      // Sprint 3 académico — Reservas (HU-36 a 42). Las pantallas públicas
      // (/disponibilidad y /reservar) no entran al menú: son del rol
      // "Huésped" y viven fuera de la sesión de staff.
      {
        to: "/reservas",
        label: "Reservas",
        icon: CalendarCheck,
        roles: ["admin", "recepcionista"],
      },
      // Sprint 3 académico — Check-in (HU-43 a 47).
      {
        to: "/check-in",
        label: "Check-in",
        icon: DoorOpen,
        roles: ["admin", "recepcionista"],
      },
      // Sprint 3 académico — Servicios Adicionales (HU-61 a 64). El rol
      // "Personal de Servicios" se eliminó del sistema: Recepcionista
      // registra el consumo (HU-61) y consulta los cargos acumulados
      // (HU-63), mismo criterio que ya tiene con Reservas y Check-in.
      {
        to: "/servicios-adicionales",
        label: "Servicios Adicionales",
        icon: Utensils,
        roles: ["admin", "recepcionista"],
      },
      { 
        to: "/check-out", 
        label: "Check-out", 
        icon: DoorClosed, 
        roles: ["admin", "recepcionista"] 
      },
      {
        to: "/comprobantes-estadia",
        label: "Comprobantes de Huésped",
        icon: Receipt,
        roles: ["admin", "recepcionista"]
      },
      // HU-88 — todos los PagoEstadia de todas las reservas (seña, garantía,
      // pago final), mismo criterio de acceso que Comprobantes de Huésped:
      // solo lectura para los dos roles, sin alta/anulación desde acá.
      {
        to: "/movimientos-pago",
        label: "Movimientos de Pago",
        icon: ArrowLeftRight,
        roles: ["admin", "recepcionista"],
      },
    ],
  },
  {
    grupo: "Stock y Depósitos",
    items: [
      { to: "/articulos", label: "Artículos", icon: Package, roles: ["admin", "deposito"] },
      { to: "/depositos", label: "Depósitos y Stock", icon: Warehouse },
      // Re-auditoría del 2026-09-23: el permiso "param" ya incluía admin
      // (la propia descripción del rol dice "parámetros del sistema") — el
      // menú no lo mostraba, así que quien podía editarlo no tenía cómo
      // llegar sin tipear la URL a mano. Se suma acá para que código y
      // menú digan lo mismo.
      { to: "/stock/minmax", label: "Stock mín. / máx.", icon: SlidersHorizontal, roles: ["compras", "admin"] },
      { to: "/alertas", label: "Alertas de Stock", icon: TriangleAlert, roles: ["compras", "gerente"] },
      { to: "/movimientos", label: "Movimientos de Stock", icon: Truck, roles: ["admin", "deposito"] },
      // Re-auditoría del 2026-09-23: verRecepciones (sesion.jsx) ya incluía
      // admin/compras/gerente a propósito (admin confirma transferencias
      // igual que depósito; compras/gerente ven el panorama completo de
      // solo lectura) — el menú solo mostraba depósito. Se suman los 3
      // roles para que código y menú digan lo mismo; "Historial de
      // Recepciones" no es un ítem de menú aparte (se linkea desde adentro
      // de esta misma pantalla), así que hereda el mismo acceso sin tocar
      // nada más acá.
      { to: "/recepciones", label: "Recepciones", icon: PackageCheck, roles: ["deposito", "admin", "compras", "gerente"] },
    ],
  },
  {
    // Compras y Pagos (HU-18 a 25, 76 a 86): todo el ciclo de compra, de
    // Proveedores/Requerimientos/Presupuestos a OC → Comprobantes → Pagos.
    // Cuenta Corriente no es una entrada propia: es una pestaña dentro de
    // Pagos a Proveedores (mismo rol). Gerente entra a ambas de solo
    // lectura (HU-78/HU-80, corregido en la re-auditoria de Sprint 2 del
    // 2026-09-16) — ver verPagos/verCuentaCorriente en sesion.jsx.
    grupo: "Compras y Pagos",
    items: [
      { to: "/proveedores", label: "Proveedores", icon: Building2, roles: ["compras", "admin"] },
      { to: "/requerimientos", label: "Requerimientos", icon: ClipboardList, roles: ["compras", "deposito"] },
      { to: "/presupuestos", label: "Presupuestos", icon: FileText, roles: ["compras", "gerente"] },
      { to: "/ordenes-compra", label: "Órdenes de Compra", icon: ShoppingCart, roles: ["compras", "gerente", "deposito"] },
      { to: "/comprobantes", label: "Comprobantes", icon: FileText, roles: ["compras"] },
      { to: "/pagos", label: "Pagos a Proveedores", icon: Wallet, roles: ["compras", "gerente"] },
    ],
  },
  {
    // Reportes: un solo item por ahora (HU-9), con lugar para crecer
    // cuando el Sprint de Reporting y Dashboard sume mas pantallas aca.
    grupo: "Reportes",
    items: [
      { to: "/reporte", label: "Reporte de Consumo", icon: BarChart3, roles: ["gerente"] },
      { to: "/reporte-caja-diaria", label: "Caja Diaria", icon: BarChart3, roles: ["gerente"] },
    ], 
  },
  {
    // Administracion: catalogos maestros de configuracion, exclusivos de
    // admin (HU-10/HU-11) — a diferencia de "Stock y Depositos", que es
    // operacion diaria compartida con deposito.
    grupo: "Administración",
    items: [
      // Usuarios y Seguridad: alta de usuarios, roles y acceso — solo admin
      // (ver gestionarUsuarios en sesion.jsx).
      { to: "/usuarios", label: "Usuarios", icon: Users, roles: ["admin"] },
      { to: "/tipos-movimiento", label: "Tipos de Movimiento", icon: Tag, roles: ["admin"] },
    ],
  },
];
