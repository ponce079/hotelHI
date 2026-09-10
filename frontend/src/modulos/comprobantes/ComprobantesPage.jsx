import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileText, FileMinus, FilePlus, Ban } from 'lucide-react';
import { Table } from '../../componentes/Table';
import { Badge } from '../../componentes/Badge';
import { Button } from '../../componentes/Button';
import { Input } from '../../componentes/Input';
import { FilterBar } from '../../componentes/FilterBar';
import { MenuAcciones } from '../../componentes/MenuAcciones';
import { Cifra } from '../../componentes/Cifra';
import { Toast } from '../../componentes/Toast';
import { ConfirmDialog } from '../../componentes/ConfirmDialog';
import { useToast } from '../../lib/useToast';
import { useSesion } from '../../lib/sesion';
import { SinPermiso } from '../../componentes/SinPermiso';
import { formatearMonto } from '../../lib/moneda';
import { formatearFechaSinHora, formatearFechaComprobante, estadoVencimiento } from '../../lib/fechas';
import { listarComprobantes, anularComprobante } from './comprobantes.api';
import {
  ESTADOS_COMPROBANTE,
  VARIANTE_ESTADO_COMPROBANTE,
  UMBRAL_VENCIMIENTO_DIAS,
  VARIANTE_VENCIMIENTO,
  LABEL_VENCIMIENTO,
} from './comprobantes.constantes';
import { listarProveedoresActivos } from '../proveedores/proveedores.api';
import { ComprobanteModal } from './ComprobanteModal';
import { AjusteModal } from './AjusteModal';

// Ícono por tipo de comprobante — mismo criterio en toda la fila, para que
// el tipo se lea de un vistazo sin la columna "Tipo" aparte (se fusionó
// con "Número" en la columna "Comprobante").
const ICONO_TIPO = {
  Factura: FileText,
  'Nota de Crédito': FileMinus,
  'Nota de Débito': FilePlus,
};

// Tarjetas de resumen: se calculan en el cliente a partir de la misma lista
// ya traída por listarComprobantes(filtros) — no hay endpoint de resumen
// agregado para comprobantes (a diferencia de Requerimientos), así que no
// tiene sentido pedir uno solo para esto. Quedan alcanzadas por los mismos
// filtros que la tabla de abajo (incluido "Solo con saldo pendiente").
function calcularResumen(comprobantes) {
  const activos = (comprobantes ?? []).filter((c) => !c.anulado);

  const facturas = activos.filter((c) => c.tipo === 'Factura');
  const totalFacturado = facturas.reduce((acc, c) => acc + Number(c.importeTotal), 0);

  const conSaldo = activos.filter((c) => Number(c.saldo) > 0);
  const saldoPendiente = conSaldo.reduce((acc, c) => acc + Number(c.saldo), 0);

  const conDiferencia = activos.filter((c) => c.matching?.tieneDiferencia);

  const facturasPendientes = facturas.filter((c) => c.fechaVencimiento && Number(c.saldo) > 0);
  let proximoVencimiento = null;
  let facturasEseDia = 0;
  for (const f of facturasPendientes) {
    const fecha = f.fechaVencimiento.slice(0, 10);
    if (proximoVencimiento === null || fecha < proximoVencimiento) {
      proximoVencimiento = fecha;
      facturasEseDia = 1;
    } else if (fecha === proximoVencimiento) {
      facturasEseDia += 1;
    }
  }

  return {
    totalFacturado,
    cantidadFacturas: facturas.length,
    saldoPendiente,
    cantidadConSaldo: conSaldo.length,
    cantidadConDiferencia: conDiferencia.length,
    totalActivos: activos.length,
    proximoVencimiento,
    facturasEseDia,
  };
}

function TarjetaResumen({ label, valor, hint, alerta = false }) {
  return (
    <div className={`rounded-md bg-hueso p-4 ${alerta ? 'border-l-[3px] border-error' : ''}`}>
      <div className="font-body text-[11px] uppercase tracking-[0.08em] text-piedra">{label}</div>
      <Cifra tamano={21} className={alerta ? 'text-error-texto' : 'text-tinta'}>
        {valor}
      </Cifra>
      <div className="mt-0.5 font-body text-[11.5px] text-tinta/55">{hint}</div>
    </div>
  );
}

