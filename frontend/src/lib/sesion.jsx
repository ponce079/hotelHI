import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Sesion solo de frontend: el propio prototipo del diseno dice que el
// bloqueo por intentos fallidos y la gestion de roles "son parte del
// Sprint 3" — este login no valida usuario/contrasena contra el backend,
// solo elige un rol y guarda quien esta "operando" para filtrar menu y
// permisos. No crea tablas Usuario/Rol nuevas.
// Descripciones actualizadas para Sprint 2 (Compras y Gastos) — antes
// solo describían el alcance de Sprint 1 (Depósito y Stock), aunque los
// permisos de cada rol ya se habían ampliado más abajo en este mismo
// archivo. Reflejan exactamente lo que puede() habilita para cada rol,
// no una descripción aparte.
export const ROLES = {
  admin: {
    label: "Administrador",
    descripcion: "Catálogos maestros, depósitos, proveedores y parámetros del sistema",
  },
  deposito: {
    label: "Encargado de Depósito",
    descripcion: "Operación diaria: movimientos, transferencias, recepciones y requerimientos de reposición",
  },
  compras: {
    label: "Encargado de Compras",
    descripcion: "Proveedores, requerimientos, presupuestos, órdenes de compra, comprobantes y pagos",
  },
  gerente: {
    label: "Gerente",
    descripcion: "Aprobación de presupuestos, cuenta corriente y reportes de consumo",
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
        // Recepciones (transferencias + OC, hub unificado): "operar" sigue
        // siendo quien puede CONFIRMAR (admin/depósito, sin cambios). Compras
        // y gerente necesitan ver el panorama completo (todas las
        // recepciones pendientes, sin acotar a un depósito) pero de solo
        // lectura — no tienen botón de confirmar ni acceden a RecepcionOCPage
        // (esa sigue gateada por recibirOC).
        if (accion === "verRecepciones") return rol === "admin" || rol === "deposito" || rol === "compras" || rol === "gerente";
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
        // Sprint 2 — Órdenes de Compra (HU-22 a 25, 85): tres permisos
        // separados porque tres roles distintos actúan sobre la misma
        // pantalla en distintos momentos de su ciclo de vida.
        if (accion === "verOrdenesCompra") return rol === "compras" || rol === "gerente" || rol === "deposito";
        if (accion === "gestionarOC") return rol === "compras"; // generar (HU-22) / enviar / anular — sin aprobación de gerente, esa ya se dio al adjudicar el presupuesto
        if (accion === "recibirOC") return rol === "deposito";
        // Recepciones Parte B: resolver la diferencia de una OC "Recibida
        // con diferencia" (Nota de Crédito / reposición al proveedor /
        // aceptarla) es una decisión de facturación, no de depósito —
        // mismo rol que registrarComprobante, no recibirOC.
        if (accion === "resolverDiferenciaOC") return rol === "compras";
        // Confirmar o descartar una sugerencia de reposición automática del
        // central: mismo rol que gestiona el resto del ciclo de compra.
        if (accion === "gestionarSugerencias") return rol === "compras";
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
