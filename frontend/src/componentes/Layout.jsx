import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Hotel, ChevronDown } from "lucide-react";
import { useSesion } from "../lib/sesion";
import { MENU_ITEM_SUELTO, MENU_GRUPOS } from "./menuConfig";

const PILL_ACTIVO = "-mr-8 rounded-full bg-hueso pr-8 text-laton-700";
// Mismo molde que el activo (rounded-full + fuga -mr-8/pr-8) para que el
// hover se sienta "el mismo gesto" que el estado seleccionado — solo
// cambia el color (translucido en vez de bg-hueso solido) para marcarlo
// como estado "de paso". Al ser una clase aparte de PILL_ACTIVO, el item
// activo nunca hereda este hover (no tiene "hover:" en su propia clase).
const PILL_INACTIVO = "mr-0 rounded-full pr-3 text-hueso/75 hover:-mr-8 hover:bg-white/10 hover:pr-8";

function ItemMenu({ to, end, icon: Icon, label }) {
  return (
    <div className="w-52">
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          `flex items-center gap-2.5 py-2 pl-3 font-body text-[13px] font-semibold transition-all ${
            isActive ? PILL_ACTIVO : PILL_INACTIVO
          }`
        }
      >
        <Icon size={19} strokeWidth={1.8} /> {label}
      </NavLink>
    </div>
  );
}

export function Layout() {
  const { rol, usuario, rolInfo, cerrarSesion } = useSesion();
  const iniciales = (usuario || "?").slice(0, 2).toUpperCase();

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
        {/* Capa de fondo, separada de la de contenido: es la unica con
            overflow-hidden, asi es la unica responsable de recortar el
            degradado a las esquinas redondeadas. El aside queda pegado al
            borde izquierdo y ocupa el alto completo del viewport, asi que
            solo las dos esquinas derechas (las que no tocan el borde de la
            ventana) llevan curva — las izquierdas van a angulo recto
            (rounded-r-lg, no rounded-lg). La capa de contenido (mas abajo)
            no puede tener overflow-hidden porque el pill activo necesita
            escaparse 18px por el borde derecho — si el recorte viviera en
            el mismo elemento que el contenido, se comian una cosa a la
            otra (o se ve el pill cortado, o las esquinas quedan en angulo
            recto). */}
        <div aria-hidden="true" className="absolute inset-0 rounded-r-lg overflow-hidden bg-gradient-to-br from-pino-900 to-pino-700" />
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

          {/* w-60 (240px, arranca en el mismo x que antes): el nav mismo
              queda tan ancho como el maximo alcance del pill activo (borde
              del aside + 18px de fuga), asi el overflow-y-auto de abajo no
              le recorta el eje horizontal a nadie que escape hasta ese
              limite. Los hijos que NO deben estirarse a ese ancho extra (el
              label y cada item) se fijan explicitamente en 208px (w-52) —
              el ancho "de columna" original. El contenedor de cada grupo
              colapsable repite el mismo truco con su propio w-60: su div
              interno de overflow-hidden (necesario para que la animacion de
              alto colapse a 0 de verdad, ver mas abajo) tambien necesita
              ser tan ancho como el escape del pill, o le recortaria la fuga
              a cualquier item activo dentro de un grupo. */}
          <nav className="scrollbar-hide flex min-h-0 w-60 flex-1 flex-col gap-0.5 overflow-y-auto">
            <div className="w-52 px-2.5 pb-0.5 font-body text-[9.5px] font-semibold tracking-widest text-hueso/50 uppercase">
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
                    className="flex w-52 cursor-pointer items-center justify-between border-t border-hueso/15 px-2.5 pt-2 pb-1 font-body text-[9.5px] font-semibold tracking-widest text-hueso/40 uppercase transition-colors hover:text-hueso/70"
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
                          <ItemMenu key={item.to} {...item} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="flex shrink-0 flex-col gap-1.5">
            <div className="flex items-center gap-2.5 rounded-lg bg-white/10 p-1.5">
              <div className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-full bg-laton font-body text-[11px] font-medium text-hueso">
                {iniciales}
              </div>
              <div className="min-w-0">
                <div className="truncate font-body text-[12.5px] font-medium leading-tight text-hueso">{usuario}</div>
                <div className="truncate font-body text-[10.5px] leading-tight text-hueso/55">{rolInfo?.label}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={cerrarSesion}
              className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-hueso/20 px-3 py-1.5 font-body text-xs font-semibold text-hueso/60 hover:bg-white/10 hover:text-hueso"
            >
              <LogOut size={14} /> Cerrar sesión
            </button>
          </div>

          {/* Sello decorativo: monograma calcado del sistema de marca (Fraunces
              + iniciales SGH), en baja opacidad para no competir con el menú. */}
          <div className="flex shrink-0 justify-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-hueso/15">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-hueso/10">
                <span className="font-heading text-[8px] font-semibold tracking-[0.03em] text-hueso/30">SGH</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-8 print:w-full print:p-0">
        <Outlet />
      </main>
    </div>
  );
}
