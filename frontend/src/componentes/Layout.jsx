import { NavLink, Outlet } from "react-router-dom";
import {
  Home,
  Package,
  Warehouse,
  Truck,
  SlidersHorizontal,
  TriangleAlert,
  PackageCheck,
  BarChart3,
  LogOut,
  Wallet,
  ShoppingCart,
  Building2,
  ClipboardList,
  FileText,
  Tag,
} from "lucide-react";
import { useSesion } from "../lib/sesion";

// Menu por rol, calcado de MENUS del prototipo (y de lo que dice cada
// tarjeta de rol en el login): admin ve articulos+depositos+movs, deposito
// suma recepciones, compras ve depositos+minmax+alertas, gerente ve
// depositos+alertas+reporte. "Depósitos y Stock" es el unico item sin
// restriccion porque los 4 roles lo tienen. Kardex y el viejo "Control de
// Stock" (HU-6, la consulta plana) no son items de menu en el prototipo —
// Kardex se entra desde una fila del detalle de deposito, y "depositos"
// ya cubre esa consulta fusionada con stock. Sus rutas siguen andando por
// URL directa, solo se sacaron del sidebar.
//
// Agrupado en 4 secciones temáticas (además de Inicio, suelto). El header
// de cada grupo solo se pinta si el rol logueado tiene al menos un item
// visible ahí (ver el filtro de grupo!==anterior más abajo) — por eso un
// mismo grupo puede mostrar roles heterogéneos sin dejar a nadie con un
// título sin nada debajo: "Compras y Pagos" por ejemplo le muestra a
// depósito solo "Órdenes de Compra", y a compras los 6 items completos.
const ITEMS = [
  { to: "/", label: "Inicio", icon: Home, end: true },

  // Stock y Depósitos: catálogo y operación diaria de stock.
  { to: "/articulos", label: "Artículos", icon: Package, roles: ["admin", "deposito"], grupo: "Stock y Depósitos" },
  { to: "/depositos", label: "Depósitos y Stock", icon: Warehouse, grupo: "Stock y Depósitos" },
  { to: "/stock/minmax", label: "Stock mín. / máx.", icon: SlidersHorizontal, roles: ["compras"], grupo: "Stock y Depósitos" },
  { to: "/alertas", label: "Alertas de Stock", icon: TriangleAlert, roles: ["compras", "gerente"], grupo: "Stock y Depósitos" },
  { to: "/movimientos", label: "Movimientos de Stock", icon: Truck, roles: ["admin", "deposito"], grupo: "Stock y Depósitos" },
  { to: "/recepciones", label: "Recepciones", icon: PackageCheck, roles: ["deposito"], grupo: "Stock y Depósitos" },

  // Compras y Pagos (HU-18 a 25, 76 a 86): todo el ciclo de compra, de
  // Proveedores/Requerimientos/Presupuestos a OC → Comprobantes → Pagos.
  // Cuenta Corriente no es una entrada propia: es una pestaña dentro de
  // Pagos a Proveedores (mismo rol exacto).
  { to: "/proveedores", label: "Proveedores", icon: Building2, roles: ["compras", "admin"], grupo: "Compras y Pagos" },
  { to: "/requerimientos", label: "Requerimientos", icon: ClipboardList, roles: ["compras", "deposito"], grupo: "Compras y Pagos" },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText, roles: ["compras", "gerente"], grupo: "Compras y Pagos" },
  { to: "/ordenes-compra", label: "Órdenes de Compra", icon: ShoppingCart, roles: ["compras", "gerente", "deposito"], grupo: "Compras y Pagos" },
  { to: "/comprobantes", label: "Comprobantes", icon: FileText, roles: ["compras"], grupo: "Compras y Pagos" },
  { to: "/pagos", label: "Pagos a Proveedores", icon: Wallet, roles: ["compras"], grupo: "Compras y Pagos" },

  // Reportes: un solo item por ahora (HU-9), con lugar para crecer cuando
  // el Sprint de Reporting y Dashboard sume más pantallas acá.
  { to: "/reporte", label: "Reporte de Consumo", icon: BarChart3, roles: ["gerente"], grupo: "Reportes" },

  // Administración: catálogos maestros de configuración, exclusivos de
  // admin (HU-10/HU-11) — a diferencia de "Stock y Depósitos", que es
  // operación diaria compartida con depósito.
  { to: "/tipos-movimiento", label: "Tipos de Movimiento", icon: Tag, roles: ["admin"], grupo: "Administración" },
];

export function Layout() {
  const { rol, usuario, rolInfo, cerrarSesion } = useSesion();
  const items = ITEMS.filter((item) => !item.roles || item.roles.includes(rol));
  const iniciales = (usuario || "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-hueso print:block print:min-h-0 print:bg-white">
      <aside className="sticky top-0 flex h-screen w-[236px] flex-none flex-col gap-5 border-r border-borde bg-white px-3.5 py-[22px] print:hidden">
        <div className="flex flex-col gap-0.5 px-2.5">
          <span className="font-heading text-[19px] leading-tight tracking-[-0.01em] text-tinta">Holiday Inn</span>
          {/* Sprint 2 sumó Compras y Gastos — ya no es solo Depósito y Stock (Sprint 1) */}
          <span className="font-body text-[10.5px] text-tinta/50">SGH · Gestión Hotelera</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1.5 font-body text-[9.5px] font-semibold tracking-widest text-tinta/55 uppercase">
            Menú del perfil
          </div>
          {items.map(({ to, label, icon: Icon, end, grupo }, i) => (
            <div key={to}>
              {grupo && grupo !== items[i - 1]?.grupo && (
                <div className="mt-2.5 border-t border-borde px-2.5 pt-2.5 pb-1 font-body text-[9.5px] font-semibold tracking-widest text-tinta/45 uppercase">
                  {grupo}
                </div>
              )}
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2.5 font-body text-[13px] font-semibold transition-colors ${
                    isActive ? "bg-pino text-hueso" : "text-tinta/80 hover:bg-hueso"
                  }`
                }
              >
                <Icon size={16} /> {label}
              </NavLink>
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-center gap-2.5 rounded-lg bg-hueso p-2">
            <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-pino font-body text-[11px] font-medium text-hueso">
              {iniciales}
            </div>
            <div className="min-w-0">
              <div className="truncate font-body text-[12.5px] font-medium leading-tight">{usuario}</div>
              <div className="truncate font-body text-[10.5px] leading-tight text-tinta/50">{rolInfo?.label}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarSesion}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-borde px-3 py-2 font-body text-xs font-semibold text-tinta/55 hover:bg-hueso hover:text-tinta"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8 print:w-full print:p-0">
        <Outlet />
      </main>
    </div>
  );
}

