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
  Landmark,
  ShoppingCart,
  Building2,
  ClipboardList,
  FileText,
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
const ITEMS = [
  { to: "/", label: "Inicio", icon: Home, end: true },
  { to: "/articulos", label: "Artículos", icon: Package, roles: ["admin", "deposito"] },
  { to: "/depositos", label: "Depósitos y Stock", icon: Warehouse },
  { to: "/movimientos", label: "Movimientos de Stock", icon: Truck, roles: ["admin", "deposito"] },
  { to: "/recepciones", label: "Recepciones", icon: PackageCheck, roles: ["deposito"] },
  { to: "/stock/minmax", label: "Stock mín. / máx.", icon: SlidersHorizontal, roles: ["compras"] },
  { to: "/alertas", label: "Alertas de Stock", icon: TriangleAlert, roles: ["compras", "gerente"] },
  { to: "/reporte", label: "Reporte de Consumo", icon: BarChart3, roles: ["gerente"] },
  // Sprint 2 — Pagos a Proveedores (HU-76 a 79, 86). Entradas planas,
  // mismo shape que las de arriba — ver la Guía Técnica Sprint 2 sobre
  // por qué no se armó el menú con grupos colapsables del prototipo.
  { to: "/pagos", label: "Pagos a Proveedores", icon: Wallet, roles: ["compras"] },
  { to: "/cuenta-corriente", label: "Cuenta Corriente", icon: Landmark, roles: ["compras"] },
  // Sprint 2 — Proveedores, Requerimientos y Presupuestos (HU-18 a 21,
  // 81 a 84). Mismos roles que declara puede() en lib/sesion.jsx.
  { to: "/proveedores", label: "Proveedores", icon: Building2, roles: ["compras", "admin"] },
  { to: "/requerimientos", label: "Requerimientos", icon: ClipboardList, roles: ["compras", "deposito"] },
  { to: "/presupuestos", label: "Presupuestos", icon: FileText, roles: ["compras", "gerente"] },
  // Sprint 2 — Órdenes de Compra (HU-22 a 25, 85): visible para los 3
  // roles que actúan sobre ella (compras aprueba/envía/anula, gerente
  // aprueba, depósito recibe) — cada botón puntual igual depende de
  // puede() adentro de la pantalla, ver sesion.jsx.
  { to: "/ordenes-compra", label: "Órdenes de Compra", icon: ShoppingCart, roles: ["compras", "gerente", "deposito"] },
  { to: "/comprobantes", label: "Comprobantes", icon: FileText, roles: ["compras"] },
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
          <span className="font-body text-[10.5px] text-tinta/50">SGH · Depósito y Stock</span>
        </div>

        <nav className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1.5 font-body text-[9.5px] font-semibold tracking-widest text-tinta/55 uppercase">
            Menú del perfil
          </div>
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
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

