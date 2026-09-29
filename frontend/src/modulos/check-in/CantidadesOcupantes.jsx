import { Input } from '../../componentes/Input';

export function CantidadesOcupantes({ resumen, cantidades, onChange }) {
  return <section className="space-y-3 rounded-lg border border-borde bg-white p-5">
    <h3 className="font-semibold">Personas que ingresan por habitación</h3>
    <p className="text-sm text-piedra">Declará el total que ingresa hoy, incluidos menores y el titular si se aloja. Registrá a cada persona antes de confirmar.</p>
    {resumen.map(h => <div key={h.id} className="space-y-1">
      <Input label={`Personas que ingresan en habitación ${h.numero} *`} type="number" min="1" max={h.capacidad} step="1"
        value={cantidades[h.id] ?? ''} onChange={e => onChange({ ...cantidades, [h.id]: e.target.value })} />
      <p className={`text-sm ${h.completo ? 'text-pino' : 'text-piedra'}`}>
        {h.registradas} registradas de {cantidades[h.id] || '—'} declaradas · {h.verificadas} listas para ingresar · capacidad {h.capacidad}
      </p>
    </div>)}
  </section>;
}

