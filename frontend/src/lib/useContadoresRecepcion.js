import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { listarLlegadas } from "../modulos/check-in/checkIn.api";
import { listarReservas } from "../modulos/reservas/reservas.api";
import { ESTADO_RESERVA } from "../modulos/reservas/reservas.constantes";
import { hoyEnHoraLocal } from "./fechas";

// Contadores del menú lateral: llegadas y salidas pendientes de recepción. Solo lectura, con los endpoints que ya
// usan las pantallas de Check-in y Check-out. La unidad es la RESERVA, la misma que muestra la lista de cada
// pantalla (una fila por reserva; una reserva grupal es una sola fila).
const CINCO_MINUTOS = 5 * 60 * 1000;

// GET /check-in/llegadas corta en 200 reservas (take: MAX_LLEGADAS en checkIn.apoyo.servicio.js) y no devuelve el
// total. Si llegó al tope no se puede saber el número real: no se muestra el contador antes que uno mentiroso.
export const TOPE_LLEGADAS = 200;

// Confirmadas que ingresan hoy y todavía no ingresaron: el backend ya excluye canceladas, no-show y las de días
// anteriores (esas vienen aparte en `anterioresPendientes`, que no se cuenta).
export function contarLlegadas(datos) {
  const reservas = datos?.reservas;
  if (!Array.isArray(reservas) || reservas.length >= TOPE_LLEGADAS) return 0;
  return reservas.length;
}

// Estadías En curso cuya salida es hoy o anterior (las anteriores son las vencidas). `hoy` es "YYYY-MM-DD" en hora
// argentina (hoyEnHoraLocal); las fechas-solo-día del backend se comparan como texto, sin pasar por la zona del
// navegador. GET /reservas sin paginar devuelve todas las que cumplen el filtro (no hay tope).
export function contarSalidas(reservas, hoy = hoyEnHoraLocal()) {
  if (!Array.isArray(reservas)) return { salidas: 0, vencidas: 0 };
  let salidas = 0;
  let vencidas = 0;
  for (const r of reservas) {
    if (r.estado !== ESTADO_RESERVA.EN_CURSO) continue;
    const salida = String(r.fechaHasta).slice(0, 10);
    if (salida > hoy) continue;
    salidas += 1;
    if (salida < hoy) vencidas += 1;
  }
  return { salidas, vencidas };
}

// Habitaciones y huéspedes (adultos + menores) de las estadías En curso, sumados de la lista que ya trae el hook.
export function resumirEnCasa(reservas) {
  if (!Array.isArray(reservas)) return null;
  let habitaciones = 0;
  let huespedes = 0;
  for (const r of reservas) {
    if (r.estado !== ESTADO_RESERVA.EN_CURSO) continue;
    for (const h of r.habitaciones ?? []) {
      habitaciones += 1;
      huespedes += (h.adultos ?? 0) + (h.menores ?? 0);
    }
  }
  return { habitaciones, huespedes };
}

// `puedeVerCheckIn` / `puedeVerCheckOut`: si el rol tiene ese ítem en el menú. Sin acceso no se dispara ningún pedido.
// `puedeVerReservas` (opcional, lo pasa la pantalla de Reservas): trae también la lista de En curso para un rol que ve
// Reservas pero no Check-out (el gerente). El menú lateral no lo pasa, así que su badge no cambia.
// Además de `llegadas`/`salidas`/`vencidas` (lo que usa el menú) devuelve por separado `llegadasHoy`,
// `llegadasAnteriores`, `salidasHoy` y `salidasVencidas` y `enCasa` ({ habitaciones, huespedes }); cada uno es null si
// su pedido falló, todavía no llegó o no se puede saber (tope de llegadas).
export function useContadoresRecepcion({ puedeVerCheckIn, puedeVerCheckOut, puedeVerReservas = false }) {
  const pedirSalidas = Boolean(puedeVerCheckOut || puedeVerReservas);
  const { pathname } = useLocation();
  // Mismas claves y mismos pedidos que las listas por defecto de Check-in y Check-out (sin búsqueda): al estar en
  // esas pantallas comparten el pedido en vez de duplicarlo, y las invalidaciones que ya hacen al confirmar
  // (["check-in"] al confirmar un check-in, ["reservas"] y ["check-out"] al confirmar un check-out) refrescan el
  // contador sin tocarlas.
  const opciones = {
    refetchInterval: CINCO_MINUTOS,
    refetchIntervalInBackground: false, // con la pestaña oculta no se pide
    retry: false,
  };
  const llegadasQuery = useQuery({
    queryKey: ["check-in", "llegadas", ""],
    queryFn: () => listarLlegadas(""),
    enabled: puedeVerCheckIn,
    ...opciones,
  });
  const salidasQuery = useQuery({
    queryKey: ["reservas", "check-out", ""],
    queryFn: () => listarReservas({ estado: ESTADO_RESERVA.EN_CURSO }),
    enabled: pedirSalidas,
    ...opciones,
  });

  // Al entrar a /check-in o /check-out (sin cancelar un pedido que ya está en vuelo).
  const { refetch: refrescarLlegadas } = llegadasQuery;
  const { refetch: refrescarSalidas } = salidasQuery;
  useEffect(() => {
    const aca = (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`);
    if (puedeVerCheckIn && aca("/check-in")) refrescarLlegadas({ cancelRefetch: false });
    if (puedeVerCheckOut && aca("/check-out")) refrescarSalidas({ cancelRefetch: false });
    // Al entrar a la lista de Reservas (no a su detalle) se refrescan las llegadas y las salidas de las tarjetas.
    if (pathname === "/reservas") {
      if (puedeVerCheckIn) refrescarLlegadas({ cancelRefetch: false });
      if (pedirSalidas) refrescarSalidas({ cancelRefetch: false });
    }
  }, [pathname, puedeVerCheckIn, puedeVerCheckOut, pedirSalidas, refrescarLlegadas, refrescarSalidas]);

  // Si un pedido falla no hay data y el contador queda en 0 (sin burbuja ni error visible).
  const { salidas, vencidas } = contarSalidas(salidasQuery.data);
  const llegadasCompletas = Array.isArray(llegadasQuery.data?.reservas) && llegadasQuery.data.reservas.length < TOPE_LLEGADAS;
  const salidasListas = Array.isArray(salidasQuery.data);
  return {
    llegadas: contarLlegadas(llegadasQuery.data),
    salidas,
    vencidas,
    llegadasHoy: llegadasCompletas ? llegadasQuery.data.reservas.length : null,
    llegadasAnteriores: llegadasCompletas ? (llegadasQuery.data.anterioresPendientes ?? 0) : null,
    salidasHoy: salidasListas ? salidas - vencidas : null,
    salidasVencidas: salidasListas ? vencidas : null,
    enCasa: resumirEnCasa(salidasQuery.data),
  };
}
