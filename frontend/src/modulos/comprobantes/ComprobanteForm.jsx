import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Input } from '../../componentes/Input';
import { Select } from '../../componentes/Select';
import { Button } from '../../componentes/Button';
import { Toast } from '../../componentes/Toast';
import { useToast } from '../../lib/useToast';
import { crearComprobante } from './comprobantes.api';
import { listarProveedoresConSaldo } from '../pagos/pagos.api';
import { listarOrdenesCompra } from '../ordenes-compra/ordenesCompra.api'; // si existe
import { formatearMonto } from '../../lib/moneda';

export function ComprobanteForm() {
  const navigate = useNavigate();
  const { toast, mostrarToast } = useToast();
  const [form, setForm] = useState({
    proveedorId: '',
    tipo: 'Factura',
    numero: '',
    fecha: new Date().toISOString().slice(0,10),
    importeNeto: '',
    alicuotaIva: 21,
    ordenCompraId: ''
  });
  const [errores, setErrores] = useState({});

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores'],
    queryFn: listarProveedoresConSaldo
  });

  const { data: ordenes } = useQuery({
    queryKey: ['ordenes-compra', { estado: 'Recibida' }], // solo OC recibidas
    queryFn: () => listarOrdenesCompra({ estado: 'Recibida' }),
    enabled: !!form.proveedorId
  });

  const mutacion = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        importeNeto: parseFloat(form.importeNeto),
        alicuotaIva: parseFloat(form.alicuotaIva),
        ordenCompraId: form.ordenCompraId || undefined
      };
      return crearComprobante(payload);
    },
    onSuccess: (creado) => {
      // HU-72: si hay diferencia de matching se avisa ya en el toast, y se
      // navega directo al detalle (no al listado) para que quede a la
      // vista el panel de matching con los 3 totales comparados.
      mostrarToast(
        creado.matching?.tieneDiferencia
          ? `Comprobante ${creado.numero} creado — hay una diferencia de matching con la OC, revisá el detalle.`
          : 'Comprobante creado correctamente.'
      );
      navigate(`/comprobantes/${creado.id}`);
    },
    onError: (error) => {
      const msg = error?.response?.data?.error ?? 'Error al crear el comprobante.';
      if (error?.response?.status === 409) {
        setErrores({ numero: msg });
      } else {
        setErrores({ general: msg });
      }
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.proveedorId) return setErrores({ proveedorId: 'Seleccione un proveedor.' });
    if (!form.numero.trim()) return setErrores({ numero: 'Número obligatorio.' });
    if (!form.importeNeto || parseFloat(form.importeNeto) <= 0) {
      return setErrores({ importeNeto: 'Importe neto mayor a 0.' });
    }
    setErrores({});
    mutacion.mutate();
  };

  // Cálculo automático de IVA y total
  const neto = parseFloat(form.importeNeto) || 0;
  const iva = parseFloat(form.alicuotaIva) || 0;
  const importeIva = Math.round(neto * (iva / 100) * 100) / 100;
  const total = neto + importeIva;

  return (
    <div className="flex flex-col gap-6">
      <Button variante="secundario" onClick={() => navigate('/comprobantes')} className="mb-2 text-xs">
        ← Volver
      </Button>
      <h1 className="font-heading text-[34px] font-semibold">Nuevo comprobante</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl rounded-[18.4px] bg-white px-6 py-[22px] space-y-4">
        {errores.general && <p className="text-sm text-error">{errores.general}</p>}

        <Select
          label="Proveedor *"
          value={form.proveedorId}
          onChange={(e) => setForm({ ...form, proveedorId: e.target.value, ordenCompraId: '' })}
          error={errores.proveedorId}
        >
          <option value="">Seleccionar...</option>
          {proveedores?.map(p => (
            <option key={p.id} value={p.id}>{p.razonSocial}</option>
          ))}
        </Select>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Tipo *"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
          >
            <option value="Factura">Factura</option>
            <option value="Nota de Débito">Nota de Débito</option>
            <option value="Nota de Crédito">Nota de Crédito</option>
          </Select>
          <Input
            label="Número *"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            error={errores.numero}
            placeholder="ej. FC-A 0001-00012345"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            type="date"
            label="Fecha *"
            value={form.fecha}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
          <Select
            label="Orden de Compra (opcional)"
            value={form.ordenCompraId}
            onChange={(e) => setForm({ ...form, ordenCompraId: e.target.value })}
          >
            <option value="">Sin OC</option>
            {ordenes?.filter(o => o.proveedorId === Number(form.proveedorId)).map(o => (
              <option key={o.id} value={o.id}>
                {o.numero} - ${formatearMonto(o.montoTotal)}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Importe Neto *"
            type="number"
            step="0.01"
            value={form.importeNeto}
            onChange={(e) => setForm({ ...form, importeNeto: e.target.value })}
            error={errores.importeNeto}
            placeholder="0.00"
          />
          <Select
            label="Alícuota IVA"
            value={form.alicuotaIva}
            onChange={(e) => setForm({ ...form, alicuotaIva: e.target.value })}
          >
            <option value="21">21%</option>
            <option value="10.5">10.5%</option>
            <option value="0">0%</option>
          </Select>
          <div>
            <label className="block text-xs text-tinta/70">IVA calculado</label>
            <div className="rounded-md border border-borde bg-hueso px-3 py-2 text-sm">
              $ {formatearMonto(importeIva)}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-tinta/70">Total (neto + IVA)</label>
          <div className="rounded-md border border-borde bg-pino-100 px-3 py-2 text-lg font-semibold text-pino">
            $ {formatearMonto(total)}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-2">
          <Button type="button" variante="secundario" onClick={() => navigate('/comprobantes')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? 'Guardando...' : 'Guardar comprobante'}
          </Button>
        </div>
      </form>

      <Toast mensaje={toast} />
    </div>
  );
}