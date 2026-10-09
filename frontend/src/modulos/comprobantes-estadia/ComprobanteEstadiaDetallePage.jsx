import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, FilePlus2, Printer } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearFechaSinHora, formatearTimestamp } from "../../lib/fechas";
import { DesgloseIva } from "./DesgloseIva";
import { moneda } from "./moneda";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { useVolver } from "../../lib/useVolver";
import { anularComprobante, obtenerComprobante } from "./comprobanteEstadia.api";
import { TIPO_COMPROBANTE_BADGE } from "./comprobanteEstadia.constantes";
import { NotaCreditoModal } from "./NotaCreditoModal";
import { HOTEL } from "../ecommerce/ecommerce.config";

const centavos = (n) => Math.round(Number(n || 0) * 100);

function Dato({ etiqueta, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-piedra">{etiqueta}</p>
      <div className="mt-0.5 text-[13.5px] text-tinta">{children}</div>
    </div>
  );
}

// Observación 3 — de qué se compone el total: alojamiento, cargos adicionales
// (servicios/consumos) y cargos de la verificación de la habitación.
const CATEGORIAS_DETALLE = ["Alojamiento", "Cargos adicionales", "Verificación de la habitación"];

function DetalleCuenta({ detalle }) {
  if (!detalle || detalle.lineas.length === 0) return null;
  return (
    <div className="mt-6 border-t border-borde pt-4" data-testid="detalle-comprobante">
      <h2 className="font-heading text-[17px] font-semibold">Detalle</h2>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr className="border-b border-borde text-[11px] uppercase tracking-wide text-piedra">
            <th className="px-3 py-2 font-medium">Concepto</th>
            <th className="px-3 py-2 text-right font-medium">Cantidad</th>
            <th className="px-3 py-2 text-right font-medium">Precio unit.</th>
            <th className="px-3 py-2 text-right font-medium">Importe</th>
          </tr>
        </thead>
        <tbody>
          {CATEGORIAS_DETALLE.map((categoria) => {
            const lineas = detalle.lineas.filter((l) => l.categoria === categoria);
            if (lineas.length === 0) return null;
            const subtotal = lineas.reduce((acc, l) => acc + centavos(l.importe), 0) / 100;
            return [
              <tr key={`${categoria}-t`} className="bg-hueso">
                <td colSpan={4} className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-piedra">
                  {categoria}
                </td>
              </tr>,
              ...lineas.map((l, i) => (
                <tr key={`${categoria}-${i}`} className="border-b border-borde">
                  <td className="px-3 py-2 text-[13px]">
                    {l.concepto}
                    {l.habitacion && <span className="text-piedra"> · Hab. {l.habitacion}</span>}
                    {l.descripcion && <span className="block text-[11.5px] text-piedra">{l.descripcion}</span>}
                    {l.fecha && categoria !== "Alojamiento" && (
                      <span className="block font-mono text-[11px] text-tinta/55">{formatearTimestamp(l.fecha)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {l.cantidad != null ? `${l.cantidad}${l.unidad ? ` ${l.unidad}` : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {l.precioUnitario != null ? moneda(l.precioUnitario) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{moneda(l.importe)}</td>
                </tr>
              )),
              <tr key={`${categoria}-s`}>
                <td colSpan={3} className="px-3 py-1.5 text-right text-[12px] text-piedra">
                  Subtotal {categoria.toLowerCase()}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-[12.5px] font-medium">{moneda(subtotal)}</td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// Proyecto académico: el hotel no tiene razón social ni CUIT reales; nunca se inventa uno.
const RAZON_SOCIAL_DEMOSTRACION = "Hotel de demostración";
const CUIT_NO_APLICA = "CUIT: no aplica — proyecto académico";

export function ComprobanteEstadiaDetallePage() {
  const { id } = useParams();
  const { puede } = useSesion();
  const puedeVer = puede("verComprobantesEstadia");
  // Admin ve la ficha (incluida la impresión) pero no emite notas de
  // crédito ni anula (re-auditoría del 2026-09-21, mismo criterio que
  // Habitaciones/Mantenimiento).
  const puedeGestionar = puede("gestionarComprobantesEstadia");
  const volver = useVolver("/comprobantes-estadia");
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();
  const [modalNota, setModalNota] = useState(false);
  const [confirmandoAnular, setConfirmandoAnular] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");

  const comprobanteQuery = useQuery({
    queryKey: ["comprobantes-estadia", "detalle", id],
    queryFn: () => obtenerComprobante(id),
    enabled: puedeVer,
  });

  const mutacionAnular = useMutation({
    mutationFn: () => anularComprobante(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comprobantes-estadia"] });
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      setConfirmandoAnular(false);
      setErrorAccion("");
      mostrarToast("Comprobante anulado.");
    },
    onError: (err) => {
      setConfirmandoAnular(false);
      setErrorAccion(err?.response?.data?.error ?? "No se pudo anular el comprobante.");
    },
  });

  if (!puedeVer) return <SinPermiso />;
  if (comprobanteQuery.isLoading) return <p className="text-sm text-piedra">Cargando comprobante…</p>;
  if (comprobanteQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-error-texto">
          {comprobanteQuery.error?.response?.data?.error ?? "No se pudo cargar el comprobante."}
        </p>
        <Button variante="fantasma" icono={ArrowLeft} onClick={volver}>
          Volver
        </Button>
      </div>
    );
  }

  const c = comprobanteQuery.data;
  const esNota = c.tipo === "Nota de Crédito";
  // La nota de crédito sigue el criterio del comprobante al que corresponde.
  const esEmpresa = Boolean(esNota ? c.comprobanteRelacionado?.cuitTercero : c.cuitTercero);
  const notasVigentes = (c.ajustes ?? []).filter((n) => !n.anulado);
  const acreditado = notasVigentes.reduce((acc, n) => acc + Number(n.importeTotal), 0);
  const disponible = (centavos(c.importeTotal) - centavos(acreditado)) / 100;
  const huesped = c.reserva?.huesped;
  // Antes del check-out la estadía todavía puede cambiar: el comprobante es provisorio.
  const provisorio = !esNota && c.reserva?.estado && c.reserva.estado !== "Cerrada";
  const medios = c.mediosDePago ?? [];

  const puedeEmitirNota = puedeGestionar && !esNota && !c.anulado && centavos(disponible) > 0;
  // Regla del backend: un comprobante con notas de crédito vigentes no se anula.
  const puedeAnular = puedeGestionar && !c.anulado && notasVigentes.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado formal solo para imprimir / guardar como PDF: invisible
          en pantalla, visible solo al imprimir (mismo mecanismo que el de
          Órdenes de Compra). El Layout ya oculta el menú lateral al imprimir. */}
      <div className="hidden print:block">
        <div className="mb-2 flex items-start justify-between border-b-2 border-tinta pb-4">
          <div>
            <p className="font-heading text-xl font-semibold">{HOTEL.nombre}</p>
            <p className="text-xs">{RAZON_SOCIAL_DEMOSTRACION}</p>
            <p className="text-xs text-piedra">{CUIT_NO_APLICA}</p>
            <p className="text-xs text-piedra">{HOTEL.direccion}</p>
            <p className="text-xs text-piedra">Tel. {HOTEL.telefono}</p>
          </div>
          <div className="text-right">
            <p className="font-heading text-lg font-semibold">{esNota ? "Nota de crédito" : "Comprobante"}</p>
            <p className="font-mono text-sm">{c.numero}</p>
            <p className="text-xs text-piedra">Emitido el {formatearTimestamp(c.fecha)}</p>
            {c.anulado && <p className="mt-1 text-xs font-semibold uppercase text-error-texto">Anulado</p>}
            {provisorio && <p className="mt-1 text-xs font-semibold uppercase">Comprobante provisorio</p>}
          </div>
        </div>
      </div>

      <div className="print:hidden">
        <Button variante="fantasma" icono={ArrowLeft} onClick={volver}>
          Volver
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-[34px] font-semibold">{esNota ? "Nota de crédito" : "Comprobante"}</h1>
            <CodigoClave className="text-[20px]">{c.numero}</CodigoClave>
            <Badge variante={TIPO_COMPROBANTE_BADGE[c.tipo]}>{c.tipo}</Badge>
            {c.anulado && <Badge variante="error">Anulado</Badge>}
          </div>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">Emitido el {formatearTimestamp(c.fecha)}</p>
        </div>
        <div className="flex gap-2.5">
          <Button variante="secundario" icono={Printer} onClick={() => window.print()}>
            Imprimir
          </Button>
          {puedeEmitirNota && (
            <Button variante="secundario" icono={FilePlus2} onClick={() => setModalNota(true)}>
              Nota de crédito
            </Button>
          )}
          {puedeAnular && (
            <Button variante="destructivo" icono={Ban} onClick={() => setConfirmandoAnular(true)}>
              Anular
            </Button>
          )}
        </div>
      </div>

      {errorAccion && (
        <div className="rounded-md bg-error-suave px-4 py-3 print:hidden">
          <p className="text-[12.5px] text-error-texto">{errorAccion}</p>
        </div>
      )}

      <div className="rounded-lg border border-borde bg-white p-5 print:border-0 print:p-0">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Dato etiqueta="A nombre de">
            {c.razonSocialTercero ? (
              <>
                <span className="font-medium">{c.razonSocialTercero}</span>
                <span className="block font-mono text-[12px] text-piedra">CUIT {c.cuitTercero}</span>
              </>
            ) : (
              <span className="font-medium">{huesped?.nombre ?? "—"}</span>
            )}
          </Dato>
          <Dato etiqueta="Huésped">
            {huesped?.nombre ?? "—"}
            {huesped?.numeroDocumento && (
              <span className="block font-mono text-[12px] text-piedra">
                {huesped.tipoDocumento} {huesped.numeroDocumento}
              </span>
            )}
          </Dato>
          <Dato etiqueta="Reserva">
            <Link to={`/reservas/${c.reservaId}`} className="font-mono font-medium text-pino underline-offset-2 hover:underline">
              {c.reserva?.codigoConfirmacion ?? `#${c.reservaId}`}
            </Link>
          </Dato>
          {c.reserva?.fechaDesde && (
            <Dato etiqueta="Estadía">
              {formatearFechaSinHora(c.reserva.fechaDesde)} al {formatearFechaSinHora(c.reserva.fechaHasta)}
            </Dato>
          )}
          {esNota && c.comprobanteRelacionado && (
            <Dato etiqueta="Corrige el comprobante">
              <Link
                to={`/comprobantes-estadia/${c.comprobanteRelacionado.id}`}
                className="font-mono font-medium text-pino underline-offset-2 hover:underline"
              >
                {c.comprobanteRelacionado.numero}
              </Link>
            </Dato>
          )}
        </div>

        {esNota && c.motivo && (
          <div className="mt-5 rounded-lg border border-borde bg-hueso px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-piedra">Motivo</p>
            <p className="mt-0.5 text-[13.5px] text-tinta">{c.motivo}</p>
          </div>
        )}

        {!esNota && <DetalleCuenta detalle={c.detalle} />}

        {!esNota && medios.length > 0 && (
          <div className="mt-5">
            <p className="text-[11px] uppercase tracking-wide text-piedra">Medios de pago</p>
            <ul className="mt-1 text-[13px]">
              {medios.map((m, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-borde py-1 last:border-0">
                  <span>
                    {m.medioPago}
                    <span className="text-piedra"> · {m.concepto}{m.referencia ? ` · ${m.referencia}` : ""}</span>
                  </span>
                  <span className="font-mono">{moneda(m.importe)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-t border-borde pt-4">
          <DesgloseIva importeNeto={c.importeNeto} importeIVA={c.importeIVA} alicuotaIVA={c.alicuotaIVA} esEmpresa={esEmpresa} className="min-w-65" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-piedra">{esNota ? "Total acreditado" : "Total"}</p>
            <Cifra tamano={28}>
              {esNota ? "− " : ""}
              {moneda(c.importeTotal)}
            </Cifra>
          </div>
        </div>
      </div>

      {!esNota && (
        <div className="rounded-lg border border-borde bg-white p-5 print:hidden">
          <h2 className="font-heading text-[19px] font-semibold">Notas de crédito</h2>
          <p className="mb-4 mt-0.5 font-mono text-[11px] text-tinta/55">
            Acreditado {moneda(acreditado)} · todavía acreditable {moneda(disponible)}
          </p>
          <Table
            columnas={["Número", "Emitida", "Motivo", "Total", "Estado"]}
            columnasDerecha={["Total"]}
            filas={c.ajustes ?? []}
            vacio="Este comprobante no tiene notas de crédito."
            renderFila={(n) => (
              <tr key={n.id} className="border-b border-borde last:border-0">
                <td className="px-3 py-2.5">
                  <Link to={`/comprobantes-estadia/${n.id}`} className="font-mono text-[13px] font-medium text-pino underline-offset-2 hover:underline">
                    {n.numero}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-[12.5px]">{formatearTimestamp(n.fecha)}</td>
                <td className="px-3 py-2.5 text-[12.5px] text-piedra">{n.motivo ?? "—"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">− {moneda(n.importeTotal)}</td>
                <td className="px-3 py-2.5">{n.anulado ? <Badge variante="error">Anulada</Badge> : <Badge variante="ok">Vigente</Badge>}</td>
              </tr>
            )}
          />
        </div>
      )}

      <p className="border-t border-dashed border-borde pt-3 text-xs text-piedra">
        {provisorio ? "Comprobante provisorio. " : ""}Comprobante interno. No válido como factura.
      </p>

      {modalNota && (
        <NotaCreditoModal
          comprobante={c}
          disponible={disponible}
          onClose={() => setModalNota(false)}
          onExito={(nota) => {
            setModalNota(false);
            setErrorAccion("");
            mostrarToast(`Nota de crédito ${nota.numero} emitida.`);
          }}
        />
      )}

      <ConfirmDialog
        abierto={confirmandoAnular}
        titulo="¿Anular el comprobante?"
        mensaje={`El comprobante ${c.numero} deja de estar vigente. Queda registrado como anulado y la estadía puede volver a facturarse.`}
        textoConfirmar="Sí, anular"
        variante="destructivo"
        icono={Ban}
        cargando={mutacionAnular.isPending}
        onCancelar={() => setConfirmandoAnular(false)}
        onConfirmar={() => mutacionAnular.mutate()}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
