import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Plus } from 'lucide-react';
import { Table } from '../../componentes/Table';
import { Badge } from '../../componentes/Badge';
import { Button } from '../../componentes/Button';
import { Input } from '../../componentes/Input';
import { Select } from '../../componentes/Select';
import { FilterBar } from '../../componentes/FilterBar';
import { Toast } from '../../componentes/Toast';
import { ConfirmDialog } from '../../componentes/ConfirmDialog';
import { useToast } from '../../lib/useToast';
import { useSesion } from '../../lib/sesion';
import { SinPermiso } from '../../componentes/SinPermiso';
import { formatearMonto } from '../../lib/moneda';
import { listarComprobantes, anularComprobante } from './comprobantes.api';
import { listarProveedoresConSaldo } from '../pagos/pagos.api'; // si existe, o crear función propia

export function ComprobantesPage() {
  const navigate = useNavigate();
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  // Filtros
  const [filtros, setFiltros] = useState({
    proveedorId: '',
    estado: 'activo',
    desde: '',
    hasta: '',
    soloSaldo: true
  });

  // Consulta
  const { data: comprobantes, isLoading, isError } = useQuery({
    queryKey: ['comprobantes', filtros],
    queryFn: () => listarComprobantes(filtros)
  });

  // Proveedores para el filtro (usar endpoint existente o crear)
  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-con-saldo'],
    queryFn: () => listarProveedoresConSaldo() // si existe
  });

  // Mutación para anular
  const mutacionAnular = useMutation({
    mutationFn: ({ id, motivo }) => anularComprobante(id, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comprobantes'] });
      mostrarToast('Comprobante anulado correctamente.');
    },
    onError: (error) => {
      mostrarToast(error?.response?.data?.error ?? 'No se pudo anular el comprobante.');
    }
  });

  const [anulando, setAnulando] = useState(null); // comprobante a anular

  const actualizarFiltro = (clave, valor) => {
    setFiltros(prev => ({ ...prev, [clave]: valor }));
  };

  if (!puede('registrarComprobante')) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-[34px] font-semibold">Comprobantes de Proveedores</h1>
        <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
          HU 72-75 — Facturas, notas de débito y crédito, matching de 3 vías
        </p>
      </div>

      {/* Filtros */}
      <FilterBar onClear={() => setFiltros({ proveedorId: '', estado: 'activo', desde: '', hasta: '', soloSaldo: true })}>
        <div className="min-w-[180px]">
          <Select
            label="Proveedor"
            value={filtros.proveedorId}
            onChange={(e) => actualizarFiltro('proveedorId', e.target.value)}
          >
            <option value="">Todos</option>
            {proveedores?.map(p => (
              <option key={p.id} value={p.id}>{p.razonSocial}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Select
            label="Estado"
            value={filtros.estado}
            onChange={(e) => actualizarFiltro('estado', e.target.value)}
          >
            <option value="activo">Activos</option>
            <option value="anulado">Anulados</option>
            <option value="">Todos</option>
          </Select>
        </div>
        <div className="w-[150px]">
          <Input
            type="date"
            label="Desde"
            value={filtros.desde}
            onChange={(e) => actualizarFiltro('desde', e.target.value)}
          />
        </div>
        <div className="w-[150px]">
          <Input
            type="date"
            label="Hasta"
            value={filtros.hasta}
            onChange={(e) => actualizarFiltro('hasta', e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filtros.soloSaldo}
              onChange={(e) => actualizarFiltro('soloSaldo', e.target.checked)}
            />
            Solo con saldo pendiente
          </label>
        </div>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => navigate('/comprobantes/nuevo')}>
            <Plus size={16} /> Nuevo comprobante
          </Button>
          <Button variante="secundario" onClick={() => navigate('/comprobantes/nueva-nota')}>
            Nueva nota
          </Button>
        </div>
      </FilterBar>

      {/* Tabla */}
      <div className="rounded-lg border border-borde bg-white p-5">
        {isLoading && <p className="text-sm text-piedra">Cargando...</p>}
        {isError && <p className="text-sm text-error">Error al cargar los comprobantes.</p>}
        {comprobantes && (
          <Table
            columnas={['Tipo', 'Número', 'Proveedor', 'Fecha', 'Total', 'Saldo', 'Matching', 'Estado', '']}
            filas={comprobantes}
            vacio="No hay comprobantes que coincidan con los filtros."
            renderFila={(c) => (
              <tr
                key={c.id}
                className="border-b border-borde last:border-0 hover:bg-hueso cursor-pointer"
                onClick={() => navigate(`/comprobantes/${c.id}`)}
              >
                <td className="px-3 py-2 font-body text-[13px]">{c.tipo}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.numero}</td>
                <td className="px-3 py-2">{c.proveedor?.razonSocial}</td>
                <td className="px-3 py-2 text-[12.5px]">{new Date(c.fecha).toLocaleDateString('es-AR')}</td>
                <td className="px-3 py-2 font-mono text-[13px]">$ {formatearMonto(c.importeTotal)}</td>
                <td className="px-3 py-2 font-mono text-[13px] font-semibold">
                  $ {formatearMonto(c.saldo)}
                </td>
                <td className="px-3 py-2">
                  {c.matching?.tieneDiferencia ? (
                    <Badge variante="error">◆ Con diferencia</Badge>
                  ) : c.matching ? (
                    <Badge variante="ok">OK</Badge>
                  ) : (
                    <span className="text-xs text-piedra">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {c.anulado ? (
                    <Badge variante="neutro">Anulado</Badge>
                  ) : (
                    <Badge variante="ok">Activo</Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {!c.anulado && c.saldo > 0 && (
                      <Button
                        variante="baja"
                        tamano="fila"
                        onClick={() => setAnulando(c)}
                      >
                        Anular
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          />
        )}
      </div>

      {/* Confirmación de anulación */}
      <ConfirmDialog
        abierto={Boolean(anulando)}
        titulo="¿Anular comprobante?"
        mensaje={`Está por anular el comprobante ${anulando?.numero} de ${anulando?.proveedor?.razonSocial}. Esta acción no se puede deshacer.`}
        textoConfirmar="Sí, anular"
        variante="baja"
        onCancelar={() => setAnulando(null)}
        onConfirmar={() => {
          const motivo = prompt('Motivo de anulación:');
          if (motivo && motivo.trim()) {
            mutacionAnular.mutate({ id: anulando.id, motivo });
          }
          setAnulando(null);
        }}
      />

      <Toast mensaje={toast} />
    </div>
  );
}