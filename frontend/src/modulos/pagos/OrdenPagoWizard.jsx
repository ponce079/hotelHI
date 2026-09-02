import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "../../componentes/Input";
import { MoneyInput } from "../../componentes/MoneyInput";
import { Select } from "../../componentes/Select";
import { Button } from "../../componentes/Button";
import { Table } from "../../componentes/Table";
import { Cifra } from "../../componentes/Cifra";
import { MensajeModal } from "../../componentes/MensajeModal";
import { formatearFechaSolo } from "../../lib/fechas";
import { formatearMonto } from "../../lib/moneda";
import { listarProveedoresConSaldo, listarComprobantesPendientes, crearOrdenPago } from "./pagos.api";
import { MEDIOS_PAGO, BANCOS } from "./pagos.constantes";

const PASOS = ["Comprobantes a cancelar", "Importes a aplicar", "Medios de pago"];
// "seleccionados" no es un campo propio: se deriva de las claves de
// "montos" (ver más abajo) — un comprobante está elegido exactamente
// cuando tiene una entrada en montos, nunca hace falta guardar las dos
// cosas por separado ni mantenerlas sincronizadas a mano.
const VACIO = { paso: 1, proveedorId: "", montos: {}, medios: [] };

// Comparar en centavos (enteros), no floats — mismo criterio que el
// backend, para que el boton de confirmar no quede en un estado
// distinto al que despues valida el servidor.
function centavos(n) {
  return Math.round(Number(n || 0) * 100);
}
function nuevaClave() {
  return crypto.randomUUID();
}

