import type { Category } from '../../types';

interface CategoryPillsProps {
  categories: Category[];
  active: string;
  onChange: (label: string) => void;
}

export function CategoryPills({ categories, active, onChange }: CategoryPillsProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto">
      {categories.map((cat) => (
        <button
          key={cat.label}
          onClick={() => onChange(cat.label)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
            active === cat.label ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <span>{cat.icon}</span>
          {cat.label}
        </button>
      ))}
      {/* TODO: abrir panel de filtros */}
      <button className="ml-2 px-4 py-2 rounded-full text-sm font-medium text-gray-700 border border-gray-300 hover:border-gray-400 whitespace-nowrap transition-colors">
        Filtros
      </button>
    </div>
  );
}
