import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../componentes/Modal';
import { Input } from '../../componentes/Input';
import { Select } from '../../componentes/Select';
import { Button } from '../../componentes/Button';
import { crearComprobante } from './comprobantes.api';
import { listarProveedoresConSaldo } from '../pagos/pagos.api';
import { listarOrdenesCompra } from '../ordenes-compra/ordenesCompra.api';
import { formatearMonto } from '../../lib/moneda';

const VACIO = {
  proveedorId: '',
  tipo: 'Factura',
  numero: '',
  fecha: new Date().toISOString().slice(0, 10),
  importeTotal: '',
  ordenCompraId: '',
};

export function ComprobanteModal({ onClose, onExito }) {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores'],
    queryFn: listarProveedoresConSaldo,
  });

  // El backend (crearComprobante) solo bloquea OCs "Anulada" — acá se
  // acota igual a "ya recibida" (Recibida o Recibida con diferencia) por
  // UX, pero sin ese filtro de más el combo antes excluía justo el caso
  // "Recibida con diferencia", donde más falta hace cargar el comprobante
  // para revisar el matching. listarOrdenesCompra solo filtra por un
  // `estado` exacto, así que se trae sin filtro y se filtran acá los dos
  // valores válidos (pageSize alto para no cortar el listado del proveedor).
  const { data: ordenes } = useQuery({
    queryKey: ['ordenes-compra', 'para-comprobante'],
    queryFn: () => listarOrdenesCompra({ pageSize: 500 }),
    enabled: !!form.proveedorId,
  });
  const ordenesElegibles = ordenes?.items?.filter(
    (o) => o.proveedorId === Number(form.proveedorId) && ['Recibida', 'Recibida con diferencia'].includes(o.estado)
  );

  const mutacion = useMutation({
    mutationFn: () =>
      crearComprobante({
        ...form,
        proveedorId: Number(form.proveedorId),
        importeTotal: parseFloat(form.importeTotal),
        ordenCompraId: form.ordenCompraId ? Number(form.ordenCompraId) : undefined,
      }),
    onSuccess: (creado) => {
      queryClient.invalidateQueries({ queryKey: ['comprobantes'] });
      // HU-72: si hay diferencia de matching se avisa ya en el mensaje de
      // éxito, para que quede claro que conviene abrir el detalle a revisar
      // el panel de matching con los 3 totales comparados.
      onExito(
        creado.matching?.tieneDiferencia
          ? `Comprobante ${creado.numero} creado — hay una diferencia de matching con la OC, revisá el detalle.`
          : 'Comprobante creado correctamente.'
      );
    },
    onError: (error) => {
      const msg = error?.response?.data?.error ?? 'Error al crear el comprobante.';
      if (error?.response?.status === 409) {
        setErrores({ numero: msg });
      } else {
        setErrores({ general: msg });
      }
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.proveedorId) return setErrores({ proveedorId: 'Seleccione un proveedor.' });
    if (!form.numero.trim()) return setErrores({ numero: 'Número obligatorio.' });
    if (!form.importeTotal || parseFloat(form.importeTotal) <= 0) {
      return setErrores({ importeTotal: 'Importe mayor a 0.' });
    }
    setErrores({});
    mutacion.mutate();
  }

  return (
    <Modal titulo="Nuevo comprobante" onClose={onClose} ancho="max-w-xl">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 px-6 py-5">
          {errores.general && <p className="text-sm text-error">{errores.general}</p>}

          <Select
            label="Proveedor *"
            value={form.proveedorId}
            onChange={(e) => setForm({ ...form, proveedorId: e.target.value, ordenCompraId: '' })}
            error={errores.proveedorId}
          >
            <option value="">Seleccionar...</option>
            {proveedores?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.razonSocial}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            {/* Solo Factura: una ND/NC ahora se crea únicamente desde
                NotaModal, vinculada obligatoriamente a su factura original
                (comprobanteRelacionadoId) — ver comprobantes.servicio.js. */}
            <Select label="Tipo *" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="Factura">Factura</option>
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
              {ordenesElegibles?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.numero} - ${formatearMonto(o.montoTotal)}
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Importe Total *"
            type="number"
            step="0.01"
            value={form.importeTotal}
            onChange={(e) => setForm({ ...form, importeTotal: e.target.value })}
            error={errores.importeTotal}
            placeholder="0.00"
          />
        </div>

        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? 'Guardando...' : 'Guardar comprobante'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
