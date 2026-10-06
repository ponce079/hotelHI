import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Wallet } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { aplicarGarantiaAlSaldo, obtenerGarantiasReserva } from "./garantias.api";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const moneda = (n) => FORMATO_MONEDA.format(n);

// Qué va a pasar con la garantía del check-in al cerrar la cuenta (liberarla,
// devolverla, o usarla para cubrir el saldo). Pura (sin React) para probarla.
export function descripcionDeGarantia(g, saldo) {
  const esTarjeta = g.tipo === "PREAUTORIZACION";
  const nombre = esTarjeta ? `Preautorización en ${g.marca ?? "la tarjeta"} ****${g.ultimos4 ?? ""}` : "Depósito en efectivo";
  const restante = Math.max(0, g.monto - g.montoUsado);
  if (g.estado === "Pendiente") {
    return {
      titulo: `${nombre}: ${moneda(g.monto)}`,
      detalle:
        saldo > 0
          ? "Se puede usar para cubrir el saldo. Lo que no se use se " + (esTarjeta ? "libera" : "devuelve") + " al confirmar el check-out."
          : "Cuenta saldada: se " + (esTarjeta ? "libera la retención" : "devuelve el depósito") + " al confirmar el check-out.",
      usable: saldo > 0,
      aplicable: Math.min(saldo, g.monto),
      esTarjeta,
    };
  }
  return {
    titulo: `${nombre}: ${moneda(g.monto)}`,
    detalle:
      g.montoUsado > 0
        ? `Se usaron ${moneda(g.montoUsado)} para cubrir la cuenta.` +
          (restante > 0 ? ` El resto (${moneda(restante)}) se ${esTarjeta ? "libera" : "devuelve"} al confirmar.` : "")
        : `Estado: ${g.estado}.`,
    usable: false,
    aplicable: 0,
    esTarjeta,
  };
}

// Garantía del check-in en la pantalla de check-out. NO es un pago: no suma a lo
// pagado. El recepcionista puede usarla para cubrir el saldo; lo que no se use
// se libera (tarjeta) o se devuelve (efectivo) al confirmar el cierre.
export function GarantiaCheckOut({ reservaId, saldo, enCurso, puedeGestionar, onMensaje }) {
  const queryClient = useQueryClient();
  const consulta = useQuery({
    queryKey: ["reservas", "garantia", reservaId],
    queryFn: () => obtenerGarantiasReserva(reservaId),
    retry: false,
    staleTime: 0,
  });
  const mutacion = useMutation({
    mutationFn: () => aplicarGarantiaAlSaldo(reservaId),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      queryClient.invalidateQueries({ queryKey: ["reservas", "garantia", reservaId] });
      queryClient.invalidateQueries({ queryKey: ["pagos-estadia"] });
      onMensaje?.(`Se usaron ${moneda(r.aplicado)} de la garantía para cubrir el saldo.`);
    },
    onError: (error) => onMensaje?.(error?.response?.data?.error ?? "No se pudo usar la garantía."),
  });

  const g = consulta.data?.estadia;
  if (!g) return null; // reservas anteriores a la garantía con tarjeta: nada que mostrar

  const d = descripcionDeGarantia(g, saldo);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-laton-300 bg-laton-100 px-4 py-3" aria-label="Garantía del check-in">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-laton-700">Garantía del check-in</p>
        <Badge variante={g.estado === "Pendiente" ? "alerta" : "ok"}>{g.estado}</Badge>
      </div>
      <p className="text-[13px] font-semibold text-laton-oscuro">{d.titulo}</p>
      <p className="text-[12px] text-laton-700">{d.detalle}</p>
      {puedeGestionar && enCurso && d.usable && (
        <div>
          <Button
            variante="secundario"
            icono={d.esTarjeta ? CreditCard : Wallet}
            disabled={mutacion.isPending}
            onClick={() => mutacion.mutate()}
          >
            {d.esTarjeta ? `Cobrar ${moneda(d.aplicable)} a la tarjeta en garantía` : `Aplicar ${moneda(d.aplicable)} del depósito al saldo`}
          </Button>
        </div>
      )}
    </div>
  );
}
