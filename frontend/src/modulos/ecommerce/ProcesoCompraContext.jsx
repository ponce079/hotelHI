// Estado del proceso de compra del e-commerce: búsqueda, selección, datos
// del huésped, consentimiento, resultado y clave de idempotencia.
// Solo Gimena cambia este archivo (ver docs/ecommerce/CONTRATO.md).
//
// TARJETA: el número, el vencimiento y el CVV NUNCA entran a este contexto
// ni a ningún storage. Viven en el estado local de PagoPage, que los pasa
// directo a crearReserva (ver armarCuerpoReserva) y los limpia después.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { MAX_HABITACIONES_WEB, VERSION_POLITICAS, debeRegenerarClave } from "./ecommerce.constantes";

export const CLAVE_STORAGE = "ec-proceso-compra";

// Genera una clave de idempotencia (UUID v4, 36 caracteres).
export function generarClaveIdempotencia() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Contexto no seguro (http sin localhost): se usa el fallback.
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const HUESPED_VACIO = {
  nombre: "",
  apellido: "",
  tipoDocumento: "DNI",
  numeroDocumento: "",
  email: "",
  telefono: "",
  nacionalidad: "AR",
  paisResidencia: "AR",
};

function estadoInicial() {
  return {
    fechaDesde: "",
    fechaHasta: "",
    ocupacion: [{ adultos: 2, menores: 0 }],
    tipo: null, // { tipoHabitacionId, nombre, capacidadMaxima }
    plan: null, // plan del contrato (con total y promedioPorNoche)
    cotizacion: null, // última respuesta de cotizar (o null)
    huesped: { ...HUESPED_VACIO },
    llegada: { horaEstimada: "NO_SABE" },
    solicitudesEspeciales: "",
    consentimiento: { aceptaPoliticas: false, aceptaComunicaciones: false },
    resultado: null, // respuesta de crearReserva
    claveIdempotencia: generarClaveIdempotencia(),
  };
}

// Lista blanca: SOLO estos campos (y estos subcampos) se guardan en
// sessionStorage. Así, aunque alguien agregue algo por error al estado, la
// tarjeta no puede terminar en el storage.
function soloCampos(objeto, campos) {
  if (!objeto || typeof objeto !== "object") return null;
  return Object.fromEntries(campos.filter((c) => c in objeto).map((c) => [c, objeto[c]]));
}

export function serializarParaStorage(estado) {
  return {
    fechaDesde: estado.fechaDesde,
    fechaHasta: estado.fechaHasta,
    ocupacion: (estado.ocupacion ?? []).map((h) => soloCampos(h, ["adultos", "menores"])),
    tipo: soloCampos(estado.tipo, ["tipoHabitacionId", "nombre", "capacidadMaxima"]),
    plan: soloCampos(estado.plan, [
      "planTarifarioId",
      "codigo",
      "nombre",
      "reembolsable",
      "horasCancelacionSinCargo",
      "penalidadNoShow",
      "total",
      "promedioPorNoche",
    ]),
    cotizacion: soloCampos(estado.cotizacion, ["total", "promedioPorNoche", "noches"]),
    huesped: soloCampos(estado.huesped, Object.keys(HUESPED_VACIO)),
    llegada: soloCampos(estado.llegada, ["horaEstimada"]),
    solicitudesEspeciales: estado.solicitudesEspeciales,
    consentimiento: soloCampos(estado.consentimiento, ["aceptaPoliticas", "aceptaComunicaciones"]),
    resultado: estado.resultado
      ? {
          ...soloCampos(estado.resultado, [
            "codigoConfirmacion",
            "estado",
            "fechaDesde",
            "fechaHasta",
            "noches",
            "plan",
            "total",
            "cobradoAhora",
            "habitaciones",
            "email",
          ]),
          garantia: soloCampos(estado.resultado.garantia, ["tipo", "marca", "ultimos4"]),
        }
      : null,
    claveIdempotencia: estado.claveIdempotencia,
  };
}

