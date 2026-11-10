import type { Category } from '../../types';

interface CategoryPillsProps {
  categories: Category[];
  active: string;
  onChange: (label: string) => void;
  /** Opens the advanced filters panel. The button is hidden when omitted. */
  onFiltersClick?: () => void;
  filtersOpen?: boolean;
  /** Number of advanced filters applied, shown on the button. */
  activeFilters?: number;
  filtersControls?: string;
}

export function CategoryPills({ categories, active, onChange, onFiltersClick, filtersOpen = false, activeFilters = 0, filtersControls }: CategoryPillsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Categorías">
      {categories.map((cat) => (
        <button
          type="button"
          key={cat.label}
          aria-pressed={active === cat.label}
          onClick={() => onChange(cat.label)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
            active === cat.label ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span aria-hidden>{cat.icon}</span>
          {cat.label}
        </button>
      ))}
      {onFiltersClick && (
        <button
          type="button"
          onClick={onFiltersClick}
          aria-expanded={filtersOpen}
          aria-controls={filtersControls}
          className={`ml-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border ${
            filtersOpen ? 'bg-gray-900 text-white border-gray-900' : 'text-gray-700 border-gray-300 hover:border-gray-400'
          }`}
        >
          Filtros{activeFilters > 0 ? ` (${activeFilters})` : ''}
        </button>
      )}
    </div>
  );
}
