import {
  LayoutDashboard,
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
  CalendarSearch,
  DoorOpen,
  Utensils,
  DoorClosed,
  Receipt,
  Wrench,
  ArrowLeftRight,
  DollarSign,
  Users,
  UserCog,
  Banknote,
} from "lucide-react";

// HU-117 — Definición ÚNICA del menú lateral: grupo, ítem, ruta, ícono y roles.
//
// Filtro por rol (HU-71, sin cambios): cada ítem conserva el array `roles` que
// ya tenía y se muestra solo si `item.roles.includes(rol)`; un ítem sin `roles`
// lo ve cualquier usuario con sesión. Un grupo sin ítems visibles no se
// muestra (lo resuelve filtrarMenuPorRol). El bloqueo por URL sigue en cada
// pantalla (puede(...) / SinPermiso): este archivo solo decide qué se ve.
//
// El orden y la agrupación son nuevos; los roles de cada ítem son los de
// siempre (ver menuConfig.test.js, que compara contra el menú anterior).
// Rutas fuera del menú (Kardex, Stock plano, Cuenta Corriente y No-show no
// tuvieron nunca entrada de menú) siguen andando por URL directa o desde
// adentro de otras pantallas.
//
// `grupo: null` es el bloque sin título de arriba (Panel del día).
export const MENU = [
  {
    grupo: null,
    items: [{ to: "/", label: "Panel del día", icon: LayoutDashboard, end: true }],
  },
  {
    grupo: "Recepción",
    items: [
      { to: "/reservas", label: "Reservas", icon: CalendarCheck, roles: ["admin", "recepcionista", "gerente"] },
      // Es la vista que abre el botón "Ver disponibilidad" de Reservas: mismo
      // acceso que Reservas (verReservas). Único ítem nuevo respecto del menú anterior.
      { to: "/reservas/disponibilidad", label: "Disponibilidad", icon: CalendarSearch, roles: ["admin", "recepcionista", "gerente"] },
      { to: "/check-in", label: "Check-in", icon: DoorOpen, roles: ["admin", "recepcionista"] },
      { to: "/check-out", label: "Check-out", icon: DoorClosed, roles: ["admin", "recepcionista"] },
      // Antes "Personas alojadas".
      { to: "/personas-alojadas", label: "Huéspedes en casa", icon: Users, roles: ["admin", "recepcionista"] },
    ],
  },
  {
    grupo: "Caja y facturación",
    items: [
      { to: "/reporte-caja-diaria", label: "Caja diaria", icon: Banknote, roles: ["gerente"] },
      { to: "/comprobantes-estadia", label: "Comprobantes de huésped", icon: Receipt, roles: ["admin", "recepcionista"] },
      // HU-88 — todos los PagoEstadia, solo lectura.
      { to: "/movimientos-pago", label: "Movimientos de pago", icon: ArrowLeftRight, roles: ["admin", "recepcionista"] },
    ],
  },
  {
    grupo: "Habitaciones",
    items: [
      { to: "/habitaciones", label: "Estado de habitaciones", icon: BedDouble, roles: ["admin", "recepcionista", "housekeeping"] },
      // Antes "Historial de Mantenimiento" (HU-33/34).
      { to: "/historial-mantenimiento", label: "Mantenimiento", icon: Wrench, roles: ["admin", "recepcionista", "housekeeping"] },
    ],
  },
  {
    grupo: "Comercial",
    items: [
      { to: "/tarifas", label: "Tarifas", icon: DollarSign, roles: ["admin", "recepcionista", "gerente"] },
      { to: "/servicios-adicionales", label: "Servicios adicionales", icon: Utensils, roles: ["admin", "recepcionista"] },
    ],
  },
  {
    grupo: "Stock",
    items: [
      { to: "/depositos", label: "Stock y depósitos", icon: Warehouse },
      { to: "/articulos", label: "Artículos", icon: Package, roles: ["admin", "deposito"] },
      { to: "/movimientos", label: "Movimientos de stock", icon: Truck, roles: ["admin", "deposito"] },
      { to: "/recepciones", label: "Recepciones", icon: PackageCheck, roles: ["deposito", "admin", "compras", "gerente"] },
      { to: "/alertas", label: "Alertas de stock", icon: TriangleAlert, roles: ["compras", "gerente"] },
      { to: "/stock/minmax", label: "Stock mín. / máx.", icon: SlidersHorizontal, roles: ["compras", "admin"] },
      { to: "/reporte", label: "Reporte de consumo", icon: BarChart3, roles: ["gerente"] },
      { to: "/tipos-movimiento", label: "Tipos de movimiento", icon: Tag, roles: ["admin"] },
    ],
  },
  {
    grupo: "Compras",
    items: [
      { to: "/proveedores", label: "Proveedores", icon: Building2, roles: ["compras", "admin"] },
      { to: "/requerimientos", label: "Requerimientos", icon: ClipboardList, roles: ["compras", "deposito"] },
      { to: "/presupuestos", label: "Presupuestos", icon: FileText, roles: ["compras", "gerente"] },
      { to: "/ordenes-compra", label: "Órdenes de compra", icon: ShoppingCart, roles: ["compras", "gerente", "deposito"] },
      { to: "/comprobantes", label: "Comprobantes", icon: FileText, roles: ["compras"] },
      { to: "/pagos", label: "Pagos", icon: Wallet, roles: ["compras", "gerente"] },
    ],
  },
  {
    grupo: "Administración",
    items: [
      { to: "/tipos-habitacion", label: "Tipos de habitación", icon: Tag, roles: ["admin", "recepcionista", "gerente"] },
      { to: "/usuarios", label: "Usuarios y roles", icon: UserCog, roles: ["admin"] },
    ],
  },
];

