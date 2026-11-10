import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mock } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { problem } from '../../test/msw/handlers';
import { PROPERTY_IDS } from '../../test/msw/fixtures';
import { renderWithProviders } from '../../test/utils';
import { Home } from './Home';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ status: 'anonymous', currentUser: null, logout: vi.fn(), retryProfile: vi.fn() }),
}));

const unavailable = () => server.use(mock.get('*/api/v1/search', () => problem(503, 'UNAVAILABLE')));

describe('Home', () => {
  it('lists real published properties from the search service', async () => {
    renderWithProviders(<Home />, { path: '/' });
    expect(screen.getByRole('status')).toHaveTextContent('Cargando alojamientos…');
    expect(await screen.findByRole('link', { name: /Villa Serena Boutique Hotel & Spa/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /,/ })).toHaveLength(6);
    expect(screen.getByText('6 propiedades disponibles')).toBeInTheDocument();
    expect(screen.queryByText(/alojamientos de ejemplo/)).not.toBeInTheDocument();
  });

  it('opens the detail of a real result', async () => {
    renderWithProviders(<Home />, { path: '/' });
    fireEvent.click(await screen.findByRole('link', { name: /Casa Azul Frente al Mar/ }));
    expect(screen.getByTestId('route')).toHaveTextContent(`/property/${PROPERTY_IDS.casaAzul}`);
  });

  it('falls back to example data in development when search is unreachable', async () => {
    unavailable();
    renderWithProviders(<Home fallback />, { path: '/' });
    expect(await screen.findByText(/Mostrando alojamientos de ejemplo/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Casa de Adobe & Spa/ })).toBeInTheDocument();
  });

  it('shows an error with retry instead of example data in production', async () => {
    server.use(mock.get('*/api/v1/search', () => problem(503, 'UNAVAILABLE'), { once: true }));
    renderWithProviders(<Home fallback={false} />, { path: '/' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La búsqueda no está disponible');
    expect(screen.queryByText(/Casa de Adobe/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: /Villa Serena/ })).toBeInTheDocument();
  });

  it('sends header keywords and category shortcuts to the search page', async () => {
    renderWithProviders(<Home />, { path: '/' });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: ' Tulum ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('/search?q=Tulum'));
  });

  it('maps a category pill to an amenity filter', async () => {
    renderWithProviders(<Home />, { path: '/' });
    fireEvent.click(screen.getByRole('button', { name: /Admite mascotas/ }));
    expect(screen.getByTestId('route')).toHaveTextContent('/search?amenities=pets_allowed');
  });

  it('shows notices passed by guarded routes', () => {
    renderWithProviders(<Home />, { path: '/', route: { pathname: '/', state: { notice: 'Solo para propietarios.' } } });
    expect(screen.getByText('Solo para propietarios.')).toBeInTheDocument();
  });
});
