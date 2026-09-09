import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../componentes/Modal';
import { Input } from '../../componentes/Input';
import { Select } from '../../componentes/Select';
import { Button } from '../../componentes/Button';
import { crearNota, listarComprobantes, obtenerComprobante } from './comprobantes.api';
import { formatearMonto } from '../../lib/moneda';
import { PATRON_NUMERO_COMPROBANTE } from './comprobantes.constantes';
import { NumeroComprobanteInput } from './NumeroComprobanteInput';

const VACIO = { comprobanteId: '', tipo: 'Nota de Crédito', numero: '', importeTotal: '', motivo: '' };

function formatoValido(numero) {
  return PATRON_NUMERO_COMPROBANTE.test((numero || '').trim());
}

// Mini-formulario de ajuste (punto 4 del rediseño de comprobantes): Crédito/
// Débito + motivo + monto sobre una factura ya cargada. Dos entradas:
//  - comprobanteId ausente: selector de factura visible (botón "Nueva nota"
//    en ComprobantesPage) — mismo rol que tenía NotaModal.
//  - comprobanteId presente: factura fija, sin selector (botón "Cargar nota
//    de crédito" en Recepciones, para el caso de NC tardía del punto 6).
export function AjusteModal({ comprobanteId = null, onClose, onExito }) {
  const [form, setForm] = useState({ ...VACIO, comprobanteId: comprobanteId ?? '' });
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const { data: facturas } = useQuery({
    queryKey: ['comprobantes', { soloSaldo: true, tipo: 'Factura' }],
    queryFn: () => listarComprobantes({ soloSaldo: true, tipo: 'Factura' }),
    enabled: !comprobanteId,
  });

  const { data: facturaPreseteada } = useQuery({
    queryKey: ['comprobantes', comprobanteId],
    queryFn: () => obtenerComprobante(comprobanteId),
    enabled: !!comprobanteId,
  });

  const facturaSeleccionada = comprobanteId
    ? facturaPreseteada
    : facturas?.find((f) => f.id === Number(form.comprobanteId));

  const mutacion = useMutation({
    mutationFn: () =>
      crearNota(form.comprobanteId, {
        tipo: form.tipo,
        numero: form.numero,
        importeTotal: parseFloat(form.importeTotal),
        motivo: form.motivo,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comprobantes'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] });
      onExito('Nota creada correctamente.');
    },
    onError: (error) => {
      const msg = error?.response?.data?.error ?? 'Error al crear la nota.';
      if (error?.response?.status === 409) {
        setErrores({ numero: msg });
      } else {
        setErrores({ general: msg });
      }
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.comprobanteId) return setErrores({ comprobanteId: 'Seleccione una factura.' });
    if (!form.numero.trim()) return setErrores({ numero: 'Número obligatorio.' });
    if (!formatoValido(form.numero)) {
      return setErrores({ numero: 'Formato esperado: letra-4 dígitos-8 dígitos (ej. A-0001-00012345).' });
    }
    if (!form.importeTotal || parseFloat(form.importeTotal) <= 0) {
      return setErrores({ importeTotal: 'Importe mayor a 0.' });
    }
    if (!form.motivo.trim()) return setErrores({ motivo: 'Motivo obligatorio.' });
    setErrores({});
    mutacion.mutate();
  }

  const saldoActual = facturaSeleccionada?.saldo ?? 0;
  const saldoResultante =
    form.tipo === 'Nota de Crédito'
      ? Math.max(0, saldoActual - (parseFloat(form.importeTotal) || 0))
      : saldoActual + (parseFloat(form.importeTotal) || 0);

  return (
    <Modal titulo="Nueva nota de débito / crédito" onClose={onClose} ancho="max-w-xl">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 px-6 py-5">
          {errores.general && <p className="text-sm text-error">{errores.general}</p>}

          {comprobanteId ? (
            <div className="rounded-md bg-hueso p-3 text-sm">
              <p>
                Factura: <strong>{facturaPreseteada?.numero ?? '...'}</strong>
              </p>
            </div>
          ) : (
            <Select
              label="Factura original *"
              value={form.comprobanteId}
              onChange={(e) => setForm({ ...form, comprobanteId: e.target.value })}
              error={errores.comprobanteId}
            >
              <option value="">Seleccionar factura...</option>
              {facturas?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.numero} - ${formatearMonto(f.saldo)} saldo
                </option>
              ))}
            </Select>
          )}

          {facturaSeleccionada && (
            <div className="rounded-md bg-hueso p-3 text-sm">
              <p>
                Saldo actual: <strong>$ {formatearMonto(saldoActual)}</strong>
              </p>
              <p>
                Saldo resultante: <strong>$ {formatearMonto(saldoResultante)}</strong>
              </p>
            </div>
          )}

          <Select label="Tipo *" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="Nota de Débito">Nota de Débito</option>
            <option value="Nota de Crédito">Nota de Crédito</option>
          </Select>

          <NumeroComprobanteInput
            label="Número *"
            value={form.numero}
            onChange={(numero) => setForm({ ...form, numero })}
            error={errores.numero}
          />

          <Input
            label="Importe total *"
            type="number"
            step="0.01"
            value={form.importeTotal}
            onChange={(e) => setForm({ ...form, importeTotal: e.target.value })}
            error={errores.importeTotal}
            placeholder="0.00"
          />

          <Input
            label="Motivo *"
            value={form.motivo}
            onChange={(e) => setForm({ ...form, motivo: e.target.value })}
            error={errores.motivo}
            placeholder="Ej. Devolución parcial, descuento..."
          />
        </div>

        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? 'Guardando...' : 'Guardar nota'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