export function OrdenPagoWizard({ onVolver, onExito }) {
  const [form, setForm] = useState(VACIO);
  const [errorGeneral, setErrorGeneral] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");
  const queryClient = useQueryClient();

  const { data: proveedores } = useQuery({ queryKey: ["pagos", "proveedores-con-saldo"], queryFn: listarProveedoresConSaldo });
  const { data: comprobantes } = useQuery({
    queryKey: ["pagos", "comprobantes-pendientes", form.proveedorId],
    queryFn: () => listarComprobantesPendientes(form.proveedorId),
    enabled: Boolean(form.proveedorId),
  });

  const seleccionados = Object.keys(form.montos).map(Number);
  const seleccionadosDatos = (comprobantes ?? []).filter((c) => seleccionados.includes(c.id));
  const totalAplicado = seleccionadosDatos.reduce((acc, c) => acc + (Number(form.montos[c.id]) || 0), 0);
  const totalMedios = form.medios.reduce((acc, m) => acc + (Number(m.importe) || 0), 0);
  const cuadra = form.medios.length > 0 && totalAplicado > 0 && centavos(totalMedios) === centavos(totalAplicado);

  const mutacion = useMutation({
    mutationFn: () =>
      crearOrdenPago({
        proveedorId: Number(form.proveedorId),
        aplicaciones: seleccionadosDatos.map((c) => ({ comprobanteId: c.id, importeAplicado: Number(form.montos[c.id]) })),
        medios: form.medios.map((m) => ({
          tipo: m.tipo,
          importe: Number(m.importe),
          numeroCheque: m.tipo === "Cheque" ? m.numeroCheque.trim() : undefined,
          banco: m.tipo === "Cheque" ? m.banco : undefined,
          fecha: m.tipo === "Cheque" ? m.fecha : undefined,
        })),
      }),
    onSuccess: (orden) => {
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
      setMensajeExito(`Orden de pago ${orden.numero} confirmada por $ ${formatearMonto(totalAplicado)}.`);
    },
    onError: (error) => {
      setErrorGeneral(error?.response?.data?.error ?? "No se pudo confirmar la orden de pago.");
    },
  });

  function elegirProveedor(proveedorId) {
    setForm({ ...VACIO, paso: 1, proveedorId });
  }

  function toggleComprobante(c) {
    setForm((f) => {
      const montos = { ...f.montos };
      if (c.id in montos) delete montos[c.id];
      else montos[c.id] = String(c.saldo);
      return { ...f, montos };
    });
  }

  function agregarMedio(tipo) {
    setForm((f) => ({
      ...f,
      medios: [...f.medios, { key: nuevaClave(), tipo, importe: "", numeroCheque: "", banco: "", fecha: "" }],
    }));
  }
  function actualizarMedio(key, campo, valor) {
    setForm((f) => ({ ...f, medios: f.medios.map((m) => (m.key === key ? { ...m, [campo]: valor } : m)) }));
  }
  function quitarMedio(key) {
    setForm((f) => ({ ...f, medios: f.medios.filter((m) => m.key !== key) }));
  }

  function irA(paso) {
    setErrorGeneral("");
    setForm((f) => ({ ...f, paso }));
  }

  function confirmar() {
    if (!cuadra) {
      setErrorGeneral("El total distribuido en medios de pago debe coincidir exacto con el total a pagar.");
      return;
    }
    const chequeIncompleto = form.medios.some((m) => m.tipo === "Cheque" && (!m.numeroCheque.trim() || !m.banco || !m.fecha));
    if (chequeIncompleto) {
      setErrorGeneral("Completá número, banco y fecha en todos los cheques.");
      return;
    }
    setErrorGeneral("");
    mutacion.mutate();
  }

  const puedeAvanzarPaso1 = seleccionados.length > 0;
  const puedeAvanzarPaso2 =
    seleccionadosDatos.length > 0 &&
    seleccionadosDatos.every((c) => {
      const monto = Number(form.montos[c.id]);
      return monto > 0 && centavos(monto) <= centavos(c.saldo);
    });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variante="secundario" onClick={onVolver} className="mb-2 text-xs">
          ← Volver
        </Button>
        <h1 className="font-heading text-[34px] font-semibold">Generar orden de pago</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 76 y 77 — el total aplicado y el distribuido en medios deben coincidir
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 rounded-[18.4px] bg-white px-6 py-4">
        {PASOS.map((label, i) => {
          const paso = i + 1;
          const activo = form.paso === paso;
          const hecho = form.paso > paso;
          return (
            <div key={label} className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full font-body text-xs font-semibold ${
                  activo ? "bg-pino text-hueso" : hecho ? "bg-pino-100 text-pino-700" : "bg-neutro-100 text-piedra"
                }`}
              >
                {hecho ? "✓" : paso}
              </span>
              <span className={`font-body text-[13px] ${activo ? "font-semibold text-tinta" : "text-piedra"}`}>{label}</span>
              {paso < PASOS.length && <span className="h-px w-8 bg-borde" />}
            </div>
          );
        })}
      </div>

      {form.paso === 1 && (
        <div className="flex flex-col gap-3.5 rounded-[18.4px] bg-white px-6 py-[22px]">
          <div className="max-w-sm">
            <Select label="Proveedor *" value={form.proveedorId} onChange={(e) => elegirProveedor(e.target.value)}>
              <option value="">Seleccionar…</option>
              {proveedores?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                </option>
              ))}
            </Select>
          </div>

          {form.proveedorId && (
            <Table
              columnas={["", "N° comprobante", "Fecha", "Saldo pendiente"]}
              columnasDerecha={["Saldo pendiente"]}
              filas={comprobantes ?? []}
              vacio="Este proveedor no tiene comprobantes con saldo pendiente."
              renderFila={(c) => {
                const marcado = seleccionados.includes(c.id);
                return (
                  <tr
                    key={c.id}
                    onClick={() => toggleComprobante(c)}
                    className={`cursor-pointer border-b border-borde last:border-0 ${marcado ? "bg-pino-100" : "hover:bg-hueso"}`}
                  >
                    <td className="px-2 py-2.5">
                      <span
                        className={`flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border text-[11px] ${
                          marcado ? "border-pino bg-pino text-hueso" : "border-borde bg-transparent"
                        }`}
                      >
                        {marcado ? "✓" : ""}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[12.5px]">{c.numero}</td>
                    <td className="px-2 py-2.5 text-[12.5px]">{formatearFechaSolo(c.fecha)}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-error-texto">$ {formatearMonto(c.saldo)}</td>
                  </tr>
                );
              }}
            />
          )}
        </div>
      )}

      {form.paso === 2 && (
        <div className="flex flex-col gap-1 rounded-[18.4px] bg-white px-6 py-[22px]">
          {seleccionadosDatos.map((c) => {
            const monto = form.montos[c.id] ?? "";
            const excede = Number(monto) > 0 && centavos(Number(monto)) > centavos(c.saldo);
            const vacio = !(Number(monto) > 0);
            return (
              <div key={c.id} className="flex items-start gap-4 border-t border-borde py-3.5 first:border-0">
                <div className="flex-1 pt-5">
                  <div className="font-body text-[13.5px] font-medium">{c.numero}</div>
                  <div className="font-body text-[11.5px] text-piedra">Saldo pendiente $ {formatearMonto(c.saldo)}</div>
                </div>
                <div className="w-[220px]">
                  <MoneyInput
                    label={`Aplicar (máx. $ ${formatearMonto(c.saldo)})`}
                    value={monto}
                    onChange={(valor) => setForm((f) => ({ ...f, montos: { ...f.montos, [c.id]: valor } }))}
                    error={excede ? "Supera el saldo pendiente." : vacio ? "Ingresá un importe mayor a cero." : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form.paso === 3 && (
        <div className="flex flex-col gap-3.5 rounded-[18.4px] bg-white px-6 py-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="m-0 font-heading text-base font-semibold">Medios de pago</h4>
            <div className="flex gap-2">
              {MEDIOS_PAGO.map((tipo) => (
                <Button key={tipo} variante="alta" tamano="fila" onClick={() => agregarMedio(tipo)}>
                  + {tipo}
                </Button>
              ))}
            </div>
          </div>

          {form.medios.length === 0 && (
            <p className="rounded-[14px] border border-dashed border-borde px-4 py-4 text-center text-xs text-piedra">
              Agregá al menos un medio de pago para distribuir el total.
            </p>
          )}

          {form.medios.map((m) => {
            const esCheque = m.tipo === "Cheque";
            return (
              <div
                key={m.key}
                className={`flex flex-col gap-2.5 rounded-[14px] border px-4 py-3.5 ${
                  esCheque ? "border-laton-300 bg-laton-100" : "border-borde"
                }`}
              >
                <div className="flex flex-wrap items-end gap-3">
                  {/* El medio ya se eligió al agregar esta fila (botones +
                      de arriba) — no es un combo editable a propósito: para
                      cambiarlo se quita la fila y se agrega la correcta. */}
                  <div className="flex w-[160px] flex-col gap-1.5">
                    <span className="font-body text-sm text-[12px] text-tinta/70">Medio</span>
                    <p className="rounded-md border border-borde bg-white px-3 py-2 text-[13.5px] font-medium text-tinta">{m.tipo}</p>
                  </div>
                  <div className="w-[170px]">
                    <MoneyInput
                      label="Importe"
                      value={m.importe}
                      onChange={(valor) => actualizarMedio(m.key, "importe", valor)}
                    />
                  </div>
                  <Button variante="secundario" tamano="fila" onClick={() => quitarMedio(m.key)} className="ml-auto">
                    Quitar
                  </Button>
                </div>
                {esCheque && (
                  <div className="flex flex-wrap gap-3 border-t border-laton-300 pt-3">
                    <div className="w-[160px]">
                      <Input
                        label="N° de cheque *"
                        value={m.numeroCheque}
                        onChange={(e) => actualizarMedio(m.key, "numeroCheque", e.target.value)}
                        placeholder="00431178"
                      />
                    </div>
                    <div className="w-[200px]">
                      <Select label="Banco *" value={m.banco} onChange={(e) => actualizarMedio(m.key, "banco", e.target.value)}>
                        <option value="">Seleccionar…</option>
                        {BANCOS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="w-[160px]">
                      <Input
                        type="date"
                        label="Fecha de pago *"
                        value={m.fecha}
                        onChange={(e) => actualizarMedio(m.key, "fecha", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {errorGeneral && (
        <div className="rounded-[26px] bg-error-suave px-[22px] py-4">
          <div className="mb-1.5 text-[13px] font-semibold text-error-texto">No se puede continuar:</div>
          <p className="m-0 text-[12.5px] text-error-texto">{errorGeneral}</p>
        </div>
      )}

      <div className="sticky bottom-4 flex flex-wrap items-center gap-5 rounded-[18.4px] border border-borde bg-white px-6 py-4 shadow-[0_1px_2px_rgba(46,43,37,0.14)]">
        <div>
          <div className="text-[11px] tracking-wide text-tinta/45 uppercase">Total a pagar</div>
          <Cifra tamano={21}>$ {formatearMonto(totalAplicado)}</Cifra>
        </div>
        <span className="text-lg text-tinta/25">—</span>
        <div>
          <div className="text-[11px] tracking-wide text-tinta/45 uppercase">Total distribuido</div>
          <Cifra tamano={21} className={form.paso < 3 ? "text-tinta/45" : cuadra ? "text-pino" : "text-laton-oscuro"}>
            $ {formatearMonto(totalMedios)}
          </Cifra>
        </div>
        <p className="m-0 flex-1 text-[12.5px] text-tinta/60">
          {form.paso < 3
            ? "Los medios de pago se cargan en el paso 3; el total distribuido tendrá que igualar al total a pagar."
            : cuadra
              ? "✓ Los medios cubren exactamente el total a pagar."
              : "Todavía no coincide con el total a pagar."}
        </p>
        <div className="flex gap-2.5">
          <Button variante="secundario" onClick={onVolver}>
            Cancelar
          </Button>
          {form.paso > 1 && (
            <Button variante="secundario" onClick={() => irA(form.paso - 1)}>
              ← Atrás
            </Button>
          )}
          {form.paso < 3 && (
            <Button
              variante="ok"
              disabled={form.paso === 1 ? !puedeAvanzarPaso1 : !puedeAvanzarPaso2}
              onClick={() => irA(form.paso + 1)}
            >
              Siguiente →
            </Button>
          )}
          {form.paso === 3 && (
            <Button variante="ok" disabled={!cuadra || mutacion.isPending} onClick={confirmar}>
              {mutacion.isPending ? "Confirmando…" : "Confirmar orden de pago"}
            </Button>
          )}
        </div>
      </div>

      <MensajeModal
        mensaje={mensajeExito}
        onCerrar={() => {
          setMensajeExito("");
          onExito();
        }}
      />
    </div>
  );
}
