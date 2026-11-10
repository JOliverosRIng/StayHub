import { useEffect, useId, useState } from 'react';
import { validateSearchFilters, type SearchValidation } from '../../api/search';
import { ALL_CATEGORY, AMENITY_CATEGORIES } from '../../data/categories';
import { FEATURE_CATALOG, type SearchFilters, type SearchSuggestion } from '../../types/catalog';
import { CategoryPills } from '../home/CategoryPills';
import { SearchBar } from '../home/SearchBar';

export const SEARCH_CURRENCIES = ['USD', 'EUR', 'MXN', 'COP', 'ARS'] as const;

interface FiltersPanelProps {
  /** Applied filters (source of truth, usually the URL). */
  filters: SearchFilters;
  /** Keywords apply while typing; the search client debounces the request. */
  onKeywordsChange: (q: string) => void;
  /** Applies a complete filter set. */
  onApply: (filters: SearchFilters) => void;
  suggestions?: SearchSuggestion[];
  /** Validation reported for the applied filters (e.g. a malformed URL). */
  validation?: SearchValidation;
}

interface Draft {
  location: string; checkIn: string; checkOut: string; guests: string;
  minPrice: string; maxPrice: string; currency: string; amenities: string[];
}

const toDraft = (f: SearchFilters): Draft => ({
  location: f.location ?? '', checkIn: f.checkIn ?? '', checkOut: f.checkOut ?? '',
  guests: f.guests?.toString() ?? '', minPrice: f.minPrice?.toString() ?? '', maxPrice: f.maxPrice?.toString() ?? '',
  currency: f.currency ?? 'USD', amenities: f.amenities ?? [],
});

const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

function fromDraft(base: SearchFilters, d: Draft): SearchFilters {
  return {
    q: base.q, pageSize: base.pageSize,
    location: d.location, checkIn: d.checkIn, checkOut: d.checkOut, guests: num(d.guests),
    minPrice: num(d.minPrice), maxPrice: num(d.maxPrice), currency: d.currency, amenities: d.amenities,
  };
}

export function countAdvancedFilters(f: SearchFilters): number {
  return [f.location, f.checkIn || f.checkOut, f.guests, f.minPrice !== undefined || f.maxPrice !== undefined].filter(Boolean).length
    + (f.amenities?.length ?? 0);
}

const inputClass = (invalid: boolean) =>
  `h-10 px-3 border rounded-xl bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary ${invalid ? 'border-red-400' : 'border-gray-300'}`;

