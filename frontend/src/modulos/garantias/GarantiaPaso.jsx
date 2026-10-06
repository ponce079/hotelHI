import { CreditCard, ShieldCheck } from "lucide-react";
import { Badge } from "../../componentes/Badge";
import { Cifra } from "../../componentes/Cifra";
import { Input } from "../../componentes/Input";
import { Select } from "../../componentes/Select";
import { TarjetaForm } from "./TarjetaForm";
import { MEDIO_PREPAGO_LABEL, MEDIOS_PREPAGO, TARJETAS_DE_PRUEBA, TIPO_GARANTIA } from "./garantias.constantes";

const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

// Paso "Garantía" del alta de reserva por mostrador (reemplaza a la seña).
//
// BAR (reembolsable): la tarjeta respalda la reserva, NO se cobra nada ahora.
// NRF (no reembolsable): se cobra el total al confirmar (preautoriza y
// captura en el backend); si el pago se rechaza, la reserva no se crea.
// Sin tarjeta: prepago por transferencia, débito o Mercado Pago.
//
// El componente solo muestra y edita; el estado y la validación viven en el
// wizard (garantias.constantes.js). Los datos de la tarjeta no salen de acá
// salvo en el envío final.
export function GarantiaPaso({ garantia, onChange, errores, mostrarErrores, plan, total, resumen, deshabilitado }) {
  const reembolsable = plan?.reembolsable === true;
  const esTarjeta = garantia.tipo === TIPO_GARANTIA.TARJETA;
  const err = (campo) => (mostrarErrores ? errores[campo] : undefined);

  function cambiarTipo(tipo) {
    // Al pasar a prepago de una tarifa no reembolsable, el importe es el total.
    onChange({
      ...garantia,
      tipo,
      importePrepago: tipo === TIPO_GARANTIA.PREPAGO && !reembolsable ? String(total) : garantia.importePrepago,
    });
  }
  const cambiarTarjeta = (campo, valor) => onChange({ ...garantia, tarjeta: { ...garantia.tarjeta, [campo]: valor } });

  return (
    <div className="flex flex-col gap-4 rounded-[18.4px] bg-white px-6 py-[22px]">
      <div className="rounded-lg border border-borde bg-hueso px-5 py-4 text-[13px]">
        <p className="font-semibold">Resumen</p>
        <p className="mt-1 text-piedra">{resumen}</p>
      </div>

      <div className="rounded-lg border border-pino-300 bg-pino-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-wide text-pino-700">
            {reembolsable ? "Se cobra al reservar" : "Se cobra al confirmar (tarifa no reembolsable)"}
          </p>
          <Badge variante={reembolsable ? "ok" : "error"}>{plan?.nombre ?? "—"}</Badge>
        </div>
        <Cifra tamano={26}>{FORMATO_MONEDA.format(reembolsable ? 0 : total)}</Cifra>
        <p className="mt-1 text-[12px] text-pino-700">
          {reembolsable
            ? "La tarjeta respalda la reserva y los consumos; no se cobra nada ahora. El cobro es uno solo, al final."
            : `Se cobra el total de la estadía (${FORMATO_MONEDA.format(total)}). Si el pago se rechaza, la reserva no se crea.`}
        </p>
      </div>

      <Select
        label="Cómo se garantiza la reserva *"
        value={garantia.tipo}
        disabled={deshabilitado}
        onChange={(e) => cambiarTipo(e.target.value)}
      >
        <option value={TIPO_GARANTIA.TARJETA}>Tarjeta de crédito</option>
        <option value={TIPO_GARANTIA.PREPAGO}>Prepago (sin tarjeta)</option>
      </Select>

      {esTarjeta ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-laton-300 bg-laton-100 px-5 py-4">
          <p className="flex items-center gap-2 font-heading text-[15px] font-semibold text-laton-700">
            <CreditCard size={16} /> Tarjeta de crédito (pasarela simulada)
          </p>
          <p className="text-[12px] text-laton-700">
            Simulación: no se cobra nada de verdad. Probá con {TARJETAS_DE_PRUEBA.aprobada}. Terminada en 0002 simula
            fondos insuficientes y en 0069, tarjeta vencida.
          </p>
          <TarjetaForm
            tarjeta={garantia.tarjeta}
            errores={errores}
            mostrarErrores={mostrarErrores}
            deshabilitado={deshabilitado}
            onChange={cambiarTarjeta}
          />
          <p className="flex items-center gap-1.5 text-[11.5px] text-laton-700">
            <ShieldCheck size={13} /> El número y el código de seguridad no se guardan: solo queda el token, la marca,
            los últimos 4 dígitos y el vencimiento.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Select
            label="Medio de pago *"
            value={garantia.medioPrepago}
            error={err("medioPrepago")}
            disabled={deshabilitado}
            onChange={(e) => onChange({ ...garantia, medioPrepago: e.target.value })}
          >
            <option value="">Elegí un medio…</option>
            {MEDIOS_PREPAGO.map((m) => (
              <option key={m} value={m}>
                {MEDIO_PREPAGO_LABEL[m]}
              </option>
            ))}
          </Select>
          <Input
            label="Importe prepagado *"
            value={garantia.importePrepago}
            error={err("importePrepago")}
            disabled={deshabilitado || !reembolsable}
            inputMode="decimal"
            autoComplete="off"
            onChange={(e) => onChange({ ...garantia, importePrepago: e.target.value.replace(/[^\d.]/g, "") })}
          />
          <p className="text-[12px] text-piedra">
            {reembolsable
              ? `Podés prepagar la primera noche o el total (hasta ${FORMATO_MONEDA.format(total)}). Se descuenta del saldo en el check-out.`
              : "Una tarifa no reembolsable sin tarjeta se prepaga por el total de la estadía."}
          </p>
          {garantia.medioPrepago === "Tarjeta débito" && (
            <Input
              label="Autorización de la tarjeta *"
              value={garantia.referenciaPrepago}
              error={err("referenciaPrepago")}
              disabled={deshabilitado}
              autoComplete="off"
              placeholder="Código de autorización del terminal"
              onChange={(e) => onChange({ ...garantia, referenciaPrepago: e.target.value })}
            />
          )}
        </div>
      )}
    </div>
  );
}
