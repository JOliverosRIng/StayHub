import { useId } from 'react';
import type { SearchSuggestion } from '../../types/catalog';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter or the search button. */
  onSubmit?: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** Offered through a native datalist, which keeps keyboard and screen reader support. */
  suggestions?: SearchSuggestion[];
  error?: string;
}

export function SearchBar({
  value, onChange, onSubmit, label = 'Destino o alojamiento', placeholder = '¿A dónde quieres ir?', suggestions = [], error,
}: SearchBarProps) {
  const id = useId();
  const inputId = `${id}-q`;
  const listId = `${id}-suggestions`;
  const errorId = `${id}-error`;
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); onSubmit?.(value); }}
      className="flex-1 flex flex-col max-w-xl"
    >
      <div className={`flex items-center border rounded-full shadow-sm hover:shadow-md transition-shadow overflow-hidden ${error ? 'border-red-400' : 'border-gray-300'}`}>
        <div className="flex-1 px-4 py-2.5">
          <label htmlFor={inputId} className="block text-xs font-semibold text-gray-700">{label}</label>
          <input
            id={inputId}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            list={suggestions.length ? listId : undefined}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            className="text-sm text-gray-700 placeholder-gray-400 outline-none w-full bg-transparent"
          />
          {suggestions.length > 0 && (
            <datalist id={listId}>
              {suggestions.map((s) => <option key={`${s.type}:${s.text}`} value={s.text} label={s.type === 'LOCATION' ? 'Ubicación' : 'Alojamiento'} />)}
            </datalist>
          )}
        </div>
        <button
          type="submit"
          aria-label="Buscar"
          className="m-2 w-9 h-9 bg-primary rounded-full flex items-center justify-center shrink-0 hover:bg-primary-hover transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>
      </div>
      {error && <p id={errorId} role="alert" className="mt-1 px-4 text-xs text-red-600">{error}</p>}
    </form>
  );
}