export function FiltersPanel({ filters, onKeywordsChange, onApply, suggestions, validation = {} }: FiltersPanelProps) {
  const id = useId();
  const panelId = `${id}-panel`;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(filters));
  const [errors, setErrors] = useState<SearchValidation>({});
  const appliedKey = JSON.stringify({ ...filters, q: undefined, page: undefined });

  // Applied filters changed elsewhere (category pill, back button): resynchronize the draft.
  useEffect(() => { setDraft(toDraft(filters)); setErrors({}); }, [appliedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const amenities = filters.amenities ?? [];
  const activeCategory = amenities.length === 0 ? ALL_CATEGORY
    : amenities.length === 1 ? AMENITY_CATEGORIES.find((c) => c.amenity === amenities[0])?.label ?? '' : '';

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setDraft((d) => ({ ...d, [key]: e.target.value }));
    setErrors((p) => ({ ...p, [key]: undefined }));
  };
  const toggleAmenity = (code: string) => setDraft((d) => ({
    ...d, amenities: d.amenities.includes(code) ? d.amenities.filter((a) => a !== code) : [...d.amenities, code],
  }));

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    const next = fromDraft(filters, draft);
    const found = validateSearchFilters(next);
    setErrors(found);
    if (Object.keys(found).length === 0) onApply(next);
  };
  const clear = () => { setErrors({}); onApply({ q: filters.q, pageSize: filters.pageSize }); };

  const shown = { ...validation, ...errors };
  const field = (key: keyof SearchValidation) => ({
    'aria-invalid': !!shown[key],
    'aria-describedby': shown[key] ? `${id}-${key}-error` : undefined,
  });
  const fieldError = (key: keyof SearchValidation) => shown[key]
    ? <p id={`${id}-${key}-error`} role="alert" className="text-xs text-red-600">{shown[key]}</p> : null;

  return (
    <section aria-label="Filtros de búsqueda" className="flex flex-col gap-4">
      <SearchBar
        value={filters.q ?? ''}
        onChange={onKeywordsChange}
        onSubmit={onKeywordsChange}
        label="Palabras clave"
        placeholder="Nombre, ciudad o característica"
        suggestions={suggestions}
        error={shown.q}
      />

      <CategoryPills
        categories={AMENITY_CATEGORIES}
        active={activeCategory}
        onChange={(label) => {
          const amenity = AMENITY_CATEGORIES.find((c) => c.label === label)?.amenity;
          onApply({ ...filters, page: undefined, amenities: amenity ? [amenity] : undefined });
        }}
        onFiltersClick={() => setOpen((v) => !v)}
        filtersOpen={open}
        activeFilters={countAdvancedFilters(filters)}
        filtersControls={panelId}
      />

      {open && (
        <form id={panelId} onSubmit={apply} noValidate className="flex flex-col gap-4 bg-gray-50 rounded-2xl p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-location`} className="text-xs font-semibold text-gray-600">Ubicación</label>
              <input id={`${id}-location`} value={draft.location} onChange={set('location')} placeholder="Ciudad, región o país" className={inputClass(!!shown.location)} {...field('location')} />
              {fieldError('location')}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-checkIn`} className="text-xs font-semibold text-gray-600">Entrada</label>
              <input id={`${id}-checkIn`} type="date" value={draft.checkIn} onChange={set('checkIn')} className={inputClass(!!shown.checkIn)} {...field('checkIn')} />
              {fieldError('checkIn')}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-checkOut`} className="text-xs font-semibold text-gray-600">Salida</label>
              <input id={`${id}-checkOut`} type="date" value={draft.checkOut} min={draft.checkIn || undefined} onChange={set('checkOut')} className={inputClass(!!shown.checkOut)} {...field('checkOut')} />
              {fieldError('checkOut')}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-guests`} className="text-xs font-semibold text-gray-600">Huéspedes</label>
              <input id={`${id}-guests`} type="number" min={1} step={1} inputMode="numeric" value={draft.guests} onChange={set('guests')} placeholder="Cualquiera" className={inputClass(!!shown.guests)} {...field('guests')} />
              {fieldError('guests')}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-minPrice`} className="text-xs font-semibold text-gray-600">Precio mínimo por noche</label>
              <input id={`${id}-minPrice`} type="number" min={0} inputMode="decimal" value={draft.minPrice} onChange={set('minPrice')} placeholder="0" className={inputClass(!!shown.minPrice)} {...field('minPrice')} />
              {fieldError('minPrice')}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-maxPrice`} className="text-xs font-semibold text-gray-600">Precio máximo por noche</label>
              <input id={`${id}-maxPrice`} type="number" min={0} inputMode="decimal" value={draft.maxPrice} onChange={set('maxPrice')} placeholder="Sin límite" className={inputClass(!!shown.maxPrice)} {...field('maxPrice')} />
              {fieldError('maxPrice')}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-currency`} className="text-xs font-semibold text-gray-600">Moneda</label>
              <select id={`${id}-currency`} value={draft.currency} onChange={set('currency')} className={inputClass(!!shown.currency)} {...field('currency')}>
                {SEARCH_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {fieldError('currency')}
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-xs font-semibold text-gray-600 mb-1">Amenidades</legend>
            <div className="flex flex-wrap gap-3">
              {FEATURE_CATALOG.map((f) => {
                const code = f.code.toLowerCase();
                return (
                  <label key={code} className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={draft.amenities.includes(code)} onChange={() => toggleAmenity(code)} className="accent-primary" />
                    {f.name}
                  </label>
                );
              })}
            </div>
            {fieldError('amenities')}
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="h-10 px-5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover">Aplicar filtros</button>
            <button type="button" onClick={clear} className="h-10 px-4 text-sm font-medium text-primary border border-primary rounded-xl hover:bg-primary-light">Limpiar filtros</button>
          </div>
        </form>
      )}
    </section>
  );
}
