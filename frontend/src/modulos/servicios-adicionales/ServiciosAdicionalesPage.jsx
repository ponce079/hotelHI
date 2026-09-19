import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, UtensilsCrossed } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { NombreClave } from "../../componentes/NombreClave";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearTimestamp } from "../../lib/fechas";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { BuscadorPorCodigo } from "../reservas/ReservaWizard";
import { obtenerReservaPorCodigo } from "../reservas/reservas.api";
import { ESTADO_RESERVA, ESTADO_RESERVA_BADGE } from "../reservas/reservas.constantes";
import { ConsumoModal } from "./ConsumoModal";
import { obtenerResumenPorReserva } from "./serviciosAdicionales.api";
import { TIPO_SERVICIO_BADGE } from "./serviciosAdicionales.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });

export function ServiciosAdicionalesPage() {
  const { puede } = useSesion();
  const puedeVer = puede("verConsumosServicio");
  const puedeRegistrar = puede("registrarConsumoServicio");
  const [reserva, setReserva] = useState(null);
  const [errorBusqueda, setErrorBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  const buscar = useMutation({
    mutationFn: (codigo) => obtenerReservaPorCodigo(codigo),
    onSuccess: (data) => {
      setErrorBusqueda("");
      setReserva(data);
    },
    onError: (error) => {
      setReserva(null);
      setErrorBusqueda(error?.response?.data?.error ?? "No se pudo buscar la reserva.");
    },
  });

  const resumenQuery = useQuery({
    queryKey: ["consumos-servicios", "resumen", reserva?.id],
    queryFn: () => obtenerResumenPorReserva(reserva.id),
    enabled: Boolean(reserva) && reserva.estado === ESTADO_RESERVA.EN_CURSO,
    refetchInterval: 10000,
  });

  if (!puedeVer) return <SinPermiso />;

  const enCurso = reserva?.estado === ESTADO_RESERVA.EN_CURSO;
  const resumen = resumenQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Servicios Adicionales</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 61 a 64 — restaurante, spa, lavandería y minibar, cargados a la cuenta del huésped
        </p>
      </div>

      <div className="rounded-lg border border-borde bg-white p-5">
        <BuscadorPorCodigo onBuscar={(codigo) => buscar.mutate(codigo)} cargando={buscar.isPending} />
        {errorBusqueda && <p className="mt-3 text-[13px] text-error-texto">{errorBusqueda}</p>}
      </div>

      {reserva && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borde bg-white p-5">
            <div className="flex items-center gap-3">
              <CodigoClave className="text-[18px]">{reserva.codigoConfirmacion}</CodigoClave>
              <NombreClave>{reserva.huesped?.nombre}</NombreClave>
              <span className="font-mono text-[12.5px] text-piedra">
                Hab. {reserva.habitaciones.map((h) => h.numero).join(", ")}
              </span>
              <Badge variante={ESTADO_RESERVA_BADGE[reserva.estado]}>{reserva.estado}</Badge>
            </div>
            {enCurso && puedeRegistrar && (
              <Button icono={Plus} onClick={() => setModalAbierto(true)}>
                Registrar consumo
              </Button>
            )}
          </div>

          {!enCurso && (
            <p className="rounded-md border border-laton-300 bg-laton-100 px-4 py-3 text-[13px] text-laton-700">
              Solo se pueden cargar consumos con la reserva "En curso" (ésta está "{reserva.estado}").
            </p>
          )}

          {enCurso && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded-lg border border-pino-300 bg-pino-100 p-4">
                  <p className="text-[11px] uppercase tracking-wide text-pino-700">Total acumulado</p>
                  <Cifra tamano={26}>{FORMATO_MONEDA.format(resumen?.totalGeneral ?? 0)}</Cifra>
                </div>
                {resumen?.totalPorTipo.map((t) => (
                  <div key={t.tipoServicio} className="rounded-lg border border-borde bg-white p-4">
                    <p className="mb-1"><Badge variante={TIPO_SERVICIO_BADGE[t.tipoServicio]}>{t.tipoServicio}</Badge></p>
                    <Cifra tamano={20}>{FORMATO_MONEDA.format(t.total)}</Cifra>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-borde bg-white p-5">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-[19px] font-semibold">
                  <UtensilsCrossed size={17} className="text-pino" /> Cargos registrados
                </h2>
                <Table
                  columnas={["Fecha", "Habitación", "Tipo", "Detalle", "Registrado por", "Monto"]}
                  columnasDerecha={["Monto"]}
                  filas={resumen?.items ?? []}
                  vacio="Todavía no hay consumos registrados para esta estadía."
                  renderFila={(c) => (
                    <tr key={c.id} className="border-b border-borde last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{formatearTimestamp(c.fechaHora)}</td>
                      <td className="px-3 py-2.5 font-mono text-[12.5px]">{c.habitacionNumero}</td>
                      <td className="px-3 py-2.5"><Badge variante={TIPO_SERVICIO_BADGE[c.tipoServicio]}>{c.tipoServicio}</Badge></td>
                      <td className="px-3 py-2.5 text-[12.5px] text-piedra">
                        {c.articuloNombre ? `${c.articuloNombre} × ${c.cantidad}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px]">{c.registradoPor}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[13px] font-semibold">{FORMATO_MONEDA.format(c.monto)}</td>
                    </tr>
                  )}
                />
              </div>
            </>
          )}
        </div>
      )}

      {modalAbierto && (
        <ConsumoModal
          reserva={reserva}
          onClose={() => setModalAbierto(false)}
          onExito={(mensaje) => {
            setModalAbierto(false);
            mostrarToast(mensaje);
            queryClient.invalidateQueries({ queryKey: ["consumos-servicios"] });
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
