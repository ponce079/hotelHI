import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Save } from 'lucide-react';
import { Modal } from '../../componentes/Modal';
import { Input } from '../../componentes/Input';
import { Select } from '../../componentes/Select';
import { Button } from '../../componentes/Button';
import { crearComprobanteConAjustes } from './comprobantes.api';
import { listarProveedoresActivos } from '../proveedores/proveedores.api';
import { listarOrdenesCompra, obtenerOrdenCompra } from '../ordenes-compra/ordenesCompra.api';
import { formatearMonto } from '../../lib/moneda';
import { hoyEnHoraLocal } from '../../lib/fechas';
import { PATRON_NUMERO_COMPROBANTE } from './comprobantes.constantes';
import { NumeroComprobanteInput } from './NumeroComprobanteInput';

const VACIO = {
  proveedorId: '',
  ordenCompraId: '',
  numero: '',
  fecha: hoyEnHoraLocal(),
  importeTotal: '',
};

const AJUSTE_MANUAL_VACIO = { tipo: 'Nota de Crédito', numero: '', importeTotal: '', motivo: '' };

function formatoValido(numero) {
  return PATRON_NUMERO_COMPROBANTE.test((numero || '').trim());
}

// Líneas con diferencia de recepción (cantidad > cantidadRecibida), con el
// faltante y el subtotal ya calculados — mismo criterio que diferenciaDeOC
// en RecepcionesPage, pero acá hace falta el detalle completo (para
// mostrarlo línea por línea), no solo el total.
function lineasConDiferencia(detalle) {
  return (detalle ?? [])
    .map((linea) => {
      const recibida = linea.cantidadRecibida != null ? Number(linea.cantidadRecibida) : 0;
      const faltante = Number(linea.cantidad) - recibida;
      return { ...linea, faltante, subtotal: faltante * Number(linea.precioUnitario) };
    })
    .filter((linea) => linea.faltante > 0);
}

function montoSugeridoPorDiferencia(detalle) {
  return lineasConDiferencia(detalle).reduce((acc, linea) => acc + linea.subtotal, 0);
}

