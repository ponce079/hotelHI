import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  Bell,
  BedDouble,
  CheckCircle2,
  ClipboardCheck,
  DoorClosed,
  Plus,
  Receipt,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { CodigoClave } from "../../componentes/CodigoClave";
import { ConfirmDialog } from "../../componentes/ConfirmDialog";
import { PasoAPaso } from "../../componentes/PasoAPaso";
import { SinPermiso } from "../../componentes/SinPermiso";
import { Table } from "../../componentes/Table";
import { Toast } from "../../componentes/Toast";
import { formatearFechaSinHora, formatearTimestamp } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { useSesion } from "../../lib/sesion";
import { useToast } from "../../lib/useToast";
import { useVolver } from "../../lib/useVolver";
import { ESTADO_RESERVA, ESTADO_RESERVA_BADGE } from "../reservas/reservas.constantes";
import { listarComprobantesReserva } from "../comprobantes-estadia/comprobanteEstadia.api";
import { EmitirComprobanteModal } from "../comprobantes-estadia/EmitirComprobanteModal";
import { anularPagoEstadia, listarPagosEstadia } from "../pagos-estadia/pagoEstadia.api";
import { ESTADO_PAGO_BADGE } from "../pagos-estadia/pagoEstadia.constantes";
import { PagoEstadiaWizard } from "../pagos-estadia/PagoEstadiaWizard";
import { CargoVerificacionCheckoutModal } from "./CargoVerificacionCheckoutModal";
import { confirmarCheckOut, obtenerCuenta } from "./checkOut.api";
import { ETIQUETA_TIPO_CARGO, PASOS_CHECKOUT } from "./checkOut.constantes";

const moneda = (n) => `$ ${formatearMonto(n)}`;

function Tarjeta({ icono: Icono, titulo, hu, children }) {
  return (
    <div className="rounded-lg border border-borde bg-white p-5">
      <h2 className="flex items-center gap-2 font-heading text-[19px] font-semibold">
        {Icono && <Icono size={17} className="text-pino" />} {titulo}
      </h2>
      {hu && <p className="mb-4 mt-0.5 font-mono text-[11px] text-tinta/55">{hu}</p>}
      {children}
    </div>
  );
}

function Fila({ etiqueta, valor, fuerte = false }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className={`text-[12.5px] ${fuerte ? "font-semibold text-tinta" : "text-piedra"}`}>{etiqueta}</span>
      <span className={`font-mono ${fuerte ? "text-[14px] font-semibold" : "text-[13px]"}`}>{valor}</span>
    </div>
  );
}