function leerStorage() {
  try {
    const crudo = sessionStorage.getItem(CLAVE_STORAGE);
    if (!crudo) return null;
    const guardado = JSON.parse(crudo);
    if (!guardado || typeof guardado !== "object") return null;
    const base = estadoInicial();
    return {
      ...base,
      ...serializarParaStorage({ ...base, ...guardado }),
      huesped: { ...HUESPED_VACIO, ...(guardado.huesped ?? {}) },
    };
  } catch {
    return null;
  }
}

function escribirStorage(estado) {
  try {
    sessionStorage.setItem(CLAVE_STORAGE, JSON.stringify(serializarParaStorage(estado)));
  } catch {
    // Storage bloqueado o lleno: el proceso sigue en memoria.
  }
}

function normalizarOcupacion(ocupacion) {
  const lista = Array.isArray(ocupacion) && ocupacion.length > 0 ? ocupacion : [{ adultos: 2, menores: 0 }];
  return lista.slice(0, MAX_HABITACIONES_WEB).map((h) => ({
    adultos: Math.max(1, Number(h.adultos) || 1),
    menores: Math.max(0, Number(h.menores) || 0),
  }));
}

const mismaOcupacion = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Cuerpo de POST /api/web/reservas. La tarjeta entra como argumento y sale
// en el cuerpo; nunca se guarda en el estado.
export function armarCuerpoReserva(estado, { tarjeta, totalEsperado } = {}) {
  return {
    claveIdempotencia: estado.claveIdempotencia,
    fechaDesde: estado.fechaDesde,
    fechaHasta: estado.fechaHasta,
    planTarifarioId: estado.plan?.planTarifarioId,
    totalEsperado: totalEsperado ?? estado.cotizacion?.total ?? estado.plan?.total,
    habitaciones: estado.ocupacion.map((h) => ({
      tipoHabitacionId: estado.tipo?.tipoHabitacionId,
      adultos: h.adultos,
      menores: h.menores,
    })),
    huesped: { ...estado.huesped },
    llegada: { horaEstimada: estado.llegada.horaEstimada },
    solicitudesEspeciales: estado.solicitudesEspeciales ?? "",
    consentimiento: {
      aceptaPoliticas: estado.consentimiento.aceptaPoliticas,
      versionPoliticas: VERSION_POLITICAS,
      aceptaComunicaciones: estado.consentimiento.aceptaComunicaciones,
    },
    tarjeta,
  };
}

const ProcesoCompraContext = createContext(null);