export function ComprobantesPage() {
  const navigate = useNavigate();
  const { puede } = useSesion();
  const { toast, mostrarToast } = useToast();
  const queryClient = useQueryClient();

  // Filtros — "estado" son los 4 valores reales del comprobante (HU-74);
  // vacío por defecto porque "solo con saldo pendiente" ya cubre el caso
  // de uso más común (pendientes + parciales, sin pagados ni anulados).
  const [filtros, setFiltros] = useState({
    proveedorId: '',
    estado: '',
    desde: '',
    hasta: '',
    soloSaldo: true,
    ordenarPor: 'fecha'
  });

  // Consulta
  const { data: comprobantes, isLoading, isError } = useQuery({
    queryKey: ['comprobantes', filtros],
    queryFn: () => listarComprobantes(filtros)
  });

  const resumen = useMemo(() => calcularResumen(comprobantes), [comprobantes]);

  // Proveedores para el filtro: todos los activos, no solo los que ya
  // tienen saldo pendiente (si no, un proveedor sin comprobantes cargados
  // nunca podría filtrarse ni elegirse para cargar su primer comprobante).
  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-activos'],
    queryFn: () => listarProveedoresActivos()
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
  const [modalAbierto, setModalAbierto] = useState(null); // "comprobante" | "nota" | null

  const actualizarFiltro = (clave, valor) => {
    setFiltros(prev => ({ ...prev, [clave]: valor }));
  };

  if (!puede('registrarComprobante')) return <SinPermiso />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-[34px] font-semibold">Comprobantes de Proveedores</h1>
          <p className="mt-1.5 font-mono text-[11px] text-tinta/55">
            HU 72-75 — Facturas, notas de débito y crédito, matching de 3 vías
          </p>
          <p className="mt-1 text-[12.5px] text-piedra">
            "Comprobantes" incluye Facturas, Notas de Crédito y Notas de Débito de proveedores — no solo facturas.
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button variante="secundario" onClick={() => setModalAbierto('nota')} icono={FilePlus}>
            Nueva nota
          </Button>
          <Button onClick={() => setModalAbierto('comprobante')} icono={FilePlus}>
            Cargar factura
          </Button>
        </div>
      </div>

      {/* Tarjetas de resumen — derivadas de la misma lista filtrada de abajo. */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <TarjetaResumen
          label="Total facturado"
          valor={`$ ${formatearMonto(resumen.totalFacturado)}`}
          hint={`${resumen.cantidadFacturas} factura${resumen.cantidadFacturas === 1 ? '' : 's'}`}
        />
        <TarjetaResumen
          label="Saldo pendiente"
          valor={`$ ${formatearMonto(resumen.saldoPendiente)}`}
          hint={`${resumen.cantidadConSaldo} comprobante${resumen.cantidadConSaldo === 1 ? '' : 's'}`}
          alerta
        />
        <TarjetaResumen
          label="Con diferencia"
          valor={resumen.cantidadConDiferencia}
          hint={`de ${resumen.totalActivos} comprobante${resumen.totalActivos === 1 ? '' : 's'}`}
          alerta={resumen.cantidadConDiferencia > 0}
        />
        <TarjetaResumen
          label="Próximo vencimiento"
          valor={resumen.proximoVencimiento ? formatearFechaSinHora(resumen.proximoVencimiento) : '—'}
          hint={
            resumen.proximoVencimiento
              ? `${resumen.facturasEseDia} factura${resumen.facturasEseDia === 1 ? '' : 's'} ese día`
              : 'Sin vencimientos pendientes'
          }
        />
      </div>

      {/* Filtros */}
      <FilterBar
        onClear={() =>
          setFiltros({ proveedorId: '', estado: '', desde: '', hasta: '', soloSaldo: true, ordenarPor: 'fecha' })
        }
      >
        <div className="flex flex-wrap items-center gap-2.5 font-body text-[13px]">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-piedra">Proveedor</span>
            <select
              value={filtros.proveedorId}
              onChange={(e) => actualizarFiltro('proveedorId', e.target.value)}
              className="cursor-pointer border-0 bg-transparent text-tinta focus:outline-none"
            >
              <option value="">Todos</option>
              {proveedores?.map(p => (
                <option key={p.id} value={p.id}>{p.razonSocial}</option>
              ))}
            </select>
          </div>

          <span className="text-borde">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-piedra">Estado</span>
            <select
              value={filtros.estado}
              onChange={(e) => actualizarFiltro('estado', e.target.value)}
              className="cursor-pointer border-0 bg-transparent text-tinta focus:outline-none"
            >
              <option value="">Todos</option>
              <option value={ESTADOS_COMPROBANTE.PENDIENTE}>Pendiente</option>
              <option value={ESTADOS_COMPROBANTE.PAGADO_PARCIAL}>Pagado Parcial</option>
              <option value={ESTADOS_COMPROBANTE.PAGADO}>Pagado</option>
              <option value={ESTADOS_COMPROBANTE.ANULADO}>Anulado</option>
            </select>
          </div>

          <span className="text-borde">|</span>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-piedra">Ordenar por</span>
            <select
              value={filtros.ordenarPor}
              onChange={(e) => actualizarFiltro('ordenarPor', e.target.value)}
              className="cursor-pointer border-0 bg-transparent text-tinta focus:outline-none"
            >
              <option value="fecha">Fecha (más reciente)</option>
              <option value="antiguedad">Antigüedad del saldo</option>
            </select>
          </div>
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

        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filtros.soloSaldo}
            onChange={(e) => actualizarFiltro('soloSaldo', e.target.checked)}
          />
          Solo con saldo pendiente
        </label>
      </FilterBar>

      {/* Tabla */}
      <div className="rounded-lg border border-borde bg-white p-5">
        {isLoading && <p className="text-sm text-piedra">Cargando...</p>}
        {isError && <p className="text-sm text-error">Error al cargar los comprobantes.</p>}
        {comprobantes && (
          <Table
            columnas={['Comprobante', 'Proveedor', 'Total', 'Saldo', 'Matching', 'Estado', '']}
            columnasDerecha={['Total', 'Saldo']}
            filas={comprobantes}
            vacio="No hay comprobantes que coincidan con los filtros."
            renderFila={(c) => {
              const vencimiento = estadoVencimiento(c.fechaVencimiento, UMBRAL_VENCIMIENTO_DIAS);
              const IconoTipo = ICONO_TIPO[c.tipo] ?? FileText;
              const acciones = [
                { label: 'Ver detalle', onClick: () => navigate(`/comprobantes/${c.id}`) },
                ...(!c.anulado && c.saldo > 0
                  ? [{ label: 'Anular', onClick: () => setAnulando(c), variante: 'destructivo' }]
                  : []),
              ];
              return (
              <tr
                key={c.id}
                className="border-b border-borde last:border-0 hover:bg-hueso cursor-pointer"
                onClick={() => navigate(`/comprobantes/${c.id}`)}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <IconoTipo size={15} className="mt-0.5 flex-none text-piedra" />
                    <div>
                      <div className="font-mono text-[13px] font-semibold text-tinta">{c.numero}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-tinta/50">
                        <span>{formatearFechaComprobante(c.tipo, c.fecha)}</span>
                        {c.fechaVencimiento && (
                          <>
                            <span>·</span>
                            <span>Vto. {formatearFechaSinHora(c.fechaVencimiento)}</span>
                          </>
                        )}
                        {vencimiento && (
                          <Badge variante={VARIANTE_VENCIMIENTO[vencimiento]}>{LABEL_VENCIMIENTO[vencimiento]}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">{c.proveedor?.razonSocial}</td>
                <td className="px-3 py-2.5 text-right font-mono text-[13px] [font-variant-numeric:tabular-nums]">
                  $ {formatearMonto(c.importeTotal)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right font-mono text-[13px] font-semibold [font-variant-numeric:tabular-nums] ${
                    c.matching?.tieneDiferencia ? 'text-error-texto' : 'text-tinta'
                  }`}
                >
                  $ {formatearMonto(c.saldo)}
                </td>
                <td className="px-3 py-2.5">
                  {c.matching?.tieneDiferencia ? (
                    <Badge variante="error">◆ Con diferencia</Badge>
                  ) : c.matching ? (
                    <Badge variante="ok">✓ OK</Badge>
                  ) : (
                    <span className="text-xs text-piedra">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {c.estado ? (
                    <Badge variante={VARIANTE_ESTADO_COMPROBANTE[c.estado] ?? 'neutro'}>{c.estado}</Badge>
                  ) : (
                    <span className="text-xs text-piedra">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <MenuAcciones acciones={acciones} />
                  </div>
                </td>
              </tr>
              );
            }}
          />
        )}
      </div>

      {/* Confirmación de anulación */}
      <ConfirmDialog
        abierto={Boolean(anulando)}
        titulo="¿Anular comprobante?"
        mensaje={`Está por anular el comprobante ${anulando?.numero} de ${anulando?.proveedor?.razonSocial}. Esta acción no se puede deshacer.`}
        textoConfirmar="Sí, anular"
        variante="destructivo"
        icono={Ban}
        onCancelar={() => setAnulando(null)}
        onConfirmar={() => {
          const motivo = prompt('Motivo de anulación:');
          if (motivo && motivo.trim()) {
            mutacionAnular.mutate({ id: anulando.id, motivo });
          }
          setAnulando(null);
        }}
      />

      {modalAbierto === 'comprobante' && (
        <ComprobanteModal
          onClose={() => setModalAbierto(null)}
          onExito={(mensaje) => {
            setModalAbierto(null);
            mostrarToast(mensaje);
          }}
        />
      )}
      {modalAbierto === 'nota' && (
        <AjusteModal
          onClose={() => setModalAbierto(null)}
          onExito={(mensaje) => {
            setModalAbierto(null);
            mostrarToast(mensaje);
          }}
        />
      )}

      <Toast mensaje={toast} />
    </div>
  );
}