export function CheckOutReservaPage() {
  const { reservaId } = useParams();
  const { puede } = useSesion();
  const puedeGestionar = puede("gestionarCheckOut");
  const volver = useVolver("/check-out");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();

  // El backend no guarda "verificación sin novedades" (el modelo solo tiene
  // cargos), así que el orden 48 → 87 → 49 lo lleva esta pantalla: la
  // verificación cuenta como hecha si ya hay un cargo cargado o si el
  // recepcionista la marca como completa.
  const [verificacionMarcada, setVerificacionMarcada] = useState(false);
  const [cargosValidados, setCargosValidados] = useState(false);
  const [modalCargo, setModalCargo] = useState(false);
  const [modalPago, setModalPago] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [errorCierre, setErrorCierre] = useState("");
  const [resultado, setResultado] = useState(null);
  const [aAnular, setAAnular] = useState(null);
  const [errorPago, setErrorPago] = useState("");
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [modalComprobante, setModalComprobante] = useState(false);

  const cuentaQuery = useQuery({
    queryKey: ["check-out", "cuenta", reservaId],
    queryFn: () => obtenerCuenta(reservaId),
    enabled: puedeGestionar,
  });
  const pagosQuery = useQuery({
    queryKey: ["check-out", "pagos", reservaId],
    queryFn: () => listarPagosEstadia(reservaId),
    enabled: puedeGestionar,
  });

  // El comprobante se emite una vez cerrada la estadía: recién ahí se sabe
  // el total final. `estadoCerrado` se calcula antes de los returns
  // tempranos porque el hook de la query no puede ir después de ellos.
  const estadoCerrado = cuentaQuery.data?.estadoReserva === ESTADO_RESERVA.CERRADA || Boolean(resultado);
  const comprobantesQuery = useQuery({
    queryKey: ["check-out", "comprobantes", reservaId],
    queryFn: () => listarComprobantesReserva(reservaId),
    enabled: puedeGestionar && estadoCerrado,
  });

  const mutacionAnular = useMutation({
    mutationFn: () => anularPagoEstadia(aAnular.id, motivoAnulacion.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      setAAnular(null);
      setMotivoAnulacion("");
      mostrarToast("Pago anulado.");
    },
    onError: (err) => {
      setAAnular(null);
      setErrorPago(err?.response?.data?.error ?? "No se pudo anular el pago.");
    },
  });

  const mutacionCierre = useMutation({
    mutationFn: () => confirmarCheckOut(reservaId, { cargosValidados: true }),
    onSuccess: (res) => {
      setResultado(res);
      setConfirmando(false);
      setErrorCierre("");
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      queryClient.invalidateQueries({ queryKey: ["habitaciones"] });
    },
    onError: (err) => {
      setConfirmando(false);
      setErrorCierre(err?.response?.data?.error ?? "No se pudo confirmar el check-out.");
    },
  });

  if (!puedeGestionar) return <SinPermiso />;
  if (cuentaQuery.isLoading) return <p className="text-sm text-piedra">Consolidando la cuenta…</p>;
  if (cuentaQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-error-texto">
          {cuentaQuery.error?.response?.data?.error ?? "No se pudo consolidar la cuenta de la reserva."}
        </p>
        <Button variante="fantasma" icono={ArrowLeft} onClick={volver}>
          Volver
        </Button>
      </div>
    );
  }

  const cuenta = cuentaQuery.data;
  const pagos = pagosQuery.data?.pagos ?? [];
  const cerrada = cuenta.estadoReserva === ESTADO_RESERVA.CERRADA || Boolean(resultado);
  const enCurso = cuenta.estadoReserva === ESTADO_RESERVA.EN_CURSO && !resultado;
  const saldado = Math.round(cuenta.saldo * 100) === 0;
  const verificacionCompleta = verificacionMarcada || cuenta.verificaciones.length > 0;
  const consumosMinibar = cuenta.consumos.filter((c) => c.tipoServicio === "Minibar");
  const comprobanteVigente = (comprobantesQuery.data ?? []).find((c) => c.tipo === "Comprobante" && !c.anulado);

  // PasoAPaso: 0 verificación · 1 confirmación · 2 pago · 3 cierre · 4 cerrado.
  const pasoActual = cerrada ? PASOS_CHECKOUT.length : !verificacionCompleta ? 0 : !cargosValidados ? 1 : !saldado ? 2 : 3;
  const puedeCerrar = enCurso && verificacionCompleta && cargosValidados && saldado;

  function alRegistrarCargo(mensaje) {
    setModalCargo(false);
    // El total cambió: lo que el huésped había confirmado ya no es lo que se va a cobrar.
    setCargosValidados(false);
    mostrarToast(mensaje);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variante="fantasma" icono={ArrowLeft} onClick={volver}>
          Volver
        </Button>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[34px] font-semibold">Check-out</h1>
          <CodigoClave className="text-[20px]">{cuenta.codigoConfirmacion}</CodigoClave>
          <Badge variante={ESTADO_RESERVA_BADGE[resultado ? ESTADO_RESERVA.CERRADA : cuenta.estadoReserva]}>
            {resultado ? ESTADO_RESERVA.CERRADA : cuenta.estadoReserva}
          </Badge>
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          {cuenta.huesped?.nombre} · {formatearFechaSinHora(cuenta.fechaDesde)} al {formatearFechaSinHora(cuenta.fechaHasta)}
        </p>
      </div>

      {!enCurso && !cerrada && (
        <div className="flex items-start gap-3 rounded-lg border border-laton-300 bg-laton-100 px-5 py-4">
          <TriangleAlert size={18} className="mt-0.5 flex-none text-laton-700" />
          <p className="text-[13px] text-laton-700">
            Esta reserva está <strong>{cuenta.estadoReserva}</strong>: el check-out solo se puede hacer sobre reservas
            En curso (con el check-in ya hecho). Abajo ves la cuenta, pero no se puede operar.
          </p>
        </div>
      )}

      {cerrada && !resultado && (
        <div className="flex items-start gap-3 rounded-lg border border-borde bg-hueso px-5 py-4">
          <CheckCircle2 size={18} className="mt-0.5 flex-none text-pino" />
          <p className="text-[13px] text-tinta">El check-out de esta reserva ya fue confirmado. La cuenta queda de solo lectura.</p>
        </div>
      )}

      <PasoAPaso pasos={PASOS_CHECKOUT} pasoActual={pasoActual} ultimoPasoRequiereLlegada />

      {resultado && (
        <div className="flex flex-col gap-3 rounded-lg border border-pino-300 bg-pino-100 px-5 py-4">
          <p className="flex items-center gap-2 font-heading text-[18px] font-semibold text-pino-700">
            <CheckCircle2 size={18} /> Check-out completado
          </p>
          <ul className="flex flex-col gap-1 text-[13px] text-pino-700">
            {resultado.habitaciones.map((h) => (
              <li key={h.habitacionId}>
                Habitación {h.numero}: {h.observacion ?? <>quedó <strong>{h.estado}</strong>.</>}
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2 text-[12.5px] text-pino-700">
            <Bell size={14} /> Se notificó a Housekeeping ({resultado.notificaciones.length} aviso
            {resultado.notificaciones.length === 1 ? "" : "s"} registrado{resultado.notificaciones.length === 1 ? "" : "s"}).
          </p>
          <div>
            <Button variante="secundario" onClick={volver}>
              Volver al listado
            </Button>
          </div>
        </div>
      )}

      <Tarjeta icono={BedDouble} titulo="Cuenta consolidada" hu="HU 48 — alojamiento + servicios adicionales + verificación">
        <div className="flex flex-col gap-6">
          <Table
            columnas={["Habitación", "Tipo", "Noches", "Por noche", "Subtotal"]}
            columnasDerecha={["Noches", "Por noche", "Subtotal"]}
            filas={cuenta.habitaciones}
            vacio="La reserva no tiene habitaciones."
            renderFila={(h) => (
              <tr key={h.habitacionId} className="h-11 border-b border-borde last:border-0">
                <td className="px-3 py-2 font-mono text-[13px] font-medium">{h.numero}</td>
                <td className="px-3 py-2 text-[13px]">{h.tipo}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{h.noches}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{moneda(h.tarifaPorNoche)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{moneda(h.subtotal)}</td>
              </tr>
            )}
          />

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-piedra">Servicios adicionales</p>
            <Table
              columnas={["Fecha", "Servicio", "Habitación", "Monto"]}
              columnasDerecha={["Monto"]}
              filas={cuenta.consumos}
              vacio="No hubo consumos de servicios adicionales durante la estadía."
              renderFila={(c) => (
                <tr key={c.id} className="h-11 border-b border-borde last:border-0">
                  <td className="px-3 py-2 text-[12.5px]">{formatearTimestamp(c.fechaHora)}</td>
                  <td className="px-3 py-2 text-[13px]">{c.tipoServicio}</td>
                  <td className="px-3 py-2 font-mono text-[12.5px]">
                    {cuenta.habitaciones.find((h) => h.habitacionId === c.habitacionId)?.numero ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{moneda(c.monto)}</td>
                </tr>
              )}
            />
          </div>

          {cuenta.verificaciones.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-piedra">Cargos de verificación</p>
              <Table
                columnas={["Fecha", "Tipo", "Descripción", "Registró", "Monto"]}
                columnasDerecha={["Monto"]}
                filas={cuenta.verificaciones}
                renderFila={(v) => (
                  <tr key={v.id} className="border-b border-borde last:border-0">
                    <td className="px-3 py-2.5 text-[12.5px]">{formatearTimestamp(v.fechaHora)}</td>
                    <td className="px-3 py-2.5 text-[13px]">{ETIQUETA_TIPO_CARGO[v.tipo] ?? v.tipo}</td>
                    <td className="px-3 py-2.5 text-[12.5px] text-piedra">{v.descripcion}</td>
                    <td className="px-3 py-2.5 text-[12.5px]">{v.registradoPor}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs">{moneda(v.monto)}</td>
                  </tr>
                )}
              />
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-6 border-t border-borde pt-4">
            <div className="flex min-w-65 flex-col gap-1.5">
              <Fila etiqueta="Alojamiento" valor={moneda(cuenta.subtotales.alojamiento)} />
              <Fila etiqueta="Servicios adicionales" valor={moneda(cuenta.subtotales.serviciosAdicionales)} />
              <Fila etiqueta="Verificación" valor={moneda(cuenta.subtotales.verificacion)} />
              <Fila etiqueta="Ya pagado" valor={`− ${moneda(cuenta.totalPagado)}`} />
            </div>
            <div className="flex gap-8">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-piedra">Total de la cuenta</p>
                <Cifra tamano={28}>{moneda(cuenta.totalAdeudado)}</Cifra>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-piedra">Saldo a cobrar</p>
                <Cifra tamano={28} className={saldado ? "text-pino" : "text-laton-oscuro"}>
                  {moneda(cuenta.saldo)}
                </Cifra>
              </div>
            </div>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta
        icono={ClipboardCheck}
        titulo="1. Verificación de la habitación"
        hu="HU 87 — revisá la habitación y cargá daños, faltantes o minibar sin registrar"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variante="secundario" icono={Plus} disabled={!enCurso} onClick={() => setModalCargo(true)}>
            Registrar cargo
          </Button>
          {verificacionCompleta ? (
            <Badge variante="ok">Verificación completa</Badge>
          ) : (
            <Button variante="secundario" disabled={!enCurso} onClick={() => setVerificacionMarcada(true)}>
              Verificación sin novedades
            </Button>
          )}
          {!verificacionCompleta && enCurso && (
            <span className="text-[12px] text-piedra">Cargá lo que encuentres o marcá que no hay nada para cargar.</span>
          )}
        </div>
      </Tarjeta>

      <Tarjeta
        icono={CheckCircle2}
        titulo="2. Confirmación de cargos con el huésped"
        hu="HU 49 — el huésped revisa el detalle antes de pagar"
      >
        <label className={`flex items-start gap-3 text-[13.5px] ${verificacionCompleta && enCurso ? "cursor-pointer" : "opacity-50"}`}>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 cursor-pointer accent-pino"
            checked={cargosValidados}
            disabled={!verificacionCompleta || !enCurso}
            onChange={(e) => setCargosValidados(e.target.checked)}
          />
          <span>
            El huésped revisó el detalle y confirma los cargos por un total de <strong>{moneda(cuenta.totalAdeudado)}</strong>.
          </span>
        </label>
        {!verificacionCompleta && enCurso && (
          <p className="mt-2 text-[12px] text-piedra">Primero completá la verificación de la habitación.</p>
        )}
      </Tarjeta>

      <Tarjeta icono={Wallet} titulo="3. Pago" hu="HU 50 — se pueden combinar medios de pago">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variante="secundario"
              icono={Wallet}
              disabled={!enCurso || !cargosValidados || saldado}
              onClick={() => setModalPago(true)}
            >
              Registrar pago
            </Button>
            {saldado && <Badge variante="ok">Cuenta saldada</Badge>}
            {!cargosValidados && enCurso && !saldado && (
              <span className="text-[12px] text-piedra">Se habilita cuando el huésped confirma los cargos.</span>
            )}
          </div>
          {errorPago && (
            <div className="rounded-md bg-error-suave px-4 py-3">
              <p className="text-[12.5px] text-error-texto">{errorPago}</p>
            </div>
          )}
          <Table
            columnas={["Fecha", "Medios", "Total", "Estado", ""]}
            columnasDerecha={["Total"]}
            filas={pagos}
            vacio="Todavía no se registró ningún pago."
            renderFila={(p) => (
              <tr key={p.id} className="border-b border-borde last:border-0">
                <td className="px-3 py-2.5 text-[12.5px]">{formatearTimestamp(p.fecha)}</td>
                <td className="px-3 py-2.5 text-[12.5px]">
                  {p.medios.map((m) => (
                    <div key={m.id}>
                      {m.medioPago} {moneda(m.importe)}
                      {m.referencia && <span className="block text-[11.5px] text-piedra">{m.referencia}</span>}
                    </div>
                  ))}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs">
                  {moneda(p.medios.reduce((acc, m) => acc + Number(m.importe), 0))}
                </td>
                <td className="px-3 py-2.5">
                  {p.anulado ? <Badge variante="neutro">Anulado</Badge> : <Badge variante={ESTADO_PAGO_BADGE[p.estado]}>{p.estado}</Badge>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {enCurso && !p.anulado && (
                    <Button
                      variante="destructivo"
                      tamano="fila"
                      icono={Ban}
                      onClick={() => {
                        setMotivoAnulacion("");
                        setErrorPago("");
                        setAAnular(p);
                      }}
                    >
                      Anular
                    </Button>
                  )}
                </td>
              </tr>
            )}
          />
        </div>
      </Tarjeta>

      <Tarjeta icono={DoorClosed} titulo="4. Cierre del check-out" hu="HU 51 y 52 — reserva cerrada, habitaciones a limpieza y aviso a Housekeeping">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-piedra">
            Al confirmar, la reserva pasa a <strong className="text-tinta">Cerrada</strong>, cada habitación queda{" "}
            <strong className="text-tinta">en limpieza</strong> y se registra un aviso a Housekeeping. Si una habitación
            tiene una orden de mantenimiento abierta, sigue en mantenimiento y no se pisa. Solo se puede cerrar con la cuenta
            saldada.
          </p>
          {errorCierre && (
            <div className="rounded-md bg-error-suave px-4 py-3">
              <p className="text-[12.5px] text-error-texto">{errorCierre}</p>
            </div>
          )}
          {cerrada ? (
            <p className="flex items-center gap-2 text-[13px] font-medium text-pino">
              <CheckCircle2 size={16} /> Check-out confirmado.
            </p>
          ) : (
            <div>
              <Button variante="ok" icono={DoorClosed} disabled={!puedeCerrar} onClick={() => setConfirmando(true)}>
                Confirmar check-out
              </Button>
            </div>
          )}
        </div>
      </Tarjeta>

      {cerrada && (
        <Tarjeta icono={Receipt} titulo="5. Comprobante" hu="HU 53 y 55 — comprobante de la estadía">
          {comprobantesQuery.isLoading ? (
            <p className="text-sm text-piedra">Buscando comprobantes…</p>
          ) : comprobanteVigente ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variante="ok">Emitido</Badge>
              <CodigoClave>{comprobanteVigente.numero}</CodigoClave>
              <span className="font-mono text-[13px]">{moneda(comprobanteVigente.importeTotal)}</span>
              <span className="text-[12.5px] text-piedra">
                a nombre de {comprobanteVigente.razonSocialTercero ?? cuenta.huesped?.nombre ?? "el huésped"}
              </span>
              <Button
                variante="secundario"
                tamano="fila"
                onClick={() => navigate(`/comprobantes-estadia/${comprobanteVigente.id}`)}
              >
                Ver e imprimir
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[13px] text-piedra">La estadía todavía no tiene comprobante emitido.</p>
              <Button variante="ok" icono={Receipt} onClick={() => setModalComprobante(true)}>
                Emitir comprobante
              </Button>
            </div>
          )}
        </Tarjeta>
      )}

      {modalCargo && (
        <CargoVerificacionCheckoutModal
          reservaId={reservaId}
          consumosMinibar={consumosMinibar}
          onClose={() => setModalCargo(false)}
          onExito={alRegistrarCargo}
        />
      )}

      {modalPago && (
        <PagoEstadiaWizard
          reservaId={reservaId}
          saldo={cuenta.saldo}
          onClose={() => setModalPago(false)}
          onExito={(mensaje) => {
            setModalPago(false);
            mostrarToast(mensaje);
          }}
        />
      )}

      {modalComprobante && (
        <EmitirComprobanteModal
          reservaId={reservaId}
          total={cuenta.totalAdeudado}
          huesped={cuenta.huesped?.nombre}
          onClose={() => setModalComprobante(false)}
          onExito={(comprobante) => {
            setModalComprobante(false);
            mostrarToast(`Comprobante ${comprobante.numero} emitido.`);
          }}
        />
      )}

      <ConfirmDialog
        abierto={aAnular !== null}
        titulo="¿Anular el pago?"
        mensaje="El pago deja de contar para la cuenta y el saldo vuelve a subir. Queda registrado como anulado, con su motivo."
        textoConfirmar="Sí, anular pago"
        variante="destructivo"
        icono={Ban}
        cargando={mutacionAnular.isPending}
        onCancelar={() => {
          setAAnular(null);
          setMotivoAnulacion("");
        }}
        onConfirmar={() => {
          if (!motivoAnulacion.trim()) return;
          mutacionAnular.mutate();
        }}
      >
        <label className="flex flex-col gap-1.5 font-body text-sm">
          <span className="text-[12px] text-tinta/70">Motivo de la anulación *</span>
          <textarea
            rows={3}
            value={motivoAnulacion}
            maxLength={300}
            onChange={(e) => setMotivoAnulacion(e.target.value)}
            placeholder="Se cargó un importe o un medio equivocado, etc."
            className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40"
          />
          {!motivoAnulacion.trim() && <span className="text-[11.5px] text-piedra">Sin motivo no se puede confirmar.</span>}
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        abierto={confirmando}
        titulo="¿Confirmar el check-out?"
        mensaje={`Se cierra la reserva ${cuenta.codigoConfirmacion} de ${cuenta.huesped?.nombre ?? "el huésped"}. Esta acción no se puede deshacer.`}
        textoConfirmar="Sí, confirmar check-out"
        variante="ok"
        icono={DoorClosed}
        cargando={mutacionCierre.isPending}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() => mutacionCierre.mutate()}
      />

      <Toast mensaje={toast} />
    </div>
  );
}
