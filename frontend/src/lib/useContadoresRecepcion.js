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

// `puedeVerCheckIn` / `puedeVerCheckOut`: si el rol tiene ese ítem en el menú. Sin acceso no se dispara ningún pedido.
export function useContadoresRecepcion({ puedeVerCheckIn, puedeVerCheckOut }) {
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
    enabled: puedeVerCheckOut,
    ...opciones,
  });

  // Al entrar a /check-in o /check-out (sin cancelar un pedido que ya está en vuelo).
  const { refetch: refrescarLlegadas } = llegadasQuery;
  const { refetch: refrescarSalidas } = salidasQuery;
  useEffect(() => {
    const aca = (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`);
    if (puedeVerCheckIn && aca("/check-in")) refrescarLlegadas({ cancelRefetch: false });
    if (puedeVerCheckOut && aca("/check-out")) refrescarSalidas({ cancelRefetch: false });
  }, [pathname, puedeVerCheckIn, puedeVerCheckOut, refrescarLlegadas, refrescarSalidas]);

  // Si un pedido falla no hay data y el contador queda en 0 (sin burbuja ni error visible).
  const { salidas, vencidas } = contarSalidas(salidasQuery.data);
  return { llegadas: contarLlegadas(llegadasQuery.data), salidas, vencidas };
}
