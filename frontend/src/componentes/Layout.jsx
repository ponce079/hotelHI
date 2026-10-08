import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation } from "react-router-dom";
import { useSesion } from "../lib/sesion";
import {
  grupoAbiertoPorDefecto,
  guardarGruposMenu,
  guardarMenuContraido,
  leerGruposMenu,
  leerMenuContraido,
} from "../lib/preferenciasMenu";
import { listarOrdenesMantenimiento } from "../modulos/habitaciones/habitaciones.api";
import { MENU, buscarActivo, buscarMiga, filtrarMenuPorRol } from "./menuConfig";
import { Sidebar } from "./layout/Sidebar";
import { Topbar } from "./layout/Topbar";

// Estructura común de la app interna (HU-117): menú lateral agrupado, barra
// superior y, a la derecha, la pantalla (Outlet). Qué ítems se ven lo decide
// filtrarMenuPorRol con los `roles` de menuConfig.js (HU-71); el bloqueo por
// URL sigue en cada pantalla.
export function Layout() {
  const { rol, usuario, rolInfo, cerrarSesion, puede, perfil } = useSesion();
  const { pathname } = useLocation();
  const datosCuenta = perfil ?? { usuario };

  // Badge de "Mantenimiento" (órdenes pendientes): vive acá y no en la propia
  // pantalla porque Layout no se desmonta al navegar, así que el conteo sigue
  // vivo en cualquier pantalla. Mismo queryKey que HistorialMantenimientoPage y
  // MantenimientoModal: comparten caché y cualquiera que lo invalide refresca
  // el badge; el refetchInterval es solo un respaldo liviano.
  const ordenesMantenimientoQuery = useQuery({
    queryKey: ["ordenes-mantenimiento"],
    queryFn: () => listarOrdenesMantenimiento(),
    enabled: puede("verHabitaciones"),
    refetchInterval: 30000,
  });
  const pendientesMantenimiento = (ordenesMantenimientoQuery.data ?? []).filter(
    (orden) => orden.estado === "Pendiente"
  ).length;

  const bloques = useMemo(() => filtrarMenuPorRol(rol, MENU), [rol]);
  const nombresGrupos = useMemo(() => bloques.filter((b) => b.grupo !== null).map((b) => b.grupo), [bloques]);
  const activo = useMemo(() => buscarActivo(bloques, pathname), [bloques, pathname]);
  const miga = useMemo(() => buscarMiga(pathname), [pathname]);

  const [contraido, setContraido] = useState(() => leerMenuContraido(usuario));
  const [gruposManual, setGruposManual] = useState(() => leerGruposMenu(usuario));
  const [rutaMovil, setRutaMovil] = useState(null);

  // Estado efectivo de cada grupo: lo que el usuario dejó, o el de por defecto.
  const gruposAbiertos = useMemo(() => {
    const estado = {};
    for (const nombre of nombresGrupos) estado[nombre] = gruposManual[nombre] ?? grupoAbiertoPorDefecto(nombre, nombresGrupos);
    return estado;
  }, [nombresGrupos, gruposManual]);

  // El grupo de la ruta activa siempre se abre (URL directa, recarga o navegación). Se ajusta durante el render
  // (patrón de React para estado derivado de otro valor) y no se guarda: el usuario puede volver a plegarlo.
  const grupoActivo = activo?.grupo ?? null;
  const [grupoVisto, setGrupoVisto] = useState(null);
  if (grupoActivo !== grupoVisto) {
    setGrupoVisto(grupoActivo);
    if (grupoActivo && !gruposAbiertos[grupoActivo]) setGruposManual((previo) => ({ ...previo, [grupoActivo]: true }));
  }

  // Panel lateral en pantallas angostas: queda abierto solo en la ruta donde se abrió (navegar lo cierra) y se
  // cierra con Escape.
  const movilAbierto = rutaMovil === pathname;
  const cerrarMovil = () => setRutaMovil(null);
  useEffect(() => {
    if (!movilAbierto) return undefined;
    function alTeclear(evento) {
      if (evento.key === "Escape") setRutaMovil(null);
    }
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [movilAbierto]);

  function alternarGrupo(nombre) {
    setGruposManual((previo) => {
      const abierto = previo[nombre] ?? grupoAbiertoPorDefecto(nombre, nombresGrupos);
      const nuevo = { ...previo, [nombre]: !abierto };
      guardarGruposMenu(usuario, nuevo);
      return nuevo;
    });
  }

  function alternarContraido() {
    setContraido((previo) => {
      guardarMenuContraido(usuario, !previo);
      return !previo;
    });
  }

  return (
    <div className="shell print:block">
      <Sidebar
        bloques={bloques}
        activo={activo}
        gruposAbiertos={gruposAbiertos}
        onToggleGrupo={alternarGrupo}
        badges={{ "/historial-mantenimiento": pendientesMantenimiento }}
        contraido={contraido}
        onToggleContraido={alternarContraido}
        movilAbierto={movilAbierto}
        onCerrarMovil={cerrarMovil}
        cuenta={{ datos: datosCuenta, usuario, rolLabel: rolInfo?.label, onCerrarSesion: cerrarSesion }}
      />
      <div className="shell-main">
        <Topbar
          miga={miga}
          puedeBuscar={puede("verReservas")}
          onAbrirMenu={() => setRutaMovil(pathname)}
          menuMovilAbierto={movilAbierto}
        />
        <main className="shell-contenido">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
