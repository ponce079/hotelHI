import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../componentes/Badge';
import { Button } from '../../componentes/Button';
import { Cifra } from '../../componentes/Cifra';
import { Table } from '../../componentes/Table';
import { formatearMonto } from '../../lib/moneda';
import { obtenerComprobante } from './comprobantes.api';

export function ComprobanteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: comprobante, isLoading, isError } = useQuery({
    queryKey: ['comprobante', id],
    queryFn: () => obtenerComprobante(id)
  });

  if (isLoading) return <p className="text-sm text-piedra">Cargando...</p>;
  if (isError || !comprobante) return <p className="text-sm text-error">No se pudo cargar el comprobante.</p>;

  return (
    <div className="flex flex-col gap-6">
      <Button variante="secundario" onClick={() => navigate('/comprobantes')} className="mb-2 text-xs">
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
          {!comprobante.anulado && (
            <Button variante="baja" onClick={() => {/* lógica de anular */}}>
              Anular
            </Button>
          )}
        </div>
      </div>

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
            {comprobante.anulado ? (
              <Badge variante="neutro">Anulado</Badge>
            ) : (
              <Badge variante="ok">Activo</Badge>
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
            columnas={['Tipo', 'Número', 'Importe', 'Fecha']}
            filas={comprobante.ajustes}
            renderFila={(a) => (
              <tr key={a.id}>
                <td>{a.tipo}</td>
                <td>{a.numero}</td>
                <td className="font-mono">$ {formatearMonto(a.importeTotal)}</td>
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
    </div>
  );
}