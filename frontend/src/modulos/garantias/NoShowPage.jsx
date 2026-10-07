import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutacionUnica } from "../../lib/useMutacionUnica";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserX } from "lucide-react";
import { Button } from "../../componentes/Button";
import { CodigoClave } from "../../componentes/CodigoClave";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { NombreClave } from "../../componentes/NombreClave";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearFechaSinHora } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { LIMITES_RESERVA } from "../reservas/reservas.constantes";
import { CierrePrevio } from "./CierrePrevio";
import { listarNoShowPendientes, marcarNoShow } from "./garantias.api";

// Llegadas no presentadas: reservas Confirmadas cuya fecha de llegada ya pasó.
// Marcar el no-show cobra la penalidad del plan (a la tarjeta en garantía, o
// de lo ya pagado), deja la reserva en "No-show" y libera las habitaciones.
export function NoShowPage() {
  const { puede } = useSesion();
  const puedeGestionar = puede("gestionarReservas");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();
  const [seleccionada, setSeleccionada] = useState(null);
  const [observacion, setObservacion] = useState("");

  const pendientes = useQuery({
    queryKey: ["reservas", "no-show"],
    queryFn: listarNoShowPendientes,
    enabled: puedeGestionar,
  });

  const mutacion = useMutacionUnica({
    mutationFn: ({ id, motivo }) => marcarNoShow(id, motivo),
    onSuccess: (reserva) => {
      // La reserva ya no está Confirmada: se descartan la penalidad y la vista previa para que no se vuelvan a pedir (400).
      queryClient.removeQueries({ queryKey: ["reservas", "penalidad"] });
      queryClient.removeQueries({ queryKey: ["reservas", "cierre-previo"] });
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      mostrarToast(`Reserva ${reserva.codigoConfirmacion} marcada como no-show. ${reserva.penalidad?.mensaje ?? ""}`.trim());
      setSeleccionada(null);
      setObservacion("");
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? "No se pudo marcar el no-show.");
    },
  });

  if (!puedeGestionar) return <SinPermiso />;
  const reservas = pendientes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-pino px-6 py-5 text-hueso">
        <h1 className="font-heading text-[34px] font-semibold">Llegadas no presentadas</h1>
        <p className="mt-1.5 font-mono text-[11px] text-hueso/65">
          Reservas confirmadas con fecha de llegada vencida — el no-show cobra la penalidad del plan
        </p>
      </div>

      <div>
        <Button variante="fantasma" icono={ArrowLeft} onClick={() => navigate("/reservas")}>
          Volver a Reservas
        </Button>
      </div>

      {pendientes.isError && (
        <p className="rounded-md border border-error bg-error-suave px-4 py-3 text-[13px] text-error-texto">
          {pendientes.error?.response?.data?.error ?? "No se pudieron cargar las llegadas no presentadas."}
        </p>
      )}

      {!pendientes.isLoading && !pendientes.isError && (
        <div className="rounded-lg border border-borde bg-white p-5">
          <Table
            columnas={["Código", "Huésped", "Habitaciones", "Llegada prevista", "Plan", ""]}
            filas={reservas}
            columnasDerecha={[""]}
            vacio="No hay llegadas pendientes de marcar."
            renderFila={(reserva) => (
              <tr key={reserva.id} className="h-16 border-b border-borde last:border-0">
                <td className="px-3 py-2.5">
                  <CodigoClave>{reserva.codigoConfirmacion}</CodigoClave>
                </td>
                <td className="px-3 py-2.5">
                  <NombreClave className="block max-w-[220px] truncate">{reserva.huesped?.nombre ?? "—"}</NombreClave>
                  <div className="text-[11px] text-piedra">
                    {reserva.huesped?.tipoDocumento} {reserva.huesped?.numeroDocumento}
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12.5px]">
                  {reserva.habitaciones.map((h) => h.numero).join(", ") || "—"}
                </td>
                <td className="px-3 py-2.5 text-[13px]">{formatearFechaSinHora(reserva.fechaDesde)}</td>
                <td className="px-3 py-2.5 text-[13px]">{reserva.planTarifario?.nombre ?? "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  <Button
                    variante="destructivo"
                    icono={UserX}
                    onClick={() => {
                      setObservacion("");
                      setSeleccionada(reserva);
                    }}
                  >
                    Marcar no-show
                  </Button>
                </td>
              </tr>
            )}
          />
        </div>
      )}

      <ConfirmDialog
        abierto={Boolean(seleccionada)}
        titulo="¿Marcar como no-show?"
        mensaje={`La reserva ${seleccionada?.codigoConfirmacion ?? ""} quedará como No-show y sus habitaciones se liberan. Esta acción cobra la penalidad que corresponde al plan.`}
        textoConfirmar="Sí, marcar no-show"
        variante="destructivo"
        icono={UserX}
        cargando={mutacion.isPending}
        onCancelar={() => setSeleccionada(null)}
        onConfirmar={() => mutacion.mutate({ id: seleccionada.id, motivo: observacion.trim() || undefined })}
      >
        {seleccionada && <CierrePrevio reservaId={seleccionada.id} tipo="NO_SHOW" />}
        <label className="flex flex-col gap-1.5 font-body text-sm">
          <span className="text-[12px] text-tinta/70">Observación (opcional)</span>
          <textarea
            rows={2}
            value={observacion}
            maxLength={LIMITES_RESERVA.motivoCancelacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Ej.: avisó que no viajaba"
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
        </label>
      </ConfirmDialog>

      <Toast mensaje={toast} />
    </div>
  );
}
