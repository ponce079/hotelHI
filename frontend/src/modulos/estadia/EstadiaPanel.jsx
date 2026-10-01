import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { Button } from '../../componentes/Button';
import { Input } from '../../componentes/Input';
import { Select } from '../../componentes/Select';
import { Modal } from '../../componentes/Modal';
import { ConsumoModal } from '../servicios-adicionales/ConsumoModal';
import { obtenerCuenta } from '../check-out/checkOut.api';
import { PAISES_OCUPANTES, buscarPaisOcupante } from './ocupantesUbicacion';
import { validarOcupante, pendientesParaIngreso } from './validarOcupante';
import { titularRegistrado } from './titularRegistrado';
import { reintentarLecturaEstadia as reintentarLectura, reintentarTitular, demoraReintentoTitular } from './recuperacionEstadia';

function ErrorConsulta({consulta,mensaje}) {
  return <div role="alert" className="rounded border border-error bg-error-suave p-3 text-sm text-error-texto">
    <p>{consulta.error?.response?.data?.error || mensaje}</p>
    <Button className="mt-2" variante="secundario" cargando={consulta.isFetching} onClick={()=>consulta.refetch()}>Volver a cargar</Button>
  </div>;
}
const moneda=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(v||0);
const detalleEvento=e=>{try{const d=JSON.parse(e.detalle);return [d.habitacionId?`Habitación ID ${d.habitacionId}`:null,d.motivo,d.monto!=null?moneda(d.monto):null,d.devolver!=null?`Devolución ${moneda(d.devolver)}`:null,d.aplicar!=null?`Aplicación ${moneda(d.aplicar)}`:null].filter(Boolean).join(" · ");}catch{return "";}};
const fecha=v=>v?new Date(v).toLocaleString('es-AR'):'—';
const activa=p=>p.asignaciones?.find(a=>!a.hasta);
const TIPOS_DOCUMENTO_OCUPANTE = ['DNI', 'Pasaporte', 'NIE', 'TIE'];
const ETIQUETAS_NUMERO_DOCUMENTO = {
  DNI: 'Número de DNI',
  Pasaporte: 'Número de pasaporte',
  NIE: 'Número de NIE',
  TIE: 'Número de TIE',
};
const campos=[['nombre','Nombre','text',true],['apellido','Apellido','text',true],['tipoDocumento','Tipo de documento','text'],['numeroDocumento','Número de documento','text'],['paisDocumento','País emisor','text'],['motivoSinDocumento','Justificación sin documento','text'],['fechaNacimiento','Nacimiento','date'],['nacionalidad','Nacionalidad','text'],['paisResidencia','País de residencia','text'],['localidad','Localidad','text'],['domicilio','Domicilio','text'],['telefono','Teléfono','tel'],['email','Correo electrónico','email'],['fechaDesde','Ingreso previsto','date',true],['fechaHasta','Salida prevista','date',true]];
export function PersonaFormulario({persona={},reserva,personas=[],onGuardar,onClose,pendiente=false,error='',erroresServidor={},esTitular=false}){
  const [form,setForm]=useState(()=>({...persona,habitacionId:activa(persona)?.habitacionId||persona.habitacionId||reserva.habitaciones[0]?.id||'',fechaNacimiento:persona.fechaNacimiento?.slice(0,10)||'',fechaDesde:(persona.fechaDesde||reserva.fechaDesde||'').slice(0,10),fechaHasta:(persona.fechaHasta||reserva.fechaHasta||'').slice(0,10)}));
  const [otraLocalidad, setOtraLocalidad] = useState(() => Boolean(persona.localidad && !buscarPaisOcupante(persona.paisResidencia)?.localidades.includes(persona.localidad)));
  const [paisManual, setPaisManual] = useState(() => ({
    paisDocumento: Boolean(persona.paisDocumento && !buscarPaisOcupante(persona.paisDocumento)),
    paisResidencia: Boolean(persona.paisResidencia && !buscarPaisOcupante(persona.paisResidencia)),
  }));
  const paisResidencia = buscarPaisOcupante(form.paisResidencia);
  const [tocados, setTocados] = useState({});
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const esMenor = Boolean(form.fechaNacimiento && `${Number(form.fechaNacimiento.slice(0,4))+18}${form.fechaNacimiento.slice(4)}` > form.fechaDesde);
  const responsableContacto = personas.find(p=>String(p.id)===String(form.responsableId));
  useEffect(()=>{
    if(form.usarContactoResponsable) setForm(f=>({...f,usarContactoResponsable:esMenor,email:esMenor?(responsableContacto?.email||''):'',telefono:esMenor?(responsableContacto?.telefono||''):''}));
  },[form.usarContactoResponsable,esMenor,responsableContacto?.id,responsableContacto?.email,responsableContacto?.telefono]);
  const errores = validarOcupante(form, reserva, personas, persona, paisManual, otraLocalidad, esTitular);
  for (const [campo, dato] of Object.entries(erroresServidor)) {
    if (form[campo] === dato.valor) errores[campo] = dato.mensaje;
  }
  const pendientesIngreso = pendientesParaIngreso(form);
  function propsCampo(campo) {
    const visible = intentoGuardar || tocados[campo] || (['email', 'numeroDocumento', 'habitacionId'].includes(campo) && form[campo]) || erroresServidor[campo];
    const definicion = campos.find(c => c[0] === campo);
    let etiqueta = definicion ? definicion[1] + (definicion[3] ? ' *' : '') : { habitacionId: 'Habitación *', responsableId: 'Adulto responsable (menores)', motivo: 'Motivo del cambio de habitación' }[campo];
    if (campo === 'numeroDocumento') etiqueta = ETIQUETAS_NUMERO_DOCUMENTO[form.tipoDocumento] || etiqueta;
    if (campo === 'localidad' && (otraLocalidad || paisManual.paisResidencia)) etiqueta = 'Nombre de la localidad';
    if (paisManual[campo]) etiqueta = campo === 'paisDocumento' ? 'Nombre del país emisor' : 'Nombre del país de residencia';
    return { name: campo, error: visible ? errores[campo] : undefined, 'aria-label': etiqueta, 'aria-description': visible ? errores[campo] : undefined, 'aria-invalid': Boolean(visible && errores[campo]) };
  }

  function cambiarPais(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor, ...(campo === 'paisResidencia' ? { localidad: '' } : {}) }));
    if (campo === 'paisResidencia') setOtraLocalidad(false);
  }

  function renderCampo([k, label, type, required]) {
    if (k === 'paisDocumento' || k === 'paisResidencia') {
      const pais = buscarPaisOcupante(form[k]);
      return <div key={k} className="space-y-2">
        <Select label={label} {...(!paisManual[k] ? propsCampo(k) : {})} value={paisManual[k] ? '__otro__' : pais?.codigo || ''} onChange={e => {
          const manual = e.target.value === '__otro__';
          setPaisManual(p => ({ ...p, [k]: manual }));
          cambiarPais(k, manual ? '' : e.target.value);
        }}>
          <option value="">Seleccionar país</option>
          {PAISES_OCUPANTES.map(p => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
          <option value="__otro__">Otro país</option>
        </Select>
        {paisManual[k] && <Input {...propsCampo(k)} label={k === 'paisDocumento' ? 'Nombre del país emisor' : 'Nombre del país de residencia'} required pattern={'.*\\S.*'} maxLength={191} value={form[k] || ''} placeholder="Escribí el nombre del país" onChange={e => cambiarPais(k, e.target.value)} />}
      </div>;
    }
    if (k === 'localidad') {
      if (paisManual.paisResidencia) {
        return <Input key={k} {...propsCampo(k)} label="Nombre de la localidad" required pattern={'.*\\S.*'} disabled={!form.paisResidencia?.trim()} maxLength={191} value={form.localidad || ''} placeholder="Ingresá la localidad de residencia" onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} />;
      }
      return <div key={k} className="space-y-2">
        <Select label="Localidad" {...(!otraLocalidad ? propsCampo(k) : {})} disabled={!form.paisResidencia} value={otraLocalidad ? '__otra__' : form.localidad || ''} onChange={e => {
          setOtraLocalidad(e.target.value === '__otra__');
          setForm(f => ({ ...f, localidad: e.target.value === '__otra__' ? '' : e.target.value }));
        }}>
          <option value="">{form.paisResidencia ? 'Seleccionar localidad' : 'Primero seleccioná el país de residencia'}</option>
          {(paisResidencia?.localidades || []).map(localidad => <option key={localidad} value={localidad}>{localidad}</option>)}
          <option value="__otra__">Otra localidad</option>
        </Select>
        {otraLocalidad && <Input {...propsCampo(k)} label="Nombre de la localidad" required maxLength={191} value={form.localidad || ''} placeholder="Ingresá la localidad de residencia" onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} />}
      </div>;
    }
    if (k === 'tipoDocumento') {
      return <Select key={k} {...propsCampo(k)} label={label} value={form.tipoDocumento || ''} onChange={e => setForm(f => ({ ...f, tipoDocumento: e.target.value }))}>
        <option value="">Seleccionar tipo de documento</option>
        {form.tipoDocumento && !TIPOS_DOCUMENTO_OCUPANTE.includes(form.tipoDocumento) && (
          <option value={form.tipoDocumento} disabled>{form.tipoDocumento} (registrado anteriormente)</option>
        )}
        {TIPOS_DOCUMENTO_OCUPANTE.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
      </Select>;
    }
    const etiqueta = k === 'numeroDocumento' ? ETIQUETAS_NUMERO_DOCUMENTO[form.tipoDocumento] || label : label;
    return <Input key={k} {...propsCampo(k)} label={etiqueta + (required ? ' *' : '')} placeholder={k === 'numeroDocumento' ? `Ingresá el ${etiqueta.replace('Número', 'número')}` : undefined} type={type} disabled={Boolean(form.usarContactoResponsable) && ["email","telefono"].includes(k)} required={required} maxLength={191} value={form[k] || ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />;
  }
  return <form noValidate onBlur={e=>{const campo=e.target.name;if(campo)setTocados(t=>({...t,[campo]:true}));}} onSubmit={e=>{
    e.preventDefault();
    if(pendiente)return;
    setIntentoGuardar(true);
    const camposInvalidos=Object.keys(errores);
    if(camposInvalidos.length){e.currentTarget.elements.namedItem(camposInvalidos[0])?.focus();return;}
    onGuardar(form);
  }} className="space-y-4 p-5">
    <p className="text-sm text-piedra">Los datos identifican al ocupante. Todos los cargos se asignan a la habitación.</p>
    {esTitular&&<p className="text-sm">El titular debe tener al menos 18 años en la fecha de ingreso.</p>}
    {esMenor&&<label className="flex gap-2 text-sm"><input type="checkbox" checked={Boolean(form.usarContactoResponsable)} onChange={e=>setForm(f=>({...f,usarContactoResponsable:e.target.checked,email:'',telefono:''}))}/>Usar correo y teléfono del adulto responsable (opcional)</label>}
    {esMenor&&<p className="text-xs text-piedra">Podés dejar el correo y teléfono vacíos. Si usás los del responsable, se copian los datos disponibles al guardar.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{campos.map(renderCampo)}
      <Select {...propsCampo('habitacionId')} label="Habitación *" required value={form.habitacionId} onChange={e=>setForm({...form,habitacionId:e.target.value})}>{reserva.habitaciones.map(h=><option key={h.id} value={h.id}>Habitación {h.numero} · capacidad {h.capacidad}</option>)}</Select>
      <Select {...propsCampo('responsableId')} label="Adulto responsable (menores)" value={form.responsableId||''} onChange={e=>setForm({...form,responsableId:e.target.value})}><option value="">Sin asignar</option>{personas.filter(p=>p.id!==persona.id&&!['Cancelado','Retirado'].includes(p.estado)).map(p=><option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}</Select>
      {persona.id&&<Input {...propsCampo('motivo')} label="Motivo del cambio de habitación" value={form.motivo||''} onChange={e=>setForm({...form,motivo:e.target.value})}/>}
    </div>
    {error&&<p role="alert" className="text-error-texto">{error}</p>}
    {intentoGuardar && Object.keys(errores).length > 0 && <p role="alert" className="text-error-texto">No se pudo guardar. Revisá los {Object.keys(errores).length} campos señalados.</p>}
    {pendientesIngreso.length > 0 && <p className="rounded border border-borde bg-hueso p-3 text-sm">Podés guardar los datos pendientes. Antes de verificar e ingresar faltará completar: {pendientesIngreso.join(', ')}.</p>}
    <div className="flex justify-end gap-2"><Button type="button" variante="secundario" onClick={onClose}>Cancelar</Button><Button type="submit" cargando={pendiente}>Guardar persona</Button></div>
  </form>;
}

export function EstadiaPanel({reserva,soloPersonas=false,onTitularPreparado}){
  const [erroresServidor,setErroresServidor]=useState({});
  const {usuario,puede}=useSesion();const qc=useQueryClient();const [tab,setTab]=useState('Personas');const [editor,setEditor]=useState(null);const [cargoHabitacion,setCargoHabitacion]=useState(null);const [anular,setAnular]=useState(null);const [motivo,setMotivo]=useState('');const [error,setError]=useState('');
  const puedeEditar=(puede('gestionarReservas')||puede('gestionarCheckIn'))&&['Confirmada','En curso'].includes(reserva.estado);
  const puedeCargos=puede('registrarConsumoServicio')&&reserva.estado==='En curso';
  const puedeCuenta=puede('verPagosEstadia');
  const intentoTitular=useRef(null);
  const necesitaTitular=puedeEditar&&Boolean(reserva.huesped);
  const personas=useQuery({queryKey:['ocupantes',reserva.id],queryFn:()=>api.get(`/estadia/${reserva.id}/ocupantes`).then(r=>r.data),retry:reintentarLectura});
  const titular=useMutation({
    mutationFn:()=>api.post(`/estadia/${reserva.id}/titular`,{operador:usuario}).then(r=>r.data),
    retry:reintentarTitular,
    retryDelay:demoraReintentoTitular,
    onSuccess:async()=>{
      await qc.invalidateQueries({queryKey:['ocupantes',reserva.id]});
      qc.invalidateQueries({queryKey:['estadia-historial',reserva.id]});
      onTitularPreparado?.(reserva.id);
    },
  });
  const titularExistente=titularRegistrado(personas.data||[],reserva.huesped,titular.data?.ocupanteId);
  useEffect(()=>{
    if(necesitaTitular&&personas.isSuccess&&!personas.isFetching&&!titularExistente&&intentoTitular.current!==reserva.id){
      intentoTitular.current=reserva.id;
      titular.mutate();
    }
  },[necesitaTitular,reserva.id,titular.mutate,personas.isSuccess,personas.isFetching,titularExistente]);
  useEffect(()=>{
    if(necesitaTitular&&personas.isSuccess&&titularExistente)onTitularPreparado?.(reserva.id);
  },[necesitaTitular,personas.isSuccess,titularExistente?.id,reserva.id,onTitularPreparado]);
  const preparandoTitular=necesitaTitular&&!titularExistente&&!titular.isSuccess;
  const cuenta=useQuery({queryKey:['check-out','cuenta',String(reserva.id)],queryFn:()=>obtenerCuenta(reserva.id),enabled:!soloPersonas&&puedeCuenta&&tab==='Cuenta',retry:reintentarLectura});
  const cargos=useQuery({queryKey:['consumos-servicios','detalle',reserva.id],queryFn:()=>api.get('/consumos-servicios',{params:{reservaId:reserva.id}}).then(r=>r.data),enabled:!soloPersonas&&puede('verConsumosServicio')&&tab==='Cargos por habitación',retry:reintentarLectura});
  const historial=useQuery({queryKey:['estadia-historial',reserva.id],queryFn:()=>api.get(`/estadia/${reserva.id}/historial`).then(r=>r.data),enabled:tab==='Historial',retry:reintentarLectura});
  const refrescar=()=>{for(const k of ['ocupantes','estadia-historial','check-out','consumos-servicios','pagos-estadia','reservas','alojados'])qc.invalidateQueries({queryKey:[k]});};
  const mutation=useMutation({mutationFn:async({tipo,data})=>{setError('');setErroresServidor({});if(tipo==='guardar')return editor.id?api.put(`/estadia/${reserva.id}/ocupantes/${editor.id}`,{...data,operador:usuario}):api.post(`/estadia/${reserva.id}/ocupantes`,{...data,operador:usuario});if(tipo==='anular')return api.post(`/consumos-servicios/${anular.id}/anular`,{motivo,operador:usuario});return api.post(`/estadia/${reserva.id}/ocupantes/${data.id}/accion`,{accion:tipo,operador:usuario});},onSuccess:()=>{setEditor(null);setAnular(null);setMotivo('');refrescar();},onError:(e,variables)=>{setError(e.response?.data?.error||'No se pudo guardar el cambio.');setErroresServidor(Object.fromEntries(Object.entries(e.response?.data?.campos||{}).map(([k,mensaje])=>[k,{mensaje,valor:variables?.data?.[k]}])));}});
  const listado=personas.data||[];
  const errorCargaPersonas=preparandoTitular&&titular.isError?titular.error:personas.isError?personas.error:null;
  const cargandoPersonas=personas.isFetching||(preparandoTitular&&titular.isPending);
  function recuperarPersonas(){
    if(cargandoPersonas)return;
    // Si el POST perdió la respuesta, se recupera el mismo titular; nunca
    // se envía el formulario de alta de otro ocupante durante este reintento.
    if(personas.isError||!personas.isSuccess)personas.refetch();
    else if(preparandoTitular)titular.mutate();
    else personas.refetch();
  }
  return <section className="rounded-lg border border-borde bg-white p-5 space-y-4">
    <div className="flex flex-wrap gap-2">{(soloPersonas?['Personas']:['Personas',...(puede('verConsumosServicio')?['Cargos por habitación']:[]),...(puedeCuenta?['Cuenta']:[]),'Historial']).map(t=><Button key={t} variante={tab===t?'ok':'secundario'} onClick={()=>setTab(t)}>{t}</Button>)}</div>
    {error&&<p role="alert" className="text-error-texto">{error}</p>}
    {tab==='Personas'&&<>
      {preparandoTitular&&titular.isPending&&<p role="status">{titular.failureCount>0?'Se interrumpió la conexión. Reintentando la carga del titular…':'Incorporando los datos del titular…'}</p>}
      {errorCargaPersonas&&<div role="alert" className="rounded border border-error p-3 text-error-texto">
        <p>{errorCargaPersonas.response?.data?.error||'Se interrumpió la carga de personas. Cuando el servidor esté disponible, volvé a cargar para continuar.'}</p>
        <p className="mt-1 text-sm">Agregar persona se habilita al recuperar al titular y el listado de ocupantes. No vuelvas a crear la reserva.</p>
        <Button variante="secundario" className="mt-2" cargando={cargandoPersonas} onClick={recuperarPersonas}>Volver a cargar personas</Button>
      </div>}
      {titular.data?.aviso&&<p role="alert" className="text-error-texto">{titular.data.aviso}</p>}
      <div className="flex justify-between gap-3"><div><h2 className="font-heading text-xl">Personas de la estadía</h2><p className="text-sm text-piedra">El titular se incorpora con los datos de la reserva. Completá los pendientes y verificá a cada persona antes del ingreso.</p></div>{puedeEditar&&<Button disabled={!personas.isSuccess||cargandoPersonas||preparandoTitular} onClick={()=>{setEditor({});setError('');setErroresServidor({});}}>Agregar persona</Button>}</div>
      {personas.isLoading&&<p>Cargando personas…</p>}
      {!listado.length&&personas.isSuccess&&!cargandoPersonas&&!preparandoTitular&&<p className="text-piedra">Todavía no se registraron ocupantes. El titular aparecerá al terminar su incorporación.</p>}
      {reserva.habitaciones.map(h=><div key={h.id} className="rounded border border-borde p-3"><h3 className="font-semibold">Habitación {h.numero} · capacidad {h.capacidad}</h3>{listado.filter(p=>(activa(p)||p.asignaciones?.at(-1))?.habitacionId===h.id).map(p=><div key={p.id} className="border-t border-borde py-3 flex flex-wrap justify-between gap-2"><div><strong>{p.nombre} {p.apellido}</strong>{titularExistente?.id===p.id&&<span className="ml-2 text-xs text-pino">Titular de la reserva</span>}{pendientesParaIngreso(p).length>0&&<p className="text-sm text-error-texto">Falta completar: {pendientesParaIngreso(p).join(', ')}.</p>}<p className="text-sm">{p.tipoDocumento} {p.numeroDocumento||'Documento pendiente'} · {p.estado} · {p.verificadoEn?'Verificado':'Datos por verificar'}</p><p className="text-xs text-piedra">Ingreso: {fecha(p.ingresoReal)} · Salida: {fecha(p.salidaReal)}</p></div>{puedeEditar&&<div className="flex flex-wrap gap-2">{['Previsto','Alojado'].includes(p.estado)&&<><Button variante="secundario" onClick={()=>{setError('');setErroresServidor({});setEditor(p);}}>{pendientesParaIngreso(p).length?'Completar datos':'Editar'}</Button><Button variante="secundario" disabled={mutation.isPending||pendientesParaIngreso(p).length>0} onClick={()=>mutation.mutate({tipo:'verificar',data:p})}>Verificar datos</Button></>}{p.estado==='Previsto'&&<><Button disabled={!p.verificadoEn||reserva.estado!=='En curso'||mutation.isPending} onClick={()=>mutation.mutate({tipo:'ingresar',data:p})}>Registrar ingreso</Button><Button variante="secundario" disabled={mutation.isPending} onClick={()=>mutation.mutate({tipo:'cancelar',data:p})}>Cancelar ingreso</Button></>}{p.estado==='Alojado'&&<Button variante="secundario" disabled={mutation.isPending} onClick={()=>mutation.mutate({tipo:'retirar',data:p})}>Registrar salida</Button>}</div>}</div>)}</div>)}
    </>}
    {tab==='Cargos por habitación'&&<>{cargos.isError&&<ErrorConsulta consulta={cargos} mensaje="No se pudieron cargar los cargos."/>}{reserva.habitaciones.map(h=><div key={h.id} className="border border-borde rounded p-4 space-y-3"><div className="flex justify-between"><h3 className="font-semibold">Habitación {h.numero}</h3>{puedeCargos&&<Button onClick={()=>setCargoHabitacion(h.id)}>Agregar cargo</Button>}</div>{(cargos.data||[]).filter(c=>c.habitacionId===h.id).map(c=><div key={c.id} className="flex justify-between gap-3 border-t border-borde py-2"><div><p className={c.anulado?'line-through text-piedra':''}>{c.descripcion||c.tipoServicio} · {c.cantidad||1} × {moneda(c.precioUnitario??c.monto)} · <strong>{moneda(c.monto)}</strong>{c.incluido?' · Incluido en tarifa':''}</p><p className="text-xs text-piedra">{fecha(c.fechaServicio||c.fechaHora)} · Registró: {c.registradoPor}{c.anulado?` · Anulado: ${c.motivoAnulacion}`:''}</p></div>{puedeCargos&&!c.anulado&&<Button variante="secundario" onClick={()=>{setAnular(c);setError('');}}>Anular</Button>}</div>)}<p className="text-right font-semibold">Adicionales: {moneda((cargos.data||[]).filter(c=>c.habitacionId===h.id&&!c.anulado).reduce((s,c)=>s+c.monto,0))}</p></div>)}</>}
    {tab==='Cuenta'&&<>{cuenta.isError&&<ErrorConsulta consulta={cuenta} mensaje="No se pudo cargar la cuenta."/>}{cuenta.data&&<><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Habitación','Alojamiento','Adicionales','Revisión','Total'].map(t=><th key={t} className="text-left p-2">{t}</th>)}</tr></thead><tbody>{cuenta.data.habitaciones.map(h=><tr key={h.habitacionId}>{[h.numero,moneda(h.subtotal),moneda(h.adicionales),moneda(h.verificacion),moneda(h.total)].map((v,i)=><td key={i} className="p-2 border-t border-borde">{v}</td>)}</tr>)}</tbody></table></div><p>Total reserva: <strong>{moneda(cuenta.data.totalAdeudado)}</strong> · Pagado: {moneda(cuenta.data.totalPagado)} · Saldo: <strong>{moneda(cuenta.data.saldo)}</strong></p><p className="text-xs text-piedra">Los pagos pertenecen a la reserva. Los cargos históricos sin habitación identificada se incluyen en el total general.</p><a className="text-sm underline" href={`/check-out/${reserva.id}`}>Resolver la garantía en el check-out</a><Garantias reservaId={reserva.id} garantias={cuenta.data.garantias||[]} editable={false} onExito={refrescar}/></>}</>}
    {tab==='Historial'&&<>{historial.isError&&<ErrorConsulta consulta={historial} mensaje="No se pudo cargar el historial."/>}{(historial.data||[]).map(e=><p key={e.id} className="border-b border-borde py-2 text-sm">{fecha(e.fecha)} · {e.accion} · {e.operador}<span className="block text-xs text-piedra">{detalleEvento(e)}</span></p>)}</>}
    {editor&&<Modal titulo={editor.id?'Editar ocupante':'Agregar ocupante'} onClose={()=>setEditor(null)} ancho="max-w-3xl"><PersonaFormulario esTitular={editor.id != null && editor.id === titularExistente?.id} persona={editor} reserva={reserva} personas={listado} erroresServidor={erroresServidor} error={error} pendiente={mutation.isPending} onClose={()=>setEditor(null)} onGuardar={data=>mutation.mutate({tipo:'guardar',data})}/></Modal>}
    {cargoHabitacion&&<ConsumoModal reserva={reserva} habitacionIdInicial={cargoHabitacion} onClose={()=>setCargoHabitacion(null)} onExito={()=>{setCargoHabitacion(null);refrescar();}}/>}
    {anular&&<Modal titulo="Anular cargo" onClose={()=>setAnular(null)}><div className="p-5 space-y-3"><p>Se anula el cargo de {moneda(anular.monto)}. El producto consumido no vuelve automáticamente al stock.</p><Input label="Motivo *" value={motivo} onChange={e=>setMotivo(e.target.value)} maxLength={500}/>{error&&<p role="alert">{error}</p>}<Button disabled={!motivo.trim()} cargando={mutation.isPending} onClick={()=>mutation.mutate({tipo:'anular'})}>Confirmar anulación</Button></div></Modal>}
  </section>;
}
export function Garantias({reservaId,garantias,editable,onExito,cargosValidados=false,totalConfirmado}){
  const {usuario}=useSesion();const [form,setForm]=useState({});const [error,setError]=useState('');const m=useMutation({mutationFn:g=>api.post(`/estadia/${reservaId}/garantia`,{pagoId:g.id,...form[g.id],operador:usuario,cargosValidados,totalConfirmado}),onSuccess:()=>{setError('');setForm({});onExito();},onError:e=>setError(e.response?.data?.error||'No se pudo liquidar la garantía.')});
  return <div className="space-y-3"><h3 className="font-semibold">Garantía de seguridad</h3>{garantias.length===0&&<p className="text-sm text-piedra">Sin garantía registrada.</p>}{garantias.map(g=><div key={g.id} className="rounded border border-borde p-3"><p className="text-sm">Recibida {moneda(g.recibida)} · Aplicada {moneda(g.aplicada)} · Devuelta {moneda(g.devuelta)} · Pendiente {moneda(g.pendiente)}</p>{editable&&g.pendiente>0&&<div className="grid sm:grid-cols-3 gap-2 mt-3">{[['devolver','Devolución realizada'],['aplicar','Aplicar a cuenta'],['motivo','Motivo / referencia']].map(([k,label])=><Input key={k} label={label} type={k==='motivo'?'text':'number'} min="0" step="0.01" value={form[g.id]?.[k]||''} onChange={e=>setForm({...form,[g.id]:{...form[g.id],[k]:e.target.value}})}/>)}<p className="text-xs sm:col-span-3">Registrar una devolución confirma un movimiento realizado fuera del sistema; no transfiere dinero automáticamente.</p><Button cargando={m.isPending} onClick={()=>m.mutate(g)}>Registrar liquidación</Button></div>}</div>)}{error&&<p role="alert" className="text-error-texto">{error}</p>}</div>;
}