// Pantallas fuera del menú que igual tienen un nombre para la miga de pan de la
// barra superior. `grupo` es el grupo del menú al que pertenecen.
export const RUTAS_FUERA_DEL_MENU = [
  { to: "/mi-perfil", grupo: "Cuenta", label: "Mi perfil" },
  { to: "/reservas/no-show", grupo: "Recepción", label: "Llegadas no presentadas" },
  { to: "/kardex", grupo: "Stock", label: "Kardex" },
  { to: "/stock", grupo: "Stock", label: "Control de stock" },
  { to: "/cuenta-corriente", grupo: "Compras", label: "Cuenta corriente" },
];

// Grupos con ítems visibles para el rol, en el orden de MENU.
export function filtrarMenuPorRol(rol, menu = MENU) {
  return menu
    .map((bloque) => ({
      ...bloque,
      items: bloque.items.filter((item) => !item.roles || item.roles.includes(rol)),
    }))
    .filter((bloque) => bloque.items.length > 0);
}

function coincide(pathname, to) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

// Ítem activo para una ruta: el de coincidencia más larga entre los visibles
// (así /reservas/disponibilidad marca "Disponibilidad" y no "Reservas", y
// /tarifas/temporadas o /habitaciones/7 marcan su ítem padre).
export function buscarActivo(bloques, pathname) {
  let mejor = null;
  for (const bloque of bloques) {
    for (const item of bloque.items) {
      if (coincide(pathname, item.to) && (!mejor || item.to.length > mejor.item.to.length)) {
        mejor = { grupo: bloque.grupo, item };
      }
    }
  }
  return mejor;
}

// Miga de pan "Grupo / Pantalla" para cualquier ruta (aunque el rol no vea el ítem).
export function buscarMiga(pathname) {
  const exacta = RUTAS_FUERA_DEL_MENU.filter((r) => coincide(pathname, r.to)).sort((a, b) => b.to.length - a.to.length)[0];
  const enMenu = buscarActivo(MENU, pathname);
  if (exacta && (!enMenu || exacta.to.length >= enMenu.item.to.length)) return { grupo: exacta.grupo, pantalla: exacta.label };
  if (enMenu) return { grupo: enMenu.grupo, pantalla: enMenu.item.label };
  return null;
}
