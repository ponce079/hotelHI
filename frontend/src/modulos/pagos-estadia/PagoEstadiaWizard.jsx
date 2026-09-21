import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CreditCard, Plus, Trash2, X } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Button } from "../../componentes/Button";
import { Cifra } from "../../componentes/Cifra";
import { Modal } from "../../componentes/Modal";
import { MoneyInput } from "../../componentes/MoneyInput";
import { formatearMonto } from "../../lib/moneda";
import { registrarPagoEstadia } from "./pagoEstadia.api";
import { MEDIOS_CON_TARJETA, MEDIOS_PAGO_ESTADIA } from "./pagoEstadia.constantes";
import { TarjetaSimuladaPanel } from "./TarjetaSimuladaPanel";

// Comparar en centavos (enteros), no floats — mismo criterio que el
// backend, para que el botón de confirmar no quede en un estado distinto
// al que después valida el servidor.
function centavos(n) {
  return Math.round(Number(n || 0) * 100);
}
function nuevaClave() {
  return crypto.randomUUID();
}

// HU-50 — pago de la estadía con uno o varios medios combinados.
//
// Es un solo paso a propósito (a diferencia de OrdenPagoWizard, no hay
// "elegir comprobantes a cancelar": hay un único saldo fijo, el de la
// cuenta consolidada). El pago puede ser parcial — el backend lo registra
// como "Parcial" — pero el check-out solo se cierra con el saldo en cero.
//
// Los medios con tarjeta se cobran pasando por la terminal SIMULADA
// (TarjetaSimuladaPanel): hasta que no queda "Autorizada" no se puede
// confirmar el pago. Al confirmar viaja solo la `referencia` de la
// autorización, nunca los datos de la tarjeta.
//
// `saldo` es lo que falta cobrar según la cuenta consolidada.
export function PagoEstadiaWizard({ reservaId, saldo, onClose, onExito }) {
  const queryClient = useQueryClient();
  const [medios, setMedios] = useState([]);
  const [error, setError] = useState("");

  const totalMedios = medios.reduce((acc, m) => acc + (Number(m.importe) || 0), 0);
  const restante = (centavos(saldo) - centavos(totalMedios)) / 100;
  const excede = centavos(totalMedios) > centavos(saldo);
  const hayImporteInvalido = medios.some((m) => !(Number(m.importe) > 0));
  const hayTarjetaSinAutorizar = medios.some((m) => MEDIOS_CON_TARJETA.includes(m.tipo) && !m.autorizada);
  const puedeConfirmar =
    medios.length > 0 && !hayImporteInvalido && !excede && !hayTarjetaSinAutorizar && centavos(totalMedios) > 0;

  const mutacion = useMutation({
    mutationFn: () =>
      registrarPagoEstadia({
        reservaId: Number(reservaId),
        medios: medios.map((m) => ({
          tipo: m.tipo,
          importe: Number(m.importe),
          referencia: m.referencia ?? undefined,
        })),
      }),
    onSuccess: (pago) => {
      queryClient.invalidateQueries({ queryKey: ["check-out"] });
      onExito(
        pago.estado === "Pagado"
          ? `Pago registrado: la cuenta quedó saldada ($ ${formatearMonto(totalMedios)}).`
          : `Pago parcial registrado ($ ${formatearMonto(totalMedios)}).`
      );
    },
    onError: (err) => {
      setError(err?.response?.data?.error ?? "No se pudo registrar el pago.");
    },
  });

  // Al agregar un medio se precarga lo que todavía falta cubrir: en el caso
  // más común (un solo medio) alcanza con elegirlo y confirmar.
  function agregarMedio(tipo) {
    const faltante = Math.max(0, restante);
    setMedios((lista) => [
      ...lista,
      {
        key: nuevaClave(),
        tipo,
        importe: faltante > 0 ? String(faltante) : "",
        autorizada: false,
        referencia: null,
        panelAbierto: false,
      },
    ]);
  }
  function actualizar(key, cambios) {
    setMedios((lista) => lista.map((m) => (m.key === key ? { ...m, ...cambios } : m)));
  }
  function quitarMedio(key) {
    setMedios((lista) => lista.filter((m) => m.key !== key));
  }

  function confirmar() {
    if (!puedeConfirmar) {
      setError(
        excede
          ? "El total de los medios supera el saldo pendiente de la cuenta."
          : hayTarjetaSinAutorizar
            ? "Autorizá los pagos con tarjeta antes de confirmar."
            : "Agregá al menos un medio de pago y completá su importe."
      );
      return;
    }
    setError("");
    mutacion.mutate();
  }

  return (
    <Modal
      titulo="Registrar pago de la estadía"
      subtitulo="HU 50 — se pueden combinar varios medios de pago"
      onClose={mutacion.isPending ? () => {} : onClose}
      ancho="max-w-2xl"
    >
      <div className="flex flex-col gap-5 px-6 py-5">
        <div className="flex flex-col gap-2.5">
          <span className="font-body text-[12px] text-tinta/70">Agregar medio de pago</span>
          <div className="flex flex-wrap gap-2">
            {MEDIOS_PAGO_ESTADIA.map((tipo) => (
              <Button key={tipo} variante="secundario" tamano="fila" icono={Plus} onClick={() => agregarMedio(tipo)}>
                {tipo}
              </Button>
            ))}
          </div>
        </div>

        {medios.length === 0 && (
          <p className="rounded-[14px] border border-dashed border-borde px-4 py-4 text-center text-xs text-piedra">
            Elegí al menos un medio de pago para cobrar.
          </p>
        )}

        {medios.map((m) => {
          const conTarjeta = MEDIOS_CON_TARJETA.includes(m.tipo);
          return (
            <div key={m.key} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-borde px-4 py-3.5">
                <div className="flex w-40 flex-col gap-1.5">
                  <span className="font-body text-[12px] text-tinta/70">Medio</span>
                  <p className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] font-medium text-tinta">
                    {m.tipo}
                  </p>
                </div>

                {conTarjeta && m.autorizada ? (
                  <div className="flex min-w-50 flex-1 flex-col gap-1.5">
                    <span className="font-body text-[12px] text-tinta/70">Importe autorizado</span>
                    <div className="flex flex-wrap items-center gap-2.5 py-1.5">
                      <span className="font-mono text-[14px] font-semibold text-tinta">$ {formatearMonto(m.importe)}</span>
                      <Badge variante="ok">Autorizada</Badge>
                      <span className="text-[12px] text-piedra">{m.referencia}</span>
                    </div>
                  </div>
                ) : (
                  <div className="w-47.5">
                    <MoneyInput label="Importe" value={m.importe} onChange={(valor) => actualizar(m.key, { importe: valor })} />
                  </div>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {conTarjeta && !m.autorizada && (
                    <Button
                      variante="ok"
                      tamano="fila"
                      icono={CreditCard}
                      disabled={!(Number(m.importe) > 0) || m.panelAbierto}
                      onClick={() => actualizar(m.key, { panelAbierto: true })}
                    >
                      Cobrar con tarjeta
                    </Button>
                  )}
                  <Button variante="secundario" tamano="fila" icono={Trash2} onClick={() => quitarMedio(m.key)}>
                    Quitar
                  </Button>
                </div>
              </div>

              {conTarjeta && !m.autorizada && m.panelAbierto && (
                <TarjetaSimuladaPanel
                  tipo={m.tipo}
                  importe={Number(m.importe)}
                  onCancelar={() => actualizar(m.key, { panelAbierto: false })}
                  onAutorizada={(referencia) => actualizar(m.key, { autorizada: true, referencia, panelAbierto: false })}
                />
              )}
            </div>
          );
        })}

        {error && (
          <div className="rounded-md bg-error-suave px-4 py-3">
            <p className="text-[12.5px] text-error-texto">{error}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-5 rounded-[18.4px] border border-borde bg-white px-6 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-tinta/45">Saldo de la cuenta</div>
            <Cifra tamano={21}>$ {formatearMonto(saldo)}</Cifra>
          </div>
          <span className="text-lg text-tinta/25">—</span>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-tinta/45">A cobrar ahora</div>
            <Cifra tamano={21} className={excede ? "text-error-texto" : totalMedios > 0 ? "text-pino" : "text-tinta/45"}>
              $ {formatearMonto(totalMedios)}
            </Cifra>
          </div>
          <p className="m-0 min-w-50 flex-1 text-[12.5px] text-tinta/60">
            {excede
              ? "El total supera el saldo pendiente."
              : totalMedios === 0
                ? "Todavía no hay importes cargados."
                : hayTarjetaSinAutorizar
                  ? "Falta autorizar el cobro con tarjeta."
                  : centavos(restante) === 0
                    ? "✓ Los medios cubren exactamente el saldo: la cuenta queda saldada."
                    : `Queda un saldo de $ ${formatearMonto(restante)} después de este pago (pago parcial).`}
          </p>
        </div>

        <div className="flex justify-end gap-2.5">
          <Button variante="secundario" icono={X} disabled={mutacion.isPending} onClick={onClose}>
            Cancelar
          </Button>
          <Button variante="ok" icono={Check} cargando={mutacion.isPending} disabled={!puedeConfirmar} onClick={confirmar}>
            {mutacion.isPending ? "Registrando…" : "Confirmar pago"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