export function ProcesoCompraProvider({ children }) {
  const [estado, setEstado] = useState(() => leerStorage() ?? estadoInicial());

  useEffect(() => {
    escribirStorage(estado);
  }, [estado]);

  // Fechas y ocupación. Si cambian, la selección anterior queda vieja (los
  // precios dependen de las fechas): se limpia y se regenera la clave.
  const definirBusqueda = useCallback(({ fechaDesde, fechaHasta, ocupacion }) => {
    setEstado((e) => {
      const nuevaOcupacion = normalizarOcupacion(ocupacion);
      const cambio = e.fechaDesde !== fechaDesde || e.fechaHasta !== fechaHasta || !mismaOcupacion(e.ocupacion, nuevaOcupacion);
      if (!cambio && e.claveIdempotencia && !e.resultado) return e;
      return {
        ...e,
        fechaDesde,
        fechaHasta,
        ocupacion: nuevaOcupacion,
        ...(cambio ? { tipo: null, plan: null, cotizacion: null } : {}),
        resultado: null,
        claveIdempotencia: generarClaveIdempotencia(),
      };
    });
  }, []);

  // Tipo y plan elegidos en resultados. Si cambian, clave nueva.
  const elegirPlan = useCallback((tipo, plan) => {
    setEstado((e) => {
      const cambio = e.tipo?.tipoHabitacionId !== tipo?.tipoHabitacionId || e.plan?.planTarifarioId !== plan?.planTarifarioId;
      const tipoGuardado = { tipoHabitacionId: tipo.tipoHabitacionId, nombre: tipo.nombre, capacidadMaxima: tipo.capacidadMaxima };
      if (!cambio && e.claveIdempotencia && !e.resultado) return { ...e, tipo: tipoGuardado, plan, cotizacion: null };
      return { ...e, tipo: tipoGuardado, plan, cotizacion: null, resultado: null, claveIdempotencia: generarClaveIdempotencia() };
    });
  }, []);

  const actualizarCotizacion = useCallback((cotizacion) => {
    setEstado((e) => ({ ...e, cotizacion: cotizacion ? { total: cotizacion.total, promedioPorNoche: cotizacion.promedioPorNoche, noches: cotizacion.noches } : null }));
  }, []);

  const actualizarHuesped = useCallback((parcial) => {
    setEstado((e) => ({ ...e, huesped: { ...e.huesped, ...soloCampos(parcial, Object.keys(HUESPED_VACIO)) } }));
  }, []);

  const actualizarLlegada = useCallback((horaEstimada) => {
    setEstado((e) => ({ ...e, llegada: { horaEstimada } }));
  }, []);

  const actualizarSolicitudes = useCallback((texto) => {
    setEstado((e) => ({ ...e, solicitudesEspeciales: texto }));
  }, []);

  const actualizarConsentimiento = useCallback((parcial) => {
    setEstado((e) => ({
      ...e,
      consentimiento: { ...e.consentimiento, ...soloCampos(parcial, ["aceptaPoliticas", "aceptaComunicaciones"]) },
    }));
  }, []);

  const regenerarClave = useCallback(() => {
    setEstado((e) => ({ ...e, claveIdempotencia: generarClaveIdempotencia() }));
  }, []);

  // Después de un error de crearReserva. Respuesta DEFINITIVA del servidor
  // (la reserva no se creó) → clave nueva para el reintento. Sin respuesta
  // definitiva (ERROR_RED, timeout, ERROR_INTERNO, DEMASIADOS_INTENTOS) → la
  // MISMA clave: el pedido pudo haberse procesado y una clave nueva crearía
  // una segunda reserva y un segundo cobro. Devuelve true si regeneró.
  const tratarErrorReserva = useCallback(
    (error) => {
      if (!debeRegenerarClave(error?.codigo)) return false;
      regenerarClave();
      return true;
    },
    [regenerarClave]
  );

  // Reserva creada: se guarda el resultado y se borra la clave (consumida).
  const registrarResultado = useCallback((resultado) => {
    setEstado((e) => ({ ...e, resultado, claveIdempotencia: null }));
  }, []);

  const reiniciar = useCallback(() => {
    setEstado(estadoInicial());
  }, []);

  const valor = useMemo(
    () => ({
      ...estado,
      definirBusqueda,
      elegirPlan,
      actualizarCotizacion,
      actualizarHuesped,
      actualizarLlegada,
      actualizarSolicitudes,
      actualizarConsentimiento,
      regenerarClave,
      tratarErrorReserva,
      registrarResultado,
      reiniciar,
      armarCuerpoReserva: (opciones) => armarCuerpoReserva(estado, opciones),
    }),
    [
      estado,
      definirBusqueda,
      elegirPlan,
      actualizarCotizacion,
      actualizarHuesped,
      actualizarLlegada,
      actualizarSolicitudes,
      actualizarConsentimiento,
      regenerarClave,
      tratarErrorReserva,
      registrarResultado,
      reiniciar,
    ]
  );

  return <ProcesoCompraContext.Provider value={valor}>{children}</ProcesoCompraContext.Provider>;
}

export function useProcesoCompra() {
  const contexto = useContext(ProcesoCompraContext);
  if (!contexto) throw new Error("useProcesoCompra se usa dentro de <ProcesoCompraProvider> (LayoutEcommerce).");
  return contexto;
}
