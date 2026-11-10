import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { parseSearchParams, searchErrorMessage, toSearchParams, useSearch, useSearchSuggestions } from '../api/search';
import { paths } from '../app/navigation';
import { Header } from '../components/Header';
import { PropertyCard } from '../components/property/PropertyCard';
import { FiltersPanel } from '../components/search/FiltersPanel';
import { SEARCH_LIMITS, type SearchFilters, type SearchResult } from '../types/catalog';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function nightsBetween(checkIn?: string, checkOut?: string): number | undefined {
  if (!checkIn || !checkOut) return undefined;
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000);
  return nights > 0 ? nights : undefined;
}

export function toCardProps(result: SearchResult, nights?: number) {
  return {
    image: result.primaryPhotoUrl ?? null,
    title: result.name,
    location: result.location,
    pricePerNight: result.minNightlyPrice,
    currency: result.currency,
    nights,
    tag: result.capacity > 1 ? `Hasta ${result.capacity} huéspedes` : undefined,
  };
}

/** RQ-04: search with filters; the URL holds the applied filters so results are shareable. */
export function Search() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseSearchParams(params), [params]);
  const search = useSearch(filters);
  const suggestions = useSearchSuggestions(filters.q ?? '');

  const apply = (next: SearchFilters, replace = false) => setParams(toSearchParams(next), { replace });
  const invalid = Object.keys(search.validation).length > 0;
  const data = search.data;
  const pageSize = data?.pageSize ?? filters.pageSize ?? SEARCH_LIMITS.defaultPageSize;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const page = data?.page ?? filters.page ?? 1;
  const nights = nightsBetween(filters.checkIn, filters.checkOut);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Header />
      <main className="flex-1 max-w-screen-xl mx-auto px-6 py-8 w-full flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">Buscar alojamientos</h1>

        <FiltersPanel
          filters={filters}
          onKeywordsChange={(q) => apply({ ...filters, q, page: undefined }, true)}
          onApply={(next) => apply({ ...next, page: undefined })}
          suggestions={suggestions.data}
          validation={search.validation}
        />

        <section aria-labelledby="results-heading" className="flex flex-col gap-5">
          <h2 id="results-heading" className="sr-only">Resultados de búsqueda</h2>

          {invalid ? (
            <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-xl">
              Revisa los filtros de búsqueda.
            </div>
          ) : search.isError && !data ? (
            <div role="alert" className="flex flex-col items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
              <p>{searchErrorMessage(search.error)}</p>
              <button type="button" onClick={() => { void search.refetch(); }} className="font-semibold underline">Reintentar</button>
            </div>
          ) : !data ? (
            <p role="status" className="text-sm text-gray-500 py-12 text-center">Buscando alojamientos…</p>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Sin resultados</h3>
              <p className="text-gray-500 text-sm mb-6">No encontramos alojamientos con esos filtros. Prueba ampliando la búsqueda.</p>
              <button type="button" onClick={() => apply({})} className="h-10 px-5 rounded-xl border border-gray-300 text-sm font-medium hover:border-gray-400">
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
                <p className="text-sm text-gray-600">{plural(data.total, 'alojamiento encontrado', 'alojamientos encontrados')}</p>
                {search.isFetching && <p role="status" className="text-xs text-gray-400">Actualizando…</p>}
              </div>
              {data.availabilityKind === 'PROJECTED' && (
                <p className="text-xs text-gray-500">Disponibilidad estimada para tus fechas; se confirma al reservar.</p>
              )}
              <ul aria-label="Resultados" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-7">
                {data.items.map((result) => (
                  <li key={result.accommodationId}>
                    <PropertyCard {...toCardProps(result, nights)} onClick={() => navigate(paths.property(result.accommodationId))} />
                  </li>
                ))}
              </ul>
              {(data.hasNext || page > 1) && (
                <nav aria-label="Paginación" className="flex items-center justify-center gap-4 pt-4">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => apply({ ...filters, page: page - 1 })}
                    className="h-10 px-4 rounded-xl border border-gray-300 text-sm font-medium disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-gray-600">Página {page} de {totalPages}</span>
                  <button
                    type="button"
                    disabled={!data.hasNext}
                    onClick={() => apply({ ...filters, page: page + 1 })}
                    className="h-10 px-4 rounded-xl border border-gray-300 text-sm font-medium disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
