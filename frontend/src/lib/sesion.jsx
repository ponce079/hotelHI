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
  recepcionista: {
    label: "Recepcionista",
    descripcion: "Reservas de huéspedes, disponibilidad y estado operativo de las habitaciones",
  },
  mantenimiento: {
    label: "Personal de Mantenimiento",
    descripcion: "Órdenes correctivas, preventivas e incidentes urgentes de habitaciones",
  },
  housekeeping: {
    label: "Housekeeping",
    descripcion: "Estado de limpieza y liberación de habitaciones para recepción",
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
        // Tipos de Movimiento (HU-10/HU-11): catálogo maestro, exclusivo del
        // administrador — a diferencia de "operar" (admin+depósito), acá
        // depósito queda afuera aunque comparta pantalla con "operar" en
        // /movimientos.
        if (accion === "gestionarTiposMovimiento") return rol === "admin";
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
        // verPagos (HU-78, corregido en la re-auditoria de Sprint 2 del
        // 2026-09-16): gerente necesita consultar el listado de pagos, de
        // solo lectura — separado de registrarPago (generar orden de
        // pago, anular, cambiar estado de cheque), que sigue siendo
        // exclusivo de compras.
        if (accion === "verPagos") return rol === "compras" || rol === "gerente";
        if (accion === "registrarPago") return rol === "compras";
        // Sprint 2 — Cuenta Corriente de Proveedores (HU-80): de solo
        // lectura. Corregido en la re-auditoria del 2026-09-16 — la
        // historia pide explicitamente acceso de gerente y el gate
        // original lo dejaba afuera (mismo patron de brecha que HU-78).
        if (accion === "verCuentaCorriente") return rol === "compras" || rol === "gerente";
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
        // Reporte de Consumo (HU-9): solo gerente, mismo criterio que
        // aprobarPresupuesto/verCuentaCorriente por rol.
        if (accion === "verReporte") return rol === "gerente";
        // Kardex (HU-16): la propia historia dice "Como encargado de
        // depósito / gerente" — antes esta pantalla no tenía ningún gate
        // de rol (accesible por cualquier usuario autenticado). Cerrado en
        // la re-auditoría de Sprint 1 del 2026-09-18.
        if (accion === "verKardex") return rol === "deposito" || rol === "gerente";
        // Sprint 3 académico — Habitaciones (HU-31 a HU-35). Los roles son
        // una restricción de UI hasta que exista autenticación real en backend.
        if (accion === "verHabitaciones") {
          return ["admin", "recepcionista", "mantenimiento", "housekeeping"].includes(rol);
        }
        if (accion === "gestionarHabitaciones") return rol === "admin";
        if (accion === "gestionarMantenimiento") return rol === "mantenimiento";
        if (accion === "actualizarEstadoHabitacion") return rol === "admin" || rol === "housekeeping";
        // Sprint 3 académico — Reservas (HU-36 a HU-42). La historia dice
        // "Como recepcionista" en el alta, la modificación y la
        // cancelación; admin entra por ser quien administra la operación
        // completa. Las pantallas de HU-38 y HU-40 son del rol "Huésped" y
        // no pasan por acá: viven fuera de <RequireSesion>, sin sesión.
        if (accion === "verReservas") return rol === "admin" || rol === "recepcionista";
        if (accion === "gestionarReservas") return rol === "admin" || rol === "recepcionista";
        // Sprint 3 académico — Check-in (HU-43 a HU-47). El backlog dice
        // "Recepcionista" para las 5 historias, sin matices de rol por
        // acción (a diferencia de Habitaciones) — un solo permiso alcanza.
        if (accion === "gestionarCheckIn") return rol === "admin" || rol === "recepcionista";
        // Sprint 3 académico — Servicios Adicionales (HU-61 a HU-64). El rol
        // "Personal de Servicios" se eliminó del sistema: Recepcionista
        // absorbe todo el módulo (alta HU-61 y consulta HU-63), mismo
        // criterio de permisos que ya tiene con Reservas
        // (gestionarReservas) y Check-in (gestionarCheckIn) — admin +
        // recepcionista, sin matices de rol por acción.
        if (accion === "registrarConsumoServicio") return rol === "admin" || rol === "recepcionista";
        if (accion === "verConsumosServicio") return rol === "admin" || rol === "recepcionista";
                // Sprint 3 académico — Check-out y facturación (HU-48 a HU-56, 87).
        if (accion === "gestionarCheckOut") return rol === "admin" || rol === "recepcionista";
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
