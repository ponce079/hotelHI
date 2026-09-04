import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Input } from '../../componentes/Input';
import { Select } from '../../componentes/Select';
import { Button } from '../../componentes/Button';
import { Toast } from '../../componentes/Toast';
import { useToast } from '../../lib/useToast';
import { crearNota, listarComprobantes } from './comprobantes.api';
import { formatearMonto } from '../../lib/moneda';

export function NotaForm() {
  const navigate = useNavigate();
  const { toast, mostrarToast } = useToast();
  const [form, setForm] = useState({
    comprobanteId: '',
    tipo: 'Nota de Crédito',
    numero: '',
    importeTotal: '',
    motivo: ''
  });
  const [errores, setErrores] = useState({});
  const [saldoActual, setSaldoActual] = useState(0);

  const { data: facturas } = useQuery({
    queryKey: ['comprobantes', { soloSaldo: true, tipo: 'Factura' }],
    queryFn: () => listarComprobantes({ soloSaldo: true, tipo: 'Factura' })
  });

  const mutacion = useMutation({
    mutationFn: () => crearNota(form.comprobanteId, {
      tipo: form.tipo,
      numero: form.numero,
      importeTotal: parseFloat(form.importeTotal),
      motivo: form.motivo
    }),
    onSuccess: () => {
      mostrarToast('Nota creada correctamente.');
      navigate('/comprobantes');
    },
    onError: (error) => {
      const msg = error?.response?.data?.error ?? 'Error al crear la nota.';
      if (error?.response?.status === 409) {
        setErrores({ numero: msg });
      } else {
        setErrores({ general: msg });
      }
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.comprobanteId) return setErrores({ comprobanteId: 'Seleccione una factura.' });
    if (!form.numero.trim()) return setErrores({ numero: 'Número obligatorio.' });
    if (!form.importeTotal || parseFloat(form.importeTotal) <= 0) {
      return setErrores({ importeTotal: 'Importe mayor a 0.' });
    }
    if (!form.motivo.trim()) return setErrores({ motivo: 'Motivo obligatorio.' });
    setErrores({});
    mutacion.mutate();
  };

  const facturaSeleccionada = facturas?.find(f => f.id === Number(form.comprobanteId));
  useEffect(() => {
    if (facturaSeleccionada) {
      setSaldoActual(facturaSeleccionada.saldo);
    }
  }, [facturaSeleccionada]);

  const saldoResultante = form.tipo === 'Nota de Crédito'
    ? Math.max(0, saldoActual - (parseFloat(form.importeTotal) || 0))
    : saldoActual + (parseFloat(form.importeTotal) || 0);

  return (
    <div className="flex flex-col gap-6">
      <Button variante="secundario" onClick={() => navigate('/comprobantes')} className="mb-2 text-xs">
        ← Volver
      </Button>
      <h1 className="font-heading text-[34px] font-semibold">Nueva nota de débito / crédito</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl rounded-[18.4px] bg-white px-6 py-[22px] space-y-4">
        {errores.general && <p className="text-sm text-error">{errores.general}</p>}

        <Select
          label="Factura original *"
          value={form.comprobanteId}
          onChange={(e) => setForm({ ...form, comprobanteId: e.target.value })}
          error={errores.comprobanteId}
        >
          <option value="">Seleccionar factura...</option>
          {facturas?.map(f => (
            <option key={f.id} value={f.id}>
              {f.numero} - ${formatearMonto(f.saldo)} saldo
            </option>
          ))}
        </Select>

        {facturaSeleccionada && (
          <div className="rounded-md bg-hueso p-3 text-sm">
            <p>Saldo actual: <strong>$ {formatearMonto(saldoActual)}</strong></p>
            <p>Saldo resultante: <strong>$ {formatearMonto(saldoResultante)}</strong></p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Tipo *"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          >
            <option value="Nota de Débito">Nota de Débito</option>
            <option value="Nota de Crédito">Nota de Crédito</option>
          </Select>
          <Input
            label="Número *"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            error={errores.numero}
          />
        </div>

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

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variante="secundario" onClick={() => navigate('/comprobantes')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? 'Guardando...' : 'Guardar nota'}
          </Button>
        </div>
      </form>

      <Toast mensaje={toast} />
    </div>
  );
}