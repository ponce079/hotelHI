import { Link, NavLink } from "react-router-dom";
import { BedDouble } from "lucide-react";

// Envoltorio de las dos pantallas sin sesión de staff: disponibilidad
// (HU-38) y autoservicio web (HU-40). No usa <Layout> ni el menú lateral
// a propósito — esas pantallas viven fuera de <RequireSesion> en App.jsx,
// así que no hay rol logueado del que colgar un menú. Vive en el módulo y
// no en componentes/ para no sumar un archivo compartido más de los tres
// que el equipo acordó tocar entre todos.
export function LayoutPublico({ children }) {
  const claseLink = ({ isActive }) =>
    `rounded-md px-3 py-1.5 font-body text-[13px] font-semibold transition-colors ${
      isActive ? "bg-pino text-hueso" : "text-tinta hover:bg-hueso"
    }`;

  return (
    <div className="min-h-screen bg-hueso">
      <header className="border-b border-borde bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <Link to="/disponibilidad" className="flex items-center gap-2">
            <BedDouble size={22} className="text-pino" />
            <span className="font-heading text-[19px] font-semibold text-tinta">Holiday Inn</span>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/disponibilidad" className={claseLink}>
              Disponibilidad
            </NavLink>
            <NavLink to="/reservar" className={claseLink}>
              Reservar
            </NavLink>
          </nav>
          <Link
            to="/login"
            className="ml-auto font-body text-[12.5px] text-piedra underline-offset-2 hover:text-tinta hover:underline"
          >
            Ingreso del personal
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
