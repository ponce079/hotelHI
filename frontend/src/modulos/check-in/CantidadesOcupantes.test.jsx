import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { resumenOcupantes } from './validacionOcupantesIngreso';
import { CantidadesOcupantes } from './CantidadesOcupantes';
const habitaciones=[{id:1,numero:'101',capacidad:2,adultos:1,menores:0}];
const persona={esTitular:true,habitacionId:1,estado:'Previsto',fechaNacimiento:'1990-01-01',fechaDesde:'2020-01-01',fechaHasta:'2099-01-01',asignaciones:[{habitacionId:1,hasta:null}],verificadoEn:'2026-01-01'};
it('muestra la ocupación de la reserva sin pedirla otra vez',()=>{
  const resumen=resumenOcupantes(habitaciones,[persona]);
  expect(resumen[0].completo).toBe(true);
  render(<CantidadesOcupantes resumen={resumen}/>);
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(screen.getByText(/1 adultos y 0 menores reservados/)).toBeInTheDocument();
});
it('bloquea fichas faltantes, sobrantes, futuras, sin verificar o con edades incompatibles',()=>{
  for(const personas of [[],[persona,persona],[{...persona,estado:'Cancelado'}],[{...persona,fechaDesde:'2099-01-01'}],[{...persona,verificadoEn:null}],[{...persona,fechaNacimiento:'2015-01-01'}]])expect(resumenOcupantes(habitaciones,personas)[0].completo).toBe(false);
});
