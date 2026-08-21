import { NavLink, Outlet } from "react-router-dom";
import { Package, Warehouse } from "lucide-react";

// Cada pantalla nueva agrega su propia entrada aca (misma logica que las
// rutas de index.js en el backend): un ítem por historia, sin pisar los
// de los demas.
const ITEMS = [
  { to: "/articulos", label: "Artículos", icon: Package },
  { to: "/depositos", label: "Depósitos", icon: Warehouse },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-hueso">
      <header className="border-b border-borde bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <span className="font-display text-lg font-semibold text-pino">SGH · Holiday Inn</span>
          <nav className="flex gap-1">
            {ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    isActive ? "bg-pino-suave text-pino" : "text-piedra hover:bg-hueso"
                  }`
                }
              >
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
