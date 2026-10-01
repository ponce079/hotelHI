import { expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CargosHabitacion } from './CargosHabitacion';
import { listarConsumosPorReserva } from './serviciosAdicionales.api';
vi.mock('./serviciosAdicionales.api', () => ({ listarConsumosPorReserva: vi.fn() }));
test('muestra solo esta habitación, excluye anulados del total y actualiza al registrar consumos', async () => {
  const cargos = [
    {id:1,habitacionId:1,descripcion:'Lavandería',monto:500,fechaHora:'2026-10-01T02:25:00Z'},
    {id:2,habitacionId:2,descripcion:'Otra habitación',monto:900,fechaHora:'2026-10-01T02:25:00Z'},
    {id:3,habitacionId:1,descripcion:'Cargo cancelado',monto:200,anulado:true,fechaHora:'2026-10-01T02:25:00Z'},
  ];
  listarConsumosPorReserva.mockImplementation(async () => [...cargos]);
  const qc = new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={qc}><CargosHabitacion reservaId={8} habitacionId={1}/></QueryClientProvider>);
  await screen.findByText('Lavandería');
  expect(screen.queryByText('Otra habitación')).not.toBeInTheDocument();
  expect(screen.getByText(/Total adicionales:/)).toHaveTextContent('500,00');
  cargos.push({id:4,habitacionId:1,descripcion:'Nuevo cargo',monto:100,fechaHora:'2026-10-01T02:26:00Z'});
  await qc.invalidateQueries({queryKey:['consumos-servicios']});
  await screen.findByText('Nuevo cargo');
  await waitFor(() => expect(screen.getByText(/Total adicionales:/)).toHaveTextContent('600,00'));
});
