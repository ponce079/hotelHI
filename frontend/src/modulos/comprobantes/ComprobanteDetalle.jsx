import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../../componentes/Badge';
import { Button } from '../../componentes/Button';
import { Cifra } from '../../componentes/Cifra';
import { Table } from '../../componentes/Table';
import { Toast } from '../../componentes/Toast';
import { useToast } from '../../lib/useToast';
import { useVolver } from '../../lib/useVolver';
import { formatearMonto } from '../../lib/moneda';
import { obtenerComprobante, anularComprobante } from './comprobantes.api';
import { VARIANTE_ESTADO_COMPROBANTE } from './comprobantes.constantes';

export function ComprobanteDetalle() {
  const { id } = useParams();
  const volver = useVolver('/comprobantes');
  const queryClient = useQueryClient();
  const { toast, mostrarToast } = useToast();
  const { data: comprobante, isLoading, isError } = useQuery({
    queryKey: ['comprobante', id],
    queryFn: () => obtenerComprobante(id)
  });

  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState('');

  const mutacionAnular = useMutation({
    mutationFn: () => anularComprobante(comprobante.id, motivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comprobante', id] });
      queryClient.invalidateQueries({ queryKey: ['comprobantes'] });
      setAnulando(false);
      mostrarToast('Comprobante anulado correctamente.');
    },
    onError: (error) => setErrorMotivo(error?.response?.data?.error ?? 'No se pudo anular el comprobante.'),
  });

  function confirmarAnular() {
    if (!motivo.trim()) {
      setErrorMotivo('El motivo de anulación es obligatorio.');
      return;
    }
    mutacionAnular.mutate();
  }

  if (isLoading) return <p className="text-sm text-piedra">Cargando...</p>;
  if (isError || !comprobante) return <p className="text-sm text-error">No se pudo cargar el comprobante.</p>;

  return (
    <div className="flex flex-col gap-6">
      <Button variante="fantasma" onClick={volver} className="mb-2 text-xs">
        ← Volver
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">
            {comprobante.tipo} {comprobante.numero}
          </h1>
          <p className="text-sm text-piedra">{comprobante.proveedor?.razonSocial}</p>
        </div>
        <div className="flex gap-2">
          {!comprobante.anulado && !anulando && (
            <Button variante="destructivo" onClick={() => setAnulando(true)}>
              Anular
            </Button>
          )}
        </div>
      </div>

      {anulando && (
        <div className="flex flex-col gap-2 rounded-[18.4px] bg-white px-5 py-4">
          <span className="text-[12px] font-semibold text-tinta">Motivo de anulación *</span>
          <textarea
            className={`rounded-md border bg-white px-3 py-2 text-[13px] text-tinta placeholder:text-tinta/45 focus:outline-none focus:ring-2 focus:ring-pino/40 ${
              errorMotivo ? 'border-error' : 'border-borde'
            }`}
            rows={2}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErrorMotivo('');
            }}
            placeholder="ej. Comprobante cargado por error"
          />
          {errorMotivo && <span className="text-[11.5px] text-error-texto">{errorMotivo}</span>}
          <div className="mt-1 flex justify-end gap-2.5">
            <Button
              variante="secundario"
              onClick={() => {
                setAnulando(false);
                setMotivo('');
                setErrorMotivo('');
              }}
            >
              Cancelar
            </Button>
            <Button variante="destructivo" disabled={mutacionAnular.isPending} onClick={confirmarAnular}>
              {mutacionAnular.isPending ? 'Anulando…' : 'Confirmar anulación'}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="rounded-[18.4px] bg-white px-5 py-4">
          <span className="text-xs uppercase text-piedra">Total</span>
          <Cifra tamano={28}>$ {formatearMonto(comprobante.importeTotal)}</Cifra>
        </div>
        <div className="rounded-[18.4px] bg-pino-100 px-5 py-4">
          <span className="text-xs uppercase text-piedra">Saldo pendiente</span>
          <Cifra tamano={28}>$ {formatearMonto(comprobante.saldo)}</Cifra>
        </div>
        <div className="rounded-[18.4px] bg-white px-5 py-4">
          <span className="text-xs uppercase text-piedra">Estado</span>
          <div className="mt-1">
            {comprobante.estado ? (
              <Badge variante={VARIANTE_ESTADO_COMPROBANTE[comprobante.estado] ?? 'neutro'}>
                {comprobante.estado}
              </Badge>
            ) : (
              <span className="text-[12.5px] text-piedra">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Matching de 3 vías */}
      {comprobante.matching && (
        <div className="rounded-[18.4px] bg-white px-5 py-4">
          <h3 className="font-heading text-lg font-semibold">Matching de 3 vías</h3>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div>
              <span className="text-xs text-piedra">Total OC</span>
              <div className="font-mono">$ {formatearMonto(comprobante.matching.totalOC)}</div>
            </div>
            <div>
              <span className="text-xs text-piedra">Valor recibido</span>
              <div className="font-mono">$ {formatearMonto(comprobante.matching.totalRecibido)}</div>
            </div>
            <div>
              <span className="text-xs text-piedra">Total factura</span>
              <div className="font-mono">$ {formatearMonto(comprobante.matching.totalFactura)}</div>
            </div>
          </div>
          <div className="mt-2">
            {comprobante.matching.tieneDiferencia ? (
              <Badge variante="error">◆ Con diferencia</Badge>
            ) : (
              <Badge variante="ok">Matching OK</Badge>
            )}
          </div>
        </div>
      )}

      {/* Ajustes ND/NC */}
      {comprobante.ajustes && comprobante.ajustes.length > 0 && (
        <div className="rounded-[18.4px] bg-white px-5 py-4">
          <h3 className="font-heading text-lg font-semibold">Ajustes aplicados</h3>
          <Table
            columnas={['Tipo', 'Número', 'Importe', 'Motivo', 'Fecha']}
            filas={comprobante.ajustes}
            renderFila={(a) => (
              <tr key={a.id}>
                <td>{a.tipo}</td>
                <td>{a.numero}</td>
                <td className="font-mono">$ {formatearMonto(a.importeTotal)}</td>
                <td className="text-tinta/70">{a.motivo ?? '—'}</td>
                <td>{new Date(a.fecha).toLocaleDateString('es-AR')}</td>
              </tr>
            )}
          />
        </div>
      )}

      {/* Pagos aplicados */}
      {comprobante.pagosAplicados && comprobante.pagosAplicados.length > 0 && (
        <div className="rounded-[18.4px] bg-white px-5 py-4">
          <h3 className="font-heading text-lg font-semibold">Pagos aplicados</h3>
          <Table
            columnas={['Orden de pago', 'Importe aplicado', 'Fecha']}
            filas={comprobante.pagosAplicados}
            renderFila={(p) => (
              <tr key={p.id}>
                <td>{p.ordenPago?.numero}</td>
                <td className="font-mono">$ {formatearMonto(p.importeAplicado)}</td>
                <td>{new Date(p.ordenPago?.fecha).toLocaleDateString('es-AR')}</td>
              </tr>
            )}
          />
        </div>
      )}

      <Toast mensaje={toast} />
    </div>
  );
}