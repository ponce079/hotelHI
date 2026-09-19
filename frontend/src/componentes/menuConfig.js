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
        roles: ["admin", "recepcionista", "mantenimiento", "housekeeping"],
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
    ],
  },
  {
    grupo: "Stock y Depósitos",
    items: [
      { to: "/articulos", label: "Artículos", icon: Package, roles: ["admin", "deposito"] },
      { to: "/depositos", label: "Depósitos y Stock", icon: Warehouse },
      { to: "/stock/minmax", label: "Stock mín. / máx.", icon: SlidersHorizontal, roles: ["compras"] },
      { to: "/alertas", label: "Alertas de Stock", icon: TriangleAlert, roles: ["compras", "gerente"] },
      { to: "/movimientos", label: "Movimientos de Stock", icon: Truck, roles: ["admin", "deposito"] },
      { to: "/recepciones", label: "Recepciones", icon: PackageCheck, roles: ["deposito"] },
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
    items: [{ to: "/reporte", label: "Reporte de Consumo", icon: BarChart3, roles: ["gerente"] }],
  },
  {
    // Administracion: catalogos maestros de configuracion, exclusivos de
    // admin (HU-10/HU-11) — a diferencia de "Stock y Depositos", que es
    // operacion diaria compartida con deposito.
    grupo: "Administración",
    items: [{ to: "/tipos-movimiento", label: "Tipos de Movimiento", icon: Tag, roles: ["admin"] }],
  },
];
