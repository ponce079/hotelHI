import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Sesion solo de frontend: el propio prototipo del diseno dice que el
// bloqueo por intentos fallidos y la gestion de roles "son parte del
// Sprint 3" — este login no valida usuario/contrasena contra el backend,
// solo elige un rol y guarda quien esta "operando" para filtrar menu y
// permisos. No crea tablas Usuario/Rol nuevas.
export const ROLES = {
  admin: {
    label: "Administrador",
    descripcion: "Catálogos maestros, depósitos y parámetros del sistema",
  },
  deposito: {
    label: "Encargado de Depósito",
    descripcion: "Operación diaria: movimientos, transferencias y recepciones",
  },
  compras: {
    label: "Encargado de Compras",
    descripcion: "Stock por depósito, mínimos/máximos y alertas de reposición",
  },
  gerente: {
    label: "Gerente",
    descripcion: "Consulta de stock y reportes de consumo por área",
  },
};

const CLAVE_STORAGE = "sgh_sesion";
const SesionContext = createContext(null);

function leerSesionGuardada() {
  try {
    const raw = sessionStorage.getItem(CLAVE_STORAGE);
    const datos = raw ? JSON.parse(raw) : null;
    return datos && ROLES[datos.rol] ? datos : null;
  } catch {
    return null;
  }
}

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(leerSesionGuardada);

  const iniciarSesion = useCallback((rol, usuario) => {
    if (!ROLES[rol]) return;
    const nueva = { rol, usuario };
    sessionStorage.setItem(CLAVE_STORAGE, JSON.stringify(nueva));
    setSesion(nueva);
  }, []);

  const cerrarSesion = useCallback(() => {
    sessionStorage.removeItem(CLAVE_STORAGE);
    setSesion(null);
  }, []);

  const value = useMemo(() => {
    const rol = sesion?.rol ?? null;
    return {
      rol,
      usuario: sesion?.usuario ?? null,
      rolInfo: rol ? ROLES[rol] : null,
      iniciarSesion,
      cerrarSesion,
      // abmDeposito: alta/edicion de depositos. abmArticulo: alta/edicion/baja
      // de articulos del catalogo. operar: registrar movimientos/
      // transferencias y confirmar recepciones. param: definir min/max.
      // Default-deny: una accion no reconocida NO otorga permiso (antes
      // caia en `return true`, que era un agujero de seguridad silencioso).
      puede(accion) {
        if (!rol) return false;
        if (accion === "abmDeposito") return rol === "admin";
        if (accion === "abmArticulo") return rol === "admin" || rol === "deposito";
        if (accion === "operar") return rol === "admin" || rol === "deposito";
        if (accion === "param") return rol === "admin" || rol === "compras";
        // Sprint 2 — Pagos a Proveedores (HU-76 a 79, 86): backend no
        // valida rol todavia (ver sesion.jsx arriba), asi que esta
        // pantalla depende de este chequeo + <SinPermiso />.
        if (accion === "registrarPago") return rol === "compras";
        // Sprint 2 — Cuenta Corriente de Proveedores (HU-80): de solo
        // lectura, mismo rol que Pagos.
        if (accion === "verCuentaCorriente") return rol === "compras";
        if (accion === "registrarComprobante") return rol === "compras";
        // Sprint 2 — Proveedores (HU-18 a 21): el padrón lo administra
        // compras; admin entra porque es catálogo maestro, igual que
        // artículos y depósitos.
        if (accion === "abmProveedor") return rol === "compras" || rol === "admin";
        // Sprint 2 — Requerimientos de Reposición (HU-81): es la única
        // pantalla del sprint con dos roles habilitados a la vez —
        // depósito pide lo que le falta, compras también puede cargarlo.
        if (accion === "crearRequerimiento") return rol === "compras" || rol === "deposito";
        // Sprint 2 — Presupuestos (HU-82, 83): pedirlos y cargar lo que
        // cotiza cada proveedor es tarea de compras.
        if (accion === "gestionarPresupuestos") return rol === "compras";
        // Sprint 2 — Adjudicación de presupuesto (HU-84): solo gerente.
        // Es el único que puede dejar un requerimiento en "Aprobado".
        if (accion === "aprobarPresupuesto") return rol === "gerente";
        return false;
      },
    };
  }, [sesion, iniciarSesion, cerrarSesion]);

  return <SesionContext.Provider value={value}>{children}</SesionContext.Provider>;
}

export function useSesion() {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <SesionProvider>");
  return ctx;
}
