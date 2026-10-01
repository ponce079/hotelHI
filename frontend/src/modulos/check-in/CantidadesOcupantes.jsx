export function CantidadesOcupantes({ resumen }) {
  return <section className="space-y-3 rounded-lg border border-borde bg-white p-5">
    <h3 className="font-semibold">Personas que ingresan por habitación</h3>
    <p className="text-sm text-piedra">La cantidad corresponde a los adultos y menores de la reserva. Registrá a cada persona, incluido el titular si se aloja. Para cambiar la ocupación, modificá la reserva y revisá su cotización.</p>
    {resumen.map(h => <div key={h.id} className="space-y-1">
      <p className="font-semibold">Habitación {h.numero}: {h.adultos} adultos y {h.menores} menores reservados</p>
      <p className={`text-sm ${h.completo ? 'text-pino' : 'text-piedra'}`}>
        {h.registradas} registradas de {h.esperadas || '—'} reservadas · {h.verificadas} verificadas · capacidad {h.capacidad}
      </p>
    </div>)}
  </section>;
}
