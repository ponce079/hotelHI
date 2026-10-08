import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Hotel, ChevronDown } from "lucide-react";
import { useSesion } from "../lib/sesion";
import { listarOrdenesMantenimiento } from "../modulos/habitaciones/habitaciones.api";
import { Avatar } from "../modulos/usuarios/Avatar";
import { nombreCompleto } from "../modulos/usuarios/usuarios.constantes";
import { MENU_ITEM_SUELTO, MENU_GRUPOS } from "./menuConfig";

const PILL_ACTIVO = "rounded-full bg-hueso text-laton-700";
const PILL_INACTIVO = "rounded-full text-hueso/75 hover:bg-white/10";

function ItemMenu({ to, end, icon: Icon, label, badge }) {
  return (
    <div className="w-60">
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex items-center gap-2.5 py-2.5 pl-3 pr-8 font-body text-[14px] font-semibold transition-colors ${
            isActive ? PILL_ACTIVO : PILL_INACTIVO
          }`
        }
      >
        <Icon size={19} strokeWidth={1.8} /> {label}
        {Boolean(badge) && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-laton-700 px-1.5 font-mono text-[11px] font-semibold text-hueso">
            {badge}
          </span>
        )}
      </NavLink>
    </div>
  );
}

export function Layout() {
  const { rol, usuario, rolInfo, cerrarSesion, puede, perfil } = useSesion();
  // Usuarios y Seguridad: la tarjeta del usuario (abajo del menú) lleva a
  // "Mi perfil" (/mi-perfil), una página más del sistema — nombre, foto y
  // contraseña de quien está logueado. Queda resaltada mientras se está ahí.
  const datosTarjeta = perfil ?? { usuario };

  // Badge de "Historial de Mantenimiento" (pendientes): vive acá y no en la
  // propia pantalla porque Layout no se desmonta al navegar (Outlet
  // adentro), así que el conteo sigue vivo aunque el usuario esté en otra
  // pantalla. Mismo queryKey que HistorialMantenimientoPage.jsx y
  // MantenimientoModal.jsx — comparten caché (un solo pedido de red aunque
  // los tres estén activos) y CUALQUIERA de los tres invalidando esta
  // key (crear una orden, o resolverla desde acá o desde el Detalle de
  // Habitación) refresca el badge sin que Layout tenga que sondear fuerte:
  // el refetchInterval de abajo es solo un respaldo liviano.
  const ordenesMantenimientoQuery = useQuery({
    queryKey: ["ordenes-mantenimiento"],
    queryFn: () => listarOrdenesMantenimiento(),
    enabled: puede("verHabitaciones"),
    refetchInterval: 30000,
  });
  const pendientesMantenimiento = (ordenesMantenimientoQuery.data ?? []).filter(
    (orden) => orden.estado === "Pendiente"
  ).length;

  const grupos = MENU_GRUPOS.map((grupo) => ({
    ...grupo,
    items: grupo.items.filter((item) => !item.roles || item.roles.includes(rol)),
  })).filter((grupo) => grupo.items.length > 0);

  // Arrancan todos los grupos expandidos al montar el Layout, para
  // minimizar clicks al entrar — el usuario cierra despues los que no le
  // interesen, a su criterio. Sin localStorage todavia: navegar a otra
  // pantalla no remonta el Layout (mismo componente en todas las rutas
  // internas) asi que el estado persiste mientras se navega, pero un
  // reload si vuelve a arrancar con todo abierto.
  const [gruposAbiertos, setGruposAbiertos] = useState(() => new Set(grupos.map((grupo) => grupo.grupo)));

  function toggleGrupo(nombre) {
    setGruposAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(nombre)) next.delete(nombre);
      else next.add(nombre);
      return next;
    });
  }

  return (
    <div className="flex min-h-screen bg-hueso print:block print:min-h-0 print:bg-white">
      <aside className="sticky top-0 mr-4 h-screen w-[236px] flex-none relative print:hidden">
        {/* Capa de fondo, separada de la de contenido: la capa de contenido
            (mas abajo) no puede tener overflow-hidden porque el pill de
            cada item (en los 3 estados, no solo el activo) escapa 18px
            por el borde derecho — si el recorte viviera en el mismo
            elemento que el contenido, se veria el pill cortado. */}
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-gradient-to-br from-pino-900 to-pino-700" />
        <div className="relative flex h-full flex-col gap-3.5 px-3.5 py-3">
          <div className="flex shrink-0 flex-col items-center gap-1 px-2.5">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/15">
              <Hotel size={20} strokeWidth={1.6} className="text-hueso" />
            </div>
            <div className="flex flex-col items-center gap-0.5 text-center">
              <span className="font-heading text-[16px] leading-tight tracking-[-0.01em] text-hueso">Holiday Inn</span>
              {/* Sprint 2 sumó Compras y Gastos — ya no es solo Depósito y Stock (Sprint 1) */}
              <span className="font-body text-[9.5px] text-hueso/55">SGH · Gestión Hotelera</span>
            </div>
          </div>

          {/* w-60 (240px): ancho unico para nav, headers de grupo y cada
              item. Con pr-8 fijo en los 3 estados (activo/inactivo/hover,
              ver PILL_ACTIVO/PILL_INACTIVO), el pill de cada item ocupa
              siempre el mismo ancho y llega hasta el borde del aside sin
              depender de un margen negativo condicional — por eso ya no
              hace falta una columna angosta (w-52) separada para lo que
              no debia alcanzar el borde. El overflow-y-auto de abajo no
              recorta nada porque nav ya declara el ancho final. */}
          <nav className="scrollbar-hide flex min-h-0 w-60 flex-1 flex-col gap-0.5 overflow-y-auto">
            <div className="w-60 px-2.5 pb-0.5 font-body text-[9.5px] font-semibold tracking-widest text-hueso/50 uppercase">
              Menú del perfil
            </div>

            <ItemMenu {...MENU_ITEM_SUELTO} />

            {grupos.map((grupo) => {
              const abierto = gruposAbiertos.has(grupo.grupo);
              return (
                <div key={grupo.grupo} className="mt-2 w-60">
                  <button
                    type="button"
                    onClick={() => toggleGrupo(grupo.grupo)}
                    className="flex w-60 cursor-pointer items-center justify-between border-t border-hueso/15 px-2.5 pt-2 pb-1 font-body text-[9.5px] font-semibold tracking-widest text-hueso/40 uppercase transition-colors hover:text-hueso/70"
                  >
                    {grupo.grupo}
                    <ChevronDown size={12} className={`transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
                  </button>
                  {/* Truco de grid-template-rows 0fr/1fr: anima el alto sin
                      conocerlo de antemano (a diferencia de max-height, que
                      necesita un valor fijo "suficientemente grande" y corta
                      la transicion antes de tiempo). El overflow-hidden del
                      div interno es obligatorio, no cosmetico: sin el, la
                      fila de grid no puede bajar de su alto minimo de
                      contenido y el 0fr no colapsa a 0 de verdad. */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                      abierto ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-col gap-0.5 pt-0.5">
                        {grupo.items.map((item) => (
                          <ItemMenu
                            key={item.to}
                            {...item}
                            badge={item.to === "/historial-mantenimiento" ? pendientesMantenimiento : undefined}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="flex shrink-0 flex-col gap-1.5">
            <NavLink
              to="/mi-perfil"
              title="Ver y editar mi perfil"
              className={({ isActive }) =>
                `group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors ${
                  isActive ? "bg-hueso ring-1 ring-laton-400/60" : "bg-white/10 hover:bg-white/20"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Avatar usuario={datosTarjeta} tamano={28} />
                  <div className="min-w-0">
                    <div
                      className={`truncate font-body text-[12.5px] font-medium leading-tight ${isActive ? "text-pino-900" : "text-hueso"}`}
                    >
                      {nombreCompleto(datosTarjeta) || usuario}
                    </div>
                    <div className={`truncate font-body text-[10.5px] leading-tight ${isActive ? "text-piedra" : "text-hueso/55"}`}>
                      {rolInfo?.label} · Mi perfil
                    </div>
                  </div>
                </>
              )}
            </NavLink>
            <button
              type="button"
              onClick={cerrarSesion}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-hueso/20 px-3 py-1.5 font-body text-xs font-semibold text-hueso/60 transition-colors duration-200 hover:bg-red-500/10 hover:text-red-400"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8 print:w-full print:p-0">
        <Outlet />
      </main>

    </div>
  );
}