// Rediseño de carga de comprobantes: reemplaza a ComprobanteModal + NotaModal
// (NotaModal ya no existe como componente separado). El flujo es siempre
// "Cargar factura para esta OC" — sin selector de tipo visible — con dos
// secciones opcionales: la Nota de Crédito automática por diferencia de
// recepción (punto 3) y el ajuste manual (punto 4). Un solo submit manda
// todo junto (POST /comprobantes/con-ajustes).
export function ComprobanteModal({ onClose, onExito }) {
  const [form, setForm] = useState(VACIO);
  const [ncAutoActiva, setNcAutoActiva] = useState(true);
  const [ncAuto, setNcAuto] = useState({ numero: '', importeTotal: '' });
  const [ajusteManualAbierto, setAjusteManualAbierto] = useState(false);
  const [ajusteManual, setAjusteManual] = useState(AJUSTE_MANUAL_VACIO);
  const [errores, setErrores] = useState({});
  const queryClient = useQueryClient();

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-activos'],
    queryFn: listarProveedoresActivos,
  });

  // El backend (crearComprobanteConAjustes) solo bloquea OCs "Anulada" — acá
  // se acota igual a "ya recibida" (Recibida o Recibida con diferencia) por
  // UX, sin excluir justo el caso "Recibida con diferencia", que es donde
  // más falta hace cargar el comprobante.
  const { data: ordenes } = useQuery({
    queryKey: ['ordenes-compra', 'para-comprobante'],
    queryFn: () => listarOrdenesCompra({ pageSize: 500 }),
    enabled: !!form.proveedorId,
  });
  const ordenesElegibles = ordenes?.items?.filter(
    (o) => o.proveedorId === Number(form.proveedorId) && ['Recibida', 'Recibida con diferencia'].includes(o.estado)
  );

  // Detalle completo de la OC elegida: hace falta para calcular el monto
  // sugerido de la NC automática (cantidad/cantidadRecibida/precioUnitario
  // por línea) y para saber si esa OC ya tiene una Nota de Crédito activa.
  const { data: ocSeleccionada } = useQuery({
    queryKey: ['ordenes-compra', form.ordenCompraId],
    queryFn: () => obtenerOrdenCompra(form.ordenCompraId),
    enabled: !!form.ordenCompraId,
  });

  const tieneNCRegistrada = (ocSeleccionada?.comprobantes ?? []).some(
    (c) => c.tipo === 'Nota de Crédito' && !c.anulado
  );
  const mostrarNCAutomatica =
    !!ocSeleccionada && ocSeleccionada.estado === 'Recibida con diferencia' && !tieneNCRegistrada;

  // Apenas se elige una OC, precarga el Importe Total de la factura con el
  // total de esa OC — punto de partida editable, nunca el total menos la
  // Nota de Crédito: esa resta ya la hace calcularSaldosComprobantes a
  // partir del saldo, restarla acá también la contaría dos veces.
  useEffect(() => {
    if (ocSeleccionada) {
      setForm((prev) => ({ ...prev, importeTotal: String(ocSeleccionada.montoTotal) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocSeleccionada?.id]);

  // Al elegir (o cambiar) una OC con diferencia sin resolver, precarga el
  // monto sugerido — editable, no de solo lectura — y arranca activa
  // (tildada) por default.
  useEffect(() => {
    setNcAutoActiva(true);
    if (mostrarNCAutomatica) {
      setNcAuto({ numero: '', importeTotal: montoSugeridoPorDiferencia(ocSeleccionada.detalle).toFixed(2) });
    } else {
      setNcAuto({ numero: '', importeTotal: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocSeleccionada?.id, mostrarNCAutomatica]);

  const mutacion = useMutation({
    mutationFn: (payload) => crearComprobanteConAjustes(payload),
    onSuccess: (creado) => {
      queryClient.invalidateQueries({ queryKey: ['comprobantes'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] });
      // HU-72: si hay diferencia de matching se avisa ya en el mensaje de
      // éxito, junto con lo que se haya generado además de la factura.
      const partes = [`Comprobante ${creado.factura.numero} creado correctamente.`];
      if (creado.notaCreditoAutomatica) {
        partes.push(`Se generó la Nota de Crédito ${creado.notaCreditoAutomatica.numero} por la diferencia.`);
      }
      if (creado.ajusteManual) {
        partes.push(`Se registró ${creado.ajusteManual.tipo} ${creado.ajusteManual.numero}.`);
      }
      if (creado.factura.matching?.tieneDiferencia) {
        partes.push('Hay una diferencia de matching con la OC, revisá el detalle.');
      }
      onExito(partes.join(' '));
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
    const nuevosErrores = {};

    if (!form.proveedorId) nuevosErrores.proveedorId = 'Seleccione un proveedor.';
    if (!form.numero.trim()) {
      nuevosErrores.numero = 'Número obligatorio.';
    } else if (!formatoValido(form.numero)) {
      nuevosErrores.numero = 'Formato esperado: letra-4 dígitos-8 dígitos (ej. A-0001-00012345).';
    }
    if (!form.importeTotal || parseFloat(form.importeTotal) <= 0) {
      nuevosErrores.importeTotal = 'Importe mayor a 0.';
    }

    // El checkbox "Cargar la Nota de Crédito ahora" es el que decide si la
    // sección se manda — si el usuario la destilda (porque todavía no tiene
    // el número real del proveedor), queda afuera del submit y se resuelve
    // después desde Recepciones (ver diseño confirmado).
    const incluyeNCAutomatica = mostrarNCAutomatica && ncAutoActiva;
    if (incluyeNCAutomatica) {
      if (!ncAuto.numero.trim()) {
        nuevosErrores.ncAutoNumero = 'Número obligatorio.';
      } else if (!formatoValido(ncAuto.numero)) {
        nuevosErrores.ncAutoNumero = 'Formato esperado: letra-4 dígitos-8 dígitos.';
      }
      if (!ncAuto.importeTotal || parseFloat(ncAuto.importeTotal) <= 0) {
        nuevosErrores.ncAutoImporte = 'Importe mayor a 0.';
      }
    }

    const camposAjusteManual = [ajusteManual.numero, ajusteManual.importeTotal, ajusteManual.motivo];
    const algunCampoLleno = camposAjusteManual.some((c) => String(c).trim());
    const incluyeAjusteManual = ajusteManualAbierto && algunCampoLleno;
    if (incluyeAjusteManual) {
      if (!ajusteManual.numero.trim()) {
        nuevosErrores.ajusteNumero = 'Número obligatorio.';
      } else if (!formatoValido(ajusteManual.numero)) {
        nuevosErrores.ajusteNumero = 'Formato esperado: letra-4 dígitos-8 dígitos.';
      }
      if (!ajusteManual.importeTotal || parseFloat(ajusteManual.importeTotal) <= 0) {
        nuevosErrores.ajusteImporte = 'Importe mayor a 0.';
      }
      if (!ajusteManual.motivo.trim()) nuevosErrores.ajusteMotivo = 'Motivo obligatorio.';
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
    mutacion.mutate({
      factura: {
        proveedorId: Number(form.proveedorId),
        ordenCompraId: form.ordenCompraId ? Number(form.ordenCompraId) : undefined,
        numero: form.numero.trim(),
        fecha: form.fecha,
        importeTotal: parseFloat(form.importeTotal),
      },
      notaCreditoAutomatica: incluyeNCAutomatica
        ? { numero: ncAuto.numero.trim(), importeTotal: parseFloat(ncAuto.importeTotal) }
        : null,
      ajusteManual: incluyeAjusteManual
        ? {
            tipo: ajusteManual.tipo,
            numero: ajusteManual.numero.trim(),
            importeTotal: parseFloat(ajusteManual.importeTotal),
            motivo: ajusteManual.motivo.trim(),
          }
        : null,
    });
  }

  return (
    <Modal titulo="Cargar factura" onClose={onClose} ancho="max-w-xl">
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

          <NumeroComprobanteInput
            label="Número de factura *"
            value={form.numero}
            onChange={(numero) => setForm({ ...form, numero })}
            error={errores.numero}
          />

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

          {mostrarNCAutomatica && (
            <div className="flex flex-col gap-3 rounded-md border border-laton-300 bg-laton-100 p-4">
              <p className="text-[13px] font-semibold text-laton-700">
                Se detectó una diferencia en la recepción — se va a generar también una Nota de Crédito por $
                {formatearMonto(montoSugeridoPorDiferencia(ocSeleccionada.detalle))}.
              </p>

              {/* Detalle línea por línea: para que se pueda verificar de
                  dónde sale el monto sugerido, no solo confiar en el total. */}
              <div className="flex flex-col gap-1 rounded-md bg-white/70 p-3 text-[12px] text-laton-700">
                {lineasConDiferencia(ocSeleccionada.detalle).map((linea) => (
                  <div key={linea.articuloId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-semibold">{linea.articulo?.nombre}</span>
                    <span className="font-mono">
                      {linea.faltante} {linea.articulo?.unidadMedida} × ${formatearMonto(linea.precioUnitario)} = $
                      {formatearMonto(linea.subtotal)}
                    </span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-3 border-t border-laton-300 pt-1.5 font-semibold">
                  <span>Total sugerido</span>
                  <span className="font-mono">$ {formatearMonto(montoSugeridoPorDiferencia(ocSeleccionada.detalle))}</span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-laton-700">
                <input
                  type="checkbox"
                  checked={ncAutoActiva}
                  onChange={(e) => setNcAutoActiva(e.target.checked)}
                />
                Cargar la Nota de Crédito ahora
              </label>

              <div className="grid grid-cols-2 gap-4">
                <NumeroComprobanteInput
                  label="Número de la Nota de Crédito"
                  value={ncAuto.numero}
                  onChange={(numero) => setNcAuto({ ...ncAuto, numero })}
                  error={errores.ncAutoNumero}
                  disabled={!ncAutoActiva}
                />
                <Input
                  label="Importe"
                  type="number"
                  step="0.01"
                  value={ncAuto.importeTotal}
                  onChange={(e) => setNcAuto({ ...ncAuto, importeTotal: e.target.value })}
                  error={errores.ncAutoImporte}
                  disabled={!ncAutoActiva}
                  className="disabled:cursor-not-allowed disabled:bg-hueso disabled:text-tinta/40"
                />
              </div>

              {!ncAutoActiva && (
                <p className="text-[12px] text-laton-700/70">
                  La factura se guarda igual y vas a poder cargar la Nota de Crédito después desde Recepciones,
                  cuando tengas el número que le puso el proveedor.
                </p>
              )}
            </div>
          )}

          {ajusteManualAbierto ? (
            <div className="flex flex-col gap-3 rounded-md border border-borde bg-hueso p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">Otro ajuste</p>
                <button
                  type="button"
                  className="text-[12px] text-piedra underline"
                  onClick={() => {
                    setAjusteManualAbierto(false);
                    setAjusteManual(AJUSTE_MANUAL_VACIO);
                    setErrores((prev) => {
                      const resto = { ...prev };
                      delete resto.ajusteNumero;
                      delete resto.ajusteImporte;
                      delete resto.ajusteMotivo;
                      return resto;
                    });
                  }}
                >
                  Quitar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Tipo *"
                  value={ajusteManual.tipo}
                  onChange={(e) => setAjusteManual({ ...ajusteManual, tipo: e.target.value })}
                >
                  <option value="Nota de Crédito">Nota de Crédito</option>
                  <option value="Nota de Débito">Nota de Débito</option>
                </Select>
                <NumeroComprobanteInput
                  label="Número *"
                  value={ajusteManual.numero}
                  onChange={(numero) => setAjusteManual({ ...ajusteManual, numero })}
                  error={errores.ajusteNumero}
                />
              </div>
              <Input
                label="Importe *"
                type="number"
                step="0.01"
                value={ajusteManual.importeTotal}
                onChange={(e) => setAjusteManual({ ...ajusteManual, importeTotal: e.target.value })}
                error={errores.ajusteImporte}
                placeholder="0.00"
              />
              <Input
                label="Motivo *"
                value={ajusteManual.motivo}
                onChange={(e) => setAjusteManual({ ...ajusteManual, motivo: e.target.value })}
                error={errores.ajusteMotivo}
                placeholder="Ej. Descuento comercial, flete adicional..."
              />
            </div>
          ) : (
            <button
              type="button"
              className="self-start text-[12.5px] text-piedra underline"
              onClick={() => setAjusteManualAbierto(true)}
            >
              + Agregar otro ajuste
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-borde px-6 py-4">
          <Button type="button" variante="secundario" icono={X} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icono={Save} disabled={mutacion.isPending}>
            {mutacion.isPending ? 'Guardando...' : 'Guardar comprobante'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
