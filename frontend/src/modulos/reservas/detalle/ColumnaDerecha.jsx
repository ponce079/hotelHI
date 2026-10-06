import { useQuery } from "@tanstack/react-query";
import { Badge } from "../../../componentes/Badge";
import { formatearFechaHora } from "../../../lib/fechas";
import { formatearPrecio } from "../../../lib/moneda";
import { CONCEPTO_GARANTIA } from "../../pagos-estadia/pagoEstadia.constantes";
import { ESTADO_RESERVA } from "../reservas.constantes";
import { esDatoWebValido, obtenerDatosReservaWeb, textoHoraLlegada } from "./reservaWeb.api";

const importe = (pago) => pago.medios.reduce((acc, m) => acc + Number(m.importe), 0);

function Tarjeta({ titulo, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-borde bg-white p-4 ${className}`}>
      <h3 className="mb-2 font-heading text-[17px] font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

function Fila({ etiqueta, valor, fuerte = false }) {
  return (
    <div className={`flex justify-between gap-2.5 py-1 text-sm ${fuerte ? "mt-1 border-t border-borde pt-2 font-semibold" : ""}`}>
      <span className={fuerte ? "" : "text-piedra"}>{etiqueta}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

function Lista({ filas }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {filas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-tinta/55">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// Resumen: sale del mismo cálculo del check-out (GET /check-out/:id/cuenta), así el saldo coincide con
// el de esa pantalla. Sin permiso para verlo (gerente), solo se muestra el alojamiento reservado.
function ResumenDeCuenta({ reserva, cuenta, garantiaVigente }) {
  if (reserva.estado === ESTADO_RESERVA.CANCELADA || reserva.estado === ESTADO_RESERVA.NO_SHOW)
    return (
      <p className="text-sm text-piedra">
        {reserva.estado === ESTADO_RESERVA.NO_SHOW ? "Reserva no-show" : "Reserva cancelada"}: no hay cargos de
        alojamiento.
      </p>
    );
  if (!cuenta)
    return (
      <>
        <Fila etiqueta={`Alojamiento · ${reserva.noches} noche${reserva.noches === 1 ? "" : "s"}`} valor={formatearPrecio(reserva.totalEstimadoAlojamiento)} />
        <p className="mt-1 text-[12.5px] text-piedra">El saldo y los pagos los ve recepción.</p>
      </>
    );
  const { subtotales, totalAdeudado, totalPagado, saldo } = cuenta;
  return (
    <>
      <Fila etiqueta={`Alojamiento · ${cuenta.noches} noche${cuenta.noches === 1 ? "" : "s"}`} valor={formatearPrecio(subtotales.alojamiento)} />
      <Fila etiqueta="Consumos" valor={formatearPrecio(subtotales.serviciosAdicionales)} />
      {subtotales.verificacion > 0 && <Fila etiqueta="Revisión de la habitación" valor={formatearPrecio(subtotales.verificacion)} />}
      <Fila etiqueta="Total" valor={formatearPrecio(totalAdeudado)} fuerte />
      <Fila etiqueta="Pagos" valor={formatearPrecio(-totalPagado)} />
      {garantiaVigente && (
        <p className="text-[12px] text-piedra">
          Incluye la garantía de {formatearPrecio(importe(garantiaVigente))}: hoy el check-out la resta del saldo.
        </p>
      )}
      <div className={`mt-2.5 rounded-lg border p-3 ${saldo === 0 ? "border-pino-200 bg-pino-100" : "border-pino-100 bg-pino-100/60"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/55">
          {saldo === 0 ? "Saldo" : reserva.estado === ESTADO_RESERVA.CONFIRMADA ? "Saldo a cobrar en la estadía" : "Saldo a cobrar"}
        </p>
        <p className="font-heading text-[28px] font-semibold leading-tight text-pino tabular-nums">
          {saldo === 0 ? `✓ ${formatearPrecio(0)}` : formatearPrecio(saldo)}
        </p>
      </div>
    </>
  );
}

// Garantía para consumos (no es un pago de la cuenta). El check-out hoy no registra si se liberó o se
// aplicó, así que no se afirma: se muestra lo que se tomó y su medio.
function CajaGarantia({ reserva, garantias }) {
  const vigente = garantias.find((g) => !g.anulado);
  const anulada = !vigente && garantias.find((g) => g.anulado);
  if (vigente) {
    const efectivo = vigente.medios.every((m) => m.medioPago === "Efectivo");
    const medios = vigente.medios.map((m) => [m.medioPago, m.referencia].filter(Boolean).join(" · ")).join(" + ");
    return (
      <>
        <p>
          <span className="font-heading text-xl font-semibold tabular-nums">{formatearPrecio(importe(vigente))}</span>{" "}
          <Badge variante="ok">{efectivo ? "Depósito" : "Preautorización"}</Badge>
        </p>
        <p className="mt-1.5 text-[13px] text-piedra">{medios}</p>
        {reserva.estado === ESTADO_RESERVA.CERRADA && (
          <p className="mt-1.5 text-[12px] text-piedra">El check-out no registra si se liberó o se aplicó.</p>
        )}
      </>
    );
  }
  if (anulada)
    return (
      <>
        <Badge variante="neutro">Anulada</Badge>
        <p className="mt-1.5 text-[13px] text-piedra">
          {formatearPrecio(importe(anulada))}
          {anulada.motivoAnulacion ? ` · ${anulada.motivoAnulacion}` : ""}
        </p>
      </>
    );
  if (reserva.estado === ESTADO_RESERVA.CONFIRMADA)
    return (
      <>
        <Badge variante="neutro">Se toma al ingresar</Badge>
        <p className="mt-1.5 text-[13px] text-piedra">Preautorización con tarjeta, o depósito en efectivo.</p>
      </>
    );
  return <p className="text-[13px] text-piedra">No se registró garantía.</p>;
}

// Condiciones de cancelación del plan, en texto, y qué pasaría hoy si se cancela (solo Confirmada).
function condiciones(plan, penalidad) {
  const partes = [];
  if (plan.reembolsable) {
    partes.push(
      penalidad?.limiteSinCargo
        ? `Cancelación sin cargo hasta el ${formatearFechaHora(penalidad.limiteSinCargo)}.`
        : `Cancelación sin cargo hasta ${plan.horasCancelacionSinCargo} h antes del ingreso.`,
    );
  } else {
    partes.push("No reembolsable.");
  }
  if (plan.penalidadNoShow)
    partes.push(
      `No-show: se cobra ${plan.penalidadNoShow === "TOTAL_ESTADIA" ? "la estadía completa" : "la primera noche"}.`,
    );
  return partes.join(" ");
}

// Reserva hecha desde el e-commerce: contacto, llegada, solicitudes, titular de
// la tarjeta y consentimiento (la garantía misma se muestra una sola vez, arriba) (GET /api/reservas-web/:id, con sesión). En una reserva del
// mostrador (404) o si la consulta falla, no se muestra nada.
function ReservaWeb({ reservaId }) {
  const consulta = useQuery({
    queryKey: ["reservas-web", reservaId],
    queryFn: () => obtenerDatosReservaWeb(reservaId),
    retry: false,
    enabled: Boolean(reservaId),
  });
  const datos = consulta.data;
  if (!esDatoWebValido(datos)) return null;
  return (
    <Tarjeta titulo="Reserva web">
      <Lista
        filas={[
          ["Email", datos.emailContacto],
          ["Teléfono", datos.telefonoContacto || "—"],
          ["Llegada estimada", textoHoraLlegada(datos.horaEstimadaLlegada)],
          ["Solicitudes", datos.solicitudesEspeciales || "Sin solicitudes"],
          ["Titular de la tarjeta", datos.tarjetaTitular || "—"],
          ["Términos", `Aceptó términos v${datos.versionPoliticas} el ${formatearFechaHora(datos.aceptaPoliticasEn)}`],
          ["Acepta comunicaciones", datos.aceptaComunicaciones ? "sí" : "no"],
        ]}
      />
    </Tarjeta>
  );
}

export function ColumnaDerecha({ reserva, cuenta, pagos, penalidad }) {
  const plan = reserva.planTarifario;
  const garantias = (pagos?.pagos ?? []).filter((p) => p.concepto === CONCEPTO_GARANTIA);
  const garantiaVigente = garantias.find((g) => !g.anulado);
  const confirmacion = (reserva.notificaciones ?? [])
    .filter((n) => n.canal !== "Interno")
    .map((n) => n.fechaEnvio)
    .sort()[0];
  const huesped = reserva.huesped;
  return (
    <aside className="flex flex-col gap-3.5 lg:sticky lg:top-4" aria-label="Resumen de la reserva">
      <Tarjeta titulo="Resumen de cuenta">
        <ResumenDeCuenta reserva={reserva} cuenta={cuenta} garantiaVigente={garantiaVigente} />
      </Tarjeta>
      {reserva.estado !== ESTADO_RESERVA.CANCELADA && reserva.estado !== ESTADO_RESERVA.NO_SHOW && pagos && (
        <section className="rounded-lg border border-dashed border-neutro-300 bg-white/60 p-4">
          <h3 className="mb-2 font-heading text-[17px] font-semibold">Garantía para consumos</h3>
          <CajaGarantia reserva={reserva} garantias={garantias} />
        </section>
      )}
      {plan && (
        <Tarjeta titulo="Tarifa y condiciones">
          <Lista
            filas={[
              ["Tarifa", plan.nombre],
              ["Condiciones", condiciones(plan, penalidad)],
              ...(penalidad
                ? [["Si se cancela hoy", penalidad.aplica ? `${penalidad.mensaje} ${formatearPrecio(penalidad.monto).replace("$ ", "$ ")}` : penalidad.mensaje]]
                : []),
              ["Precio", "Congelado al confirmar, noche por noche. IVA incluido."],
            ]}
          />
        </Tarjeta>
      )}
      <Tarjeta titulo="Quién reservó">
        <Lista
          filas={[
            ["Nombre", huesped?.nombre ?? "—"],
            ["Documento", huesped ? `${huesped.tipoDocumento} ${huesped.numeroDocumento}` : "—"],
            ["Contacto", huesped?.contacto || "—"],
            ...(huesped?.preferencias ? [["Preferencias", huesped.preferencias]] : []),
            ["Confirmación", confirmacion ? `Enviada el ${formatearFechaHora(confirmacion)}` : "Sin enviar"],
          ]}
        />
      </Tarjeta>
      <ReservaWeb reservaId={reserva.id} />
    </aside>
  );
}
