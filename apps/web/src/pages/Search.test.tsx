import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mock } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test/msw/server';
import { problem } from '../../test/msw/handlers';
import { PROPERTY_IDS } from '../../test/msw/fixtures';
import { locationRef, renderWithProviders } from '../../test/utils';
import { Search } from './Search';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ status: 'anonymous', currentUser: null, logout: vi.fn(), retryProfile: vi.fn() }),
}));

const renderSearch = (query = '') => renderWithProviders(<Search />, { route: `/search${query}`, path: '/search' });

const resultTitles = () => within(screen.getByRole('list', { name: 'Resultados' }))
  .getAllByRole('heading', { level: 3 }).map((h) => h.textContent);

function countSearchRequests() {
  const urls: URL[] = [];
  server.events.on('request:start', ({ request }) => { if (request.url.includes('/search?') || request.url.endsWith('/search')) urls.push(new URL(request.url)); });
  return urls;
}

describe('Search page', () => {
  it('shows loading, then results ordered by relevance', async () => {
    renderSearch('?q=hotel');
    expect(screen.getByRole('status')).toHaveTextContent('Buscando alojamientos…');
    await waitFor(() => expect(resultTitles()).toEqual(['Hotel Centro Histórico Cartagena', 'Villa Serena Boutique Hotel & Spa']));
    expect(screen.getByText('2 alojamientos encontrados')).toBeInTheDocument();
  });

  it('applies keywords from the search bar and keeps them in the URL', async () => {
    renderSearch();
    await screen.findByRole('list', { name: 'Resultados' });
    fireEvent.change(screen.getByLabelText('Palabras clave'), { target: { value: 'cabaña' } });
    await waitFor(() => expect(resultTitles()).toEqual(['Cabaña del Bosque Nevado']));
    expect(new URLSearchParams(locationRef.current!.search).get('q')).toBe('cabaña');
  });

  it('filters by guests and amenities from the advanced panel', async () => {
    renderSearch();
    await screen.findByRole('list', { name: 'Resultados' });
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.change(screen.getByLabelText('Huéspedes'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('Admite mascotas'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(resultTitles()).toEqual(['Casa Azul Frente al Mar', 'Cabaña del Bosque Nevado']));
    const params = new URLSearchParams(locationRef.current!.search);
    expect(params.get('guests')).toBe('5');
    expect(params.getAll('amenities')).toEqual(['pets_allowed']);
    expect(screen.getByRole('button', { name: 'Filtros (2)' })).toBeInTheDocument();
  });

  it('filters by price range in the selected currency and by location and dates', async () => {
    renderSearch();
    await screen.findByRole('list', { name: 'Resultados' });
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.change(screen.getByLabelText('Precio mínimo por noche'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Precio máximo por noche'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(resultTitles()).toEqual(['Casa Azul Frente al Mar', 'Cabaña del Bosque Nevado']));

    fireEvent.change(screen.getByLabelText('Ubicación'), { target: { value: 'Tulum' } });
    fireEvent.change(screen.getByLabelText('Entrada'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Salida'), { target: { value: '2026-12-04' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() => expect(resultTitles()).toEqual(['Casa Azul Frente al Mar']));
    expect(screen.getByText(/Disponibilidad estimada/)).toBeInTheDocument();
  });

  it('validates filters before searching', async () => {
    renderSearch();
    await screen.findByRole('list', { name: 'Resultados' });
    const urls = countSearchRequests();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    fireEvent.change(screen.getByLabelText('Precio mínimo por noche'), { target: { value: '300' } });
    fireEvent.change(screen.getByLabelText('Precio máximo por noche'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    expect(screen.getByText('El precio máximo debe ser mayor o igual al mínimo.')).toBeInTheDocument();
    expect(screen.getByLabelText('Precio máximo por noche')).toHaveAttribute('aria-invalid', 'true');
    await new Promise((r) => setTimeout(r, 30));
    expect(urls).toHaveLength(0);
    server.events.removeAllListeners();
  });

  it('rejects malformed filters coming from the URL without calling the API', async () => {
    const urls = countSearchRequests();
    renderSearch('?guests=0');
    expect(await screen.findByText('Revisa los filtros de búsqueda.')).toBeInTheDocument();
    expect(urls).toHaveLength(0);
    server.events.removeAllListeners();
  });

  it('filters with an amenity category pill', async () => {
    renderSearch();
    await screen.findByRole('list', { name: 'Resultados' });
    fireEvent.click(screen.getByRole('button', { name: /Piscina/ }));
    await waitFor(() => expect(resultTitles()).toEqual(['Villa Serena Boutique Hotel & Spa', 'Casa Azul Frente al Mar', 'Hotel Centro Histórico Cartagena']));
    expect(screen.getByRole('button', { name: /Piscina/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty state that can clear the filters', async () => {
    renderSearch('?q=zzzz');
    expect(await screen.findByRole('heading', { name: 'Sin resultados' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    await waitFor(() => expect(resultTitles()).toHaveLength(6));
  });

  it('shows a safe error and retries on demand', async () => {
    server.use(mock.get('*/api/v1/search', () => problem(503, 'UNAVAILABLE'), { once: true }));
    renderSearch('?q=hotel');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('La búsqueda no está disponible en este momento. Intenta nuevamente.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(resultTitles()).toHaveLength(2));
  });

  it('opens the property detail from a result card', async () => {
    renderSearch('?q=hotel');
    fireEvent.click(await screen.findByRole('link', { name: /Hotel Centro Histórico Cartagena/ }));
    expect(screen.getByTestId('route')).toHaveTextContent(`/property/${PROPERTY_IDS.hotelCentro}`);
  });

  it('paginates with the URL as the source of truth', async () => {
    renderSearch('?pageSize=2');
    await waitFor(() => expect(resultTitles()).toEqual(['Villa Serena Boutique Hotel & Spa', 'Casa Azul Frente al Mar']));
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(resultTitles()).toEqual(['Hacienda Las Flores', 'Loft Industrial Condesa']));
    expect(new URLSearchParams(locationRef.current!.search).get('page')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await waitFor(() => expect(screen.getByText('Página 1 de 3')).toBeInTheDocument());
  });
});
